const { sleepG, wrap } = require('../utils/tasks')
const goto = require('./goto')

/**
 * @type {import('../task').TaskDef<'ok', { player: string; }>}
 */
module.exports = {
    task: function*(bot, args) {
        let items = bot.bot.inventory.items()
        if (items.length === 0) {
            throw `I don't have anything`
        }

        const target = bot.env.getPlayerPosition(args.player)

        if (!target) {
            throw `Can't find ${args.player}`
        }

        yield* goto.task(bot, {
            destination: target.clone(),
            range: 2,
        })

        yield* wrap(bot.bot.lookAt(target.offset(0, 1, 0)))
        
        let tossedSomething = false

        {
            items = bot.bot.inventory.items()
            while (items.length > 0) {
                yield
                
                for (const item of items) {
                    yield* wrap(bot.bot.tossStack(item))
                    tossedSomething = true
                    yield* sleepG(100)
                }
                items = bot.bot.inventory.items()
            }
        }

        /** @type {ReadonlyArray<import('mineflayer').EquipmentDestination>} */
        const specialSlots = [
            'head',
            'torso',
            'legs',
            'feet',
            'hand',
            'off-hand',
        ]
        
        for (const specialSlot of specialSlots) {
            const item = bot.bot.inventory.slots[bot.bot.getEquipmentDestSlot(specialSlot)]
            if (item) {
                yield* wrap(bot.bot.unequip(specialSlot))
                yield* wrap(bot.bot.toss(item.type, null, item.count))
                tossedSomething = true
            }
        }

        if (!tossedSomething) {
            throw `Don't have anything`
        }

        return 'ok'
    },
    id: function(args) {
        return `give-all-${args.player}`
    },
    humanReadableId: function(args) {
        return `Giving everything to ${args.player}`
    },
}