const MineFlayer = require('mineflayer')
const { Vec3 } = require('vec3')
const MineFlayerPathfinder = require('mineflayer-pathfinder')
const MineFlayerCollectBlock = require('mineflayer-collectblock').plugin
const MineFlayerElytra = require('mineflayer-elytrafly').elytrafly
const MineFlayerHawkEye = require('minecrafthawkeye').default
const MineFlayerArmorManager = require('mineflayer-armor-manager')
const { Item } = require('prismarine-item')
const GotoGoal = require('./goals/goto')
const GotoPlayerGoal = require('./goals/goto-player')
const Context = require('./context')
const GatherMaterialGoal = require('./goals/gather-material')
const PickupItemGoal = require('./goals/pickup-item')
const GiveAllGoal = require('./goals/give-all')
const GiveGoal = require('./goals/give')
const PlantSaplingGoal = require('./goals/plant-sapling')
const AttackGoal = require('./goals/attack')
const EatGoal = require('./goals/eat')
const GatherFood = require('./goals/gather-food')
const BlockExplosionGoal = require('./goals/block-explosion')
const SleepGoal = require('./goals/sleep')
const FlyToGoal = require('./goals/fly-to')
const fJSON = require('./serializing')
const { timeout, randomInt, deg2rad, filterHostiles, sleep } = require('./utils')
const GatherItemGoal = require('./goals/gather-item')
const SmeltGoal = require('./goals/smelt')
const MC = require('./mc')
const Interval = require('./interval')
const HoeingGoal = require('./goals/hoeing')
const World = require('./world')
const Goals = require('./goals')
const PlantSeedGoal = require('./goals/plant-seed')
const HarvestGoal = require('./goals/harvest')
const CompostGoal = require('./goals/compost')
const DumpToChestGoal = require('./goals/dump-to-chest')
const { Entity } = require('prismarine-entity')
const FleeGoal = require('./goals/flee')
const EnderpearlToGoal = require('./goals/enderpearl-to')
const FishGoal = require('./goals/fish')
/** @ts-ignore @type {import('mineflayer-web-inventory').default} */
const MineflayerWebInventory = require('mineflayer-web-inventory')
const MineflayerViewer = require('prismarine-viewer')
const DigAreaGoal = require('./goals/dig-area')
const GeneralGoal = require('./goals/general')
const AnyAsyncGoal = require('./goals/any-async-goal')
const GotoBlockGoal = require('./goals/goto-block')
const DigGoal = require('./goals/dig')
const Wait = require('./goals/wait')

