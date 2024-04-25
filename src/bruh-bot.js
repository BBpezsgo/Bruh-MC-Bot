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
const { timeout, randomInt, deg2rad, filterHostiles } = require('./utils')
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
const FleeFromEndermanGoal = require('./goals/flee-from-enderman')
const FishGoal = require('./goals/fish')
/** @ts-ignore @type {import('mineflayer-web-inventory').default} */
const MineflayerWebInventory = require('mineflayer-web-inventory')
const MineflayerViewer = require('prismarine-viewer')
const DigAreaGoal = require('./goals/dig-area')
const GeneralGoal = require('./goals/general')

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
     * @readonly
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
        worldName = worldName + '_' + username

        this.goals = new Goals()

        this.trySleepInterval = new Interval(5000)
        this.tryAutoCookInterval = new Interval(10000)
        this.tryAutoGatherFoodInterval = new Interval(5000)
        this.tryAutoHarvestInterval = new Interval(60000)
        this.checkQuietInterval = new Interval(500)

        this.randomLookInterval = new Interval(10000)
        this.unshieldInterval = new Interval(5000)

        this.followPlayer = null
        this.harvestedSaplings = []
        this.harvestedCrops = []
        this.idlePosition = null
        this.deathPosition = null
        this.lastPosition = null
        this.defendMyselfGoal = null

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
        })

        this.worldName = worldName

        this.bot.once('spawn', () => {
            console.log(`Spawned`)

            this.bot.loadPlugin(MineFlayerPathfinder.pathfinder)
            this.bot.loadPlugin(MineFlayerCollectBlock)
            this.bot.loadPlugin(MineFlayerArmorManager)
            this.bot.loadPlugin(MineFlayerHawkEye)
            this.bot.loadPlugin(MineFlayerElytra)

            // @ts-ignore
            this.context = new Context(this.bot)
            World.backup(worldName)
            this.setWorldData(World.load(this.worldName))

            this.bot.pathfinder.setMovements(this.context.permissiveMovements)

            this.lastPosition = this.bot.entity.position.clone()

            this.goals.idlingStarted = performance.now()

            this.bot.on('target_aiming_at_you', (entity, arrowTrajectory) => {
                this.aimingEntities.push(entity)
            })

            // const app = require('express')()
            // const http = require('http').createServer(app)

            MineflayerViewer.mineflayer(this.bot, {
                port: 3000,
                // _app: app,
                // _http: http,
                // prefix: '/view',
            })
            // @ts-ignore
            MineflayerWebInventory(this.bot, {
                port: 3001,
                // app: app,
                // http: http,
                // path: '/inventory',
                // startOnLoad: false,
            })

            // http.listen(80)

            // bot.hawkEye.startRadar()
        })

        this.bot.on('physicsTick', () => {
            if (!this.context) { return }

            this.lastPosition = this.bot.entity.position.clone()

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

            // @ts-ignore
            this.aimingEntities = []

            {
                const now = performance.now()
                let i = 0
                while (i < this.context.chatAwaits.length) {
                    const item = this.context.chatAwaits[i]
                    if (item.timeout !== 0 &&
                        now >= item.timeout + item.time) {
                        item.timedout()
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
            this.goals.cancel(false, true, true)
            this.deathPosition = this.lastPosition
        })

        this.bot.on('kicked', (reason) => console.warn(`Kicked:`, reason))
        this.bot.on('error', console.error)

        this.bot.on('end', (reason) => {
            if (this.context) {
                World.save(this.worldName, this.getWorldData())
            }

            // @ts-ignore
            if (this.bot.webInventory) { this.bot.webInventory.stop() }
            // @ts-ignore
            if (this.bot.viewer) { this.bot.viewer.close() }

            this.goals.cancel(true, true, true)

            console.log(`Ended:`, reason)
        })
        
        this.bot.on('path_update', (r) => {
            const path = [this.bot.entity.position.offset(0, 0.5, 0)]
            for (const node of r.path) {
                path.push(new Vec3(node.x, node.y + 0.5, node.z ))
            }
            this.bot.viewer.drawLine('path', path, 0xffffff)
        })
        
        this.bot.on('path_reset', (reason) => {
            this.bot.viewer.erase('path')
        })
        
        this.bot.on('path_stop', () => {
            this.bot.viewer.erase('path')
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

            const targetPlayer = this.bot.players[target]
            if (!targetPlayer) {
                respond(`Can't find ${target}`)
                return
            }

            const goal = new AttackGoal(null, targetPlayer.entity)
            goal.then((result) => {
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
                if (this.followPlayer) {
                    respond(`I stopped following ${(username === this.followPlayer.username) ? 'you' : this.followPlayer}`)
                    this.followPlayer = null
                } else {
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

            respond(`I down't know how to make it`)
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
                    console.log(`I have gathered ${builder}`)
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
                    console.error(reason)
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
        if (this.context.explodingCreeper()) {
            return new BlockExplosionGoal(null)
        }

        if (this.aimingEntities.length > 0) {
            const entity = this.aimingEntities[0]
            console.log(`${entity?.displayName ?? entity?.name ?? 'Someone'} aiming at me`)
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

            if (distance < 5) {
                if (this.context.quietMode) {
                    return new FleeGoal(null, hostile.position, 5)
                }

                const attackGoal = new AttackGoal(null, hostile)
                if (this.defendMyselfGoal &&
                    this.defendMyselfGoal.entity &&
                    this.defendMyselfGoal.entity.isValid) {
                    if (this.defendMyselfGoal.entity === hostile) {
                        return null
                    }
                    console.warn(`Changing target`)
                    this.defendMyselfGoal.entity = hostile
                    return null
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
            if (false &&
                this.bot.food < 10 &&
                !EatGoal.hasFood(this.context) &&
                this.tryAutoGatherFoodInterval.is()) {
                return new GatherFood(null, false)
            }

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
        const survivalGoal = this.getSurvivalGoal()
        if (this.goals.survival.length === 0 && survivalGoal) {
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
    }

    //#region World Data

    /**
     * @private
     */
    getWorldData() {
        return {
            harvested: {
                saplings: this.harvestedSaplings,
                crops: this.harvestedCrops,
            },
            positions: {
                idlePosition: this.idlePosition,
                deathPosition: this.deathPosition,
                bed: this.context.myBed,
            },
        }
    }

    /**
     * @private
     * @param {{ [key: string]: any }} data
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
