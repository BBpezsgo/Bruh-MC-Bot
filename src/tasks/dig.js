const { Block } = require('prismarine-block')
const getMcData = require('minecraft-data')
const { wrap } = require('../utils/tasks')
const goto = require('./goto')
const { Vec3 } = require('vec3')
const Vec3Dimension = require('../vec3-dimension')
const { pickupItem } = require('../tasks')

/**
 * @type {import('../task').TaskDef<{
 *   digged: Array<Vec3>;
 *   itemsDelta: Record<string, number>;
 * }, {
 *   block: Block;
 *   alsoTheNeighbors: boolean;
 *   pickUpItems: boolean;
 * }>}
 */
module.exports = {
    task: function*(bot, args) {
        if (!args.block) { return { digged: [], itemsDelta: {} } }

        if (bot.quietMode) { throw `Can't dig in quiet mode` }

        /**
         * @type {Array<{ position: Vec3; loot: getMcData.BlockItemDrop[] }>}
         */
        const digged = []
        /**
         * @type {Block | null}
         */
        let current = args.block

        const itemsBefore = bot.inventoryItems().toArray().reduce((map, item) => {
            if (!map[item.name]) { map[item.name] = 0 }
            map[item.name] -= item.count
            return map
        }, /** @type {Record<string, number>} */({}))

        let lastError = null

        while (current) {
            yield

            if (bot.bot.entity.position.floored().offset(0, -1, 0).equals(current.position.floored())) {
                yield* goto.task(bot, {
                    flee: current.position.offset(0, 1, 0),
                    distance: 1,
                })
            }

            try {
                if (bot.env.allocateBlock(bot.username, new Vec3Dimension(current.position, bot.dimension), 'dig')) {
                    // console.log(`[Bot "${bot.username}"] Digging ${current.displayName} ${current.position} ...`)

                    /** @type {{ has: boolean; item: getMcData.Item; } | null} */
                    let tool = null

                    if (!current.canHarvest(bot.bot.heldItem?.type ?? null)) {
                        console.warn(`[Bot "${bot.username}"] Can't harvest ${current.displayName} with ${bot.bot.heldItem?.displayName ?? 'hand'} ...`)

                        tool = bot.mc.getCorrectTool(current, bot.bot)

                        if (!tool) {
                            throw `I don't know any tool that can dig ${current.displayName}`
                        }

                        if (!tool.has &&
                            !current.canHarvest(null)) {
                            throw 'No tool'
                        }
                    }

                    // console.log(`[Bot "${bot.username}"] Tool:`, tool)

                    // console.log(`[Bot "${bot.username}"] Goto block ...`)
                    yield* goto.task(bot, {
                        block: current.position,
                        movements: bot.cutTreeMovements,
                    })

                    if (tool?.has) {
                        // console.log(`[Bot "${bot.username}"] Equipping "${tool.item.displayName}" ...`)
                        yield* wrap(bot.bot.equip(tool.item.id, 'hand'))
                    }

                    if (!current.canHarvest(bot.bot.heldItem?.type ?? null)) {
                        throw `Can't harvest ${current.displayName} with ${bot.bot.heldItem?.displayName ?? 'hand'}`
                    }

                    const loot = bot.mc.registry.blockLoot[current.name].drops

                    // console.log(`[Bot "${bot.username}"] Digging ...`)
                    yield* wrap(bot.bot.dig(current))
                    digged.push({
                        position: current.position.clone(),
                        loot: loot,
                    })
                } else {
                    console.log(`[Bot "${bot.username}"] Block will be digged by someone else, skipping`)
                }
            } catch (error) {
                if (!args.alsoTheNeighbors) {
                    throw error
                } else {
                    console.warn(error)
                }
                lastError = error
            } finally {
                if (args.alsoTheNeighbors) {
                    current = bot.bot.findBlock({
                        point: current.position.clone(),
                        matching: current.type,
                        count: 1,
                        maxDistance: 1.9,
                    })
                } else {
                    current = null
                }
            }
        }

        if (args.pickUpItems) {
            for (let i = digged.length - 1; i >= 0; i--) {
                const position = digged[i]
                while (true) {
                    yield
                    const nearestEntity = bot.bot.nearestEntity((/** @type {import('prismarine-entity').Entity} */ entity) => {
                        if (entity.name !== 'item') { return false }
                        const item = entity.getDroppedItem()
                        if (!item) { return false }
                        if (!position.loot.find(v => v.item === item.name)) { return false }
                        return true
                    })
                    if (!nearestEntity) { break }
                    const distance = position.position.distanceTo(nearestEntity.position)
                    if (distance < 1.5) {
                        if (bot.isInventoryFull()) {
                            throw `Inventory is full`
                        }

                        try {
                            yield* pickupItem.task(bot, {
                                item: nearestEntity,
                                inAir: true,
                                maxDistance: 16,
                                minLifetime: 0,
                                silent: true,
                            })
                        } catch (error) {
                            // console.warn(error)
                        }
                    } else {
                        break
                    }
                }
            }
        }

        const itemsDelta = args.pickUpItems ? bot.inventoryItems().toArray().reduce((map, item) => {
            if (!map[item.name]) { map[item.name] = 0 }
            map[item.name] += item.count
            return map
        }, itemsBefore) : {}

        if (digged.length === 0 && lastError) {
            throw lastError
        }

        return {
            digged: digged.map(v => v.position),
            itemsDelta: itemsDelta,
        }
    },
    id: function(args) {
        return `dig-${args.block.position.x}-${args.block.position.y}-${args.block.position.z}`
    },
    humanReadableId: `Digging`,
    definition: 'dig',
}
