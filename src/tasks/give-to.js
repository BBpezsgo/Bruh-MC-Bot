const { toArray } = require('../utils/other')
const { sleepG, wrap } = require('../utils/tasks')
const goto = require('./goto')

/**
 * @type {import('../task').TaskDef<Record<string, number>, { player: string; items: ReadonlyArray<{ count: number; name: string; nbt?: import('../bruh-bot').NBT; }> }>}
 */
module.exports = {
    task: function*(bot, args) {
        if (toArray(bot.inventoryItems()).length === 0) {
            throw `I don't have anything`
        }

        let canGiveSomething = false

        for (const itemToGive of args.items) {
            const has = bot.inventoryItemCount(null, itemToGive)
            if (!has) { continue }
            canGiveSomething = true
            break
        }

        if (!canGiveSomething) {
            if (args.items.length === 1) {
                throw `Don't have ${args.items[0].name}`
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
        })

        yield* wrap(bot.bot.lookAt(target.xyz(bot.dimension).offset(0, 1, 0)))

        /** @type {Record<string, number>} */
        const tossedMap = {}

        for (const itemToGive of args.items) {
            const has = bot.inventoryItemCount(null, itemToGive)
            if (!has) { continue }
            const countCanGive = Math.min(has, itemToGive.count)
            yield* bot.toss(itemToGive.name, countCanGive)
            tossedMap[itemToGive.name] ??= 0
            tossedMap[itemToGive.name] += countCanGive
            yield* sleepG(100)
        }

        if (Object.keys(tossedMap).length === 0) {
            if (args.items.length === 1) {
                throw `Don't have ${args.items[0].name}`
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
