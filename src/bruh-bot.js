'use strict'

/// <reference types="./global.d.ts" />

//#region Packages

const fs = require('fs')
const MineFlayer = require('mineflayer')
const path = require('path')
const levenshtein = require('damerau-levenshtein')
const MineFlayerMovement = require('mineflayer-movement')

//#endregion

//#region Local

const TaskManager = require('./task-manager')
const Minecraft = require('./minecraft')
const { Interval, parseLocationH, parseYesNoH, Timeout, parseAnyLocationH, isItemEquals, stringifyItem, stringifyItemH } = require('./utils/other')
const taskUtils = require('./utils/tasks')
require('./utils/math')
const Environment = require('./environment')
const Memory = require('./memory')
const Debug = require('./debug/debug')
const Commands = require('./commands')
const tasks = require('./tasks')
const Vec3Dimension = require('./utils/vec3-dimension')
const { Vec3 } = require('vec3')
const config = require('./config')
const Freq = require('./utils/freq')
const ItemLock = require('./locks/item-lock')
const CancelledError = require('./errors/cancelled-error')
const GameError = require('./errors/game-error')
const TimeoutError = require('./errors/timeout-error')
const KnowledgeError = require('./errors/knowledge-error')
const priorities = require('./priorities')

//#endregion


/**
 * @typedef {{
 *   worldPath: string;
 *   environment?: Environment;
 *   minecraft: Minecraft;
 *   server: {
 *     host: string;
 *     port: number;
 *   }
 *   debug?: boolean;
 * }} GeneralConfig
 */

/**
 * @typedef {GeneralConfig & {
 *   bot: {
 *     username: string;
 *     behavior?: {
 *       instantLook?: boolean;
 *       loadCrossbows?: boolean;
 *       dumpTrash?: boolean;
 *       sleep?: boolean;
 *       ensureEquipment?: boolean;
 *       harvest?: boolean;
 *       restoreCrops?: boolean;
 *       breedAnimals?: boolean;
 *       parryTrajectories?: boolean;
 *       checkQuiet?: boolean;
 *     }
 *   }
 * }} BotConfig
 */

/**
 * @typedef {{
 *   respond: (message: any, player?: string) => void;
 *   broadcast: (message: any) => void;
 *   askYesNo: (question: string, timeout: number, player?: string, detailProvider?: (question: string) => string) => Promise<{
 *     message: true | false;
 *     sender: string;
 *   }>;
 *   askPosition: (question: string, timeout: number, player?: string, detailProvider?: (question: string) => string) => Promise<{
 *     message: Vec3Dimension;
 *     sender: string;
 *   }>;
 *   ask: (question: string, timeout: number, player?: string, detailProvider?: (question: string) => string) => Promise<{
 *     message: string;
 *     sender: string;
 *   }>;
 * }} ChatResponseHandler
 */

/**
 * @typedef {{
 *   match: string | ReadonlyArray<string>;
 *   command: (sender: string, message: string, response: ChatResponseHandler, isWhispered: boolean) => void;
 * }} StringChatHandler
 */

/**
 * @typedef {{
 *   match: RegExp;
 *   command: (sender: string, message: RegExpExecArray, response: ChatResponseHandler, isWhispered: boolean) => void;
 * }} RegexpChatHandler
 */

/**
 * @typedef {{
*   onChat: (username: string, message: string) => boolean;
*   done: boolean;
* }} ChatAwait
*/

/**
 * @typedef {StringChatHandler | RegexpChatHandler} ChatHandler
 */

