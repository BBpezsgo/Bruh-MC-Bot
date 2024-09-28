/// <reference types="./global.d.ts" />

//#region Packages

const fs = require('fs')
const MineFlayer = require('mineflayer')
const { Item } = require('prismarine-item')
const path = require('path')
const levenshtein = require('damerau-levenshtein')

//#endregion

//#region Local

const TaskManager = require('./task-manager')
const Minecraft = require('./minecraft')
const { Interval, parseLocationH, parseYesNoH, Timeout, parseAnyLocationH, isItemEquals } = require('./utils/other')
const taskUtils = require('./utils/tasks')
require('./utils/math')
const Environment = require('./environment')
const Memory = require('./memory')
const Debug = require('./debug')
const TextDisplay = require('./text-display')
const Commands = require('./commands')
const tasks = require('./tasks')
const { EntityPose } = require('./entity-metadata')
const BlockDisplay = require('./block-display')
const { filterOutEquipment, filterOutItems } = require('./utils/items')
const Vec3Dimension = require('./vec3-dimension')
const { Vec3 } = require('vec3')
const Iterable = require('./iterable')

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
 * }} GeneralConfig
 */

/**
 * @typedef {GeneralConfig & {
 *   bot: {
 *     username: string;
 *     behavior?: {
 *       pickupItemDistance?: number;
 *       autoSmeltItems?: boolean;
 *       autoHarvest?: boolean;
 *       idleLooking?: boolean;
 *     }
 *   }
 * }} BotConfig
 */

/**
 * @typedef {import('prismarine-nbt').Tags[import('prismarine-nbt').TagType]} NBT
 */

class ItemLock {
    /**
     * @readonly
     * @type {string}
     */
    by

    /**
     * @readonly
     * @type {string}
     */
    item

    /**
     * @readonly
     * @type {number}
     */
    count

    /**
     * @type {boolean}
     */
    isUnlocked

    /**
     * @param {string} by
     * @param {string} item
     * @param {number} count
     */
    constructor(by, item, count) {
        this.by = by
        this.item = item
        this.count = count
        this.isUnlocked = false
    }
}

/**
 * @typedef {{
 *   match: string | ReadonlyArray<string>;
 *   command: (sender: string, message: string, respond: (reply: any) => void) => void;
 * }} StringChatHandler
 */

/**
 * @typedef {{
 *   match: RegExp;
 *   command: (sender: string, message: RegExpExecArray, respond: (reply: any) => void) => void;
 * }} RegexpChatHandler
 */

/**
 * @typedef {StringChatHandler | RegexpChatHandler} ChatHandler
 */

