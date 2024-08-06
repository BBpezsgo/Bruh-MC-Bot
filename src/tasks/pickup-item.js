const goto = require("./goto")

/**
 * @type {import('../task').TaskDef<void, { inAir?: boolean; maxDistance?: number; point?: import('vec3').Vec3; minLifetime?: number; items?: ReadonlyArray<string>; } | { item: import("prismarine-entity").Entity }>}
 */
module.exports = {
    task: function*(bot, args) {
        const nearest = (() => {
            if ('item' in args) { return args.item }
            const nearest = bot.env.getClosestItem(bot, args.items ? (item) => args.items.includes(item.name) : null, args)
            if ('error' in nearest) { throw nearest.error }
            return nearest.result
        })()

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
        })

        // if (item &&
        //     this.harvestedSaplings && (
        //         item.name === 'oak_sapling' ||
        //         item.name === 'spruce_sapling' ||
        //         item.name === 'birch_sapling' ||
        //         item.name === 'jungle_sapling' ||
        //         item.name === 'acacia_sapling' ||
        //         // item.name === 'dark_oak_sapling' ||
        //         item.name === 'mangrove_propagule' ||
        //         item.name === 'cherry_sapling' ||
        //         item.name === 'azalea' ||
        //         item.name === 'flowering_azalea')
        //     ) {
        //     this.harvestedSaplings.push({
        //         position: nearest.result.position.clone(),
        //         item: item.name,
        //     })
        // }
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
}