module.exports = class BruhBot {
    /** @readonly @type {import('mineflayer-pathfinder').Movements} */ permissiveMovements
    /** @readonly @type {import('mineflayer-pathfinder').Movements} */ restrictedMovements
    /** @readonly @type {import('mineflayer-pathfinder').Movements} */ cutTreeMovements

    /** @private @readonly @type {Interval} */ saveInterval
    /** @private @readonly @type {Interval} */ saveTasksInterval

    /** @readonly @type {{ isActivated: boolean; activatedTime: number; }} */ leftHand
    /** @readonly @type {{ isActivated: boolean; activatedTime: number; }} */ rightHand

    /** @type {import('./managed-task').AsManaged<import('./tasks/attack')> | null} */
    defendMyselfGoal
    /** @type {((soundName: string | number) => void) | null} */
    onHeard
    /** @readonly @type {import('mineflayer').Bot} */
    bot
    /** @readonly @type {Minecraft} */
    mc
    /** @readonly @type {TaskManager} */
    tasks
    /** @readonly @type {Array<ChatAwait>} */
    chatAwaits
    /** @readonly @type {Environment} */
    env
    /** @readonly @type {Memory} */
    memory
    /** @readonly @type {Array<import('./locks/item-lock')>} */
    lockedItems
    /** @readonly @type {import('./debug/debug')} */
    debug
    /** @private @readonly @type {ReadonlyArray<ChatHandler>} */
    chatHandlers
    /** @readonly @type {Commands} */
    commands
    /** @type {boolean} */
    instantLook

    /** @type {import('./managed-task')} */
    _runningTask
    /** @private @type {import('mineflayer-pathfinder').PartiallyComputedPath | null} */
    _currentPath
    /** @private @readonly @type {Readonly<BotConfig>} */
    _config

    /** @readonly @type {import('mineflayer').Dimension} */ get dimension() { return this.bot.game.dimension }

    /** @readonly @type {string} */ get username() { return this.bot.username ?? this._config.bot.username }

    /** @type {boolean} */ _quietMode
    /** @readonly @type {boolean} */ get quietMode() { return this._quietMode || this.userQuiet }

    /** @private @type {boolean} */ _isLeaving
    /** @readonly @type {boolean} */ get isLeaving() { return this._isLeaving }

    /**
     * @param {Readonly<BotConfig>} config
     */
    constructor(config) {
        this.mc = config.minecraft
        this._config = config

        global.bots ??= {}
        global.bots[config.bot.username] = this

        this.env = config.environment ?? new Environment(path.join(config.worldPath, 'environment.json'))

        console.log(`[Bot "${config.bot.username}"] Connecting ...`)
        // @ts-ignore
        this.bot = MineFlayer.createBot({
            host: config.server.host,
            port: config.server.port,
            username: config.bot.username,
            logErrors: false,
            plugins: {
                'anvil': false,
                'book': false,
                'boss_bar': false,
                'command_block': false,
                'creative': false,
                'enchantment_table': false,
                'experience': false,
                'explosion': false,
                'fishing': false,
                'particle': true,
                'resource_pack': false,
                // 'settings': false,
                'scoreboard': false,
                'tablist': false,
                'team': false,
                'title': false,
                'place_entity': false,
                'pathfinder': require('mineflayer-pathfinder').pathfinder,
                'armor_manager': require('mineflayer-armor-manager'),
                'hawkeye': require('minecrafthawkeye').default,
                'blocks-fast': require('../plugins/blocks'),
                // @ts-ignore
                'movement': MineFlayerMovement.plugin,
                'freemotion': require('../plugins/freemotion'),
                // 'elytra': require('mineflayer-elytrafly').elytrafly,
            },
            version: '1.21.1',
        })

        this.memory = new Memory(this, path.join(config.worldPath, `memory-${config.bot.username}.json`))
        this.tasks = new TaskManager()

        /**
         * @param {string} sender
         * @param {(message: string) => void} send
         * @returns {ChatResponseHandler}
         */
        const makeResponseHandler = (sender, send) => {
            return {
                respond: (message, player) => {
                    if (player) {
                        this.bot.whisper(player, stringifyMessage(message))
                    } else {
                        send(stringifyMessage(message))
                    }
                },
                broadcast: (message) => {
                    this.bot.chat(stringifyMessage(message))
                },
                askYesNo: async (question, timeout, player, detailProvider) => {
                    const _send = player ? ((/** @type {string} */ v) => this.bot.whisper(player, stringifyMessage(v))) : send
                    const _target = player ?? sender

                    /**
                     * @param {string} message
                     */
                    const parse = (message) => {
                        if ([
                            'y',
                            'yes',
                            'ye',
                            'yah',
                            'yeah',
                        ].includes(message)) {
                            return true
                        }

                        if ([
                            'n',
                            'no',
                            'nope',
                            'nuhuh',
                            'nuh uh',
                        ].includes(message)) {
                            return false
                        }

                        return null
                    }
                    const response = await this.askAsync(question, _send, _target, timeout, res => {
                        if (parse(res) !== null) { return 'finish' }
                        if (detailProvider) {
                            const details = detailProvider(res)
                            if (details) {
                                _send(details)
                                return 'consume'
                            }
                        }
                        return 'ignore'
                    })
                    return {
                        sender: response.sender,
                        message: parse(response.message),
                    }
                },
                askPosition: async (question, timeout, player, detailProvider) => {
                    const _send = player ? ((/** @type {string} */ v) => this.bot.whisper(player, stringifyMessage(v))) : send
                    const _target = player ?? sender

                    const res = await this.askAsync(question, _send, _target, timeout, v => {
                        if (parseLocationH(v)) return 'finish'
                        if (detailProvider) {
                            const details = detailProvider(v)
                            if (details) {
                                _send(details)
                                return 'consume'
                            }
                        }
                        return 'ignore'
                    })
                    return {
                        sender: res.sender,
                        message: parseLocationH(res.message),
                    }
                },
                ask: (question, timeout, player, detailProvider) => {
                    const _send = player ? ((/** @type {string} */ v) => this.bot.whisper(player, stringifyMessage(v))) : send
                    const _target = player ?? sender

                    return this.askAsync(question, _send, _target, timeout, v => {
                        if (detailProvider) {
                            const details = detailProvider(v)
                            if (details) {
                                _send(details)
                                return 'consume'
                            }
                        }
                        return 'finish'
                    })
                },
            }
        }

        try {
            const tasksPath = path.join(config.worldPath, 'tasks-' + this.username + '.json')
            if (fs.existsSync(tasksPath)) {
                const json = fs.readFileSync(tasksPath, 'utf8')
                this.tasks.fromJSON(this, json, task => ({
                    response: 'byPlayer' in task
                        ? makeResponseHandler(task.byPlayer, task.isWhispered ? (v => this.bot.whisper(task.byPlayer, v)) : (v => this.bot.chat(v)))
                        : undefined
                }))
                console.log(`[Bot "${this.username}"] Loaded ${this.tasks.tasks.length} tasks`)
            }
        } catch (error) {
            console.error(`[Bot "${this.username}"] Failed to load the tasks`, error)
        }

        this.env.addBot(this)

        this.chatAwaits = []
        this._quietMode = false
        this.userQuiet = false
        this._isLeaving = false
        this.leftHand = { isActivated: false, activatedTime: 0 }
        this.rightHand = { isActivated: false, activatedTime: 0 }
        this.defendMyselfGoal = null
        this.onHeard = null
        this.lockedItems = []
        this.commands = new Commands(this.bot)
        this._currentPath = null
        this.lookAtPlayer = 0
        this._runningTask = null

        this.instantLook = Boolean(config.bot.behavior?.instantLook)

        this.saveInterval = new Interval(30000)
        this.saveTasksInterval = new Interval(5000)

        this.lookAtPlayerTimeout = new Interval(3000)

        this.permissiveMovements = null
        this.restrictedMovements = null
        this.cutTreeMovements = null

        this.debug = new Debug(this, Boolean(config.debug))

        this.chatHandlers = this.setupChatHandlers()

        this.inventory = require('./utils/inventory')(this)
        this.blocks = require('./utils/blocks')(this)

        this.autos = [
            require('./auto/important/evoker-fangs-defense')(this),
            require('./auto/important/creeper-defense')(this),
            require('./auto/important/fireball-defense')(this),
            require('./auto/important/fire-lava-defense')(this),
            require('./auto/important/drink-milk')(this),
            require('./auto/important/hostile-defense')(this),
            require('./auto/important/lava-water-defense')(this),
            require('./auto/important/eating')(this),
            require('./auto/important/attack-response')(this),
            require('./auto/important/item-serving')(this),
        ]

        if (config.bot.behavior?.checkQuiet) this.autos.push(require('./auto/important/keep-quiet')(this))
        if (config.bot.behavior?.sleep) this.autos.push(require('./auto/important/sleep')(this))

        this.boredomAutos = [
            require('./auto/boredom/cleanup-arrows')(this),
            require('./auto/boredom/cleanup-mlg')(this),
            require('./auto/boredom/give-back')(this),
            require('./auto/boredom/pickup-items')(this),
            require('./auto/boredom/pickup-xps')(this),
            require('./auto/boredom/goto-idle')(this),
            require('./auto/boredom/move-away')(this),
            require('./auto/boredom/look')(this),
            require('./auto/boredom/clear-hand')(this),
        ]

        if (config.bot.behavior?.loadCrossbows) this.boredomAutos.push(require('./auto/boredom/load-crossbow')(this))
        if (config.bot.behavior?.dumpTrash) this.boredomAutos.push(require('./auto/boredom/dump-trash')(this))
        if (config.bot.behavior?.ensureEquipment) this.boredomAutos.push(require('./auto/boredom/ensure-equipment')(this))
        if (config.bot.behavior?.harvest) this.boredomAutos.push(require('./auto/boredom/harvest')(this))
        if (config.bot.behavior?.restoreCrops) this.boredomAutos.push(require('./auto/boredom/restore-crops')(this))
        if (config.bot.behavior?.breedAnimals) this.boredomAutos.push(require('./auto/boredom/breed-animals')(this))

        const stringifyMessage = function(/** @type {any} */ message) {
            if (typeof message === 'string') {
                return message.trim()
            } else if (typeof message === 'number' ||
                typeof message === 'bigint') {
                return message.toString()
            } else if (typeof message === 'object') {
                if (message instanceof Error) {
                    if (message.name === 'NoPath') {
                        return `I can't get there`
                    }
                    return message.message
                }
            }
            return message + ''
        }

        this.bot.on('chat', (sender, message) => {
            if (this.env.bots.find(v => v.username === sender)) { return }
            this.handleChat(sender, message, makeResponseHandler(sender, v => this.bot.chat(stringifyMessage(v))), false)
        })

        this.bot.on('whisper', (sender, message) => {
            this.handleChat(sender, message, makeResponseHandler(sender, v => this.bot.whisper(sender, stringifyMessage(v))), true)
        })

        this.bot.on('target_aiming_at_you', (entity, trajectory) => {
            if (entity.type === 'player') { return } // FIXME: also activates when eating something
            this.tasks.push(this, {
                task: function*(bot, args) {
                    const goal = {
                        'distance': bot.bot.movement.heuristic.new('distance'),
                        'danger': bot.bot.movement.heuristic.new('danger'),
                        'proximity': bot.bot.movement.heuristic.new('proximity'),
                        'conformity': bot.bot.movement.heuristic.new('conformity'),
                    }
                    while (true) {
                        if (!args.entity.isValid) break
                        if (!args.trajectory.length) break

                        const directionToSelf = bot.bot.entity.position.clone().subtract(args.entity.position).normalize()
                        const entityDirection = Math.rotationToVectorRad(args.entity.pitch, args.entity.yaw)

                        const dot = directionToSelf.dot(entityDirection)

                        if (dot < 0.5) break

                        const a = args.entity.position.clone()
                        const b = args.trajectory[args.trajectory.length - 1].clone()

                        const d = new Vec3(
                            b.x - a.x,
                            b.y - a.y,
                            b.z - a.z,
                        ).normalize()
                        const w = new Vec3(
                            bot.bot.entity.position.x - a.x,
                            bot.bot.entity.position.y + 1 - a.y,
                            bot.bot.entity.position.z - a.z,
                        )
                        const p = d.scaled(w.dot(d)).add(a)

                        if (bot.bot.entity.position.distanceTo(p) > 2) { break }

                        a.y = bot.bot.entity.position.y
                        b.y = bot.bot.entity.position.y
                        p.y = bot.bot.entity.position.y

                        bot.debug.drawLine(a, b, [1, 0, 0])
                        bot.debug.drawLine(bot.bot.entity.position, p, [1, 0, 1])

                        bot.bot.movement.setGoal(goal)
                        const yaw = bot.bot.movement.getYaw(360, 15, 2)
                        const rotation = Math.rotationToVectorRad(0, yaw)

                        bot.bot.freemotion.moveTowards(yaw)
                        bot.bot.setControlState('sprint', true)

                        /** @type {import('prismarine-world').RaycastResult | null} */
                        const ray = bot.bot.world.raycast(
                            bot.bot.entity.position.offset(0, 0.6, 0),
                            rotation,
                            bot.bot.controlState.sprint ? 2 : 1)
                        if (ray) {
                            bot.bot.jumpQueued = true
                        }

                        yield
                    }
                    bot.bot.clearControlStates()

                    return

                    const shield = bot.inventory.searchInventoryItem(null, 'shield')
                    if (shield) {
                        if (!bot.inventory.holds(shield, true)) {
                            yield* bot.inventory.equip(shield, 'off-hand')
                        }
                        bot.bot.lookAt(args.entity.position.offset(0, 1.6, 0), true)
                        bot.activateHand('left', 5000)
                    }
                },
                id: `parry-aim-${entity.uuid ?? entity.id}`,
            }, {
                entity: entity,
                trajectory: trajectory,
            }, priorities.critical - 2, false, null, false)
        })

        this.bot.on('incoming_projectil', (projectile, trajectory) => {
            const projectileDirection = projectile.entity.velocity.clone().normalize()
            const directionToSelf = this.bot.entity.position.clone().subtract(projectile.entity.position).normalize()
            const dot = projectileDirection.dot(directionToSelf)
            if (dot <= 0) { return }

            this.tasks.push(this, {
                task: function*(bot, args) {
                    const goal = {
                        'distance': bot.bot.movement.heuristic.new('distance'),
                        'danger': bot.bot.movement.heuristic.new('danger'),
                        'proximity': bot.bot.movement.heuristic.new('proximity'),
                        'conformity': bot.bot.movement.heuristic.new('conformity'),
                    }
                    while (true) {
                        if (!args.projectile.entity.isValid) break
                        if (!args.trajectory.length) break
                        if (!args.projectile.currentSpeed) break

                        const projectileDirection = args.projectile.entity.velocity.clone().normalize()
                        const directionToSelf = bot.bot.entity.position.clone().subtract(args.projectile.entity.position).normalize()
                        const dot = projectileDirection.dot(directionToSelf)
                        if (dot <= 0) { break }

                        const a = args.projectile.entity.position.clone()
                        const b = args.trajectory[args.trajectory.length - 1].clone()

                        const d = new Vec3(
                            b.x - a.x,
                            b.y - a.y,
                            b.z - a.z,
                        ).normalize()
                        const w = new Vec3(
                            bot.bot.entity.position.x - a.x,
                            bot.bot.entity.position.y + 1 - a.y,
                            bot.bot.entity.position.z - a.z,
                        )
                        const p = d.scaled(w.dot(d)).add(a)

                        if (bot.bot.entity.position.distanceTo(p) > 2) { break }

                        a.y = bot.bot.entity.position.y
                        b.y = bot.bot.entity.position.y
                        p.y = bot.bot.entity.position.y

                        bot.debug.drawLine(a, b, [1, 0, 0])
                        bot.debug.drawLine(bot.bot.entity.position, p, [1, 0, 1])

                        goal.proximity
                            .target(p)
                            .avoid(true)
                        bot.bot.movement.setGoal(goal)
                        const yaw = bot.bot.movement.getYaw(360, 15, 2)
                        const rotation = Math.rotationToVectorRad(0, yaw)

                        bot.bot.freemotion.moveTowards(yaw)
                        bot.bot.setControlState('sprint', true)

                        /** @type {import('prismarine-world').RaycastResult | null} */
                        const ray = bot.bot.world.raycast(
                            bot.bot.entity.position.offset(0, 0.6, 0),
                            rotation,
                            bot.bot.controlState.sprint ? 2 : 1)
                        if (ray) {
                            bot.bot.jumpQueued = true
                        }

                        yield
                    }
                    bot.bot.clearControlStates()

                    /*
                    const shield = bot.searchInventoryItem(null, 'shield')

                    if (shield) {
                        if (!bot.holds('shield', true)) {
                            bot.bot.equip(shield.type, 'off-hand')
                        } else {
                            bot.bot.lookAt(args.hazard.projectile.entity.position, true)
                            bot.activateHand('left', 5000)
                        }
                    } else {
                        console.log(`[Bot "${bot.username}"] Incoming projectile`)
                        // this.debug.drawPoint(hazard.projectile.entity.position, [1, 1, 1])

                        yield* tasks.goto.task(bot, {
                            point: bot.bot.entity.position.offset(-args.directionToSelf.z * 1, 0, args.directionToSelf.x * 1),
                            distance: 0,
                            searchRadius: 3,
                            timeout: 500,
                            sprint: true,
                            interrupt: args.interrupt,
                        })
                    }
                    */
                },
                id: `parry-projectile-${projectile.uuid ?? projectile.entity.uuid ?? projectile.entity.id}`,
            }, {
                projectile: projectile,
                trajectory: trajectory,
            }, priorities.critical - 1, false, null, false)
        })

        this.bot.on('soundEffectHeard', (soundName) => {
            if (this.onHeard) { this.onHeard(soundName) }
        })

        this.bot.on('hardcodedSoundEffectHeard', (soundId) => {
            if (this.onHeard) { this.onHeard(soundId) }
        })

        this.bot._client.on('damage_event', (packet) => {
            const entity = this.bot.entities[packet.entityId]
            if (!entity) { return }
            /** @type {number} */
            const sourceCauseId = packet.sourceCauseId
            if (!sourceCauseId) { return }
            if (this.env.bots.find(v => v.bot.entity && v.bot.entity.id === sourceCauseId)) { return }
            const source = this.bot.entities[sourceCauseId - 1]
            if (!source) { return }
            if (this.bot.entity && entity.id === this.bot.entity.id) {
                let indirectSource = source
                while (this.env.entityOwners[indirectSource.id]) {
                    indirectSource = this.env.entityOwners[source.id]
                }
                this.memory.hurtBy[indirectSource.id] ??= {
                    entity: indirectSource,
                    times: [],
                }
                this.memory.hurtBy[indirectSource.id].times.push(performance.now())
                // console.log(`Damaged by ${indirectSource.username ?? indirectSource.displayName ?? indirectSource.name ?? 'someone'}`)
            }
        })

        this.bot.once('spawn', () => {
            console.log(`[Bot "${this.username}"] Spawned`)
            this.bot.clearControlStates()

            const mineflayerPathfinder = require('mineflayer-pathfinder')

            // @ts-ignore
            this.permissiveMovements = new mineflayerPathfinder.Movements(this.bot)
            this.permissiveMovements.canDig = true
            this.permissiveMovements.digCost = 4
            this.permissiveMovements.placeCost = 3
            this.permissiveMovements.allowParkour = true
            this.permissiveMovements.allowSprinting = true
            this.permissiveMovements.canOpenDoors = true

            // this.permissiveMovements.exclusionAreasStep.push((block) => {
            //     if (block.name === 'composter') return 50
            //     return 0
            // })

            Object.values(this.bot.registry.entities)
                .filter(v => v.type === 'hostile')
                .map(v => v.name)
                .forEach(v => this.permissiveMovements.entitiesToAvoid.add(v));

            ([
                'furnace',
                'blast_furnace',
                'smoker',
                'campfire',
                'soul_campfire',
                'brewing_stand',
                'beacon',
                'conduit',
                'bee_nest',
                'beehive',
                'suspicious_sand',
                'suspicious_gravel',
                'decorated_pot',
                'bookshelf',
                'barrel',
                'ender_chest',
                'respawn_anchor',
                'infested_stone',
                'infested_cobblestone',
                'infested_stone_bricks',
                'infested_mossy_stone_bricks',
                'infested_cracked_stone_bricks',
                'infested_chiseled_stone_bricks',
                'infested_deepslate',
                'end_portal_frame',
                'spawner',
                'composter',
            ]
                .map(v => this.bot.registry.blocksByName[v]?.id ?? (() => { throw new KnowledgeError(`Unknown block "${v}"`) })())
                .forEach(v => this.permissiveMovements.blocksCantBreak.add(v)));

            ([
                'campfire',
                'composter',
                'sculk_sensor',
                'sweet_berry_bush',
                'end_portal',
                'nether_portal',
            ]
                .map(v => this.bot.registry.blocksByName[v]?.id ?? (() => { throw new KnowledgeError(`Unknown block "${v}"`) })())
                .forEach(v => this.permissiveMovements.blocksToAvoid.add(v)));

            ([
                'vine',
                'scaffolding',
                'ladder',
                'twisting_vines',
                'twisting_vines_plant',
                'weeping_vines',
                'weeping_vines_plant',
            ]
                .map(v => this.bot.registry.blocksByName[v]?.id ?? (() => { throw new KnowledgeError(`Unknown block "${v}"`) })())
                .forEach(v => this.permissiveMovements.climbables.add(v)));

            ([
                'short_grass',
                'tall_grass',
            ]
                .map(v => this.bot.registry.blocksByName[v]?.id ?? (() => { throw new KnowledgeError(`Unknown block "${v}"`) })())
                .forEach(v => this.permissiveMovements.replaceables.add(v)));

            // @ts-ignore
            this.restrictedMovements = new mineflayerPathfinder.Movements(this.bot, this.permissiveMovements)
            this.restrictedMovements.allow1by1towers = false
            this.restrictedMovements.canOpenDoors = false
            require('./tasks/mine').addMovementExclusions(this.restrictedMovements, this)

            // @ts-ignore
            this.cutTreeMovements = new mineflayerPathfinder.Movements(this.bot, this.restrictedMovements)
            this.cutTreeMovements.blocksCanBreakAnyway?.add(this.mc.registry.blocksByName['oak_leaves'].id)

            console.log(`[Bot "${this.username}"] Ready`)
        })

        // this.bot.on('move', () => {
        //     if (!this.mc) { return }
        //     if (this.bot.entity.velocity.y < Minecraft.general.fallDamageVelocity) {
        //         this.tasks.tick()
        //         this.tasks.push(this, tasks.mlg, {}, priorities.critical)
        //         return
        //     }
        // })

        this.bot.on('path_update', path => {
            // console.log(`[Bot "${this.username}"] [Pathfinder] Update`)
            this._currentPath = path
        })
        this.bot.on('path_reset', reason => {
            switch (reason) {
                case 'dig_error':
                case 'place_error':
                case 'stuck':
                    console.error(`[Bot "${this.username}"] [Pathfinder] ${reason}`)
                    break
                case 'no_scaffolding_blocks':
                    console.warn(`[Bot "${this.username}"] [Pathfinder] ${reason}`)
                    break
                default:
                    // console.log(`[Bot "${this.username}"] [Pathfinder] ${reason}`)
                    break
            }
            this._currentPath = null
        })
        this.bot.on('path_stop', () => {
            this._currentPath = null
        })

        this.bot.on('entityMoved', (entity) => {
            entity.time = performance.now()
            if (!entity.spawnPosition) entity.spawnPosition = entity.position.clone()
        })

        this.bot.on('entitySpawn', (entity) => {
            entity.time = performance.now()
            entity.spawnPosition = entity.position.clone()
        })

        this.bot.on('entityDead', (entity) => {
            entity.isValid = false
        })

        this.bot.on('entityGone', (entity) => {
            entity.isValid = false
        })

        this.bot.on('entitySpawn', (entity) => {
            if (entity.name !== 'eye_of_ender') return
        })

        this.bot.on('entityGone', (entity) => {
            if (entity.name !== 'eye_of_ender') return
            const a = entity.spawnPosition
            const b = entity.position
            const direction = new Vec3(b.x - a.x, b.y - a.y, b.z - a.z)
            const yaw = Math.atan2(-direction.x, -direction.z)
            require('./stronghold')(this.env.enderPearlThrows, {
                x: a.x,
                y: a.y,
                z: a.z,
                angle: yaw,
            }, makeResponseHandler(`BB_vagyok`, this.bot.chat))
        })

        /**
         * @type {null | NodeJS.Timeout}
         */
        let tickInterval = setInterval(() => {
            if (this.bot.entity?.isValid) {
                this.tick()
            }
        }, 50)

        this.bot.on('end', () => {
            clearInterval(tickInterval)
            tickInterval = null
        })

        this.bot.on('spawn', () => {
            if (this.bot.entity) this.bot.entity.isValid = true
        })

        this.bot.on('death', () => {
            console.log(`[Bot "${this.username}"] Died`)
            this.bot.clearControlStates()
            this.bot.pathfinder.stop()
            this.tasks.death()
            this.leftHand.isActivated = false
            this.leftHand.activatedTime = 0
            this.rightHand.isActivated = false
            this.rightHand.activatedTime = 0
        })

        this.bot.on('kicked', (/** @type {any} */ reason) => {
            if (typeof reason === 'string') {
                console.warn(`[Bot "${this.username}"] Kicked:`, reason)
                return
            }

            if (JSON.equals(reason, { type: "compound", value: { translate: { type: "string", value: "disconnect.timeout" } } })) {
                console.error(`[Bot "${this.username}"] Kicked because I was AFK`)
                return
            }

            if (JSON.equals(reason, { type: "compound", value: { translate: { type: "string", value: "multiplayer.disconnect.kicked" } } })) {
                console.error(`[Bot "${this.username}"] Someone kicked me`)
                return
            }

            if (reason['type'] === 'string' && reason['value']) {
                console.error(`[Bot "${this.username}"] Kicked:`, reason.value)
            } else {
                console.error(`[Bot "${this.username}"] Kicked:`, JSON.stringify(reason))
            }
        })

        this.bot.on('error', (error) => {
            if (error instanceof AggregateError) {
                for (const subError of error.errors) {
                    if ('syscall' in subError && subError.syscall === 'connect') {
                        console.error(`[Bot "${this.username}"] Failed to connect to ${subError.address}: ${(() => {
                            switch (subError.code) {
                                case 'ECONNREFUSED': return 'Connection refused'
                                default: return subError.code
                            }
                        })()}`)
                        continue
                    }
                    console.error(`[Bot "${this.username}"]`, subError)
                }
                return
            } else if ('syscall' in error && 'code' in error) {
                if (error.syscall === 'connect') {
                    switch (error.code) {
                        case 'ECONNREFUSED': {
                            console.error(`[Bot "${this.username}"] Connection refused`)
                            return
                        }
                        default:
                            break
                    }
                }
            }
            console.error(`[Bot "${this.username}"]`, error)
        })

        this.bot.on('login', () => { console.log(`[Bot "${this.username}"] Logged in`) })

        this.bot.on('end', (reason) => {
            this.env.removeBot(this)

            switch (reason) {
                case 'socketClosed': {
                    console.warn(`[Bot "${this.username}"] Ended: Socket closed`)
                    break
                }
                case 'disconnect.quitting': {
                    console.log(`[Bot "${this.username}"] Quit`)
                    break
                }
                default: {
                    console.log(`[Bot "${this.username}"] Ended:`, reason)
                    break
                }
            }

            this.memory.save()
            this.env.save()
        })

        this.bot.on('playerCollect', (collector, collected) => {
            if (!this.bot.entity || this.bot.entity.id !== collector.id) return
            for (let i = 0; i < this.env.playerDeaths.length; i++) {
                const playerDeath = this.env.playerDeaths[i]
                for (let j = 0; j < playerDeath.drops.length; j++) {
                    if (playerDeath.drops[j].id !== collected.id) continue

                    const item = collected.getDroppedItem()
                    console.log(`[Bot \"${this.username}\"] Player \"${playerDeath.username}\" drop collected`, item)

                    playerDeath.drops.splice(j, 1)
                    if (playerDeath.drops.length === 0) this.env.playerDeaths.splice(i, 1)

                    let playerDeathLoot = this.memory.playerDeathLoots.find(v => v.username === playerDeath.username)
                    if (!playerDeathLoot) {
                        playerDeathLoot = {
                            username: playerDeath.username,
                            items: [],
                        }
                        this.memory.playerDeathLoots.push(playerDeathLoot)
                    }
                    playerDeathLoot.items.push(new ItemLock(playerDeath.username, item, item.count))
                    return
                }
            }
        })
    }

    /**
     * @private
     * @returns {ReadonlyArray<ChatHandler>}
     */
    setupChatHandlers() {
        /**
         * @type {Array<ChatHandler>}
         */
        const handlers = []

        handlers.push(/** @type {StringChatHandler} */({
            match: 'crash',
            command: (sender, message, response, isWhispered) => {
                throw new Error('Crash')
            }
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: 'pause',
            command: (sender, message, response, isWhispered) => {
                this.tasks.interrupt('user')
            },
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: 'resume',
            command: (sender, message, response, isWhispered) => {
                this.tasks.resume()
            },
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: 'chain',
            command: (sender, message, response, isWhispered) => {
                const bots = this.env.bots.map(v => v.username)
                const selfIndex = bots.indexOf(this.username)
                const followUsername = selfIndex === 0 ? sender : bots[selfIndex - 1]
                const task = this.tasks.push(this, tasks.followPlayer, {
                    player: followUsername,
                    range: 2,
                    response: response,
                }, priorities.low - 1, true, sender, isWhispered)
                if (task) {
                    response.respond(`Okay`)
                    task.wait()
                        .then(() => { })
                        .catch(error => error instanceof CancelledError || response.respond(error))
                } else {
                    response.respond(`I'm already following ${sender === followUsername ? 'you' : followUsername}`)
                }
            },
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: 'mine',
            command: (sender, message, response, isWhispered) => {
                const task = this.tasks.push(this, require('./tasks/mine'), {

                }, priorities.user, false, sender, isWhispered)
                if (task) {
                    response.respond(`Okay`)
                    task.wait()
                        .then(result => response.respond(`Done`))
                        .catch(error => error instanceof CancelledError || response.respond(error))
                } else {
                    response.respond(`I'm already mining`)
                }
            },
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: ['breed'],
            command: (sender, message, response, isWhispered) => {
                const task = this.tasks.push(this, {
                    task: BruhBot.breedAnimals,
                    id: `breed-animals`,
                }, {}, priorities.user, false, sender, isWhispered)

                if (task) {
                    response.respond(`Okay`)
                    task.wait()
                        .then(result => result ? response.respond(`I fed ${result} animals`) : response.respond(`No animals to feed`))
                        .catch(error => error instanceof CancelledError || response.respond(error))
                } else {
                    response.respond(`I'm already breeding animals`)
                }
            },
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: ['harvest'],
            command: (sender, message, response, isWhispered) => {
                const task = this.tasks.push(this, {
                    task: BruhBot.tryHarvestCrops,
                    id: `harvest-crops`,
                }, {}, priorities.user, false, sender, isWhispered)

                if (task) {
                    response.respond(`Okay`)
                    task.wait()
                        .then(result => result ? response.respond(`Done`) : response.respond(`No crops found that I can harvest`))
                        .catch(error => error instanceof CancelledError || response.respond(error))
                } else {
                    response.respond(`I'm already harvesting crops`)
                }
            },
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: ['check crops'],
            command: (sender, message, response, isWhispered) => {
                const task = this.tasks.push(this, {
                    task: BruhBot.tryRestoreCrops,
                    id: `check-crops`,
                }, {}, priorities.user, false, sender, isWhispered)

                if (task) {
                    response.respond(`Okay`)
                    task.wait()
                        .then(() => response.respond(`Done`))
                        .catch(error => error instanceof CancelledError || response.respond(error))
                } else {
                    response.respond(`I'm already checking crops`)
                }
            },
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: ['dump', 'dump trash'],
            command: (sender, message, response, isWhispered) => {
                const task = this.tasks.push(this, tasks.dumpToChest, {
                    items: this.inventory.getTrashItems()
                }, priorities.user, false, sender, isWhispered)

                if (task) {
                    response.respond(`Okay`)
                    task.wait()
                        .then(result => result.isEmpty ? response.respond(`I don't have any trash`) : response.respond(`Done`))
                        .catch(error => error instanceof CancelledError || response.respond(error))
                } else {
                    response.respond(`I'm already dumping trash`)
                }
            },
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: 'dump all',
            command: (sender, message, response, isWhispered) => {
                const task = this.tasks.push(this, tasks.dumpToChest, {
                    items: this.inventory.inventoryItems().map(v => ({ item: v, count: v.count })).toArray(),
                }, priorities.user, false, sender, isWhispered)

                if (task) {
                    response.respond(`Okay`)
                    task.wait()
                        .then(result => result.isEmpty ? response.respond(`I don't have anything`) : response.respond(`Done`))
                        .catch(error => error instanceof CancelledError || response.respond(error))
                } else {
                    response.respond(`I'm already dumping everything`)
                }
            },
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: ['ensure equipment', 'prepare', 'prep'],
            command: (sender, message, response, isWhispered) => {
                const task = this.tasks.push(this, {
                    task: BruhBot.ensureEquipment,
                    id: 'ensure-equipment',
                    humanReadableId: 'Ensure equipment',
                }, {
                    explicit: true,
                    response: response,
                }, priorities.user, false, sender, isWhispered)
                if (task) {
                    response.respond(`Okay`)
                    task.wait()
                        .then(() => response.respond(`Done`))
                        .catch(error => error instanceof CancelledError || response.respond(error))
                } else {
                    response.respond(`I'm already ensuring equipment`)
                }
            },
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: ['clear debug', 'cdebug', 'dispose debug', 'ddebug', 'ndebug'],
            command: (sender, message, response, isWhispered) => {
                this.debug.disposeAll()
            },
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: 'fly',
            command: (sender, message, response, isWhispered) => {
                this.tasks.push(this, {
                    task: function*(bot, args) {
                        let location = bot.env.getPlayerPosition(args.player, 10000)
                        if (!location) {
                            try {
                                location = (yield* taskUtils.wrap(response.askPosition(`Where are you?`, 30000)))?.message
                                response.respond(`${location.x} ${location.y} ${location.z} in ${location.dimension} I got it`)
                            } catch (error) {
                                throw new GameError(`I can't find you`, {
                                    cause: error
                                })
                            }
                        }
                        if (bot.dimension !== location.dimension) {
                            throw new GameError(`We are in a different dimension`)
                        }
                        const elytraItem = bot.inventory.searchInventoryItem(null, 'elytra')
                        if (!elytraItem) {
                            throw new GameError(`I have no elytra`)
                        }

                        if (!bot.bot.elytrafly) {
                            bot.bot.loadPlugin(require('mineflayer-elytrafly').elytrafly)
                        }

                        bot.bot.equip(elytraItem, 'torso')
                        bot.bot.elytrafly.elytraFlyTo(location.xyz(bot.dimension))
                        yield* taskUtils.waitForEvent(bot.bot, 'elytraFlyGoalReached')
                    },
                    id: function(args) { return `fly-to-${args.player}` },
                    humanReadableId: function(args) { return `Flying to ${args.player}` },
                }, {
                    player: sender
                }, priorities.user, true, sender, isWhispered)
            },
        }))

        handlers.push(/** @type {RegexpChatHandler} */({
            match: /get\s+([0-9]*)\s*([a-zA-Z_ ]+)/,
            command: (sender, message, response, isWhispered) => {
                const count = (message[1] === '') ? 1 : Number.parseInt(message[1])
                const items = this.resolveItemInput(message[2])

                if (items.length === 0) {
                    response.respond(`I don't know what "${message[2]}" is`)
                    return
                }

                const task = this.tasks.push(this, tasks.gatherItem, {
                    count: count,
                    item: items,
                    response: response,
                    canTrade: true,
                    canCraft: true,
                    canBrew: true,
                    canSmelt: true,
                    canDigGenerators: true,
                    canDigEnvironment: true,
                    canKill: true,
                    canUseChests: true,
                    canUseInventory: true,
                    canRequestFromPlayers: false,
                    canRequestFromBots: true,
                    canHarvestMobs: true,
                    force: true,
                }, priorities.user, true, sender, isWhispered)
                if (task) {
                    response.respond(`Okay`)
                    task.wait()
                        .then(result => {
                            if (result.count <= 0) {
                                response.respond(`I couldn't gather the item${count > 1 ? 's' : ''}`)
                                return
                            }
                            this.tasks.push(this, {
                                task: function*(bot, args) {
                                    const res = yield* taskUtils.wrap(args.onNeedYesNo(`I gathered ${result.count} ${stringifyItemH(result.item)}, do you need it?`, 10000))
                                    if (res?.message) {
                                        bot.tasks.push(bot, tasks.giveTo, {
                                            player: sender,
                                            items: [result],
                                            response: args.response,
                                        }, priorities.user, false, sender, isWhispered)
                                            ?.wait()
                                            .then(() => response.respond(`There it is`))
                                            .catch(error => error instanceof CancelledError || console.error(error))
                                    }
                                },
                                id: `ask-if-${sender}-need-${result.count}-${stringifyItem(result.item)}`,
                                humanReadableId: `Asking ${sender} something`,
                            }, {
                                onNeedYesNo: response.askYesNo,
                            }, priorities.user, false, sender, isWhispered, true)
                                ?.wait()
                                .catch(error => error instanceof CancelledError || response.respond(error))
                        })
                        .catch(error => error instanceof CancelledError || response.respond(error))
                } else {
                    response.respond(`I'm already gathering it`)
                }
            },
        }))

        handlers.push(/** @type {RegexpChatHandler} */({
            match: /plan\s+([0-9]*)\s*([a-zA-Z_ ]+)/,
            command: (sender, message, response, isWhispered) => {
                const count = (message[1] === '') ? 1 : Number.parseInt(message[1])
                const items = this.resolveItemInput(message[2])

                if (items.length === 0) {
                    response.respond(`I don't know what "${message[2]}" is`)
                    return
                }

                if (this.tasks.isIdle) {
                    response.respond(`Let me think`)
                }

                const task = this.tasks.push(this, {
                    task: function*(bot, args) {
                        /** @type {Array<ItemLock>} */
                        const planningLocalLocks = []
                        /** @type {Array<ItemLock>} */
                        const planningRemoteLocks = []
                        const plan = yield* tasks.gatherItem.planAny(bot, args.item, args.count, args, {
                            depth: 0,
                            recursiveItems: [],
                            isOptional: false,
                            lockItems: false,
                            localLocks: planningLocalLocks,
                            remoteLocks: planningRemoteLocks,
                            force: false,
                        })
                        planningLocalLocks.forEach(v => v.unlock())
                        planningRemoteLocks.forEach(v => v.unlock())
                        const organizedPlan = plan.plan.flat()
                        const planResult = tasks.gatherItem.planResult(organizedPlan, plan.item)
                        const planCost = tasks.gatherItem.planCost(organizedPlan)

                        if (organizedPlan.length === 0 && planResult === 0) {
                            response.respond(`I can't gather ${stringifyItemH(plan.item)}`)
                            return
                        }

                        response.respond(`There is a plan for ${planResult} ${stringifyItemH(plan.item)} with a cost of ${planCost}:`)
                        yield* taskUtils.sleepTicks()
                        for (const step of tasks.gatherItem.stringifyPlan(bot, organizedPlan).split('\n')) {
                            response.respond(` ${step}`)
                            yield* taskUtils.sleepTicks()
                        }

                        {
                            response.respond(`Delta:`)
                            yield* taskUtils.sleepTicks()
                            const future = new tasks.gatherItem.PredictedEnvironment(organizedPlan, bot.mc.registry)

                            if (!future.inventory.isEmpty) {
                                response.respond(`Inventory:`)
                                yield* taskUtils.sleepTicks()

                                for (const name of future.inventory.keys) {
                                    const delta = future.inventory.get(name)
                                    if (delta) {
                                        response.respond(` ${delta < 0 ? `${delta}` : `+${delta}`} ${stringifyItemH(name)}`)
                                        yield* taskUtils.sleepTicks()
                                    }
                                }
                            }

                            if (Object.keys(future.chests).length) {
                                response.respond(`Chests:`)
                                yield* taskUtils.sleepTicks()

                                for (const position in future.chests) {
                                    const chest = future.chests[/** @type {import('./environment').PositionHash} */ (position)]

                                    response.respond(` at ${position}`)
                                    yield* taskUtils.sleepTicks()

                                    for (const name of chest.delta.keys) {
                                        const delta = chest.delta.get(name)
                                        if (delta) {
                                            response.respond(`  ${delta < 0 ? `${delta}` : `+${delta}`} ${stringifyItemH(name)}`)
                                            yield* taskUtils.sleepTicks()
                                        }
                                    }
                                }
                            }
                        }
                    },
                    id: function(args) {
                        return `plan-${args.count}-${args.item.map(v => stringifyItem(v)).join('-')}`
                    },
                    humanReadableId: function(args) {
                        return `Planning ${args.count} ${args.item.length > 1 ? 'something' : stringifyItemH(args.item[0])}`
                    }
                }, {
                    item: items,
                    count: count,
                    onStatusMessage: response.respond,
                    canCraft: true,
                    canSmelt: true,
                    canBrew: true,
                    canDigGenerators: false,
                    canDigEnvironment: false,
                    canKill: false,
                    canUseChests: true,
                    canUseInventory: true,
                    canRequestFromPlayers: false,
                    canTrade: true,
                    canHarvestMobs: true,
                    force: false,
                }, priorities.user, true, sender, isWhispered)
                if (task) {
                    task.wait()
                        .then(() => { })
                        .catch(error => error instanceof CancelledError || response.respond(error))
                } else {
                    response.respond(`No`)
                }
                return
            },
        }))

        handlers.push(/** @type {RegexpChatHandler} */({
            match: /kill\s+([a-zA-Z0-9_]+)/,
            command: (sender, message, response, isWhispered) => {
                let target
                if (message[1] === 'me') {
                    target = this.bot.players[sender]
                    if (!target) {
                        response.respond(`Can't find you`)
                        return
                    }
                } else {
                    target = this.bot.players[message[1]]
                    if (!target) {
                        response.respond(`Can't find ${message[1]}`)
                        return
                    }
                }

                const task = this.tasks.push(this, tasks.kill, {
                    entity: target.entity,
                    requestedBy: sender,
                    response: response,
                }, priorities.user, true, sender, isWhispered)
                if (task) {
                    response.respond(`Okay`)
                    task.wait()
                        .then(() => response.respond(`Done`))
                        .catch(error => error instanceof CancelledError || response.respond(error))
                } else {
                    response.respond(`I'm already killing ${target.username}`)
                }
            },
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: 'scan chests',
            command: (sender, message, response, isWhispered) => {
                const task = this.tasks.push(this, {
                    task: (bot, args) => this.env.scanChests(bot, args),
                    id: `scan-chests`,
                    humanReadableId: `Scanning chests`,
                }, {}, priorities.user, true, sender, isWhispered)
                if (task) {
                    response.respond(`Okay`)
                    task.wait()
                        .then(result => response.respond(`I scanned ${result} chests`))
                        .catch(error => error instanceof CancelledError || response.respond(error))
                } else {
                    response.respond(`I'm already scanning chests`)
                }
            },
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: 'scan villagers',
            command: (sender, message, response, isWhispered) => {
                const task = this.tasks.push(this, {
                    task: (bot, args) => this.env.scanVillagers(bot, args),
                    id: `scan-villagers`,
                    humanReadableId: `Scanning villagers`,
                }, {}, priorities.user, true, sender, isWhispered)
                if (task) {
                    response.respond(`Okay`)
                    task.wait()
                        .then(result => response.respond(`I scanned ${result} villagers`))
                        .catch(error => error instanceof CancelledError || response.respond(error))
                } else {
                    response.respond(`I'm already scanning villagers`)
                }
            }
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: 'scan crops',
            command: (sender, message, response, isWhispered) => {
                const task = this.tasks.push(this, {
                    task: BruhBot.scanCrops,
                    id: `scan-crops`,
                    humanReadableId: `Scanning crops`,
                }, {}, priorities.user, true, sender, isWhispered)
                if (task) {
                    response.respond(`Okay`)
                    task.wait()
                        .then(result => response.respond(`Crops I found: ${result.keys.map(v => `${result.get(v)} ${v}`).join(', ')}`))
                        .catch(error => error instanceof CancelledError || response.respond(error))
                } else {
                    response.respond(`I'm already scanning crops`)
                }
            }
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: 'fish',
            command: (sender, message, response, isWhispered) => {
                const task = this.tasks.push(this, tasks.fish, {
                    response: response,
                }, priorities.user, true, sender, isWhispered)
                if (task) {
                    response.respond(`Okay`)
                    task.wait()
                        .then(result => result ? response.respond(`I fished ${result} items`) : response.respond(`I couldn't fish anything`))
                        .catch(error => error instanceof CancelledError || response.respond(error))
                } else {
                    response.respond(`I'm already fishing`)
                }
            }
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: 'wyh',
            command: (sender, message, response, isWhispered) => {
                const items = this.bot.inventory.items()

                const normal = new Freq(isItemEquals)
                for (const item of items) {
                    normal.add(item, item.count)
                }

                let builder = ''
                for (let i = 0; i < normal.keys.length; i++) {
                    const item = normal.keys[i]
                    const count = normal.get(item)
                    if (i > 0) { builder += ' ; ' }
                    if (typeof item === 'object' && 'stackSize' in item && count >= item.stackSize) {
                        builder += `${(count / item.stackSize).toFixed(2)} stack `
                    } else {
                        builder += `${count} `
                    }

                    builder += stringifyItemH(item)
                }

                if (builder === '') {
                    response.respond('Nothing')
                } else {
                    response.respond(builder)
                }
            }
        }))

        handlers.push(/** @type {RegexpChatHandler} */({
            match: /(stop|cancel|no) quiet/,
            command: (sender, message, response, isWhispered) => {
                if (!this.userQuiet) {
                    response.respond(`I'm not trying to be quiet`)
                    return
                }

                response.respond(`Okay`)
                this.userQuiet = false
            }
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: 'quiet',
            command: (sender, message, response, isWhispered) => {
                if (this.userQuiet) {
                    response.respond(`I'm already trying to be quiet`)
                    return
                }

                response.respond(`Okay`)

                this.userQuiet = true

                return
            }
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: 'compost',
            command: (sender, message, response, isWhispered) => {
                const task = this.tasks.push(this, tasks.compost, {}, 0, false, sender, isWhispered)
                if (task) {
                    response.respond(`Okay`)
                    task.wait()
                        .then(result => response.respond(`I composted ${result} items`))
                        .catch(error => error instanceof CancelledError || response.respond(error))
                } else {
                    response.respond(`I'm already composting`)
                }
            }
        }))

        handlers.push(/** @type {RegexpChatHandler} */({
            match: /follow\s*([a-zA-Z0-9_]+)?/,
            command: (sender, message, response, isWhispered) => {
                let target
                const implyingSender = !message[1] || message[1] === 'me'
                if (implyingSender) {
                    target = sender
                } else {
                    target = message[1]
                }

                const task = this.tasks.push(this, tasks.followPlayer, {
                    player: target,
                    range: 2,
                    response: response,
                }, priorities.low - 1, true, sender, isWhispered)
                if (task) {
                    response.respond(`Okay`)
                    task.wait()
                        .then(() => { })
                        .catch(error => error instanceof CancelledError || response.respond(error))
                } else {
                    response.respond(`I'm already following ${implyingSender ? 'you' : target}`)
                }
            }
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: 'wyd',
            command: (sender, message, response, isWhispered) => {
                if (this.tasks.tasks.length === 0) {
                    response.respond(`Nothing`)
                } else {
                    let builder = ''
                    for (let i = 0; i < this.tasks.tasks.length; i++) {
                        const task = this.tasks.tasks[i]
                        if (builder) { builder += ' ; ' }
                        builder += `${task.humanReadableId ?? task.id} with priority ${task.priority}`
                        if (task._isBackground) builder += ` (background)`
                        else if (task === this._runningTask) builder += ` (focused)`
                        builder += ` (${task.status})`
                    }
                    response.respond(builder)
                }
                return
            }
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: 'come',
            command: (sender, message, response, isWhispered) => {
                const task = this.tasks.push(this, {
                    task: function*(bot, args) {
                        const playerEntity = bot.bot.players[args.player]?.entity
                        let location = bot.env.getPlayerPosition(args.player, 10000)
                        if (!location) {
                            try {
                                location = (yield* taskUtils.wrap(response.askPosition(`Where are you?`, 30000)))?.message
                                response.respond(`${location.x} ${location.y} ${location.z} in ${location.dimension} I got it`)
                            } catch (error) {
                                throw new GameError(`I can't find you`, {
                                    cause: error
                                })
                            }
                        }

                        while (true) {
                            try {
                                return yield* tasks.goto.task(bot, {
                                    ...(playerEntity ? {
                                        entity: playerEntity
                                    } : {
                                        point: location,
                                    }),
                                    distance: 2,
                                    options: {
                                        timeout: 30000,
                                        sprint: true,
                                    },
                                    // onPathUpdated: (path) => {
                                    //     const time = tasks.goto.getTime(bot.bot.pathfinder.movements, path)
                                    //     response.respond(`I'm here in ${Math.round((time) / 1000).toFixed(2)} seconds`)
                                    // },
                                    ...taskUtils.runtimeArgs(args),
                                })
                            } catch (error) {
                                if (error === 'bruh') {
                                    yield* taskUtils.sleepG(2000)
                                    continue
                                }
                            }
                        }
                    },
                    id: function(args) {
                        return `goto-${args.player}`
                    },
                    humanReadableId: function(args) {
                        return `Goto ${args.player}`
                    },
                }, {
                    player: sender,
                }, priorities.user, true, sender, isWhispered)
                if (task) {
                    response.respond(`Okay`)
                    task.wait()
                        .then(result => {
                            switch (result) {
                                case 'ok':
                                    response.respond(`I'm here`)
                                    break
                                case 'here':
                                    response.respond(`I'm already here`)
                                    break
                                default:
                                    break
                            }
                        })
                        .catch(error => error instanceof CancelledError || response.respond(error))
                } else {
                    response.respond(`I'm already coming to you`)
                }
            }
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: 'sethome',
            command: (sender, message, response, isWhispered) => {
                const location = this.env.getPlayerPosition(sender, 10000)
                if (!location) {
                    if (location) {
                        response.respond(`${location.x} ${location.y} ${location.z} in ${location.dimension} I got it`)
                    } else {
                        throw new GameError(`I can't find you`)
                    }
                }
                if (this.memory.idlePosition &&
                    this.memory.idlePosition.dimension === location.dimension &&
                    this.memory.idlePosition.xyz(location.dimension).distanceTo(location.xyz(location.dimension)) < 5) {
                    response.respond(`This is already my home`)
                    return
                }
                this.memory.idlePosition = location.clone()
                response.respond(`Okay`)
                try {
                    this.memory.save()
                } catch (error) {
                    console.error(error)
                }
            }
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: 'gethome',
            command: (sender, message, response, isWhispered) => {
                if (!this.memory.idlePosition) {
                    response.respond(`I doesn't have a home`)
                } else {
                    response.respond(`My home is at ${Math.floor(this.memory.idlePosition.x)} ${Math.floor(this.memory.idlePosition.y)} ${Math.floor(this.memory.idlePosition.z)} in ${this.memory.idlePosition.dimension}`)
                }
            }
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: 'tp',
            command: (sender, message, response, isWhispered) => {
                const target = this.env.getPlayerPosition(sender)

                if (!target) {
                    throw new GameError(`Can't find ${sender}`)
                }

                if (target.dimension &&
                    this.dimension !== target.dimension) {
                    throw new GameError(`We are in a different dimension`)
                }

                const task = this.tasks.push(this, tasks.enderpearlTo, {
                    destination: target.xyz(this.dimension).offset(0, 0.1, 0),
                    response: response,
                    locks: [],
                }, priorities.user, true, sender, isWhispered)
                if (task) {
                    response.respond(`Okay`)
                    task.wait()
                        .then(result => {
                            if (result === 'here') {
                                response.respond(`I'm already here`)
                                return
                            }
                            const error = task.args.destination.distanceTo(this.bot.entity.position)
                            if (error <= 2) {
                                response.respond(`I'm here`)
                            } else {
                                response.respond(`I missed by ${Math.round(error)} blocks`)
                            }
                        })
                        .catch(error => error instanceof CancelledError || response.respond(error))
                } else {
                    response.respond(`I'm already teleporting to you`)
                }
            }
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: 'give all',
            command: (sender, message, response, isWhispered) => {
                const task = this.tasks.push(this, tasks.giveAll, {
                    player: sender,
                    response: response,
                }, priorities.user, true, sender, isWhispered)
                if (task) {
                    response.respond(`Okay`)
                    task.wait()
                        .then(() => response.respond(`There it is`))
                        .catch(error => error instanceof CancelledError || response.respond(error))
                } else {
                    response.respond(`I'm already on my way`)
                }
            }
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: 'give trash',
            command: (sender, message, response, isWhispered) => {
                const task = this.tasks.push(this, tasks.giveTo, {
                    player: sender,
                    items: this.inventory.getTrashItems(),
                    response: response,
                }, priorities.user, true, sender, isWhispered)
                if (task) {
                    response.respond(`Okay`)
                    task.wait()
                        .then(() => response.respond(`There it is`))
                        .catch(error => error instanceof CancelledError || response.respond(error))
                } else {
                    response.respond(`I'm already on my way`)
                }
            }
        }))

        handlers.push(/** @type {RegexpChatHandler} */({
            match: /give\s+(all|[0-9]*)\s*([a-zA-Z_ ]+)/,
            command: (sender, message, response, isWhispered) => {
                const count = (message[1] === '') ? 1 : (message[1] === 'all') ? Infinity : Number.parseInt(message[1])
                const items = this.resolveItemInput(message[2])

                if (!items.length) {
                    response.respond(`I don't know what ${message[2]} is`)
                    return
                }

                if (items.length > 1) {
                    response.respond(`Specify the item more clearly`)
                    return
                }

                const item = items[0]

                const task = this.tasks.push(this, tasks.giveTo, {
                    player: sender,
                    items: [{ item: item, count: count }],
                }, 0, false, sender, isWhispered)
                if (task) {
                    response.respond(`Okay`)
                    task.wait()
                        .then(result => {
                            if (!result.get(item)) {
                                response.respond(`I don't have ${stringifyItemH(item)}`)
                            } else if (result.get(item) < count && count !== Infinity) {
                                response.respond(`I had only ${result.get(item)} ${stringifyItemH(item)}`)
                            } else {
                                response.respond(`There it is`)
                            }
                        })
                        .catch(error => error instanceof CancelledError || response.respond(error))
                } else {
                    response.respond(`I'm already giving everything to you`)
                }
            }
        }))

        handlers.push(/** @type {RegexpChatHandler} */({
            match: /goto(\s*$|\s+[\sa-zA-Z0-9_\-]+)/,
            command: (sender, message, response, isWhispered) => {
                /**
                 * @param {string} rawLocation
                 */
                const confirm = (rawLocation) => {
                    const location = parseAnyLocationH(rawLocation, this)

                    if (!location) {
                        response.respond(`Bruh`)
                        return
                    }

                    if (typeof location === 'string') {
                        response.respond(location)
                        return
                    }

                    if ('id' in location) {
                        response.respond(`Okay`)
                        this.tasks.push(this, tasks.goto, {
                            entity: location,
                            distance: 3,
                            options: {
                                sprint: true,
                            },
                        }, priorities.user, false, sender, isWhispered)
                            ?.wait()
                            .then(result => result === 'here' ? response.respond(`I'm already at ${rawLocation}`) : response.respond(`I'm here`))
                            .catch(error => error instanceof CancelledError || response.respond(error))
                    } else {
                        response.respond(`Okay`)
                        this.tasks.push(this, tasks.goto, {
                            point: location,
                            distance: 3,
                            options: {
                                sprint: true,
                            },
                        }, priorities.user, false, sender, isWhispered)
                            ?.wait()
                            .then(result => result === 'here' ? response.respond(`I'm already here`) : response.respond(`I'm here`))
                            .catch(error => error instanceof CancelledError || response.respond(error))
                    }
                }

                if (!message[1]) {
                    response.ask(`Where?`, 15000)
                        .then(response => confirm(response.message))
                        .catch(console.error)
                } else {
                    confirm(message[1])
                }
            }
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: ['stop', 'cancel'],
            command: (sender, message, response, isWhispered) => {
                if (!this.tasks.isIdle) {
                    response.respond(`Okay`)
                }
                this.tasks.cancel('user')
                    .then(didSomething => didSomething ? response.respond(`I stopped`) : response.respond(`I don't do anything`))
                    .catch(error => response.respond(error))
            }
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: ['stop now', 'abort'],
            command: (sender, message, response, isWhispered) => {
                let didSomething = false

                if (this.bot.pathfinder.goal) {
                    this.bot.pathfinder.stop()
                    didSomething = true
                }

                this.bot.setControlState('back', false)
                this.bot.setControlState('forward', false)
                this.bot.setControlState('jump', false)
                this.bot.setControlState('left', false)
                this.bot.setControlState('right', false)
                this.bot.setControlState('sneak', false)
                this.bot.setControlState('sprint', false)

                if (!this.tasks.isIdle) {
                    didSomething = true
                }

                this.tasks.abort()

                if (didSomething) {
                    response.respond(`Okay`)
                } else {
                    response.respond(`I don't do anything`)
                }
            }
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: 'leave',
            command: (sender, message, response, isWhispered) => {
                this._isLeaving = true
                this.tasks.cancel('left')
                    .then(() => this.bot.quit(`${sender} asked me to leave`))
            }
        }))

        handlers.push(/** @type {StringChatHandler} */({
            // cspell: disable-next-line
            match: ['fleave', 'leave force', 'leave now', 'leave!'],
            command: (sender) => {
                this.bot.quit(`${sender} asked me to leave`)
            }
        }))

        return handlers
    }

    /**
     * @private
     */
    tick() {
        if (this.debug.enabled) {
            if (this._currentPath) {
                for (let i = 0; i < this._currentPath.path.length; i++) {
                    const node = this._currentPath.path[i]
                    this.debug.label(node.offset(0, 0.5, 0), {
                        text: node.cost.toFixed(2),
                        // @ts-ignore
                        color: Math.rgb2hex(...([
                            [0.0, 1.0, 0.7],
                            [0.0, 1.0, 0.0],
                            [0.3, 1.0, 0.0],
                            [0.6, 1.0, 0.0],
                            [0.8, 0.6, 0.0],
                        ][Math.ceil(node.cost)] ?? [1, 0, 0])),
                    }, 100)
                }
                // this.debug.drawSolidLines([
                //     // new (require('mineflayer-pathfinder/lib/move').Move)(this.bot.entity.position.x, this.bot.entity.position.y, this.bot.entity.position.z, 0, 0),
                //     ...this._currentPath.path.map(v => v.offset(0, 0.5, 0)),
                // ], 'white', 50)
                /*
                const a = [0.26, 0.72, 1]
                const b = [0.04, 1, 0.51]
                this.debug.drawLines([
                    // new (require('mineflayer-pathfinder/lib/move').Move)(this.bot.entity.position.x, this.bot.entity.position.y, this.bot.entity.position.z, 0, 0),
                    ...this._currentPath.path,
                ], (t, _a, _b) => {
                    const cost = Math.lerp(_a.cost, _b.cost, t) / 50
                    return [
                        Math.lerp(0, 1, cost),
                        Math.lerp(1, 0, cost),
                        Math.lerp(0, 0, cost),
                    ]
                    return [
                        Math.lerp(a[0], b[0], cost),
                        Math.lerp(a[1], b[1], cost),
                        Math.lerp(a[2], b[2], cost),
                    ]
                })
                */
            }
            this.debug.tick()
        }

        if (this.saveTasksInterval?.done()) {
            const json = this.tasks.toJSON()
            if (!fs.existsSync(this._config.worldPath)) { fs.mkdirSync(this._config.worldPath, { recursive: true }) }
            fs.writeFileSync(path.join(this._config.worldPath, 'tasks-' + this.username + '.json'), json, 'utf8')
        }

        for (let i = 0; i < 10; i++) {
            this.commands.tick()
        }

        for (let i = this.lockedItems.length - 1; i >= 0; i--) {
            if (this.lockedItems[i].isUnlocked) {
                // console.log(`[Bot "${this.username}"] Item ${stringifyItem(this.lockedItems[i].item)} unlocked`)
                this.lockedItems.splice(i, 1)
                continue
            }
            if (!this.lockedItems[i].timeoutNotified) {
                const lockTime = performance.now() - this.lockedItems[i].time
                if (lockTime > 60000 && this.tasks.tasks.length === 0) {
                    this.lockedItems[i].timeoutNotified = true
                    console.warn(`[Bot "${this.bot.username}"] Item ${stringifyItem(this.lockedItems[i].item)} locked for ${(lockTime / 1000).toFixed(2)} sec`, this.lockedItems[i].stack)
                }
            }
        }

        if (this.saveInterval.done()) {
            this.memory.save()
        }

        if (this.leftHand.isActivated && this.leftHand.activatedTime && performance.now() >= this.leftHand.activatedTime) {
            this.deactivateHand()
        }

        if (this.rightHand.isActivated && this.rightHand.activatedTime && performance.now() >= this.rightHand.activatedTime) {
            this.deactivateHand()
        }

        for (let i = 0; i < this.chatAwaits.length; i++) {
            if (this.chatAwaits[i].done) {
                this.chatAwaits.splice(i--, 1)
            }
        }

        this._runningTask = this.tasks.tick()

        for (const auto of this.autos) {
            if (auto()) return
        }

        if (this._runningTask && this._runningTask.priority >= priorities.critical) {
            return
        }

        if (this.defendMyselfGoal &&
            !this.defendMyselfGoal.isDone) {
            return
        }

        for (const auto of this.boredomAutos) {
            if (auto()) return
        }
    }

    get isFollowingButNotMoving() {
        return (
            this._runningTask &&
            this._runningTask.id.startsWith('follow') &&
            !this.bot.pathfinder.goal
        )
    }

    *touchingBlocks() {
        const a = this.bot.entity.position.offset(+(this.bot.entity.width / 2), 0, -(this.bot.entity.width / 2)).floor()
        const b = this.bot.entity.position.offset(-(this.bot.entity.width / 2), 0, -(this.bot.entity.width / 2)).floor()
        const c = this.bot.entity.position.offset(+(this.bot.entity.width / 2), 0, +(this.bot.entity.width / 2)).floor()
        const d = this.bot.entity.position.offset(-(this.bot.entity.width / 2), 0, +(this.bot.entity.width / 2)).floor()
        /** @type {Array<Vec3>} */
        const unique = []
        if (!unique.find(v => v.equals(a))) unique.push(a)
        if (!unique.find(v => v.equals(b))) unique.push(b)
        if (!unique.find(v => v.equals(c))) unique.push(c)
        if (!unique.find(v => v.equals(d))) unique.push(d)
        for (const p of unique) {
            const b = this.bot.blockAt(p, false)
            if (b) yield b
        }
    }

    /**
     * @private
     * @param {string} itemInput
     */
    resolveItemInput(itemInput) {
        itemInput = itemInput.toLowerCase().trim()

        /** @type {Array<import('./utils/other').ItemId>} */
        const result = []

        if (itemInput === 'food') {
            result.push(...this.mc.getGoodFoods(false).map(v => v.name))
            return result
        }

        if (result.length === 0) {
            const v = this.mc.registry.itemsByName[itemInput]?.name
            if (v) { result.push(v) }
        }

        if (result.length === 0) {
            const v = this.mc.registry.itemsArray.find(v => v.displayName.toLowerCase() === itemInput)?.name
            if (v) { result.push(v) }
        }

        if (result.length === 0) {
            if (itemInput.endsWith(' potion')) {
                let potionType = itemInput.substring(0, itemInput.length - ' potion'.length)
                switch (potionType) {
                    case 'speed':
                        potionType = 'swiftness'
                        break
                }
                for (const recipe of tasks.brew.recipes) {
                    if (recipe.result.potion.replace('minecraft:', '') === potionType) {
                        result.push(recipe.result)
                        break
                    }
                }
            }
        }

        if (result.length === 0) {
            if (itemInput === 'water bottle' || itemInput === 'water potion') {
                result.push(tasks.brew.makePotionItem('water'))
            }
        }

        return result
    }

    /**
     * @type {import('./task').SimpleTaskDef<void, {
     *   explicit: boolean;
     * }>}
     */
    static *ensureEquipment(bot, args) {
        const equipment = require('./equipment')

        /**
         * @param {import('./tasks/gather-item').PredictedEnvironment | null} future 
         */
        function calculateFoodPoints(future) {
            let items = (future ? tasks.gatherItem.PredictedEnvironment.applyDelta(bot.bot.inventory.items(), future.inventory, isItemEquals) : bot.bot.inventory.items())
                .filter(v => !bot.inventory.isItemLocked(v.name))
                .filter(v => bot.mc.registry.foodsByName[v.name])
            items = bot.mc.filterFoods(items, {
                includeRaw: false,
                includeBadEffects: false,
                includeSideEffects: false,
            })
            let res = 0
            for (const item of items) {
                res += bot.mc.registry.foodsByName[item.name].foodPoints * item.count
            }
            return res
        }

        let foodPointsInInventory = calculateFoodPoints(null)

        const sortedEquipment = equipment.toSorted((a, b) => {
            let _a = 0
            let _b = 0
            switch (a.priority) {
                case 'must': _a = 2; break
                case 'good': _a = 1; break
                default: break
            }
            switch (b.priority) {
                case 'must': _b = 2; break
                case 'good': _b = 1; break
                default: break
            }
            return _b - _a
        })

        /** @type {import('./tasks/gather-item').PermissionArgs} */
        const permissionsForMust = {
            canCraft: true,
            canSmelt: true,
            canBrew: true,
            canDigGenerators: true,
            canKill: true,
            canUseChests: true,
            canUseInventory: true,
            canRequestFromBots: true,
            canTrade: true,
            canHarvestMobs: true,
        }

        /** @type {import('./tasks/gather-item').PermissionArgs} */
        const permissionsForMaybe = {
            canUseChests: true,
            canUseInventory: true,
            canRequestFromBots: true,
        }

        for (const item of sortedEquipment) {
            const permissions = (item.priority === 'must' || args.explicit) ? permissionsForMust : permissionsForMaybe
            switch (item.type) {
                case 'food': {
                    try {
                        if (foodPointsInInventory >= item.food) { break }
                        // console.log(`[Bot "${bot.username}"]`, item.type, item)
                        const foods = bot.mc.getGoodFoods(false).map(v => v.name)
                        // console.warn(`[Bot "${bot.username}"] Low on food`)
                        /** @type {Array<import('./tasks/gather-item').Plan>} */
                        const plans = []
                        /** @type {Array<ItemLock>} */
                        const planningLocalLocks = []
                        /** @type {Array<ItemLock>} */
                        const planningRemoteLocks = []
                        args.task?.blur()
                        try {
                            while (foodPointsInInventory < item.food) {
                                const plan = yield* tasks.gatherItem.planAny(bot, foods, 1, permissions, {
                                    depth: 0,
                                    isOptional: false,
                                    lockItems: false,
                                    localLocks: planningLocalLocks,
                                    remoteLocks: planningRemoteLocks,
                                    recursiveItems: [],
                                    force: true,
                                }, plans.flat(2))
                                plans.push(plan.plan)
                                const future = new tasks.gatherItem.PredictedEnvironment(plans.flat(2), bot.bot.registry)
                                const newFoodPointsInInventory = calculateFoodPoints(future)
                                if (newFoodPointsInInventory <= foodPointsInInventory) break
                                foodPointsInInventory = newFoodPointsInInventory
                            }
                        } finally {
                            args.task?.focus()
                        }
                        planningLocalLocks.forEach(v => v.unlock())
                        try {
                            const res = yield* tasks.gatherItem.task(bot, {
                                force: true,
                                plan: plans.flat(),
                                ...permissions,
                                ...taskUtils.runtimeArgs(args),
                            })
                        } finally {
                            planningRemoteLocks.forEach(v => v.unlock())
                        }
                        // console.log(`[Bot "${bot.username}"] Food gathered`, res)
                    } catch (error) {
                        if (error instanceof Error && error.message.startsWith(`Can't gather `)) {
                        } else {
                            console.error(`[Bot "${bot.username}"]`, error)
                        }
                    }
                    break
                }
                case 'single': {
                    try {
                        if (bot.inventory.inventoryItemCount(null, item.item) > 0) { break }
                        // console.log(`[Bot "${bot.username}"]`, item.type, item)
                        const res = yield* tasks.gatherItem.task(bot, {
                            item: item.item,
                            count: item.count === 'any' ? 1 : item.count,
                            ...permissions,
                            ...taskUtils.runtimeArgs(args),
                        })
                        // console.log(`[Bot "${bot.username}"] Equipment ${item.item} gathered`, res)
                    } catch (error) {
                        if (error instanceof Error && error.message.startsWith(`Can't gather `)) {
                        } else {
                            console.error(`[Bot "${bot.username}"]`, error)
                        }
                    }
                    break
                }
                case 'any': {
                    if (item.item.find(v => bot.inventory.inventoryItemCount(null, v) > 0)) { break }
                    try {
                        // console.log(`[Bot "${bot.username}"]`, item.type, item)
                        const res = yield* tasks.gatherItem.task(bot, {
                            item: item.prefer,
                            count: item.count === 'any' ? 1 : item.count,
                            ...permissions,
                            ...taskUtils.runtimeArgs(args),
                        })
                        // console.log(`[Bot "${bot.username}"] Preferred equipment ${item.prefer} gathered`, res)
                        break
                    } catch (error) {
                        if (error instanceof Error && error.message.startsWith(`Can't gather `)) {
                        } else {
                            console.error(`[Bot "${bot.username}"]`, error)
                        }
                    }

                    try {
                        const res = yield* tasks.gatherItem.task(bot, {
                            item: item.item,
                            count: item.count === 'any' ? 1 : item.count,
                            ...permissions,
                            ...taskUtils.runtimeArgs(args),
                        })
                        // console.log(`[Bot "${bot.username}"] Equipment gathered`, res)
                        break
                    } catch (error) {
                        if (error instanceof Error && error.message.startsWith(`Can't gather `)) {
                        } else {
                            console.error(`[Bot "${bot.username}"]`, error)
                        }
                    }
                    break
                }
            }

            bot.bot.armorManager.equipAll()
        }
    }

    /**
     * @type {import('./task').SimpleTaskDef}
     */
    static *tryRestoreCrops(bot, args) {
        args.task?.blur()
        /** @type {Array<import('./environment').SavedCrop>} */
        const crops = []
        for (const crop of bot.env.crops.filter(v => v.position.dimension === bot.dimension && v.block !== 'brown_mushroom' && v.block !== 'red_mushroom')) {
            yield
            const blockAt = bot.bot.blocks.at(crop.position.xyz(bot.dimension))
            if (!blockAt) { continue }
            if (blockAt.name === 'air') { crops.push(crop) }
        }
        if (crops.length === 0) { return }
        args.task?.focus()
        yield* tasks.plantSeed.task(bot, {
            harvestedCrops: crops,
            locks: [],
            ...taskUtils.runtimeArgs(args),
        })
    }

    /**
     * @type {import('./task').SimpleTaskDef<number>}
     */
    static *tryHarvestCrops(bot, args) {
        const harvested = yield* tasks.harvest.task(bot, {
            ...taskUtils.runtimeArgs(args),
        })

        //for (const crop of bot.env.crops.filter(v => v.position.dimension === bot.dimension && v.block !== 'brown_mushroom' && v.block !== 'red_mushroom')) {
        //    yield
        //    const blockAt = bot.bot.blocks.at(crop.position.xyz(bot.dimension))
        //    if (!blockAt) { continue }
        //    if (blockAt.name !== 'air') { continue }
        //    return harvested
        //}

        try {
            yield* tasks.compost.task(bot, {
                ...taskUtils.runtimeArgs(args),
            })
        } catch (error) {
            if (error instanceof Error && error.message === 'There is no composter') {
            } else {
                console.warn(`[Bot "${bot.username}"]`, error)
            }
        }

        return harvested
    }

    /**
     * @type {import('./task').SimpleTaskDef<number>}
     */
    static *breedAnimals(bot, args) {
        const fencings = yield* bot.env.scanFencings(bot)
        let n = 0
        let _error = null
        for (const fencing of fencings) {
            try {
                n += yield* tasks.breed.task(bot, {
                    animals: Object.values(fencing.mobs),
                    ...taskUtils.runtimeArgs(args),
                })
            } catch (error) {
                console.error(error)
                _error ??= error
            }
        }
        if (!n && _error) { throw _error }
        return n
    }

    /**
     * @private
     * @type {import('./task').SimpleTaskDef<Freq<string>>}
     */
    static *scanCrops(bot, args) {
        args.task?.blur()

        for (let i = bot.env.crops.length - 1; i >= 0; i--) {
            yield
            const savedCrop = bot.env.crops[i]
            if (savedCrop.position.dimension !== bot.dimension) continue
            const pos = savedCrop.position.xyz(bot.dimension)
            const block = bot.bot.blocks.at(pos)
            if (!block) continue
            if (savedCrop.block !== block.name) {
                bot.env.crops.splice(i, 1)
                bot.debug.label(pos.offset(0.5, 1, 0.5), { text: `- ${savedCrop.block}`, color: 'red' }, 10000)
            }
        }

        const blocks = bot.blocks.find({
            matching: new Set(
                Object.keys(Minecraft.cropsByBlockName)
                    .map(v => bot.mc.registry.blocksByName[v].id)
            ),
            count: Infinity,
            maxDistance: config.scanCrops.radius,
            force: true,
            filter: (block) => Minecraft.isCropRoot(bot.bot, block),
        })

        /** @type {Freq<string>} */
        const scanned = new Freq((a, b) => a === b)
        for (const block of blocks) {
            yield
            if (!block) continue

            let alreadySaved = false
            for (let i = 0; i < bot.env.crops.length; i++) {
                if (bot.env.crops[i].position.equals(new Vec3Dimension(block.position, bot.dimension))) {
                    alreadySaved = true
                    if (bot.env.crops[i].block !== block.name) {
                        bot.debug.label(block.position.offset(0.5, 1, 0.5), { text: `c ${block.name}`, color: 'yellow' }, 30000)
                        bot.env.crops[i] = {
                            block: block.name,
                            position: new Vec3Dimension(block.position, bot.dimension),
                        }
                    } else {
                        bot.debug.label(block.position.offset(0.5, 1, 0.5), `${block.name}`, 5000)
                    }
                    scanned.add(block.name, 1)
                    break
                }
            }

            if (!alreadySaved) {
                bot.debug.label(block.position.offset(0.5, 1, 0.5), { text: `+ ${block.name}`, color: 'green' }, 30000)
                bot.env.crops.push({
                    block: block.name,
                    position: new Vec3Dimension(block.position, bot.dimension),
                })
                scanned.add(block.name, 1)
            }
        }

        return scanned
    }

    /**
     * @param {import('prismarine-entity').Entity} hazard
     */
    defendAgainst(hazard) {
        // if (!tasks.attack.can(this, hazard, {
        //     useBow: true,
        //     useMelee: true,
        //     useMeleeWeapon: true,
        // })) {
        //     console.log(`"${hazard.name}": Can't attack`)
        //     return
        // }
        // console.log(`[Bot "${this.username}"] Defend against ${hazard.name}`)
        if (!this.defendMyselfGoal || (
            this.defendMyselfGoal.status !== 'running' &&
            this.defendMyselfGoal.status !== 'queued') ||
            !this.tasks.get(this.defendMyselfGoal.id)) {
            console.log(`[Bot "${this.username}"] New attack task`)
            this.defendMyselfGoal = this.tasks.push(this, tasks.attack, {
                targets: { [hazard.id]: hazard },
                useBow: true,
                useMelee: true,
                useMeleeWeapon: true,
            }, priorities.surviving + ((priorities.critical - priorities.surviving) / 2), false, null, false)
        } else {
            if ('targets' in this.defendMyselfGoal.args) {
                // console.log(`[Bot "${this.username}"] Add hazard`)
                this.defendMyselfGoal.args.targets[hazard.id] = hazard
            } else {
                throw new Error(`Invalid task for defending myself`)
            }
        }
    }

    /**
     * @private
     * @param {string} sender
     * @param {string} message
     * @param {ChatResponseHandler} response
     * @param {boolean} isWhispered
     */
    handleChat(sender, message, response, isWhispered) {
        if (sender === this.username) { return }

        message = message.trim()

        for (const handler of this.chatHandlers) {
            if (typeof handler.match === 'string') {
                if (handler.match === message) {
                    (/** @type {StringChatHandler} */ (handler)).command(sender, message, response, isWhispered)
                    return
                }
            } else if ('length' in handler.match) {
                if (handler.match.includes(message)) {
                    (/** @type {StringChatHandler} */ (handler)).command(sender, message, response, isWhispered)
                    return
                }
            } else {
                if (handler.match.exec(message)) {
                    (/** @type {RegexpChatHandler} */ (handler)).command(sender, handler.match.exec(message), response, isWhispered)
                    return
                }
            }
        }

        if (this.chatAwaits.length > 0) {
            const chatAwait = this.chatAwaits[0]
            if (chatAwait.onChat(sender, message) || chatAwait.done) {
                return
            }
        }

        {
            /**
             * @type {StringChatHandler | null}
             */
            let bestHandler = null
            let bestMatchSteps = Infinity
            /**
             * @type {string | null}
             */
            let bestMatch = null

            for (const handler of this.chatHandlers) {
                if (typeof handler.match === 'string') {
                    const match = levenshtein(handler.match, message)
                    if (match.steps < bestMatchSteps) {
                        bestMatchSteps = match.steps
                        bestMatch = handler.match
                        bestHandler = /** @type {StringChatHandler} */ (handler)
                    }
                } else if ('length' in handler.match) {
                    for (const _match of handler.match) {
                        const match = levenshtein(_match, message)
                        if (match.steps < bestMatchSteps) {
                            bestMatchSteps = match.steps
                            bestMatch = _match
                            bestHandler = /** @type {StringChatHandler} */ (handler)
                            break
                        }
                    }
                }
            }

            // console.log(`Best match:`, bestMatch, bestMatchSteps)
            if (bestMatchSteps <= 1) {
                this.askAsync(`Did you mean '${bestMatch}'?`, response.respond, sender, 10000)
                    .then(res => {
                        if (parseYesNoH(res.message)) {
                            bestHandler.command(sender, message, response, isWhispered)
                        }
                    })
                    .catch(error => console.warn(`[Bot "${this.username}"] Ask timed out: ${error}`))
            }
        }
    }

    //#region Basic Chat Interactions

    /**
     * @param {string} message
     * @param {(message: string) => void} send
     * @param {string} [player]
     * @param {number} [timeout]
     * @param {(message: string, sender: string) => 'finish' | 'consume' | 'ignore'} [matcher]
     * @returns {Promise<{ sender: string; message: string; }>}
     */
    async askAsync(message, send, player, timeout, matcher) {
        while (this.chatAwaits.length) {
            await taskUtils.sleep(100)
        }

        /** @type {{ sender: string; message: string; } | null} */
        let response = null
        let timeoutAt = timeout ? (performance.now() + timeout) : null

        /** @type {ChatAwait} */
        const chatAwait = {
            onChat: (/** @type {string} */ username, /** @type {string} */ message) => {
                if (player && username !== player) { return false }
                if (!player && username === this.username) { return false }
                if (matcher) {
                    const matchResult = matcher(message, username)
                    if (matchResult === 'consume' && timeoutAt) {
                        timeoutAt = performance.now() + timeout
                    }
                    if (matchResult !== 'finish') { return false }
                }
                response = {
                    message: message,
                    sender: username,
                }
                return true
            },
            done: false,
        }
        this.chatAwaits.push(chatAwait)

        send(message)

        while (true) {
            if (response) {
                chatAwait.done = true
                return response
            }
            if (timeoutAt && timeoutAt < performance.now()) {
                chatAwait.done = true
                throw TimeoutError.fromTime(timeout)
            }
            await taskUtils.sleep(100)
        }
    }

    //#endregion

    //#region Basic Actions

    /**
     * @param {'right' | 'left'} hand
     * @param {number} [time]
     */
    activateHand(hand, time = 0) {
        if (hand === 'right') {
            this.rightHand.isActivated = true
            this.rightHand.activatedTime = !time ? 0 : performance.now() + time
            this.bot.activateItem(false)
            return
        }

        if (hand === 'left') {
            this.leftHand.isActivated = true
            this.leftHand.activatedTime = !time ? 0 : performance.now() + time
            this.bot.activateItem(true)
            return
        }

        throw new Error(`Invalid hand "${hand}"`)
    }

    deactivateHand() {
        this.leftHand.isActivated = false
        this.leftHand.activatedTime = 0
        this.rightHand.isActivated = false
        this.rightHand.activatedTime = 0
        this.bot.deactivateItem()
    }

    /**
     * @param {import('prismarine-block').Block | import('prismarine-entity').Entity} chest
     * @returns {import('./task').Task<MineFlayer.Chest>}
     */
    *openChest(chest) {
        let isLocked = false
        const onActionBar = (/** @type {import('prismarine-chat').ChatMessage} */ msg) => {
            if (msg.translate !== 'container.isLocked') { return }
            this.bot.off('actionBar', onActionBar)
            isLocked = true
        }
        this.bot.on('actionBar', onActionBar)
        try {
            const openTask = taskUtils.wrap(this.bot.openChest(chest))
            while (true) {
                if (isLocked) {
                    const error = new Error(`The chest is locked`)
                    error.name = `ChestLocked`
                    openTask.throw(error)
                }
                const v = openTask.next()
                if (v.done) { return v.value }
                yield
            }
        } finally {
            this.bot.off('actionBar', onActionBar)
        }
    }

    /**
     * @param {import('prismarine-entity').Entity} vehicle
     * @returns {import('./task').Task<void>}
     */
    *mount(vehicle) {
        let isMounted = false
        const onMount = () => { isMounted = true }
        this.bot.once('mount', onMount)
        this.bot.mount(vehicle)
        const timeout = new Timeout(1000)
        while (true) {
            if (isMounted) { return }
            if (timeout.done()) {
                this.bot.off('mount', onMount)
                return
                // throw new GameError(`Could not mount the entity`)
            }
            yield
        }
    }

    //#endregion
}
