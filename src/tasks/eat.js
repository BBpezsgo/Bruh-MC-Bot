'use strict'

const { Item } = require('prismarine-item')
const { wrap, sleepTicks } = require('../utils/tasks')
const GameError = require('../errors/game-error')
const PermissionError = require('../errors/permission-error')

/**
 * @type {import('../task').TaskDef<'ok' | 'full', {
 *   sortBy?: 'foodPoints' | 'saturation';
 *   includeRaw?: boolean;
 *   includeBadEffects?: boolean;
 *   includeSideEffects?: boolean;
 *   includeLocked?: boolean;
 * } | {
 *   food: Item;
 * }> & {
 *   can: (bot: import('../bruh-bot'), args: {
 *     includeRaw?: boolean;
 *     includeBadEffects?: boolean;
 *     includeSideEffects?: boolean;
 *     includeLocked?: boolean;
 *   } | {
 *     food: Item;
 *   }) => boolean;
 * }}
 */
module.exports = {
    task: function*(bot, args) {
        if (bot.quietMode) { throw new PermissionError(`Can't eat in quiet mode`) }

        let food = null
        if ('food' in args) {
            food = args.food
        } else {
            const foods = bot.mc.filterFoods(bot.bot.inventory.items().filter(v => args.includeLocked ? true : !bot.inventory.isItemLocked(v)), {
                sortBy: args.sortBy,
                includeRaw: args.includeRaw,
                includeBadEffects: args.includeBadEffects,
                includeSideEffects: args.includeSideEffects,
            })
            if (foods.length === 0) { throw new GameError(`I have no food`) }
            food = foods[0]
        }

        if (bot.bot.food >= 20 &&
            food.name !== 'chorus_fruit') { return 'full' }

        yield* wrap(bot.bot.equip(food, 'hand'), args.interrupt)

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
    can: (bot, args) => {
        if (bot.quietMode) return false

        let food = null
        if ('food' in args) {
            food = args.food
        } else {
            const foods = bot.mc.filterFoods(bot.bot.inventory.items().filter(v => args.includeLocked ? true : !bot.inventory.isItemLocked(v)), {
                includeRaw: args.includeRaw,
                includeBadEffects: args.includeBadEffects,
                includeSideEffects: args.includeSideEffects,
            })
            if (foods.length === 0) { return false }
            food = foods[0]
        }

        if (!food) return false

        return true
    },
}
