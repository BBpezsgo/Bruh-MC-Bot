const { Vec3 } = require("vec3")
const path = require('path')
const fs = require('fs')
const { replacer, reviver } = require("./serializing")
const { wrap, sleepG } = require("./utils/tasks")
const { filterHostiles, directBlockNeighbors: directBlockNeighbors, isDirectNeighbor } = require("./utils/other")
const { Block } = require("prismarine-block")
const { Item } = require("prismarine-item")
const MC = require("./mc")
const goto = require("./tasks/goto")
const { Chest } = require("mineflayer")
const { goals } = require("mineflayer-pathfinder")
const Vec3Dimension = require("./vec3-dimension")

/**
 * @typedef {{
 *   position: Vec3Dimension;
 *   content: Record<string, number>;
 *   myItems: Record<string, number>;
 * }} SavedChest
 */

/**
 * @typedef {{
 *   uuid?: string;
 *   id: number;
 *   position: Vec3Dimension;
 *   trades: ReadonlyArray<{
 *     inputItem1: { name: string; count: number; }
 *     outputItem: { name: string; count: number; }
 *     inputItem2: { name: string; count: number; } | null
 *   }>
 * }} SavedVillager
 */

/**
 * @typedef {{
 *   position: Vec3Dimension;
 *   block: string;
 * }} SavedCrop
 */

/**
 * @typedef {{
 *   bot: string;
 *   allocatedAt: number;
 * } & ({
 *   type: 'dig';
 * } | {
 *   type: 'place';
 *   item: number;
 * } | {
 *   type: 'hoe';
 * })} AllocatedBlock
 */

/**
 * @typedef {`${number}-${number}-${number}-${import('mineflayer').Dimension}`} PositionHash
 */

class ItemRequest {
    /**
     * @readonly
     * @type {import('./bruh-bot').ItemLock}
     */
    lock

    /**
     * @private @readonly
     * @type {number}
     */
    nevermindAt

    /**
     * @private
     * @type {'none' | 'on-the-way' | 'done'}
     */
    status

    /**
     * @readonly
     * @type {(result: boolean) => void}
     */
    callback

    /**
     * @param {import('./bruh-bot').ItemLock} lock
     * @param {number} timeout
     * @param {(result: boolean) => void} [callback]
     */
    constructor(lock, timeout, callback) {
        this.lock = lock
        this.nevermindAt = performance.now() + timeout
        this.status = 'none'
        this.callback = callback
    }

    getStatus() {
        if (this.status !== 'none') { return this.status }
        if (performance.now() >= this.nevermindAt) { return 'timed-out' }
        return 'none'
    }

    onTheWay() {
        this.status = 'on-the-way'
    }
}

