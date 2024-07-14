const { Block } = require('prismarine-block')
const getMcData = require('minecraft-data')
const { wrap, sleepG } = require('../utils')
const goto = require('./goto')

/**
 * @type {import('../task').TaskDef<'ok' | 'full', { block: Block }>}
 */
module.exports = {
    task: function*(bot, args) {
        if (bot.quietMode) {
            throw `Can't dig in quiet mode`
        }

        console.log(`[Bot "${bot.bot.username}"] Digging ${args.block.displayName} (${args.block.position}) ...`)
    
        /** @type {{ has: boolean; item: getMcData.Item; } | null} */
        let tool = null
    
        if (!args.block.canHarvest(bot.bot.heldItem?.type ?? null)) {
            console.log(`[Bot "${bot.bot.username}"] Can't harvest ${args.block.displayName} with ${bot.bot.heldItem?.displayName ?? 'hand'} ...`)
    
            tool = bot.mc.getCorrectTool(args.block, bot.bot)
    
            if (!tool) {
                throw `I don't know any tool that can dig ${args.block.displayName}`
            }
    
            if (!tool.has &&
                !args.block.canHarvest(null)) {
                // if (this.gatherTool) {
                //     console.log(`[Bot "${bot.bot.username}"] Gathering ${tool.item.displayName} ...`)
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
    
        console.log(`[Bot "${bot.bot.username}"] Tool:`, tool)

        console.log(`[Bot "${bot.bot.username}"] Goto block ...`)
        yield* goto.task(bot, {
            // block: args.block.position.clone(),
            destination: args.block.position.clone(),
            range: 3,
        })
    
        if (tool?.has) {
            console.log(`[Bot "${bot.bot.username}"] Equiping "${tool.item.displayName}" ...`)
            yield* wrap(bot.bot.equip(tool.item.id, 'hand'))
        }
    
        if (!args.block.canHarvest(bot.bot.heldItem?.type ?? null)) {
            throw `Can't harvest ${args.block.displayName} with ${bot.bot.heldItem?.displayName ?? 'hand'}`
        }
    
        console.log(`[Bot "${bot.bot.username}"] Digging ...`)
        yield* wrap(bot.bot.dig(args.block))
    
        console.log(`[Bot "${bot.bot.username}"] Waiting 500 ms ...`)
        yield* sleepG(500)

        while (true) {
            const nearestEntity = bot.bot.nearestEntity((/** @type {import('prismarine-entity').Entity} */ entity) => (
                entity.displayName === 'Item'
            ))
            if (!nearestEntity) { break }
            const distance = bot.bot.entity.position.distanceTo(nearestEntity.position)
            if (distance < 1.5) {
                console.log(`[Bot "${bot.bot.username}"] Picking up item ...`)
                yield* goto.task(bot, {
                    destination: nearestEntity.position.clone(),
                    range: .5,
                })
                
                console.log(`[Bot "${bot.bot.username}"] Waiting 500 ms ...`)
                yield* sleepG(500)
            } else {
                break
            }
        }
    
        return 'ok'
    },
    id: function(args) {
        return `dig-${args.block.position.x}-${args.block.position.y}-${args.block.position.z}`
    },
    humanReadableId: function(args) {
        return `Digging`
    },
}
