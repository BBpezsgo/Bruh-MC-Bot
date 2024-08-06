const MineFlayer = require('mineflayer')
const MineFlayerPathfinder = require('mineflayer-pathfinder')
const MineFlayerElytra = require('mineflayer-elytrafly').elytrafly
const MineFlayerHawkEye = require('minecrafthawkeye').default
const MineFlayerArmorManager = require('mineflayer-armor-manager')
const TaskManager = require('./task-manager')
const goto = require('./tasks/goto')
const MC = require('./mc')
const { Item } = require('prismarine-item')
const meleeWeapons = require('./melee-weapons')
const { Interval, parseLocationH, canEntityAttack, entityRangeOfSight, entityAttackDistance, parseYesNoH } = require('./utils/other')
const taskUtils = require('./utils/tasks')
const mathUtils = require('./utils/math')
const bundle = require('./utils/bundle')
const hawkeye = require('minecrafthawkeye')
const attack = require('./tasks/attack')
const gatherItem = require('./tasks/gather-item')
const eat = require('./tasks/eat')
const fish = require('./tasks/fish')
const followPlayer = require('./tasks/follow-player')
const mlg = require('./tasks/mlg')
const clearMlgJunk = require('./tasks/clear-mlg-junk')
const giveAll = require('./tasks/give-all')
const pickupItem = require('./tasks/pickup-item')
const pickupXp = require('./tasks/pickup-xp')
const harvest = require('./tasks/harvest')
const Environment = require('./environment')
const Memory = require('./memory')
const sleep = require('./tasks/sleep')
const enderpearlTo = require('./tasks/enderpearl-to')
const blockExplosion = require('./tasks/block-explosion')
const plantSeed = require('./tasks/plant-seed')
const giveTo = require('./tasks/give-to')
const equipment = require('./equipment')
const Debug = require('./debug')
const levenshtein = require('damerau-levenshtein')

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
 *   server: {
 *     host: string;
 *     port: number;
 *   }
 *   jarPath: string;
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
     * @type {MC}
     */
    mc

    /**
     * @private @readonly
     * @type {TaskManager}
     */
    tasks

    /**
     * @readonly
     * @type {Array<(username: string, message: string) => boolean>}
     */
    chatAwaits

    /**
     * @readonly
     * @type {MineFlayerPathfinder.Movements}
     */
    permissiveMovements
    /**
     * @readonly
     * @type {MineFlayerPathfinder.Movements}
     */
    restrictedMovements
    /**
     * @readonly
     * @type {MineFlayerPathfinder.Movements}
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
    tryAutoCookInterval
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
    trySleepInterval
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
     * @private @readonly
     * @type {Record<string, { startedLookingAt: number; endedLookingAt: number; }>}
     */
    lookAtPlayers
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
     * @type {boolean}
     */
    quietMode

    /**
     * @private
     * @type {Record<number, { time: number; entity: import('prismarine-entity').Entity; }>}
     */
    aimingEntities

    /**
     * @private
     * @type {Record<number, { time: number; trajectory: ReadonlyArray<import('vec3').Vec3>; projectile: hawkeye.Projectil; }>}
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
     * @readonly
     * @type {import('mineflayer').Dimension}
     */
    get dimension() { return this.bot.game.dimension }

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
     * @param {Readonly<BotConfig>} config
     */
    constructor(config) {
        console.log(`[Bot "${config.bot.username}"] Launching ...`)

        // @ts-ignore
        global.bots ??= {}
        // @ts-ignore
        global.bots[config.bot.username] = this

        this.bot = MineFlayer.createBot({
            host: config.server.host,
            port: config.server.port,
            username: config.bot.username,
            logErrors: false,
        })

        const path = require('path')
        this.env = config.environment ?? new Environment(path.join(config.worldPath, 'environment.json'))
        this.memory = new Memory(this, path.join(config.worldPath, `memory-${config.bot.username}.json`))

        this.env.addBot(this)

        this.chatAwaits = []
        this.quietMode = true
        this._isLeftHandActive = false
        this._isRightHandActive = false
        this.defendMyselfGoal = null
        this.onHeard = null
        this.mc = null
        this.aimingEntities = {}
        this.incomingProjectiles = {}
        this.lockedItems = []

        this.ensureEquipmentInterval = new Interval(60000)
        this.tryAutoCookInterval = new Interval(10000)
        this.dumpTrashInterval = new Interval(30000)
        this.saveInterval = new Interval(30000)
        this.trySleepInterval = new Interval(5000)
        this.tryAutoHarvestInterval = new Interval(5000)
        this.checkQuietInterval = new Interval(500)
        this.randomLookInterval = new Interval(10000)
        this.moveAwayInterval = new Interval(3000)
        this.lookAtPlayers = {}

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

        this.bot.on('chat', (sender, message) => this.handleChat(sender, message, reply => {
            this.bot.chat(stringifyMessage(reply))
        }))

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

        // cspell: disable-next-line
        this.bot.on('incoming_projectil', (projectile, trajectory) => {
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

        this.bot._client.on("damage_event", (packet) => {
            const entity = this.bot.entities[packet.entityId]
            if (!entity) { return }
            /** @type {number} */
            const sourceCauseId = packet.sourceCauseId
            if (!sourceCauseId) { return }
            const source = this.bot.entities[sourceCauseId - 1]
            if (!source) { return }
            if (entity.id === this.bot.entity.id) {
                this.memory.hurtBy[source.id] ??= []
                this.memory.hurtBy[source.id].push(performance.now())
            }
        })

        this.tasks = new TaskManager()

        this.bot.once('inject_allowed', () => {
            console.log(`[Bot "${this.bot.username}"] Loading plugins ...`)
            this.bot.loadPlugin(MineFlayerPathfinder.pathfinder)
            this.bot.loadPlugin(MineFlayerArmorManager)
            this.bot.loadPlugin(MineFlayerHawkEye)
            this.bot.loadPlugin(MineFlayerElytra)

            this.bot.pathfinder.enablePathShortcut = true
            this.bot.hawkEye.startRadar()

            console.log(`[Bot "${this.bot.username}"] Plugins loaded`)
        })

        this.bot.once('spawn', () => {
            console.log(`[Bot "${this.bot.username}"] Spawned`)

            console.log(`[Bot "${this.bot.username}"] Loading ...`)

            // @ts-ignore
            this.mc = new MC(this.bot.version, config.jarPath)

            // @ts-ignore
            this.permissiveMovements = new MineFlayerPathfinder.Movements(this.bot)
            // @ts-ignore
            this.restrictedMovements = new MineFlayerPathfinder.Movements(this.bot)
            // @ts-ignore
            this.cutTreeMovements = new MineFlayerPathfinder.Movements(this.bot)

            this.mc.setPermissiveMovements(this.permissiveMovements)
            this.mc.setRestrictedMovements(this.restrictedMovements)
            this.mc.setRestrictedMovements(this.cutTreeMovements)
            this.cutTreeMovements.blocksCanBreakAnyway.add(this.mc.data.blocksByName['oak_leaves'].id)

            console.log(`[Bot "${this.bot.username}"] Ready`)
        })

        this.bot.on('move', () => {
            if (!this.mc) { return }
            if (this.bot.entity.velocity.y < this.mc.data2.general.fallDamageVelocity) {
                this.tasks.tick()
                this.tasks.push(this, mlg, null, priorities.critical)
                return
            }
        })

        /**
         * @type {MineFlayerPathfinder.PartiallyComputedPath}
         */
        let _path = null

        this.bot.on('path_update', (path) => {
            _path = path
        })

        this.bot.on('path_reset', () => {
            _path = null
        })

        this.bot.on('path_stop', () => {
            _path = null
        })

        this.bot.on('physicsTick', () => {
            if (_path) {
                for (let i = 0; i < _path.path.length; i++) {
                    this.debug.drawLine(_path.path[i - 1] ?? this.bot.entity.position, _path.path[i], [1, 0, 0])
                }
            }
            this.debug.tick()

            for (let i = this.lockedItems.length - 1; i >= 0; i--) {
                if (this.lockedItems[i].isUnlocked) {
                    this.lockedItems.splice(i, 1)
                }
            }

            if (this.checkQuietInterval.is()) {
                let shouldBeQuiet = false

                this.checkQuietInterval.time = shouldBeQuiet ? 5000 : 500

                if (!shouldBeQuiet && this.bot.controlState.sneak && this.tasks.isIdle) {
                    this.bot.setControlState('sneak', false)
                }

                this.permissiveMovements.sneak = shouldBeQuiet
                this.restrictedMovements.sneak = shouldBeQuiet
                this.cutTreeMovements.sneak = shouldBeQuiet
                this.quietMode = shouldBeQuiet
            }

            if (this.saveInterval.is()) {
                this.memory.save()
            }

            const runningTask = this.tasks.tick()

            {
                let creeper = this.env.getExplodingCreeper(this)

                if (creeper) {
                    if (this.searchItem('shield')) {
                        this.tasks.push(this, blockExplosion, null, priorities.critical)
                        return
                    } else {
                        this.tasks.push(this, goto, {
                            flee: creeper.position,
                            distance: 8,
                            timeout: 300,
                        }, priorities.critical)
                        return
                    }
                }

                creeper = this.bot.nearestEntity((entity) => entity.name === 'creeper')
                if (creeper && this.bot.entity.position.distanceTo(creeper.position) < 3) {
                    this.tasks.push(this, goto, {
                        flee: creeper.position,
                        distance: 8,
                        timeout: 300,
                    }, priorities.critical)
                    return
                }

                const now = performance.now()

                for (const id in this.aimingEntities) {
                    const hazard = this.aimingEntities[id]
                    if (now - hazard.time > 100) {
                        delete this.aimingEntities[id]
                        continue
                    }
                    console.log(`[Bot "${this.bot.username}"] ${hazard.entity.displayName ?? hazard.entity.name ?? 'Someone'} aiming at me`)
                    this.debug.drawPoint(hazard.entity.position, [1, 1, 1])

                    const directionToSelf = this.bot.entity.position.clone().subtract(hazard.entity.position).normalize()

                    const entityDirection = mathUtils.rotationToVector(hazard.entity.pitch, hazard.entity.yaw)

                    const angle = mathUtils.vectorAngle({
                        x: directionToSelf.x,
                        y: directionToSelf.z,
                    }, {
                        x: entityDirection.x,
                        y: entityDirection.z,
                    })

                    console.log(angle)
    
                    if (angle < 0) {
                        this.tasks.push(this, goto, {
                            point: this.bot.entity.position.offset(-directionToSelf.z * 1, 0, directionToSelf.x * 1),
                            distance: 0,
                            searchRadius: 3,
                            timeout: 500,
                        }, priorities.critical - 2)
                    } else {
                        this.tasks.push(this, goto, {
                            point: this.bot.entity.position.offset(directionToSelf.z * 1, 0, -directionToSelf.x * 1),
                            distance: 0,
                            searchRadius: 3,
                            timeout: 500,
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

                    console.log(`[Bot "${this.bot.username}"] Incoming projectile`)
                    this.debug.drawPoint(hazard.projectile.entity.position, [1, 1, 1])

                    this.tasks.push(this, goto, {
                        point: this.bot.entity.position.offset(-directionToSelf.z * 1, 0, directionToSelf.x * 1),
                        distance: 0,
                        searchRadius: 3,
                        timeout: 500,
                    }, priorities.critical - 1)
                    break
                }
            }

            if (runningTask && runningTask.priority >= priorities.critical) {
                return
            }

            const hostile = this.bot.nearestEntity(v => {
                if (!canEntityAttack(v)) { return false }
                const rangeOfSight = entityRangeOfSight(v)
                const reachDistance = entityAttackDistance(v)
                if (!rangeOfSight) { return false }
                if (!reachDistance) { return false }
                const distance = v.position.distanceTo(this.bot.entity.position)

                if (distance > rangeOfSight) {
                    // console.log('Range of sight:', distance, rangeOfSight)
                    return false
                }

                const myPosition = this.bot.entity.position.offset(0, 1.6, 0)
                const entityPosition = v.position.offset(0, v.height ?? 0.5, 0)

                /**
                 * @type {import('prismarine-world').iterators.RaycastResult}
                 */
                const intercept = this.bot.world.raycast(myPosition, entityPosition.subtract(myPosition).normalize(), rangeOfSight)
                if (intercept) {
                    // console.log(intercept)
                    return false
                }

                return true
            })

            if (hostile) {
                if (!this.defendMyselfGoal ||
                    this.defendMyselfGoal.isDone ||
                    !this.tasks.has(this.defendMyselfGoal.id)) {
                    this.defendMyselfGoal = this.tasks.push(this, attack, {
                        target: hostile,
                        useBow: true,
                        useMelee: true,
                        useMeleeWeapon: true,
                    }, (args) => {
                        const distance = this.bot.entity.position.distanceTo(args.target.position)
                        const multiplier = (distance < 1) ? 1 : (1 / distance)
                        const maxPriority = priorities.critical - priorities.surviving
                        return priorities.surviving + (maxPriority * multiplier)
                    })
                } else {
                    this.defendMyselfGoal.args.target = hostile
                }
                return
            }

            if (this.bot.food < 18 &&
                !this.quietMode &&
                (this.mc.filterFoods(this.bot.inventory.items(), 'foodPoints').length > 0)) {
                this.tasks.push(this, eat, null, priorities.surviving)
                return
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

                    if (this.memory.hurtBy[by] &&
                        this.memory.hurtBy[by].length >= 1) {
                        const entity = this.bot.entities[by]
                        if (entity &&
                            entity.isValid &&
                            entity.position.distanceTo(this.bot.entity.position) < 4) {
                            let canAttack = true
                            if (entity.username &&
                                this.bot.players[entity.username]) {
                                const player = this.bot.players[entity.username]
                                // cspell: disable-next-line
                                if (player.gamemode === 1 ||
                                    // cspell: disable-next-line
                                    player.gamemode === 3) {
                                    canAttack = false
                                }
                            }
                            if (canAttack) {
                                this.bot.attack(entity)
                                delete this.memory.hurtBy[by]
                            }
                        }
                    }

                    if (this.memory.hurtBy[by] &&
                        this.memory.hurtBy[by].length >= 2) {
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
                                return `punch-${args.by.displayName ?? args.by.name}`
                            },
                            humanReadableId: function(args) {
                                return `Punch ${args.by.displayName ?? args.by.name}`
                            },
                        }, { by: this.bot.entities[by] }, 0)
                        delete this.memory.hurtBy[by]
                    }
                }
            }

            for (const request of this.env.itemRequests) {
                if (request.lock.by === this.bot.username) { continue }
                if (request.getStatus() !== 'none') { continue }
                if (!this.itemCount(request.lock.item)) { continue }
                request.onTheWay()
                this.tasks.push(this, giveTo, {
                    player: request.lock.by,
                    items: [{ name: request.lock.item, count: request.lock.count }],
                }, priorities.otherBots)
                    .wait()
                    .then(() => request.callback(true))
                    .catch(() => request.callback(false))
            }

            if (this.trySleepInterval.is() &&
                sleep.can(this)) {
                this.tasks.push(this, sleep, null, priorities.low)
            }

            if (this.memory.mlgJunkBlocks.length > 0) {
                this.tasks.push(this, clearMlgJunk, null, priorities.cleanup)
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
                            console.warn(`[Bot "${bot.bot.username}"] Can't find the arrow`)
                            return
                        }
                        yield* goto.task(bot, {
                            point: entity.position,
                            distance: 1,
                        })
                        yield* taskUtils.sleepG(1000)
                        if (entity.isValid) {
                            console.warn(`[Bot "${bot.bot.username}"] Can't pick up this arrow`)
                        } else {
                            console.log(`[Bot "${bot.bot.username}"] Arrow picked up`)
                        }
                    },
                    id: function() {
                        return `pickup-my-arrows`
                    },
                    humanReadableId: function() {
                        return `Picking up my arrows`
                    },
                }, null, priorities.cleanup)
            }

            if ('result' in this.env.getClosestItem(this, null, { inAir: false, maxDistance: 5, minLifetime: 5000 })) {
                this.tasks.push(this, pickupItem, { inAir: false, maxDistance: 5, minLifetime: 5000 }, priorities.unnecessary)
            }

            if ('result' in this.env.getClosestXp(this, { maxDistance: 5 })) {
                this.tasks.push(this, pickupXp, { maxDistance: 5 }, priorities.unnecessary)
            }

            if (this.tryAutoHarvestInterval.is()) {
                if (this.env.getCrops(this, this.bot.entity.position.clone(), true).length > 0) {
                    const harvestTask = this.tasks.push(this, harvest, {}, priorities.unnecessary)
                    /*if (harvestTask) {
                        harvestTask.wait()
                      .then(() => {
                                const goal = this.tasks.push(this, compost, null, priorities.unnecessary)
                            })
                            .catch(() => {
                                
                            })
                    }*/
                } else {
                    /** @type {Array<import('./environment').SavedCrop>} */
                    const crops = []
                    for (const crop of this.env.crops.filter(v => v.position.dimension === this.dimension && v.block !== 'brown_mushroom' && v.block !== 'red_mushroom')) {
                        const blockAt = this.bot.blockAt(crop.position.xyz(this.dimension))
                        if (!blockAt) { continue }
                        if (blockAt.name === 'air') { crops.push(crop) }
                    }
                    if (crops.length > 0) {
                        this.tasks.push(this, plantSeed, {
                            harvestedCrops: crops,
                        }, priorities.unnecessary)
                    }
                }
            }

            /*
            if (this.dumpTrashInterval.is()) {
                const trashItems = this.getTrashItems()

                const countedCrashItems = trashItems.map(v => ({ item: v.type, count: v.count }))
                this.tasks.push(this, dumpToChest, { items: countedCrashItems }, priorities.unnecessary)
            }
            */

            /*
            if (this.tryAutoCookInterval.is()) {
                const rawFood = this.searchItem(...MC.rawFoods)
                if (rawFood) {
                    if (this.mc.simpleSeeds.includes(rawFood.type) &&
                        this.itemCount(rawFood.type) <= 1) {
                        // Don't eat plantable foods
                    } else {
                        const recipe = this.getCookingRecipesFromRaw(rawFood.name)
                        if (recipe.length > 0) {
                            if (smelt.findBestFurnace(this, recipe, true)) {
                                this.tasks.push(this, smelt, {
                                    noFuel: true,
                                    recipes: recipe,
                                    count: this.itemCount(rawFood.type),
                                }, priorities.unnecessary)
                                return
                            }
                        }
                    }
                }
            }
            */

            if (this.ensureEquipmentInterval.is()) {
                let foodPointsInInventory = 0
                for (const item of this.bot.inventory.items()) {
                    if (!MC.badFoods.includes(item.name)) {
                        const food = this.mc.data.foods[item.type]
                        if (food) {
                            foodPointsInInventory += food.foodPoints * item.count
                        }
                    }
                }

                for (const item of equipment) {
                    switch (item.type) {
                        case 'food': {
                            if (foodPointsInInventory >= item.food) { break }
                            const foods = this.mc.getGoodFoods(false).map(v => v.name)
                            console.warn(`[Bot "${this.bot.username}"] Low on food`)
                            this.tasks.push(this, gatherItem, {
                                item: foods,
                                count: 1,
                                canCraft: true,
                                canDig: false,
                                canKill: false,
                                canUseChests: true,
                                canUseInventory: true,
                            }, priorities.low)
                            break
                        }
                        case 'single': {
                            if (this.itemCount(item.item) > 0) { break }
                            this.tasks.push(this, gatherItem, {
                                item: item.item,
                                count: 1,
                                canCraft: true,
                                canDig: false,
                                canKill: false,
                                canUseChests: true,
                                canUseInventory: true,
                            }, priorities.unnecessary)
                            break
                        }
                        case 'any': {
                            if (item.item.find(v => this.itemCount(v) > 0)) { break }
                            this.tasks.push(this, gatherItem, {
                                item: item.prefer,
                                count: 1,
                                canCraft: true,
                                canDig: false,
                                canKill: false,
                                canUseChests: true,
                                canUseInventory: true,
                            }, priorities.unnecessary)
                            break
                        }
                        default: {
                            break
                        }
                    }
                }
            }

            if (this.tasks.isIdle || (
                runningTask &&
                runningTask.id.startsWith('follow') &&
                !this.bot.pathfinder.goal
            )
            ) {
                if (this.moveAwayInterval.is()) {
                    const roundedSelfPosition = this.bot.entity.position.clone().round()
                    for (const playerName in this.bot.players) {
                        if (playerName === this.bot.username) { continue }
                        const playerEntity = this.bot.players[playerName].entity
                        if (!playerEntity) { continue }
                        if (roundedSelfPosition.equals(playerEntity.position.rounded())) {
                            this.tasks.push(this, goto, {
                                flee: roundedSelfPosition,
                                distance: 2,
                            }, priorities.unnecessary)
                            return
                        }
                    }
                }

                if (this.lookAtNearestPlayer()) {
                    this.randomLookInterval.restart()
                    return
                }

                if (this.randomLookInterval.is()) {
                    this.lookRandomly()
                    return
                }
            }
        })

        this.bot.on('death', () => {
            console.log(`[Bot "${this.bot.username}"] Died`)
        })

        this.bot.on('kicked', (/** @type {any} */ reason) => {
            if (typeof reason === 'string') {
                console.warn(`[Bot "${this.bot.username}"] Kicked:`, reason)
                return
            }

            const json = JSON.stringify(reason)

            if (json === '{"type":"compound","value":{"translate":{"type":"string","value":"disconnect.timeout"}}}') {
                console.error(`[Bot "${this.bot.username}"] Kicked because I was AFK`)
                return
            }

            if (json === '{"type":"compound","value":{"translate":{"type":"string","value":"multiplayer.disconnect.kicked"}}}') {
                console.error(`[Bot "${this.bot.username}"] Someone kicked me`)
                return
            }

            console.error(`[Bot "${this.bot.username}"] Kicked:`, reason)
        })

        this.bot.on('error', (error) => {
            // @ts-ignore
            if (error instanceof AggregateError) {
                // @ts-ignore
                for (const subError of error.errors) {
                    if ('syscall' in subError && subError.syscall === 'connect') {
                        console.error(`[Bot "${this.bot.username}"] Failed to connect to ${subError.address}: ${(() => {
                            switch (subError.code) {
                                case 'ECONNREFUSED': return 'Connection refused'
                                default: return subError.code
                            }
                        })()}`)
                        continue
                    }
                    console.error(`[Bot "${this.bot.username}"]`, subError)
                }
                return
            } else if ('syscall' in error && 'code' in error) {
                if (error.syscall === 'connect') {
                    switch (error.code) {
                        case 'ECONNREFUSED': {
                            console.error(`[Bot "${this.bot.username}"] Connection refused`)
                            return
                        }
                        default:
                            break
                    }
                }
            }
            console.error(`[Bot "${this.bot.username}"]`, error)
        })

        this.bot.on('login', () => { console.log(`[Bot "${this.bot.username}"] Logged in`) })

        this.bot.on('end', (reason) => {
            this.env.removeBot(this)
            // this.bot.webInventory?.stop?.()
            // this.bot.viewer?.close()

            switch (reason) {
                case 'socketClosed': {
                    console.warn(`[Bot "${this.bot.username}"] Ended: Socket closed`)
                    break
                }
                case 'disconnect.quitting': {
                    console.log(`[Bot "${this.bot.username}"] Quit`)
                    break
                }
                default: {
                    console.log(`[Bot "${this.bot.username}"] Ended:`, reason)
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
                        const bundleSlot = bot.bot.inventory.slots.findIndex(v => v && v.name === 'bundle')
                        const otherItemSlot = bot.bot.inventory.slots.findIndex(v => v && v.name !== 'bundle' && v.stackSize === 64)
                        if (!otherItemSlot) {
                            respond(`:(`)
                            return
                        }
                        yield* taskUtils.wrap(bundle.putIn(bot.bot, bot.mc.data, bundleSlot, otherItemSlot))
                        console.log(bundle.content(bot.bot.inventory.slots[bundleSlot].nbt))
                    },
                    id: function(args) { return 'test' },
                    humanReadableId: function(args) { return 'test' },
                }, null, priorities.user)
            },
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: 'test2',
            command: (sender, message, respond) => {
                this.tasks.push(this, {
                    task: function*(bot, args) {
                        const bundleSlot = bot.bot.inventory.slots.findIndex(v => v && v.name === 'bundle')
                        yield* taskUtils.wrap(bundle.empty(bot.bot, bundleSlot))
                        console.log(bundle.content(bot.bot.inventory.slots[bundleSlot].nbt))
                    },
                    id: function(args) { return 'test2' },
                    humanReadableId: function(args) { return 'test2' },
                }, null, priorities.user)
            },
        }))

        handlers.push(/** @type {RegexpChatHandler} */({
            match: /get\W+([a-zA-Z_ ]+)/,
            command: (sender, message, respond) => {
                const itemName = message[1]
                let item = this.mc.data.itemsByName[itemName.toLowerCase()]
                if (!item) {
                    item = this.mc.data.itemsArray.find(v => v.displayName.toLowerCase() === itemName.toLowerCase())
                }
                if (!item) {
                    respond(`I don't know what ${itemName} is`)
                    return
                }
                this.tasks.push(this, gatherItem, {
                    canCraft: true,
                    canDig: false,
                    canKill: false,
                    canUseChests: true,
                    canUseInventory: true,
                    count: 1,
                    item: item.name,
                    onStatusMessage: respond,
                }, priorities.user)
                    .wait()
                    .then(() => respond(`Done`))
                    .catch(error => error === 'cancelled' || respond(error))
            },
        }))

        handlers.push(/** @type {RegexpChatHandler} */({
            match: /plan\W+([a-zA-Z_ ]+)/,
            command: (sender, message, respond) => {
                const itemName = message[1]
                let item = this.mc.data.itemsByName[itemName.toLowerCase()]
                if (!item) {
                    item = this.mc.data.itemsArray.find(v => v.displayName.toLowerCase() === itemName.toLowerCase())
                }
                if (!item) {
                    respond(`I don't know what ${itemName} is`)
                    return
                }
                this.tasks.push(this, {
                    task: function*(bot, args) {
                        const plan = yield* gatherItem.plan(bot, args.item, args.count, args, {
                            cachedPlans: {},
                            depth: 0,
                            recursiveItems: [],
                        })
                        const organizedPlan = gatherItem.organizePlan(plan)
                        const planResult = gatherItem.planResult(organizedPlan, args.item)
                        const planCost = gatherItem.planCost(organizedPlan)
                        respond(`There is a plan for ${planResult} ${args.item} with a cost of ${gatherItem.normalizePlanCost(planCost)}:`)
                        respond(gatherItem.stringifyPlan(bot, organizedPlan))
                    },
                    id: function(args) {
                        return `plan-${args.count}-${args.item}`
                    },
                    humanReadableId: function(args) {
                        return `Planning ${args.count} ${args.item}`
                    }
                }, {
                    canCraft: true,
                    canDig: false,
                    canKill: false,
                    canUseChests: true,
                    canUseInventory: true,
                    count: 1,
                    item: item.name,
                    onStatusMessage: respond,
                }, priorities.user)
                    .wait()
                    .then(() => respond(`Done`))
                    .catch(error => error === 'cancelled' || respond(error))
                return
            },
        }))

        handlers.push(/** @type {RegexpChatHandler} */({
            match: /kill\W+([a-zA-Z0-9_]+)/,
            command: (sender, message, respond) => {
                const target = this.bot.players[message[1]]
                if (!target) {
                    respond(`Can't find ${message[1]}`)
                    return
                }

                const confirm = () => {
                    const task = this.tasks.push(this, attack, {
                        target: target.entity,
                        useBow: true,
                        useMelee: true,
                        useMeleeWeapon: true,
                    }, priorities.user)
                    if (task) {
                        respond(`Okay`)
                        task.wait()
                            .then(() => respond(`I killed ${target.username}`))
                            .catch(error => error === 'cancelled' || respond(error))
                    } else {
                        respond(`I'm already killing ${target.username}`)
                    }
                }

                // cspell: disable-next-line
                if (target.username === 'BB_vagyok') {
                    this.askAsync(`Do you allow me to kill you? Requested by ${sender}`, m => this.bot.whisper(target.username, m), target.username, 10000)
                        .then((res) => {
                            if (parseYesNoH(res)) {
                                confirm()
                            } else {
                                respond(`${target.username} didn't allow this`)
                            }
                        })
                        .catch(error => error === 'cancelled' || respond(error))
                } else {
                    confirm()
                }
            },
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: 'scan chests',
            command: (sender, message, respond) => {
                const task = this.tasks.push(this, {
                    task: () => this.env.scanChests(this),
                    id: function() {
                        return `scan-chests`
                    },
                    humanReadableId: function() {
                        return `Scanning chests`
                    },
                }, null, priorities.user)
                if (task) {
                    respond(`Okay`)
                    task.wait()
                        .then(() => respond(`Done`))
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
                    id: function() {
                        return `scan-villagers`
                    },
                    humanReadableId: function() {
                        return `Scanning villagers`
                    },
                }, null, priorities.user)
                if (task) {
                    respond(`Okay`)
                    task.wait()
                        .then(() => respond(`Done`))
                        .catch(error => error === 'cancelled' || respond(error))
                } else {
                    respond(`I'm already scanning villagers`)
                }
            }
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: 'fish',
            command: (sender, message, respond) => {
                const task = this.tasks.push(this, fish, {
                    onStatusMessage: respond,
                }, priorities.user)
                if (task) {
                    respond(`Okay`)
                    task.wait()
                        .then(result => result ? respond(`Done`) : respond(`I couldn't fish anything`))
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
                 * @type {Array<{ count: number; item: Item; }>}
                 */
                const normal = []
                for (const item of items) {
                    let found = false
                    for (const item2 of normal) {
                        if (item2.item.type === item.type) {
                            item2.count += item.count
                            found = true
                            break
                        }
                    }
                    if (!found) {
                        normal.push({
                            count: item.count,
                            item: item,
                        })
                    }
                }

                let builder = ''
                for (let i = 0; i < normal.length; i++) {
                    const item = normal[i]
                    if (i > 0) { builder += ' ; ' }
                    if (item.count === 1) {
                        if (item.item.name === 'bundle') {
                            const bundleSize = bundle.size(this.mc.data, item.item)
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
            match: 'follow',
            command: (sender, message, respond) => {
                const task = this.tasks.push(this, followPlayer, {
                    player: sender,
                    range: 2,
                    onNoPlayer: function*(bot) {
                        try {
                            const response = yield* bot.ask(`I lost you. Where are you?`, respond, sender, 30000)
                            const location = parseLocationH(response)
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
                        builder += `${task.humanReadableId} with priority ${task.priority}`
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
                    /** @type {import('./task').SimpleTaskDef<void, { player: string; }>} */
                    task: function*(bot, args) {
                        let location = bot.env.getPlayerPosition(args.player, 10000)
                        if (!location) {
                            try {
                                const response = yield* bot.ask(`Where are you?`, respond, sender, 30000)
                                location = parseLocationH(response)
                            } catch (error) {

                            }
                            if (location) {
                                respond(`${location.x} ${location.y} ${location.z} in ${location.dimension} I got it`)
                            } else {
                                throw `I can't find you`
                            }
                        }
                        yield* goto.task(bot, {
                            point: location,
                            distance: 1,
                            timeout: 30000,
                        })
                    },
                    id: function(args) {
                        return `goto-${args.player}`
                    },
                    humanReadableId: function(args) {
                        return `Goto ${args.player}`
                    },
                }, {
                    player: sender,
                }, priorities.user)
                if (task) {
                    respond(`Okay`)
                    task.wait()
                        .then(() => respond(`I'm here`))
                        .catch(error => error === 'cancelled' || respond(error))
                } else {
                    respond(`I'm already coming to you`)
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

                const task = this.tasks.push(this, enderpearlTo, {
                    destination: target.xyz(this.dimension).offset(0, 0.1, 0),
                    onStatusMessage: respond,
                }, priorities.user)
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
                                respond(`Done: ${result}`)
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
                const task = this.tasks.push(this, giveAll, {
                    player: sender,
                    onStatusMessage: respond,
                }, priorities.user)
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
                const task = this.tasks.push(this, giveTo, {
                    player: sender,
                    items: this.getTrashItems(),
                    onStatusMessage: respond,
                }, priorities.user)
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
                if (this.tasks.isIdle) {
                    respond(`I don't do anything`)
                } else {
                    respond(`Okay`)
                }
                this.tasks.abort()
            }
        }))

        handlers.push(/** @type {StringChatHandler} */({
            match: 'leave',
            command: (sender, message, respond) => {
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
     * @returns {Array<{ name: string; count: number; }>}
     */
    getTrashItems() {
        const result = this.bot.inventory.items().map(v => ({ name: v.name, count: v.count, type: v.type, originalCount: v.count }))
        /**
         * @type {ReadonlyArray<import('./equipment').SatisfiedEquipmentItem>}
         */
        const _equipment = equipment.map(v => ({
            ...v,
            satisfied: false,
        }))
        for (const _equipmentItem of _equipment) {
            if (_equipmentItem.satisfied) { continue }
            switch (_equipmentItem.type) {
                case 'single': {
                    const goodItem = result.find(v =>
                        (v.name === _equipmentItem.item) &&
                        (v.count > 0)
                    )
                    if (goodItem) {
                        goodItem.count--
                        _equipmentItem.satisfied = true
                        break
                    }
                    break
                }
                case 'any': {
                    const preferredItem = result.find(v =>
                        (v.name === _equipmentItem.prefer) &&
                        (v.count > 0)
                    )
                    if (preferredItem) {
                        preferredItem.count--
                        _equipmentItem.satisfied = true
                        break
                    }

                    const goodItem = result.find(v =>
                        (_equipmentItem.item.includes(v.name)) &&
                        (v.count > 0)
                    )
                    if (goodItem) {
                        goodItem.count--
                        _equipmentItem.satisfied = true
                        break
                    }
                    break
                }
                case 'food': {
                    const foods = result
                        .map(v => ({ food: this.mc.data.foods[v.type], item: v }))
                        .filter(v =>
                            v.food &&
                            !MC.badFoods.includes(v.item.name) &&
                            (v.item.count > 0)
                        )
                    let soFar = 0
                    for (const food of foods) {
                        while (food.item.count > 0 && soFar < _equipmentItem.food) {
                            food.item.count--
                            soFar += food.food.foodPoints
                        }
                    }
                    _equipmentItem.satisfied = (soFar >= _equipmentItem.food)
                    break
                }
                default: {
                    break
                }
            }
        }

        /**
         * @type {Array<{ item: string; count: number; }>}
         */
        const lockedItems = this.lockedItems
            .filter(v => !v.isUnlocked)
            .map(v => ({ item: v.item, count: v.count }))
        for (const lockedItem of lockedItems) {
            if (lockedItem.count <= 0) { continue }
            const goodItem = result.find(v =>
                (v.name === lockedItem.item) &&
                (v.count > 0)
            )
            if (!goodItem) { continue }
            const has = Math.min(lockedItem.count, goodItem.count)
            lockedItem.count -= has
            goodItem.count -= has
        }

        return result
            .filter(v => (v.count > 0))
            .map(v => ({ name: v.name, count: v.count }))
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
     * @private
     */
    lookAtNearestPlayer() {
        /**
         * @type {import('mineflayer').Player | null}
         */
        let selected = null

        for (const playerUsername in this.bot.players) {
            if (playerUsername === this.bot.username) { continue }
            const player = this.bot.players[playerUsername]

            if (!player.entity ||
                this.bot.entity.position.distanceTo(player.entity.position) > 5) {
                if (this.lookAtPlayers[playerUsername]) { delete this.lookAtPlayers[playerUsername] }
                continue
            }

            if (!this.lookAtPlayers[playerUsername]) {
                this.lookAtPlayers[playerUsername] = {
                    startedLookingAt: performance.now(),
                    endedLookingAt: 0,
                }
            } else {
                const p = this.lookAtPlayers[playerUsername]
                if (p.startedLookingAt) {
                    if (performance.now() - p.startedLookingAt < 3000) {
                        selected = this.bot.players[playerUsername]
                        break
                    } else if (!p.endedLookingAt) {
                        p.endedLookingAt = performance.now()
                        p.startedLookingAt = 0
                        continue
                    }
                }
                if (p.endedLookingAt) {
                    if (performance.now() - p.endedLookingAt < 7000) {
                        continue
                    } else if (!p.startedLookingAt) {
                        p.endedLookingAt = 0
                        p.startedLookingAt = performance.now()
                        selected = this.bot.players[playerUsername]
                        break
                    }
                }
                delete this.lookAtPlayers[playerUsername]
            }
        }

        if (!selected) {
            return false
        }

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
        const pitch = mathUtils.randomInt(-40, 30)
        const yaw = mathUtils.randomInt(-180, 180)
        this.bot.look(yaw * mathUtils.deg2rad, pitch * mathUtils.deg2rad)
    }

    /**
     * 
     * @param {string} sender
     * @param {string} message
     * @param {(reply: any) => void} respond
     */
    handleChat(sender, message, respond) {
        message = message.trim()

        if (this.chatAwaits.length > 0) {
            const chatAwait = this.chatAwaits[0]
            if (chatAwait(sender, message)) {
                this.chatAwaits.shift()
                return
            }
        }

        if (sender === this.bot.username) { return }

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

            console.log(`Best match:`, bestMatch, bestMatchSteps)
            if (bestMatchSteps <= 1) {
                this.askAsync(`Did you mean '${bestMatch}'?`, respond, sender, 10000)
                    .then(res => {
                        if (parseYesNoH(res)) {
                            // @ts-ignore
                            bestHandler.command(sender, message, respond)
                        }
                    })
                    .catch(error => console.warn(`[Bot "${this.bot.username}"] Ask timed out: ${error}`))
            }
        }
    }

    /**
     * @param {string} message
     * @param {(message: string) => void} send
     * @param {string} [player]
     * @param {number} [timeout]
     * @returns {Generator<void, string, void>}
     */
    *ask(message, send, player, timeout) {
        /** @type {string | null} */
        let response = null
        this.chatAwaits.push((/** @type {string} */ username, /** @type {string} */ message) => {
            if (player && username !== player) { return false }
            response = message
            return true
        })
        send(message)
        const timeoutAt = timeout ? (performance.now() + timeout) : null
        while (true) {
            if (response) {
                return response
            }
            if (timeoutAt && timeoutAt < performance.now()) {
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
     * @returns {Promise<string>}
     */
    async askAsync(message, send, player, timeout) {
        /** @type {string | null} */
        let response = null
        this.chatAwaits.push((/** @type {string} */ username, /** @type {string} */ message) => {
            if (player && username !== player) { return false }
            response = message
            return true
        })

        send(message)

        const timeoutAt = timeout ? (performance.now() + timeout) : null
        while (true) {
            if (response) {
                return response
            }
            if (timeoutAt && timeoutAt < performance.now()) {
                throw 'Timed out'
            }
            await taskUtils.sleep(100)
        }
    }

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
     * @param {string | number} cookingResult
     * @returns {Array<import('./mc-data').CookingRecipe>}
     */
    getCookingRecipesFromResult(cookingResult) {
        if (typeof cookingResult === 'number') {
            cookingResult = this.mc.data.items[cookingResult]?.name
        }
        /** @type {Array<import('./mc-data').SmeltingRecipe | import('./mc-data').SmokingRecipe | import('./mc-data').BlastingRecipe | import('./mc-data').CampfireRecipe>} */
        const recipes = []
        if (!cookingResult) {
            return []
        }

        for (const recipe of Object.values(this.mc.data2.recipes.smelting)) {
            if (recipe.result === cookingResult) {
                recipes.push(recipe)
            }
        }

        for (const recipe of Object.values(this.mc.data2.recipes.smoking)) {
            if (recipe.result === cookingResult) {
                recipes.push(recipe)
            }
        }

        for (const recipe of Object.values(this.mc.data2.recipes.blasting)) {
            if (recipe.result === cookingResult) {
                recipes.push(recipe)
            }
        }

        for (const recipe of Object.values(this.mc.data2.recipes.campfire)) {
            if (recipe.result === cookingResult) {
                recipes.push(recipe)
            }
        }

        recipes.sort((a, b) => a.time - b.time)

        return recipes
    }

    /**
     * @param {string | number} raw
     * @returns {Array<import('./mc-data').CookingRecipe>}
     */
    getCookingRecipesFromRaw(raw) {
        if (typeof raw === 'number') {
            raw = this.mc.data.items[raw]?.name
        }
        /** @type {Array<import('./mc-data').SmeltingRecipe | import('./mc-data').SmokingRecipe | import('./mc-data').BlastingRecipe | import('./mc-data').CampfireRecipe>} */
        const recipes = []
        if (!raw) {
            return []
        }

        for (const recipe of Object.values(this.mc.data2.recipes.smelting)) {
            for (const ingredient of recipe.ingredient) {
                if (ingredient === raw) {
                    recipes.push(recipe)
                }
            }
        }

        for (const recipe of Object.values(this.mc.data2.recipes.smoking)) {
            for (const ingredient of recipe.ingredient) {
                if (ingredient === raw) {
                    recipes.push(recipe)
                }
            }
        }

        for (const recipe of Object.values(this.mc.data2.recipes.blasting)) {
            for (const ingredient of recipe.ingredient) {
                if (ingredient === raw) {
                    recipes.push(recipe)
                }
            }
        }

        for (const recipe of Object.values(this.mc.data2.recipes.campfire)) {
            for (const ingredient of recipe.ingredient) {
                if (ingredient === raw) {
                    recipes.push(recipe)
                }
            }
        }

        recipes.sort((a, b) => a.time - b.time)

        return recipes
    }

    /**
     * @param {ReadonlyArray<string | number>} items
     * @returns {Item | null}
     */
    searchItem(...items) {
        const specialSlotIds = [
            this.bot.getEquipmentDestSlot('head'),
            this.bot.getEquipmentDestSlot('torso'),
            this.bot.getEquipmentDestSlot('legs'),
            this.bot.getEquipmentDestSlot('feet'),
            this.bot.getEquipmentDestSlot('hand'),
            this.bot.getEquipmentDestSlot('off-hand'),
        ]

        for (const _searchFor of items) {
            if (!_searchFor) { continue }

            const searchFor = (
                (typeof _searchFor === 'string')
                    ? this.mc.data.itemsByName[_searchFor]?.id
                    : _searchFor
            )

            if (!_searchFor) { continue }

            const found = this.bot.inventory.findInventoryItem(searchFor, null, false)
            if (found) { return found }

            for (const specialSlotId of specialSlotIds) {
                const found = this.bot.inventory.slots[specialSlotId]
                if (!found) { continue }
                if (found.type === searchFor) {
                    return found
                }
            }
        }
        return null
    }

    /**
     * @param {(string | number)} item
     */
    itemCount(item) {
        const specialSlotIds = [
            this.bot.getEquipmentDestSlot('head'),
            this.bot.getEquipmentDestSlot('torso'),
            this.bot.getEquipmentDestSlot('legs'),
            this.bot.getEquipmentDestSlot('feet'),
            this.bot.getEquipmentDestSlot('hand'),
            this.bot.getEquipmentDestSlot('off-hand'),
        ]

        const searchFor = (
            (typeof item === 'string')
                ? this.mc.data.itemsByName[item]?.id
                : item
        )

        if (!item) { return 0 }

        let count = this.bot.inventory.count(searchFor, null)

        for (const specialSlotId of specialSlotIds) {
            const found = this.bot.inventory.slots[specialSlotId]
            if (!found) { continue }
            if (found.type === searchFor) {
                count++
            }
        }

        return count
    }

    /**
     * @param {ReadonlyArray<string | number>} items
     */
    hasAll(...items) {
        const specialSlotIds = [
            this.bot.getEquipmentDestSlot('head'),
            this.bot.getEquipmentDestSlot('torso'),
            this.bot.getEquipmentDestSlot('legs'),
            this.bot.getEquipmentDestSlot('feet'),
            this.bot.getEquipmentDestSlot('hand'),
            this.bot.getEquipmentDestSlot('off-hand'),
        ]

        for (const _searchFor of items) {
            if (!_searchFor) { continue }

            const searchFor = (
                (typeof _searchFor === 'string')
                    ? this.mc.data.itemsByName[_searchFor]?.id
                    : _searchFor
            )

            if (!_searchFor) { continue }

            let found = this.bot.inventory.findInventoryItem(searchFor, null, false) ? true : false
            if (found) { continue }

            for (const specialSlotId of specialSlotIds) {
                const _found = this.bot.inventory.slots[specialSlotId]
                if (!_found) { continue }
                if (_found.type === searchFor) {
                    found = _found ? true : false
                }
            }
            if (found) { continue }

            return false
        }

        return true
    }

    /**
     * @returns {{
     *   item: import('prismarine-item').Item;
     *   weapon: hawkeye.Weapons;
     *   ammo: number;
     * } | null}
     */
    searchRangeWeapon() {
        const keys = Object.values(hawkeye.Weapons)

        for (const weapon of keys) {
            const searchFor = this.mc.data.itemsByName[weapon]?.id

            if (!searchFor) { continue }

            const found = this.bot.inventory.findInventoryItem(searchFor, null, false)
            if (!found) { continue }

            let ammo

            switch (weapon) {
                case hawkeye.Weapons.bow:
                case hawkeye.Weapons.crossbow:
                    ammo = this.bot.inventory.count(this.mc.data.itemsByName['arrow'].id, null)
                    break

                // case hawkeye.Weapons.egg:
                case hawkeye.Weapons.snowball:
                    // case hawkeye.Weapons.trident:
                    ammo = this.bot.inventory.count(found.type, null)
                    break

                default: continue
            }

            if (ammo === 0) {
                continue
            }

            return {
                item: found,
                weapon: weapon,
                ammo: ammo,
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
     * @param {number} drop
     * @param {number} maxDistance
     */
    findBlockWithDrop(drop, maxDistance) {
        return this.bot.findBlock({
            matching: (block) => {
                if (!block.drops) { return false }
                for (const _drop of block.drops) {
                    if (typeof _drop === 'number') {
                        if (_drop === drop) {
                            return true
                        }
                        continue
                    }
                    if (typeof _drop.drop === 'number') {
                        if (_drop.drop === drop) {
                            return true
                        }
                        continue
                    }

                    if (_drop.drop.id === drop) {
                        return true
                    }
                }

                return false
            },
            maxDistance: maxDistance,
        })
    }

    /**
     * @param {number} drop
     */
    findEntityWithDrop(drop) {
        const dropItem = this.mc.data.items[drop]
        if (!dropItem) return null
        return this.bot.nearestEntity((entity) => {
            const entityDrops = this.mc.data.entityLoot[entity.name ?? '']
            if (!entityDrops) { return false }

            let drops = entityDrops.drops
            drops = drops.filter((_drop) => (dropItem.name === _drop.item))
            if (drops.length === 0) { return false }

            return true
        })
    }

    /**
     * Source: https://github.com/PrismarineJS/mineflayer-pvp/blob/master/src/PVP.ts
     */
    holdsShield() {
        if (this.bot.supportFeature('doesntHaveOffHandSlot')) {
            return false
        }

        const slot = this.bot.inventory.slots[this.bot.getEquipmentDestSlot('off-hand')]
        if (!slot) {
            return false
        }

        return slot.name == 'shield'
    }

    /**
     * @param {string | number} item
     */
    holds(item) {
        const slot = this.bot.inventory.slots[this.bot.getEquipmentDestSlot('hand')]

        if (!slot) {
            return false
        }

        if (typeof item === 'string') {
            return slot.name === item
        } else {
            return slot.type === item
        }
    }

    /**
     * @returns {boolean}
     */
    shouldEquipShield() {
        const shield = this.searchItem('shield')
        if (!shield) {
            return false
        }

        const needShield = this.env.possibleDirectHostileAttack(this)
        if (!needShield) {
            return false
        }

        return true
    }

    /**
     * @param {number | string} item
     * @returns {number}
     */
    getChargeTime(item) {
        if (typeof item === 'number') {
            item = this.mc.data.items[item]?.name
        }
        if (!item) return 0

        switch (item) {
            case 'bow':
                return 1200
            case 'crossbow':
                return 1300 // 1250
            default:
                return 0
        }
    }

    /**
     * @param {Item} item
     * @returns {boolean}
     */
    static isCrossbowCharged(item) {
        return (
            item.nbt &&
            (item.nbt.type === 'compound') &&
            item.nbt.value['ChargedProjectiles'] &&
            (item.nbt.value['ChargedProjectiles'].type === 'list') &&
            (item.nbt.value['ChargedProjectiles'].value.value.length > 0)
        )
    }

    /**
     * @returns {(meleeWeapons.MeleeWeapon & { item: Item }) | null}
     */
    bestMeleeWeapon() {
        const weapons = meleeWeapons.weapons
        for (const weapon of weapons) {
            const item = this.searchItem(weapon.name)
            if (item) {
                return {
                    ...weapon,
                    item: item,
                }
            }
        }
        return null
    }

    /**
     * @param {number | null} item
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
            if (item && item === slot.type) { return false }
        }

        return true
    }

    /**
     * @param {import('prismarine-windows').Window} chest
     * @param {string | null} item
     * @returns {number | null}
     */
    static firstFreeSlot(chest, item = null) {
        let empty = chest.firstEmptyContainerSlot()
        if (empty !== null && empty !== undefined) {
            return empty
        }

        if (item) {
            const items = chest.containerItems()
            for (const _item of items) {
                if (_item.count >= _item.stackSize) { continue }
                if (_item.name !== item) { continue }
                return _item.slot
            }
        }

        return null
    }
}