module.exports = class Environment {
    /**
     * @private @readonly
     * @type {Array<import('./bruh-bot')>}
     */
    bots

    /**
     * @private @readonly
     * @type {string}
     */
    filePath

    /**
     * @private @readonly
     * @type {Record<string, { time: number; position: Vec3Dimension; }>}
     */
    playerPositions

    /**
     * @private @readonly
     * @type {Array<SavedChest>}
     */
    chests

    /**
     * @readonly
     * @type {Record<string, SavedVillager>}
     */
    villagers

    /**
     * @readonly
     * @type {Record<number, number>}
     */
    entitySpawnTimes

    /**
     * @readonly
     * @type {Array<SavedCrop>}
     */
    crops

    /**
     * @readonly
     * @type {Record<number, number>}
     */
    entityHurtTimes

    /**
     * @readonly
     * @type {Record<PositionHash, AllocatedBlock>}
     */
    allocatedBlocks

    /**
     * @private
     * @type {NodeJS.Timeout}
     */
    interval

    /**
     * @readonly
     * @type {Array<ItemRequest>}
     */
    itemRequests

    /**
     * @param {string} filePath
     */
    constructor(filePath) {
        this.bots = []
        this.filePath = filePath

        this.crops = []
        this.chests = []
        this.playerPositions = {}
        this.entityHurtTimes = {}
        this.entitySpawnTimes = {}
        this.allocatedBlocks = {}
        this.itemRequests = []
        this.villagers = {}

        if (!fs.existsSync(this.filePath)) {
            console.log(`[Environment] File not found at "${this.filePath}"`)
            return
        }
        const data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'), reviver)
        this.playerPositions = data.playerPositions ?? this.playerPositions
        this.crops = data.crops ?? this.crops
        this.chests = data.chests ?? this.chests
        this.villagers = data.villagers ?? this.villagers
        console.log(`[Environment] Loaded`)
    }

    /**
     * @private
     * @param {import('mineflayer').Player} player
     * @param {import("mineflayer").Dimension} dimension
     */
    __playerUpdated(player, dimension) {
        if (!player.entity?.position) { return }
        this.setPlayerPosition(player.username, new Vec3Dimension(player.entity.position, dimension))
    }

    /**
     * @private
     * @param {Block | null} oldBlock
     * @param {Block} newBlock
     * @param {import("mineflayer").Dimension} dimension
     */
    __blockUpdate(oldBlock, newBlock, dimension) {
        const isPlace = (!oldBlock || oldBlock.name === 'air')
        const isBreak = (!newBlock || newBlock.name === 'air')
        if (isPlace && isBreak) { return }

        /**
         * @type {PositionHash}
         */
        const hash = `${newBlock.position.x}-${newBlock.position.y}-${newBlock.position.z}-${dimension}`
        delete this.allocatedBlocks[hash]

        if (isPlace && newBlock) {
            if (newBlock.name in MC.cropsByBlockName) {
                let isSaved = false
                for (const crop of this.crops) {
                    if (crop.position.equals(newBlock.position)) {
                        crop.block = newBlock.name
                        isSaved = true
                        break
                    }
                }
                if (!isSaved) {
                    this.crops.push({
                        position: new Vec3Dimension(newBlock.position, dimension),
                        block: newBlock.name,
                    })
                }
            }
        }

        if (isBreak) {
            if (oldBlock && oldBlock.name in MC.cropsByBlockName) {
                let isSaved = false
                for (const crop of this.crops) {
                    if (crop.position.equals(oldBlock.position)) {
                        crop.block = oldBlock.name
                        isSaved = true
                        break
                    }
                }
                if (!isSaved) {
                    this.crops.push({
                        position: new Vec3Dimension(oldBlock.position, dimension),
                        block: oldBlock.name,
                    })
                }
            }
        }
    }

    /**
     * @private
     * @param {import("prismarine-entity").Entity} entity
     */
    __entityDead(entity) {
        delete this.entitySpawnTimes[entity.id]
        delete this.entityHurtTimes[entity.id]
    }

    /**
     * @private
     * @param {import("prismarine-entity").Entity} entity
     */
    __entitySpawn(entity) {
        this.entitySpawnTimes[entity.id] = performance.now()
    }

    /**
     * @private
     * @param {import("prismarine-entity").Entity} entity
     */
    __entityHurt(entity) {
        this.entityHurtTimes[entity.id] = performance.now()
    }

    /**
     * @param {import('./bruh-bot')} bot
     */
    addBot(bot) {
        if (!this.interval) {
            this.interval = setInterval(() => {
                this.save()
                for (let i = this.itemRequests.length - 1; i >= 0; i--) {
                    if (this.itemRequests[i].getStatus() === 'done' ||
                        this.itemRequests[i].getStatus() === 'timed-out') {
                        this.itemRequests[i].lock.isUnlocked = true
                        this.itemRequests.splice(i, 1)
                    }
                }
                if (this.bots.length === 0) {
                    clearInterval(this.interval)
                    this.interval = null
                }
            }, 10000)
        }

        bot.bot.on('playerUpdated', (player) => this.__playerUpdated(player, bot.dimension))
        bot.bot.on('blockUpdate', (oldBlock, newBlock) => this.__blockUpdate(oldBlock, newBlock, bot.dimension))
        bot.bot.on('entityDead', (entity) => this.__entityDead(entity))
        bot.bot.on('entitySpawn', (entity) => this.__entitySpawn(entity))
        bot.bot.on('entityHurt', (entity) => this.__entityHurt(entity))
        this.bots.push(bot)
    }

    /**
     * @param {import('./bruh-bot')} bot
     */
    removeBot(bot) {
        const i = this.bots.indexOf(bot)
        if (i >= 0) {
            this.bots.splice(i, 1)
        } else {
            console.warn(`[Environment] Failed to remove ${bot.bot.username}`)
        }

        if (this.bots.length === 0) {
            if (this.interval) {
                clearInterval(this.interval)
                this.interval = null
            }
            this.save()
        }
    }

    /**
     * @param {import('./bruh-bot')} bot
     * @returns {import('./task').Task<void>}
     */
    *scanChests(bot) {
        console.log(`[Bot "${bot.bot.username}"] Scanning chests ...`)
        const chestPositions = bot.bot.findBlocks({
            point: bot.bot.entity.position.clone(),
            maxDistance: 30,
            matching: (block) => {
                if (bot.mc.data.blocksByName['chest'].id === block.type) {
                    return true
                }
                return false
            },
            useExtraInfo: (block) => {
                const properties = block.getProperties()
                if (!properties['type']) {
                    return true
                }
                if (properties['type'] === 'left') {
                    return false
                }
                return true
            },
            count: 69,
        })
        console.log(`[Bot "${bot.bot.username}"] Found ${chestPositions.length} chests`)
        for (const chestPosition of chestPositions) {
            try {
                yield* goto.task(bot, {
                    block: chestPosition,
                })
                const chestBlock = bot.bot.blockAt(chestPosition)
                if (!chestBlock) {
                    console.warn(`[Bot "${bot.bot.username}"] Chest disappeared while scanning`)
                    continue
                }
                if (chestBlock.name !== 'chest') {
                    console.warn(`[Bot "${bot.bot.username}"] Chest replaced while scanning`)
                    continue
                }

                let chest
                try {
                    chest = yield* bot.openChest(chestBlock)
                } catch (error) {
                    console.error(error)
                    continue
                }

                /**
                 * @type {SavedChest | null}
                 */
                let found = null
                for (const _chest of this.chests) {
                    if (_chest.position.equals(new Vec3Dimension(chestBlock.position, bot.dimension))) {
                        found = _chest
                    }
                }
                if (!found) {
                    found = {
                        position: new Vec3Dimension(chestBlock.position, bot.dimension),
                        content: {},
                        myItems: {},
                    }
                    this.chests.push(found)
                } else {
                    found.content = {}
                }

                for (const item of chest.containerItems()) {
                    found.content[item.name] ??= 0
                    found.content[item.name] += item.count
                }

                yield* sleepG(100)
                chest.close()
            } catch (error) {
                console.warn(`[Bot "${bot.bot.username}"] Error while scanning chests`, error)
            }
        }
        console.log(`[Bot "${bot.bot.username}"] Chests scanned`)
    }

    /**
     * @param {import('./bruh-bot')} bot
     * @returns {import('./task').Task<void>}
     */
    *scanVillagers(bot) {
        console.log(`[Bot "${bot.bot.username}"] Scanning villagers ...`)
        const villagers = Object.values(bot.bot.entities).filter(v => v.name === 'villager')
        console.log(`[Bot "${bot.bot.username}"] Found ${villagers.length} villagers`)
        for (const villager of villagers) {
            try {
                if (!villager.isValid) { continue }
                yield* goto.task(bot, {
                    point: villager.position,
                    distance: 2,
                })
                if (!villager.isValid) { continue }

                const _villager = yield* wrap(bot.bot.openVillager(villager))
                while (!_villager.trades) { yield }
                yield
                this.addVillager(villager, _villager, bot.dimension)
                _villager.close()

                yield* sleepG(100)
            } catch (error) {
                console.warn(`[Bot "${bot.bot.username}"] Error while scanning villagers`, error)
            }
        }
        console.log(`[Bot "${bot.bot.username}"] Villagers scanned`)
    }

    /**
     * @param {import('./bruh-bot')} bot
     * @param {Chest} chest
     * @param {Vec3Dimension} chestPosition
     * @param {string} item
     * @param {number} count
     */
    *chestDeposit(bot, chest, chestPosition, item, count) {
        /**
         * @type {SavedChest | null}
         */
        let saved = null

        for (const _chest of this.chests) {
            if (_chest.position.equals(chestPosition) &&
                _chest.position.dimension === chestPosition.dimension) {
                saved = _chest
                break
            }
        }

        if (!saved) {
            saved = {
                position: chestPosition,
                content: {},
                myItems: {},
            }
            this.chests.push(saved)
        }

        let actualCount

        if (count > 0) {
            actualCount = Math.min(count, bot.itemCount(item))
            yield* wrap(chest.deposit(bot.mc.data.itemsByName[item].id, null, actualCount))
        } else {
            actualCount = Math.min(-count, chest.containerCount(bot.mc.data.itemsByName[item].id, null))
            yield* wrap(chest.withdraw(bot.mc.data.itemsByName[item].id, null, actualCount))
        }

        saved.content = {}

        for (const item of chest.containerItems()) {
            saved.content[item.name] ??= 0
            saved.content[item.name] += item.count
        }

        saved.myItems[item] ??= 0
        if (count > 0) {
            saved.myItems[item] += actualCount
        } else {
            saved.myItems[item] -= actualCount
        }

        return actualCount
    }

    /**
     * @param {import('./bruh-bot')} bot
     * @param {Item | number | string} item
     * @returns {Array<{ position: Vec3Dimension; count: number; myCount: number; }>}
     */
    searchForItem(bot, item) {
        if (typeof item === 'number') {
            item = bot.mc.data.items[item].name
        } else if (typeof item === 'string') { } else {
            item = item.name
        }
        /**
         * @type {Array<{ position: Vec3Dimension; count: number; myCount: number; }>}
         */
        const result = []
        for (const chest of this.chests) {
            for (const itemName in chest.content) {
                const count = chest.content[itemName]
                const myCount = chest.myItems[itemName]
                if (itemName === item) {
                    result.push({
                        position: chest.position.clone(),
                        count: count,
                        myCount: myCount ?? 0,
                    })
                }
            }
        }
        return result
    }

    /**
     * @param {import("prismarine-entity").Entity} entity
     * @param {import("mineflayer").Villager} villager
     * @param {import("mineflayer").Dimension} dimension
     */
    addVillager(entity, villager, dimension) {
        if (entity.uuid) {
            this.villagers[entity.uuid] = {
                position: new Vec3Dimension(entity.position, dimension),
                uuid: entity.uuid,
                id: entity.id,
                trades: villager.trades.map(v => ({
                    inputItem1: { name: v.inputItem1.name, count: v.inputItem1.count },
                    inputItem2: v.hasItem2 ? { name: v.inputItem2.name, count: v.inputItem2.count } : null,
                    outputItem: { name: v.outputItem.name, count: v.outputItem.count },
                })),
            }
            delete this.villagers[entity.id]
        } else {
            this.villagers[entity.id] = {
                position: new Vec3Dimension(entity.position, dimension),
                uuid: entity.uuid,
                id: entity.id,
                trades: villager.trades.map(v => ({
                    inputItem1: { name: v.inputItem1.name, count: v.inputItem1.count },
                    inputItem2: v.hasItem2 ? { name: v.inputItem2.name, count: v.inputItem2.count } : null,
                    outputItem: { name: v.outputItem.name, count: v.outputItem.count },
                })),
            }
        }
    }

    save() {
        if (!fs.existsSync(path.dirname(this.filePath))) {
            fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
        }
        fs.writeFileSync(this.filePath, JSON.stringify({
            playerPositions: this.playerPositions,
            crops: this.crops,
            chests: this.chests,
            villagers: this.villagers,
        }, replacer, ' '))
    }

    /**
     * @param {import('./bruh-bot')} bot
     * @param {Vec3} plantPosition
     * @param {import("./mc").AnyCrop} plant
     * @param {boolean} exactPosition
     * @param {boolean} exactBlock
     * @returns {{ block: Block; faceVector: Vec3; isExactPosition: boolean; isExactBlock: boolean; } | null}
     */
    getPlantableBlock(bot, plantPosition, plant, exactPosition, exactBlock) {
        if (plant.growsOnBlock === 'solid') {
            // TODO: this
            return null
        }
        const growsOnBlock = plant.growsOnBlock.map(v => bot.mc.data.blocksByName[v].id)
        if (!exactBlock && plant.growsOnBlock.includes('farmland')) {
            const hoeableBlocks = [
                bot.mc.data.blocksByName['dirt'].id,
                bot.mc.data.blocksByName['grass_block'].id,
                bot.mc.data.blocksByName['dirt_path'].id,
            ]
            for (const hoeableBlock of hoeableBlocks) {
                if (!growsOnBlock.includes(hoeableBlock)) {
                    growsOnBlock.push(hoeableBlock)
                }
            }
        }
        const bestBlock = bot.bot.findBlock({
            matching: growsOnBlock,
            point: plantPosition,
            maxDistance: exactPosition ? 1 : 10,
            useExtraInfo: (/** @type {Block} */ block) => {
                if (plant.type === 'spread' && (
                    plant.seed === 'brown_mushroom' ||
                    plant.seed === 'red_mushroom')) {
                    let n = 0
                    for (let x = -4; x <= 4; x++) {
                        for (let y = -1; y <= 1; y++) {
                            for (let z = -4; z <= 4; z++) {
                                const other = bot.bot.blockAt(block.position.offset(x, y, z))
                                if (!other || other.name !== plant.seed) { continue }
                                n++
                            }
                        }
                    }
                    if (n >= 5 - 1) {
                        return false
                    }
                }
                const neighbors = directBlockNeighbors(block.position, plant.growsOnSide)
                for (const neighbor of neighbors) {
                    const neighborBlock = bot.bot.blockAt(neighbor)
                    if (MC.replaceableBlocks[neighborBlock.name] !== 'yes') { continue }
                    return true
                }
                return false
            },
        })
        if (!bestBlock) {
            return null
        }
        if (!growsOnBlock.includes(bestBlock.type)) {
            return null
        }
        const neighbors = directBlockNeighbors(bestBlock.position, plant.growsOnSide)
        for (const neighbor of neighbors) {
            const neighborBlock = bot.bot.blockAt(neighbor)
            if (MC.replaceableBlocks[neighborBlock.name] !== 'yes') { continue }
            return {
                block: bestBlock,
                faceVector: neighbor.offset(-bestBlock.position.x, -bestBlock.position.y, -bestBlock.position.z),
                isExactPosition: exactPosition,
                isExactBlock: plant.growsOnBlock.includes(bestBlock.name),
            }
        }
        return null
    }

    /**
     * @param {import('./bruh-bot')} bot
     * @param {Vec3} farmPosition
     * @param {boolean} grown
     * @param {number} [count]
     * @param {number} [maxDistance]
     * @returns {Array<Vec3>}
     */
    getCrops(bot, farmPosition, grown, count = 1, maxDistance = undefined) {
        const cropBlockIds = []
        for (const cropName in MC.cropsByBlockName) {
            const crop = MC.cropsByBlockName[cropName]
            switch (crop.type) {
                case 'tree':
                    cropBlockIds.push(bot.mc.data.blocksByName[crop.log].id)
                    cropBlockIds.push(bot.mc.data.blocksByName[cropName].id)
                    break
                case 'grows_block':
                    cropBlockIds.push(bot.mc.data.blocksByName[cropName].id)
                    if (crop.attachedCropName) {
                        cropBlockIds.push(bot.mc.data.blocksByName[crop.attachedCropName].id)
                    }
                    break
                default:
                    cropBlockIds.push(bot.mc.data.blocksByName[cropName].id)
                    break
            }
        }

        /**
         * @type {Array<Vec3>}
         */
        const bruh = []

        return bot.bot.findBlocks({
            matching: cropBlockIds,
            useExtraInfo: (/** @type {Block} */ block) => {
                /** @type {boolean} */
                let isGrown = false
                const cropInfo = MC.resolveCrop(block.name)
                if (!cropInfo) {
                    console.warn(`[Bot "${bot}"] This "${block.name}" aint a crop`)
                    return false
                }

                switch (cropInfo.type) {
                    case 'seeded':
                    case 'simple': {
                        const age = block.getProperties()?.['age']
                        if (typeof age !== 'number') { return false }
                        isGrown = age >= cropInfo.grownAge
                        break
                    }
                    case 'grows_block': {
                        let fruitBlock = null
                        for (const neighbor of directBlockNeighbors(block.position, 'side')) {
                            const neighborBlock = bot.bot.blockAt(neighbor)
                            if (neighborBlock && neighborBlock.name === cropInfo.grownBlock) {
                                fruitBlock = neighborBlock
                                break
                            }
                        }
                        isGrown = !!fruitBlock
                        break
                    }
                    case 'grows_fruit': {
                        switch (block.name) {
                            case 'cave_vines':
                            case 'cave_vines_plant':
                                const berries = block.getProperties()?.['berries']
                                if (typeof berries !== 'boolean') { return false }
                                isGrown = berries
                                break
                            case 'sweet_berry_bush':
                                const age = block.getProperties()?.['age']
                                if (typeof age !== 'number') { return false }
                                isGrown = age >= 3
                                break
                            default:
                                console.warn(`Unimplemented fruit crop "${block.name}"`)
                                return false
                        }
                        break
                    }
                    case 'tree': {
                        if (!this.crops.find(v => v.position.equals(block.position))) {
                            return false
                        }
                        if (block.name === cropInfo.log) {
                            isGrown = true
                        } else {
                            isGrown = false
                        }
                        break
                    }
                    case 'spread': {
                        isGrown = true
                        break
                    }
                    default: {
                        return false
                    }
                }

                if (cropInfo.cropName === 'brown_mushroom' ||
                    cropInfo.cropName === 'red_mushroom') {
                    let nearby = 0
                    let neighbors = 0
                    if (false) {
                        for (let x = -4; x <= 4; x++) {
                            for (let y = -1; y <= 1; y++) {
                                for (let z = -4; z <= 4; z++) {
                                    const other = bot.bot.blockAt(block.position.offset(x, y, z))
                                    if (!other || other.name !== cropInfo.cropName) { continue }
                                    if (bruh.find(v => v.equals(other.position))) { continue }
                                    nearby++
                                    if (isDirectNeighbor(block.position, other.position)) {
                                        neighbors++
                                    }
                                }
                            }
                        }
                    } else {
                        for (let x = -1; x <= 1; x++) {
                            for (let y = -1; y <= 1; y++) {
                                for (let z = -1; z <= 1; z++) {
                                    const other = bot.bot.blockAt(block.position.offset(x, y, z))
                                    if (!other || other.name !== cropInfo.cropName) { continue }
                                    if (bruh.find(v => v.equals(other.position))) { continue }
                                    if (isDirectNeighbor(block.position, other.position)) {
                                        neighbors++
                                    }
                                }
                            }
                        }
                    }

                    isGrown = !!neighbors || nearby >= 5
                    bruh.push(block.position.clone())
                }

                if (isGrown) {
                    bot.debug.drawPoint(block.position.offset(0, 0.5, 0), [0, 1, 0])
                } else {
                    bot.debug.drawPoint(block.position.offset(0, 0.5, 0), [1, 0, 0])
                }

                return grown === isGrown
            },
            point: farmPosition,
            count: count,
            maxDistance: maxDistance,
        })
    }

    /**
     * @param {import('./bruh-bot')} bot
     * @param {((item: Item) => boolean) | null} filter
     * @param {{
     *   inAir?: boolean;
     *   maxDistance?: number;
     *   point?: Vec3;
     *   evenIfFull?: boolean;
     *   minLifetime?: number;
     * }} args
     * @returns {import('./result').Result<import("prismarine-entity").Entity>}
     */
    getClosestItem(bot, filter, args = {}) {
        if (!args) { args = {} }
        if (!args.inAir) { args.inAir = false }
        if (!args.maxDistance) { args.maxDistance = 10 }
        if (!args.point) { args.point = bot.bot.entity.position.clone() }
        if (!args.evenIfFull) { args.evenIfFull = false }

        const nearestEntity = bot.bot.nearestEntity((/** @type {import("prismarine-entity").Entity} */ entity) => {
            if (entity.name !== 'item') { return false }
            if (!args.inAir && entity.velocity.distanceTo(new Vec3(0, 0, 0)) > 0.01) { return false }
            const droppedItem = entity.getDroppedItem()
            if (!droppedItem) { return false }
            if (filter && !filter(droppedItem)) { return false }
            if (!args.evenIfFull && bot.isInventoryFull(droppedItem.type)) { return false }
            if (args.minLifetime && this.entitySpawnTimes[entity.id]) {
                const entityLifetime = performance.now() - this.entitySpawnTimes[entity.id]
                if (entityLifetime < args.minLifetime) {
                    return false
                }
            }
            return true
        })
        if (!nearestEntity) { return { error: `No items found` } }

        const distance = nearestEntity.position.distanceTo(args.point)
        if (distance > args.maxDistance) { return { error: `No items nearby` } }

        return { result: nearestEntity }
    }

    /**
     * @param {import('./bruh-bot')} bot
     * @param {{
     *   maxDistance?: number;
     *   point?: Vec3;
     * }} args
     * @returns {import('./result').Result<import('prismarine-entity').Entity>}
     */
    getClosestArrow(bot, args = {}) {
        const nearestEntity = bot.bot.nearestEntity((/** @type {import('prismarine-entity').Entity} */ entity) => (
            entity.displayName === 'Arrow' &&
            (entity.velocity.distanceTo(new Vec3(0, 0, 0)) < 1)
        ))
        if (!nearestEntity) { return { error: `No arrows found` } }

        const distance = nearestEntity.position.distanceTo(args.point ?? bot.bot.entity.position)
        if (distance > (args.maxDistance || 10)) { return { error: `No arrows nearby` } }

        return { result: nearestEntity }
    }

    /**
     * @param {import('./bruh-bot')} bot
     * @param {{
     *   maxDistance?: number;
     *   point?: Vec3;
     * }} args
     * @returns {import('./result').Result<import('prismarine-entity').Entity>}
     */
    getClosestXp(bot, args = {}) {
        const nearestEntity = bot.bot.nearestEntity((/** @type {import('prismarine-entity').Entity} */ entity) => (
            entity.name === 'experience_orb')
        )
        if (!nearestEntity) { return { error: `No xps found` } }

        const distance = nearestEntity.position.distanceTo(args.point ?? bot.bot.entity.position)
        if (distance > (args.maxDistance || 10)) { return { error: `No xps nearby` } }

        return { result: nearestEntity }
    }

    /**
     * Source: https://github.com/PrismarineJS/mineflayer-pvp/blob/master/src/PVP.ts
     * @param {import('./bruh-bot')} bot
     * @returns {import('prismarine-entity').Entity | null}
     */
    getExplodingCreeper(bot) {
        return bot.bot.nearestEntity((/** @type {import('prismarine-entity').Entity} */ entity) => {
            return (
                entity.name === 'creeper' &&
                // @ts-ignore
                entity.metadata[16] === 1
            )
        })
    }

    /**
     * @param {import('./bruh-bot')} bot
     * @returns {import('prismarine-entity').Entity | null}
     */
    possibleDirectHostileAttack(bot) {
        return bot.bot.nearestEntity((/** @type {import('prismarine-entity').Entity} */ entity) => {
            if (!filterHostiles(entity, bot.bot.entity.position)) { return false }

            if (!entity.name) {
                return false
            }

            const distance = bot.bot.entity.position.distanceTo(entity.position)

            if (entity.name === 'skeleton' ||
                entity.name === 'stray') {
                return distance <= 20
            }

            return distance < 10
        })
    }

    /**
     * @param {string} username
     * @param {number} [maxAge]
     * @returns {Vec3Dimension | null}
     */
    getPlayerPosition(username, maxAge) {
        for (const bot of this.bots) {
            const player = bot.bot.players[username]
            if (player && player.entity && player.entity.position) {
                return new Vec3Dimension(player.entity.position, bot.dimension)
            }
        }
        const saved = this.playerPositions[username]
        if (saved) {
            if (maxAge) {
                const age = Date.now() - saved.time
                if (maxAge < age) {
                    return null
                }
            }
            return saved.position
        }
        return null
    }

    /**
     * @param {string} username
     * @param {Vec3Dimension} position
     */
    setPlayerPosition(username, position) {
        if (!position) {
            return
        }

        if (!this.playerPositions[username]) {
            this.playerPositions[username] = {
                time: Date.now(),
                position: position,
            }
        } else {
            const pos = this.playerPositions[username]
            pos.time = Date.now()
            pos.position.x = position.x
            pos.position.y = position.y
            pos.position.z = position.z
            pos.position.dimension = position.dimension
        }
    }

    /**
     * @overload
     * @param {string} bot
     * @param {Vec3Dimension} position
     * @param {'dig'} type
     * @param {any} [args]
     * @returns {boolean}
     */
    /**
     * @overload
     * @param {string} bot
     * @param {Vec3Dimension} position
     * @param {'place'} type
     * @param {{ item: number; }} args
     * @returns {boolean}
     */
    /**
     * @overload
     * @param {string} bot
     * @param {Vec3Dimension} position
     * @param {'hoe'} type
     * @param {any} [args]
     * @returns {boolean}
     */
    /**
     * @param {string} bot
     * @param {Vec3Dimension} position
     * @param {'dig' | 'place' | 'hoe'} type
     * @param {any} [args]
     * @returns {boolean}
     */
    allocateBlock(bot, position, type, args) {
        /**
         * @type {PositionHash}
         */
        const hash = `${position.x}-${position.y}-${position.z}-${position.dimension}`
        if (this.allocatedBlocks[hash] &&
            this.allocatedBlocks[hash].bot !== bot) {
            return false
        }
        this.allocatedBlocks[hash] = {
            bot: bot,
            allocatedAt: performance.now(),
            type: type,
            ...args,
        }
        return true
    }

    /**
     * @param {Vec3Dimension} blockPosition
     * @returns {AllocatedBlock | null}
     */
    getAllocatedBlock(blockPosition) {
        /**
         * @type {PositionHash}
         */
        const hash = `${blockPosition.x}-${blockPosition.y}-${blockPosition.z}-${blockPosition.dimension}`
        return this.allocatedBlocks[hash] ?? null
    }

    /**
     * @param {Vec3Dimension} blockPosition
     * @param {AllocatedBlock['type']} waitFor
     * @returns {import("./task").Task<boolean>}
     */
    *waitUntilBlockIs(blockPosition, waitFor) {
        /**
         * @type {PositionHash}
         */
        const hash = `${blockPosition.x}-${blockPosition.y}-${blockPosition.z}-${blockPosition.dimension}`
        if (!this.allocatedBlocks[hash]) {
            return false
        }
        if (this.allocatedBlocks[hash].type !== waitFor) {
            return false
        }
        while (this.allocatedBlocks[hash]) {
            yield* sleepG(100)
        }
        let blockAt = null
        for (const bot of this.bots) {
            if (bot.dimension !== blockPosition.dimension) { continue }
            blockAt = bot.bot.blockAt(blockPosition.xyz(bot.dimension))
            if (blockAt) { break }
        }
        if (!blockAt) {
            return true
        }
        switch (waitFor) {
            case 'dig':
                if (blockAt.name === 'air') {
                    return true
                } else {
                    return false
                }
            case 'hoe':
                if (blockAt.name === 'farmland') {
                    return true
                } else {
                    return false
                }
            case 'place':
                return true
            default:
                return true
        }
    }

    /**
     * @param {string} bot
     * @param {Vec3} point
     * @returns {boolean}
     */
    isDestinationOccupied(bot, point) {
        for (const other of this.bots) {
            if (other.bot.username === bot) { continue }
            const goal = other.bot.pathfinder.goal
            if (!goal) { continue }
            if (!goal.isValid()) { continue }
            if (goal instanceof goals.GoalNear) {
                if (point.distanceTo(new Vec3(goal.x, goal.y, goal.z)) < 1) {
                    return true
                }
            }
        }
        return false
    }

    /**
     * @param {import('./bruh-bot').ItemLock} lock
     * @param {number} timeout
     * @returns {import("./task").Task<boolean>}
     */
    *requestItem(lock, timeout) {
        let isDone = false
        let result = false
        const request = new ItemRequest(
            lock,
            timeout,
            (_result) => {
                result = _result
                isDone = true
            }
        )
        this.itemRequests.push(request)

        while (!isDone) {
            yield
        }

        return result
    }

    /**
     * @param {string} requestor
     * @param {string} item
     * @param {number} count
     */
    lockOthersItems(requestor, item, count) {
        let locked = 0
        const locks = []
        for (const bot of this.bots) {
            if (bot.bot.username === requestor) { continue }
            const lock = bot.tryLockItems(requestor, item, count - locked)
            if (!lock) { continue }
            locked += lock.count
            locks.push(lock)
        }
        return locks
    }
}
