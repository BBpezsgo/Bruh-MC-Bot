const MineFlayer = require('mineflayer')
const { Vec3 } = require('vec3')
const MineFlayerPathfinder = require('mineflayer-pathfinder')
const MineFlayerCollectBlock = require('mineflayer-collectblock').plugin
const MineFlayerElytra = require('mineflayer-elytrafly').elytrafly
const MineFlayerHawkEye = require('minecrafthawkeye').default
const MineFlayerArmorManager = require('mineflayer-armor-manager')
const { Block } = require('prismarine-block')
const { Item } = require('prismarine-item')
const { Recipe, RecipeItem } = require('prismarine-recipe')
const getMcData = require('minecraft-data')
const path = require('path')
const fs = require('fs')
const { Goal } = require('./goals/base')
const GotoGoal = require('./goals/goto')
const GotoPlayerGoal = require('./goals/goto-player')
const Context = require('./context')
const GatherMaterialGoal = require('./goals/gather-material')
const AsyncGoal = require('./goals/async-base')
const PickupItemGoal = require('./goals/pickup-item')
const GiveAllGoal = require('./goals/give-all')
const GiveGoal = require('./goals/give')
const PlantSaplingGoal = require('./goals/plant-sapling')
const AttackGoal = require('./goals/attack')
const EatGoal = require('./goals/eat')
const GatherFood = require('./goals/gather-food')
const BlockExplosionGoal = require('./goals/block-explosion')
const BlockMeleeGoal = require('./goals/block-melee')
const SleepGoal = require('./goals/sleep')
const FlyToGoal = require('./goals/fly-to')
const fJSON = require('./serializing')
const { error, timeout, randomInt, deg2rad, lerp, lerpDeg, lerpRad, filterHostiles } = require('./utils')
const GatherItemGoal = require('./goals/gather-item')
const SmeltGoal = require('./goals/smelt')
const MC = require('./mc')
const Interval = require('./interval')
const HoeingGoal = require('./goals/hoeing')
const config = require('./config')
const World = require('./world')
const Goals = require('./goals')
const PlantSeedGoal = require('./goals/plant-seed')
const HarvestGoal = require('./goals/harvest')
const CompostGoal = require('./goals/compost')
const FollowPlayerGoal = require('./goals/follow-player')
const Hands = require('./hands')
const DumpToChestGoal = require('./goals/dump-to-chest')
const { Entity } = require('prismarine-entity')

const goals = new Goals()

let trySleepInterval = new Interval(5000)
let tryAutoCookInterval = new Interval(10000)
let tryAutoGatherFoodInterval = new Interval(5000)
let tryAutoHarvestInterval = new Interval(60000)

let randomLookInterval = new Interval(10000)
let unshieldInterval = new Interval(5000)

/**
 * @type {string | null}
 */
let followPlayer = null

/**
 * @type {Array<{ position: Vec3, item: string }>}
 */
const harvestedSaplings = []

/**
 * @type {Array<{ position: Vec3, item: string }>}
 */
const harvestedCrops = []

/**
 * @type {Vec3}
 */
let idlePosition = null

/**
 * @type {Vec3 | null}
 */
let deathPosition = null

/**
 * @type {Vec3}
 */
let lastPosition = null

/**
 * @type {AttackGoal | null}
 */
let defendMyselfGoal = null

function getCriticalGoal() {
    if (context.explodingCreeper()) {
        return new BlockExplosionGoal(null)
    }

    if (aimingEntities.length > 0) {
        const entity = aimingEntities[0]
        console.log(`${entity?.displayName ?? entity?.name ?? 'Someone'} aiming at me`)
    }
    
    // if (BlockMeleeGoal.getHazard(context) &&
    //     context.searchItem('shield')) {
    //     console.warn('AAAAAAAA')
    //     return new BlockMeleeGoal(null)
    // }

    return null
}

