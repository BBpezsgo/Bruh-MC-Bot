const MineFlayer = require('mineflayer')
const { Vec3 } = require('vec3')
const MineFlayerPathfinder = require('mineflayer-pathfinder')
const MineFlayerCollectBlock = require('mineflayer-collectblock').plugin
const MineFlayerElytra = require('mineflayer-elytrafly').elytrafly
const MineFlayerHawkEye = require('minecrafthawkeye').default
const MineFlayerArmorManager = require('mineflayer-armor-manager')
const TaskManager = require('./task-manager')
const goto = require('./tasks/goto')
const MC = require('./mc')
const { Block } = require('prismarine-block')
const { Item } = require('prismarine-item')
const meleeWeapons = require('./melee-weapons')
const { filterHostiles, wrap, sleepG, Interval, randomInt, deg2rad, parseLocationH } = require('./utils')
const hawkeye = require('minecrafthawkeye')
const attack = require('./tasks/attack')
const Capabilies = require('./capabilies')
const eat = require('./tasks/eat')
const fish = require('./tasks/fish')
const followPlayer = require('./tasks/follow-player')
const mlg = require('./tasks/mlg')
const clearMlgJunk = require('./tasks/clear-mlg-junk')
const giveAll = require('./tasks/give-all')
const pickupItem = require('./tasks/pickup-item')
const harvest = require('./tasks/harvest')
const compost = require('./tasks/compost')
// @ts-ignore
const Environment = require('./environment')
const Memory = require('./memory')
const sleep = require('./tasks/sleep')
const enderpearlTo = require('./tasks/enderpearl-to')
const smelt = require('./tasks/smelt')
const blockExplosion = require('./tasks/block-explosion')

const priorities = Object.freeze({
    critical: 300,
    surviving: 200,
    user: 100,
    cleanup: -1,
    low: -100,
    unnecessary: -200,
})

