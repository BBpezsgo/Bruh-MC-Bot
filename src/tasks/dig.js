const { Block } = require('prismarine-block')
const getMcData = require('minecraft-data')
const { wrap, sleepG } = require('../utils/tasks')
const goto = require('./goto')
const { Vec3 } = require('vec3')
const Vec3Dimension = require('../vec3-dimension')

/**
 * @type {import('../task').TaskDef<number, { block: Block; alsoTheNeighbors: boolean; }>}
 */
module.exports = {
    task: function*(bot, args) {
        if (bot.quietMode) {
            throw `Can't dig in quiet mode`
        }

        /**
         * @type {Array<Vec3>}
         */
        const digged = [ ]
        /**
         * @type {Block | null}
         */
        let current = args.block

        while (current) {
            yield

            try {
                if (bot.env.allocateBlock(bot.username, new Vec3Dimension(current.position, bot.dimension), 'dig')) {
                    console.log(`[Bot "${bot.username}"] Digging ${current.displayName} (${current.position}) ...`)
                
                    /** @type {{ has: boolean; item: getMcData.Item; } | null} */
                    let tool = null
                
                    if (!current.canHarvest(bot.bot.heldItem?.type ?? null)) {
                        console.log(`[Bot "${bot.username}"] Can't harvest ${current.displayName} with ${bot.bot.heldItem?.displayName ?? 'hand'} ...`)
                
                        tool = bot.mc.getCorrectTool(current, bot.bot)
                
                        if (!tool) {
                            throw `I don't know any tool that can dig ${current.displayName}`
                        }
                
                        if (!tool.has &&
                            !current.canHarvest(null)) {
                            // if (this.gatherTool) {
                            //     console.log(`[Bot "${bot.username}"] Gathering ${tool.item.displayName} ...`)
                            //     const toolGathered = await (new GatherItemGoal(this, tool.item.id, 1, false, true, false, true)).wait()
                            //     if ('error' in toolGathered) return error(toolGathered.error)
                            // } else {
                            //     bot.bot.chat(`I don't have a ${tool.item.displayName} to dig ${this.block.displayName} Should I try to get this tool?`)
                            //     const res = await bot.awaitYesNoResponse(10000)
                            //     if (!res) {
                            //         return error(`Response timed out`)
                            //     }
                            //     if (!res.message) {
                            //         return error(`Don't gather ${tool.item.displayName}`)
                            //     }
                            // 
                            //     bot.bot.chat(`Okay, gathering ${tool.item.displayName}`)
                            //     const toolGathered = await (new GatherItemGoal(this, tool.item.id, 1, false, true, false, true)).wait()
                            //     if ('error' in toolGathered) return error(toolGathered.error)
                            // }
                            throw 'No tool'
                        }
                    }
                
                    console.log(`[Bot "${bot.username}"] Tool:`, tool)
        
                    console.log(`[Bot "${bot.username}"] Goto block ...`)
                    yield* goto.task(bot, {
                        block: current.position,
                        movements: bot.cutTreeMovements,
                    })
                
                    if (tool?.has) {
                        console.log(`[Bot "${bot.username}"] Equipping "${tool.item.displayName}" ...`)
                        yield* wrap(bot.bot.equip(tool.item.id, 'hand'))
                    }
                
                    if (!current.canHarvest(bot.bot.heldItem?.type ?? null)) {
                        throw `Can't harvest ${current.displayName} with ${bot.bot.heldItem?.displayName ?? 'hand'}`
                    }
        
                    console.log(`[Bot "${bot.username}"] Digging ...`)
                    yield* wrap(bot.bot.dig(current))
                    digged.push(current.position.clone())
                } else {
                    console.log(`[Bot "${bot.username}"] Block will be digged by someone else, skipping`)
                }
            } catch (error) {
                if (!args.alsoTheNeighbors) {
                    throw error
                } else {
                    console.warn(error)
                }
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

        console.log(`[Bot "${bot.username}"] Waiting 500 ms ...`)
        yield* sleepG(500)

        for (let i = digged.length - 1; i >= 0; i--) {
            const position = digged[i]
            while (true) {
                yield
                const nearestEntity = bot.bot.nearestEntity((/** @type {import('prismarine-entity').Entity} */ entity) => (
                    entity.displayName === 'Item'
                ))
                if (!nearestEntity) { break }
                const distance = position.distanceTo(nearestEntity.position)
                if (distance < 1.5) {
                    console.log(`[Bot "${bot.username}"] Picking up item ...`)
                    yield* goto.task(bot, {
                        point: nearestEntity.position,
                        distance: 0,
                        movements: bot.cutTreeMovements,
                    })
                    
                    if (bot.isInventoryFull()) {
                        throw `Inventory is full`
                    }

                    console.log(`[Bot "${bot.username}"] Waiting 500 ms ...`)
                    yield* sleepG(500)
                } else {
                    break
                }
            }
        }
    
        return digged.length
    },
    id: function(args) {
        return `dig-${args.block.position.x}-${args.block.position.y}-${args.block.position.z}`
    },
    humanReadableId: function() {
        return `Digging`
    },
}