function getSurvivalGoal() {
    let hostile = bot.nearestEntity(entity => {
        if (filterHostiles(entity)) { return true }
        return false
    })

    if (hostile) {
        const distance = bot.entity.position.distanceTo(hostile.position)
        if (distance < 20) {
            const rangeWeapon = context.searchRangeWeapon()

            if (rangeWeapon && rangeWeapon.ammo > 0) {
                if (hostile.name !== 'creeper' &&
                    hostile.name !== 'enderman') {
                    return new AttackGoal(null, hostile)
                }
            }
            
            if (distance < 5) {
                const attackGoal = new AttackGoal(null, hostile)
                if (defendMyselfGoal &&
                    defendMyselfGoal.entity &&
                    defendMyselfGoal.entity.isValid) {
                    if (defendMyselfGoal.entity === hostile) {
                        return null
                    }
                    console.warn(`Changing target`)
                    defendMyselfGoal.entity = hostile
                    return null
                }
                defendMyselfGoal = attackGoal
                attackGoal.finally(() => { if (defendMyselfGoal === attackGoal) defendMyselfGoal = null })
                return attackGoal
            }
        }
    }

    if (bot.food < 18) {
        if (false &&
            bot.food < 10 &&
            !EatGoal.hasFood(context) &&
            tryAutoGatherFoodInterval.is()) {
            return new GatherFood(null, false)
        }
        
        if (EatGoal.hasFood(context)) {
            return new EatGoal(null)
        }
    }

    return null
}

function handleSurviving() {
    const survivalGoal = getSurvivalGoal()
    if (goals.survival.length === 0 && survivalGoal) {
        survivalGoal.quiet = true
        if (survivalGoal instanceof AttackGoal) {
            survivalGoal.then(() => {
                if (survivalGoal.entity && survivalGoal.entity.position) {
                    const pickupItems = new PickupItemGoal(null, { inAir: true, point: survivalGoal.entity.position.clone() }, harvestedSaplings)
                    pickupItems.quiet = true
                    goals.normal.push(pickupItems)
                }
            })
        }
        goals.survival.push(survivalGoal)
    }
}

function getWorldData() {
    return {
        harvested: {
            saplings: harvestedSaplings,
            crops: harvestedCrops,
        },
        positions: {
            idlePosition: idlePosition,
            deathPosition: deathPosition,
            bed: context.myBed,
        },
    }
}

/**
 * @param {{ [key: string]: any }} data
 */
function setWorldData(data) {
    if (!data) {
        return
    }

    if (data['harvested']) {
        for (const element of data['harvested']['saplings']) {
            const item = fJSON.toString(element, 'item')
            const position = fJSON.toVec3(element, 'position')

            if (!item || !position) { continue }

            harvestedSaplings.push({ item, position, })
        }
        
        for (const element of data['harvested']['crops']) {
            const item = fJSON.toString(element, 'item')
            const position = fJSON.toVec3(element, 'position')

            if (!item || !position) { continue }

            harvestedCrops.push({ item, position, })
        }
    }

    if (data['positions']) {
        const positions = data['positions']

        idlePosition = fJSON.toVec3(positions, 'idlePosition')
        deathPosition = fJSON.toVec3(positions, 'deathPosition')
        context.myBed = fJSON.toVec3(positions, 'bed')
    }
}

function lookAtNearestPlayer() {
    const nearest = bot.nearestEntity(entity => (
        entity.type === 'player' &&
        entity.username !== bot.username
    ))
    if (!nearest) { return false }

    const distance = nearest.position.distanceTo(bot.entity.position)
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

    bot.lookAt(playerEye)
    return true
}

function lookRandomly() {
    const pitch = randomInt(-40, 30)
    const yaw = randomInt(-180, 180)
    bot.look(yaw * deg2rad, pitch * deg2rad)
}

const bot = MineFlayer.createBot({
    host: config['bot']['host'],
    port: config['bot']['port'],
    username: config['bot']['username'],
})

Hands.init(bot)

/** @type {Context} */
let context = null

World.backup('bruh')

