'use strict'

const { sleepG, wrap, runtimeArgs } = require('../utils/tasks')
const goto = require('./goto')

/**
 * @type {import('../task').TaskDef<void, {
 *   player: string;
 * }>}
 */
module.exports = {
    task: function*(bot, args) {
        if (args.interrupt.isCancelled) { return }

        let items = bot.bot.inventory.items()
        if (items.length === 0) { throw `I don't have anything` }

        const target = bot.env.getPlayerPosition(args.player)

        if (!target) { throw `Can't find ${args.player}` }

        yield* goto.task(bot, {
            point: target,
            distance: 2,
            ...runtimeArgs(args),
        })

        if (args.interrupt.isCancelled) { return }

        yield* wrap(bot.bot.lookAt(target.xyz(bot.dimension).offset(0, 1, 0), bot.instantLook), args.interrupt)

        let tossedSomething = false

        {
            items = bot.bot.inventory.items()
            while (items.length > 0) {
                yield

                for (const item of items) {
                    if (args.interrupt.isCancelled) { return }

                    yield* wrap(bot.bot.tossStack(item), args.interrupt)
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
            if (args.interrupt.isCancelled) { return }

            const item = bot.bot.inventory.slots[bot.bot.getEquipmentDestSlot(specialSlot)]
            if (item) {
                yield* wrap(bot.bot.unequip(specialSlot), args.interrupt)
                yield* wrap(bot.bot.toss(item.type, null, item.count), args.interrupt)
                tossedSomething = true
            }
        }

        if (!tossedSomething) { throw `Don't have anything` }
    },
    id: function(args) {
        return `give-all-${args.player}`
    },
    humanReadableId: function(args) {
        return `Giving everything to ${args.player}`
    },
    definition: 'giveAll',
}
