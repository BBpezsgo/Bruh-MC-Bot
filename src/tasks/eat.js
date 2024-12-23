'use strict'

const { wrap, sleepTicks } = require('../utils/tasks')

/**
 * @type {import('../task').TaskDef<'ok' | 'full', {
 *   sortBy?: 'foodPoints' | 'saturation';
 *   includeRaw?: boolean;
 * }>}
 */
module.exports = {
    task: function*(bot, args) {
        if (bot.quietMode) {
            throw `Can't eat in quiet mode`
        }
    
        if (bot.bot.food >= 20) {
            return 'full'
        }
    
        const foods = bot.mc.filterFoods(bot.bot.inventory.items(), args.sortBy ?? 'foodPoints', args.includeRaw ?? false)

        if (foods.length === 0) {
            throw `I have no food`
        }
    
        const food = foods[0]
        
        yield* wrap(bot.bot.equip(food, 'hand'))
        bot.deactivateHand()
        bot.activateHand('right')
        
        const eatStarted = performance.now()
        const eatTime = (food.name === 'dried_kelp') ? (900 /* 0.865 */) : (1700 /* 1610 */)
    
        while (
            performance.now() - eatStarted < eatTime &&
            bot.bot.inventory.slots[bot.bot.getEquipmentDestSlot('hand')]?.name === food.name
        ) {
            yield* sleepTicks()
        }
    
        return 'ok'
    },
    id: 'eat',
    humanReadableId: `Eating`,
    definition: 'eat',
}
