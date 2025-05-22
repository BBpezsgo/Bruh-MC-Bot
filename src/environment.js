'use strict'

const { Vec3 } = require('vec3')
const path = require('path')
const fs = require('fs')
const { replacer, reviver } = require('./utils/serializing')
const { wrap, sleepG, runtimeArgs, sleepTicks } = require('./utils/tasks')
const { directBlockNeighbors: directBlockNeighbors, isDirectNeighbor, isItemEquals, stringifyItem } = require('./utils/other')
const { Block } = require('prismarine-block')
const Minecraft = require('./minecraft')
const Tasks = require('./tasks')
const { Chest } = require('mineflayer')
const { goals } = require('mineflayer-pathfinder')
const Vec3Dimension = require('./utils/vec3-dimension')
const { EntityPose } = require('./entity-metadata')
const Iterable = require('./utils/iterable')
const config = require('./config')
const Freq = require('./utils/freq')
const BlockLock = require('./locks/block-lock')
const EntityLock = require('./locks/entity-lock')
const GameError = require('./errors/game-error')
const EnvironmentError = require('./errors/environment-error')

/**
 * @typedef {{
 *   position: Vec3Dimension;
 *   content: Freq<import('./utils/other').ItemId>;
 *   myItems: Freq<import('./utils/other').ItemId>;
 *   type: 'single' | 'right' | 'left';
 *   facing: 'north' | 'east' | 'south' | 'west';
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

module.exports = class Environment {
    /**
     * @readonly
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
     * @readonly
     * @type {Array<Vec3Dimension>}
     */
    minePositions

    /**
     * @readonly
     * @type {Array<BlockLock>}
     */
    lockedBlocks

    /**
     * @readonly
     * @type {Array<EntityLock>}
     */
    lockedEntities

    /** @type {Array<SavedChest>} */
    #chests

    /** @type {ReadonlyArray<Readonly<SavedChest>>} */
    get chests() { return this.#chests }

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
    #entityHurtTimes

    /**
     * @readonly
     * @type {Record<number, Array<number>>}
     */
    #entityHurtTimeRecords

    /**
     * @readonly
     * @type {Readonly<Record<number, ReadonlyArray<number>>>}
     */
    get entityHurtTimeRecords() { return this.#entityHurtTimeRecords } 

    /**
     * @private
     * @type {NodeJS.Timeout}
     */
    interval

    /**
     * @readonly
     * @type {Array<{
     *   lock: import('./locks/item-lock');
     *   priority?: number;
     *   status?: 'on-the-way' | 'dropped' | 'served' | 'failed';
     *   itemEntity?: import('prismarine-entity').Entity;
     * }>}
     */
    itemRequests

    /**
     * @readonly
     * @type {Record<number, import('prismarine-entity').Entity>}
     */
    entityOwners

    /**
     * @readonly
     * @type {Array<{
     *   position: Vec3Dimension;
     *   username: string;
     *   time: number;
     *   drops: Array<import('prismarine-entity').Entity>;
     * }>}
     */
    playerDeaths

    /**
     * @readonly
     * @type {Array<import('./stronghold').EnderPearlThrow>}
     */
    enderPearlThrows

    /**
     * @param {string} filePath
     */
    constructor(filePath) {
        this.bots = []
        this.filePath = filePath

        this.crops = []
        this.#chests = []
        this.playerPositions = {}
        this.#entityHurtTimes = {}
        this.#entityHurtTimeRecords = {}
        this.entitySpawnTimes = {}
        this.animalBreedTimes = {}
        this.itemRequests = []
        this.villagers = {}
        this.entityOwners = {}
        this.minePositions = []
        this.lockedBlocks = []
        this.lockedEntities = []
        this.playerDeaths = []
        this.enderPearlThrows = []

        if (!fs.existsSync(this.filePath)) {
            console.log(`[Environment] File not found at "${this.filePath}"`)
            return
        }
        const data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'), reviver)
        this.playerPositions = data.playerPositions ?? this.playerPositions
        this.crops = data.crops ?? this.crops
        this.#chests = data.chests
            ? (/** @type {SavedChest[]} */ (data.chests)).map(v => ({
                content: new Freq(isItemEquals).from(v.content),
                myItems: new Freq(isItemEquals).from(v.myItems),
                position: v.position,
                type: v.type,
                facing: v.facing,
            }))
            : this.#chests
        this.villagers = data.villagers ?? this.villagers
        this.animalBreedTimes = data.animalBreedTimes ?? this.animalBreedTimes
        this.minePositions = data.minePositions ?? this.minePositions
        console.log(`[Environment] Loaded`)

        /** @type {Array<SavedCrop>} */
        const uniqueCrops = []
        for (const crop of this.crops) {
            let alreadyAdded = uniqueCrops.find(v => v.position.equals(crop.position))
            if (alreadyAdded) {
                alreadyAdded.block = crop.block
            } else {
                uniqueCrops.push(crop)
            }
        }
        this.crops = uniqueCrops
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

        for (const lock of this.lockedBlocks) {
            if (!lock.block.equals(new Vec3Dimension(newBlock.position, dimension))) continue
            if (isBreak) {
                lock.isUnlocked = true
            }
            if (isPlace && lock.reason === 'place') {
                lock.isUnlocked = true
            }
        }

        if (isBreak) {
            if (Minecraft.isCropRoot(bot.bot, oldBlock)) {
                let isSaved = false
                for (const crop of this.crops) {
                    if (crop.position.equals(oldBlock.position)) {
                        if (crop.block !== oldBlock.name) {
                            bot.debug.label(oldBlock.position.offset(0.5, 1, 0.5), { text: `c ${oldBlock.name}`, color: 'yellow' }, 1000)
                        }
                        crop.block = oldBlock.name
                        isSaved = true
                        break
                    }
                }
                if (!isSaved) {
                    bot.debug.label(oldBlock.position.offset(0.5, 1, 0.5), { text: `+ ${oldBlock.name}`, color: 'green' }, 1000)
                    this.crops.push({
                        position: new Vec3Dimension(oldBlock.position, dimension),
                        block: oldBlock.name,
                    })
                }
            }
        }

        if (Minecraft.isCropRoot(bot.bot, newBlock)) {
            let isSaved = false
            for (const crop of this.crops) {
                if (crop.position.equals(newBlock.position)) {
                    if (crop.block !== newBlock.name) {
                        bot.debug.label(newBlock.position.offset(0.5, 1, 0.5), { text: `c ${newBlock.name}`, color: 'yellow' }, 1000)
                    }
                    crop.block = newBlock.name
                    isSaved = true
                    break
                }
            }
            if (!isSaved) {
                bot.debug.label(newBlock.position.offset(0.5, 1, 0.5), { text: `+ ${newBlock.name}`, color: 'green' }, 1000)
                this.crops.push({
                    position: new Vec3Dimension(newBlock.position, dimension),
                    block: newBlock.name,
                })
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
        delete this.#entityHurtTimes[entity.id]
        delete this.#entityHurtTimeRecords[entity.id]
        delete this.entityOwners[entity.id]
        for (const id in this.entityOwners) {
            const v = this.entityOwners[id]
            if (!v.isValid || v.id === entity.id) {
                delete this.entityOwners[id]
            }
        }

        if (entity.username) {
            console.log(`[Environment] Player \"${entity.username}\"'s death recorded at ${new Vec3Dimension(entity.position, bot.dimension)}`)
            this.playerDeaths.push({
                position: new Vec3Dimension(entity.position, bot.dimension),
                username: entity.username,
                time: performance.now(),
                drops: [],
            })
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
        if (entity.name === 'item') {
            setTimeout(() => {
                let closest = null
                let closestD = Infinity
                const now = performance.now()
                for (const playerDeath of this.playerDeaths) {
                    if (now - playerDeath.time > 2000) continue
                    if (playerDeath.position.dimension !== bot.dimension) continue
                    const d = playerDeath.position.xyz(bot.dimension).distanceTo(entity.position)
                    if (d < closestD) {
                        closestD = d
                        closest = playerDeath
                    }
                }
                if (closest) {
                    if (!closest.drops.some(v => v.id === entity.id)) {
                        closest.drops.push(entity)
                    }
                }
            }, 60)
        }
    }

    /**
     * @param {import('./bruh-bot')} bot
     * @param {import('prismarine-entity').Entity} entity
     */
    __entityHurt(bot, entity) {
        this.#entityHurtTimes[entity.id] = performance.now()
    }

    /**
     * @param {import('prismarine-entity').Entity} entity
     */
    static resolveEntityHurtTime(entity) {
        if (entity.name === 'boat') return 80
        return Minecraft.general.hurtTime
    }

    /**
     * @param {import('prismarine-entity').Entity} entity
     * @param {number} [time]
     */
    isEntityHurting(entity, time) {
        const now = performance.now()
        const hurtTime = Environment.resolveEntityHurtTime(entity)
        if (!time) {
            time = now
            if (this.#entityHurtTimes[entity.id]) {
                if (time - this.#entityHurtTimes[entity.id] < hurtTime) return true
            }
        } else {
            if (this.#entityHurtTimeRecords[entity.id]) {
                const records = this.#entityHurtTimeRecords[entity.id]
                for (let i = 0; i < records.length; i++) {
                    const record = records[i]
                    if (record < now) {
                        records.splice(i, 1)
                    } else if (time > record && time - record < hurtTime) {
                        return true
                    }
                }
            }
        }
        return false
    }

    /**
     * @param {import('prismarine-entity').Entity} entity
     * @param {number} [time]
     */
    recordEntityHurt(entity, time = undefined) {
        time ??= performance.now()
        if (!time) {
            this.#entityHurtTimes[entity.id] = time
        } else {
            (this.#entityHurtTimeRecords[entity.id] ??= []).push(time)
        }
    }

    /**
     * @param {import('./bruh-bot')} bot
     */
    addBot(bot) {
        if (!this.interval) {
            this.interval = setInterval(() => {
                this.save()
                this.purgeItemRequests()
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

        for (const lock of this.lockedBlocks) {
            if (lock.by === bot.bot.username) {
                lock.unlock()
            }
        }

        for (const lock of this.lockedEntities) {
            if (lock.by === bot.bot.username) {
                lock.unlock()
            }
        }
    }

    purgeItemRequests() {
        for (let i = this.itemRequests.length - 1; i >= 0; i--) {
            if (this.itemRequests[i].status === 'served') {
                this.itemRequests.splice(i, 1)
            }
        }
    }

    /**
     * @type {import('./task').SimpleTaskDef<number>}
     */
    *scanChests(bot, args) {
        let scannedChests = 0

        for (let i = this.#chests.length - 1; i >= 0; i--) {
            const chest = this.#chests[i]
            if (chest.position.dimension !== bot.dimension) { continue }
            const blockAt = bot.bot.blocks.at(chest.position.xyz(bot.dimension))
            if (!blockAt) { continue }
            if (blockAt.name !== 'chest') {
                bot.debug.label(chest.position.xyz(bot.dimension), { text: `- Chest`, color: 'red' }, 10000)
                console.log(`[Bot "${bot.username}"] Chest at ${chest.position} disappeared`)
                this.#chests.splice(i, 1)
            }
        }

        const chestIterator = bot.blocks.find({
            point: bot.bot.entity.position.clone(),
            maxDistance: config.scanChests.radius,
            matching: 'chest',
            filter: (block) => {
                const properties = block.getProperties()
                if (!properties['type']) {
                    return true
                }
                if (properties['type'] === 'left') {
                    return false
                }
                return true
            },
            force: true,
            count: Infinity,
        })

        for (const _chestBlock of chestIterator) {
            yield

            let chestBlock = _chestBlock
            if (!chestBlock) { continue }

            bot.debug.label(chestBlock.position, { text: `? Chest`, color: 'yellow' }, 10000)

            try {
                yield* Tasks.goto.task(bot, {
                    block: chestBlock.position,
                    ...runtimeArgs(args),
                })

                chestBlock = bot.bot.blockAt(chestBlock.position)
                if (!chestBlock) {
                    console.warn(`[Bot "${bot.username}"] Chest disappeared while scanning`)
                    continue
                }

                if (chestBlock.name !== 'chest') {
                    console.warn(`[Bot "${bot.username}"] Chest replaced while scanning`)
                    continue
                }

                const lock = yield* this.waitLock(bot.username, new Vec3Dimension(chestBlock.position, bot.dimension), 'use')

                let chest = null
                try {
                    chest = yield* bot.openChest(chestBlock)

                    let [found] = this.getChest(new Vec3Dimension(chestBlock.position, bot.dimension))
                    if (!found) {
                        found = this.saveChest(bot, new Vec3Dimension(chestBlock.position, bot.dimension))
                    }

                    found.content = new Freq(isItemEquals)

                    for (const item of chest.containerItems()) {
                        found.content.add(item, item.count)
                    }

                    for (const item of found.myItems.keys) {
                        found.myItems.set(item, Math.min(found.myItems.get(item), found.content.get(item)))
                    }

                    scannedChests++
                    yield* sleepTicks()

                    bot.debug.label(chestBlock.position, { text: `+ Chest`, color: 'green' }, 10000)
                } finally {
                    chest?.close()
                    lock.unlock()
                }
            } catch (error) {
                console.warn(`[Bot "${bot.username}"] Error while scanning chests`, error)
            }
        }

        this.save()

        return scannedChests
    }

    /**
     * @param {import('./bruh-bot')} bot
     * @param {Vec3Dimension} chestPosition
     */
    saveChest(bot, chestPosition) {
        const chestBlock = bot.bot.blockAt(chestPosition.xyz(bot.dimension))
        if (chestBlock.name !== 'chest') throw new EnvironmentError(`This aint a chest`)
        /** @type {SavedChest} */
        const saved = {
            position: chestPosition,
            content: new Freq(isItemEquals),
            myItems: new Freq(isItemEquals),
            // @ts-ignore
            type: chestBlock.getProperties()['type'],
            // @ts-ignore
            facing: chestBlock.getProperties()['facing'],
        }
        this.#chests.push(saved)
        return saved
    }

    /**
     * @param {Vec3Dimension} position
     * @returns {[(null | SavedChest), number]}
     */
    getChest(position) {
        for (let i = 0; i < this.#chests.length; i++) {
            const chest = this.#chests[i]
            if (chest.position.dimension !== position.dimension) continue
            if (chest.position.x === position.x &&
                chest.position.y === position.y &&
                chest.position.z === position.z) { return [chest, i] }

            const otherHalf = Environment.getChestOtherHalf(chest.position, chest.type, chest.facing)
            if (otherHalf &&
                otherHalf.x === position.x &&
                otherHalf.y === position.y &&
                otherHalf.z === position.z) { return [chest, i] }
        }
        return [null, -1]
    }

    /**
     * @param {import('minecraft-data').IndexedData} registry
     * @param {SavedChest} chest
     * @param {import('./utils/other').ItemId} [item]
     */
    isChestFull(registry, chest, item = null) {
        if (item) {
            for (const k of chest.content.keys) {
                if (!isItemEquals(k, item)) continue
                const stackSize = registry.itemsByName[stringifyItem(k)]?.stackSize ?? 64
                let n = chest.content.get(k)
                n %= stackSize
                if (n) return false
            }
        }

        let takenUp = 0
        for (const k of chest.content.keys) {
            const stackSize = (typeof k === 'object' && 'stackSize' in k) ? k.stackSize : registry.itemsByName[stringifyItem(k)]?.stackSize ?? 64
            let n = chest.content.get(k)
            n /= stackSize
            n = Math.ceil(n)
            takenUp += n
        }

        let full = 0
        if (chest.type === 'single') {
            full = 3 * 9
        } else {
            full = 6 * 9
        }
        return takenUp >= full
    }

    /**
     * @param {Vec3Dimension} position
     */
    deleteChest(position) {
        while (true) {
            const [, i] = this.getChest(position)
            if (i < 0) break
            this.#chests.splice(i, 1)
        }
        this.save()
        console.log(`[Environment] Chest at ${position} deleted`)
    }

    /**
     * @param {import('./bruh-bot')} bot
     * @param {Chest} chest
     * @param {Vec3Dimension} chestPosition
     * @param {string} item
     * @param {number} count
     */
    recordChestTransfer(bot, chest, chestPosition, item, count) {
        let [saved] = this.getChest(chestPosition)
        if (!saved) {
            saved = this.saveChest(bot, chestPosition)
        }

        saved.content = new Freq(isItemEquals)

        for (const item of bot.inventory.containerItems(chest)) {
            saved.content.add(item, item.count)
        }

        saved.myItems.add(item, count)

        for (const item of saved.content.keys) {
            if (!saved.myItems.get(item)) { continue }
            saved.myItems.set(item, Math.min(saved.myItems.get(item), saved.content.get(item)))
        }
    }

    /**
     * @type {import('./task').SimpleTaskDef<number>}
     */
    *scanVillagers(bot, args) {
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
                    ...runtimeArgs(args),
                })
                if (!villager.isValid) { continue }

                const _villager = yield* wrap(bot.bot.openVillager(villager), args.interrupt)
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
     * @param {import('./utils/other').ItemId} item
     * @returns {Array<{ position: Vec3Dimension; count: number; myCount: number; }>}
     */
    searchForItem(item) {
        /**
         * @type {Array<{ position: Vec3Dimension; count: number; myCount: number; }>}
         */
        const result = []
        for (const chest of this.#chests) {
            for (const itemName of chest.content.keys) {
                const count = chest.content.get(itemName)
                const myCount = chest.myItems.get(itemName)
                if (isItemEquals(itemName, item)) {
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
     * @param {import('prismarine-entity').Entity} entity
     * @param {import('mineflayer').Villager} villager
     * @param {import('mineflayer').Dimension} dimension
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
            chests: this.#chests,
            villagers: this.villagers,
            animalBreedTimes: this.animalBreedTimes,
            minePositions: this.minePositions,
        }, replacer, ' '))
    }

    /**
     * @param {import('./bruh-bot')} bot
     * @param {Vec3} plantPosition
     * @param {import('./minecraft').AnyCrop} plant
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

        /**
         * @param {import('prismarine-block').Block} block
         */
        const filter = (block) => {
            if (plant.type === 'spread' && (
                plant.seed === 'brown_mushroom' ||
                plant.seed === 'red_mushroom')) {
                let n = 0
                for (let x = -4; x <= 4; x++) {
                    for (let y = -1; y <= 1; y++) {
                        for (let z = -4; z <= 4; z++) {
                            const other = bot.bot.blocks.at(block.position.offset(x, y, z))
                            if (!other || other.name !== plant.seed) { continue }
                            n++
                        }
                    }
                }
                if (n >= 5 - 1) {
                    return false
                }
            }
            if (plant.type === 'up' && plant.needsWater) {
                let hasWater = false
                for (const neighbor of directBlockNeighbors(block.position.offset(0, -1, 0), 'side')) {
                    if (bot.bot.blocks.at(neighbor)?.name === 'water') {
                        hasWater = true
                        break
                    }
                }
                if (!hasWater) return false
            }
            const neighbors = directBlockNeighbors(block.position, plant.growsOnSide)
            for (const neighbor of neighbors) {
                const neighborBlock = bot.bot.blocks.at(neighbor)
                if (Minecraft.replaceableBlocks[neighborBlock.name] !== 'yes') { continue }
                return true
            }
            return false
        }

        let bestBlock = null
        if (!exactPosition) {
            bestBlock = bot.bot.findBlock({
                matching: growsOnBlock,
                point: plantPosition,
                maxDistance: config.getPlantableBlock.searchRadius,
                useExtraInfo: filter,
            })
            if (!bestBlock) return null
        } else {
            bestBlock = bot.bot.blockAt(plantPosition.offset(0, -1, 0))
            if (!bestBlock) return null
            if (!growsOnBlock.includes(bestBlock.type)) return null
            if (!filter(bestBlock)) return null
        }

        const neighbors = directBlockNeighbors(bestBlock.position, plant.growsOnSide)
        for (const neighbor of neighbors) {
            const neighborBlock = bot.bot.blocks.at(neighbor)
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
                const age = Number(block.getProperties()?.['age'])
                isGrown = age >= cropInfo.grownAge
                break
            }
            case 'grows_block': {
                let fruitBlock = null
                for (const neighbor of directBlockNeighbors(block.position, 'side')) {
                    const neighborBlock = bot.bot.blocks.at(neighbor)
                    if (neighborBlock && neighborBlock.name === cropInfo.grownBlock) {
                        fruitBlock = neighborBlock
                        break
                    }
                }
                isGrown = !!fruitBlock
                break
            }
            case 'up': {
                if (cropInfo.root && block.name === cropInfo.root) {
                    isGrown = false
                } else {
                    const below1 = bot.bot.blocks.at(block.position.offset(0, -1, 0))
                    const below2 = bot.bot.blocks.at(block.position.offset(0, -2, 0))
                    if (block.type === below1.id && block.type === below2.id) return false
                    if (below1.id !== block.type) {
                        isGrown = false
                    } else {
                        isGrown = true
                    }
                }
                break
            }
            case 'grows_fruit': {
                switch (block.name) {
                    case 'cave_vines':
                    case 'cave_vines_plant':
                        const berries = Boolean(block.getProperties()?.['berries'])
                        isGrown = berries
                        break
                    case 'sweet_berry_bush':
                        const age = Number(block.getProperties()?.['age'])
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
                            const pos = block.position.offset(x, y, z)
                            const other = bot.bot.blocks.at(pos)
                            if (!other || other.name !== cropInfo.cropName) { continue }
                            if (mushrooms.find(v => v.equals(pos))) { continue }
                            if (isDirectNeighbor(block.position, pos)) {
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

        return bot.blocks.find({
            matching: bot.mc.cropBlockIds,
            filter: block => this.cropFilter(bot, grown, block, mushrooms),
            point: farmPosition,
            count: count,
            maxDistance: maxDistance,
            force: true,
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
     * @param {SavedCrop} crop
     * @returns {Vec3}
     */
    getCropHarvestPositions(bot, crop) {
        const v = Minecraft.resolveCrop(crop.block)
        const p = crop.position.xyz(bot.dimension)
        switch (v.type) {
            case 'grows_block': {
                for (const neighbor of directBlockNeighbors(p, 'side')) {
                    const neighborBlock = bot.bot.blocks.at(neighbor)
                    if (!neighborBlock || neighborBlock.name !== v.grownBlock) continue
                    return neighbor
                }
                return null
            }
            case 'grows_fruit': {
                const block = bot.bot.blockAt(p)
                if (!block) return null
                switch (block.name) {
                    case 'cave_vines':
                    case 'cave_vines_plant':
                        const berries = Boolean(block.getProperties()?.['berries'])
                        if (berries) return p
                        return null
                    case 'sweet_berry_bush':
                        const age = Number(block.getProperties()?.['age'])
                        if (age >= 3) return p
                        return null
                    default:
                        console.warn(`Unimplemented fruit crop "${block.name}"`)
                        return null
                }
            }
            case 'seeded':
            case 'simple': {
                const block = bot.bot.blockAt(p)
                if (!block) return null
                const age = Number(block.getProperties()?.['age'])
                if (age >= v.grownAge) return p
                return null
            }
            case 'up': {
                const above = bot.bot.blocks.at(p.offset(0, 1, 0))
                if (above.name === v.cropName) return p.offset(0, 1, 0)
                return null
            }
            case 'spread': {
                const block = bot.bot.blocks.at(p)
                if (!block) return null

                if (block.name === 'brown_mushroom' ||
                    block.name === 'red_mushroom') {
                    let nearby = 0
                    for (let x = -4; x <= 4; x++) {
                        for (let y = -1; y <= 1; y++) {
                            for (let z = -4; z <= 4; z++) {
                                if (!x && !y && !z) continue
                                const other = bot.bot.blocks.at(p.offset(x, y, z))
                                if (!other || other.name !== block.name) continue
                                if (this.isBlockLocked(new Vec3Dimension(p.offset(x, y, z), bot.dimension))?.reason === 'dig') continue
                                nearby++
                                if (nearby > 2) return p
                            }
                        }
                    }
                    return null
                }

                if (block.name === 'air') return null

                console.warn(`Unimplemented spread crop "${block.name}"`)
                return null
            }
            case 'tree': {
                const block = bot.bot.blocks.at(p)
                if (!block) return null

                if (v.log !== block.name) return null
                if (v.size !== 'small') return null
                return p
            }
            default: return null
        }
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
                if (age > maxAge) {
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
     * @param {Vec3Dimension} block
     */
    isBlockLocked(block) {
        for (const lock of this.lockedBlocks) {
            if (lock.isUnlocked) continue
            if (lock.block.dimension !== block.dimension) continue
            if (lock.block.x === block.x &&
                lock.block.y === block.y &&
                lock.block.z === block.z) {
                return lock
            }
            for (const additionalPoint of lock.additionalPoints) {
                if (additionalPoint.x === block.x &&
                    additionalPoint.y === block.y &&
                    additionalPoint.z === block.z) {
                    return lock
                }
            }
        }
        return null
    }

    /**
     * @param {Vec3Dimension} position
     */
    _blockAt(position) {
        for (const bot of this.bots) {
            if (bot.dimension !== position.dimension) continue
            const b = bot.bot.blockAt(position.xyz(bot.dimension))
            if (b) return b
        }
        return null
    }

    /**
     * @param {string} by
     * @param {Vec3Dimension} block
     * @param {import('./locks/block-lock').BlockLockReason} reason
     * @returns {BlockLock}
     */
    tryLockBlock(by, block, reason) {
        if (this.isBlockLocked(block)) return null
        const blockAt = this._blockAt(new Vec3Dimension(block, this.bots.find(v => v.username === by).dimension))
        /** @type {Array<Point3>} */ const additionalPoints = []
        if (blockAt?.name === 'chest') {
            const properties = blockAt.getProperties() ?? {}
            // @ts-ignore
            const chestOtherHalf = Environment.getChestOtherHalf(block, properties['type'], properties['facing'])
            if (chestOtherHalf) {
                additionalPoints.push(chestOtherHalf)
            }
        }
        const newLock = new BlockLock(by, block, reason, additionalPoints)
        this.lockedBlocks.push(newLock)
        return newLock
    }

    /**
     * @param {Point3} position
     * @param {string} type
     * @param {string} facing
     */
    static getChestOtherHalf(position, type, facing) {
        switch (type) {
            case 'left':
                switch (facing) {
                    case 'north':
                        return {
                            x: position.x + 1,
                            y: position.y,
                            z: position.z,
                        }
                    case 'east':
                        return {
                            x: position.x,
                            y: position.y,
                            z: position.z + 1,
                        }
                    case 'south':
                        return {
                            x: position.x - 1,
                            y: position.y,
                            z: position.z,
                        }
                    case 'west':
                        return {
                            x: position.x,
                            y: position.y,
                            z: position.z - 1,
                        }
                    default:
                        break
                }
                break
            case 'right':
                switch (facing) {
                    case 'north':
                        return {
                            x: position.x - 1,
                            y: position.y,
                            z: position.z,
                        }
                    case 'east':
                        return {
                            x: position.x,
                            y: position.y,
                            z: position.z - 1,
                        }
                    case 'south':
                        return {
                            x: position.x + 1,
                            y: position.y,
                            z: position.z,
                        }
                    case 'west':
                        return {
                            x: position.x,
                            y: position.y,
                            z: position.z + 1,
                        }
                    default:
                        break
                }
                break
            default:
                break
        }
        return null
    }

    /**
     * @param {string} by
     * @param {Vec3Dimension} block
     * @param {import('./locks/block-lock').BlockLockReason} reason
     */
    *waitLock(by, block, reason) {
        let lock = null
        while (!(lock = this.tryLockBlock(by, block, reason))) {
            yield* sleepTicks()
        }
        return lock
    }

    /**
     * @param {import('./bruh-bot')} bot
     * @param {Vec3Dimension} block
     * @returns {import('./task').Task<BlockLock | null>}
     */
    *lockBlockDigging(bot, block) {
        outer: while (true) {
            yield
            const lock = bot.env.tryLockBlock(bot.username, block, 'dig')
            if (lock) return lock
            while (bot.bot.blocks.at(block)?.name !== 'air') {
                if (!this.isBlockLocked(block)) continue outer
                yield* sleepTicks()
            }
            return null
        }
    }

    /**
     * @param {import('./bruh-bot')} bot
     * @param {Vec3Dimension} block
     * @param {string | ((block: import('minecraft-data').IndexedBlock) => boolean)} matching 
     * @returns {import('./task').Task<BlockLock | null>}
     */
    *lockBlockPlacing(bot, block, matching) {
        if (typeof matching === 'string') {
            const s = matching
            matching = (block) => block?.name === s
        }
        outer: while (true) {
            yield
            const lock = bot.env.tryLockBlock(bot.username, block, 'place')
            if (lock) return lock
            while (!matching(bot.bot.blocks.at(block))) {
                if (!this.isBlockLocked(block)) continue outer
                yield* sleepTicks()
            }
            return null
        }
    }

    /**
     * @param {string | null} by
     * @param {Point3} block
     */
    unlockBlock(by, block) {
        for (let i = 0; i < this.lockedBlocks.length; i++) {
            const lock = this.lockedBlocks[i]
            if (lock.block.x === block.x &&
                lock.block.y === block.y &&
                lock.block.z === block.z &&
                (!by || by === lock.by)) {
                lock.unlock()
            }
            if (lock.isUnlocked) {
                this.lockedBlocks.splice(i, 1)
                i--
            }
        }
    }

    /**
     * @param {import('prismarine-entity').Entity} entity
     */
    isEntityLocked(entity) {
        for (const lock of this.lockedEntities) {
            if (lock.isUnlocked) continue
            if (lock.entity.id === entity.id) return lock.by
        }
        return null
    }

    /**
     * @param {string} by
     * @param {import('prismarine-entity').Entity} entity
     * @returns {EntityLock}
     */
    tryLockEntity(by, entity) {
        for (const lock of this.lockedEntities) {
            if (lock.isUnlocked) continue
            if (lock.entity.id === entity.id) {
                return null
            }
        }
        const newLock = new EntityLock(by, entity)
        this.lockedEntities.push(newLock)
        return newLock
    }

    /**
     * @param {string | null} by
     * @param {import('prismarine-entity').Entity} entity
     */
    unlockEntity(by, entity) {
        for (let i = 0; i < this.lockedEntities.length; i++) {
            const lock = this.lockedEntities[i]
            if (lock.entity.id === entity.id &&
                (!by || by === lock.by)) {
                lock.unlock()
            }
            if (lock.isUnlocked) {
                this.lockedEntities.splice(i, 1)
                i--
            }
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
            const goal = other.bot.pathfinder?.goal
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
     * @param {string} requestor
     * @param {string} item
     * @param {number} count
     */
    lockOthersItems(requestor, item, count) {
        let locked = 0
        const locks = []
        for (const bot of this.bots) {
            if (bot.username === requestor) { continue }
            const lock = bot.inventory.tryLockItem(requestor, item, count - locked)
            if (!lock) { continue }
            locked += lock.count
            locks.push(lock)
        }
        return locks
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
            const fencing = yield* bot.env.scanFencing(bot, farmAnimal.position)
            if (!fencing) { continue }
            fencings.push(fencing)
        }
        return fencings
    }

    /**
     * @param {import('./bruh-bot')} bot
     * @param {Point3} origin
     * @returns {import('./task').Task<Fencing | null>}
     */
    *scanFencing(bot, origin) {
        if (!origin) { return { positions: [], mobs: {} } }

        /** @type {Array<{ p: Vec3; v: boolean; }>} */
        const visited = []
        /** @type {Array<Vec3>} */
        const mustVisit = [new Vec3(origin.x, origin.y - 1, origin.z).floored()]
        const maxSize = config.fencing.maxSize

        const isEmpty = (/** @type {{ type: number; }} */ block) => {
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
            const block = bot.bot.blocks.at(p)
            if (!block) { return }
            if (visited.find(other => other.p.equals(p))) { return }
            const node = { p: p, v: false }
            visited.push(node)
            if (isEmpty({ type: block.id })) { return }
            const above = bot.bot.blocks.at(p.offset(0, 1, 0))
            if (!isEmpty({ type: above.id })) {
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
         * @type {Record<number, import('prismarine-entity').Entity>}
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
