'use strict'

const { sleepG, wrap } = require('../utils/tasks')
const goto = require('./goto')

/**
 * @type {import('../task').TaskDef<void, { player: string; }>}
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
            point: target,
            distance: 2,
        })

        yield* wrap(bot.bot.lookAt(target.xyz(bot.dimension).offset(0, 1, 0)))
        
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
    },
    id: function(args) {
        return `give-all-${args.player}`
    },
    humanReadableId: function(args) {
        return `Giving everything to ${args.player}`
    },
    definition: 'giveAll',
}
