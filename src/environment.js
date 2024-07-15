const { Vec3 } = require("vec3")
const path = require('path')
const fs = require('fs')
const { replacer, reviver } = require("./serializing")
const { wrap, sleepG } = require("./utils/tasks")
const { filterHostiles } = require("./utils/other")
const { Block } = require("prismarine-block")
const { Item } = require("prismarine-item")
const MC = require("./mc")
const goto = require("./tasks/goto")
const { Chest } = require("mineflayer")

/**
 * @typedef {{
 *   position: Vec3;
 *   content: Record<string, number>;
 *   myItems: Record<string, number>;
 * }} SavedChest
 */

// @ts-ignore
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
     * @type {{ [username: string]: { time: number; position: Vec3; } }}
     */
    playerPositions

    /**
     * @private @readonly
     * @type {Array<SavedChest>}
     */
    chests

    /**
     * @readonly
     * @type {{ [entityId: number]: number }}
     */
    entitySpawnTimes

    /**
     * @readonly
     * @type {Array<{ position: Vec3; block: number; }>}
     */
    crops

    /**
     * @readonly
     * @type {{ [entityId: number]: number }}
     */
    entityHurtTimes

    /**
     * @private
     * @type {boolean}
     */
    shouldSave

    /**
     * @param {string} filePath
     */
    constructor(filePath) {
        this.bots = [ ]
        this.filePath = filePath

        this.crops = []
        this.chests = []
        this.playerPositions = {}
        this.entityHurtTimes = {}
        this.entitySpawnTimes = {}
        this.shouldSave = true

        if (!fs.existsSync(this.filePath)) {
            console.log(`[Environment]: File not found at "${this.filePath}"`)
            return
        }
        const data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'), reviver)
        this.playerPositions = data.playerPositions ?? this.playerPositions
        this.crops = data.crops ?? this.crops
        this.chests = data.chests ?? this.chests
        console.log(`[Environment]: Loaded`)

        setInterval(() => {
            if (this.shouldSave) {
                this.save()
            }
            this.shouldSave = this.bots.length > 0
        }, 10000)
    }

    /**
     * @private
     * @param {import('mineflayer').Player} player
     */
    __playerUpdated(player) {
        if (!player.entity?.position) { return }
        this.setPlayerPosition(player.username, player.entity.position)
    }

    /**
     * @private
     * @param {Block | null} oldBlock
     * @param {Block} newBlock
     */
    __blockUpdate(oldBlock, newBlock) {
        const isPlace = (!oldBlock || oldBlock.name === 'air')
        const isBreak = (!newBlock || newBlock.name === 'air')
        if (isPlace && isBreak) { return }
        if (isPlace && MC.cropBlocks.includes(newBlock?.name)) {
            let isSaved = false
            for (const crop of this.crops) {
                if (crop.position.equals(newBlock.position)) {
                    crop.block = newBlock.type
                    isSaved = true
                    break
                }
            }
            if (!isSaved) {
                this.crops.push({
                    position: newBlock.position.clone(),
                    block: newBlock.type,
                })
            }
        }
        if (isBreak && MC.cropBlocks.includes(oldBlock?.name)) {
            let isSaved = false
            for (const crop of this.crops) {
                if (crop.position.equals(oldBlock.position)) {
                    crop.block = oldBlock.type
                    isSaved = true
                    break
                }
            }
            if (!isSaved) {
                this.crops.push({
                    position: oldBlock.position.clone(),
                    block: oldBlock.type,
                })
            }
        }
    }

    /**
     * @private
     * @param {import("prismarine-entity").Entity} entity
     */
    __entityDead(entity) {
        if (this.entitySpawnTimes[entity.id]) {
            delete this.entitySpawnTimes[entity.id]
        }
    }

    /**
     * @private
     * @param {import("prismarine-entity").Entity} entity
     */
    __entitySpawn(entity) {
        this.entitySpawnTimes[entity.id] = performance.now()
    }

    /**
     * @param {import('./bruh-bot')} bot
     */
    addBot(bot) {
        bot.bot.on('playerUpdated', (player) => this.__playerUpdated(player))
        bot.bot.on('blockUpdate', (oldBlock, newBlock) => this.__blockUpdate(oldBlock, newBlock))
        bot.bot.on('entityDead', (entity) => this.__entityDead(entity))
        bot.bot.on('entitySpawn', (entity) => this.__entitySpawn(entity))
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
            console.warn(`[Environment]: Failed to remove ${bot.bot.username}`)
        }
    }

    /**
     * @param {import('./bruh-bot')} bot
     * @returns {import('./task').Task<void>}
     */
    *scanChests(bot) {
        console.log(`[Bot "${bot.bot.username}"]: Scanning chests ...`)
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
        console.log(`[Bot "${bot.bot.username}"]: Found ${chestPositions.length} chests`)
        for (const chestPosition of chestPositions) {
            try {
                yield* goto.task(bot, {
                    destination: chestPosition.clone(),
                    range: 2,
                })
                const chestBlock = bot.bot.blockAt(chestPosition)
                if (!chestBlock) {
                    console.warn(`[Bot "${bot.bot.username}"]: Chest disappeared while scanning`)
                    continue
                }
                if (chestBlock.name !== 'chest') {
                    console.warn(`[Bot "${bot.bot.username}"]: Chest replaced while scanning`)
                    continue
                }
                const chest = yield* wrap(bot.bot.openChest(chestBlock))
                /**
                 * @type {SavedChest | null}
                 */
                let found = null
                for (const _chest of this.chests) {
                    if (chestBlock.position.equals(_chest.position)) {
                        found = _chest
                    }
                }
                if (!found) {
                    found = {
                        position: chestBlock.position.clone(),
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
                console.warn(`[Bot "${bot.bot.username}"]: Error while scanning chests`, error)
            }
        }
        console.log(`[Bot "${bot.bot.username}"]: Chests scanned`)
    }

    /**
     * @param {import('./bruh-bot')} bot
     * @param {Chest} chest
     * @param {Vec3} chestPosition
     * @param {number} item
     * @param {number} count
     */
    *chestDeposit(bot, chest, chestPosition, item, count) {
        /**
         * @type {SavedChest | null}
         */
        let saved = null

        for (const _chest of this.chests) {
            if (_chest.position.equals(chestPosition)) {
                saved = _chest
                break
            }
        }

        if (!saved) {
            saved = {
                position: chestPosition.clone(),
                content: {},
                myItems: {},
            }
            this.chests.push(saved)
        }

        let actualCount

        if (count > 0) {
            actualCount = Math.min(count, bot.itemCount(item))
            yield* wrap(chest.deposit(item, null, actualCount))
        } else {
            actualCount = Math.min(-count, chest.containerCount(item, null))
            yield* wrap(chest.withdraw(item, null, actualCount))
        }

        saved.content = {}

        for (const item of chest.containerItems()) {
            saved.content[item.name] ??= 0
            saved.content[item.name] += item.count
        }

        saved.myItems[bot.mc.data.items[item].name] ??= 0
        if (count > 0) {
            saved.myItems[bot.mc.data.items[item].name] += actualCount
        } else {
            saved.myItems[bot.mc.data.items[item].name] -= actualCount
        }

        return actualCount
    }

    /**
     * @param {import('./bruh-bot')} bot
     * @param {Item | number | string} item
     * @returns {Array<{ position: Vec3; count: number; myCount: number; }>}
     */
    searchForItem(bot, item) {
        if (typeof item === 'number') {
            item = bot.mc.data.items[item].name
        } else if (typeof item === 'string') { } else {
            item = item.name
        }
        /**
         * @type {Array<{ position: Vec3; count: number; myCount: number; }>}
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

    save() {
        if (!fs.existsSync(path.dirname(this.filePath))) {
            fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
        }
        fs.writeFileSync(this.filePath, JSON.stringify({
            playerPositions: this.playerPositions,
            crops: this.crops,
            chests: this.chests,
        }, replacer, ' '))
    }

    /**
     * @param {import('./bruh-bot')} bot
     * @param {Vec3} point
     * @returns {Block | null}
     */
    getPlantableBlock(bot, point) {
        return bot.bot.findBlock({
            matching: [
                bot.mc.data.blocksByName['grass_block'].id,
                bot.mc.data.blocksByName['dirt'].id,
            ],
            point: point,
            maxDistance: 5,
            useExtraInfo: (/** @type {Block} */ block) => {
                const above = bot.bot.blockAt(block.position.offset(0, 1, 0))?.name
                return (
                    above === 'air' ||
                    above === 'short_grass' ||
                    above === 'tall_grass'
                )
            },
        })
    }

    /**
     * @param {import('./bruh-bot')} bot
     * @param {Vec3} point
     * @returns {Block | null}
     */
    getFreeFarmland(bot, point) {
        return bot.bot.findBlock({
            matching: [
                bot.mc.data.blocksByName['farmland'].id,
            ],
            point: point,
            maxDistance: 10,
            useExtraInfo: (/** @type {Block} */ block) => {
                const above = bot.bot.blockAt(block.position.offset(0, 1, 0)).name
                return (
                    above === 'air'
                )
            },
        })
    }

    /**
     * @param {import('./bruh-bot')} bot
     * @param {Vec3} farmPosition
     * @param {boolean} grown
     * @returns {Array<Vec3>}
     */
    getCrops(bot, farmPosition, grown) {
        return bot.bot.findBlocks({
            matching: [
                bot.mc.data.blocksByName['wheat'].id,
                bot.mc.data.blocksByName['carrots'].id,
                bot.mc.data.blocksByName['beetroots'].id,
                bot.mc.data.blocksByName['potatoes'].id,
                bot.mc.data.blocksByName['melon'].id,
                bot.mc.data.blocksByName['pumpkin'].id,
            ],
            useExtraInfo: (/** @type {Block} */ block) => {
                /** @type {number | null | undefined} */
                let goodAge = undefined
                switch (block.name) {
                    case 'wheat':
                    case 'carrots':
                    case 'potatoes':
                        goodAge = 7
                        break

                    case 'beetroots':
                        goodAge = 3
                        break

                    case 'melon':
                    case 'pumpkin':
                        goodAge = null
                        break

                    default:
                        return false
                }

                if (goodAge) {
                    const age = block.getProperties()['age']
                    if (!age) { return false }
                    if (typeof age !== 'number') { return false }

                    if (grown) {
                        return age >= goodAge
                    } else {
                        return age < goodAge
                    }
                } else {
                    if (grown) {
                        return true
                    } else {
                        return false
                    }
                }
            },
            point: farmPosition,
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
            if (!filterHostiles(entity)) { return false }

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
     * @returns {Vec3 | null}
     */
    getPlayerPosition(username, maxAge) {
        for (const bot of this.bots) {
            const player = bot.bot.players[username]
            if (player && player.entity && player.entity.position) {
                return player.entity.position
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
     * @param {Vec3} position
     */
    setPlayerPosition(username, position) {
        if (!position) {
            return
        }

        if (!this.playerPositions[username]) {
            this.playerPositions[username] = {
                time: Date.now(),
                position: position.clone(),
            }
        } else {
            const pos = this.playerPositions[username]
            pos.time = Date.now()
            pos.position.x = position.x
            pos.position.y = position.y
            pos.position.z = position.z
        }
    }
}