module.exports = class BruhBot {
    static ItemLock = ItemLock

    /**
     * @readonly
     * @type {import('mineflayer').Bot}
     */
    bot

    /**
     * @readonly
     * @type {Minecraft}
     */
    mc

    /**
     * @private @readonly
     * @type {TaskManager}
     */
    tasks

    /**
     * @typedef {{
     *   onChat: (username: string, message: string) => boolean;
     *   done: boolean;
     * }} ChatAwait
     */

    /**
     * @readonly
     * @type {Array<ChatAwait>}
     */
    chatAwaits

    /**
     * @readonly
     * @type {import('mineflayer-pathfinder').Movements}
     */
    permissiveMovements
    /**
     * @readonly
     * @type {import('mineflayer-pathfinder').Movements}
     */
    restrictedMovements
    /**
     * @readonly
     * @type {import('mineflayer-pathfinder').Movements}
     */
    cutTreeMovements

    /**
     * @private @readonly
     * @type {Interval}
     */
    ensureEquipmentInterval
    /**
     * @private @readonly
     * @type {Interval}
     */
    dumpTrashInterval
    /**
     * @private @readonly
     * @type {Interval}
     */
    saveInterval
    /**
     * @private @readonly
     * @type {Interval}
     */
    saveTasksInterval
    /**
     * @private @readonly
     * @type {Interval}
     */
    trySleepInterval
    /**
     * @private @readonly
     * @type {Interval}
     */
    goBackInterval
    /**
     * @private @readonly
     * @type {Interval}
     */
    checkQuietInterval
    /**
     * @private @readonly
     * @type {Interval}
     */
    randomLookInterval
    /**
     * @private
     * @type {number}
     */
    lookAtPlayer
    /**
     * @private @readonly
     * @type {Interval}
     */
    lookAtPlayerTimeout
    /**
     * @private @readonly
     * @type {Interval}
     */
    moveAwayInterval
    /**
     * @private @readonly
     * @type {Interval}
     */
    tryAutoHarvestInterval
    /**
     * @private @readonly
     * @type {Interval}
     */
    tryRestoreCropsInterval
    /**
     * @private @readonly
     * @type {Interval}
     */
    breedAnimalsInterval
    /**
     * @private @readonly
     * @type {Interval}
     */
    loadCrossbowsInterval

    /**
     * @private
     * @type {boolean}
     */
    _quietMode

    /**
     * @readonly
     * @type {boolean}
     */
    get quietMode() { return this._quietMode || this.userQuiet }

    /**
     * @private
     * @type {Record<number, { time: number; entity: import('prismarine-entity').Entity; }>}
     */
    aimingEntities

    /**
     * @private
     * @type {Record<number, { time: number; trajectory: ReadonlyArray<import('vec3').Vec3>; projectile: import('minecrafthawkeye').Projectile; }>}
     */
    incomingProjectiles

    /**
     * @private
     * @type {boolean}
     */
    _isLeftHandActive

    /**
     * @private
     * @type {boolean}
     */
    _isRightHandActive

    /**
     * @type {import('./managed-task').AsManaged<import('./tasks/attack')> | null}
     */
    defendMyselfGoal

    /**
     * @private
     * @type {number}
     */
    _lastImportantTaskTime

    /**
     * @private
     * @type {import('./managed-task')}
     */
    _runningTask

    /**
     * @readonly
     * @type {import('mineflayer').Dimension}
     */
    get dimension() { return this.bot.game.dimension }

    /**
     * @readonly
     * @type {string}
     */
    get username() { return this.bot.username ?? this._config.bot.username }

    /**
     * @type {((soundName: string | number) => void) | null}
     */
    onHeard

    get isLeftHandActive() { return this._isLeftHandActive }
    get isRightHandActive() { return this._isRightHandActive }

    /**
     * @readonly
     * @type {Environment}
     */
    env

    /**
     * @readonly
     * @type {Memory}
     */
    memory

    /**
     * @readonly
     * @type {Array<ItemLock>}
     */
    lockedItems

    /**
     * @private
     * @type {boolean}
     */
    _isLeaving

    /**
     * @readonly
     * @type {boolean}
     */
    get isLeaving() { return this._isLeaving }

    /**
     * @readonly
     * @type {import('./debug')}
     */
    debug

    /**
     * @private @readonly
     * @type {ReadonlyArray<ChatHandler>}
     */
    chatHandlers

    /**
     * @readonly
     * @type {Commands}
     */
    commands

    /**
     * @private
     * @type {import('mineflayer-pathfinder').PartiallyComputedPath | null}
     */
    _currentPath

    /**
     * @private @readonly
     * @type {Readonly<BotConfig>}
     */
    _config

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
        this.bot = MineFlayer.createBot({
            host: config.server.host,
            port: config.server.port,
            username: config.bot.username,
            logErrors: false,
            shared: this.env.shared,
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
                'particle': false,
                'resource_pack': false,
                // 'settings': false,
                'scoreboard': false,
                'tablist': false,
                'team': false,
                'title': false,
                'place_entity': false,
                'pathfinder': require('mineflayer-pathfinder').pathfinder,
                'armor_manager': require('mineflayer-armor-manager'),
                // 'hawkeye': require('minecrafthawkeye').default,
                // 'elytra': require('mineflayer-elytrafly').elytrafly,
            }
            // storageBuilder: (options) => {
            //     const worldPath = path.join(config.worldPath, options.worldName)
            //     if (!worldPath.startsWith(config.worldPath)) { throw new Error(`Invalid world name`) }
            //     if (!fs.existsSync(worldPath)) {
            //         fs.mkdirSync(worldPath, { recursive: true })
            //     }
            //     const Anvil = require('prismarine-provider-anvil').Anvil('1.18')
            //     return new Anvil(worldPath)
            //     /** @type {typeof import('prismarine-chunk').CommonChunk} */  // @ts-ignore
            //     const Chunk = require('prismarine-chunk')(this.bot.registry)
            //     return {
            //         load: async (chunkX, chunkY) => {
            //             const chunkPath = path.join(worldPath, `${chunkX}_${chunkY}.json`)
            //             if (!fs.existsSync(chunkPath)) { return null }
            //             return Chunk.fromJson(fs.readFileSync(chunkPath, 'utf8'))
            //         },
            //         save: async (chunkX, chunkY, /** @type {import('prismarine-chunk').CommonChunk} */ chunk) => {
            //             const chunkPath = path.join(worldPath, `${chunkX}_${chunkY}.json`)
            //             fs.writeFileSync(chunkPath, chunk.toJson(), 'utf8')
            //         }
            //     }
            // }
        })

        this.bot.on('injected', (plugin) => {
            console.log(`[Bot "${this.username}"] Plugin loaded: ${plugin.pluginName}`)
        })

        this.memory = new Memory(this, path.join(config.worldPath, `memory-${config.bot.username}.json`))
        this.tasks = new TaskManager()

        try {
            const tasksPath = path.join(config.worldPath, 'tasks-' + this.username + '.json')
            if (fs.existsSync(tasksPath)) {
                const json = fs.readFileSync(tasksPath, 'utf8')
                this.tasks.fromJSON(this, json)
                console.log(`[Bot "${this.username}"] Loaded ${json.length} tasks`)
            }
        } catch (error) {
            console.error(`[Bot "${this.username}"] Failed to load the tasks`, error)
        }

        this.env.addBot(this)

        this.chatAwaits = []
        this._quietMode = false
        this.userQuiet = false
        this._isLeaving = false
        this._isLeftHandActive = false
        this._isRightHandActive = false
        this.defendMyselfGoal = null
        this.onHeard = null
        this.aimingEntities = {}
        this.incomingProjectiles = {}
        this.lockedItems = []
        this.commands = new Commands(this.bot)
        this._currentPath = null
        this.lookAtPlayer = 0
        this._lastImportantTaskTime = performance.now()
        this.saveInterval = new Interval(30000)
        this._runningTask = null

        // this.saveTasksInterval = new Interval(5000)
        // this.trySleepInterval = new Interval(5000)
        // this.checkQuietInterval = new Interval(500)

        this.randomLookInterval = new Interval(10000)
        this.ensureEquipmentInterval = new Interval(60000)
        this.goBackInterval = new Interval(20000)
        this.loadCrossbowsInterval = new Interval(5000)
        this.moveAwayInterval = new Interval(3000)
        this.dumpTrashInterval = new Interval(20000)
        this.lookAtPlayerTimeout = new Interval(5000)

        this.permissiveMovements = null
        this.restrictedMovements = null
        this.cutTreeMovements = null

        this.debug = new Debug(this)

        this.chatHandlers = this.setupChatHandlers()

        const stringifyMessage = function(/** @type {any} */ message) {
            if (typeof message === 'string') {
                return message
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
            this.handleChat(sender, message, reply => {
                this.bot.chat(stringifyMessage(reply))
            })
        })

        this.bot.on('whisper', (sender, message) => this.handleChat(sender, message, reply => {
            this.bot.whisper(sender, stringifyMessage(reply))
        }))

        this.bot.on('target_aiming_at_you', (entity, trajectory) => {
            if (!this.aimingEntities[entity.id]) {
                this.aimingEntities[entity.id] = {
                    time: performance.now(),
                    entity: entity,
                }
            } else {
                this.aimingEntities[entity.id].time = performance.now()
                this.aimingEntities[entity.id].entity = entity
            }
        })

        this.bot.on('incoming_projectile', (projectile, trajectory) => {
            if (!this.incomingProjectiles[projectile.entity.id]) {
                this.incomingProjectiles[projectile.entity.id] = {
                    time: performance.now(),
                    projectile: projectile,
                    trajectory: trajectory,
                }
            } else {
                this.incomingProjectiles[projectile.entity.id].time = performance.now()
                this.incomingProjectiles[projectile.entity.id].projectile = projectile
                this.incomingProjectiles[projectile.entity.id].trajectory = trajectory
            }
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
            if (this.env.bots.find(v => v.bot.entity.id === sourceCauseId)) { return }
            const source = this.bot.entities[sourceCauseId - 1]
            if (!source) { return }
            if (entity.id === this.bot.entity.id) {
                let indirectSource = source
                while (this.env.entityOwners[indirectSource.id]) {
                    indirectSource = this.env.entityOwners[source.id]
                }
                this.memory.hurtBy[indirectSource.id] ??= []
                this.memory.hurtBy[indirectSource.id].push(performance.now())
                // console.log(`Damaged by ${indirectSource.username ?? indirectSource.displayName ?? indirectSource.name ?? 'someone'}`)
            }
        })

        this.bot.once('spawn', () => {
            console.log(`[Bot "${this.username}"] Spawned`)
            this.bot.clearControlStates()

            this.bot.pathfinder.enablePathShortcut = true
            this.bot.hawkEye?.startRadar()

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
            this.cutTreeMovements.blocksCanBreakAnyway.add(this.mc.registry.blocksByName['oak_leaves'].id)

            console.log(`[Bot "${this.username}"] Ready`)
        })

        this.bot.on('move', () => {
            if (!this.mc) { return }
            if (this.bot.entity.velocity.y < Minecraft.general.fallDamageVelocity) {
                this.tasks.tick()
                this.tasks.push(this, tasks.mlg, {}, priorities.critical)
                return
            }
        })

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
                    console.log(`[Bot "${this.username}"] [Pathfinder] ${reason}`)
                    break
            }
            this._currentPath = null
        })
        this.bot.on('path_stop', () => {
            // console.log(`[Bot "${this.username}"] [Pathfinder] Stop`)
            this._currentPath = null
        })

        this.bot.on('entityMoved', (entity) => {
            entity.time = performance.now()
        })

        this.bot.on('entitySpawn', (entity) => {
            entity.time = performance.now()
        })

        this.bot.on('entityDead', (entity) => {
            entity.isValid = false
        })

        this.bot.on('entityGone', (entity) => {
            entity.isValid = false
        })

        /**
         * @type {null | NodeJS.Timeout | Timer}
         */
        let tickInterval = null

        this.bot.on('mount', () => {
            if (!tickInterval) {
                tickInterval = setInterval(this.tick, 50)
            }
        })

        this.bot.on('physicsTick', () => {
            if (tickInterval) {
                clearInterval(tickInterval)
                tickInterval = null
            }
            this.tick()
        })

        this.bot.on('death', () => {
            console.log(`[Bot "${this.username}"] Died`)
            this.bot.clearControlStates()
            this.bot.pathfinder.stop()
            this.tasks.death()
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
            // this.bot.webInventory?.stop?.()
            // this.bot.viewer?.close()

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

        // this.bot.on('path_update', (r) => {
        //     if (this.bot.viewer) {
        //         const path = [this.bot.entity.position.offset(0, 0.5, 0)]
        //         for (const node of r.path) {
        //             path.push(new Vec3(node.x, node.y + 0.5, node.z ))
        //         }
        //         this.bot.viewer.drawLine('path', path, 0xffffff)
        //     }
        // })

        // this.bot.on('path_reset', (reason) => {
        //     this.bot.viewer?.erase('path')
        // })

        // this.bot.on('path_stop', () => {
        //     this.bot.viewer?.erase('path')
        // })
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
            match: 'test1',
            command: (sender, message, respond) => {
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
                }, {}, priorities.user, true)
                    ?.wait()
                    .then(() => respond(`K`))
                    .catch(reason => reason === 'cancelled' || respond(reason))
            },
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: 'test2',
            command: (sender, message, respond) => {
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
                            yield* tasks.kill.task(bot, { entity: mobToKill })
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
            command: (sender, message, respond) => {
                const task = this.tasks.push(this, {
                    task: BruhBot.breedAnimals,
                    id: `breed-animals`,
                }, {}, priorities.user)

                if (task) {
                    task.wait()
                        .then(result => result ? respond(`I fed ${result} animals`) : respond(`No animals to feed`))
                        .catch(error => error === 'cancelled' || respond(error))
                } else {
                    respond(`I'm already breeding animals`)
                }
            },
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: ['harvest'],
            command: (sender, message, respond) => {
                const task = this.tasks.push(this, {
                    task: BruhBot.tryHarvestCrops,
                    id: `harvest-crops`,
                }, {}, priorities.user)

                if (task) {
                    task.wait()
                        .then(result => result ? respond(`Done`) : respond(`No crops found that I can harvest`))
                        .catch(error => error === 'cancelled' || respond(error))
                } else {
                    respond(`I'm already harvesting crops`)
                }
            },
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: ['check crops'],
            command: (sender, message, respond) => {
                const task = this.tasks.push(this, {
                    task: BruhBot.tryRestoreCrops,
                    id: `check-crops`,
                }, {}, priorities.user)

                if (task) {
                    task.wait()
                        .then(() => respond(`Done`))
                        .catch(error => error === 'cancelled' || respond(error))
                } else {
                    respond(`I'm already checking crops`)
                }
            },
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: ['dump', 'dump trash'],
            command: (sender, message, respond) => {
                const task = this.tasks.push(this, tasks.dumpToChest, {
                    items: this.getTrashItems()
                }, priorities.user)

                if (task) {
                    task.wait()
                        .then(result => result ? respond(`Done`) : respond(`I don't have any trash`))
                        .catch(error => error === 'cancelled' || respond(error))
                } else {
                    respond(`I'm already dumping trash`)
                }
            },
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: ['ensure equipment', 'prepare', 'prep'],
            command: (sender, message, respond) => {
                const task = this.tasks.push(this, {
                    task: BruhBot.ensureEquipment,
                    id: 'ensure-equipment',
                }, {}, priorities.user)
                if (task) {
                    task.wait()
                        .then(() => respond(`Done`))
                        .catch(error => error === 'cancelled' || respond(error))
                } else {
                    respond(`I'm already ensuring equipment`)
                }
            },
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: ['clear debug', 'cdebug', 'dispose debug', 'ddebug', 'ndebug'],
            command: (sender, message, respond) => {
                TextDisplay.disposeAll(this.commands)
                BlockDisplay.disposeAll(this.commands)
            },
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: 'fly',
            command: (sender, message, respond) => {
                this.tasks.push(this, {
                    task: function*(bot, args) {
                        let location = bot.env.getPlayerPosition(args.player, 10000)
                        if (!location) {
                            try {
                                const response = yield* bot.ask(`Where are you?`, respond, sender, 30000)
                                location = parseLocationH(response.message)
                            } catch (error) {

                            }
                            if (location) {
                                respond(`${location.x} ${location.y} ${location.z} in ${location.dimension} I got it`)
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
                        let isDone = false
                        bot.bot.once('elytraFlyGoalReached', () => {
                            isDone = true
                        })
                        while (!isDone) {
                            yield
                        }
                    },
                    id: function(args) { return `fly-to-${args.player}` },
                    humanReadableId: function(args) { return `Flying to ${args.player}` },
                }, {
                    player: sender
                }, priorities.user, true)
            },
        }))

        handlers.push(/** @type {RegexpChatHandler} */({
            match: /get\s+([0-9]*)\s*([a-zA-Z_ ]+)/,
            command: (sender, message, respond) => {
                const count = (message[1] === '') ? 1 : Number.parseInt(message[1])
                const itemName = message[2].toLowerCase().trim()
                let items
                if (itemName === 'food') {
                    items = this.mc.getGoodFoods(false).map(v => v.name)
                } else {
                    let item = this.mc.registry.itemsByName[itemName.toLowerCase()]
                    if (!item) {
                        item = this.mc.registry.itemsArray.find(v => v.displayName.toLowerCase() === itemName.toLowerCase())
                    }
                    if (!item) {
                        respond(`I don't know what ${itemName} is`)
                        return
                    }
                    items = [item.name]
                }

                this.tasks.push(this, tasks.gatherItem, {
                    count: count,
                    item: items,
                    onStatusMessage: respond,
                    canTrade: true,
                    canCraft: true,
                    canDig: true,
                    canKill: false,
                    canUseChests: true,
                    canUseInventory: false,
                    canRequestFromPlayers: false,
                    canHarvestMobs: true,
                }, priorities.user, true)
                    ?.wait()
                    .then(result => result.count <= 0 ? respond(`I couldn't gather the item(s)`) : respond(`I gathered ${result.count} ${result.item}`))
                    .catch(error => error === 'cancelled' || respond(error))
            },
        }))

        handlers.push(/** @type {RegexpChatHandler} */({
            match: /plan\s+([0-9]*)\s*([a-zA-Z_ ]+)/,
            command: (sender, message, respond) => {
                const count = (message[1] === '') ? 1 : Number.parseInt(message[1])
                const itemName = message[2].toLowerCase().trim()
                let item = this.mc.registry.itemsByName[itemName.toLowerCase()]
                if (!item) {
                    item = this.mc.registry.itemsArray.find(v => v.displayName.toLowerCase() === itemName.toLowerCase())
                }
                if (!item) {
                    respond(`I don't know what ${itemName} is`)
                    return
                }
                this.tasks.push(this, {
                    task: function*(bot, args) {
                        const plan = yield* tasks.gatherItem.plan(bot, args.item, args.count, args, {
                            depth: 0,
                            recursiveItems: [],
                        }, [])
                        const organizedPlan = tasks.gatherItem.organizePlan(plan)
                        const planResult = tasks.gatherItem.planResult(organizedPlan, args.item)
                        const planCost = tasks.gatherItem.planCost(organizedPlan)
                        respond(`There is a plan for ${planResult} ${args.item} with a cost of ${planCost}:`)
                        respond(tasks.gatherItem.stringifyPlan(bot, organizedPlan))

                        {
                            respond(`Delta:`)
                            let builder = ''
                            const future = new tasks.gatherItem.PredictedEnvironment(organizedPlan, bot.mc.registry)

                            builder += 'Inventory:\n'
                            for (const name in future.inventory) {
                                const delta = future.inventory[name]
                                if (delta) {
                                    builder += `  ${delta} ${name}\n`
                                }
                            }
                            builder += 'Chests:\n'
                            for (const position in future.chests) {
                                /** @type {Record<string, number>} */ // @ts-ignore
                                const chest = future.chests[position]
                                builder += `  at ${position}`
                                for (const name in chest) {
                                    const delta = chest[name]
                                    if (delta) {
                                        builder += `    ${delta} ${name}\n`
                                    }
                                }
                            }
                            respond(builder)
                        }
                    },
                    id: function(args) {
                        return `plan-${args.count}-${args.item}`
                    },
                    humanReadableId: function(args) {
                        return `Planning ${args.count} ${args.item}`
                    }
                }, {
                    item: item.name,
                    count: count,
                    onStatusMessage: respond,
                    canCraft: true,
                    canDig: true,
                    canKill: false,
                    canUseChests: true,
                    canUseInventory: false,
                    canRequestFromPlayers: false,
                    canTrade: true,
                    canHarvestMobs: true,
                }, priorities.user, true)
                    ?.wait()
                    .then(() => { })
                    .catch(error => error === 'cancelled' || respond(error))
                return
            },
        }))

        handlers.push(/** @type {RegexpChatHandler} */({
            match: /kill\s+([a-zA-Z0-9_]+)/,
            command: (sender, message, respond) => {
                const target = this.bot.players[message[1]]
                if (!target) {
                    respond(`Can't find ${message[1]}`)
                    return
                }

                this.tasks.push(this, tasks.kill, {
                    entity: target.entity,
                    requestedBy: sender,
                }, priorities.user, true)
                    ?.wait()
                    .then(() => respond(`Done`))
                    .catch(error => error === 'cancelled' || respond(error))
            },
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: 'scan chests',
            command: (sender, message, respond) => {
                const task = this.tasks.push(this, {
                    task: () => this.env.scanChests(this),
                    id: `scan-chests`,
                    humanReadableId: `Scanning chests`,
                }, {}, priorities.user, true)
                if (task) {
                    respond(`Okay`)
                    task.wait()
                        .then(result => respond(`I scanned ${result} chests`))
                        .catch(error => error === 'cancelled' || respond(error))
                } else {
                    respond(`I'm already scanning chests`)
                }
            },
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: 'scan villagers',
            command: (sender, message, respond) => {
                const task = this.tasks.push(this, {
                    task: () => this.env.scanVillagers(this),
                    id: `scan-villagers`,
                    humanReadableId: `Scanning villagers`,
                }, {}, priorities.user, true)
                if (task) {
                    respond(`Okay`)
                    task.wait()
                        .then(result => respond(`I scanned ${result} villagers`))
                        .catch(error => error === 'cancelled' || respond(error))
                } else {
                    respond(`I'm already scanning villagers`)
                }
            }
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: 'scan crops',
            command: (sender, message, respond) => {
                const task = this.tasks.push(this, {
                    task: function*(bot) {
                        for (let i = bot.env.crops.length - 1; i >= 0; i--) {
                            yield
                            const savedCrop = bot.env.crops[i]
                            if (savedCrop.position.dimension !== bot.dimension) { continue }
                            const block = bot.bot.blockAt(savedCrop.position.xyz(bot.dimension))
                            if (!block) { continue }
                            if (savedCrop.block !== block.name) {
                                bot.env.crops.splice(i, 1)
                            }
                        }
                        const cropNames = new Set(
                            Object.keys(Minecraft.cropsByBlockName)
                                .map(v => bot.mc.registry.blocksByName[v].id)
                        )
                        const blocks = bot.findBlocks({
                            matching: cropNames,
                            count: Infinity,
                            maxDistance: 64,
                        })
                        let n = 0
                        for (const block of blocks) {
                            yield
                            if (!block) { continue }
                            bot.env.crops.push({
                                block: block.name,
                                position: new Vec3Dimension(block.position, bot.dimension),
                            })
                            n++
                        }
                        return n
                    },
                    id: `scan-crops`,
                    humanReadableId: `Scanning crops`,
                }, {}, priorities.user, true)
                if (task) {
                    respond(`Okay`)
                    task.wait()
                        .then(result => respond(`I scanned ${result} crops`))
                        .catch(error => error === 'cancelled' || respond(error))
                } else {
                    respond(`I'm already scanning crops`)
                }
            }
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: 'fish',
            command: (sender, message, respond) => {
                const task = this.tasks.push(this, tasks.fish, {
                    onStatusMessage: respond,
                }, priorities.user, true)
                if (task) {
                    respond(`Okay`)
                    task.wait()
                        .then(result => result ? respond(`I fished ${result} items`) : respond(`I couldn't fish anything`))
                        .catch(error => error === 'cancelled' || respond(error))
                } else {
                    respond(`I'm already fishing`)
                }
            }
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: 'wyh',
            command: (sender, message, respond) => {
                const items = this.bot.inventory.items()

                /**
                 * @type {Array<{ count: number; item: Item; nbt?: NBT }>}
                 */
                const normal = []
                for (const item of items) {
                    let found = false
                    for (const item2 of normal) {
                        if (!isItemEquals(item2.item, item)) { continue }

                        item2.count += item.count
                        found = true
                        break
                    }
                    if (!found) {
                        normal.push({
                            count: item.count,
                            item: item,
                            nbt: item.nbt,
                        })
                    }
                }

                let builder = ''
                for (let i = 0; i < normal.length; i++) {
                    const item = normal[i]
                    if (i > 0) { builder += ' ; ' }
                    if (item.count === 1) {
                        if (item.item.name === 'bundle') {
                            const bundleSize = require('./utils/bundle').size(this.mc.registry, item.item)
                            if (bundleSize === 0) {
                                builder += `${item.item.displayName} (empty)`
                            } else {
                                builder += `${item.item.displayName} (full: ${bundleSize})`
                            }
                        } else {
                            builder += `${item.item.displayName}`
                        }
                    } else if (item.count >= item.item.stackSize) {
                        builder += `${Math.round((item.count / item.item.stackSize) * 10) / 10} stack ${item.item.displayName}`
                    } else {
                        builder += `${item.count} ${item.item.displayName}`
                    }

                    if (item.nbt) {
                        builder += ` (+NBT)`
                    }
                }

                if (builder === '') {
                    respond('Nothing')
                } else {
                    respond(builder)
                }
            }
        }))

        handlers.push(/** @type {RegexpChatHandler} */({
            match: /(stop|cancel|no) quiet/,
            command: (sender, message, respond) => {
                if (!this.userQuiet) {
                    respond(`I'm not trying to be quiet`)
                    return
                }

                respond(`Okay`)
                this.userQuiet = false
            }
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: 'quiet',
            command: (sender, message, respond) => {
                if (this.userQuiet) {
                    respond(`I'm already trying to be quiet`)
                    return
                }

                respond(`Okay`)

                this.userQuiet = true

                return
            }
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: 'compost',
            command: (sender, message, respond) => {
                const task = this.tasks.push(this, tasks.compost, {})
                if (task) {
                    respond(`Okay`)
                    task.wait()
                        .then(result => respond(`I composted ${result} items`))
                        .catch(error => error === 'cancelled' || respond(error))
                } else {
                    respond(`I'm already composting`)
                }
            }
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: 'follow',
            command: (sender, message, respond) => {
                const task = this.tasks.push(this, tasks.followPlayer, {
                    player: sender,
                    range: 2,
                    onNoPlayer: function*(bot) {
                        try {
                            const response = yield* bot.ask(`I lost you. Where are you?`, respond, sender, 30000)
                            const location = parseLocationH(response.message)
                            if (location) {
                                respond(`${location.x} ${location.y} ${location.z} in ${location.dimension} I got it`)
                            }
                            return location
                        } catch (error) {
                            return null
                        }
                    },
                    onStatusMessage: respond,
                })
                if (task) {
                    respond(`Okay`)
                    task.wait()
                        .then(() => { })
                        .catch(error => error === 'cancelled' || respond(error))
                } else {
                    respond(`I'm already following you`)
                }
            }
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: 'wyd',
            command: (sender, message, respond) => {
                if (this.tasks.tasks.length === 0) {
                    respond(`Nothing`)
                } else {
                    let builder = ''
                    for (let i = 0; i < this.tasks.tasks.length; i++) {
                        const task = this.tasks.tasks[i]
                        if (builder) { builder += ' ; ' }
                        builder += `${task.humanReadableId ?? task.id} with priority ${task.priority}`
                    }
                    respond(builder)
                }
                return
            }
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: 'come',
            command: (sender, message, respond) => {
                const task = this.tasks.push(this, {
                    task: function*(bot, args) {
                        const playerEntity = bot.bot.players[args.player]?.entity
                        let location = bot.env.getPlayerPosition(args.player, 10000)
                        if (!location) {
                            try {
                                const response = yield* bot.ask(`Where are you?`, respond, sender, 30000)
                                location = parseLocationH(response.message)
                            } catch (error) {

                            }
                            if (location) {
                                respond(`${location.x} ${location.y} ${location.z} in ${location.dimension} I got it`)
                            } else {
                                throw `I can't find you`
                            }
                        }

                        // const startedAt = performance.now()
                        // let accumulatedTime = 0

                        while (true) {
                            try {
                                return yield* tasks.goto.task(bot, {
                                    ...(playerEntity ? {
                                        entity: playerEntity
                                    } : {
                                        point: location,
                                    }),
                                    distance: 2,
                                    timeout: 30000,
                                    sprint: true,
                                    // onPathUpdated: (path) => {
                                    //     const delta = performance.now() - startedAt
                                    //     const time = tasks.goto.getTime(bot.bot.pathfinder.movements, path)
                                    //     accumulatedTime += time
                                    //     respond(`I'm here in ${Math.round((accumulatedTime - delta) / 100) / 10} seconds`)
                                    // },
                                    onPathReset: (reason) => {
                                        switch (reason) {
                                            case 'dig_error': {
                                                console.warn(`[Bot "${bot.username}"] [Pathfinder] Dig error`)
                                                break
                                            }
                                            case 'no_scaffolding_blocks': {
                                                console.warn(`[Bot "${bot.username}"] [Pathfinder] No scaffolding blocks`)
                                                break
                                            }
                                            case 'place_error': {
                                                console.warn(`[Bot "${bot.username}"] [Pathfinder] Place error`)
                                                break
                                            }
                                            case 'stuck': {
                                                console.warn(`[Bot "${bot.username}"] [Pathfinder] Stuck`)
                                                break
                                            }
                                        }
                                    },
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
                }, priorities.user, true)
                if (task) {
                    respond(`Okay`)
                    task.wait()
                        .then(result => {
                            switch (result) {
                                case 'ok':
                                    respond(`I'm here`)
                                    break
                                case 'here':
                                    respond(`I'm already here`)
                                    break
                                case 'failed':
                                    respond(`I can't get there`)
                                    break
                                default:
                                    break
                            }
                        })
                        .catch(error => error === 'cancelled' || respond(error))
                } else {
                    respond(`I'm already coming to you`)
                }
            }
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: 'sethome',
            command: (sender, message, respond) => {
                const location = this.env.getPlayerPosition(sender, 10000)
                if (!location) {
                    if (location) {
                        respond(`${location.x} ${location.y} ${location.z} in ${location.dimension} I got it`)
                    } else {
                        throw `I can't find you`
                    }
                }
                if (this.memory.idlePosition &&
                    this.memory.idlePosition.dimension === location.dimension &&
                    this.memory.idlePosition.xyz(location.dimension).distanceTo(location.xyz(location.dimension)) < 5) {
                    respond(`This is already my home`)
                    return
                }
                this.memory.idlePosition = location.clone()
                respond(`Okay`)
                try {
                    this.memory.save()
                } catch (error) {
                    console.error(error)
                }
            }
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: 'gethome',
            command: (sender, message, respond) => {
                if (!this.memory.idlePosition) {
                    respond(`I doesn't have a home`)
                } else {
                    respond(`My home is at ${Math.floor(this.memory.idlePosition.x)} ${Math.floor(this.memory.idlePosition.y)} ${Math.floor(this.memory.idlePosition.z)} in ${this.memory.idlePosition.dimension}`)
                }
            }
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: 'tp',
            command: (sender, message, respond) => {
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
                    onStatusMessage: respond,
                }, priorities.user, true)
                if (task) {
                    respond(`Okay`)
                    task.wait()
                        .then(result => {
                            if (result === 'here') {
                                respond(`I'm already here`)
                                return
                            }
                            const error = task.args.destination.distanceTo(this.bot.entity.position)
                            if (error <= 2) {
                                respond(`I'm here`)
                            } else {
                                respond(`I missed by ${Math.round(error)} blocks`)
                            }
                        })
                        .catch(error => error === 'cancelled' || respond(error))
                } else {
                    respond(`I'm already teleporting to you`)
                }
            }
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: 'give all',
            command: (sender, message, respond) => {
                const task = this.tasks.push(this, tasks.giveAll, {
                    player: sender,
                    onStatusMessage: respond,
                }, priorities.user, true)
                if (task) {
                    respond(`Okay`)
                    task.wait()
                        .then(() => respond(`There it is`))
                        .catch(error => error === 'cancelled' || respond(error))
                } else {
                    respond(`I'm already on my way`)
                }
            }
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: 'give trash',
            command: (sender, message, respond) => {
                const task = this.tasks.push(this, tasks.giveTo, {
                    player: sender,
                    items: this.getTrashItems(),
                    onStatusMessage: respond,
                }, priorities.user, true)
                if (task) {
                    respond(`Okay`)
                    task.wait()
                        .then(() => respond(`There it is`))
                        .catch(error => error === 'cancelled' || respond(error))
                } else {
                    respond(`I'm already on my way`)
                }
            }
        }))

        handlers.push(/** @type {RegexpChatHandler} */({
            match: /give\s+(all|[0-9]*)\s*([a-zA-Z_ ]+)/,
            command: (sender, message, respond) => {
                const count = (message[1] === '') ? 1 : (message[1] === 'all') ? Infinity : Number.parseInt(message[1])
                const itemName = message[2].toLowerCase().trim()
                let item = null

                if (!item) {
                    item = this.mc.registry.itemsByName[itemName]
                }

                if (!item) {
                    item = this.mc.registry.itemsByName[itemName.replace(/ /g, '_')]
                }

                if (!item) {
                    for (const _item of this.mc.registry.itemsArray) {
                        if (_item.displayName === itemName) {
                            item = _item
                            break
                        }
                    }
                }

                if (!item) {
                    respond(`I don't know what ${message[2]} is`)
                    return
                }

                const task = this.tasks.push(this, tasks.giveTo, {
                    player: sender,
                    items: [{ name: item.name, count: count }],
                })
                task.wait()
                    .then(result => {
                        if (!result[item.name]) {
                            respond(`I don't have ${item.name}`)
                        } else if (result[item.name] < count && count !== Infinity) {
                            respond(`I had only ${result[item.name]} ${item.name}`)
                        } else {
                            respond(`There it is`)
                        }
                    })
                    .catch(error => error === 'cancelled' || respond(error))
                respond(`Okay`)
            }
        }))

        handlers.push(/** @type {RegexpChatHandler} */({
            match: /goto(\s*$|\s+[\sa-zA-Z0-9_\-]+)/,
            command: (sender, message, respond) => {
                /**
                 * @param {string} rawLocation
                 */
                const confirm = (rawLocation) => {
                    const location = parseAnyLocationH(rawLocation, this)

                    if (!location) {
                        respond(`Bruh`)
                        return
                    }

                    if (typeof location === 'string') {
                        respond(location)
                        return
                    }

                    if ('id' in location) {
                        respond(`Okay`)
                        this.tasks.push(this, tasks.goto, {
                            entity: location,
                            distance: 3,
                            sprint: true,
                        }, priorities.user)
                            ?.wait()
                            .then(result => result === 'here' ? respond(`I'm already at ${rawLocation}`) : respond(`I'm here`))
                            .catch(reason => reason === 'cancelled' || respond(reason))
                    } else {
                        respond(`Okay`)
                        this.tasks.push(this, tasks.goto, {
                            point: location,
                            distance: 3,
                            sprint: true,
                        }, priorities.user)
                            ?.wait()
                            .then(result => result === 'here' ? respond(`I'm already here`) : respond(`I'm here`))
                            .catch(reason => reason === 'cancelled' || respond(reason))
                    }
                }

                if (!message[1]) {
                    this.askAsync(`Where?`, respond, null, 15000)
                        .then(response => confirm(response))
                        .catch(reason => respond(reason))
                } else {
                    confirm(message[1])
                }
            }
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: ['stop', 'cancel'],
            command: (sender, message, respond) => {
                if (!this.tasks.isIdle) {
                    respond(`Okay`)
                }
                this.tasks.cancel()
                    .then(didSomething => didSomething ? respond(`I stopped`) : respond(`I don't do anything`))
                    .catch(error => respond(error))
            }
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: ['stop now', 'abort'],
            command: (sender, message, respond) => {
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
                    respond(`Okay`)
                } else {
                    respond(`I don't do anything`)
                }
            }
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: 'leave',
            command: (sender, message, respond) => {
                this._isLeaving = true
                if (this.tasks.tasks.length === 0) {
                } else if (this.tasks.tasks.length === 1) {
                    respond(`I will leave before finishing this one task`)
                } else {
                    respond(`I will leave before finishing these ${this.tasks.tasks.length} tasks`)
                }
                this.tasks.cancel()
                    .then(() => this.bot.quit(`${sender} asked me to leave`))
            }
        }))

        handlers.push(/** @type {StringChatHandler} */({
            // cspell: disable-next-line
            match: ['fleave', 'leave force', 'leave now', 'leave!'],
            command: (sender, message, respond) => {
                this.bot.quit(`${sender} asked me to leave`)
            }
        }))

        return handlers
    }

    /**
     * @private
     */
    tick() {
        if (Debug.enabled) {
            if (false && this._currentPath) {
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
            }
            this.debug.tick()
        }

        TextDisplay.tick(this)
        BlockDisplay.tick(this)

        if (this.saveTasksInterval?.done()) {
            const json = this.tasks.toJSON()
            fs.writeFileSync(path.join(this._config.worldPath, 'tasks-' + this.username + '.json'), json, 'utf8')
        }

        for (let i = 0; i < 10; i++) {
            this.commands.tick()
        }

        // for (const entityId in this.bot.entities) {
        //     const entity = this.bot.entities[entityId]
        //     const labelId = `entity-${entityId}`
        //     if (entity.name === 'text_display') { continue }
        //     if (!TextDisplay.registry[labelId]) {
        //         new TextDisplay(this.commands, labelId)
        //         TextDisplay.registry[labelId].text = { text: entity.username ?? entity.displayName ?? entity.name ?? '?' }
        //     }
        //     TextDisplay.registry[labelId].setPosition(entity.position.offset(0, entity.height + .3, 0))
        // }

        for (let i = this.lockedItems.length - 1; i >= 0; i--) {
            if (this.lockedItems[i].isUnlocked) {
                this.lockedItems.splice(i, 1)
            }
        }

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

        if (this.saveInterval.done()) {
            this.memory.save()
        }

        this._runningTask = this.tasks.tick()

        if (this._runningTask && this._runningTask.priority >= 0) {
            this._lastImportantTaskTime = performance.now()
        }

        {
            const explodingCreeper = this.env.getExplodingCreeper(this)

            if (explodingCreeper) {
                this.tasks.push(this, tasks.goto, {
                    flee: explodingCreeper,
                    distance: 8,
                    timeout: 300,
                    sprint: true,
                }, priorities.critical)
                return
            }

            const creeper = this.bot.nearestEntity((entity) => entity.name === 'creeper')
            if (creeper && this.bot.entity.position.distanceTo(creeper.position) < 3) {
                this.tasks.push(this, tasks.goto, {
                    flee: creeper,
                    distance: 8,
                    timeout: 300,
                    sprint: true,
                }, priorities.critical - 1)
                return
            }

            const now = performance.now()

            for (const id in this.aimingEntities) {
                const hazard = this.aimingEntities[id]
                if (now - hazard.time > 100) {
                    delete this.aimingEntities[id]
                    continue
                }
                // console.log(`[Bot "${this.username}"] ${hazard.entity.displayName ?? hazard.entity.name ?? 'Someone'} aiming at me`)
                // this.debug.drawPoint(hazard.entity.position, [1, 1, 1])

                const directionToSelf = this.bot.entity.position.clone().subtract(hazard.entity.position).normalize()

                const entityDirection = Math.rotationToVector(hazard.entity.pitch, hazard.entity.yaw)

                const angle = Math.vectorAngle({
                    x: directionToSelf.x,
                    y: directionToSelf.z,
                }, {
                    x: entityDirection.x,
                    y: entityDirection.z,
                })

                if (angle < 0) {
                    this.tasks.push(this, tasks.goto, {
                        point: this.bot.entity.position.offset(-directionToSelf.z * 1, 0, directionToSelf.x * 1),
                        distance: 0,
                        searchRadius: 3,
                        timeout: 500,
                        sprint: true,
                    }, priorities.critical - 2)
                } else {
                    this.tasks.push(this, tasks.goto, {
                        point: this.bot.entity.position.offset(directionToSelf.z * 1, 0, -directionToSelf.x * 1),
                        distance: 0,
                        searchRadius: 3,
                        timeout: 500,
                        sprint: true,
                    }, priorities.critical - 2)
                }
                break
            }

            for (const id in this.incomingProjectiles) {
                const hazard = this.incomingProjectiles[id]
                if (now - hazard.time > 100) {
                    delete this.incomingProjectiles[id]
                    continue
                }

                const projectileDirection = hazard.projectile.entity.velocity.clone().normalize()
                const directionToSelf = this.bot.entity.position.clone().subtract(hazard.projectile.entity.position).normalize()
                const dot = projectileDirection.dot(directionToSelf)
                if (dot <= 0) { continue }

                console.log(`[Bot "${this.username}"] Incoming projectile`)
                // this.debug.drawPoint(hazard.projectile.entity.position, [1, 1, 1])

                this.tasks.push(this, tasks.goto, {
                    point: this.bot.entity.position.offset(-directionToSelf.z * 1, 0, directionToSelf.x * 1),
                    distance: 0,
                    searchRadius: 3,
                    timeout: 500,
                    sprint: true,
                }, priorities.critical - 1)
                break
            }
        }

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
                            hasChanged: () => false,
                            isValid: () => true,
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
                    }, priorities.critical - 1)
                    return true
                }

                return false
            })
        }

        if (this.bot.entity.metadata[0] & 0x01) {
            const water = this.bot.findBlock({
                matching: this.mc.registry.blocksByName['water'].id,
                count: 1,
                maxDistance: 32,
            })
            if (water) {
                this.tasks.push(this, {
                    task: tasks.goto.task,
                    id: `goto-water`,
                    humanReadableId: `Goto water`,
                }, {
                    point: water.position,
                    distance: 0,
                    sprint: true,
                }, priorities.surviving + ((priorities.critical - priorities.surviving) / 2) + 1)
            }
        }

        const badEffects = this.mc.registry.effectsArray.filter(v => v.type === 'bad').map(v => v.id)

        if (Object.keys(this.bot.entity.effects).length > 0) {
            for (const badEffect of badEffects) {
                if (this.bot.entity.effects[badEffect]) {
                    const milk = this.searchInventoryItem(null, 'milk_bucket')
                    if (milk) {
                        this.tasks.push(this, {
                            task: function*(bot) {
                                const milk = bot.searchInventoryItem(null, 'milk_bucket')
                                if (!milk) { throw `I have no milk` }
                                yield* taskUtils.wrap(bot.bot.equip(milk, 'hand'))
                                yield* taskUtils.wrap(bot.bot.consume())
                            },
                            id: 'consume-milk',
                        }, priorities.critical)
                    }
                }
            }
        }

        if (this._runningTask && this._runningTask.priority >= priorities.critical) {
            return
        }

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
                this.tasks.has(this.defendMyselfGoal.id) &&
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
                v.position.clone().subtract(this.bot.entity.position.offset(0, 1.6, 0)).normalize(),
                distance + 2,
                block => { return !block.transparent })
            if (raycast) {
                return false
            }

            return true
        })

        if (hostile) {
            this.defendAgainst(hostile)
        }

        if (!this.bot.pathfinder.path?.length && this.bot.oxygenLevel < 18) {
            /*
            if (this.bot.blockAt(this.bot.entity.position.offset(0, 1, 0))?.name === 'water' ||
                this.bot.blockAt(this.bot.entity.position.offset(0, 0, 0))?.name === 'water') {
                this.tasks.push(this, {
                    task: function(bot, args) {
                        return tasks.goto.task(bot, {
                            goal: {
                                heuristic: (node) => {
                                    const dx = bot.bot.entity.position.x - node.x
                                    const dy = bot.bot.entity.position.y - node.y
                                    const dz = bot.bot.entity.position.z - node.z
                                    return Math.sqrt(dx * dx + dz * dz) + Math.abs(dy)
                                },
                                isEnd: (node) => {
                                    const blockGround = bot.bot.blockAt(node.offset(0, -1, 0))
                                    const blockFoot = bot.bot.blockAt(node)
                                    const blockHead = bot.bot.blockAt(node.offset(0, 1, 0))
                                    if (blockFoot.name !== 'water' &&
                                        blockHead.name !== 'water' &&
                                        blockGround.name !== 'air') {
                                        return true
                                    }
                                    return false
                                },
                                hasChanged: () => false,
                                isValid: () => true,
                            },
                            options: {
                                searchRadius: 20,
                                timeout: 1000,
                            },
                        })
                    },
                    id: `get-out-water`,
                    humanReadableId: `Getting out of water`,
                }, {}, priorities.surviving + 1)
            }
            */

            if (this.bot.blockAt(this.bot.entity.position.offset(0, 0.5, 0))?.name === 'water') {
                this.bot.setControlState('jump', true)
            } else if (this.bot.controlState['jump']) {
                this.bot.setControlState('jump', false)
            }
        }

        if (this.bot.food < 18 &&
            !this.quietMode) {
            if ((this.mc.filterFoods(this.bot.inventory.items(), 'foodPoints', false).length > 0)) {
                this.tasks.push(this, tasks.eat, {
                    sortBy: 'foodPoints',
                    includeRaw: false,
                }, priorities.surviving)
                return
            }
        }

        {
            const now = performance.now()
            for (const by in this.memory.hurtBy) {
                for (let i = 0; i < this.memory.hurtBy[by].length; i++) {
                    const at = this.memory.hurtBy[by][i]
                    if (now - at > 10000) {
                        this.memory.hurtBy[by].splice(i, 1)
                    }
                }

                if (!this.memory.hurtBy[by] ||
                    this.memory.hurtBy[by].length === 0) { continue }

                {
                    const entity = this.bot.entities[by]
                    if (entity &&
                        entity.isValid) {
                        let canAttack = true
                        // @ts-ignore
                        const player = Object.values(this.bot.players).find(v => v && v.entity && v.entity.id == by)
                        if (player && (
                            player.gamemode === 1 ||
                            player.gamemode === 3
                        )) {
                            canAttack = false
                        }
                        if (!canAttack) {
                            console.warn(`[Bot "${this.username}"]: Can't attack ${entity.name}`)
                            delete this.memory.hurtBy[by]
                        } else if (Math.entityDistance(this.bot.entity.position.offset(0, 1.6, 0), entity) < 4) {
                            this.bot.attack(entity)
                            delete this.memory.hurtBy[by]
                        } else if (!player && (entity.type === 'hostile' || entity.type === 'mob')) {
                            this.defendAgainst(entity)
                        }
                    }
                }

                /*
                if (!this.memory.hurtBy[by] ||
                    this.memory.hurtBy[by].length === 0) { continue }

                {
                    this.tasks.push(this, {
                        task: function*(bot, args) {
                            if (!args.by || !args.by.isValid) {
                                throw `Entity disappeared`
                            }
                            yield* goto.task(bot, {
                                point: args.by.position,
                                distance: 4,
                            })
                            if (!args.by || !args.by.isValid) {
                                throw `Entity disappeared`
                            }
                            bot.bot.attack(args.by)
                        },
                        id: function(args) {
                            return `punch-${args.by?.displayName ?? args.by?.name ?? 'null'}`
                        },
                        humanReadableId: function(args) {
                            return `Punch ${args.by?.displayName ?? args.by?.name ?? 'someone'}`
                        },
                    }, { by: this.bot.entities[by] }, 0)
                    delete this.memory.hurtBy[by]
                }
                */
            }
        }

        if (this.defendMyselfGoal &&
            !this.defendMyselfGoal.isDone) {
            return
        }

        for (const request of this.env.itemRequests) {
            if (request.lock.by === this.username) { continue }
            if (request.getStatus() !== 'none') { continue }
            if (!this.inventoryItemCount(null, { name: request.lock.item })) { continue }
            console.log(`[Bot "${this.username}"] Serving ${request.lock.item} to ${request.lock.by}`)
            request.onTheWay()
            this.tasks.push(this, tasks.giveTo, {
                player: request.lock.by,
                items: [{
                    name: request.lock.item,
                    count: request.lock.count,
                }],
            }, priorities.otherBots)
                ?.wait()
                .then(result => {
                    const givenCount = result[request.lock.item] ?? 0
                    if (givenCount >= request.lock.count) {
                        request.callback(true)
                    } else {
                        request.callback(false)
                    }
                })
                .catch(reason => request.callback(false))
        }

        if (this.trySleepInterval?.done() &&
            tasks.sleep.can(this)) {
            this.tasks.push(this, tasks.sleep, {}, priorities.low)
        }

        if (performance.now() - this._lastImportantTaskTime < 10000) {
            return
        }

        this.doBoredomTasks()
    }

    doBoredomTasks() {
        if (this.loadCrossbowsInterval.done()) {
            this.tasks.push(this, {
                task: function*(bot) {
                    const crossbows =
                        bot.inventoryItems(null)
                            .filter(v => v.name === 'crossbow')
                            .toArray()
                    // console.log(`[Bot "${bot.username}"] Loading ${crossbows.length} crossbows`)
                    for (const crossbow of crossbows) {
                        if (!tasks.attack.isCrossbowCharged(crossbow) &&
                            bot.searchInventoryItem(null, 'arrow')) {
                            const weapon = tasks.attack.resolveRangeWeapon(crossbow)
                            yield* taskUtils.wrap(bot.bot.equip(crossbow, 'hand'))
                            bot.activateHand('right')
                            yield* taskUtils.sleepG(Math.max(100, weapon.chargeTime))
                            bot.deactivateHand()
                        }
                    }
                },
                id: 'load-crossbow',
            }, {
                silent: true
            }, priorities.low)
        }

        if (this.memory.mlgJunkBlocks.length > 0) {
            this.tasks.push(this, tasks.clearMlgJunk, {}, priorities.cleanup)
            return
        }

        if (this.memory.myArrows.length > 0) {
            this.tasks.push(this, {
                task: function*(bot) {
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
            }, {}, priorities.cleanup)
        }

        if (tasks.pickupItem.can(this, { inAir: false, maxDistance: 40, minLifetime: 5000 })) {
            this.tasks.push(this, tasks.pickupItem, { inAir: false, maxDistance: 40, minLifetime: 5000 }, priorities.unnecessary)
        }

        if (this.env.getClosestXp(this, { maxDistance: 40 })) {
            this.tasks.push(this, tasks.pickupXp, { maxDistance: 40 }, priorities.unnecessary)
        }

        if (this.tryAutoHarvestInterval?.done()) {
            if (this.env.getCrop(this, this.bot.entity.position.clone(), true)) {
                this.tasks.push(this, {
                    task: BruhBot.tryHarvestCrops,
                    id: `harvest-crops`,
                }, {}, priorities.unnecessary)
            }
        }

        if (this.tryRestoreCropsInterval?.done()) {
            this.tasks.push(this, {
                task: BruhBot.tryRestoreCrops,
                id: `check-crops`,
                humanReadableId: `Checking crops`,
            }, priorities.unnecessary)
        }

        if (this.breedAnimalsInterval?.done()) {
            this.tasks.push(this, {
                task: BruhBot.breedAnimals,
                id: `breed-animals`,
                humanReadableId: `Breed animals`,
            }, {}, priorities.unnecessary)
        }

        if (this.dumpTrashInterval?.done()) {
            this.tasks.push(this, {
                task: BruhBot.dumpTrash,
                id: 'dump-trash',
            }, {}, priorities.unnecessary)
        }

        if (this.ensureEquipmentInterval?.done()) {
            this.tasks.push(this, {
                task: BruhBot.ensureEquipment,
                id: 'ensure-equipment',
            }, {}, priorities.unnecessary)
        }

        this.doNothing()
    }

    doNothing() {
        if (this.tasks.isIdle) {
            if (this.goBackInterval?.done() &&
                this.memory.idlePosition &&
                this.dimension === this.memory.idlePosition.dimension && (
                    this.bot.entity.position.distanceTo(this.memory.idlePosition.xyz(this.dimension)
                    )) > 10) {
                this.tasks.push(this, {
                    task: tasks.goto.task,
                    id: `goto-idle-position`,
                    humanReadableId: `Goto idle position`,
                }, {
                    point: this.memory.idlePosition,
                    distance: 4,
                    sprint: false,
                }, -999)
            }
        } else {
            this.goBackInterval?.restart()
        }

        if (this.tasks.isIdle || (
            this._runningTask &&
            this._runningTask.id.startsWith('follow') &&
            !this.bot.pathfinder.goal
        )
        ) {
            if (this.moveAwayInterval?.done()) {
                const roundedSelfPosition = this.bot.entity.position.rounded()
                for (const playerName in this.bot.players) {
                    if (playerName === this.username) { continue }
                    const playerEntity = this.bot.players[playerName].entity
                    if (!playerEntity) { continue }
                    if (roundedSelfPosition.equals(playerEntity.position.rounded())) {
                        this.tasks.push(this, tasks.goto, {
                            flee: playerEntity,
                            distance: 2,
                        }, priorities.unnecessary)
                        return
                    }
                }
            }

            if (this.lookAtNearestPlayer()) {
                this.randomLookInterval?.restart()
                return
            }

            if (this.randomLookInterval?.done()) {
                this.lookRandomly()
                return
            }
        }
    }

    /**
     * @type {import('./task').SimpleTaskDef}
     */
    static *ensureEquipment(bot) {
        const equipment = require('./equipment')

        let foodPointsInInventory = 0
        for (const item of bot.bot.inventory.items()) {
            if (!Minecraft.badFoods.includes(item.name)) {
                const food = bot.mc.registry.foods[item.type]
                if (food) {
                    foodPointsInInventory += food.foodPoints * item.count
                }
            }
        }

        const sortedEquipment = equipment.toSorted((a, b) => {
            let _a = 0
            let _b = 0
            switch (a.priority) {
                case 'must': _a = 2; break
                case 'maybe': _a = 1; break
                default: break
            }
            switch (b.priority) {
                case 'must': _b = 2; break
                case 'maybe': _b = 1; break
                default: break
            }
            return _b - _a
        })

        for (const item of sortedEquipment) {
            switch (item.type) {
                case 'food': {
                    if (foodPointsInInventory >= item.food) { break }
                    const foods = bot.mc.getGoodFoods(false).map(v => v.name)
                    // console.warn(`[Bot "${bot.username}"] Low on food`)
                    try {
                        yield* tasks.gatherItem.task(bot, {
                            item: foods,
                            count: 1,
                            force: true,
                            canCraft: true,
                            canDig: true,
                            canKill: false,
                            canUseChests: true,
                            canUseInventory: true,
                            canRequestFromPlayers: false && item.priority === 'must',
                            canHarvestMobs: true,
                        })
                    } catch (error) {
                        console.error(error)
                    }
                    break
                }
                case 'single': {
                    if (bot.inventoryItemCount(null, { name: item.item }) > 0) { break }
                    try {
                        yield* tasks.gatherItem.task(bot, {
                            item: item.item,
                            count: 1,
                            canCraft: true,
                            canDig: true,
                            canKill: false,
                            canUseChests: true,
                            canUseInventory: true,
                            canRequestFromPlayers: false && item.priority === 'must',
                            canTrade: true,
                            canHarvestMobs: true,
                        })
                    } catch (error) {
                        console.error(error)
                    }
                    break
                }
                case 'any': {
                    if (item.item.find(v => bot.inventoryItemCount(null, { name: v }) > 0)) { break }
                    try {
                        yield* tasks.gatherItem.task(bot, {
                            item: item.prefer,
                            count: 1,
                            canCraft: true,
                            canDig: true,
                            canKill: false,
                            canUseChests: true,
                            canUseInventory: true,
                            canRequestFromPlayers: false && item.priority === 'must',
                            canTrade: true,
                            canHarvestMobs: true,
                        })
                    } catch (error) {
                        console.error(error)
                    }
                    break
                }
                default: {
                    break
                }
            }
        }
    }

    /**
     * @type {import('./task').SimpleTaskDef}
     */
    static *tryRestoreCrops(bot) {
        /** @type {Array<import('./environment').SavedCrop>} */
        const crops = []
        for (const crop of bot.env.crops.filter(v => v.position.dimension === bot.dimension && v.block !== 'brown_mushroom' && v.block !== 'red_mushroom')) {
            yield
            const blockAt = bot.bot.blockAt(crop.position.xyz(bot.dimension))
            if (!blockAt) { continue }
            if (blockAt.name === 'air') { crops.push(crop) }
        }
        if (crops.length === 0) { return }
        yield* tasks.plantSeed.task(bot, {
            harvestedCrops: crops,
        })
    }

    /**
     * @type {import('./task').SimpleTaskDef<number>}
     */
    static *tryHarvestCrops(bot) {
        const harvested = yield* tasks.harvest.task(bot, {})

        for (const crop of bot.env.crops.filter(v => v.position.dimension === bot.dimension && v.block !== 'brown_mushroom' && v.block !== 'red_mushroom')) {
            const blockAt = bot.bot.blockAt(crop.position.xyz(bot.dimension))
            if (!blockAt) { continue }
            if (blockAt.name !== 'air') { continue }
            return 0
        }

        yield* tasks.compost.task(bot, {})

        return harvested
    }

    /**
     * @type {import('./task').SimpleTaskDef<number>}
     */
    static *breedAnimals(bot) {
        const fencings = yield* bot.env.scanFencings(bot)
        let n = 0
        let _error = null
        for (const fencing of fencings) {
            try {
                n += yield* tasks.breed.task(bot, {
                    animals: Object.values(fencing.mobs),
                })
            } catch (error) {
                console.error(error)
                _error ??= error
            }
        }
        if (!n) { throw _error }
        return n
    }

    /**
     * @type {import('./task').SimpleTaskDef<boolean>}
     */
    static *dumpTrash(bot) {
        const trashItems = bot.getTrashItems()
        if (trashItems.length === 0) { return false }
        return yield* tasks.dumpToChest.task(bot, {
            items: trashItems
        })
    }

    /**
     * @param {import("prismarine-entity").Entity} hazard
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
            !this.tasks.has(this.defendMyselfGoal.id)) {
            console.log(`[Bot "${this.username}"] New attack task`)
            this.defendMyselfGoal = this.tasks.push(this, tasks.attack, {
                targets: { [hazard.id]: hazard },
                useBow: true,
                useMelee: true,
                useMeleeWeapon: true,
            }, priorities.surviving + ((priorities.critical - priorities.surviving) / 2))
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
            this.lookAtPlayer++
        }

        while (this.lookAtPlayer < 0) {
            this.lookAtPlayerTimeout.restart()
            this.lookAtPlayer += players.length
        }

        while (this.lookAtPlayer >= players.length) {
            this.lookAtPlayerTimeout.restart()
            this.lookAtPlayer -= players.length
        }

        const selected = players[this.lookAtPlayer]

        if (!selected?.entity) { return false }

        const playerEye = (selected.entity.metadata[6] === 5)
            ? selected.entity.position.offset(0, 1.2, 0)
            : selected.entity.position.offset(0, 1.6, 0)

        // const vec = rotationToVector(nearest.pitch, nearest.yaw)
        // 
        // const vecIn = bot.entity.position.offset(0, 1.6, 0).subtract(playerEye).normalize()
        // let a = 1 - Math.max(vecIn.dot(vec), 0)
        // 
        // if (a < 0) { a = 0 }
        // if (a > 1) { a = 1 }
        // 
        // a = Math.sqrt(a)
        // 
        // // console.log(a)
        // 
        // const yawToPlayer = Math.atan2(vecIn.x, vecIn.z)
        // const pitchToPlayer = Math.asin(-vecIn.y)
        // 
        // let yaw = lerpRad(yawToPlayer, nearest.yaw, a)
        // let pitch = lerp(pitchToPlayer, nearest.pitch, a)
        // 
        // // console.log(nearest.pitch, nearest.yaw)
        // // console.log(vec)
        // console.log(yaw, pitch)
        // bot.look(yaw, pitch)

        this.bot.lookAt(playerEye)
        return true
    }

    /**
     * @private
     */
    lookRandomly() {
        const pitch = Math.randomInt(-40, 30)
        const yaw = Math.randomInt(-180, 180)
        this.bot.look(yaw * Math.deg2rad, pitch * Math.deg2rad)
    }

    /**
     * @param {string} sender
     * @param {string} message
     * @param {(reply: any) => void} respond
     */
    handleChat(sender, message, respond) {
        if (sender === this.username) { return }

        message = message.trim()

        for (const handler of this.chatHandlers) {
            if (typeof handler.match === 'string') {
                if (handler.match === message) {
                    // @ts-ignore
                    handler.command(sender, message, respond)
                    return
                }
            } else if (typeof handler.match === 'object' &&
                Array.isArray(handler.match)) {
                if (handler.match.includes(message)) {
                    // @ts-ignore
                    handler.command(sender, message, respond)
                    return
                }
            } else {
                // @ts-ignore
                if (handler.match.exec(message)) {
                    // @ts-ignore
                    handler.command(sender, handler.match.exec(message), respond)
                    return
                }
            }
        }

        if (this.chatAwaits.length > 0) {
            const chatAwait = this.chatAwaits[0]
            if (chatAwait.onChat(sender, message) || chatAwait.done) {
                this.chatAwaits.shift()
                return
            }
        }

        {
            /**
             * @type {ChatHandler | null}
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
                        bestHandler = handler
                    }
                } else if (typeof handler.match === 'object' &&
                    Array.isArray(handler.match)) {
                    for (const _match of handler.match) {
                        const match = levenshtein(_match, message)
                        if (match.steps < bestMatchSteps) {
                            bestMatchSteps = match.steps
                            bestMatch = _match
                            bestHandler = handler
                            break
                        }
                    }
                }
            }

            // console.log(`Best match:`, bestMatch, bestMatchSteps)
            if (bestMatchSteps <= 1) {
                this.askAsync(`Did you mean '${bestMatch}'?`, respond, sender, 10000)
                    .then(res => {
                        if (parseYesNoH(res)) {
                            // @ts-ignore
                            bestHandler.command(sender, message, respond)
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
     * @param {(message: string, sender: string) => boolean} [matcher]
     * @returns {import('./task').Task<{ message: string; sender: string; }>}
     */
    *ask(message, send, player, timeout, matcher) {
        while (this.chatAwaits.length > 1) { yield }
        /** @type {{ message: string; sender: string; } | null} */
        let response = null
        /**
         * @type {ChatAwait}
         */
        const chatAwait = {
            onChat: (/** @type {string} */ username, /** @type {string} */ message) => {
                if (player && username !== player) { return false }
                if (!player && username === this.username) { return false }
                if (matcher && !matcher(message, username)) { return false }
                response = { message: message, sender: username }
                return true
            },
            done: false,
        }
        this.chatAwaits.push(chatAwait)
        send(message)
        const timeoutAt = timeout ? (performance.now() + timeout) : null
        while (true) {
            if (response) {
                chatAwait.done = true
                return response
            }
            if (timeoutAt && timeoutAt < performance.now()) {
                chatAwait.done = true
                throw 'Timed out'
            }
            yield* taskUtils.sleepG(200)
        }
    }

    /**
     * @param {string} message
     * @param {(message: string) => void} send
     * @param {string} [player]
     * @param {number} [timeout]
     * @returns {import('./task').Task<{ message: true | false | null; sender: string; }>}
     */
    *askYesNo(message, send, player, timeout) {
        const yes = [
            'y',
            'yes',
            'ye',
            'yah',
            'yeah',
        ]
        const no = [
            'n',
            'no',
            'nope',
            'nuhuh',
            'nuh uh',
        ]
        const response = yield* this.ask(message, send, player, timeout, (message, sender) => {
            return yes.includes(message) || no.includes(message)
        })
        return {
            sender: response.sender,
            message: yes.includes(response.message) ? true : no.includes(response.message) ? false : null,
        }
    }

    /**
     * @param {string} message
     * @param {(message: string) => void} send
     * @param {string} [player]
     * @param {number} [timeout]
     * @returns {Promise<string>}
     */
    async askAsync(message, send, player, timeout) {
        /** @type {string | null} */
        let response = null
        /**
         * @type {ChatAwait}
         */
        const chatAwait = {
            onChat: (/** @type {string} */ username, /** @type {string} */ message) => {
                if (player && username !== player) { return false }
                response = message
                return true
            },
            done: false,
        }
        this.chatAwaits.push(chatAwait)

        send(message)

        const timeoutAt = timeout ? (performance.now() + timeout) : null
        while (true) {
            if (response) {
                chatAwait.done = true
                return response
            }
            if (timeoutAt && timeoutAt < performance.now()) {
                chatAwait.done = true
                throw 'Timed out'
            }
            await taskUtils.sleep(100)
        }
    }

    //#endregion

    //#region Items & Inventory

    /**
     * @returns {Array<{ name: string; count: number; nbt?: NBT; }>}
     */
    getTrashItems() {
        // TODO: dump from offhands and armor slots
        let result = this.inventoryItems(this.bot.inventory)
            .toArray()
            .map(v => ({ name: v.name, count: v.count, nbt: v.nbt }))
        result = filterOutEquipment(result, this.mc.registry)
        result = filterOutItems(result, this.lockedItems
            .filter(v => !v.isUnlocked)
            .map(v => ({ name: v.item, count: v.count })))
        return result
    }

    /**
     * @param {string} by
     * @param {string} item
     * @param {number} count
     * @returns {ItemLock | null}
     */
    tryLockItems(by, item, count) {
        if (!count) { return null }
        const trash = this.getTrashItems().filter(v => v.name === item)
        if (trash.length === 0) { return null }
        let have = 0
        for (const trashItem of trash) { have += trashItem.count }
        const lock = new ItemLock(by, item, Math.min(count, have))
        this.lockedItems.push(lock)
        return lock
    }

    /**
     * @param {import('prismarine-windows').Window | null} window
     * @param {ReadonlyArray<string>} items
     * @returns {Item | null}
     */
    searchInventoryItem(window, ...items) {
        return this.inventoryItems(window).filter(v => {
            for (const searchFor of items) {
                if (v.name === searchFor) { return true }
            }
            return false
        }).first() ?? null
    }

    /**
     * @param {import('prismarine-windows').Window} [window]
     * @returns {Iterable<Item>}
     */
    inventoryItems(window) {
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

        return new Iterable(function*() {
            for (let i = window.inventoryStart; i < window.inventoryEnd; i++) {
                const item = window.slots[i]
                if (!item) { continue }
                yield item
            }

            for (const specialSlotId of specialSlotIds) {
                if (specialSlotId >= window.inventoryStart &&
                    specialSlotId < window.inventoryEnd) { continue }
                const item = window.slots[specialSlotId]
                if (!item) { continue }
                yield item
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
     * @param {import('prismarine-windows').Window} [window] 
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

        /**
         * @type {Record<number, Item>}
         */
        const slots = {}

        for (let i = window.inventoryStart; i < window.inventoryEnd; i++) {
            const item = window.slots[i]
            if (!item) { continue }
            console.assert(item.slot === i)
            slots[i] = item
        }

        for (const specialSlotId of specialSlotIds) {
            const item = window.slots[specialSlotId]
            if (!item) { continue }
            console.assert(item.slot === specialSlotId)
            slots[specialSlotId] = item
        }

        return slots
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
     * @param {Readonly<{ name: string; nbt?: NBT; }>} item
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
     * @param {Readonly<{ name: string; nbt?: NBT; }>} item
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
     * @param {Readonly<{ name: string; nbt?: NBT; }> | null} [item]
     * @returns {number | null}
     */
    firstFreeInventorySlot(window = null, item = null) {
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
     * @param {Readonly<{ name: string; nbt?: NBT; }> | null} [item]
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
     * @param {string} item
     */
    holds(item, offhand = false) {
        if (offhand) {
            if (this.bot.supportFeature('doesntHaveOffHandSlot')) { return false }

            const slot = this.bot.inventory.slots[this.bot.getEquipmentDestSlot('off-hand')]
            if (!slot) { return false }

            return slot.name === item
        } else {
            const slot = this.bot.inventory.slots[this.bot.getEquipmentDestSlot('hand')]
            if (!slot) { return false }

            return slot.name === item
        }
    }

    /**
     * @param {string | null} item
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
            if (item && item === slot.name) { return false }
        }

        return true
    }

    /**
     * @param {MineFlayer.Chest} chest
     * @param {Vec3} chestBlock
     * @param {Readonly<{ name: string; nbt?: NBT; }>} item
     * @param {number} count
     * @returns {import('./task').Task<number>}
     */
    *chestDeposit(chest, chestBlock, item, count) {
        const depositCount = (count === Infinity) ? this.inventoryItemCount(chest, item) : count
        if (depositCount === 0) {
            return 0
        }

        const stackSize = this.mc.registry.itemsByName[item.name].stackSize

        const botSlots = this.inventorySlots(chest)
        const botItems = Object.keys(botSlots)
            .map(i => Number.parseInt(i))
            .map(i => ({ slot: i, item: botSlots[i] }))
            .filter(v => isItemEquals(v.item, item) && v.item.count)

        if (botItems.length === 0) {
            return 0
        }

        if (!botItems[0]?.item) {
            return 0
        }

        const actualCount = Math.min(
            depositCount,
            botItems[0].item.count,
            stackSize
        )

        const destinationSlot = this.firstFreeContainerSlot(chest, item)
        if (destinationSlot === null) {
            return 0
        }

        const sourceSlot = botItems[0].slot

        yield* taskUtils.wrap(this.bot.transfer({
            window: chest,
            itemType: this.mc.registry.itemsByName[item.name].id,
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
            item.name,
            actualCount)

        return actualCount
    }

    /**
     * @param {MineFlayer.Chest} chest
     * @param {Vec3} chestBlock
     * @param {Readonly<{ name: string; nbt?: NBT; }>} item
     * @param {number} count
     * @returns {import('./task').Task<number>}
     */
    *chestWithdraw(chest, chestBlock, item, count) {
        const withdrawCount = Math.min(this.containerItemCount(chest, item), count)
        if (withdrawCount === 0) {
            console.warn(`No ${item?.name} in the chest`)
            return 0
        }

        const stackSize = this.mc.registry.itemsByName[item.name].stackSize

        const containerSlots = this.containerSlots(chest)
        const containerItems = Object.keys(containerSlots)
            .map(i => Number.parseInt(i))
            .map(i => ({ slot: i, item: containerSlots[i] }))
            .filter(v => (v.item) && isItemEquals(v.item, item) && (v.item.count))

        if (containerItems.length === 0) {
            console.warn(`No ${item?.name} in the chest (what?)`)
            return 0
        }

        if (!containerItems[0]?.item) {
            console.warn(`No ${item?.name} in the chest (what???)`)
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
            itemType: this.mc.registry.itemsByName[item.name].id,
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
            item.name,
            -actualCount)

        return actualCount
    }

    /**
     * @param {ReadonlyArray<string>} item
     * @returns {import('./task').Task<{ name: string; count: number; nbt: NBT | null; slot: number; } | null>}
     */
    *ensureItems(...item) {
        let result = this.searchInventoryItem(null, ...item)
        if (result) { return result }

        try {
            const gathered = yield* tasks.gatherItem.task(this, {
                item: item,
                count: 1,
                canUseInventory: true,
                canUseChests: true,
            })
            result = this.searchInventoryItem(null, gathered.item)
            if (result) { return result }
        } catch (error) { }

        return null
    }

    /**
     * @param {string} item
     * @param {number} count
     * @returns {import('./task').Task<Item | null>}
     */
    *ensureItem(item, count = 1) {
        if (count === null || count === undefined) {
            count = 1
        }

        const has = this.inventoryItemCount(null, { name: item })

        if (has >= count) {
            const result = this.searchInventoryItem(null, item)
            if (result) { return result }
        }

        try {
            const gathered = yield* tasks.gatherItem.task(this, {
                item: item,
                count: count,
                canUseInventory: true,
                canUseChests: true,
            })
            const result = this.searchInventoryItem(null, gathered.item)
            if (result) { return result }
        } catch (error) { }

        return null
    }

    //#endregion

    //#region Basic Actions

    /**
     * @param {'right' | 'left'} hand
     */
    activateHand(hand) {
        if (hand === 'right') {
            this._isRightHandActive = true
            this.bot.activateItem(false)
            return
        }

        if (hand === 'left') {
            this._isLeftHandActive = true
            this.bot.activateItem(true)
            return
        }

        throw new Error(`Invalid hand "${hand}"`)
    }

    deactivateHand() {
        this._isLeftHandActive = false
        this._isRightHandActive = false
        this.bot.deactivateItem()
    }

    /**
     * @param {import("prismarine-block").Block | import("prismarine-entity").Entity} chest
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
     * @throws {Error}
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
                this.bot.off('actionBar', onMount)
                return
                // throw new Error(`Could not mount the entity`)
            }
            yield
        }
    }

    /**
     * @param {string} item
     * @param {number} [count = 1]
     * @throws {Error}
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
            'hand',
            'off-hand',
        ]

        let tossed = 0
        for (const have of this.inventoryItems()) {
            if (have.name !== item) { continue }
            for (const specialSlotName of specialSlotNames) {
                if (this.bot.getEquipmentDestSlot(specialSlotName) !== have.slot) { continue }
                yield* taskUtils.wrap(this.bot.unequip(specialSlotName))
            }
            const tossCount = Math.min(count - tossed, have.count)
            if (tossCount <= 0) { continue }

            yield* taskUtils.wrap(this.bot.toss(this.mc.registry.itemsByName[have.name].id, null, tossCount))
            tossed += tossCount
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
     * @param {string} item
     * @param {boolean} [allocate]
     * @returns {import('./task').Task<boolean>}
     * @throws {Error}
     */
    *place(referenceBlock, faceVector, item, allocate = true) {
        const itemId = this.mc.registry.itemsByName[item].id
        const above = referenceBlock.position.offset(faceVector.x, faceVector.y, faceVector.z)
        const blockLocation = new Vec3Dimension(above, this.dimension)
        if (allocate) {
            if (!this.env.allocateBlock(this.username, blockLocation, 'place', { item: itemId })) {
                return false
            }

            const holds = this.bot.inventory.slots[this.bot.getEquipmentDestSlot('hand')]
            if (!holds || holds.name !== item) {
                yield* taskUtils.wrap(this.bot.equip(itemId, 'hand'))
            }

            yield* taskUtils.wrap(this.bot._placeBlockWithOptions(referenceBlock, faceVector, { forceLook: 'ignore' }))

            this.env.deallocateBlock(this.username, blockLocation)
            return true
        } else {
            const holds = this.bot.inventory.slots[this.bot.getEquipmentDestSlot('hand')]
            if (!holds || holds.name !== item) {
                yield* taskUtils.wrap(this.bot.equip(itemId, 'hand'))
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
     * @param {{
     *   matching: ReadonlySetLike<number>;
     *   filter?: (block: import('prismarine-block').Block) => boolean;
     *   point?: Vec3
     *   maxDistance?: number
     *   count?: number
     * }} options
     * @returns {Iterable<import('prismarine-block').Block>}
     */
    findBlocks(options) {
        const Block = require('prismarine-block')(this.bot.registry)

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
                    if (options.matching.has(Block.fromStateId(stateId, 0).type)) {
                        return true // the block is in the palette
                    }
                }
                return false // skip
            }
            return true // global palette, the block might be in there
        }

        const bot = this.bot

        return new Iterable(function*() {
            const point = (options.point || bot.entity.position).floored()
            const maxDistance = options.maxDistance || 16
            const count = options.count || 1
            const start = new Vec3(Math.floor(point.x / 16), Math.floor(point.y / 16), Math.floor(point.z / 16))
            const it = new (require('prismarine-world').iterators.OctahedronIterator)(start, Math.ceil((maxDistance + 8) / 16))
            // the octahedron iterator can sometime go through the same section again
            // we use a set to keep track of visited sections
            const visitedSections = new Set()

            let n = 0
            let startedLayer = 0
            let next = start
            while (next) {
                yield
                const column = bot.world.getColumn(next.x, next.z)
                // @ts-ignore
                const sectionY = next.y + Math.abs(bot.game.minY >> 4)
                // @ts-ignore
                const totalSections = bot.game.height >> 4
                if (sectionY >= 0 && sectionY < totalSections && column && !visitedSections.has(next.toString())) {
                    /** @type {import('prismarine-chunk').PCChunk['sections'][0]} */ //@ts-ignore
                    const section = column.sections[sectionY]
                    if (isBlockInSection(section)) {
                        // @ts-ignore
                        const begin = new Vec3(next.x * 16, sectionY * 16 + bot.game.minY, next.z * 16)
                        const cursor = begin.clone()
                        const end = cursor.offset(16, 16, 16)
                        for (cursor.x = begin.x; cursor.x < end.x; cursor.x++) {
                            for (cursor.y = begin.y; cursor.y < end.y; cursor.y++) {
                                for (cursor.z = begin.z; cursor.z < end.z; cursor.z++) {
                                    const block = bot.blockAt(cursor)
                                    if (options.matching.has(block.type) && (!options.filter || options.filter(block)) && cursor.distanceTo(point) <= maxDistance) {
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
                // @ts-ignore
                if (startedLayer !== it.apothem && n >= count) {
                    break
                }
                // @ts-ignore
                startedLayer = it.apothem
                next = it.next()
            }
        })
    }
}
