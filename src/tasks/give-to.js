const { sleepG, wrap } = require('../utils/tasks')
const goto = require('./goto')

/**
 * @type {import('../task').TaskDef<void, { player: string; items: ReadonlyArray<{ count: number; name: string; }> }>}
 */
module.exports = {
    task: function*(bot, args) {
        if (bot.bot.inventory.items().length === 0) {
            throw `I don't have anything`
        }

        const target = bot.env.getPlayerPosition(args.player)

        if (!target) {
            throw `Can't find ${args.player}`
        }

        yield* goto.task(bot, {
            destination: target.clone(),
            range: 2,
            avoidOccupiedDestinations: true,
        })

        yield* wrap(bot.bot.lookAt(target.offset(0, 1, 0)))
        
        let tossedSomething = false

        for (const itemToGive of args.items) {
            const has = bot.bot.inventory.count(bot.mc.data.itemsByName[itemToGive.name].id, null)
            if (!has) { continue }
            const countCanGive = Math.min(has, itemToGive.count)
            yield* wrap(bot.bot.toss(bot.mc.data.itemsByName[itemToGive.name].id, null, countCanGive))
            tossedSomething = true
            yield* sleepG(100)
        }

        if (!tossedSomething) {
            throw `Don't have anything`
        }
    },
    id: function(args) {
        return `give-items-${args.player}`
    },
    humanReadableId: function(args) {
        return `Giving items to ${args.player}`
    },
}
