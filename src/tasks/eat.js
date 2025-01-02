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
        if (bot.quietMode) { throw `Can't eat in quiet mode` }

        let food = null
        if ('food' in args) {
            food = args.food
        } else {
            const foods = bot.mc.filterFoods(bot.bot.inventory.items(), args.sortBy ?? 'foodPoints', args.includeRaw ?? false)
            if (foods.length === 0) { throw `I have no food` }
            food = foods[0]
        }

        if (!food) { throw `No food` }

        if (bot.bot.food >= 20 &&
            food.name !== 'chorus_fruit') { return 'full' }

        yield* wrap(bot.bot.equip(food, 'hand'))

        const eatStarted = performance.now()
        const eatTime = (food.name === 'dried_kelp') ? (900 /* 0.865 */) : (1700 /* 1610 */)

        let isInterrupted = false

        /**
         * @param {'interrupt' | 'cancel'} type
         */
        const interruptEating = (type) => {
            bot.deactivateHand()
            if (type === 'interrupt') isInterrupted = true
        }

        args.interrupt.on(interruptEating)

        while (true) {
            bot.deactivateHand()
            bot.activateHand('right')
            isInterrupted = false

            while (
                performance.now() - eatStarted < eatTime &&
                bot.bot.inventory.slots[bot.bot.getEquipmentDestSlot('hand')]?.name === food.name &&
                !args.interrupt.isCancelled
            ) {
                yield* sleepTicks()
            }

            if (isInterrupted) continue
            else break
        }

        args.interrupt.off(interruptEating)

        return 'ok'
    },
    id: 'eat',
    humanReadableId: `Eating`,
    definition: 'eat',
}