// @ts-ignore
module.exports = class BruhBot {
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
     * @private
     * @readonly
     * @type {TaskManager}
     */
    tasks

    /**
     * @readonly
     * @type {Capabilies}
     */
    capabilies

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
    gentleMovements

    /**
     * @private @readonly
     * @type {Interval}
     */
    tryAutoCookInterval
    /**
     * @private
     * @readonly
     * @type {Interval}
     */
    saveInterval
    /**
     * @private
     * @readonly
     * @type {Interval}
     */
    trySleepInterval
    /**
     * @private
     * @readonly
     * @type {Interval}
     */
    checkQuietInterval
    /**
     * @private
     * @readonly
     * @type {Interval}
     */
    randomLookInterval
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
     * @type {Array<import('prismarine-entity').Entity>}
     */
    aimingEntities

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
     * @type {TaskManager.AsManaged<import('./tasks/attack')> | null}
     */
    defendMyselfGoal

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
     * @param {Readonly<{
     *   [key: string]: any;
     *   dataPath: string;
     *   pickupItemDistance?: number;
     *   autoSmeltItems?: boolean;
     *   autoHarvest?: boolean;
     *   idleLooking?: boolean;
     * }>} config
     * @param {string} worldName
     * @param {string} username
     */
    constructor(config, worldName, username) {
        console.log(`[Bot "${username}"] Launching ...`)

        worldName = worldName + '_' + username

        this.bot = MineFlayer.createBot({
            host: config['bot']['host'],
            port: config['bot']['port'],
            username: username,
            logErrors: false,
        })

        this.env = new Environment(this)
        this.memory = new Memory(this)
        
        this.chatAwaits = [ ]
        this.quietMode = true
        this._isLeftHandActive = false
        this._isRightHandActive = false
        this.capabilies = new Capabilies(this)
        this.defendMyselfGoal = null
        this.onHeard = null
        // @ts-ignore
        this.mc = null
        this.aimingEntities = [ ]

        this.tryAutoCookInterval = new Interval(10000)
        this.saveInterval = new Interval(30000)
        this.trySleepInterval = new Interval(5000)
        this.tryAutoHarvestInterval = new Interval(5000)
        this.checkQuietInterval = new Interval(500)
        this.randomLookInterval = new Interval(10000)

        // @ts-ignore
        this.permissiveMovements = null
        // @ts-ignore
        this.restrictedMovements = null
        // @ts-ignore
        this.gentleMovements = null

        this.bot.on('chat', (sender, message) => this.handleChat(sender, message, reply => this.bot.chat(reply)))
        this.bot.on('whisper', (sender, message) => this.handleChat(sender, message, reply => this.bot.whisper(sender, reply)))

        this.bot.on('target_aiming_at_you', (entity, arrowTrajectory) => {
            this.aimingEntities.push(entity)
        })

        this.bot.on('entityDead', (entity) => {
            if (this.env.entitySpawnTimes[entity.id]) {
                delete this.env.entitySpawnTimes[entity.id]
            }
        })

        this.bot.on('entitySpawn', (entity) => {
            this.env.entitySpawnTimes[entity.id] = performance.now()
        })

        this.bot.on('soundEffectHeard', (soundName) => {
            if (this.onHeard) { this.onHeard(soundName) }
        })

        this.bot.on('hardcodedSoundEffectHeard', (soundId, soundCategory) => {
            if (this.onHeard) { this.onHeard(soundId) }
        })

        this.tasks = new TaskManager()

        this.bot.once('spawn', () => {
            console.log(`[Bot "${username}"] Spawned`)

            console.log(`[Bot "${username}"] Loading plugins ...`)
            this.bot.loadPlugin(MineFlayerPathfinder.pathfinder)
            this.bot.loadPlugin(MineFlayerCollectBlock)
            this.bot.loadPlugin(MineFlayerArmorManager)
            this.bot.loadPlugin(MineFlayerHawkEye)
            this.bot.loadPlugin(MineFlayerElytra)

            console.log(`[Bot "${username}"] Loading ...`)

            // @ts-ignore
            this.mc = new MC(this.bot.version)

            // @ts-ignore
            this.permissiveMovements = new MineFlayerPathfinder.Movements(this.bot)
            // @ts-ignore
            this.restrictedMovements = new MineFlayerPathfinder.Movements(this.bot)
            // @ts-ignore
            this.gentleMovements = new MineFlayerPathfinder.Movements(this.bot)
    
            BruhBot.setPermissiveMovements(this.permissiveMovements, this.mc)
            BruhBot.setRestrictedMovements(this.restrictedMovements, this.mc)
            BruhBot.setGentleMovements(this.gentleMovements, this.mc)
    
            console.log(`[Bot "${username}"] Ready`)
        })

        this.bot.on('playerUpdated', async (player) => {
            if (!player.entity?.position) {
                return
            }

            this.env.setPlayerPosition(player.username, player.entity.position)
        })

        this.bot.on('move', async (position) => {
            if (!this.mc) { return }
            if (this.bot.entity.velocity.y < this.mc.data2.general.fallDamageVelocity) {
                this.tasks.tick()
                this.tasks.push(this, mlg, null, priorities.critical)
                return
            }
        })

        this.bot.on('physicsTick', () => {
            if (this.checkQuietInterval.is()) {
                let shouldBeQuiet = false

                this.checkQuietInterval.time = shouldBeQuiet ? 5000 : 500

                if (!shouldBeQuiet && this.bot.controlState.sneak && this.tasks.isIdle) {
                    this.bot.setControlState('sneak', false)
                }

                this.permissiveMovements.sneak = shouldBeQuiet
                this.restrictedMovements.sneak = shouldBeQuiet
                this.gentleMovements.sneak = shouldBeQuiet
                this.quietMode = shouldBeQuiet
            }

            if (this.saveInterval.is()) {
                this.memory.save()
                this.env.save()
            }

            const runningTask = this.tasks.tick()

            {
                let creeper = this.env.getExplodingCreeper()

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
        
                if (this.aimingEntities[0]) {
                    const entity = this.aimingEntities[0]
                    console.log(`[Bot "${this.bot.username}"] ${entity.displayName ?? entity.name ?? 'Someone'} aiming at me`)
                }
            }

            if (runningTask && runningTask.getPriority() >= priorities.critical) {
                return
            }

            const hostile = this.bot.nearestEntity(v => {
                return filterHostiles(v, this.bot.entity.position) ? true : false
            })

            if (hostile) {
                if (!this.defendMyselfGoal || this.defendMyselfGoal.status === 'done' || !this.tasks.has(this.defendMyselfGoal.getId())) {
                    // @ts-ignore
                    this.defendMyselfGoal = this.tasks.push(this, attack, {
                        target: hostile,
                        useBow: true,
                        useMelee: true,
                        useMeleeWeapon: true,
                    }, (args) => {
                        const distance = this.bot.entity.position.distanceSquared(args.target.position)
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
                (this.mc.filterFoods(this.bot.inventory.items()).length > 0)) {
                this.tasks.push(this, eat, null, priorities.surviving)
                return
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
                    task: function*(bot, args) {
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
                            destination: entity.position.clone(),
                            range: 1,
                        })
                        yield* sleepG(1000)
                        if (entity.isValid) {
                            console.warn(`[Bot "${bot.bot.username}"] Can't pick up this arrow`)
                        } else {
                            console.log(`[Bot "${bot.bot.username}"] Arrow picked up`)
                        }
                    },
                    id: function(args) {
                        return `pickup-my-arrows`
                    },
                    humanReadableId: function(args) {
                        return `Picking up my arrows`
                    },
                }, null, priorities.cleanup)
            }
            
            if ('result' in this.env.getClosestItem(null, { inAir: false, maxDistance: 5, minLifetime: 5000 }) ||
                'result' in this.env.getClosestXp({ maxDistance: 5 })) {
                this.tasks.push(this, pickupItem, { inAir: false, maxDistance: 5, minLifetime: 5000 }, 1)
            }
            
            if (this.tryAutoHarvestInterval.is()) {
                if (this.env.getCrops(this.bot.entity.position.clone(), true).length > 0) {
                    const harvestTask = this.tasks.push(this, harvest, { }, priorities.unnecessary)
                    if (harvestTask) {
                        harvestTask.wait()
                            .then(() => {
                                const goal = this.tasks.push(this, compost, null, priorities.unnecessary)
                            })
                            .catch(() => {
                                
                            })
                    }
                }
            }

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
                                }, priorities.unnecessary)
                                return
                            }
                        }
                    }
                }
            }

            if (this.tasks.isIdle || (
                    runningTask &&
                    runningTask.getId().startsWith('follow') &&
                    !this.bot.pathfinder.goal
                )
            ) {
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
            console.log(`[Bot "${username}"] Died`)
        })

        this.bot.on('kicked', (/** @type {any} */ reason) => {
            if (typeof reason === 'string') {
                console.warn(`[Bot "${username}"] Kicked:`, reason)
                return
            }

            if (typeof reason === 'object' &&
                'type' in reason &&
                'value' in reason &&
                reason.type === 'compound') {
                console.warn(`[Bot "${username}"] Kicked:`, reason.value)
            }
            
            console.warn(`[Bot "${username}"] Kicked:`, reason)
        })
        this.bot.on('error', (error) => {
            // @ts-ignore
            if (error instanceof AggregateError) {
                // @ts-ignore
                for (const suberror of error.errors) {
                    if ('syscall' in suberror && suberror.syscall === 'connect') {
                        console.error(`[Bot "${username}"] Failed to connect to ${suberror.address}: ${(() => {
                            switch (suberror.code) {
                                case 'ECONNREFUSED': return 'Connection refused'
                                default: return suberror.code
                            }
                        })()}`)
                    } else {
                        console.error(`[Bot "${username}"]`, suberror)
                    }
                }
            } else {
                console.error(`[Bot "${username}"]`, error)
            }
        })

        this.bot.on('login', () => { console.log(`[Bot "${username}"] Logged in`) })

        this.bot.on('end', (reason) => {
            this.bot.webInventory?.stop?.()
            this.bot.viewer?.close()

            switch (reason) {
                case 'socketClosed':
                    console.warn(`[Bot "${username}"] Ended: Socket closed`)
                    break
                    
                case 'disconnect.quitting':
                    console.log(`[Bot "${username}"] Quit`)
                    break
            
                default:
                    console.log(`[Bot "${username}"] Ended:`, reason)
                    break
            }

            this.memory.save()
            this.env.save()
        })
        
        this.bot.on('path_update', (r) => {
            if (this.bot.viewer) {
                const path = [this.bot.entity.position.offset(0, 0.5, 0)]
                for (const node of r.path) {
                    path.push(new Vec3(node.x, node.y + 0.5, node.z ))
                }
                this.bot.viewer.drawLine('path', path, 0xffffff)
            }
        })
        
        this.bot.on('path_reset', (reason) => {
            this.bot.viewer?.erase('path')
        })
        
        this.bot.on('path_stop', () => {
            this.bot.viewer?.erase('path')
        })
    }

    /**
     * @private
     */
    lookAtNearestPlayer() {
        const nearest = this.bot.nearestEntity(entity => (
            entity.type === 'player' &&
            entity.username !== this.bot.username
        ))
        if (!nearest) { return false }

        const distance = nearest.position.distanceTo(this.bot.entity.position)
        if (distance > 5) { return false }

        const playerEye = nearest.position.offset(0, 1.6, 0)

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
        const pitch = randomInt(-40, 30)
        const yaw = randomInt(-180, 180)
        this.bot.look(yaw * deg2rad, pitch * deg2rad)
    }

    /**
     * 
     * @param {string} sender
     * @param {string} message
     * @param {(reply: string) => void} respond
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
    
        if (message === 'fish') {
            const task = this.tasks.push(this, fish, {
                onStatusMessage: respond,
            }, priorities.user)
            if (task) {
                respond(`Okay`)
                task.wait()
                    .then(result => respond(`Done`))
                    .catch(reason => respond(reason + ''))
            } else {
                respond(`I'm already fishing`)
            }
        }

        if (message === 'wyh') {
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
                    builder += `${item.item.displayName}`
                } else if (item.count >= item.item.stackSize) {
                    builder += `${Math.round((item.count / item.item.stackSize) * 10) / 10} stack ${item.item.displayName}`
                } else {
                    builder += `${item.count} ${item.item.displayName}`
                }
            }

            respond(builder)

            return
        }

        if (message === 'stop quiet' ||
            message === 'cancel quiet' ||
            message === 'no quiet') {
            if (!this.userQuiet) {
                respond(`I'm not trying to be quiet`)
                return
            }

            respond(`Okay`)
            this.userQuiet = false
            return
        }

        if (message === 'quiet') {
            if (this.userQuiet) {
                respond(`I'm already trying to be quiet`)
                return
            }

            respond(`Okay`)

            this.userQuiet = true

            return
        }

        if (message === 'follow') {
            const task = this.tasks.push(this, followPlayer, {
                player: sender,
                range: 5,
                onNoPlayer: function*(bot, args) {
                    try {
                        const response = yield* bot.ask(`I lost you. Where are you?`, respond, sender, 30000)
                        const location = parseLocationH(response)
                        if (location) {
                            respond(`${location.x} ${location.y} ${location.z} I got it`)
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
                    .then(result => { })
                    .catch(reason => respond(reason + ''))
            } else {
                respond(`I'm already following you`)
            }
        }

        if (message === 'wyd') {
            if (this.tasks.running.length === 0) {
                respond(`Nothing`)
            } else {
                let builder = ''
                for (let i = 0; i < this.tasks.running.length; i++) {
                    const task = this.tasks.running[i]
                    if (builder) { builder += ' ; ' }
                    builder += `${task.getHumanReadableId()} with priority ${task.getPriority()}`
                }
                for (let i = 0; i < this.tasks.queue.length; i++) {
                    const task = this.tasks.queue[i]
                    if (builder) { builder += ' ; ' }
                    builder += `(in queue) ${task.getHumanReadableId()} with priority ${task.getPriority()}`
                }
                respond(builder)
            }
            return
        }

        if (message === 'come') {
            const task = this.tasks.push(this, {
                /** @type {import('./task').SimpleTaskDef<void, { player: string; }>} */ 
                task: function* (bot, args) {
                    let location = bot.env.getPlayerPosition(args.player)
                    if (!location) {
                        try {
                            const response = yield* bot.ask(`Where are you?`, respond, sender, 30000)
                            location = parseLocationH(response)
                        } catch (error) {
                            
                        }
                        if (location) {
                            respond(`${location.x} ${location.y} ${location.z} I got it`)
                        } else {
                            throw `I can't find you`
                        }
                    }
                    yield* goto.task(bot, {
                        destination: location.clone(),
                        range: 2,
                    })
                },
                id: function (args) {
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
                    .then(result => respond(`I'm here`))
                    .catch(reason => respond(reason + ''))
            } else {
                respond(`I'm already coming to you`)
            }
        }

        if (message === 'tp') {
            const target = this.env.getPlayerPosition(sender)

            if (!target) {
                throw `Can't find ${sender}`
            }

            const task = this.tasks.push(this, enderpearlTo, {
                destination: target.offset(0, 0.1, 0),
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
                    .catch(reason => respond(reason + ''))
            } else {
                respond(`I'm already teleporting to you`)
            }
        }

        if (message === 'give all') {
            const task = this.tasks.push(this, giveAll, {
                player: sender,
                onStatusMessage: respond,
            }, priorities.user)
            if (task) {
                respond(`Okay`)
                task.wait()
                    .then(result => respond(`There it is`))
                    .catch(reason => respond(reason + ''))
            } else {
                respond(`I'm already on my way`)
            }
        }

        if (message === 'stop') {
            respond(`Okay`)
            this.tasks.stop()
        }

        if (message === 'leave') {
            this.bot.quit(`${sender} asked me to leave`)
        }
    }

    /**
     * @param {string} message
     * @param {(message: string) => any} send
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
            yield* sleepG(200)
        }
    }

    nontrashItems() {
        return [
            this.mc.data.itemsByName['wooden_hoe']?.id,
            this.mc.data.itemsByName['fishing_rod']?.id,
            this.mc.data.itemsByName['stone_hoe']?.id,
            this.mc.data.itemsByName['stone_axe']?.id,
            this.mc.data.itemsByName['stone_sword']?.id,
            this.mc.data.itemsByName['stone_pickaxe']?.id,
            this.mc.data.itemsByName['stone_shovel']?.id,
            this.mc.data.itemsByName['iron_hoe']?.id,
            this.mc.data.itemsByName['iron_axe']?.id,
            this.mc.data.itemsByName['iron_sword']?.id,
            this.mc.data.itemsByName['iron_pickaxe']?.id,
            this.mc.data.itemsByName['iron_shovel']?.id,
            this.mc.data.itemsByName['bow']?.id,
            this.mc.data.itemsByName['crossbow']?.id,
            this.mc.data.itemsByName['arrow']?.id,
            this.mc.data.itemsByName['shield']?.id,
            this.mc.data.itemsByName['bread']?.id,
            this.mc.data.itemsByName['potato']?.id,
            this.mc.data.itemsByName['baked_potato']?.id,
            this.mc.data.itemsByName['carrot']?.id,
            this.mc.data.itemsByName['beetroot']?.id,
            this.mc.data.itemsByName['raw_cod']?.id,
            this.mc.data.itemsByName['cooked_cod']?.id,
            this.mc.data.itemsByName['raw_salmon']?.id,
            this.mc.data.itemsByName['cooked_salmon']?.id,
        ]
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
     * @param {MineFlayerPathfinder.Movements} movements
     * @param {MC} mc
     */
    static setPermissiveMovements(movements, mc) {
        movements.canDig = true
        movements.digCost = 40
        movements.placeCost = 30
        movements.entityCost = 10
        movements.allowParkour = true
        movements.allowSprinting = true
        movements.allowEntityDetection = true

        for (const entityId in mc.data.entities) {
            if (mc.data.entities[entityId].type === 'hostile') {
                movements.entitiesToAvoid.add(mc.data.entities[entityId].name)
            }
        }

        /** @type {Array<string>} */
        const blocksCantBreak = [
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

        for (const blockCantBreak of blocksCantBreak) {
            if (mc.data.blocksByName[blockCantBreak]) {
                movements.blocksCantBreak.add(mc.data.blocksByName[blockCantBreak].id)
            } else {
                console.warn(`Unknown block \"${blockCantBreak}\"`)
            }
        }
    
        /** @type {Array<string>} */
        const blocksToAvoid = [
            'campfire',
            'composter',
            'sculk_sensor',
        ]

        for (const blockToAvoid of blocksToAvoid) {
            if (mc.data.blocksByName[blockToAvoid]) {
                movements.blocksToAvoid.add(mc.data.blocksByName[blockToAvoid].id)
            } else {
                console.warn(`Unknown block \"${blockToAvoid}\"`)
            }
        }

        movements.climbables.add(mc.data.blocksByName['vine'].id)
        // movements.replaceables.add(mc.data.blocksByName['short_grass'].id)
        movements.replaceables.add(mc.data.blocksByName['tall_grass'].id)
        movements.canOpenDoors = false
    }

    /**
     * @param {MineFlayerPathfinder.Movements} movements
     * @param {MC} mc
     */
    static setRestrictedMovements(movements, mc) {
        BruhBot.setPermissiveMovements(movements, mc)
        movements.canDig = false
        movements.allow1by1towers = false
        movements.scafoldingBlocks.splice(0, movements.scafoldingBlocks.length)
        movements.placeCost = 500
    }

    /**
     * @param {MineFlayerPathfinder.Movements} movements
     * @param {MC} mc
     */
    static setGentleMovements(movements, mc) {
        BruhBot.setPermissiveMovements(movements, mc)
        movements.canDig = false
        movements.allow1by1towers = false
        movements.scafoldingBlocks.splice(0, movements.scafoldingBlocks.length)
        movements.placeCost = 500
        movements.allowParkour = false
        
        /** @type {Array<string>} */
        const blocksToAvoid = [
            'water',
        ]

        for (const blockToAvoid of blocksToAvoid) {
            if (mc.data.blocksByName[blockToAvoid]) {
                movements.blocksToAvoid.add(mc.data.blocksByName[blockToAvoid].id)
            } else {
                console.warn(`Unknown block \"${blockToAvoid}\"`)
            }
        }
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
        const recipes = [ ]
        if (!cookingResult) {
            return [ ]
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
        const recipes = [ ]
        if (!raw) {
            return [ ]
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
     * @param {(string | number)[]} items
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
     * @param {(string | number)[]} items
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
        yield* wrap(this.bot.unequip('hand'))
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

        const needShield = this.env.possibleDirectHostileAttack()
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
        // @ts-ignore
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
     * @param {Block} crop
     * @returns {number | null}
     */
    getCropSeed(crop) {
        if (!crop.drops) { return null }

        for (const _drop of crop.drops) {
            if (typeof _drop === 'number') {
                if (this.mc.simpleSeeds.includes(_drop)) {
                    return _drop
                }
                continue
            }

            if (typeof _drop.drop === 'number') {
                if (this.mc.simpleSeeds.includes(_drop.drop)) {
                    return _drop.drop
                }
                continue
            }

            if (this.mc.simpleSeeds.includes(_drop.drop.id)) {
                return _drop.drop.id
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
     * @param {import('prismarine-windows').Window<any>} chest
     * @param {number | null} item
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
                if (_item.type !== item) { continue }
                return _item.slot
            }
        }
        
        return null
    }
}
