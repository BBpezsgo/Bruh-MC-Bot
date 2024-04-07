const AsyncGoal = require('./async-base')
const { Goal } = require('./base')
const GotoPlayerGoal = require('./goto-player')
const Wait = require('./wait')
const { error } = require('../utils')

module.exports = class GiveAllGoal extends AsyncGoal {
    /**
     * @type {string}
     */
    player

    /**
     * @param {Goal<any>} parent
     * @param {string} player
     */
    constructor(parent, player) {
        super(parent)
        
        this.player = player
    }

    /**
     * @override
     * @returns {import('./base').AsyncGoalReturn<true>}
     * @param {import('../context')} context
     */
    async run(context) {
        super.run(context)
        
        let items = context.bot.inventory.items()
        if (items.length === 0) {
            return error(`${this.indent} I don't have anything`)
        }

        const subresult = await (new GotoPlayerGoal(this, this.player, 2, context.restrictedMovements)).wait()
        if ('error' in subresult) return error(subresult.error)

        const target = context.bot.players[this.player]?.entity

        if (!target) {
            return error(`${this.indent} Can't find ${this.player}`)
        }

        await context.bot.lookAt(target.position.offset(0, 1, 0))
        
        let tossedSomething = false

        {
            items = context.bot.inventory.items()
            while (items.length > 0) {
                for (const item of items) {
                    await context.bot.tossStack(item)
                    tossedSomething = true
                    const subresult = await (new Wait(this, 100)).wait()
                    if ('error' in subresult) return error(subresult.error)
                }
                items = context.bot.inventory.items()
            }
        }

        /** @type {Array<import('mineflayer').EquipmentDestination>} */
        const specialSlots = [
            'head',
            'torso',
            'legs',
            'feet',
            'hand',
            'off-hand',
        ]
        
        for (const specialSlot of specialSlots) {
            const item = context.bot.inventory.slots[context.bot.getEquipmentDestSlot(specialSlot)]
            if (item) {
                await context.bot.unequip(specialSlot)
                await context.bot.toss(item.type, null, item.count)
                tossedSomething = true
            }
        }

        if (!tossedSomething) {
            return error(`${this.indent} Don't have anything`)
        }
        return { result: true }
    }

    /**
     * @override
     * @param {import('../context')} context
     * @returns {string}
     */
    toReadable(context) {
        return `Give everything to ${this.player}`
    }
}
