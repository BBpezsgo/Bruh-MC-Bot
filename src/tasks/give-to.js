'use strict'

const Freq = require('../utils/freq')
const { stringifyItem, isItemEquals } = require('../utils/other')
const { sleepG, wrap } = require('../utils/tasks')
const goto = require('./goto')

/**
 * @type {import('../task').TaskDef<Freq<import('../utils/other').ItemId>, {
 *   player: string;
 *   items: ReadonlyArray<{ item: import('../utils/other').ItemId; count: number;
 * }> }>}
 */
module.exports = {
    task: function*(bot, args) {
        const tossedMap = new Freq(isItemEquals)

        if (args.interrupt.isCancelled) { return tossedMap }
        if (bot.inventoryItems().isEmpty()) { throw `I don't have anything` }

        let canGiveSomething = false

        for (const itemToGive of args.items) {
            const has = bot.inventoryItemCount(null, itemToGive.item)
            if (!has) { continue }
            canGiveSomething = true
            break
        }

        if (!canGiveSomething) {
            if (args.items.length === 1) {
                throw `Don't have ${stringifyItem(args.items[0].item)}`
            } else {
                throw `Don't have anything`
            }
        }

        const target = bot.env.getPlayerPosition(args.player)

        if (!target) {
            throw `Can't find ${args.player}`
        }

        yield* goto.task(bot, {
            point: target,
            distance: 2,
            interrupt: args.interrupt,
        })

        if (args.interrupt.isCancelled) { return tossedMap }

        yield* wrap(bot.bot.lookAt(target.xyz(bot.dimension).offset(0, 0.2, 0), true))
        yield* sleepG(100)

        if (args.interrupt.isCancelled) { return tossedMap }

        for (const itemToGive of args.items) {
            if (args.interrupt.isCancelled) { break }

            const has = bot.inventoryItemCount(null, itemToGive.item)
            if (!has) { continue }
            const countCanGive = Math.min(has, itemToGive.count)
            const tossed = yield* bot.toss(itemToGive.item, countCanGive)
            tossedMap.add(itemToGive.item, tossed)
            yield* sleepG(100)
        }

        if (tossedMap.isEmpty) {
            if (args.items.length === 1) {
                throw `Don't have ${stringifyItem(args.items[0].item)}`
            } else {
                throw `Don't have anything`
            }
        }

        return tossedMap
    },
    id: function(args) {
        return `give-items-${args.player}`
    },
    humanReadableId: function(args) {
        return `Giving items to ${args.player}`
    },
    definition: 'giveTo',
}
