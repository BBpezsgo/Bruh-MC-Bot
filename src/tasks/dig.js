'use strict'

const { Block } = require('prismarine-block')
const getMcData = require('minecraft-data')
const { wrap, runtimeArgs } = require('../utils/tasks')
const goto = require('./goto')
const { Vec3 } = require('vec3')
const Vec3Dimension = require('../utils/vec3-dimension')
const { pickupItem } = require('../tasks')
const Freq = require('../utils/freq')
const { isItemEquals } = require('../utils/other')

/**
 * @type {import('../task').TaskDef<{
 *   digged: Array<Vec3>;
 *   itemsDelta: Freq<import('../utils/other').ItemId>;
 * }, {
 *   block: Vec3;
 *   alsoTheNeighbors: boolean;
 *   pickUpItems: boolean;
 *   skipIfAllocated: boolean;
 *   gotoOptions?: import('../managed-task').TaskArgs<import('./goto')>['options'];
 * }>}
 */
module.exports = {
    task: function*(bot, args) {
        if (!args.block) { return { digged: [], itemsDelta: new Freq(isItemEquals) } }

        if (bot.quietMode) { throw `Can't dig in quiet mode` }

        if (bot.env.getAllocatedBlock(new Vec3Dimension(args.block, bot.dimension))) {
            if (!args.skipIfAllocated) {
                yield* bot.env.waitUntilBlockIs(new Vec3Dimension(args.block, bot.dimension), 'dig')
            }
            return { digged: [], itemsDelta: new Freq(isItemEquals) }
        }

        /**
         * @type {Array<{ position: Vec3; loot: getMcData.BlockItemDrop[] }>}
         */
        const digged = []
        /**
         * @type {Block | null}
         */
        let current = bot.bot.blockAt(args.block)

        const itemsBefore = bot.inventoryItems().toArray().reduce((map, item) => {
            map.add(item.name, -item.count)
            return map
        }, new Freq(isItemEquals))

        let lastError = null
        let waitingForPlayersSince = performance.now()

        while (current) {
            yield

            if (performance.now() - waitingForPlayersSince < 5000) {
                let playerStandingOnBlock = false
                for (const player of Object.values(bot.bot.players)) {
                    if (!player.entity) continue
                    if (!player.entity.position.floored().offset(0, -1, 0).equals(current.position)) { continue }
                    const belowTargetBlock = bot.bot.blocks.at(current.position.offset(0, -1, 0))

                    let shouldMoveAway = false
                    if (!belowTargetBlock) {
                        shouldMoveAway = true
                    } else if (belowTargetBlock.name === 'air' ||
                        belowTargetBlock.name === 'cave_air' ||
                        belowTargetBlock.name === 'fire' ||
                        belowTargetBlock.name === 'water' ||
                        belowTargetBlock.name === 'lava' ||
                        belowTargetBlock.name === 'powder_snow' ||
                        belowTargetBlock.name === 'end_portal' ||
                        belowTargetBlock.name === 'nether_portal' ||
                        belowTargetBlock.name === 'magma_block' ||
                        belowTargetBlock.name === 'campfire' ||
                        belowTargetBlock.name === 'soul_campfire') {
                        shouldMoveAway = true
                    } else {
                        const [a, b, c, d] = [
                            bot.bot.blocks.at(current.position.offset(1, 1, 0)),
                            bot.bot.blocks.at(current.position.offset(-1, 1, 0)),
                            bot.bot.blocks.at(current.position.offset(0, 1, 1)),
                            bot.bot.blocks.at(current.position.offset(0, 1, -1)),
                        ]
                        if (!a && !b && !c && !d) {
                            shouldMoveAway = true
                        } else if (
                            (a.name !== 'air' && a.name !== 'cave_air') &&
                            (b.name !== 'air' && b.name !== 'cave_air') &&
                            (c.name !== 'air' && c.name !== 'cave_air') &&
                            (d.name !== 'air' && d.name !== 'cave_air')) {
                            shouldMoveAway = true
                        }
                    }

                    if (!shouldMoveAway) continue

                    if (player.username === bot.username) {
                        yield* goto.task(bot, {
                            flee: current.position.offset(0, 1, 0),
                            distance: performance.now() - waitingForPlayersSince < 1000 ? 1 : 3,
                            ...runtimeArgs(args),
                        })
                    }

                    playerStandingOnBlock = true
                }

                if (playerStandingOnBlock) { continue }
            } else {
                throw `Someone standing on the block I want to dig`
            }

            waitingForPlayersSince = performance.now()

            const cleanup = () => {
                bot.env.deallocateBlock(bot.username, new Vec3Dimension(current.position, bot.dimension))
            }

            /**
             * @param {import('../utils/interrupt').InterruptType} type
             */
            const onInterrupt = (type) => {
                if (type === 'cancel') {
                    cleanup()
                }
            }

            args.interrupt.on(onInterrupt)
            try {
                if (bot.env.allocateBlock(bot.username, new Vec3Dimension(current.position, bot.dimension), 'dig')) {
                    // console.log(`[Bot "${bot.username}"] Digging ${current.displayName} ${current.position} ...`)

                    /** @type {{ has: boolean; item: getMcData.Item; } | null} */
                    let tool = null

                    if (!current.canHarvest(null)) {
                        tool = bot.mc.getCorrectTool(current, bot.bot)
                        if (!tool) { throw `I don't know any tool that can dig ${current.displayName}` }

                        if (!tool.has) { throw 'No tool' }
                    }

                    // console.log(`[Bot "${bot.username}"] Tool:`, tool)

                    // console.log(`[Bot "${bot.username}"] Goto block ...`)
                    yield* goto.task(bot, {
                        block: current.position,
                        options: args.gotoOptions,
                        ...runtimeArgs(args),
                    })

                    if (tool?.has) {
                        // console.log(`[Bot "${bot.username}"] Equipping "${tool.item.displayName}" ...`)
                        yield* bot.equip(tool.item.name, 'hand')
                    } else {
                        yield* wrap(bot.tryUnequip(), args.interrupt)
                    }

                    if (!current.canHarvest(bot.bot.heldItem?.type ?? null)) {
                        throw `Can't dig ${current.displayName} with ${bot.bot.heldItem?.displayName ?? 'hand'}`
                    }

                    if (current.name === 'air') {
                        throw `Can't dig air`
                    }

                    const loot = bot.mc.registry.blockLoot[current.name]?.drops ?? []

                    // console.log(`[Bot "${bot.username}"] Digging ...`)
                    yield* wrap(bot.bot.dig(current, true), args.interrupt)
                    digged.push({
                        position: current.position.clone(),
                        loot: loot,
                    })
                }
            } catch (error) {
                if (!args.alsoTheNeighbors) {
                    throw error
                } else {
                    console.warn(error)
                }
                lastError = error
            } finally {
                args.interrupt.off(onInterrupt)
                cleanup()
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
                if (args.interrupt.isCancelled) { break }

                const position = digged[i]
                while (true) {
                    yield

                    if (args.interrupt.isCancelled) { break }

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
                                silent: true,
                                ...runtimeArgs(args),
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
            map.add(item.name, item.count)
            return map
        }, itemsBefore) : new Freq(isItemEquals)

        if (digged.length === 0 && lastError) {
            throw lastError
        }

        return {
            digged: digged.map(v => v.position),
            itemsDelta: itemsDelta,
        }
    },
    id: function(args) {
        return `dig-${args.block.x}-${args.block.y}-${args.block.z}`
    },
    humanReadableId: `Digging`,
    definition: 'dig',
}
