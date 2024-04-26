const { Goal } = require('./base')
const { Block } = require('prismarine-block')
const getMcData = require('minecraft-data')
const GatherItemGoal = require('./gather-item')
const Wait = require('./wait')
const GotoGoal = require('./goto')
const GotoBlockGoal = require('./goto-block')
const AsyncGoal = require('./async-base')
const { error, costDepth } = require('../utils')

/**
 * @extends {AsyncGoal<boolean>}
 */
module.exports = class DigGoal extends AsyncGoal {
    /**
     * @type {Block}
     */
    block

    /**
     * @readonly
     * @type {boolean}
     */
    gatherTool

    /**
     * @param {import('../context')} context
     * @param {Goal<any>} parent
     * @param {Block} block
     * @param {boolean} gatherTool
     */
    constructor(context, parent, block, gatherTool) {
        super(parent)

        context.bot.viewer.drawBoxGrid(this.GUID, block.position)

        this.block = block
        this.gatherTool = gatherTool
    }

    /**
     * @override
     * @returns {import('./base').AsyncGoalReturn<boolean>}
     * @param {import('../context')} context
     */
    async run(context) {
        super.run(context)

        if (context.quietMode) {
            return error(`${this.indent} Can't dig in quiet mode`)
        }

        console.log(`[Bot "${context.bot.username}"] ${this.indent} Digging ${this.block.displayName} (${this.block.position}) ...`)
    
        /** @type {{ has: boolean; item: getMcData.Item; } | null} */
        let tool = null
    
        if (!this.block.canHarvest(context.bot.heldItem?.type ?? null)) {
            console.log(`[Bot "${context.bot.username}"] ${this.indent} Can't harvest ${this.block.displayName} with ${context.bot.heldItem?.displayName ?? 'hand'} ...`)
    
            tool = context.mc.getCorrectTool(this.block, context.bot)
    
            if (!tool) {
                return error(`[Bot "${context.bot.username}"] ${this.indent} I don't know any tool that can dig ${this.block.displayName}`)
            }
    
            if (!tool.has &&
                !this.block.canHarvest(null)) {
                if (this.gatherTool) {
                    console.log(`[Bot "${context.bot.username}"] ${this.indent} Gathering ${tool.item.displayName} ...`)
                    const toolGathered = await (new GatherItemGoal(this, tool.item.id, 1, false, true, false)).wait()
                    if ('error' in toolGathered) return error(toolGathered.error)
                } else {
                    context.bot.chat(`I don't have a ${tool.item.displayName} to dig ${this.block.displayName} Should I try to get this tool?`)
                    const res = await context.awaitYesNoResponse(10000)
                    if (!res) {
                        return error(`${this.indent} Response timed out`)
                    }
                    if (!res.message) {
                        return error(`${this.indent} Don't gather ${tool.item.displayName}`)
                    }
    
                    context.bot.chat(`Okay, gathering ${tool.item.displayName}`)
                    const toolGathered = await (new GatherItemGoal(this, tool.item.id, 1, false, true, false)).wait()
                    if ('error' in toolGathered) return error(toolGathered.error)
                }
            }
        }
    
        console.log(`[Bot "${context.bot.username}"] ${this.indent} Tool:`, tool)

        {
            console.log(`[Bot "${context.bot.username}"] ${this.indent} Goto block ...`)
            const subresult = await (new GotoBlockGoal(this, this.block.position.clone(), context.restrictedMovements)).wait()
            if ('error' in subresult) return error(subresult.error)
        }
        
        if (tool?.has) {
            console.log(`[Bot "${context.bot.username}"] ${this.indent} Equiping "${tool.item.displayName}" ...`)
            await context.bot.equip(tool.item.id, 'hand')
        }
    
        if (!this.block.canHarvest(context.bot.heldItem?.type ?? null)) {
            return error(`${this.indent} Can't harvest ${this.block.displayName} with ${context.bot.heldItem?.displayName ?? 'hand'}`)
        }
    
        console.log(`[Bot "${context.bot.username}"] ${this.indent} Digging ...`)
        await context.bot.dig(this.block)
    
        {
            const subresult = await (new Wait(this, 500)).wait()
            if ('error' in subresult) return error(subresult.error)
        }
    
        while (true) {
            const nearestEntity = context.bot.nearestEntity(entity => (
                entity.displayName === 'Item'
            ))
            if (!nearestEntity) { break }
            const distance = context.bot.entity.position.distanceTo(nearestEntity.position)
            if (distance < 1.5) {
                console.log(`[Bot "${context.bot.username}"] ${this.indent} Picking up item ...`)
                {
                    const subresult = await (new GotoGoal(this, nearestEntity.position.clone(), .5, context.permissiveMovements)).wait()
                    if ('error' in subresult) return error(subresult.error)
                }
                {
                    const subresult = await (new Wait(this, 500)).wait()
                    if ('error' in subresult) return error(subresult.error)
                }
            } else {
                break
            }
        }
    
        return { result: true }
    }

    /**
     * @override
     * @param {import("../context")} context
     */
    cleanup(context) {
        context.bot.viewer.erase(this.GUID)
    }

    /**
     * @param {import('../context')} context
     * @param {Block} block
     * @param {boolean} gatherTool
     * @param {number} depth
     */
    static async cost(context, block, gatherTool, depth) {
        if (depth > costDepth) {
            return Infinity
        }

        /** @type {{ has: boolean; item: getMcData.Item; } | null} */
        let tool = null

        tool = context.mc.getCorrectTool(block, context.bot)

        if (!tool) {
            return Infinity
        }

        const distance = context.bot.entity.position.distanceTo(block.position)
        
        if (!tool.has && !block.canHarvest(null)) {
            if (!gatherTool) {
                return Infinity
            }
            
            return distance + block.hardness + await GatherItemGoal.itemCost(context, tool.item.id, 1, gatherTool, depth + 1)
        }

        return distance + block.hardness
    }

    /**
     * @override
     * @param {import('../context')} context
     * @returns {string}
     */
    toReadable(context) {
        return `Dig ${this.block?.displayName ?? 'something'}`
    }
}