module.exports = class BruhBot {
    /**
     * @private
     * @readonly
     * @type {Goals}
     */
    goals

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
    tryAutoCookInterval
    /**
     * @private
     * @readonly
     * @type {Interval}
     */
    tryAutoGatherFoodInterval
    /**
     * @private
     * @readonly
     * @type {Interval}
     */
    tryAutoHarvestInterval
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
     * @private
     * @readonly
     * @type {Interval}
     */
    unshieldInterval

    /**
     * @private
     * @type {null | { username: string; respond: (message: string) => void }}
     */
    followPlayer

    /**
     * @private
     * @readonly
     * @type {Array<{ position: Vec3, item: string }>}
     */
    harvestedSaplings

    /**
     * @private
     * @readonly
     * @type {Array<{ position: Vec3, item: string }>}
     */
    harvestedCrops

    /**
     * @private
     * @type {Vec3}
     */
    idlePosition

    /**
     * @private
     * @type {Vec3 | null}
     */
    deathPosition

    /**
     * @private
     * @type {Vec3}
     */
    lastPosition

    /**
     * @private
     * @type {AttackGoal | null}
     */
    defendMyselfGoal

    /**
     * @private
     * @readonly
     * @type {Context}
     */
    context

    /**
     * @private
     * @type {Array<Entity>}
     */
    aimingEntities

    /**
     * @private
     * @readonly
     * @type {import('mineflayer').Bot}
     */
    bot

    /**
     * @private
     * @readonly
     * @type {string}
     */
    worldName

    /**
     * @private
     * @type {boolean}
     */
    autoPickUpItems

    /**
     * @private
     * @type {boolean}
     */
    autoSmeltItems

    /**
     * @private
     * @type {boolean}
     */
    autoHarvest

    /**
     * @private
     * @type {boolean}
     */
    idleLooking

    /**
     * @private
     * @type {boolean}
     */
    userQuiet

    /**
     * @private
     * @type {Vec3 | null}
     */
    guardPosition

    /**
     * @param {Readonly<{
     *   [key: string]: any;
     *   dataPath: string;
     *   autoPickUpItems?: boolean;
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

        this.goals = new Goals()

        this.followPlayer = null
        this.harvestedSaplings = []
        this.harvestedCrops = []
        this.idlePosition = null
        this.deathPosition = null
        this.lastPosition = null
        this.defendMyselfGoal = null
        this.guardPosition = null

        this.autoPickUpItems = ('autoPickUpItems' in config) ? config.autoPickUpItems : true
        this.autoSmeltItems = ('autoSmeltItems' in config) ? config.autoSmeltItems : true
        this.autoHarvest = ('autoHarvest' in config) ? config.autoHarvest : true
        this.idleLooking = ('idleLooking' in config) ? config.idleLooking : true

        /** @type {Context} */
        this.context = null

        this.userQuiet = false

        /**
         * @type {Array<Entity>}
         */
        this.aimingEntities = []

        this.bot = MineFlayer.createBot({
            host: config['bot']['host'],
            port: config['bot']['port'],
            username: username,
            logErrors: false,
        })

        this.worldName = worldName

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
            this.context = new Context(this.bot)

            // @ts-ignore
            this.trySleepInterval = new Interval(this.context, 5000)
            // @ts-ignore
            this.tryAutoCookInterval = new Interval(this.context, 10000)
            // @ts-ignore
            this.tryAutoGatherFoodInterval = new Interval(this.context, 5000)
            // @ts-ignore
            this.tryAutoHarvestInterval = new Interval(this.context, 60000)
            // @ts-ignore
            this.checkQuietInterval = new Interval(this.context, 500)

            // @ts-ignore
            this.randomLookInterval = new Interval(this.context, 10000)
            // @ts-ignore
            this.unshieldInterval = new Interval(this.context, 5000)

            World.backup(worldName)
            this.setWorldData(World.load(this.worldName))

            this.bot.pathfinder.setMovements(this.context.permissiveMovements)

            this.lastPosition = this.bot.entity.position.clone()
            this.idlePosition = this.bot.entity.position.clone()

            this.goals.idlingStarted = performance.now()

            this.bot.on('target_aiming_at_you', (entity, arrowTrajectory) => {
                this.aimingEntities.push(entity)
            })

            // const app = require('express')()
            // const http = require('http').createServer(app)

            // MineflayerViewer.mineflayer(this.bot, {
            //     port: 3000,
            //     // _app: app,
            //     // _http: http,
            //     // prefix: '/view',
            // })
            // MineflayerWebInventory(this.bot, {
            //     port: 3001,
            //     // app: app,
            //     // http: http,
            //     // path: '/inventory',
            //     // startOnLoad: false,
            // })

            // http.listen(80)

            // bot.hawkEye.startRadar()
        
            console.log(`[Bot "${username}"] Ready`)
        })

        this.bot.on('move', async (position) => {
            if (!this.context) { return }

            if (this.bot.entity.velocity.y < this.context.mc.data2.general.fallDamageVelocity) {
                if (this.context.didMLG) {
                    console.log(`[Bot "${this.bot.username}"]: Already did MLG, just falling ...`)
                    return
                }
                await mlg(this.context)
                return
            }
            
            if (this.context.doingMLG) {
                this.context.doingMLG = false
            }

            if (this.context.didMLG) {
                this.context.didMLG = false
            }
        })

        this.bot.on('playerUpdated', (player) => {
            this.context.playerPositions[player.username] = player.entity?.position.clone() ?? this.context.playerPositions[player.username]
        })

        /**
         * @param {Context} context
         */
        async function mlg(context) {
            context.doingMLG = true
        
            const neighbour = context.bot.nearestEntity()
            if (neighbour &&
                context.mc.data2.mlg.vehicles.includes(neighbour.name) &&
                context.bot.entity.position.distanceTo(neighbour.position) < 6) {
                console.log(`[Bot "${context.bot.username}"]: MLG: Mounting "${neighbour.name}" ...`)
                context.bot.mount(neighbour)
                context.didMLG = true
                await sleep(100)
                context.bot.dismount()
                return
            }
        
            try {
                let haveMlgItem = 0
                for (const item of context.bot.inventory.slots) {
                    if (!item) { continue }

                    if (context.mc.data2.mlg.boats.includes(item.name) &&
                        haveMlgItem < 1) {
                        await context.bot.equip(item.type, 'hand')
                        haveMlgItem = 1
                        continue
                    }

                    if (context.mc.data2.mlg.mlgBlocks.includes(item.name) &&
                        haveMlgItem < 2) {
                        await context.bot.equip(item.type, 'hand')
                        haveMlgItem = 2
                        break
                    }
                }

                if (!haveMlgItem) {
                    console.warn(`[Bot "${context.bot.username}"]: MLG: No suitable item found`)
                    return
                }

                console.log(`[Bot "${context.bot.username}"]: MLG: Will use ${context.bot.heldItem?.name ?? 'null'} ...`)

                await context.bot.look(context.bot.entity.yaw, -Math.PI / 2, true)

                const reference = context.bot.blockAtCursor(5)
                if (!reference) {
                    console.warn(`[Bot "${context.bot.username}"]: MLG: No reference block`)
                    return
                }
                
                if (!context.bot.heldItem) {
                    console.warn(`[Bot "${context.bot.username}"]: MLG: Not holding anything`)
                    return
                }
                
                if (context.bot.heldItem.name === 'bucket') {
                    console.warn(`[Bot "${context.bot.username}"]: MLG: This is a bucket`)
                    return
                }

                console.log(`[Bot "${context.bot.username}"]: MLG: Using "${context.bot.heldItem.name ?? 'null'}" ...`)

                if (context.bot.heldItem.name === 'water_bucket') {
                    console.log(`[Bot "${context.bot.username}"]: MLG: Placing water ...`)
                    context.bot.activateItem()
                    context.didMLG = true

                    await sleep(40)
                    
                    const junkBlock = context.bot.blockAt(reference.position.offset(0, 1, 0))
                    if (junkBlock) {
                        console.log(`[Bot "${context.bot.username}"]: MLG: Junk water saved`)
                        context.mlgJunkBlocks.push({
                            type: 'water',
                            position: junkBlock.position.clone(),
                        })
                    } else {
                        console.log(`[Bot "${context.bot.username}"]: MLG: Possible junk water saved`)
                        context.mlgJunkBlocks.push({
                            type: 'water',
                            position: reference.position.offset(0, 1, 0),
                        })
                    }
                } else if (context.mc.data2.mlg.boats.includes(context.bot.heldItem.name)) {
                    console.log(`[Bot "${context.bot.username}"]: MLG: Activating item ...`)
                    context.bot.activateItem()

                    await sleep(40)

                    const junkBoat = context.bot.nearestEntity(v => v.name === 'boat')
                    if (junkBoat) {
                        console.log(`[Bot "${context.bot.username}"]: MLG: Junk boat saved`)
                        context.mlgJunkBlocks.push({
                            type: 'boat',
                            id: junkBoat.id,
                        })
                    }
                } else {
                    console.log(`[Bot "${context.bot.username}"]: MLG: Placing block ...`)
                    await context.bot.placeBlock(reference, new Vec3(0, 1, 0))
                    context.didMLG = true

                    await sleep(40)
                    
                    const junkBlock = context.bot.blockAt(reference.position.offset(0, 1, 0))
                    if (junkBlock) {
                        console.log(`[Bot "${context.bot.username}"]: MLG: Junk block saved`)
                        context.mlgJunkBlocks.push({
                            type: 'block',
                            blockName: junkBlock.name,
                            position: junkBlock.position.clone(),
                        })
                    } else {
                        console.warn(`[Bot "${context.bot.username}"]: MLG: No junk block saved`)
                    }
                }
            } catch (error) {
                console.error(error)
            }
        }
        
        this.bot.on('physicsTick', () => {
            if (!this.context) { return }

            this.context.refreshTime()
            this.lastPosition = this.bot.entity.position.clone()

            if (this.context.doingMLG) { return }

            if (this.checkQuietInterval.is()) {
                let shouldBeQuiet = this.userQuiet

                /*
                if (!shouldBeQuiet) {
                    if (this.bot.findBlock({
                        matching: this.context.mc.data.blocksByName['sculk_sensor'].id,
                        maxDistance: 16,
                    })) {
                        shouldBeQuiet = true
                    }
                }
                */

                this.checkQuietInterval.time = shouldBeQuiet ? 5000 : 500

                if (!shouldBeQuiet && this.bot.controlState.sneak && !this.goals.has(true)) {
                    this.bot.setControlState('sneak', false)
                }

                this.context.permissiveMovements.sneak = shouldBeQuiet
                this.context.restrictedMovements.sneak = shouldBeQuiet
                this.context.gentleMovements.sneak = shouldBeQuiet
                this.context.quietMode = shouldBeQuiet
            }

            if (this.goals.critical.length === 0) {
                const criticalGoal = this.getCriticalGoal()
                if (criticalGoal) {
                    criticalGoal.quiet = true
                    this.goals.critical.push(criticalGoal)
                }
            }

            this.handleSurviving()

            this.goals.tick(this.context)

            this.aimingEntities = []

            {
                const now = this.context.time
                let i = 0
                while (i < this.context.chatAwaits.length) {
                    const chatAwait = this.context.chatAwaits[i]
                    if (chatAwait.timeout !== 0 &&
                        now >= chatAwait.timeout + chatAwait.time) {
                            chatAwait.timedout()
                        this.context.chatAwaits.splice(i, 1)
                    } else {
                        i++
                    }
                }
            }

            if (this.followPlayer) {
                const player = this.bot.players[this.followPlayer.username]
                if (!player || !player.entity) {
                    this.followPlayer.respond(`I can't find ${this.followPlayer.username}`)
                    this.followPlayer = null
                } else {
                    const distance = this.bot.entity.position.distanceTo(player.entity.position)
                    if (distance > 7) {
                        const goal = new GotoPlayerGoal(null, this.followPlayer.username, 5, this.context.restrictedMovements)
                        this.goals.normal.push(goal)
                        return
                    }
                }
            }

            if (this.goals.isIdle(1000) &&
                !this.goals.has(true) &&
                this.context.mlgJunkBlocks.length > 0) {
                const clearJunk = new AnyAsyncGoal(this.context, null, async () => {
                    console.log(`[Bot "${this.bot.username}"]: Clearing MLG junk ...`, this.context.mlgJunkBlocks)
                    for (let i = this.context.mlgJunkBlocks.length - 1; i >= 0; i--) {
                        const junk = this.context.mlgJunkBlocks.pop()

                        switch (junk.type) {
                            case 'water': {
                                const junkBlock = this.bot.findBlock({
                                    matching: [
                                        this.context.mc.data.blocksByName['water'].id
                                    ],
                                    maxDistance: 2,
                                    point: junk.position,
                                })
        
                                if (!junkBlock) {
                                    console.warn(`[Bot "${this.bot.username}"]: No water at ${junk.position.x} ${junk.position.y} ${junk.position.z}`)
                                    continue
                                }
        
                                if (junkBlock.name !== 'water') {
                                    console.warn(`[Bot "${this.bot.username}"]: Unknown MLG junk: "${junkBlock.name}"`)
                                    break
                                }

                                console.log(`[Bot "${this.bot.username}"]: Clearing MLG junk: water ...`)
                                await (new GotoBlockGoal(clearJunk, junkBlock.position.clone(), this.context.restrictedMovements)).wait()

                                console.log(`[Bot "${this.bot.username}"]: Equip bucket ...`)
                                const bucket = this.context.searchItem('bucket')
                                if (!bucket) {
                                    console.warn(`[Bot "${this.bot.username}"]: No bucket found`)
                                    break
                                }
                                await this.bot.equip(bucket, 'hand')

                                await this.bot.lookAt(junkBlock.position, true)
                                this.bot.activateItem()

                                break
                            }
                            case 'block': {
                                const junkBlock = this.bot.findBlock({
                                    matching: [
                                        this.context.mc.data.blocksByName[junk.blockName].id
                                    ],
                                    maxDistance: 2,
                                    point: junk.position,
                                })
        
                                if (!junkBlock) {
                                    console.warn(`[Bot "${this.bot.username}"]: No "${junk.blockName}" found at ${junk.position.x} ${junk.position.y} ${junk.position.z}`)
                                    continue
                                }
        
                                await (new DigGoal(this.context, clearJunk, junkBlock, false)).wait()
                                break
                            }
                            case 'boat': {
                                const junkBoat = this.bot.nearestEntity(v => v.id === junk.id)
                                if (!junkBoat) {
                                    console.warn(`[Bot "${this.bot.username}"]: Junk boat not found`)
                                    continue
                                }

                                await (new AttackGoal(clearJunk, junkBoat, true, false, false)).wait()
                                break
                            }
                            default:
                                debugger
                                break
                        }
                    }
                })
                clearJunk.quiet = true
                this.goals.normal.push(clearJunk)
            }

            if (this.goals.isIdle(6000) &&
                !this.goals.has(true) &&
                this.trySleepInterval.is() &&
                SleepGoal.can(this.context)) {
                const goal = new SleepGoal(null)
                goal.quiet = true
                this.goals.normal.push(goal)
                return
            }

            /*
            if (!goals.has(true) &&
                deathPosition) {
                const goToDeathGoal = new GotoGoal(null, deathPosition.clone(), 1, context.permissiveMovements)
                goToDeathGoal.quiet = true
                goals.normal.push(goToDeathGoal)
                goToDeathGoal.then(() => {
                    deathPosition = null
                })
                return
            }
            */

            if (this.context.myArrows.length > 0 &&
                this.goals.isIdle(2000) &&
                !this.goals.has(true)) {
                const pickUpArrowGoal = new AnyAsyncGoal(this.context, null, async () => {
                    const myArrow = this.context.myArrows.shift()
                    if (!myArrow) {
                        return
                    }
                    const entity = this.bot.nearestEntity(v => v.id === myArrow)
                    if (!entity) {
                        console.warn(`[Bot "${this.bot.username}"] Can't find the arrow`)
                        return
                    }
                    await (new GotoGoal(pickUpArrowGoal, entity.position.clone(), 1, this.context.restrictedMovements)).wait()
                    await (new Wait(pickUpArrowGoal, 1000)).wait()
                    if (entity.isValid) {
                        console.warn(`[Bot "${this.bot.username}"] Can't pick up this arrow`)
                    } else {
                        console.log(`[Bot "${this.bot.username}"] Arrow picked up`)
                    }
                })
                pickUpArrowGoal.quiet = true
                this.goals.normal.push(pickUpArrowGoal)
                return
            }

            if (this.autoPickUpItems &&
                this.goals.isIdle(5000) &&
                !this.goals.has(true)) {
                const maxDistance = this.followPlayer ? 10 : 30
                if ('result' in PickupItemGoal.getClosestItem(this.context, null, { maxDistance: maxDistance }) ||
                    // 'result' in PickupItemGoal.getClosestArrow(context) ||
                    'result' in PickupItemGoal.getClosestXp(this.context)) {
                    const goal = new PickupItemGoal(null, { maxDistance: maxDistance }, this.harvestedSaplings)
                    goal.quiet = true
                    this.goals.normal.push(goal)
                    return
                }
            }

            if (this.guardPosition &&
                this.goals.isIdle(100) &&
                !this.goals.has(true)) {
                const d = this.bot.entity.position.distanceTo(this.guardPosition)
                if (d > 2) {
                    const goal = new GotoGoal(null, this.guardPosition, 1, this.context.restrictedMovements)
                    goal.quiet = true
                    this.goals.normal.push(goal)
                    return
                }
                return
            }

            if (this.autoSmeltItems &&
                !this.followPlayer &&
                this.goals.isIdle(5000) &&
                !this.goals.has(true) &&
                this.tryAutoCookInterval.is()) {
                const rawFood = this.context.searchItem(...MC.rawFoods)
                if (rawFood) {
                    if (this.context.mc.simpleSeeds.includes(rawFood.type) &&
                        this.context.itemCount(rawFood.type) <= 1) {
                        // Don't eat plantable foods
                    } else {
                        const recipe = this.context.getCookingRecipesFromRaw(rawFood.name)
                        if (recipe.length > 0) {
                            if (SmeltGoal.findBestFurnace(this.context, recipe, true)) {
                                const goal = new SmeltGoal(null, recipe, true)
                                goal.quiet = true
                                this.goals.normal.push(goal)
                                return
                            }
                        }
                    }
                }
            }

            if (this.autoHarvest &&
                !this.followPlayer &&
                this.goals.isIdle(5000) &&
                !this.goals.has(true) &&
                this.tryAutoHarvestInterval.is()) {
                if (HarvestGoal.getCrops(this.context).length > 0) {
                    const goal = new HarvestGoal(null, null, this.harvestedCrops)
                    goal.quiet = true
                    goal.then(() => {
                        const goal = new CompostGoal(null)
                        goal.quiet = true
                        this.goals.normal.push(goal)
                    })
                    this.goals.normal.push(goal)
                    return
                }
            }

            /*
            if (!this.followPlayer &&
                !this.goals.has(true) &&
                this.idlePosition) {
                const distanceFromIdlePosition = this.bot.entity.position.distanceTo(this.idlePosition)
                if (distanceFromIdlePosition > 5) {
                    const goBackGoal = new GotoGoal(null, this.idlePosition.clone(), 4, this.context.restrictedMovements)
                    goBackGoal.quiet = true
                    this.goals.normal.push(goBackGoal)
                    return
                }
            }
            */

            if (this.idleLooking &&
                this.goals.isIdle(1000) &&
                !this.goals.has(true)) {
                if (this.lookAtNearestPlayer()) {
                    this.randomLookInterval.restart()
                    return
                }
            }

            if (this.idleLooking &&
                this.goals.isIdle(5000) &&
                !this.goals.has(true) &&
                this.randomLookInterval.is()) {
                this.lookRandomly()
                return
            }
        })

        this.bot.on('chat', (username, message) => this.handleChat(username, message, (response) => { this.bot.chat(response) }))
        this.bot.on('whisper', (username, message) => this.handleChat(username, message, (response) => { this.bot.whisper(username, response) }))

        this.bot.on('death', () => {
            console.log(`[Bot "${username}"] Died`)
            this.goals.cancel(false, true, true)
            this.deathPosition = this.lastPosition
        })

        this.bot.on('kicked', (reason) => {
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
            if (this.context) {
                World.save(this.worldName, this.getWorldData())
            }

            this.bot.webInventory?.stop()
            this.bot.viewer?.close()

            this.goals.cancel(true, true, true)

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
        })
        
        this.bot.on('path_update', (r) => {
            const path = [this.bot.entity.position.offset(0, 0.5, 0)]
            for (const node of r.path) {
                path.push(new Vec3(node.x, node.y + 0.5, node.z ))
            }
            this.bot.viewer?.drawLine('path', path, 0xffffff)
        })
        
        this.bot.on('path_reset', (reason) => {
            this.bot.viewer?.erase('path')
        })
        
        this.bot.on('path_stop', () => {
            this.bot.viewer?.erase('path')
        })
    }

    /**
     * @param {string} username
     * @param {string} message
     * @param {(message: string) => void} respond
     */
    handleChat(username, message, respond) {
        if (username === this.bot.username) return

        const original = message.trim().replace(/  /g, ' ')
        message = original.toLowerCase()
        if (message.startsWith('.')) {
            message = message.substring(1)
        }

        if (message === 'leave') {
            this.bot.quit()

            return
        }

        if (message === 'come') {
            let distance = 5

            respond('Okay')

            if (this.goals.normal.length === 0) {
                const target = this.bot.players[username]?.entity
                if (target) {
                    const _distance = this.bot.entity.position.distanceTo(target.position)
                    if (_distance < 6) {
                        distance = 2
                    }
                }
            }

            const goal = new GotoPlayerGoal(null, username, distance, this.context.restrictedMovements)
            this.goals.normal.push(goal)
            try {
                goal.then(() => {
                    this.idlePosition = this.bot.entity.position.clone()
                    respond(`I'm here`)
                })
            } catch (error) { }

            return
        }

        if (message === 'tp') {
            let target = this.bot.players[username]?.entity?.position

            if (!target) {
                target = this.context.playerPositions[username]
            }

            if (!target) {
                respond(`Can't find you`)
                return
            }

            respond('Okay')

            const goal = new EnderpearlToGoal(null, target.clone())
            this.goals.normal.push(goal)
            try {
                goal.then(() => {
                    this.idlePosition = this.bot.entity.position.clone()
                    respond(`I'm here`)
                })
            } catch (error) { }

            return
        }

        if (message === 'fish') {
            respond('Okay')

            const goal = new FishGoal(null)
            this.goals.normal.push(goal)
            try {
                goal.then(() => {
                    respond(`Done`)
                })
            } catch (error) { }

            return
        }

        if (message === 'follow') {
            respond('Okay')

            this.followPlayer = { username: username, respond: respond }
            return
        }

        if (original.startsWith('kill ')) {
            const target = original.replace('kill', '').trimStart()
            if (target === 'BB_vagyok') {
                respond(`No`)
                return
            }

            if (target === 'all') {
                const goal = new AnyAsyncGoal(this.context, null, async () => {
                    let killed = 0
                    const origin = this.context.bot.entity.position.clone()
                    while (true) {
                        this.context.refreshTime()
                        const entity = this.context.bot.nearestEntity(e => {
                            if (e.type === 'global') { return false }
                            if (e.type === 'object') { return false }
                            if (e.type === 'orb') { return false }
                            if (e.type === 'projectile') { return false }
                            if (e.type === 'other') { return false }
                            if (e.type === 'player') { return false }
                            if (!e.name) { return false }
                            if (e.position.distanceTo(origin) > 20) { return false }
                            switch (e.name) {
                                case 'chicken':
                                case 'cow':
                                case 'sheep':
                                case 'goat':
                                case 'frog':
                                case 'fox':
                                case 'llama':
                                case 'mooshroom':
                                case 'mule':
                                case 'ocelot':
                                case 'panda':
                                case 'pig':
                                case 'polar_bear':
                                case 'rabbit':
                                case 'sniffer':
                                case 'snow_golem':
                                case 'slime':
                                case 'trader_llama':
                                case 'slime':
                                case 'turtle':
                                    return true
                                default:
                                    console.log(e.name)
                                    return false
                            }
                        })
                        if (!entity) { break }
                        const attacked = await (new AttackGoal(goal, entity)).wait()
                        if ('result' in attacked) {
                            killed++
                        }
                    }
                    return killed
                })
                goal.then(result => {
                    if (result > 0) {
                        respond(`I killed ${result} mobs`)
                    } else {
                        respond(`There is nobody to kill`)
                    }
                })
                this.goals.normal.push(goal)
                respond(`Okay`)
                return
            }

            const targetPlayer = this.bot.players[target]
            if (!targetPlayer) {
                respond(`Can't find ${target}`)
                return
            }

            const goal = new AttackGoal(null, targetPlayer.entity)
            goal.then(result => {
                respond(`Done`)
            })
            this.goals.normal.push(goal)
            respond(`Okay`)
            return
        }

        if (message.startsWith('dig ')) {
            const parts = message.split(' ')
            if (parts.length !== 1 + 3 + 3) {
                respond(`Syntax: dig <x1> <y1> <z1> <x2> <y2> <z2>`)
                return
            }

            const x1 = Number.parseInt(parts[1])
            const y1 = Number.parseInt(parts[2])
            const z1 = Number.parseInt(parts[3])
            const x2 = Number.parseInt(parts[4])
            const y2 = Number.parseInt(parts[5])
            const z2 = Number.parseInt(parts[6])
            if (Number.isNaN(x1) ||
                Number.isNaN(y1) ||
                Number.isNaN(z1) ||
                Number.isNaN(x2) ||
                Number.isNaN(y2) ||
                Number.isNaN(z2)) {
                respond(`Invalid number`)
                return
            }

            const goal = new DigAreaGoal(null, new Vec3(x1, y1, z1), new Vec3(x2, y2, z2), false)
            this.goals.normal.push(goal)
            goal.then((result) => {
                respond(`Done`)
            })
            respond(`Okay`)
        }

        if (message === 'guard') {
            const target = this.bot.players[username]?.entity
            if (!target) {
                respond(`I can't find you`)
                return
            }

            this.guardPosition = target.position.clone()
            respond(`Okay`)
            return
        }

        if (message === 'stop quiet' ||
            message === 'cancel quiet') {
            if (!this.userQuiet) {
                respond(`I'm not trying to be quiet`)
                return
            }

            respond(`Okay`)
            this.userQuiet = false
            return
        }

        if (message === 'stop' ||
            message === 'cancel') {
            if (this.goals.normal.length === 0) {
                let hadTasks = false
                if (this.followPlayer) {
                    respond(`I stopped following ${(username === this.followPlayer.username) ? 'you' : this.followPlayer}`)
                    this.followPlayer = null
                    hadTasks = true
                }

                if (this.guardPosition) {
                    respond(`I stopped guarding ${this.guardPosition.x} ${this.guardPosition.y} ${this.guardPosition.z}`)
                    this.guardPosition = null
                    hadTasks = true
                }
                
                if (!hadTasks) {
                    respond(`I don't have any tasks`)
                }
                return
            }

            this.followPlayer = null
            this.goals.cancel(true, false, false, () => {
                respond(`I stopped`)
            })

            return
        }

        if (message === 'fly') {
            respond('Okay')

            const target = this.bot.players[username]?.entity

            if (!target) {
                respond(`Can't find you`)
                return
            }

            const goal = new FlyToGoal(null, target.position.clone())
            this.goals.normal.push(goal)
            try {
                goal.then(() => {
                    this.idlePosition = this.bot.entity.position.clone()
                    respond(`I'm here`)
                })
            } catch (error) { }

            return
        }

        if (message === 'wyd') {
            if (this.goals.critical.length > 0) {
                respond(`RAAHH`)
                return
            }

            if (this.goals.survival.length > 0) {
                let current = this.goals.survival[0]
                let builder = `I'm taking care of myself: `
                while (current) {
                    if (current.parent) {
                        builder += ' => '
                    }
                    builder += current.toReadable(this.context)
                    current = current.goals[0]
                }

                respond(builder)
                return
            }

            if (this.goals.normal.length > 0) {
                let current = this.goals.normal[0]
                let builder = ''
                while (current) {
                    if (current.parent) {
                        builder += ' => '
                    }
                    builder += current.toReadable(this.context)
                    current = current.goals[0]
                }

                respond(builder)
                return
            }

            respond(`Nothing`)
            return
        }

        if (message.startsWith('make ')) {
            const make = message.replace('make', '').trimStart()

            if (make === 'farm') {
                const goal = HoeingGoal.atPlayer(this.context, username)
                if ('error' in goal) {
                    respond(goal.error.toString())
                    return
                }

                respond(`Okay`)
                goal.result.then(() => {
                    respond(`Done`)
                })
                this.goals.normal.push(goal.result)

                return
            }

            respond(`I don't know how to make it`)
            return
        }

        if (message === 'farm') {

            const goal = HoeingGoal.atPlayer(this.context, username)

            if ('error' in goal) {
                respond(`Okay`)
                const goal = new PlantSeedGoal(null, this.context.mc.simpleSeeds, null)
                goal.then(() => {
                    respond(`Done`)
                })
                this.goals.normal.push(goal)
                return
            }

            respond(`Okay`)
            goal.result.finally(() => {
                const goal = new PlantSeedGoal(null, this.context.mc.simpleSeeds, null)
                goal.then(() => {
                    respond(`Done`)
                })
                this.goals.normal.push(goal)
            })
            this.goals.normal.push(goal.result)

            return
        }

        if (message === 'harvest') {
            const target = this.bot.players[username]?.entity
            let farmPosition = this.bot.entity.position.clone()
            if (target) {
                const water = this.bot.findBlock({
                    matching: [this.context.mc.data.blocksByName['water'].id],
                    point: target.position.clone(),
                    maxDistance: 4,
                })
                if (water) {
                    farmPosition = water.position.clone()
                }
            } else {
                const water = this.bot.findBlock({
                    matching: [this.context.mc.data.blocksByName['water'].id],
                    maxDistance: 4,
                })
                if (water) {
                    farmPosition = water.position.clone()
                }
            }

            respond(`Okay`)
            const goal = new HarvestGoal(null, farmPosition, this.harvestedCrops)
            goal.then(() => {
                respond(`Done`)
            })
            this.goals.normal.push(goal)

            return
        }

        if (message.startsWith('dump ')) {
            let itemName = message.replace('dump', '').trimStart()
            let count = 1

            if (itemName === 'trash' || itemName === 'yunk' || itemName === 'junk') {
                const notTrash = [
                    this.context.mc.data.itemsByName['wooden_hoe']?.id,
                    this.context.mc.data.itemsByName['fishing_rod']?.id,
                    this.context.mc.data.itemsByName['stone_hoe']?.id,
                    this.context.mc.data.itemsByName['stone_axe']?.id,
                    this.context.mc.data.itemsByName['stone_sword']?.id,
                    this.context.mc.data.itemsByName['stone_pickaxe']?.id,
                    this.context.mc.data.itemsByName['stone_shovel']?.id,
                    this.context.mc.data.itemsByName['iron_hoe']?.id,
                    this.context.mc.data.itemsByName['iron_axe']?.id,
                    this.context.mc.data.itemsByName['iron_sword']?.id,
                    this.context.mc.data.itemsByName['iron_pickaxe']?.id,
                    this.context.mc.data.itemsByName['iron_shovel']?.id,
                    this.context.mc.data.itemsByName['bow']?.id,
                    this.context.mc.data.itemsByName['crossbow']?.id,
                    this.context.mc.data.itemsByName['arrow']?.id,
                    this.context.mc.data.itemsByName['shield']?.id,
                    this.context.mc.data.itemsByName['bread']?.id,
                    this.context.mc.data.itemsByName['potato']?.id,
                    this.context.mc.data.itemsByName['baked_potato']?.id,
                    this.context.mc.data.itemsByName['carrot']?.id,
                    this.context.mc.data.itemsByName['beetroot']?.id,
                    this.context.mc.data.itemsByName['raw_cod']?.id,
                    this.context.mc.data.itemsByName['cooked_cod']?.id,
                    this.context.mc.data.itemsByName['raw_salmon']?.id,
                    this.context.mc.data.itemsByName['cooked_salmon']?.id,
                ]

                const task = new GeneralGoal(null, async () => {
                    const allItems = this.bot.inventory.items()
                    for (const item of allItems) {
                        if (notTrash.includes(item.type)) {
                            continue
                        }
                        const goal = new DumpToChestGoal(task, item.type, item.count)
                        await goal.wait()
                    }
                    return { result: true }
                })

                respond(`Okay`)
                this.goals.normal.push(task)
                task.then(() => {
                    respond(`Done`)
                })

                return
            }

            if (itemName.split(' ')[0] === 'all') {
                count = Infinity
                itemName = itemName.substring(itemName.split(' ')[0].length).trimStart()
            } else if (!Number.isNaN(Number.parseInt(itemName.split(' ')[0]))) {
                count = Number.parseInt(itemName.split(' ')[0])
                itemName = itemName.substring(itemName.split(' ')[0].length).trimStart()
            }

            respond('Okay')

            const item = this.context.mc.getCorrectItems(itemName)

            if (!item) {
                respond(`I don't know what ${itemName} it is`)
                return
            }

            const goal = new DumpToChestGoal(null, item.id, count)
            this.goals.normal.push(goal)
            goal.then((result) => {
                respond(`Done`)
            })

            return
        }

        if (message.startsWith('get ')) {
            let material = message.replace('get', '').trimStart()
            let count = 1

            if (!Number.isNaN(Number.parseInt(material.split(' ')[0]))) {
                count = Number.parseInt(material.split(' ')[0])
                material = material.substring(material.split(' ')[0].length).trimStart()
            }

            respond('Okay')

            if (material === 'food') {
                const goal = new GatherFood(null, true)
                this.goals.normal.push(goal)
                goal.then(result => {
                    if (result === 'have') {
                        respond(`I already have food`)
                        return
                    }
                    respond(`I have gathered a ${result.displayName}`)
                })
                return
            }

            const item = this.context.mc.getCorrectItems(material)

            if (item) {
                const goal = new GatherItemGoal(null, item.id, count, true, false, false)
                this.goals.normal.push(goal)
                goal.then((result) => {
                    switch (result) {
                        case 'have':
                            respond(`I already have ${item.displayName}`)
                            break
                        case 'crafted':
                            respond(`I crafted ${goal.getDelta(this.context)} ${item.displayName}`)
                            break
                        case 'digged':
                            respond(`I digged ${goal.getDelta(this.context)} ${item.displayName}`)
                            break
                        case 'looted':
                            respond(`I looted ${goal.getDelta(this.context)} ${item.displayName}`)
                            break
                        case 'smelted':
                            respond(`I smelted ${goal.getDelta(this.context)} ${item.displayName}`)
                            break
                        default:
                            respond(`I gathered ${goal.getDelta(this.context)} ${item.displayName}`)
                            break
                    }
                })
                return
            }

            const goal = new GatherMaterialGoal(null, material)
            this.goals.normal.push(goal)

            try {
                goal.then(result => {
                    let builder = ''
                    if (result.length === 0) {
                        builder = 'nothing'
                    } else {
                        for (let i = 0; i < result.length; i++) {
                            const item = result[i]
                            if (i > 0) {
                                if (i === result.length - 1) {
                                    builder += ` and `
                                } else {
                                    builder += `, `
                                }
                            }
                            builder += `${item.delta} of ${item.name}`
                        }
                        builder = builder.trim()
                    }
                    console.log(`[Bot "${username}"] I have gathered ${builder}`)
                })
            } catch (error) { }

            return
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

        if (message === 'go home') {
            const myBed = SleepGoal.findMyBed(this.context)
            if (!myBed) {
                respond(`I doesn't have a bed`)
                return
            }

            const goal = new GotoGoal(null, myBed.position.clone(), 4, this.context.restrictedMovements)
            this.goals.normal.push(goal)
            goal.then((result) => {
                switch (result) {
                    case 'here':
                        respond(`I'm already at my bed`)
                        break
                    case 'done':
                        respond(`I'm here`)
                        break
                    default:
                        break
                }
            })

            return
        }

        if (message === 'sleep') {
            if (!SleepGoal.can(this.context)) {
                respond(`I can't`)
                return
            }

            const goal = new SleepGoal(null)
            this.goals.normal.push(goal)

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

        if (message.startsWith('cost ')) {
            let itemName = message.replace('cost', '').trimStart()
            itemName = itemName.replace(/ /g, '_').toLowerCase()

            if (!this.context.mc.data.itemsByName[itemName]) {
                respond(`I don't know what it is`)
                return
            }

            const cost = GatherItemGoal.itemCost(this.context, this.context.mc.data.itemsByName[itemName].id, 1, true, 0)
            timeout(cost, 5000)
                .then((result) => {
                    respond(result.toString())
                })
                .catch((reason) => {
                    console.error(`[Bot "${username}"]`, reason)
                    if (reason === 'Time Limit Exceeded') {
                        respond(`I don't know`)
                    }
                })

            return
        }

        if (message === 'replant') {
            if (this.harvestedSaplings.length === 0) {
                respond('No saplings saved')

                return
            }

            const goal = new PlantSaplingGoal(null, this.harvestedSaplings, true)
            this.goals.normal.push(goal)
            try {
                goal.then(result => {
                    if (result === 0) {
                        respond(`I couldn't replant any saplings`)
                    } else {
                        respond(`I have replanted ${result} saplings`)
                    }
                })
            } catch (error) { }

            return
        }

        if (message === 'plant') {
            const goal = new PlantSaplingGoal(null, null, true)
            this.goals.normal.push(goal)
            try {
                goal.then(result => {
                    if (result === 0) {
                        respond(`I couldn't plant any saplings`)
                    } else {
                        respond(`I have planted ${result} saplings`)
                    }
                })
            } catch (error) { }

            return
        }

        if (message.startsWith('give ')) {
            let giveItemName = message.replace('give', '').trimStart()

            if (giveItemName === 'all') {
                respond('Okay')
                const goal = new GiveAllGoal(null, username)
                this.goals.normal.push(goal)
                try {
                    goal.then(() => {
                        respond(`There it is`)
                    })
                } catch (error) { }
                return
            }

            let count = 1
            if (giveItemName.includes(' ')) {
                count = Number.parseInt(giveItemName.split(' ')[0])
                if (Number.isNaN(count)) {
                    count = 1
                } else {
                    giveItemName = giveItemName.substring(giveItemName.split(' ')[0].length).trimStart()
                }
            }

            const giveItem = this.context.mc.data.itemsByName[giveItemName.replace(/ /g, '_')]
            if (!giveItem) {
                respond(`I don't know what item ${giveItemName} is`)
                return
            }

            if (this.goals.normal.length === 0 &&
                !this.context.searchItem(giveItem.id)) {
                respond(`I doesn't have ${giveItem.displayName}`)
                return
            }

            const goal = new GiveGoal(null, username, giveItem, count)
            this.goals.normal.push(goal)
            try {
                goal.then((gave) => {
                    if (gave < count) {
                        respond(`I only got ${gave} ${giveItem.displayName}`)
                    } else {
                        respond(`There is your ${giveItem.displayName}`)
                    }
                })
            } catch (error) { }
            return
        }

        for (let i = 0; i < this.context.chatAwaits.length; i++) {
            const chatAwait = this.context.chatAwaits[i]
            if (chatAwait.callback(username, message)) {
                this.context.chatAwaits.splice(i, 1)
                return
            }
        }
    }

    /**
     * @private
     */
    getCriticalGoal() {
        let creeper = this.context.explodingCreeper()

        if (creeper) {
            if (this.context.searchItem('shield')) {
                return new BlockExplosionGoal(null)
            } else {
                return new FleeGoal(null, creeper.position.clone(), 8)
            }
        }

        creeper = this.bot.nearestEntity((entity) => entity.name === 'creeper')

        if (creeper && this.bot.entity.position.distanceTo(creeper.position) < 3) {
            return new FleeGoal(null, creeper.position.clone(), 8)
        }

        if (this.aimingEntities.length > 0) {
            const entity = this.aimingEntities[0]
            console.log(`[Bot "${this.bot.username}"] ${entity?.displayName ?? entity?.name ?? 'Someone'} aiming at me`)
        }

        // if (BlockMeleeGoal.getHazard(context) &&
        //     context.searchItem('shield')) {
        //     console.warn('AAAAAAAA')
        //     return new BlockMeleeGoal(null)
        // }

        return null
    }

    /**
     * @private
     */
    getSurvivalGoal() {
        const hostile = this.bot.nearestEntity(entity => {
            if (filterHostiles(entity)) { return true }
            return false
        })

        if (hostile) {
            const distance = this.bot.entity.position.distanceTo(hostile.position)

            if (distance < 10) {
                if (this.context.quietMode) {
                    return new FleeGoal(null, hostile.position, 5)
                }

                const attackGoal = new AttackGoal(null, hostile)
                if (this.defendMyselfGoal &&
                    this.defendMyselfGoal.entity &&
                    this.defendMyselfGoal.entity.isValid) {
                    if (this.defendMyselfGoal.entity === hostile) {
                        return this.defendMyselfGoal
                    }
                    console.warn(`[Bot "${this.bot.username}"] Changing target`)
                    this.defendMyselfGoal.entity = hostile
                    return this.defendMyselfGoal
                }
                this.defendMyselfGoal = attackGoal
                attackGoal.finally(() => { if (this.defendMyselfGoal === attackGoal) this.defendMyselfGoal = null })
                return attackGoal
            }

            if (distance < 20 && !this.context.quietMode) {
                const rangeWeapon = this.context.searchRangeWeapon()

                if (rangeWeapon && rangeWeapon.ammo > 0) {
                    if (hostile.name !== 'enderman') {
                        const grade = this.bot.hawkEye.getMasterGrade(hostile, this.bot.entity.velocity, rangeWeapon.weapon)
                        if (grade && !grade.blockInTrayect) {
                            return new AttackGoal(null, hostile)
                        }
                    }
                }
            }
        }

        if (this.bot.food < 18 && !this.context.quietMode) {
            // if (this.bot.food < 10 &&
            //     !EatGoal.hasFood(this.context) &&
            //     this.tryAutoGatherFoodInterval.is()) {
            //     return new GatherFood(null, false)
            // }

            if (EatGoal.hasFood(this.context)) {
                return new EatGoal(null)
            }
        }

        return null
    }

    /**
     * @private
     */
    handleSurviving() {
        if (this.goals.survival.length > 0) { return }

        const survivalGoal = this.getSurvivalGoal()
        
        if (!survivalGoal) { return }

        survivalGoal.quiet = true
        if (survivalGoal instanceof AttackGoal) {
            survivalGoal.then(() => {
                if (survivalGoal.entity && survivalGoal.entity.position) {
                    const pickupItems = new PickupItemGoal(null, { inAir: true, point: survivalGoal.entity.position.clone() }, this.harvestedSaplings)
                    pickupItems.quiet = true
                    this.goals.normal.push(pickupItems)
                }
            })
        }
        this.goals.survival.push(survivalGoal)
    }

    //#region World Data

    /**
     * @private
     */
    getWorldData() {
        return {
            'harvested': {
                saplings: this.harvestedSaplings,
                crops: this.harvestedCrops,
            },
            'positions': {
                idlePosition: this.idlePosition,
                deathPosition: this.deathPosition,
                bed: this.context.myBed,
            },
            'my_chests': this.context.myChests,
        }
    }

    /**
     * @private
     * @param {{ [key: string]: any } | null} data
     */
    setWorldData(data) {
        if (!data) {
            return
        }

        if (data['harvested']) {
            for (const element of data['harvested']['saplings']) {
                const item = fJSON.toString(element, 'item')
                const position = fJSON.toVec3(element, 'position')

                if (!item || !position) { continue }

                this.harvestedSaplings.push({ item, position, })
            }

            for (const element of data['harvested']['crops']) {
                const item = fJSON.toString(element, 'item')
                const position = fJSON.toVec3(element, 'position')

                if (!item || !position) { continue }

                this.harvestedCrops.push({ item, position, })
            }
        }

        if (data['positions']) {
            const positions = data['positions']

            this.idlePosition = fJSON.toVec3(positions, 'idlePosition')
            this.deathPosition = fJSON.toVec3(positions, 'deathPosition')
            this.context.myBed = fJSON.toVec3(positions, 'bed')
        }

        if (data['my_chests']) {
            const myChests = data['my_chests']
            this.context.myChests = myChests
        }
    }

    //#endregion

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
}
