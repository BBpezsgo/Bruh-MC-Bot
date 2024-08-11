const { toArray } = require('../utils/other')
const { sleepG, wrap } = require('../utils/tasks')
const goto = require('./goto')

/**
 * @type {import('../task').TaskDef<void, { player: string; items: ReadonlyArray<{ count: number; name: string; }> }>}
 */
module.exports = {
    task: function*(bot, args) {
        if (toArray(bot.items()).length === 0) {
            throw `I don't have anything`
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
        
        let tossedSomething = false

        for (const itemToGive of args.items) {
            const has = bot.itemCount(itemToGive.name)
            if (!has) { continue }
            const countCanGive = Math.min(has, itemToGive.count)
            yield* bot.toss(itemToGive.name, countCanGive)
            tossedSomething = true
            yield* sleepG(100)
        }

        if (!tossedSomething) {
            if (args.items.length === 1) {
                throw `Don't have ${args.items[0].name}`
            } else {
                throw `Don't have anything`
            }
        }
    },
    id: function(args) {
        return `give-items-${args.player}`
    },
    humanReadableId: function(args) {
        return `Giving items to ${args.player}`
    },
}
