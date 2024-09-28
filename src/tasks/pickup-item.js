const goto = require('./goto')

/**
 * @typedef {{ inAir?: boolean; maxDistance?: number; point?: import('vec3').Vec3; minLifetime?: number; items?: ReadonlyArray<string>; } | { item: import('prismarine-entity').Entity }} Args
 */

/**
 * @type {import('../task').TaskDef<void, Args> & {
 *   can: (bot: import('../bruh-bot'), args: Args) => boolean;
 *   getGoal: (item: import('prismarine-physics').Entity) => import('mineflayer-pathfinder/lib/goals').GoalBase;
 * }}
 */
module.exports = {
    task: function*(bot, args) {
        const nearest = (() => {
            if ('item' in args) { return args.item }
            return bot.env.getClosestItem(bot, args.items ? (item) => args.items.includes(item.name) : null, args)
        })()

        if (!nearest) {
            throw `No items nearby`
        }

        const item = nearest.getDroppedItem()

        if (!item) {
            throw `This aint an item`
        }

        if (bot.isInventoryFull(item.name)) {
            throw `Inventory is full`
        }

        let isCollected = false
        /**
         * @param {import('prismarine-physics').Entity} collector
         * @param {import('prismarine-physics').Entity} collected
         */
        const listener = (collector, collected) => {
            if (collector.id !== bot.bot.entity.id) { return }
            const droppedItem = collected.getDroppedItem()
            if (droppedItem?.name && droppedItem.name !== item.name) { return }
            isCollected = true
            bot.bot.off('playerCollect', listener)
        }
        bot.bot.on('playerCollect', listener)

        try {
            yield* goto.task(bot, {
                goal: this.getGoal( nearest),
                options: {
                    // savePathError: true,
                }
            })
        } catch (error) {
            if (isCollected) { return }
            bot.bot.off('playerCollect', listener)
            throw error
        }
        if (!isCollected) {
            bot.bot.off('playerCollect', listener)
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
            return bot.env.getClosestItem(bot, args.items ? (item) => args.items.includes(item.name) : null, args)
        })()
        if (!nearest) { return false }

        const item = nearest.getDroppedItem()
        if (!item) { return false }

        if (bot.isInventoryFull(item.name)) { return false }

        const goals = goto.getGoal(bot, {
            entity: nearest,
            distance: 1,
            // savePathError: true,
        })

        for (const goal of goals) {
            if ('dimension' in goal) { continue }
            if (bot.memory.isGoalUnreachable(goal)) { return false }
        }

        return true
    },
    getGoal: function(item) {
        return {
            isValid: () => item.isValid,
            hasChanged: () => false,
            heuristic: node => Math.sqrt(Math.pow(node.x - item.position.x, 2) + Math.pow(node.z - item.position.z, 2)) + Math.abs((node.y - item.position.y)),
            isEnd: node => node.distanceTo(item.position) <= 1,
        }
    },
}
