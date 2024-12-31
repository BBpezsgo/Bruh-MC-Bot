'use strict'

const { isItemEquals } = require('../utils/other')
const goto = require('./goto')

/**
 * @typedef {{
 *   inAir?: boolean;
 *   maxDistance: number;
 *   point?: import('vec3').Vec3;
 *   minLifetime?: number;
 *   items?: ReadonlyArray<import('../utils/other').ItemId>;
 * } | {
 *   item: import('prismarine-entity').Entity;
 * }} Args
 */

/**
 * @type {import('../task').TaskDef<void, Args> & {
 *   can: (bot: import('../bruh-bot'), args: Args) => boolean;
 *   getGoal: (item: import('prismarine-entity').Entity) => import('mineflayer-pathfinder/lib/goals').GoalBase;
 * }}
 */
module.exports = {
    task: function*(bot, args) {
        if (args.interrupt.isCancelled) { return }

        const nearest = (() => {
            if ('item' in args) { return args.item }
            return bot.env.getClosestItem(bot, args.items ? (item) => args.items.some(v => isItemEquals(v, item)) : null, args)
        })()
        if (!nearest) { throw `No items nearby` }

        const item = nearest.getDroppedItem()
        if (!item) { throw `This aint an item` }

        if (bot.isInventoryFull(item.name)) { throw `Inventory is full` }

        let isCollected = false
        /**
         * @param {import('prismarine-entity').Entity} collector
         * @param {import('prismarine-entity').Entity} collected
         */
        const listener = (collector, collected) => {
            if (collector.id !== bot.bot.entity.id) { return }
            if (collected.id !== nearest.id) { return }
            isCollected = true
            bot.bot.off('playerCollect', listener)
        }
        bot.bot.on('playerCollect', listener)

        try {
            yield* goto.task(bot, {
                goal: this.getGoal(nearest),
                options: {
                    timeout: 5000,
                    savePathError: true,
                },
                interrupt: args.interrupt,
            })
        } catch (error) {
            if (isCollected) { return }
            throw error
        } finally {
            bot.bot.off('playerCollect', listener)
        }

        if (!isCollected) {
            throw `Couldn't pick up the item`
        }
    },
    id: function(args) {
        if ('item' in args) {
            return `pickup-item-${args.item.id}`
        } else {
            return `pickup-items-${(args.point ? `${Math.round(args.point.x)}-${Math.round(args.point.y)}-${Math.round(args.point.z)}` : 'null')}-${args.inAir}-${args.maxDistance}-${args.minLifetime}`
        }
    },
    humanReadableId: function(args) {
        if ('item' in args) {
            return `Picking up an item`
        } else {
            return `Picking up items`
        }
    },
    definition: 'pickupItem',
    can: function(bot, args) {
        const nearest = (() => {
            if ('item' in args) { return args.item }
            return bot.env.getClosestItem(bot, args.items ? (item) => args.items.some(v => isItemEquals(v, item)) : null, args)
        })()

        if (!nearest) return false

        const item = nearest.getDroppedItem()
        if (!item) return false

        if (bot.isInventoryFull(item.name)) return false

        const goal = this.getGoal(nearest)
        if (bot.memory.isGoalUnreachable(goal)) return false

        return true
    },
    getGoal: function(item) {
        return {
            isValid: () => item.isValid,
            hasChanged: () => false,
            isEnd: node => node.distanceTo(item.position.floored()) <= 0,
        }
    },
}
