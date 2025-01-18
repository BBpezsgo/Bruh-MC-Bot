'use strict'

/// <reference types="./global.d.ts" />

//#region Packages

const fs = require('fs')
const MineFlayer = require('mineflayer')
const { Item } = require('prismarine-item')
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
const { EntityPose } = require('./entity-metadata')
const { filterOutEquipment, filterOutItems } = require('./utils/items')
const Vec3Dimension = require('./utils/vec3-dimension')
const { Vec3 } = require('vec3')
const Iterable = require('./utils/iterable')
const config = require('./config')
const Freq = require('./utils/freq')
const ItemLock = require('./locks/item-lock')
const CancelledError = require('./errors/cancelled-error')

//#endregion

const priorities = Object.freeze({
    critical: 300,
    surviving: 200,
    user: 100,
    otherBots: 50,
    cleanup: -1,
    low: -100,
    unnecessary: -200,
})

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
 *   } | null>;
 *   askPosition: (question: string, timeout: number, player?: string, detailProvider?: (question: string) => string) => Promise<{
 *     message: Vec3Dimension;
 *     sender: string;
 *   } | null>;
 *   ask: (question: string, timeout: number, player?: string, detailProvider?: (question: string) => string) => Promise<{
 *     message: string;
 *     sender: string;
 *   } | null>;
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

    /** @private @readonly @type {Interval} */ ensureEquipmentInterval
    /** @private @readonly @type {Interval} */ dumpTrashInterval
    /** @private @readonly @type {Interval} */ forceDumpTrashInterval
    /** @private @readonly @type {Interval} */ saveInterval
    /** @private @readonly @type {Interval} */ saveTasksInterval
    /** @private @readonly @type {Interval} */ trySleepInterval
    /** @private @readonly @type {Interval} */ checkQuietInterval
    /** @private @readonly @type {Interval} */ randomLookInterval
    /** @private @readonly @type {Interval} */ clearHandInterval
    /** @private @readonly @type {Interval} */ lookAtPlayerTimeout
    /** @private @readonly @type {Interval} */ moveAwayInterval
    /** @private @readonly @type {Interval} */ tryAutoHarvestInterval
    /** @private @readonly @type {Interval} */ tryRestoreCropsInterval
    /** @private @readonly @type {Interval} */ breedAnimalsInterval
    /** @private @readonly @type {Interval} */ loadCrossbowsInterval
    /** @private @readonly @type {Interval} */ giveBackItemsInterval

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
    /** @private @readonly @type {TaskManager} */
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

    /** @private @type {import('./managed-task')} */
    _runningTask
    /** @private @type {import('mineflayer-pathfinder').PartiallyComputedPath | null} */
    _currentPath
    /** @private @readonly @type {Readonly<BotConfig>} */
    _config
    /** @private @type {number} */
    _lookAtPlayer

    /** @readonly @type {import('mineflayer').Dimension} */ get dimension() { return this.bot.game.dimension }

    /** @readonly @type {string} */ get username() { return this.bot.username ?? this._config.bot.username }

    /** @private @type {boolean} */ _quietMode
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
            }
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
                    return response ? {
                        sender: response.sender,
                        message: parse(response.message),
                    } : null
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
                    if (res) {
                        return {
                            sender: res.sender,
                            message: parseLocationH(res.message),
                        }
                    }
                    return null
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

        this.randomLookInterval = new Interval(5000)
        this.lookAtPlayerTimeout = new Interval(3000)
        this.moveAwayInterval = new Interval(1000)
        this.clearHandInterval = new Interval(5000)
        this.giveBackItemsInterval = new Interval(5000)

        if (config.bot.behavior?.checkQuiet) this.checkQuietInterval = new Interval(500)
        if (config.bot.behavior?.loadCrossbows) this.loadCrossbowsInterval = new Interval(5000)
        if (config.bot.behavior?.dumpTrash) this.dumpTrashInterval = new Interval(5000)
        if (config.bot.behavior?.dumpTrash) this.forceDumpTrashInterval = new Interval(120000)
        if (config.bot.behavior?.sleep) this.trySleepInterval = new Interval(5000)

        if (config.bot.behavior?.ensureEquipment) this.ensureEquipmentInterval = new Interval(60000)
        if (config.bot.behavior?.harvest) this.tryAutoHarvestInterval = new Interval(60000)
        if (config.bot.behavior?.restoreCrops) this.tryRestoreCropsInterval = new Interval(60000)
        if (config.bot.behavior?.breedAnimals) this.breedAnimalsInterval = new Interval(60000)

        this.permissiveMovements = null
        this.restrictedMovements = null
        this.cutTreeMovements = null

        this.debug = new Debug(this, Boolean(config.debug))

        this.chatHandlers = this.setupChatHandlers()

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

                        if (bot.debug) {
                            bot.debug.drawLine(a, b, [1, 0, 0])
                            bot.debug.drawLine(bot.bot.entity.position, p, [1, 0, 1])
                        }

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

                    const shield = bot.searchInventoryItem(null, 'shield')
                    if (shield) {
                        if (!bot.holds(shield, true)) {
                            yield* bot.equip(shield, 'off-hand')
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

                        if (bot.debug) {
                            bot.debug.drawLine(a, b, [1, 0, 0])
                            bot.debug.drawLine(bot.bot.entity.position, p, [1, 0, 1])
                        }

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
            // @ts-ignore
            this.restrictedMovements = new mineflayerPathfinder.Movements(this.bot)
            // @ts-ignore
            this.cutTreeMovements = new mineflayerPathfinder.Movements(this.bot)

            this.mc.setPermissiveMovements(this.permissiveMovements)
            this.mc.setRestrictedMovements(this.restrictedMovements)
            this.mc.setRestrictedMovements(this.cutTreeMovements)
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

            const json = JSON.stringify(reason)

            if (json === '{"type":"compound","value":{"translate":{"type":"string","value":"disconnect.timeout"}}}') {
                console.error(`[Bot "${this.username}"] Kicked because I was AFK`)
                return
            }

            if (json === '{"type":"compound","value":{"translate":{"type":"string","value":"multiplayer.disconnect.kicked"}}}') {
                console.error(`[Bot "${this.username}"] Someone kicked me`)
                return
            }

            console.error(`[Bot "${this.username}"] Kicked:`, JSON.stringify(reason))
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
     * @returns {ReadonlyArray<ChatHandler>}
     */
    setupChatHandlers() {
        /**
         * @type {Array<ChatHandler>}
         */
        const handlers = []

        handlers.push(/** @type {StringChatHandler} */({
            match: 'pause',
            command: (sender, message, response, isWhispered) => {
                this.tasks.push(this, {
                    task: function*(bot, args) {
                        /** @type {Vec3} */
                        let found = null
                        bot.bot.findBlock({
                            matching: bot.mc.registry.blocksByName['lava'].id,
                            count: 1,
                            maxDistance: 32,
                            useExtraInfo: (block) => {
                                for (const lavaNeighborPosition of directBlockNeighbors(block.position, 'side')) {
                                    const lavaNeighbor = bot.bot.blockAt(lavaNeighborPosition)
                                    if (!lavaNeighbor || lavaNeighbor.name !== 'cobblestone') { continue }

                                    for (const cobblestoneNeighborPosition of directBlockNeighbors(lavaNeighbor.position, 'side')) {
                                        if (cobblestoneNeighborPosition.equals(block.position)) { continue }
                                        const cobblestoneNeighbor = bot.bot.blockAt(cobblestoneNeighborPosition)
                                        if (!cobblestoneNeighbor || cobblestoneNeighbor.name !== 'water') { continue }
                                        const waterLevel = cobblestoneNeighbor.getProperties()['level']
                                        if (!waterLevel) { continue }
                                        if (waterLevel !== 1) { continue }
                                        const blockBelowFlowingWater = bot.bot.blockAt(cobblestoneNeighborPosition.offset(0, -1, 0))
                                        if (!blockBelowFlowingWater) { continue }
                                        if (blockBelowFlowingWater.name !== 'water') { continue }
                                        if (found) {
                                            return false
                                        } else {
                                            found = lavaNeighborPosition
                                        }
                                    }
                                }
                                if (!found) { return false }
                                return true
                            },
                        })
                        console.log(found)








                        /**
                         * @typedef {{
                         *   DataVersion: number;
                         *   author?: string;
                         *   size: [number, number, number];
                         *   palette: Array<{
                         *     Name: string;
                         *     Properties?: Record<string, any>;
                         *   }>;
                         *   palettes?: Array<any>;
                         *   blocks: Array<{
                         *     pos: [number, number, number];
                         *     state: number;
                         *     nbt?: object;
                         *   }>;
                         *   entities: Array<{
                         *     pos: [number, number, number];
                         *     blockPos: [number, number, number];
                         *     nbt?: object;
                         *   }>;
                         * }} Structure
                         */

                        // const origin = new Vec3(-8, 4, 3)

                        // const buffer = require('fs').readFileSync('/home/BB/.minecraft/saves/1_20_4 Flat/generated/minecraft/structures/house.nbt')
                        // const nbt = yield* taskUtils.wrap(require('prismarine-nbt').parse(buffer))
                        // /** @type {Structure} */
                        // const structure = NBT2JSON(nbt.parsed)

                        // const blocks = structure.blocks.map(v => ({
                        //     position: new Vec3(v.pos[0] + origin.x, v.pos[1] + origin.y, v.pos[2] + origin.z),
                        //     name: structure.palette[v.state].Name.replace('minecraft:', ''),
                        //     properties: structure.palette[v.state].Properties,
                        //     nbt: v.nbt,
                        // }))

                        // yield* tasks.build.task(bot, { blocks: blocks })
                    },
                    id: 'test1',
                    humanReadableId: 'test1',
                }, {
                    response: response,
                }, priorities.user, true, sender, isWhispered)
                    ?.wait()
                    .then(() => response.respond(`K`))
                    .catch(error => error instanceof CancelledError || response.respond(error))
            },
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: 'test2',
            command: (sender, message, response, isWhispered) => {
                this.tasks.push(this, {
                    task: function*(bot, args) {
                        const fencings = yield* bot.env.scanFencings(bot)
                        const mobsToKill = []
                        for (const fencing of fencings) {
                            yield
                            /** @type {Record<string, Array<import('prismarine-entity').Entity>>} */
                            const entityTypes = {}
                            for (const entityId in fencing.mobs) {
                                const entity = fencing.mobs[entityId]
                                if (!entity || !entity.isValid) { continue }
                                entityTypes[entity.name] ??= []
                                entityTypes[entity.name].push(entity)
                            }
                            yield
                            for (const entityName in entityTypes) {
                                const entities = entityTypes[entityName]
                                if (entities.length < 5) { continue }
                                for (let i = 4; i < entities.length; i++) {
                                    yield
                                    mobsToKill.push(entities[i])
                                }
                            }
                        }
                        for (const mobToKill of mobsToKill) {
                            yield* tasks.kill.task(bot, {
                                entity: mobToKill,
                                ...taskUtils.runtimeArgs(args),
                            })
                        }
                        console.log(`[Bot "${bot.username}"] Mobs to kill`, mobsToKill)
                    },
                    id: 'test',
                    humanReadableId: 'test',
                }, {}, priorities.user, true)
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
                    items: this.getTrashItems()
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
                    items: this.inventoryItems().map(v => ({ item: v, count: v.count })).toArray(),
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
                            location = (yield* taskUtils.wrap(response.askPosition(`Where are you?`, 30000)))?.message
                            if (location) {
                                response.respond(`${location.x} ${location.y} ${location.z} in ${location.dimension} I got it`)
                            } else {
                                throw `I can't find you`
                            }
                        }
                        if (bot.dimension !== location.dimension) {
                            throw `We are in a different dimension`
                        }
                        const elytraItem = bot.searchInventoryItem(null, 'elytra')
                        if (!elytraItem) {
                            throw `I have no elytra`
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
                    canKill: false,
                    canUseChests: true,
                    canUseInventory: true,
                    canRequestFromPlayers: false,
                    canRequestFromBots: true,
                    canHarvestMobs: true,
                    force: false,
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
                                            .catch(error => error instanceof CancelledError || response.respond(error))
                                    }
                                },
                                id: `ask-if-${sender}-need-${result.count}-${stringifyItem(result.item)}`,
                                humanReadableId: `Asking ${sender} something`,
                            }, {
                                onNeedYesNo: response.askYesNo,
                            }, priorities.user, false, sender, isWhispered)
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
                            location = (yield* taskUtils.wrap(response.askPosition(`Where are you?`, 30000)))?.message
                            if (location) {
                                response.respond(`${location.x} ${location.y} ${location.z} in ${location.dimension} I got it`)
                            } else {
                                throw `I can't find you`
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
                        throw `I can't find you`
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
                    throw `Can't find ${sender}`
                }

                if (target.dimension &&
                    this.dimension !== target.dimension) {
                    throw `We are in a different dimension`
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
                    items: this.getTrashItems(),
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
                        .catch(reason => response.respond(reason))
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
                this.tasks.cancel()
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
                this.tasks.cancel()
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

        //#region Fall damage prevention
        if (this.bot.entity.velocity.y < Minecraft.general.fallDamageVelocity) {
            this.tasks.tick()
            this.tasks.push(this, tasks.mlg, {}, priorities.critical, false, null, false)
            return
        }
        //#endregion

        //#region Creeper
        {
            const explodingCreeper = this.env.getExplodingCreeper(this)

            if (explodingCreeper) {
                this.tasks.push(this, tasks.goto, {
                    flee: explodingCreeper,
                    distance: 8,
                    options: {
                        timeout: 300,
                        sprint: true,
                        retryCount: 10,
                    },
                }, priorities.critical, false, null, false)
                return
            }

            const creeper = this.bot.nearestEntity((entity) => entity.name === 'creeper')
            if (creeper && this.bot.entity.position.distanceTo(creeper.position) < 3) {
                this.tasks.push(this, tasks.goto, {
                    flee: creeper,
                    distance: 8,
                    options: {
                        timeout: 300,
                        sprint: true,
                    },
                }, priorities.critical - 1, false, null, false)
                return
            }
        }
        //#endregion

        //#region Fireball
        {
            this.bot.nearestEntity(e => {
                if (!e.velocity.x && !e.velocity.y && !e.velocity.z) { return false }

                if (e.name === 'fireball') {
                    const entityPosition = e.position.clone()
                    if ('time' in e) {
                        const deltaTime = (performance.now() - e.time) / 1000
                        entityPosition.add(e.velocity.scaled(deltaTime))
                    }
                    const directionToMe = this.bot.entity.position.clone().subtract(entityPosition).normalize()
                    const fireballDirection = e.velocity.clone().normalize()
                    const dot = fireballDirection.dot(directionToMe)
                    if (dot < 0) { return false }
                    const distance = this.bot.entity.position.offset(0, 1.6, 0).distanceTo(entityPosition)
                    if (distance > 5) { return false }
                    if (distance < 3) { return false }
                    const ghast = this.bot.nearestEntity(v => v.name === 'ghast')
                    if (ghast) {
                        const directionToGhast = ghast.position.clone().subtract(entityPosition)
                        const yaw = Math.atan2(-directionToGhast.x, -directionToGhast.z)
                        const groundDistance = Math.sqrt(directionToGhast.x * directionToGhast.x + directionToGhast.z * directionToGhast.z)
                        const pitch = Math.atan2(directionToGhast.y, groundDistance)
                        this.bot.look(yaw, pitch, true)
                    }
                    console.log(`[Bot "${this.bot.username}"] Attacking ${e.name ?? e.uuid ?? e.id}`)
                    this.bot.attack(e)
                    return true
                }

                if (e.name === 'small_fireball') {
                    const entityPosition = e.position.clone()
                    if ('time' in e) {
                        const deltaTime = (performance.now() - e.time) / 1000
                        entityPosition.add(e.velocity.scaled(deltaTime))
                    }
                    const directionToMe = this.bot.entity.position.clone().subtract(entityPosition).normalize()
                    const fireballDirection = e.velocity.clone().normalize()
                    const dot = fireballDirection.dot(directionToMe)
                    if (dot < 0) { return false }
                    const a = entityPosition.clone()
                    const b = this.bot.entity.position.clone().add(
                        fireballDirection.scaled(10)
                    )
                    this.debug.drawLine(a, b, [1, 0, 0], [1, 0.4, 0])
                    /**
                     * @param {Vec3} p
                     */
                    const d = (p) => Math.lineDistanceSquared(p, a, b)
                    this.tasks.push(this, {
                        task: tasks.goto.task,
                        id: `flee-from-${e.id}`,
                        humanReadableId: `Flee from small fireball`,
                    }, {
                        goal: {
                            heuristic: node => {
                                return -d(node.offset(0, 1, 0))
                            },
                            isEnd: node => {
                                return d(node.offset(0, 1, 0)) > 2
                            },
                        },
                        options: {
                            searchRadius: 5,
                            sprint: true,
                            timeout: 500,
                        },
                    }, priorities.critical - 1, false, null, false)
                    return true
                }

                return false
            })
        }
        //#endregion

        //#region Fire & Lava
        {
            for (const blockAt of this.touchingBlocks()) {
                if (this.bot.entity.metadata[0] & 0x01 &&
                    blockAt.name !== 'lava') {
                    this.tasks.push(this, {
                        task: function*(bot, args) {
                            const waterBucketItem = bot.searchInventoryItem(null, 'water_bucket')
                            if (waterBucketItem) {
                                let refBlock = bot.bot.blockAt(bot.bot.entity.position)
                                if (refBlock.name === 'fire') {
                                    yield* bot.dig(refBlock, 'ignore', false)
                                    yield
                                }
                                refBlock = bot.bot.blockAt(bot.bot.entity.position)
                                if (refBlock.name === 'air') {
                                    yield* taskUtils.wrap(bot.bot.lookAt(refBlock.position.offset(0.5, 0.1, 0.5), bot.instantLook), args.interrupt)
                                    yield* taskUtils.wrap(bot.bot.equip(waterBucketItem, 'hand'), args.interrupt)
                                    bot.bot.activateItem(false)
                                    while (bot.bot.entity.metadata[0] & 0x01) {
                                        yield
                                    }
                                    const bucketItem = bot.searchInventoryItem(null, 'bucket')
                                    if (bucketItem) {
                                        const water = bot.findBlocks({
                                            matching: 'water',
                                            count: 1,
                                            force: true,
                                            maxDistance: 2,
                                        }).filter(Boolean).first()
                                        if (water) {
                                            yield* taskUtils.wrap(bot.bot.equip(bucketItem, 'hand'), args.interrupt)
                                            yield* taskUtils.wrap(bot.bot.lookAt(water.position.offset(0.5, 0.1, 0.5), bot.instantLook), args.interrupt)
                                            bot.bot.activateItem(false)
                                        }
                                    }
                                    return
                                }
                            }

                            const water = bot.bot.findBlock({
                                matching: bot.mc.registry.blocksByName['water'].id,
                                count: 1,
                                maxDistance: config.criticalSurviving.waterSearchRadius,
                            })
                            if (water) {
                                yield* tasks.goto.task(bot, {
                                    point: water.position,
                                    distance: 0,
                                    options: {
                                        sprint: true,
                                    },
                                    ...taskUtils.runtimeArgs(args),
                                })
                            }
                        },
                        id: `extinguish-myself`,
                        humanReadableId: `Extinguish myself`,
                    }, {}, priorities.critical - 4, false, null, false)
                    break
                }

                if (blockAt.name === 'fire') {
                    this.tasks.push(this, {
                        task: function*(bot) {
                            yield* bot.dig(blockAt, 'ignore', false)
                        },
                        id: `extinguish-myself`,
                        humanReadableId: `Extinguish myself`,
                    }, {}, priorities.critical - 3, false, null, false)
                    break
                }

                if (blockAt.name === 'campfire') {
                    this.tasks.push(this, {
                        task: tasks.goto.task,
                        id: `get-out-campfire`,
                        humanReadableId: `Extinguish myself`,
                    }, {
                        flee: blockAt.position,
                        distance: 2,
                    }, priorities.critical - 3, false, null, false)
                    break
                }
            }
        }
        //#endregion

        //#region Quiet
        if (this.checkQuietInterval?.done()) {
            let shouldBeQuiet = false

            if (!shouldBeQuiet && this.bot.findBlock({
                matching: this.mc.registry.blocksByName['sculk_sensor'].id,
                maxDistance: 8,
                count: 1,
                point: this.bot.entity.position,
                useExtraInfo: false,
            })) { shouldBeQuiet = true }

            if (!shouldBeQuiet && this.bot.findBlock({
                matching: this.mc.registry.blocksByName['calibrated_sculk_sensor'].id,
                maxDistance: 16,
                count: 1,
                point: this.bot.entity.position,
                useExtraInfo: false,
            })) { shouldBeQuiet = true }

            if (!shouldBeQuiet && this.bot.nearestEntity(entity => {
                if (entity.name !== 'warden') { return false }
                const distance = entity.position.distanceTo(this.bot.entity.position)
                if (distance > 16) { return false }
                return true
            })) { shouldBeQuiet = true }

            this.checkQuietInterval.time = shouldBeQuiet ? 5000 : 500

            if (this.tasks.isIdle) {
                if (!shouldBeQuiet && this.bot.controlState.sneak) {
                    this.bot.setControlState('sneak', false)
                } else if (shouldBeQuiet && !this.bot.controlState.sneak) {
                    this.bot.setControlState('sneak', true)
                }
            }

            this.permissiveMovements.sneak = shouldBeQuiet
            this.restrictedMovements.sneak = shouldBeQuiet
            this.cutTreeMovements.sneak = shouldBeQuiet
            this._quietMode = shouldBeQuiet
        }
        //#endregion

        //#region Bad effects (have to drink milk)
        {
            const badEffects = this.mc.registry.effectsArray.filter(v => v.type === 'bad').map(v => v.id)

            if (Object.keys(this.bot.entity.effects).length > 0) {
                for (const badEffect of badEffects) {
                    if (this.bot.entity.effects[badEffect]) {
                        const milk = this.searchInventoryItem(null, 'milk_bucket')
                        if (milk) {
                            this.tasks.push(this, {
                                task: function*(bot, args) {
                                    const milk = bot.searchInventoryItem(null, 'milk_bucket')
                                    if (!milk) { throw `I have no milk` }
                                    yield* taskUtils.wrap(bot.bot.equip(milk, 'hand'), args.interrupt)
                                    yield* taskUtils.wrap(bot.bot.consume(), args.interrupt)
                                },
                                id: 'consume-milk',
                            }, {}, priorities.critical - 5, false, null, false)
                        }
                    }
                }
            }
        }
        //#endregion

        if (this._runningTask && this._runningTask.priority >= priorities.critical) {
            return
        }

        //#region Hostile mobs
        {
            const hostile = this.bot.nearestEntity(v => {
                if (v.metadata[2]) { // Has custom name
                    // console.log(`"${v.name}": Has custom name`)
                    return false
                }
                if (v.metadata[6] === EntityPose.DYING) {
                    // console.log(`"${v.name}": Dying`)
                    return false
                }

                if (this.defendMyselfGoal &&
                    !this.defendMyselfGoal.isDone &&
                    this.tasks.get(this.defendMyselfGoal.id) &&
                    'targets' in this.defendMyselfGoal.args &&
                    this.defendMyselfGoal.args.targets[v.id]) {
                    // console.log(`"${v.name}": Already attacking`)
                    return false
                }

                const _hostile = Minecraft.hostiles[v.name]
                if (!_hostile) {
                    // console.log(`"${v.name}": Not hostile`)
                    return false
                }

                if (!_hostile.alwaysAngry) {
                    if (v.name === 'enderman') {
                        // Isn't screaming
                        if (!v.metadata[17]) {
                            // console.log(`"${v.name}": Not screaming`)
                            return false
                        }
                    } else if (!(v.metadata[15] & 0x04)) { // Not aggressive
                        // console.log(`"${v.name}": Not aggressive`)
                        // console.log(v.name)
                        return false
                    }
                }

                if ((typeof v.metadata[15] === 'number') &&
                    (v.metadata[15] & 0x01)) { // Has no AI
                    // console.log(`"${v.name}": No AI`)
                    return false
                }

                const distance = v.position.distanceTo(this.bot.entity.position)

                if (distance > _hostile.rangeOfSight) {
                    // console.log(`${distance.toFixed(2)} > ${_hostile.rangeOfSight.toFixed(2)}`)
                    return false
                }

                const raycast = this.bot.world.raycast(
                    this.bot.entity.position.offset(0, 1.6, 0),
                    v.position.clone().subtract(this.bot.entity.position).normalize(),
                    distance + 2,
                    block => { return !block.transparent })
                if (raycast) {
                    // console.log(`Can't see`)
                    return false
                }

                return true
            })

            if (hostile) {
                this.defendAgainst(hostile)
            }
        }
        //#endregion

        //#region Lava & Water
        if (!this.bot.pathfinder.path?.length) {
            if (this.bot.blocks.at(this.bot.entity.position.offset(0, 1, 0))?.name === 'lava' ||
                this.bot.blocks.at(this.bot.entity.position.offset(0, 0, 0))?.name === 'lava') {
                this.tasks.push(this, {
                    task: function(bot, args) {
                        return tasks.goto.task(bot, {
                            goal: {
                                isEnd: (node) => {
                                    const blockGround = bot.bot.blocks.at(node.offset(0, -1, 0))
                                    const blockFoot = bot.bot.blocks.at(node)
                                    const blockHead = bot.bot.blocks.at(node.offset(0, 1, 0))
                                    if (blockFoot.name !== 'lava' &&
                                        blockHead.name !== 'lava' &&
                                        blockGround.name !== 'air' &&
                                        blockGround.name !== 'lava') {
                                        return true
                                    }
                                    return false
                                },
                                heuristic: (node) => {
                                    const dx = bot.bot.entity.position.x - node.x
                                    const dy = bot.bot.entity.position.y - node.y
                                    const dz = bot.bot.entity.position.z - node.z
                                    return Math.sqrt(dx * dx + dz * dz) + Math.abs(dy)
                                },
                            },
                            options: {
                                searchRadius: 20,
                                timeout: 1000,
                            },
                            ...taskUtils.runtimeArgs(args),
                        })
                    },
                    id: `get-out-lava`,
                    humanReadableId: `Getting out of lava`,
                }, {}, priorities.surviving + ((priorities.critical - priorities.surviving) / 2) + 2, false, null, false)
            } else if (this.bot.oxygenLevel < 20 &&
                (this.bot.blocks.at(this.bot.entity.position.offset(0, 1, 0))?.name === 'water' ||
                 this.bot.blocks.at(this.bot.entity.position.offset(0, 0, 0))?.name === 'water')) {
                this.tasks.push(this, {
                    task: function(bot, args) {
                        return tasks.goto.task(bot, {
                            goal: {
                                isEnd: (node) => {
                                    const blockGround = bot.bot.blocks.at(node.offset(0, -1, 0))
                                    const blockFoot = bot.bot.blocks.at(node)
                                    const blockHead = bot.bot.blocks.at(node.offset(0, 1, 0))
                                    if (blockFoot.name !== 'water' &&
                                        blockHead.name !== 'water' &&
                                        blockGround.name !== 'air' &&
                                        blockGround.name !== 'water') {
                                        return true
                                    }
                                    return false
                                },
                                heuristic: (node) => {
                                    const dx = bot.bot.entity.position.x - node.x
                                    const dy = bot.bot.entity.position.y - node.y
                                    const dz = bot.bot.entity.position.z - node.z
                                    return Math.sqrt(dx * dx + dz * dz) + Math.abs(dy)
                                },
                            },
                            options: {
                                searchRadius: 20,
                            },
                            ...taskUtils.runtimeArgs(args),
                        })
                    },
                    id: `get-out-water`,
                    humanReadableId: `Getting out of water`,
                }, {}, this.bot.oxygenLevel < 20 ? priorities.surviving + 1 : priorities.low, false, null, false)

                if (this.bot.pathfinder.path.length === 0) {
                    if (this.bot.blocks.at(this.bot.entity.position.offset(0, 0.5, 0))?.name === 'water') {
                        this.bot.setControlState('jump', true)
                    } else if (this.bot.controlState['jump']) {
                        this.bot.setControlState('jump', false)
                    }
                }
            } else {
                /**
                 * @param {Vec3} point
                 */
                const danger = (point) => {
                    let res = 0
                    if (this.bot.blocks.at(point.offset(0, 0, 0))?.name === 'lava') res++
                    if (this.bot.blocks.at(point.offset(1, 0, 0))?.name === 'lava') res++
                    if (this.bot.blocks.at(point.offset(0, 0, 1))?.name === 'lava') res++
                    if (this.bot.blocks.at(point.offset(0, 0, -1))?.name === 'lava') res++
                    if (this.bot.blocks.at(point.offset(-1, 0, 0))?.name === 'lava') res++
                    if (this.bot.blocks.at(point.offset(0, 1, 0))?.name === 'lava') res++
                    if (this.bot.blocks.at(point.offset(1, 1, 0))?.name === 'lava') res++
                    if (this.bot.blocks.at(point.offset(0, 1, 1))?.name === 'lava') res++
                    if (this.bot.blocks.at(point.offset(0, 1, -1))?.name === 'lava') res++
                    if (this.bot.blocks.at(point.offset(-1, 1, 0))?.name === 'lava') res++
                    if (this.bot.blocks.at(point.offset(0, -1, 0))?.name === 'lava') res++
                    if (this.bot.blocks.at(point.offset(1, -1, 0))?.name === 'lava') res++
                    if (this.bot.blocks.at(point.offset(0, -1, 1))?.name === 'lava') res++
                    if (this.bot.blocks.at(point.offset(0, -1, -1))?.name === 'lava') res++
                    if (this.bot.blocks.at(point.offset(-1, -1, 0))?.name === 'lava') res++
                    return res
                }
                if (danger(this.bot.entity.position.floored())) {
                    this.tasks.push(this, {
                        task: tasks.goto.task,
                        id: 'get-away-from-lava',
                        humanReadableId: 'Getting away from lava',
                    }, {
                        goal: {
                            heuristic: (node) => {
                                return 16 - danger(node)
                            },
                            isEnd: (node) => {
                                return danger(node) === 0
                            },
                        },
                        options: {
                            searchRadius: 20,
                            timeout: 1000,
                        },
                    }, priorities.surviving - 50, false, null, false)
                }
            }
        }
        //#endregion

        //#region Eating
        if (this.bot.food < 18 && tasks.eat.can(this, { includeLocked: this.bot.food === 0 })) {
            this.tasks.push(this, tasks.eat, {
                sortBy: 'foodPoints',
                includeLocked: this.bot.food === 0,
            }, priorities.surviving, false, null, false)
            return
        }
        //#endregion

        //#region Someone attacking me!
        {
            const now = performance.now()
            for (const _by of Object.keys(this.memory.hurtBy)) {
                const entityId = Number(_by)
                const by = this.memory.hurtBy[entityId]

                for (let i = by.times.length - 1; i >= 0; i--) {
                    if (now - by.times[i] > config.hurtByMemory) {
                        by.times.splice(i, 1)
                    }
                }

                if (by.times.length === 0 || !by.entity || !by.entity.isValid) {
                    delete this.memory.hurtBy[entityId]
                    continue
                }

                const player = by.entity.type === 'player'
                    ? Object.values(this.bot.players).find(v => v && v.entity && Number(v.entity.id) === Number(by.entity.id))
                    : null

                if (player && (
                    player.gamemode === 1 ||
                    player.gamemode === 3 ||
                    bots[player.username]
                )) {
                    console.warn(`[Bot "${this.username}"] Can't attack ${by.entity.name}`)
                    delete this.memory.hurtBy[entityId]
                    continue
                }

                if (by.entity.type === 'hostile' || by.entity.type === 'mob') {
                    this.defendAgainst(by.entity)
                    continue
                }

                if (player && Math.entityDistance(this.bot.entity.position.offset(0, 1.6, 0), by.entity) < 4) {
                    console.log(`[Bot "${this.bot.username}"] Attacking ${by.entity.name ?? by.entity.uuid ?? by.entity.id}`)
                    this.bot.attack(by.entity)
                    delete this.memory.hurtBy[entityId]
                }
            }
        }
        //#endregion

        if (this.defendMyselfGoal &&
            !this.defendMyselfGoal.isDone) {
            return
        }

        for (const request of this.env.itemRequests) {
            if (request.lock.by === this.username) { continue }
            if (request.status) { continue }
            if (!this.lockedItems.some(v => v === request.lock)) { continue }
            if (!this.inventoryItemCount(null, request.lock.item)) { continue }
            this.tasks.push(this, {
                task: function*(bot, args) {
                    if (request.status) {
                        console.log(`[Bot "${bot.username}"] Someone else already serving \"${request.lock.by}\" ...`)
                        return
                    }
                    console.log(`[Bot "${bot.username}"] Serving \"${request.lock.by}\" with ${stringifyItem(request.lock.item)} ...`)
                    yield* tasks.giveTo.task(bot, args)
                    console.log(`[Bot "${bot.username}"] \"${request.lock.by}\" served with ${stringifyItem(request.lock.item)}`)
                },
                id: `serve-${request.lock.by}-${stringifyItem(request.lock.item)}-${request.lock.count}`,
                humanReadableId: `Serving ${request.lock.by}`,
            }, {
                request: request,
                waitUntilTargetPickedUp: true,
            }, request.priority ?? priorities.otherBots, false, null, false)
                ?.wait()
                .catch(reason => {
                    console.error(`[Bot "${this.username}"] Failed to serve \"${request.lock.by}\" with ${stringifyItem(request.lock.item)}:`, reason)
                    request.status = 'failed'
                    request.lock.unlock()
                })
        }

        if (this.trySleepInterval?.done() &&
            tasks.sleep.can(this)) {
            this.tasks.push(this, tasks.sleep, {}, priorities.low - 2, false, null, false)
        }

        if (this.tasks.timeSinceImportantTask > 10000 || this.isFollowingButNotMoving) {
            this.doSimpleBoredomTasks()
        }

        if (this.tasks.timeSinceImportantTask > 10000) {
            this.doBoredomTasks()
        }

        this.doNothing()
    }

    get isFollowingButNotMoving() {
        return (
            this._runningTask &&
            this._runningTask.id.startsWith('follow') &&
            !this.bot.pathfinder.goal
        )
    }

    doSimpleBoredomTasks() {
        if (this.loadCrossbowsInterval?.done()) {
            this.tasks.push(this, {
                task: function*(bot, args) {
                    const crossbows =
                        bot.inventoryItems(null)
                            .filter(v => v.name === 'crossbow')
                            .toArray()
                    // console.log(`[Bot "${bot.username}"] Loading ${crossbows.length} crossbows`)
                    for (const crossbow of crossbows) {
                        if (!tasks.attack.isCrossbowCharged(crossbow) &&
                            bot.searchInventoryItem(null, 'arrow')) {
                            const weapon = tasks.attack.resolveRangeWeapon(crossbow)
                            yield* taskUtils.wrap(bot.bot.equip(crossbow, 'hand'), args.interrupt)
                            bot.activateHand('right')
                            yield* taskUtils.sleepG(Math.max(100, weapon.chargeTime))
                            bot.deactivateHand()
                        }
                    }
                },
                id: 'load-crossbow',
            }, {
                silent: true,
            }, priorities.low, false, null, false)
        }

        if (this.tasks.isIdle && this.memory.mlgJunkBlocks.length > 0) {
            this.tasks.push(this, tasks.clearMlgJunk, {}, priorities.cleanup, false, null, false)
            return
        }

        if (this.memory.myArrows.length > 0) {
            this.tasks.push(this, {
                task: function*(bot, args) {
                    const myArrow = bot.memory.myArrows.shift()
                    if (!myArrow) {
                        return
                    }
                    const entity = bot.bot.nearestEntity((/** @type {import('prismarine-entity').Entity} */ v) => v.id === myArrow)
                    if (!entity) {
                        console.warn(`[Bot "${bot.username}"] Can't find the arrow`)
                        return
                    }
                    yield* tasks.goto.task(bot, {
                        point: entity.position,
                        distance: 1,
                        ...taskUtils.runtimeArgs(args),
                    })
                    yield* taskUtils.sleepG(1000)
                    if (entity.isValid) {
                        console.warn(`[Bot "${bot.username}"] Can't pick up this arrow`)
                    } else {
                        console.log(`[Bot "${bot.username}"] Arrow picked up`)
                    }
                },
                id: `pickup-my-arrows`,
                humanReadableId: `Picking up my arrows`,
            }, {}, priorities.cleanup, false, null, false)
        }

        {
            /** @type {import('./managed-task').TaskArgs<import('./tasks/pickup-item')>} */
            const options = {
                inAir: false,
                maxDistance: config.boredom.pickupItemRadius,
                minLifetime: config.boredom.pickupItemMinAge,
                pathfinderOptions: {
                    savePathError: true,
                },
            }
            if (tasks.pickupItem.can(this, options)) {
                this.tasks.push(this, tasks.pickupItem, options, priorities.low, false, null, false)
            }
        }

        {
            /** @type {import('./managed-task').TaskArgs<import('./tasks/pickup-xp')>} */
            const options = {
                maxDistance: config.boredom.pickupXpRadius,
            }
            if (tasks.pickupXp.getClosestXp(this, options)) {
                this.tasks.push(this, tasks.pickupXp, options, priorities.low, false, null, false)
            }
        }

        if (this.giveBackItemsInterval?.done() && this.memory.playerDeathLoots.length > 0) {
            const playerDeath = this.memory.playerDeathLoots[0]
            for (let i = 0; i < playerDeath.items.length; i++) {
                if (playerDeath.items[i].count <= 0 || playerDeath.items[i].isUnlocked) {
                    playerDeath.items.splice(i, 1)
                    i--
                }
            }
            if (playerDeath.items.length === 0) {
                this.memory.playerDeathLoots.shift()
            } else {
                this.tasks.push(this, tasks.giveTo, {
                    player: playerDeath.username,
                    items: playerDeath.items,
                }, priorities.low - 1, false, null, false)
                    ?.wait()
                    .catch(error => {
                        // TODO: better way of handling this
                        if (error === `Don't have anything`) {
                            playerDeath.items.forEach(v => v.unlock())
                        }
                    })
            }
        }
    }

    doBoredomTasks() {
        if (this.tasks.isIdle && this.tryAutoHarvestInterval?.done()) {
            this.tasks.push(this, {
                task: BruhBot.tryHarvestCrops,
                id: `harvest-crops`,
                humanReadableId: 'Harvest crops',
            }, {}, priorities.unnecessary, false, null, false)
        }

        if (this.tasks.isIdle && this.tryRestoreCropsInterval?.done()) {
            this.tasks.push(this, {
                task: BruhBot.tryRestoreCrops,
                id: `check-crops`,
                humanReadableId: `Checking crops`,
            }, {}, priorities.unnecessary, false, null, false)
        }

        if (this.tasks.isIdle && this.breedAnimalsInterval?.done()) {
            this.tasks.push(this, {
                task: BruhBot.breedAnimals,
                id: `breed-animals`,
                humanReadableId: `Breed animals`,
            }, {}, priorities.unnecessary, false, null, false)
        }

        if (this.tasks.isIdle && this.dumpTrashInterval?.done()) {
            const freeSlots = this.inventorySlots().filter(v => !this.bot.inventory.slots[v]).toArray()
            if (freeSlots.length < 10 || this.forceDumpTrashInterval?.done()) {
                const trashItems = this.getTrashItems()
                this.tasks.push(this, {
                    task: tasks.dumpToChest.task,
                    id: 'dump-trash',
                    humanReadableId: 'Dump trash',
                }, {
                    items: trashItems,
                }, priorities.unnecessary, false, null, false)
                    ?.wait()
                    .then(dumped => {
                        if (dumped.isEmpty) return
                        console.log(`Dumped ${dumped.keys.map(v => `${dumped.get(v)} ${stringifyItem(v)}`).join(', ')}`)
                    })
                    .catch(() => { })
            }
        }

        if (this.tasks.isIdle && this.ensureEquipmentInterval?.done()) {
            this.tasks.push(this, {
                task: BruhBot.ensureEquipment,
                id: 'ensure-equipment',
                humanReadableId: 'Ensure equipment',
            }, {
                explicit: false,
            }, priorities.unnecessary, false, null, false)
        }
    }

    doNothing() {
        if (this.tasks.timeSinceImportantTask > 10000 &&
            this.tasks.isIdleOrThinking &&
            this.memory.idlePosition &&
            this.dimension === this.memory.idlePosition.dimension &&
            this.bot.entity.position.distanceTo(this.memory.idlePosition.xyz(this.dimension)) > 10) {
            this.tasks.push(this, {
                task: tasks.goto.task,
                id: `goto-idle-position`,
                humanReadableId: `Goto idle position`,
            }, {
                point: this.memory.idlePosition,
                distance: 4,
                options: {
                    sprint: false,
                },
            }, -999, false, null, false)
        }

        if (this.tasks.isIdleOrThinking || this.isFollowingButNotMoving) {
            if (this.moveAwayInterval?.done()) {
                for (const playerName in this.bot.players) {
                    if (playerName === this.username) { continue }
                    const playerEntity = this.bot.players[playerName].entity
                    if (!playerEntity) { continue }
                    if (this.bot.entity.position.distanceTo(playerEntity.position) < 1) {
                        this.tasks.push(this, {
                            task: tasks.move.task,
                            id: `move-away-${playerName}`,
                            humanReadableId: `Move away from ${playerName}`,
                        }, {
                            goal: {
                                distance: this.bot.movement.heuristic.new('distance'),
                                danger: this.bot.movement.heuristic.new('danger')
                                    .weight(5),
                                proximity: this.bot.movement.heuristic.new('proximity'),
                            },
                            freemotion: true,
                            update: (goal) => {
                                goal.proximity
                                    .target(playerEntity.position)
                                    .avoid(true)
                            },
                            isDone: () => this.bot.entity.position.distanceSquared(playerEntity.position) > 1,
                        }, this._runningTask ? this._runningTask.priority + 1 : priorities.unnecessary, false, null, false)
                        return
                    }
                }
            }

            if ((!this.tasks.isIdleOrThinking || this.tasks.timeSinceImportantTask > 1000) && this.lookAtNearestPlayer()) {
                this.randomLookInterval?.restart()
                return
            }

            if ((!this.tasks.isIdle || this.tasks.timeSinceImportantTask > 1000) && this.randomLookInterval?.done()) {
                this.lookRandomly()
                return
            }

            if ((!this.tasks.isIdleOrThinking || this.tasks.timeSinceImportantTask > 1000) && this.bot.heldItem && this.clearHandInterval?.done()) {
                this.tryUnequip()
                    .then(v => v ? console.log(`[Bot "${this.username}"] Hand cleared`) : console.log(`[Bot "${this.username}"] Failed to clear hand`))
                    .catch(v => console.error(`[Bot "${this.username}"]`, v))
                return
            }
        }
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
                .filter(v => !bot.isItemLocked(v.name))
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
            canKill: false,
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
                        if (!String(error).startsWith(`Can't gather `)) console.error(`[Bot "${bot.username}"]`, error)
                    }
                    break
                }
                case 'single': {
                    try {
                        if (bot.inventoryItemCount(null, item.item) > 0) { break }
                        // console.log(`[Bot "${bot.username}"]`, item.type, item)
                        const res = yield* tasks.gatherItem.task(bot, {
                            item: item.item,
                            count: item.count === 'any' ? 1 : item.count,
                            ...permissions,
                            ...taskUtils.runtimeArgs(args),
                        })
                        // console.log(`[Bot "${bot.username}"] Equipment ${item.item} gathered`, res)
                    } catch (error) {
                        if (!String(error).startsWith(`Can't gather `)) console.error(`[Bot "${bot.username}"]`, error)
                    }
                    break
                }
                case 'any': {
                    if (item.item.find(v => bot.inventoryItemCount(null, v) > 0)) { break }
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
                        if (!String(error).startsWith(`Can't gather `)) console.error(`[Bot "${bot.username}"]`, error)
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
                        if (!String(error).startsWith(`Can't gather `)) console.error(`[Bot "${bot.username}"]`, error)
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

        for (const crop of bot.env.crops.filter(v => v.position.dimension === bot.dimension && v.block !== 'brown_mushroom' && v.block !== 'red_mushroom')) {
            yield
            const blockAt = bot.bot.blocks.at(crop.position.xyz(bot.dimension))
            if (!blockAt) { continue }
            if (blockAt.name !== 'air') { continue }
            return 0
        }

        try {
            yield* tasks.compost.task(bot, {
                ...taskUtils.runtimeArgs(args),
            })
        } catch (error) {
            console.warn(`[Bot "${bot.username}"]`, error)
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

        const blocks = bot.findBlocks({
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
     */
    lookAtNearestPlayer() {
        const selfEye = (this.bot.entity.metadata[6] === 5)
            ? this.bot.entity.position.offset(0, 1.2, 0)
            : this.bot.entity.position.offset(0, 1.6, 0)

        const players = Object.values(this.bot.players)
            .filter(v => v.username !== this.username)
            .filter(v => !bots[v.username])
            .filter(v => v.entity)
            .filter(v => v.entity.position.distanceTo(this.bot.entity.position) < 5)
            .filter(v => {
                const playerEye = (v.entity.metadata[6] === 5)
                    ? v.entity.position.offset(0, 1.2, 0)
                    : v.entity.position.offset(0, 1.6, 0)

                const dirToSelf = selfEye.clone().subtract(playerEye).normalize()
                const playerDir = Math.rotationToVectorRad(v.entity.pitch, v.entity.yaw)
                return dirToSelf.dot(playerDir) > 0.9
            })

        if (players.length === 0) { return false }

        if (this.lookAtPlayerTimeout.done()) {
            this.lookAtPlayerTimeout.restart()
            this._lookAtPlayer++
        }

        while (this._lookAtPlayer < 0) {
            this.lookAtPlayerTimeout.restart()
            this._lookAtPlayer += players.length
        }

        while (this._lookAtPlayer >= players.length) {
            this.lookAtPlayerTimeout.restart()
            this._lookAtPlayer -= players.length
        }

        const selected = players[this._lookAtPlayer]

        if (!selected?.entity) { return false }

        const playerEye = (selected.entity.metadata[6] === 5)
            ? selected.entity.position.offset(0, 1.2, 0)
            : selected.entity.position.offset(0, 1.6, 0)

        this.bot.lookAt(playerEye, false)
        return true
    }

    /**
     * @private
     */
    lookRandomly() {
        const pitch = Math.randomInt(-40, 30)
        const yaw = Math.randomInt(-180, 180)
        return this.bot.look(yaw * Math.deg2rad, pitch * Math.deg2rad, false)
    }

    /**
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
                return null
            }
            await taskUtils.sleep(100)
        }
    }

    //#endregion

    //#region Items & Inventory

    async tryUnequip() {
        const QUICK_BAR_COUNT = 9
        const QUICK_BAR_START = 36

        for (let i = 0; i < QUICK_BAR_COUNT; ++i) {
            if (!this.bot.inventory.slots[QUICK_BAR_START + i]) {
                this.bot.setQuickBarSlot(i)
                return true
            }
        }

        const slot = this.bot.inventory.firstEmptyInventorySlot()
        if (!slot) {
            return false
        }

        const equipSlot = QUICK_BAR_START + this.bot.quickBarSlot
        await this.bot.clickWindow(equipSlot, 0, 0)
        await this.bot.clickWindow(slot, 0, 0)
        if (this.bot.inventory.selectedItem) {
            await this.bot.clickWindow(equipSlot, 0, 0)
            return false
        }
        return true
    }

    /**
     * @param {import('./utils/other').ItemId} item
     * @param {MineFlayer.EquipmentDestination} destination
     */
    *equip(item, destination = 'hand') {
        const _item = (typeof item === 'object' && 'slot' in item) ? item : this.searchInventoryItem(null, item)
        if (!_item) { throw `Item ${stringifyItemH(item)} not found to equip` }

        const sourceSlot = _item.slot
        const destSlot = this.bot.getEquipmentDestSlot(destination)

        if (sourceSlot === destSlot) {
            return this.bot.inventory.slots[destSlot]
        }

        yield* taskUtils.wrap(this.bot.equip(_item, destination))
        yield* taskUtils.sleepTicks()
        return this.bot.inventory.slots[destSlot]
    }

    /**
     * @returns {Array<{ item: import('./utils/other').ItemId; count: number; }>}
     */
    getTrashItems() {
        const locked = this.lockedItems
            .filter(v => !v.isUnlocked)
            .map(v => ({ ...v }))

        let result = this.inventoryItems()
            .toArray()
            .map(v => /** @type {{item: import('./utils/other').ItemId; count: number;}} */({ item: v, count: v.count }))
        result = filterOutEquipment(result, this.mc.registry)
        result = filterOutItems(result, locked)
        return result
    }

    /**
     * @param {string} by
     * @param {import('./utils/other').ItemId} item
     * @param {number} count
     * @returns {import('./locks/item-lock')}
     */
    forceLockItem(by, item, count) {
        if (!count) { return null }
        const lock = new ItemLock(by, item, Math.min(count, count))
        this.lockedItems.push(lock)
        // console.log(`[Bot "${this.username}"] Item forcefully ${stringifyItem(item)} locked by ${by}`)
        return lock
    }

    /**
     * @param {string} by
     * @param {import('./utils/other').ItemId} item
     * @param {number} count
     * @returns {import('./locks/item-lock') | null}
     */
    tryLockItem(by, item, count) {
        if (!count) { return null }
        const trash = this.getTrashItems().filter(v => isItemEquals(v.item, item))
        if (trash.length === 0) { return null }
        let have = 0
        for (const trashItem of trash) { have += trashItem.count }
        const lock = new ItemLock(by, item, Math.min(count, have))
        this.lockedItems.push(lock)
        // console.log(`[Bot "${this.username}"] Item ${stringifyItem(item)} locked by ${by}`)
        return lock
    }

    /**
     * @param {import('prismarine-windows').Window | null} window
     * @param {ReadonlyArray<import('./utils/other').ItemId>} items
     * @returns {Item | null}
     */
    searchInventoryItem(window, ...items) {
        return this.inventoryItems(window).filter(v => {
            for (const searchFor of items) {
                if (!isItemEquals(v, searchFor)) continue
                return true
            }
            return false
        }).first() ?? null
    }

    /**
     * @param {import('./utils/other').ItemId} item
     */
    isItemLocked(item) {
        let n = 0
        for (const lock of this.lockedItems) {
            if (!isItemEquals(lock.item, item)) continue
            if (lock.isUnlocked) continue
            n += lock.count
        }
        return n
    }

    /**
     * @param {import('prismarine-windows').Window} [window]
     * @returns {Iterable<Item>}
     */
    inventoryItems(window) {
        if (!this.bot.inventory) { return new Iterable(function*() { }) }
        window = this.bot.currentWindow
        const hasWindow = !!window
        window ??= this.bot.inventory

        const specialSlotIds = hasWindow ? [] : [
            this.bot.getEquipmentDestSlot('head'),
            this.bot.getEquipmentDestSlot('torso'),
            this.bot.getEquipmentDestSlot('legs'),
            this.bot.getEquipmentDestSlot('feet'),
            this.bot.getEquipmentDestSlot('off-hand'),
        ]

        /** @type {Set<number>} */
        const set = new Set()

        return new Iterable(function*() {
            const hotbarEnd = window.hotbarStart + 9

            for (let i = window.inventoryStart; i < window.inventoryEnd; i++) {
                const item = window.slots[i]
                if (!item) { continue }
                if (set.has(i)) { continue }
                set.add(i)
                yield item
            }

            for (let i = window.hotbarStart; i < hotbarEnd; i++) {
                const item = window.slots[i]
                if (!item) { continue }
                if (set.has(i)) { continue }
                set.add(i)
                yield item
            }

            for (const specialSlotId of specialSlotIds) {
                if (specialSlotId >= window.inventoryStart && specialSlotId < window.inventoryEnd) { continue }
                if (specialSlotId >= window.hotbarStart && specialSlotId < hotbarEnd) { continue }
                const item = window.slots[specialSlotId]
                if (!item) { continue }
                if (set.has(specialSlotId)) { continue }
                set.add(specialSlotId)
                yield item
            }
        })
    }

    /**
     * @param {import('prismarine-windows').Window} [window]
     * @returns {Iterable<number>}
     */
    inventorySlots(window) {
        const hasWindow = !!window
        window ??= this.bot.inventory

        const specialSlotIds = hasWindow ? [] : [
            this.bot.getEquipmentDestSlot('head'),
            this.bot.getEquipmentDestSlot('torso'),
            this.bot.getEquipmentDestSlot('legs'),
            this.bot.getEquipmentDestSlot('feet'),
            this.bot.getEquipmentDestSlot('hand'),
            this.bot.getEquipmentDestSlot('off-hand'),
        ]

        /** @type {Set<number>} */
        const set = new Set()

        return new Iterable(function*() {
            const hotbarEnd = window.hotbarStart + 9

            for (let i = window.inventoryStart; i < window.inventoryEnd; i++) {
                if (set.has(i)) { continue }
                set.add(i)
                yield i
            }

            for (let i = window.hotbarStart; i < hotbarEnd; i++) {
                if (set.has(i)) { continue }
                set.add(i)
                yield i
            }

            for (const specialSlotId of specialSlotIds) {
                if (specialSlotId >= window.inventoryStart && specialSlotId < window.inventoryEnd) { continue }
                if (specialSlotId >= window.hotbarStart && specialSlotId < hotbarEnd) { continue }
                if (set.has(specialSlotId)) { continue }
                set.add(specialSlotId)
                yield specialSlotId
            }
        })
    }

    /**
     * @param {import('prismarine-windows').Window} window
     * @returns {Iterable<Item>}
     */
    containerItems(window) {
        return new Iterable(function*() {
            for (let i = 0; i < window.inventoryStart; ++i) {
                const item = window.slots[i]
                if (!item) { continue }
                yield item
            }
        })
    }

    /**
     * @param {import('prismarine-windows').Window} window
     */
    containerSlots(window) {
        /**
         * @type {Record<number, Item>}
         */
        const slots = {}

        for (let i = 0; i < window.inventoryStart; i++) {
            const item = window.slots[i]
            if (!item) { continue }
            console.assert(item.slot === i)
            slots[i] = item
        }

        return slots
    }

    /**
     * @param {import('prismarine-windows').Window} window
     * @param {Readonly<import('./utils/other').ItemId>} item
     * @returns {number}
     */
    inventoryItemCount(window, item) {
        let count = 0

        for (const matchedItem of this.inventoryItems(window).filter(v => isItemEquals(v, item))) {
            count += matchedItem.count
        }

        return count
    }

    /**
     * @param {import('prismarine-windows').Window} window
     * @param {Readonly<import('./utils/other').ItemId>} item
     * @returns {number}
     */
    containerItemCount(window, item) {
        let count = 0

        for (const matchedItem of this.containerItems(window).filter(v => isItemEquals(v, item))) {
            count += matchedItem.count
        }

        return count
    }

    /**
     * @param {import('prismarine-windows').Window | null} [window]
     * @param {Readonly<import('./utils/other').ItemId> | null} [item]
     * @returns {number | null}
     */
    firstFreeInventorySlot(window = null, item = null) {
        const hasWindow = !!window
        window ??= this.bot.inventory

        const specialSlotIds = hasWindow ? [] : [
            // this.bot.getEquipmentDestSlot('head'),
            // this.bot.getEquipmentDestSlot('torso'),
            // this.bot.getEquipmentDestSlot('legs'),
            // this.bot.getEquipmentDestSlot('feet'),
            this.bot.getEquipmentDestSlot('hand'),
            // this.bot.getEquipmentDestSlot('off-hand'),
        ]

        if (item) {
            for (let i = window.inventoryStart; i < window.inventoryEnd; i++) {
                const _item = window.slots[i]
                if (!_item) { continue }
                if (!isItemEquals(_item, item)) { continue }
                if (_item.count >= _item.stackSize) { continue }
                return i
            }

            for (const i of specialSlotIds) {
                const _item = window.slots[i]
                if (!_item) { continue }
                if (!isItemEquals(_item, item)) { continue }
                if (_item.count >= _item.stackSize) { continue }
                return i
            }
        }

        for (let i = window.inventoryStart; i < window.inventoryEnd; i++) {
            if (!window.slots[i]) { return i }
        }

        for (const i of specialSlotIds) {
            if (!window.slots[i]) { return i }
        }

        return null
    }

    /**
     * @param {import('prismarine-windows').Window} window
     * @param {Readonly<import('./utils/other').ItemId> | null} [item]
     * @returns {number | null}
     */
    firstFreeContainerSlot(window, item = null) {
        if (item) {
            for (let i = 0; i < window.inventoryStart; i++) {
                const _item = window.slots[i]
                if (!_item) { continue }
                if (!isItemEquals(_item, item)) { continue }
                if (_item.count >= _item.stackSize) { continue }
                return i
            }
        }

        for (let i = 0; i < window.inventoryStart; i++) {
            if (window.slots[i] === null) {
                return i
            }
        }

        return null
    }

    *clearMainHand() {
        const emptySlot = this.bot.inventory.firstEmptyInventorySlot(true)
        if (!emptySlot) {
            return false
        }
        yield* taskUtils.wrap(this.bot.unequip('hand'))
        return true
    }

    /**
     * @param {import('./utils/other').ItemId} item
     */
    holds(item, offhand = false) {
        if (offhand) {
            if (this.bot.supportFeature('doesntHaveOffHandSlot')) { return false }

            const holdingItem = this.bot.inventory.slots[this.bot.getEquipmentDestSlot('off-hand')]
            if (!holdingItem) { return false }

            return isItemEquals(holdingItem, item)
        } else {
            const holdingItem = this.bot.inventory.slots[this.bot.getEquipmentDestSlot('hand')]
            if (!holdingItem) { return false }

            return isItemEquals(holdingItem, item)
        }
    }

    /**
     * @param {import('./utils/other').ItemId | null} item
     */
    isInventoryFull(item = null) {
        const slotIds = [
            this.bot.getEquipmentDestSlot('hand'),
            this.bot.getEquipmentDestSlot('off-hand'),
        ]

        for (let i = this.bot.inventory.inventoryStart; i <= this.bot.inventory.inventoryEnd; i++) {
            slotIds.push(i)
        }

        for (const slotId of slotIds) {
            const slot = this.bot.inventory.slots[slotId]
            if (!slot) { return false }
            if (slot.count >= slot.stackSize) { continue }
            if (item && isItemEquals(item, slot)) { return false }
        }

        return true
    }

    /**
     * @param {MineFlayer.Chest | null} chest
     * @param {Vec3} chestBlock
     * @param {Readonly<import('./utils/other').ItemId>} item
     * @param {number} count
     * @returns {import('./task').Task<number>}
     */
    *chestDeposit(chest, chestBlock, item, count) {
        let depositCount = (count === Infinity) ? this.inventoryItemCount(chest, item) : count

        if (depositCount === 0) {
            chest.close()
            try {
                yield* taskUtils.sleepTicks()
                depositCount = (count === Infinity) ? this.inventoryItemCount(chest, item) : count
            } finally {
                chest = yield* taskUtils.wrap(this.bot.openChest(this.bot.blockAt(chestBlock)))
            }
        }

        if (depositCount === 0) return 0

        const stackSize = this.mc.registry.itemsByName[typeof item === 'string' ? item : item.name].stackSize

        let botItems = this.inventoryItems(chest)
            .filter(v => isItemEquals(v, item) && v.count > 0)
            .toArray()

        if (botItems.length === 0) {
            chest.close()
            try {
                yield* taskUtils.sleepTicks()
                const botItemsWithoutChest = this.inventoryItems(null)
                    .filter(v => isItemEquals(v, item) && v.count > 0)
                    .toArray()
                if (botItemsWithoutChest.length > 0) {
                    const firstItem = botItemsWithoutChest[0]
                    const specialSlotNames = (/** @type {Array<MineFlayer.EquipmentDestination>} */ ([
                        'head',
                        'torso',
                        'legs',
                        'feet',
                        'off-hand',
                    ])).map(v => ({ name: v, slot: this.bot.getEquipmentDestSlot(v) }))
                    const slot = specialSlotNames.find(v => v.slot === firstItem.slot)
                    if (slot) {
                        yield* taskUtils.wrap(this.bot.unequip(slot.name))
                    }
                }
            } finally {
                chest = yield* taskUtils.wrap(this.bot.openChest(this.bot.blockAt(chestBlock)))
                botItems = this.inventoryItems(chest)
                    .filter(v => isItemEquals(v, item) && v.count > 0)
                    .toArray()
            }
        }

        let error = null
        for (let i = 0; i < 5; i++) {
            try {
                if (botItems.length === 0) return 0
                if (!botItems[0]) return 0

                const destinationSlot = this.firstFreeContainerSlot(chest, item)
                if (destinationSlot === null) return 0

                const actualCount = Math.min(
                    depositCount,
                    botItems[0].count,
                    stackSize,
                    stackSize - (chest.slots[destinationSlot] ? chest.slots[destinationSlot].count : 0)
                )

                const sourceSlot = botItems[0].slot

                yield* taskUtils.wrap(this.bot.transfer({
                    window: chest,
                    itemType: this.mc.registry.itemsByName[typeof item === 'string' ? item : item.name].id,
                    metadata: null,
                    count: actualCount,
                    sourceStart: (sourceSlot !== null) ? sourceSlot : chest.inventoryStart,
                    sourceEnd: (sourceSlot !== null) ? sourceSlot + 1 : chest.inventoryEnd,
                    destStart: (destinationSlot !== null) ? destinationSlot : 0,
                    destEnd: (destinationSlot !== null) ? destinationSlot + 1 : chest.inventoryStart,
                }))

                this.env.recordChestTransfer(
                    this,
                    chest,
                    new Vec3Dimension(chestBlock, this.dimension),
                    typeof item === 'string' ? item : item.name,
                    actualCount)

                return actualCount
            } catch (_error) {
                error = _error
            }
        }

        if (error) throw error
    }

    /**
     * @param {MineFlayer.Chest} chest
     * @param {Vec3} chestBlock
     * @param {Readonly<import('./utils/other').ItemId>} item
     * @param {number} count
     * @returns {import('./task').Task<number>}
     */
    *chestWithdraw(chest, chestBlock, item, count) {
        const withdrawCount = Math.min(this.containerItemCount(chest, item), count)
        if (withdrawCount === 0) {
            console.warn(`No ${typeof item === 'string' ? item : item.name} in the chest`)
            return 0
        }

        const stackSize = this.mc.registry.itemsByName[typeof item === 'string' ? item : item.name].stackSize

        const containerSlots = this.containerSlots(chest)
        const containerItems = Object.keys(containerSlots)
            .map(i => Number.parseInt(i))
            .map(i => ({ slot: i, item: containerSlots[i] }))
            .filter(v => v.item && isItemEquals(v.item, item) && (v.item.count))

        if (containerItems.length === 0) {
            console.warn(`No ${typeof item === 'string' ? item : item.name} in the chest (what?)`)
            return 0
        }

        if (!containerItems[0]?.item) {
            console.warn(`No ${typeof item === 'string' ? item : item.name} in the chest (what???)`)
            return 0
        }

        const actualCount = Math.min(
            withdrawCount,
            containerItems[0].item.count,
            stackSize
        )

        const destinationSlot = this.firstFreeInventorySlot(chest, item)
        if (destinationSlot === null) {
            console.warn(`Inventory is full`)
            return 0
        }

        const sourceSlot = containerItems[0].slot

        yield* taskUtils.wrap(this.bot.transfer({
            window: chest,
            itemType: this.mc.registry.itemsByName[typeof item === 'string' ? item : item.name].id,
            metadata: null,
            count: actualCount,
            sourceStart: (sourceSlot !== null) ? sourceSlot : 0,
            sourceEnd: (sourceSlot !== null) ? sourceSlot + 1 : chest.inventoryStart,
            destStart: (destinationSlot !== null) ? destinationSlot : chest.inventoryStart,
            destEnd: (destinationSlot !== null) ? destinationSlot + 1 : chest.inventoryEnd,
        }))

        this.env.recordChestTransfer(
            this,
            chest,
            new Vec3Dimension(chestBlock, this.dimension),
            typeof item === 'string' ? item : item.name,
            -actualCount)

        return actualCount
    }

    /**
     * @param {import('./task').RuntimeArgs<{
     *   item: import('./utils/other').ItemId;
     *   count: number;
     * } | {
     *   item: ReadonlyArray<import('./utils/other').ItemId>;
     * }>} args
     * @returns {import('./task').Task<Item | null>}
     */
    *ensureItem(args) {
        if ('count' in args) {
            const has = this.inventoryItemCount(null, args.item)

            if (has >= args.count) {
                const result = this.searchInventoryItem(null, args.item)
                if (result) { return result }
            }

            try {
                yield* tasks.gatherItem.task(this, {
                    ...taskUtils.runtimeArgs(args),
                    item: args.item,
                    count: args.count,
                    canUseInventory: true,
                    canUseChests: true,
                })
                const result = this.searchInventoryItem(null, args.item)
                if (result) { return result }
            } catch (error) {
                console.warn(`[Bot "${this.username}"]`, error)
            }

            return null
        } else {
            let result = this.searchInventoryItem(null, ...args.item)
            if (result) { return result }

            try {
                yield* tasks.gatherItem.task(this, {
                    item: args.item,
                    count: 1,
                    canUseInventory: true,
                    canUseChests: true,
                    ...taskUtils.runtimeArgs(args),
                })
                result = this.searchInventoryItem(null, ...args.item)
                if (result) { return result }
            } catch (error) {

            }

            return null
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
     * @throws {Error}
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
                // throw new Error(`Could not mount the entity`)
            }
            yield
        }
    }

    /**
     * @param {import('./utils/other').ItemId} item
     * @param {number} [count = 1]
     */
    *toss(item, count = 1) {
        /**
         * @type {ReadonlyArray<MineFlayer.EquipmentDestination>}
         */
        const specialSlotNames = [
            'head',
            'torso',
            'legs',
            'feet',
            'off-hand',
        ]

        /** @type {Array<import('prismarine-entity').Entity>} */
        const droppedItems = []

        let tossed = 0
        for (const have of this.inventoryItems()) {
            if (!isItemEquals(have, item)) { continue }
            for (const specialSlotName of specialSlotNames) {
                if (this.bot.getEquipmentDestSlot(specialSlotName) !== have.slot) { continue }
                yield* taskUtils.wrap(this.bot.unequip(specialSlotName))
            }
            const tossCount = Math.min(count - tossed, have.count)
            if (tossCount <= 0) { continue }

            let droppedItemEntity = null
            const droppedAt = performance.now()
            /**
             * @param {import('prismarine-entity').Entity} entity
             */
            const onSpawn = (entity) => {
                if (entity.name !== 'item') return
                setTimeout(() => {
                    const _item = entity.getDroppedItem()
                    if (!_item) return
                    if (_item.name !== have.name) return
                    droppedItemEntity = entity
                }, 100)
            }
            this.bot.on('entitySpawn', onSpawn)

            try {
                yield* taskUtils.wrap(this.bot.toss(this.mc.registry.itemsByName[have.name].id, null, tossCount))
                const waitTime = performance.now() - droppedAt
                while (!droppedItemEntity && waitTime < 1000) {
                    yield* taskUtils.sleepTicks()
                }
                if (droppedItemEntity) droppedItems.push(droppedItemEntity)
            } finally {
                this.bot.off('entitySpawn', onSpawn)
            }

            tossed += tossCount
        }

        return {
            tossed: tossed,
            droppedItems: droppedItems,
        }
    }

    /**
     * @param {import('prismarine-block').Block} block
     * @param {boolean | 'ignore'} [forceLook]
     * @param {boolean} [allocate]
     * @returns {import('./task').Task<boolean>}
     * @throws {Error}
     */
    *dig(block, forceLook = 'ignore', allocate = true) {
        if (allocate) {
            const blockLocation = new Vec3Dimension(block.position, this.dimension)
            if (!this.env.allocateBlock(this.username, blockLocation, 'dig')) {
                return false
            }
            yield* taskUtils.wrap(this.bot.dig(block, forceLook))
            this.env.deallocateBlock(this.username, blockLocation)
            return true
        } else {
            debugger
            yield* taskUtils.wrap(this.bot.dig(block, forceLook))
            return true
        }
    }

    /**
     * @param {import('prismarine-block').Block} block
     * @param {boolean | 'ignore'} forceLook
     * @returns {import('./task').Task<void>}
     * @throws {Error}
     */
    *forceDig(block, forceLook = 'ignore') {
        while (true) {
            const digged = yield* this.dig(block, forceLook, true)
            if (digged) { break }
            const success = yield* this.env.waitUntilBlockIs(new Vec3Dimension(block.position, this.dimension), 'dig')
            if (success) { break }
        }
    }

    /**
     * @param {import('prismarine-block').Block} referenceBlock
     * @param {Vec3} faceVector
     * @param {import('./utils/other').ItemId} item
     * @param {boolean} [allocate]
     * @returns {import('./task').Task<boolean>}
     * @throws {Error}
     */
    *place(referenceBlock, faceVector, item, allocate = true) {
        const itemId = this.mc.registry.itemsByName[typeof item === 'string' ? item : item.name].id
        const above = referenceBlock.position.offset(faceVector.x, faceVector.y, faceVector.z)
        const blockLocation = new Vec3Dimension(above, this.dimension)
        if (allocate) {
            if (!this.env.allocateBlock(this.username, blockLocation, 'place', { item: itemId })) {
                return false
            }

            let holds = this.bot.inventory.slots[this.bot.getEquipmentDestSlot('hand')]
            if (!holds || !isItemEquals(holds, item)) {
                yield* taskUtils.wrap(this.bot.equip(itemId, 'hand'))
            }
            holds = this.bot.inventory.slots[this.bot.getEquipmentDestSlot('hand')]
            if (!holds || !isItemEquals(holds, item)) {
                throw `I have no ${stringifyItemH(item)}`
            }

            yield* taskUtils.wrap(this.bot._placeBlockWithOptions(referenceBlock, faceVector, { forceLook: 'ignore' }))

            this.env.deallocateBlock(this.username, blockLocation)
            return true
        } else {
            let holds = this.bot.inventory.slots[this.bot.getEquipmentDestSlot('hand')]
            if (!holds || !isItemEquals(holds, item)) {
                yield* taskUtils.wrap(this.bot.equip(itemId, 'hand'))
            }
            holds = this.bot.inventory.slots[this.bot.getEquipmentDestSlot('hand')]
            if (!holds || !isItemEquals(holds, item)) {
                throw `I have no ${stringifyItemH(item)}`
            }

            yield* taskUtils.wrap(this.bot._placeBlockWithOptions(referenceBlock, faceVector, { forceLook: 'ignore' }))

            return true
        }
    }

    /**
     * @param {import('prismarine-block').Block} block
     * @param {boolean} [forceLook]
     * @param {boolean} [allocate]
     * @returns {import('./task').Task<boolean>}
     * @throws {Error}
     */
    *activate(block, forceLook = false, allocate = true) {
        if (allocate) {
            const blockLocation = new Vec3Dimension(block.position, this.dimension)
            if (!this.env.allocateBlock(this.username, blockLocation, 'activate')) {
                return false
            }
            yield* taskUtils.wrap(this.bot.activateBlock(block, null, null, forceLook))
            this.env.deallocateBlock(this.username, blockLocation)
            return true
        } else {
            yield* taskUtils.wrap(this.bot.activateBlock(block, null, null, forceLook))
            return true
        }
    }

    //#endregion

    /**
     * @type {undefined | Array<{
     *   options: {
     *     matching: ReadonlySet<number>;
     *     point: Vec3;
     *     maxDistance: number;
     *   };
     *   result: ReadonlyArray<import('prismarine-block').Block>;
     *   time: number;
     * }>}
     */
    #findBlocksCache

    /**
     * @param {{
     *   matching: number | string | Iterable<string | number> | ReadonlySet<number>;
     *   filter?: (block: import('prismarine-block').Block) => boolean;
     *   point?: Vec3
     *   maxDistance?: number
     *   count?: number
     *   force?: boolean
     * }} options
     * @returns {Iterable<import('prismarine-block').Block>}
     */
    findBlocks(options) {
        // @ts-ignore
        const Block = require('prismarine-block')(this.bot.registry)

        /** @type {ReadonlySet<number>} */
        let matching = null

        if (typeof options.matching === 'number') {
            matching = new Set([options.matching])
            // console.log(`Find block${options.count === 1 ? '' : 's'}`, this.bot.registry.blocks[options.matching]?.name)
        } else if (typeof options.matching === 'string') {
            matching = new Set([this.bot.registry.blocksByName[options.matching].id])
            // console.log(`Find block${options.count === 1 ? '' : 's'}`, options.matching)
        } else if ('has' in options.matching) {
            matching = options.matching
            // console.log(`Find block${options.count === 1 ? '' : 's'}`, options.matching.entries().map(v => this.bot.registry.blocks[v[0]]?.name).toArray())
        } else {
            matching = new Set()
            for (const item of options.matching) {
                if (typeof item === 'string') {
                    //@ts-ignore
                    matching.add(this.bot.registry.blocksByName[item].id)
                } else {
                    //@ts-ignore
                    matching.add(item)
                }
            }
            // console.log(`Find block${options.count === 1 ? '' : 's'}`, options.matching.map(v => typeof v === 'number' ? this.bot.registry.blocks[v]?.name : v).toArray())
        }

        /**
         * @param {import('prismarine-chunk').PCChunk['sections'][0]} section
         */
        const isBlockInSection = (section) => {
            if (!section) return false // section is empty, skip it (yay!)
            // If the chunk use a palette we can speed up the search by first
            // checking the palette which usually contains less than 20 ids
            // vs checking the 4096 block of the section. If we don't have a
            // match in the palette, we can skip this section.
            if (section.palette) {
                for (const stateId of section.palette) {
                    if (matching.has(Block.fromStateId(stateId, 0).type)) {
                        return true // the block is in the palette
                    }
                }
                return false // skip
            }
            return true // global palette, the block might be in there
        }

        this.#findBlocksCache ??= []

        const bot = this.bot
        const cache = this.#findBlocksCache

        return new Iterable(function*() {
            const point = (options.point || bot.entity.position).floored()
            const maxDistance = options.maxDistance || 16
            const count = options.count || 1

            if (!options.force) {
                const now = performance.now()
                for (let i = cache.length - 1; i >= 0; i--) {
                    const item = cache[i]
                    if ((now - item.time) > 20000) {
                        cache.splice(i, 1)
                        continue
                    }
                    if (!item.options.point.equals(point)) { continue }
                    if (item.options.maxDistance !== maxDistance) { continue }
                    if (item.options.matching.symmetricDifference(matching).size) { continue }
                    for (const cached of item.result) {
                        yield cached
                    }
                    return
                }
            }

            const start = new Vec3(Math.floor(point.x / 16), Math.floor(point.y / 16), Math.floor(point.z / 16))
            const it = new (require('prismarine-world').iterators.OctahedronIterator)(start, Math.ceil((maxDistance + 8) / 16))
            // the octahedron iterator can sometime go through the same section again
            // we use a set to keep track of visited sections
            const visitedSections = new Set()

            let n = 0
            let startedLayer = 0
            let next = start
            /** @type {Array<import('prismarine-block').Block>} */
            const currentCachedItemResult = []
            /** @type {(typeof cache)[0]} */
            const currentCachedItem = {
                options: { matching, maxDistance, point },
                result: currentCachedItemResult,
                time: performance.now(),
            }
            cache.push(currentCachedItem)
            while (next) {
                yield
                const column = bot.world.getColumn(next.x, next.z)
                //@ts-ignore
                const sectionY = next.y + Math.abs(bot.game.minY >> 4)
                //@ts-ignore
                const totalSections = bot.game.height >> 4
                if (sectionY >= 0 && sectionY < totalSections && column && !visitedSections.has(next.toString())) {
                    /** @type {import('prismarine-chunk').PCChunk['sections'][0]} */ //@ts-ignore
                    const section = column.sections[sectionY]
                    if (isBlockInSection(section)) {
                        //@ts-ignore
                        const begin = new Vec3(next.x * 16, sectionY * 16 + bot.game.minY, next.z * 16)
                        const cursor = begin.clone()
                        const end = cursor.offset(16, 16, 16)
                        for (cursor.x = begin.x; cursor.x < end.x; cursor.x++) {
                            for (cursor.y = begin.y; cursor.y < end.y; cursor.y++) {
                                for (cursor.z = begin.z; cursor.z < end.z; cursor.z++) {
                                    const block = bot.blockAt(cursor)
                                    if (matching.has(block.type) && (!options.filter || options.filter(block)) && cursor.distanceTo(point) <= maxDistance) {
                                        currentCachedItemResult.push(block)
                                        currentCachedItem.time = performance.now()
                                        yield block
                                        n++
                                    }
                                }
                            }
                        }
                    }
                    visitedSections.add(next.toString())
                }
                // If we started a layer, we have to finish it otherwise we might miss closer blocks
                //@ts-ignore
                if (startedLayer !== it.apothem && n >= count) {
                    break
                }
                //@ts-ignore
                startedLayer = it.apothem
                next = it.next()
            }
        })
    }

    /**
     * @private
     * @param {import('prismarine-block').Block} block
     * @param {Vec3} [eye]
     */
    _blockVisibility(block, eye = null) {
        if (!eye) {
            eye = this.bot.entity.position.offset(0, this.bot.entity.eyeHeight, 0)
        }

        // Check faces that could be seen from the current position. If the delta is smaller then 0.5 that means the
        // bot can most likely not see the face as the block is 1 block thick
        // this could be false for blocks that have a smaller bounding box than 1x1x1
        const dx = eye.x - (block.position.x + 0.5)
        const dy = eye.y - (block.position.y + 0.5)
        const dz = eye.z - (block.position.z + 0.5)

        // Check y first then x and z
        const visibleFaces = {
            y: Math.sign(Math.abs(dy) > 0.5 ? dy : 0),
            x: Math.sign(Math.abs(dx) > 0.5 ? dx : 0),
            z: Math.sign(Math.abs(dz) > 0.5 ? dz : 0)
        }

        const validFaces = []
        const closerBlocks = []

        for (const i of /** @type {['x', 'y', 'z']} */ (Object.keys(visibleFaces))) {
            if (!visibleFaces[i]) continue // skip as this face is not visible
            // target position on the target block face. -> 0.5 + (current face) * 0.5
            const targetPos = block.position.offset(
                0.5 + (i === 'x' ? visibleFaces[i] * 0.5 : 0),
                0.5 + (i === 'y' ? visibleFaces[i] * 0.5 : 0),
                0.5 + (i === 'z' ? visibleFaces[i] * 0.5 : 0)
            )
            const rayBlock = this.bot.world.raycast(eye, targetPos.clone().subtract(eye).normalize(), 5)
            if (rayBlock) {
                if (eye.distanceTo(rayBlock.intersect) < eye.distanceTo(targetPos)) {
                    // Block is closer then the raycasted block
                    closerBlocks.push(rayBlock)
                    // continue since if distance is ever less, then we did not intersect the block we wanted,
                    // meaning that the position of the intersected block is not what we want.
                    continue
                }
                const rayPos = rayBlock.position
                if (
                    rayPos.x === block.position.x &&
                    rayPos.y === block.position.y &&
                    rayPos.z === block.position.z
                ) {
                    validFaces.push({
                        face: rayBlock.face,
                        targetPos: rayBlock.intersect
                    })
                }
            }
        }

        return { validFaces, closerBlocks }
    }

    /**
     * @param {import('prismarine-block').Block} block
     * @param {Vec3} [eye]
     */
    async lookAtBlock(block, eye = undefined, force = true) {
        const { validFaces, closerBlocks } = this._blockVisibility(block, eye)

        if (validFaces.length > 0) {
            // Chose closest valid face
            let closest
            let distSqrt = 999
            for (const i in validFaces) {
                const tPos = validFaces[i].targetPos
                const cDist = new Vec3(tPos.x, tPos.y, tPos.z).distanceSquared(
                    this.bot.entity.position.offset(0, this.bot.entity.eyeHeight, 0)
                )
                if (distSqrt > cDist) {
                    closest = validFaces[i]
                    distSqrt = cDist
                }
            }
            await this.bot.lookAt(closest.targetPos, force)
        } else if (closerBlocks.length === 0 && block.shapes.length === 0) {
            // no other blocks were detected and the block has no shapes.
            // The block in question is replaceable (like tall grass) so we can just dig it
            // TODO: do AABB + ray intercept check to this position for digFace.
            await this.bot.lookAt(block.position.offset(0.5, 0.5, 0.5), force)
        } else {
            // Block is obstructed return error?
            throw new Error('Block not in view')
        }
    }

    /**
     * @param {import('prismarine-block').Block} block
     * @param {Vec3} [eye]
     */
    blockInView(block, eye = null) {
        const { validFaces, closerBlocks } = this._blockVisibility(block, eye)
        if (validFaces.length > 0) {
            return true
        } else if (closerBlocks.length === 0 && block.shapes.length === 0) {
            return true
        } else {
            return false
        }
    }
}
