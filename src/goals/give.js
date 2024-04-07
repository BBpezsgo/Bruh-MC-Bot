const AsyncGoal = require('./async-base')
const { Goal } = require('./base')
const GotoPlayerGoal = require('./goto-player')
const getMcData = require('minecraft-data')
const { error } = require('../utils')

/**
 * @extends {AsyncGoal<number>}
 */
module.exports = class GiveGoal extends AsyncGoal {
    /**
     * @type {string}
     */
    player

    /**
     * @type {getMcData.Item}
     */
    item

    /**
     * @type {number}
     */
    count

    /**
     * @param {Goal<any>} parent
     * @param {string} player
     * @param {getMcData.Item} item
     * @param {number} count
     */
    constructor(parent, player, item, count ) {
        super(parent)
        
        this.player = player
        this.item = item
        this.count = count
    }

    /**
     * @override
     * @returns {import('./base').AsyncGoalReturn<number>}
     * @param {import('../context')} context
     */
    async run(context) {
        super.run(context)
        
        let items = context.bot.inventory.items()
        if (items.length === 0) {
            return error(`${this.indent} Don't have anything`)
        }

        {
            const subresult = await (new GotoPlayerGoal(this, this.player, 2, context.restrictedMovements)).wait()
            if ('error' in subresult) return error(subresult.error)
        }

        let target = context.bot.players[this.player]?.entity

        if (!target) {
            return error(`${this.indent} Can't find ${this.player}`)
        }

        await context.bot.lookAt(target.position.offset(0, 1, 0))
        
        if (!context.searchItem(this.item.id)) {
            return error(`${this.indent} I don't have ${this.item.displayName}`)
        }

        {
            const subresult = await (new GotoPlayerGoal(this, this.player, 2, context.restrictedMovements)).wait()
            if ('error' in subresult) return error(subresult.error)
        }

        target = context.bot.players[this.player]?.entity

        if (!target) {
            return error(`${this.indent} Can't find ${this.player}`)
        }

        await context.bot.lookAt(target.position.offset(0, 1, 0))

        const inInventory = context.bot.inventory.count(this.item.id, null)
        let tossCount = 0

        if (inInventory > 0) {
            const _tossCount = Math.min(inInventory, this.count - tossCount)
            await context.bot.toss(this.item.id, null, _tossCount)
            tossCount += _tossCount
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
            if (tossCount >= this.count) {
                break
            }
            const item = context.bot.inventory.slots[context.bot.getEquipmentDestSlot(specialSlot)]
            if (item && item.type === this.item.id) {
                const _tossCount = Math.min(item.count, this.count - tossCount)
                if (_tossCount > 0) {
                    await context.bot.unequip(specialSlot)
                    await context.bot.toss(this.item.id, null, _tossCount)
                    tossCount += _tossCount
                }
            }
        }

        return { result: tossCount }
    }

    /**
     * @override
     * @param {import('../context')} context
     * @returns {string}
     */
    toReadable(context) {
        return `Give ${this.count} of ${this.item?.displayName ?? 'something'} to ${this.player}`
    }
}
