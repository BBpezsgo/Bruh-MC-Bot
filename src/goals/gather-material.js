const AsyncGoal = require('./async-base')
const { Goal } = require('./base')
const DigGoal = require('./dig')
const { error, itemsDelta } = require('../utils')

/**
 * @extends {AsyncGoal<Array<{ name: string; delta: number; }>>}
 */
module.exports = class GatherMaterialGoal extends AsyncGoal {
    /**
     * @readonly
     * @type {string}
     */
    material

    /**
     * @param {Goal<any> | null} parent
     * @param {string} material
     */
    constructor(parent, material) {
        super(parent)

        this.material = material
    }

    /**
     * @override
     * @returns {import('./base').AsyncGoalReturn<Array<{ name: string; delta: number; }>>}
     * @param {import('../context')} context
     */
    async run(context) {
        super.run(context)

        const blocks = context.mc.getCorrectBlocks(this.material)

        if (blocks.length === 0) {
            return error(`${this.indent} I don't know what ${this.material} is`)
        }

        let foundBlock = context.bot.findBlock({
            matching: blocks.map(v => v.id),
            maxDistance: 64,
        })

        if (!foundBlock) {
            return error(`${this.indent} I can't find any ${this.material} nearby`)
        }

        let tool = context.mc.getCorrectTool(foundBlock, context.bot)

        if (tool && tool.has) {
            console.log(`${this.indent} Equiping ${tool.item.displayName} ...`)
            await context.bot.equip(tool.item.id, 'hand')
        }

        let count = 0
        const inventoryBefore = context.bot.inventory.items()

        while (foundBlock) {
            console.log(`${this.indent} Digging block ${foundBlock.displayName} ...`)
            const digged = await (new DigGoal(this, foundBlock, false)).wait()
            if ('error' in digged) return error(digged.error)
            if (!digged) {
                console.error(`${this.indent} Failed to dig ${foundBlock.displayName}`)
                break
            }

            foundBlock = context.bot.findBlock({
                matching: blocks.map(v => v.id),
                maxDistance: 2,
                point: foundBlock.position,
            })

            count++
            if (count > 10) {
                console.log(`${this.indent} Max digging reached`)
                break
            }
        }

        const inventoryAfter = context.bot.inventory.items()
        return { result: itemsDelta(inventoryBefore, inventoryAfter) }
    }
    
    /**
     * @override
     * @param {import('../context')} context
     * @returns {string}
     */
    toReadable(context) {
        return `Gather ${this.material}`
    }
}
