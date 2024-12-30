'use strict'

const { Item } = require('prismarine-item')
const { wrap, sleepTicks } = require('../utils/tasks')

/**
 * @type {import('../task').TaskDef<'ok' | 'full', {
 *   sortBy?: 'foodPoints' | 'saturation';
 *   includeRaw?: boolean;
 * } | {
 *   food: Item;
 * }>}
 */
module.exports = {
    task: function*(bot, args) {
        if (args.cancellationToken.isCancelled) { return }
        if (bot.quietMode) { throw `Can't eat in quiet mode` }

        let food = null
        if ('food' in args) {
            food = args.food
        } else {
            const foods = bot.mc.filterFoods(bot.bot.inventory.items(), args.sortBy ?? 'foodPoints', args.includeRaw ?? false)
            if (foods.length === 0) { throw `I have no food` }
            food = foods[0]
        }

        if (bot.bot.food >= 20 &&
            food.name !== 'chorus_fruit') { return 'full' }

        yield* wrap(bot.bot.equip(food, 'hand'))

        const eatStarted = performance.now()
        const eatTime = (food.name === 'dried_kelp') ? (900 /* 0.865 */) : (1700 /* 1610 */)

        const cancelEat = () => { bot.deactivateHand() }

        bot.deactivateHand()
        bot.activateHand('right')
        args.cancellationToken.once(cancelEat)

        while (
            performance.now() - eatStarted < eatTime &&
            bot.bot.inventory.slots[bot.bot.getEquipmentDestSlot('hand')]?.name === food.name &&
            !args.cancellationToken.isCancelled
        ) {
            yield* sleepTicks()
        }

        args.cancellationToken.off(cancelEat)

        return 'ok'
    },
    id: 'eat',
    humanReadableId: `Eating`,
    definition: 'eat',
}
