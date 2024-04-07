const { error, sleep } = require('../utils')
const AsyncGoal = require('./async-base')
const { Goal } = require('./base')

/**
 * @extends {AsyncGoal<'full' | 'done'>}
 */
module.exports = class EatGoal extends AsyncGoal {
    /**
     * @param {Goal<any>} parent
     */
    constructor(parent) {
        super(parent)
    }

    /**
     * @override
     * @returns {import('./base').AsyncGoalReturn<'full' | 'done'>}
     * @param {import('../context')} context
     */
    async run(context) {
        super.run(context)

        if (context.bot.food > 19) {
            return { result: 'full' }
        }

        const foods = context.mc.filterFoods(context.bot.inventory.items())

        if (foods.length === 0) {
            return error(`${this.indent} I have no food`)
        }

        const food = foods[0]
        
        await context.bot.equip(food, 'hand')
        context.bot.deactivateItem()
        context.bot.activateItem(false)
        
        const eatStarted = performance.now()

        while (
            performance.now() - eatStarted < 1700 &&
            context.bot.inventory.slots[context.bot.getEquipmentDestSlot('hand')]?.name === food.name
        ) {
            await sleep(100)
        }

        return { result: 'done' }
    }

    /**
     * @param {import('../context')} context
     * @returns {boolean}
     */
    static hasFood(context) {
        const foods = context.mc.filterFoods(context.bot.inventory.items())

        if (foods.length === 0) {
            return false
        }

        return true
    }
    
    /**
     * @override
     * @param {import('../context')} context
     * @returns {string}
     */
    toReadable(context) {
        return `Eat`
    }
}
