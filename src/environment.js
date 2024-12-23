'use strict'

const { Vec3 } = require('vec3')
const path = require('path')
const fs = require('fs')
const { replacer, reviver } = require('./serializing')
const { wrap, sleepG } = require('./utils/tasks')
const { directBlockNeighbors: directBlockNeighbors, isDirectNeighbor } = require('./utils/other')
const { Block } = require('prismarine-block')
const { Item } = require('prismarine-item')
const Minecraft = require('./minecraft')
const Tasks = require('./tasks')
const { Chest } = require('mineflayer')
const { goals } = require('mineflayer-pathfinder')
const Vec3Dimension = require('./vec3-dimension')
const { EntityPose } = require('./entity-metadata')
const Iterable = require('./iterable')
const config = require('./config')

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
 *   type: 'activate';
 * } | {
 *   type: 'hoe';
 * })} AllocatedBlock
 */

/**
 * @typedef {`${number}-${number}-${number}-${import('mineflayer').Dimension}`} PositionHash
 */

/**
 * @typedef {{
 *   positions: Array<Vec3>;
 *   mobs: Record<number, import('prismarine-entity').Entity>;
 * }} Fencing
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
     * @readonly
     * @type {Array<import('./bruh-bot')>}
     */
    bots

    /**
     * @readonly
     * @type {Partial<import('mineflayer').Shared>}
     */
    shared

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
     * @readonly
     * @type {Array<Vec3Dimension>}
     */
    minePositions

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
     * @type {Record<number, number>}
     */
    animalBreedTimes

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
     * @readonly
     * @type {Record<number, import('prismarine-entity').Entity>}
     */
    entityOwners

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
        this.animalBreedTimes = {}
        this.allocatedBlocks = {}
        this.itemRequests = []
        this.villagers = {}
        this.entityOwners = {}
        this.shared = {}
        this.minePositions = []

        if (!fs.existsSync(this.filePath)) {
            console.log(`[Environment] File not found at "${this.filePath}"`)
            return
        }
        const data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'), reviver)
        this.playerPositions = data.playerPositions ?? this.playerPositions
        this.crops = data.crops ?? this.crops
        this.chests = data.chests ?? this.chests
        this.villagers = data.villagers ?? this.villagers
        this.animalBreedTimes = data.animalBreedTimes ?? this.animalBreedTimes
        this.minePositions = data.minePositions ?? this.minePositions
        console.log(`[Environment] Loaded`)
    }

    /**
     * @private
     * @param {import('./bruh-bot')} bot
     * @param {import('mineflayer').Player} player
     * @param {import('mineflayer').Dimension} dimension
     */
    __playerUpdated(bot, player, dimension) {
        if (!player.entity?.position) { return }
        this.setPlayerPosition(player.username, new Vec3Dimension(player.entity.position, dimension))
    }

    /**
     * @private
     * @param {import('./bruh-bot')} bot
     * @param {Block | null} oldBlock
     * @param {Block} newBlock
     * @param {import('mineflayer').Dimension} dimension
     */
    __blockUpdate(bot, oldBlock, newBlock, dimension) {
        const isPlace = (!oldBlock || oldBlock.name === 'air')
        const isBreak = (!newBlock || newBlock.name === 'air')
        if (isPlace && isBreak) { return }

        /**
         * @type {PositionHash}
         */
        const hash = `${newBlock.position.x}-${newBlock.position.y}-${newBlock.position.z}-${dimension}`
        delete this.allocatedBlocks[hash]

        if (isPlace && newBlock) {
            if (newBlock.name in Minecraft.cropsByBlockName) {
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
            if (oldBlock && oldBlock.name in Minecraft.cropsByBlockName) {
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
     * @param {import('./bruh-bot')} bot
     * @param {import('prismarine-entity').Entity} entity
     */
    __entityDead(bot, entity) {
        delete this.entitySpawnTimes[entity.id]
        delete this.animalBreedTimes[entity.id]
        delete this.entityHurtTimes[entity.id]
        delete this.entityOwners[entity.id]
        for (const id in this.entityOwners) {
            const v = this.entityOwners[id]
            if (!v.isValid || v.id === entity.id) {
                delete this.entityOwners[id]
            }
        }
    }

    /**
     * @private
     * @param {import('./bruh-bot')} bot
     * @param {import('prismarine-entity').Entity} entity
     */
    __entityGone(bot, entity) {
        delete this.entityOwners[entity.id]
        for (const id in this.entityOwners) {
            const v = this.entityOwners[id]
            if (!v.isValid || v.id === entity.id) {
                delete this.entityOwners[id]
            }
        }
    }

    /**
     * @private
     * @param {import('./bruh-bot')} bot
     * @param {import('prismarine-entity').Entity} entity
     */
    __entitySpawn(bot, entity) {
        this.entitySpawnTimes[entity.id] = performance.now()
        switch (entity.name) {
            case 'item':
            case 'arrow':
            case 'spectral_arrow':
            case 'trident':
            case 'egg':
            case 'snowball':
            case 'fishing_bobber':
            case 'ender_pearl':
            case 'llama_spit':
            case 'shulker_bullet':
            case 'fireball':
            case 'small_fireball':
            case 'dragon_fireball':
            case 'potion':
            case 'area_effect_cloud':
                let bestOwner = null
                let bestDistance = Infinity
                for (const id in bot.bot.entities) {
                    const potentialOwner = bot.bot.entities[id]
                    if (!potentialOwner) { continue }
                    if (!potentialOwner.isValid) { continue }
                    if (potentialOwner.id === entity.id) { continue }

                    let from
                    switch (potentialOwner.name) {
                        case 'player':
                            if (potentialOwner.metadata[6] === EntityPose.SNEAKING) {
                                from = potentialOwner.position.offset(0, 1.25, 0)
                            } else {
                                from = potentialOwner.position.offset(0, 1.6, 0)
                            }
                            break
                        default:
                            from = potentialOwner.position
                            break
                    }
                    let maxDistance
                    switch (entity.name) {
                        case 'item':
                            maxDistance = 0.28
                            break
                        case 'snowball':
                        case 'egg':
                        case 'arrow':
                        case 'spectral_arrow':
                        case 'trident':
                        case 'potion':
                            maxDistance = 0.08
                            break
                        default:
                            maxDistance = 0.1
                            break
                    }
                    const d = Math.round(from.distanceTo(entity.position) * 1000) / 1000
                    if (d > maxDistance + .1) { continue }
                    if (d < bestDistance) {
                        bestDistance = d
                        bestOwner = potentialOwner
                    }
                    break
                }
                if (bestOwner) {
                    this.entityOwners[entity.id] ??= bestOwner
                }
                break
            default:
                break
        }
    }

    /**
     * @param {import('./bruh-bot')} bot
     * @param {import('prismarine-entity').Entity} entity
     */
    __entityHurt(bot, entity) {
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

        bot.bot.on('playerUpdated', (player) => this.__playerUpdated(bot, player, bot.dimension))
        bot.bot.on('blockUpdate', (oldBlock, newBlock) => this.__blockUpdate(bot, oldBlock, newBlock, bot.dimension))
        bot.bot.on('entityDead', (entity) => this.__entityDead(bot, entity))
        bot.bot.on('entitySpawn', (entity) => this.__entitySpawn(bot, entity))
        bot.bot.on('entityHurt', (entity) => this.__entityHurt(bot, entity))
        bot.bot.on('entityGone', (entity) => this.__entityGone(bot, entity))
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
            console.warn(`[Environment] Failed to remove ${bot.username}`)
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
     * @returns {import('./task').Task<number>}
     */
    *scanChests(bot) {
        let scannedChests = 0

        for (let i = this.chests.length - 1; i >= 0; i--) {
            const chest = this.chests[i]
            if (chest.position.dimension !== bot.dimension) { continue }
            const blockAt = bot.bot.blockAt(chest.position.xyz(bot.dimension))
            if (!blockAt) { continue }
            if (blockAt.name !== 'chest') {
                console.log(`[Bot "${bot.username}"] Chest at ${chest.position} disappeared`)
                this.chests.splice(i, 1)
            }
        }

        console.log(`[Bot "${bot.username}"] Scanning chests ...`)
        const chestPositions = bot.bot.findBlocks({
            point: bot.bot.entity.position.clone(),
            maxDistance: config.scanChests.radius,
            matching: (block) => {
                if (bot.mc.registry.blocksByName['chest'].id === block.type) {
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
            count: 128,
        })
        console.log(`[Bot "${bot.username}"] Found ${chestPositions.length} chests`)
        for (const chestPosition of chestPositions) {
            try {
                yield* Tasks.goto.task(bot, {
                    block: chestPosition,
                })
                const chestBlock = bot.bot.blockAt(chestPosition)
                if (!chestBlock) {
                    console.warn(`[Bot "${bot.username}"] Chest disappeared while scanning`)
                    continue
                }
                if (chestBlock.name !== 'chest') {
                    console.warn(`[Bot "${bot.username}"] Chest replaced while scanning`)
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

                scannedChests++

                yield* sleepG(100)
                chest.close()
            } catch (error) {
                console.warn(`[Bot "${bot.username}"] Error while scanning chests`, error)
            }
        }
        console.log(`[Bot "${bot.username}"] Chests scanned`)

        this.save()

        return scannedChests
    }

    /**
     * @param {import('./bruh-bot')} bot
     * @returns {import('./task').Task<number>}
     */
    *scanVillagers(bot) {
        let scannedVillagers = 0
        console.log(`[Bot "${bot.username}"] Scanning villagers ...`)
        const villagers = Object.values(bot.bot.entities).filter(v => v.name === 'villager')
        console.log(`[Bot "${bot.username}"] Found ${villagers.length} villagers`)
        for (const villager of villagers) {
            try {
                if (!villager.isValid) { continue }
                yield* Tasks.goto.task(bot, {
                    point: villager.position,
                    distance: 2,
                })
                if (!villager.isValid) { continue }

                const _villager = yield* wrap(bot.bot.openVillager(villager))
                while (!_villager.trades) { yield }
                yield
                this.addVillager(villager, _villager, bot.dimension)
                scannedVillagers++
                _villager.close()

                yield* sleepG(100)
            } catch (error) {
                console.warn(`[Bot "${bot.username}"] Error while scanning villagers`, error)
            }
        }
        console.log(`[Bot "${bot.username}"] Villagers scanned`)
        return scannedVillagers
    }

    /**
     * @param {import('./bruh-bot')} bot
     * @param {Chest} chest
     * @param {Vec3Dimension} chestPosition
     * @param {string} item
     * @param {number} count
     */
    recordChestTransfer(bot, chest, chestPosition, item, count) {
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

        saved.content = {}

        for (const item of bot.containerItems(chest)) {
            saved.content[item.name] ??= 0
            saved.content[item.name] += item.count
        }

        saved.myItems[item] ??= 0
        saved.myItems[item] += count

        for (const item in saved.content) {
            if (!saved.myItems[item]) { continue }
            saved.myItems[item] = Math.min(saved.myItems[item], saved.content[item])
        }
    }

    /**
     * @param {import('./bruh-bot')} bot
     * @param {Item | number | string} item
     * @returns {Array<{ position: Vec3Dimension; count: number; myCount: number; }>}
     */
    searchForItem(bot, item) {
        if (typeof item === 'number') {
            item = bot.mc.registry.items[item].name
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
            animalBreedTimes: this.animalBreedTimes,
            minePositions: this.minePositions,
        }, replacer, ' '))
    }

    /**
     * @param {import('./bruh-bot')} bot
     * @param {Vec3} plantPosition
     * @param {import("./minecraft").AnyCrop} plant
     * @param {boolean} exactPosition
     * @param {boolean} exactBlock
     * @returns {{ block: Block; faceVector: Vec3; isExactPosition: boolean; isExactBlock: boolean; } | null}
     */
    getPlantableBlock(bot, plantPosition, plant, exactPosition, exactBlock) {
        if (plant.growsOnBlock === 'solid') {
            // TODO: this
            return null
        }
        const growsOnBlock = plant.growsOnBlock.map(v => bot.mc.registry.blocksByName[v].id)
        if (!exactBlock && plant.growsOnBlock.includes('farmland')) {
            const hoeableBlocks = [
                bot.mc.registry.blocksByName['dirt'].id,
                bot.mc.registry.blocksByName['grass_block'].id,
                bot.mc.registry.blocksByName['dirt_path'].id,
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
            maxDistance: exactPosition ? 1 : config.getPlantableBlock.searchRadius,
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
                    if (Minecraft.replaceableBlocks[neighborBlock.name] !== 'yes') { continue }
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
            if (Minecraft.replaceableBlocks[neighborBlock.name] !== 'yes') { continue }
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
     * @private
     * @param {import('./bruh-bot')} bot
     * @param {boolean} grown
     * @param {Block} block
     * @param {Array<Vec3>} mushrooms
     */
    cropFilter(bot, grown, block, mushrooms) {
        /** @type {boolean} */
        let isGrown = false
        const cropInfo = Minecraft.resolveCrop(block.name)
        if (!cropInfo) {
            // console.warn(`[Bot "${bot.username}"] This "${block.name}" aint a crop`)
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
                // for (let x = -4; x <= 4; x++) {
                //     for (let y = -1; y <= 1; y++) {
                //         for (let z = -4; z <= 4; z++) {
                //             const other = bot.bot.blockAt(block.position.offset(x, y, z))
                //             if (!other || other.name !== cropInfo.cropName) { continue }
                //             if (bruh.find(v => v.equals(other.position))) { continue }
                //             nearby++
                //             if (isDirectNeighbor(block.position, other.position)) {
                //                 neighbors++
                //             }
                //         }
                //     }
                // }
            } else {
                for (let x = -1; x <= 1; x++) {
                    for (let y = -1; y <= 1; y++) {
                        for (let z = -1; z <= 1; z++) {
                            const other = bot.bot.blockAt(block.position.offset(x, y, z))
                            if (!other || other.name !== cropInfo.cropName) { continue }
                            if (mushrooms.find(v => v.equals(other.position))) { continue }
                            if (isDirectNeighbor(block.position, other.position)) {
                                neighbors++
                            }
                        }
                    }
                }
            }

            isGrown = !!neighbors || nearby >= 5
            mushrooms.push(block.position.clone())
        }

        // if (isGrown) {
        //     bot.debug.drawPoint(block.position.offset(0, 0.5, 0), [0, 1, 0])
        // } else {
        //     bot.debug.drawPoint(block.position.offset(0, 0.5, 0), [1, 0, 0])
        // }

        return grown === isGrown
    }

    /**
     * @param {import('./bruh-bot')} bot
     * @param {Vec3} farmPosition
     * @param {boolean} grown
     * @param {number} count
     * @param {number} maxDistance
     * @returns {Iterable<Block>}
     */
    getCrops(bot, farmPosition, grown, count, maxDistance) {
        /**
         * @type {Array<Vec3>}
         */
        const mushrooms = []

        return bot.findBlocks({
            matching: bot.mc.cropBlockIds,
            filter: block => this.cropFilter(bot, grown, block, mushrooms),
            point: farmPosition,
            count: count,
            maxDistance: maxDistance,
        }).filter(v => !!v)

        // return bot.bot.findBlocks({
        //     matching: bot.mc.cropBlockIds,
        //     useExtraInfo: block => this.cropFilter(bot, grown, block, mushrooms),
        //     point: farmPosition,
        //     count: count,
        //     maxDistance: maxDistance,
        // })
    }

    /**
     * @param {import('./bruh-bot')} bot
     * @param {Vec3} farmPosition
     * @param {boolean} grown
     * @param {number} maxDistance
     * @returns {Block | null}
     */
    getCrop(bot, farmPosition, grown, maxDistance) {
        /**
         * @type {Array<Vec3>}
         */
        const mushrooms = []

        return bot.findBlocks({
            matching: bot.mc.cropBlockIds,
            filter: block => this.cropFilter(bot, grown, block, mushrooms),
            point: farmPosition,
            count: 1,
            maxDistance: maxDistance,
        }).filter(v => !!v).first() ?? null
    }

    /**
     * @param {import('./bruh-bot')} bot
     * @param {((item: Item) => boolean) | null} filter
     * @param {{
     *   inAir?: boolean;
     *   maxDistance: number;
     *   point?: Vec3;
     *   evenIfFull?: boolean;
     *   minLifetime?: number;
     * }} args
     * @returns {import("prismarine-entity").Entity | null}
     */
    getClosestItem(bot, filter, args) {
        if (!args.inAir) { args.inAir = false }
        if (!args.maxDistance) { args.maxDistance = 64 }
        if (!args.point) { args.point = bot.bot.entity.position.clone() }
        if (!args.evenIfFull) { args.evenIfFull = false }

        const nearestEntity = bot.bot.nearestEntity((/** @type {import("prismarine-entity").Entity} */ entity) => {
            if (entity.name !== 'item') { return false }
            if (!args.inAir && entity.velocity.distanceTo(new Vec3(0, 0, 0)) > 0.01) { return false }
            const droppedItem = entity.getDroppedItem()
            if (!droppedItem) { return false }
            if (filter && !filter(droppedItem)) { return false }
            if (!args.evenIfFull && bot.isInventoryFull(droppedItem.name)) { return false }
            if (args.minLifetime && this.entitySpawnTimes[entity.id]) {
                const entityLifetime = performance.now() - this.entitySpawnTimes[entity.id]
                if (entityLifetime < args.minLifetime) {
                    return false
                }
            }
            return true
        })
        if (!nearestEntity) { return null }

        const distance = nearestEntity.position.distanceTo(args.point)
        if (distance > args.maxDistance) { return null }

        return nearestEntity
    }

    /**
     * @param {import('./bruh-bot')} bot
     * @param {{
     *   maxDistance: number;
     *   point?: Vec3;
     * }} args
     * @returns {import('prismarine-entity').Entity | null}
     */
    getClosestXp(bot, args) {
        const nearestEntity = bot.bot.nearestEntity((/** @type {import('prismarine-entity').Entity} */ entity) => (
            entity.name === 'experience_orb')
        )
        if (!nearestEntity) { return null }

        const distance = nearestEntity.position.distanceTo(args.point ?? bot.bot.entity.position)
        if (distance > args.maxDistance) { return null }

        return nearestEntity
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
                entity.metadata[16] === 1
            )
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
     * @overload
     * @param {string} bot
     * @param {Vec3Dimension} position
     * @param {'activate'} type
     * @param {any} [args]
     * @returns {boolean}
     */
    /**
     * @param {string} bot
     * @param {Vec3Dimension} position
     * @param {AllocatedBlock['type']} type
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
     * @param {string} bot
     * @param {Vec3Dimension} position
     * @returns {boolean}
     */
    deallocateBlock(bot, position) {
        /**
         * @type {PositionHash}
         */
        const hash = `${position.x}-${position.y}-${position.z}-${position.dimension}`
        if (this.allocatedBlocks[hash] &&
            this.allocatedBlocks[hash].bot !== bot) {
            return false
        }
        delete this.allocatedBlocks[hash]
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
            if (bot.username === requestor) { continue }
            const lock = bot.tryLockItems(requestor, item, count - locked)
            if (!lock) { continue }
            locked += lock.count
            locks.push(lock)
        }
        return locks
    }

    /**
     * @param {Vec3} position
     */
    blockAt(position) {
        for (const bot of this.bots) {
            const block = bot.bot.blockAt(position)
            if (block) { return block }
        }
        return null
    }

    /**
     * @param {import('prismarine-entity').Entity} entity
     */
    static isGoodFarmAnimal(entity) {
        if (!entity || !entity.isValid) { return false }
        if ((
            entity.name !== 'chicken' &&
            entity.name !== 'cow' &&
            entity.name !== 'pig' &&
            entity.name !== 'sheep'
        )) { return false }
        if (entity.metadata[16]) { return false }
        return true
    }

    /**
     * @param {import('./bruh-bot')} bot 
     */
    *scanFencings(bot) {
        /**
         * @type {Array<import('./environment').Fencing>}
         */
        const fencings = []
        const farmAnimals = Object.values(bot.bot.entities)
            .filter(Environment.isGoodFarmAnimal)
        for (const farmAnimal of farmAnimals) {
            yield
            if (!farmAnimal.isValid) { continue }
            let isAdded = false
            for (const fencing of fencings) {
                if (fencing.mobs[farmAnimal.id]) {
                    isAdded = true
                    break
                }
            }
            if (isAdded) { continue }
            for (const fencing of fencings) {
                if (fencing.positions.some(v => v.equals(farmAnimal.position.floored()))) {
                    fencing.mobs[farmAnimal.id] = farmAnimal
                    isAdded = true
                    break
                }
            }
            const fencing = yield* bot.env.scanFencing(farmAnimal.position)
            if (!fencing) { continue }
            fencings.push(fencing)
        }
        return fencings
    }

    /**
     * @param {{ x: number; y: number; z: number; }} origin
     * @returns {import("./task").Task<Fencing | null>}
     */
    *scanFencing(origin) {
        if (!origin) { return { positions: [], mobs: {} } }

        /** @type {Array<{ p: Vec3; v: boolean; }>} */
        const visited = []
        /** @type {Array<Vec3>} */
        const mustVisit = [new Vec3(origin.x, origin.y - 1, origin.z).floored()]
        const maxSize = config.fencing.maxSize

        const isEmpty = (/** @type {import("prismarine-block").Block} */ block) => {
            return (
                this.bots[0].bot.pathfinder.movements.emptyBlocks.has(block.type) ||
                this.bots[0].bot.pathfinder.movements.carpets.has(block.type) ||
                this.bots[0].bot.pathfinder.movements.liquids.has(block.type)
            )
        }

        const fences = [
            'oak_fence',
            'spruce_fence',
            'birch_fence',
            'jungle_fence',
            'acacia_fence',
            'dark_oak_fence',
            'mangrove_fence',
            'cherry_fence',
            'bamboo_fence',
        ]

        const visit = (/** @type {Vec3} */ p) => {
            if (!p) { return }
            const block = this.blockAt(p)
            if (!block) { return }
            if (visited.find(other => other.p.equals(p))) { return }
            const node = { p: p, v: false }
            visited.push(node)
            if (isEmpty(block)) { return }
            const above = this.blockAt(p.offset(0, 1, 0))
            if (!isEmpty(above)) {
                if (fences.includes(above.name)) {
                    this.bots[0].debug.drawPoint(p.offset(0, 2, 0), [0, 0, 1])
                    node.v = true
                }
                return
            }
            mustVisit.push(p.offset(-1, 0, 0))
            mustVisit.push(p.offset(1, 0, 0))
            mustVisit.push(p.offset(0, 0, -1))
            mustVisit.push(p.offset(0, 0, 1))
            this.bots[0].debug.drawPoint(p.offset(0, 1, 0), [0, 1, 0])
            node.v = true
        }

        let j = 0

        while (mustVisit.length > 0) {
            if (visited.length >= maxSize) {
                console.warn(`[Bot] Fencing is too big: ${visited.length} >= ${maxSize}`)
                return null
            }
            const n = mustVisit.length
            for (let i = 0; i < n; i++) {
                if (j++ > 5) {
                    yield
                    j = 0
                }
                visit(mustVisit[i])
            }
            mustVisit.splice(0, n)
        }

        /**
         * @type {Record<number, import("prismarine-entity").Entity>}
         */
        const mobs = {}
        const fencing = visited.filter(v => v.v).map(v => v.p.offset(0, 1, 0))

        for (const bot of this.bots) {
            for (const entity of Object.values(bot.bot.entities)) {
                yield
                if (!Environment.isGoodFarmAnimal(entity)) { continue }
                let isIncluded = false
                const entityPosition = entity.position.rounded()
                for (const fencingPosition of fencing) {
                    if (fencingPosition.equals(entityPosition)) {
                        isIncluded = true
                        break
                    }
                }
                if (!isIncluded) { continue }
                this.bots[0].debug.drawPoint(entity.position.offset(0, entity.height + 0.3, 0), [1, 1, 1])
                mobs[entity.id] = entity
            }
        }

        return {
            positions: fencing,
            mobs: mobs,
        }
    }
}