/**
 * @type {Array<Entity>}
 */
let aimingEntities = [ ]

bot.once('spawn', () => {
    bot.loadPlugin(MineFlayerPathfinder.pathfinder)
    bot.loadPlugin(MineFlayerCollectBlock)
    bot.loadPlugin(MineFlayerArmorManager)
    bot.loadPlugin(MineFlayerHawkEye)
    bot.loadPlugin(MineFlayerElytra)
    
    context = new Context(bot)
    setWorldData(World.load('bruh'))
    
    bot.pathfinder.setMovements(context.permissiveMovements)

    lastPosition = bot.entity.position.clone()

    goals.idlingStarted = performance.now()

    bot.on('target_aiming_at_you', (entity, arrowTrajectory) => {
        aimingEntities.push(entity)
    })

    // bot.hawkEye.startRadar()
})

bot.on('physicsTick', () => {
    lastPosition = bot.entity.position.clone()

    if (goals.critical.length === 0) {
        const criticalGoal = getCriticalGoal()
        if (criticalGoal) {
            criticalGoal.quiet = true
            goals.critical.push(criticalGoal)
        }
    }

    handleSurviving()

    goals.tick(context)

    aimingEntities = [ ]
    
    {
        const now = performance.now()
        let i = 0
        while (i < context.chatAwaits.length) {
            const item = context.chatAwaits[i]
            if (item.timeout !== 0 &&
                now >= item.timeout + item.time) {
                item.timedout()
                context.chatAwaits.splice(i, 1)
            } else {
                i++
            }
        }
    }

    if (followPlayer) {
        const player = bot.players[followPlayer]
        if (!player || !player.entity) {
            bot.chat(`I can't find ${followPlayer}`)
            followPlayer = null
        } else {
            const distance = bot.entity.position.distanceTo(player.entity.position)
            if (distance > 7) {
                const goal = new GotoPlayerGoal(null, followPlayer, 5, context.restrictedMovements)
                goals.normal.push(goal)
                return
            }
        }
    }

    if (goals.isIdle(6000) &&
        !goals.has(true) &&
        trySleepInterval.is() &&
        SleepGoal.can(context)) {
        const goal = new SleepGoal(null)
        goal.quiet = true
        goals.normal.push(goal)
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

    if (goals.isIdle(5000) &&
        !goals.has(true)) {
        const maxDistance = followPlayer ? 10 : 30
        if ('result' in PickupItemGoal.getClosestItem(context, null, { maxDistance: maxDistance }) ||
            // 'result' in PickupItemGoal.getClosestArrow(context) ||
            'result' in PickupItemGoal.getClosestXp(context)) {
            const goal = new PickupItemGoal(null, { maxDistance: maxDistance }, harvestedSaplings)
            goal.quiet = true
            goals.normal.push(goal)
            return
        }
    }

    if (!followPlayer &&
        goals.isIdle(5000) &&
        !goals.has(true) &&
        tryAutoCookInterval.is()) {
        const rawFood = context.searchItem(...MC.rawFoods)
        if (rawFood) {
            if (context.mc.simpleSeeds.includes(rawFood.type) &&
                context.itemCount(rawFood.type) <= 1) {
                // Don't eat plantable foods
            } else {
                const recipe = context.getCookingRecipesFromRaw(rawFood.name)
                if (recipe.length > 0) {
                    if (SmeltGoal.findBestFurnace(context, recipe, true)) {
                        const goal = new SmeltGoal(null, recipe, true)
                        goal.quiet = true
                        goals.normal.push(goal)
                        return
                    }
                }
            }
        }
    }

    if (!followPlayer &&
        goals.isIdle(5000) &&
        !goals.has(true) &&
        tryAutoHarvestInterval.is()) {
        if (HarvestGoal.getCrops(context).length > 0) {
            const goal = new HarvestGoal(null, null, harvestedCrops)
            goal.quiet = true
            goal.then(() => {
                const goal = new CompostGoal(null)
                goal.quiet = true
                goals.normal.push(goal)
            })
            goals.normal.push(goal)
            return
        }
    }

    if (!followPlayer &&
        !goals.has(true) &&
        idlePosition) {
        const distanceFromIdlePosition = bot.entity.position.distanceTo(idlePosition)
        if (distanceFromIdlePosition > 5) {
            const goBackGoal = new GotoGoal(null, idlePosition.clone(), 4, context.restrictedMovements)
            goBackGoal.quiet = true
            goals.normal.push(goBackGoal)
            return
        }
    }

    if (goals.isIdle(1000) &&
        !goals.has(true)) {
        if (lookAtNearestPlayer()) {
            randomLookInterval.restart()
            return
        }
    }

    if (goals.isIdle(5000) &&
        !goals.has(true) &&
        randomLookInterval.is()) {
        lookRandomly()
        return
    }
})

bot.on('chat', (username, message) => {
    if (username === bot.username) return

    message = message.toLowerCase().trim().replace(/  /g, ' ')
    if (message.startsWith('.')) {
        message = message.substring(1)
    }

    if (message === 'leave') {
        bot.quit()

        return
    }

    if (message === 'come') {
        let distance = 5

        bot.chat('Okay')

        if (goals.normal.length === 0) {
            const target = bot.players[username]?.entity
            if (target) {
                const _distance = bot.entity.position.distanceTo(target.position)
                if (_distance < 6) {
                    distance = 2
                }
            }
        }

        const goal = new GotoPlayerGoal(null, username, distance, context.restrictedMovements)
        goals.normal.push(goal)
        try {
            goal.then(() => {
                idlePosition = bot.entity.position.clone()
                bot.chat(`I'm here`)
            })
        } catch (error) { }

        return
    }

    if (message === 'follow') {
        bot.chat('Okay')

        followPlayer = username
        return
    }

    if (message === 'stop' ||
        message === 'cancel') {
        if (goals.normal.length === 0) {
            if (followPlayer) {
                context.bot.chat(`I stopped following ${(username === followPlayer) ? 'you' : followPlayer}`)
                followPlayer = null
            } else {
                bot.chat(`I don't have any tasks`)
            }
            return
        }
        
        followPlayer = null
        goals.cancel(true, false, false, () => {
            context.bot.chat(`I stopped`)
        })

        return
    }

    if (message === 'fly') {
        bot.chat('Okay')

        const target = context.bot.players[username]?.entity

        if (!target) {
            bot.chat(`Can't find you`)
            return
        }

        const goal = new FlyToGoal(null, target.position.clone())
        goals.normal.push(goal)
        try {
            goal.then(() => {
                idlePosition = bot.entity.position.clone()
                bot.chat(`I'm here`)
            })
        } catch (error) { }

        return
    }

    if (message === 'wyd') {
        if (goals.critical.length > 0) {
            bot.chat(`RAAHH`)
            return
        }

        if (goals.survival.length > 0) {
            let current = goals.survival[0]
            let builder = `I'm taking care of myself: `
            while (current) {
                if (current.parent) {
                    builder += ' => '
                }
                builder += current.toReadable(context)
                current = current.goals[0]
            }

            bot.chat(builder)
            return
        }

        if (goals.normal.length > 0) {
            let current = goals.normal[0]
            let builder = ''
            while (current) {
                if (current.parent) {
                    builder += ' => '
                }
                builder += current.toReadable(context)
                current = current.goals[0]
            }

            bot.chat(builder)
            return
        }

        bot.chat(`Nothing`)
        return
    }

    if (message.startsWith('make ')) {
        const make = message.replace('make', '').trimStart()

        if (make === 'farm') {
            const goal = HoeingGoal.atPlayer(context, username)
            if ('error' in goal) {
                bot.chat(goal.error.toString())
                return
            }

            bot.chat(`Okay`)
            goal.result.then(() => {
                bot.chat(`Done`)
            })
            goals.normal.push(goal.result)

            return
        }

        bot.chat(`I down't know how to make it`)
        return
    }

    if (message === 'farm') {

        const goal = HoeingGoal.atPlayer(context, username)

        if ('error' in goal) {
            bot.chat(`Okay`)
            const goal = new PlantSeedGoal(null, context.mc.simpleSeeds, null)
            goal.then(() => {
                bot.chat(`Done`)
            })
            goals.normal.push(goal)
            return
        }

        bot.chat(`Okay`)
        goal.result.finally(() => {
            const goal = new PlantSeedGoal(null, context.mc.simpleSeeds, null)
            goal.then(() => {
                bot.chat(`Done`)
            })
            goals.normal.push(goal)
        })
        goals.normal.push(goal.result)

        return
    }

    if (message === 'harvest') {
        const target = bot.players[username]?.entity
        let farmPosition = bot.entity.position.clone()
        if (target) {
            const water = context.bot.findBlock({
                matching: [ context.mc.data.blocksByName['water'].id ],
                point: target.position.clone(),
                maxDistance: 4,
            })
            if (water) {
                farmPosition = water.position.clone()
            }
        } else {
            const water = context.bot.findBlock({
                matching: [ context.mc.data.blocksByName['water'].id ],
                maxDistance: 4,
            })
            if (water) {
                farmPosition = water.position.clone()
            }
        }

        bot.chat(`Okay`)
        const goal = new HarvestGoal(null, farmPosition, harvestedCrops)
        goal.then(() => {
            bot.chat(`Done`)
        })
        goals.normal.push(goal)

        return
    }

    if (message.startsWith('dump ')) {
        let itemName = message.replace('dump', '').trimStart()
        let count = 1

        if (itemName.split(' ')[0] === 'all') {
            count = Infinity
            itemName = itemName.substring(itemName.split(' ')[0].length).trimStart()
        } else if (!Number.isNaN(Number.parseInt(itemName.split(' ')[0]))) {
            count = Number.parseInt(itemName.split(' ')[0])
            itemName = itemName.substring(itemName.split(' ')[0].length).trimStart()
        }

        bot.chat('Okay')

        const item = context.mc.getCorrectItems(itemName)

        if (!item) {
            bot.chat(`I don't know what ${itemName} it is`)
            return
        }

        const goal = new DumpToChestGoal(null, item.id, count)
        goals.normal.push(goal)
        goal.then((result) => {
            bot.chat(`Done`)
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

        bot.chat('Okay')

        if (material === 'food') {
            const goal = new GatherFood(null, true)
            goals.normal.push(goal)
            goal.then(result => {
                if (result === 'have') {
                    bot.chat(`I already have food`)
                    return
                }
                bot.chat(`I have gathered a ${result.displayName}`)
            })
            return
        }

        const item = context.mc.getCorrectItems(material)

        if (item) {
            const goal = new GatherItemGoal(null, item.id, count, true, false, false)
            goals.normal.push(goal)
            goal.then((result) => {
                switch (result) {
                    case 'have':
                        bot.chat(`I already have ${item.displayName}`)
                        break
                    case 'crafted':
                        bot.chat(`I crafted ${item.displayName}`)
                        break
                    case 'digged':
                        bot.chat(`I digged ${item.displayName}`)
                        break
                    case 'looted':
                        bot.chat(`I looted ${item.displayName}`)
                        break
                    case 'smelted':
                        bot.chat(`I smelted ${item.displayName}`)
                        break
                    default:
                        bot.chat(`I gathered ${item.displayName}`)
                        break
                }
            })
            return
        }

        const goal = new GatherMaterialGoal(null, material)
        goals.normal.push(goal)

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
        const items = bot.inventory.items()

        /**
         * @type {Array<{ count: number; item: Item; }>}
         */
        const normal = [ ]
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

        bot.chat(builder)

        return
    }

    if (message === 'go home') {
        const myBed = SleepGoal.findMyBed(context)
        if (!myBed) {
            bot.chat(`I doesn't have a bed`)
            return
        }

        const goal = new GotoGoal(null, myBed.position.clone(), 4, context.restrictedMovements)
        goals.normal.push(goal)
        goal.then((result) => {
            switch (result) {
                case 'here':
                    bot.chat(`I'm already at my bed`)
                    break
                case 'done':
                    bot.chat(`I'm here`)
                    break
                default:
                    break
            }
        })

        return
    }

    if (message === 'sleep') {
        if (!SleepGoal.can(context)) {
            bot.chat(`I can't`)
            return
        }

        const goal = new SleepGoal(null)
        goals.normal.push(goal)

        return
    }

    if (message.startsWith('cost ')) {
        let itemName = message.replace('cost', '').trimStart()
        itemName = itemName.replace(/ /g, '_').toLowerCase()

        if (!context.mc.data.itemsByName[itemName]) {
            bot.chat(`I don't know what it is`)
            return
        }
        
        const cost = GatherItemGoal.itemCost(context, context.mc.data.itemsByName[itemName].id, 1, true, 0)
        timeout(cost, 5000)
            .then((result) => {
                bot.chat(result.toString())
            })
            .catch((reason) => {
                console.error(reason)
                if (reason === 'Time Limit Exceeded') {
                    bot.chat(`I don't know`)
                }
            })

        return
    }

    if (message === 'replant') {
        if (harvestedSaplings.length === 0) {
            bot.chat('No saplings saved')

            return
        }

        const goal = new PlantSaplingGoal(null, harvestedSaplings, true)
        goals.normal.push(goal)
        try {
            goal.then(result => {
                if (result === 0) {
                    bot.chat(`I couldn't replant any saplings`)
                } else {
                    bot.chat(`I have replanted ${result} saplings`)
                }
            })
        } catch (error) { }

        return
    }

    if (message === 'plant') {
        const goal = new PlantSaplingGoal(null, null, true)
        goals.normal.push(goal)
        try {
            goal.then(result => {
                if (result === 0) {
                    bot.chat(`I couldn't plant any saplings`)
                } else {
                    bot.chat(`I have planted ${result} saplings`)
                }
            })
        } catch (error) { }

        return
    }

    if (message.startsWith('give ')) {
        let giveItemName = message.replace('give', '').trimStart()

        if (giveItemName === 'all') {
            bot.chat('Okay')
            const goal = new GiveAllGoal(null, username)
            goals.normal.push(goal)
            try {
                goal.then(() => {
                    bot.chat(`There it is`)
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

        const giveItem = context.mc.data.itemsByName[giveItemName.replace(/ /g, '_')]
        if (!giveItem) {
            bot.chat(`I don't know what item ${giveItemName} is`)
            return
        }

        if (goals.normal.length === 0 &&
            !context.searchItem(giveItem.id)) {
            bot.chat(`I doesn't have ${giveItem.displayName}`)
            return
        }

        const goal = new GiveGoal(null, username, giveItem, count)
        goals.normal.push(goal)
        try {
            goal.then((gave) => {
                if (gave < count) {
                    bot.chat(`I only got ${gave} ${giveItem.displayName}`)
                } else {
                    bot.chat(`There is your ${giveItem.displayName}`)
                }
            })
        } catch (error) { }
        return
    }

    for (let i = 0; i < context.chatAwaits.length; i++) {
        const chatAwait = context.chatAwaits[i]
        if (chatAwait.callback(username, message)) {
            context.chatAwaits.splice(i, 1)
            return
        }
    }
})

bot.on('death', () => {
    goals.cancel(false, true, true)
    deathPosition = lastPosition
})

bot.on('kicked', (reason) => console.warn(`Kicked:`, reason))
bot.on('error', console.error)

bot.on('end', (reason) => {
    if (context) {
        World.save('bruh', getWorldData())
    }

    goals.cancel(true, true, true)

    console.log(`Ended:`, reason)
})
