const goto = require('./goto')

/**
 * @typedef {{ inAir?: boolean; maxDistance?: number; point?: import('vec3').Vec3; minLifetime?: number; items?: ReadonlyArray<string>; } | { item: import('prismarine-entity').Entity }} Args
 */

/**
 * @type {import('../task').TaskDef<void, Args> & { can: (bot: import('../bruh-bot'), args: Args) => boolean; }}
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

        if (bot.isInventoryFull(item.type)) {
            throw `Inventory is full`
        }

        yield* goto.task(bot, {
            point: nearest.position,
            distance: 0,
            savePathError: true,
        })
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

        if (bot.isInventoryFull(item.type)) { return false }

        const goals = goto.getGoal(bot, {
            point: nearest.position,
            distance: 0,
            savePathError: true,
        })

        for (const goal of goals) {
            if ('dimension' in goal) { continue }
            if (bot.memory.isGoalUnreachable(goal)) { return false }
        }

        return true
    },
}
