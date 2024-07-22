const { Vec3 } = require("vec3")
const { sleepG } = require('../utils/tasks')
const goto = require("./goto")

/**
 * @type {import('../task').TaskDef<void, { inAir?: boolean; maxDistance?: number; point?: Vec3; minLifetime?: number; items?: ReadonlyArray<string>; }>}
 */
module.exports = {
    task: function*(bot, args) {
        const nearest = bot.env.getClosestItem(bot, args.items ? (item) => args.items.includes(item.name) : null, args)
    
        if ('error' in nearest) {
            throw nearest.error
        }
    
        const item = nearest.result.getDroppedItem()

        if (!item) {
            throw `This aint an item`
        }
        
        if (bot.isInventoryFull(item.type)) {
            throw `Inventory is full`
        }
    
        yield* goto.task(bot, {
            destination: nearest.result.position.clone(),
            range: 0,
            avoidOccupiedDestinations: true,
        })
    
        yield* sleepG(200)
    
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
        return `pickup-item-${(args.point ? `${Math.round(args.point.x)}-${Math.round(args.point.y)}-${Math.round(args.point.z)}` : 'null')}-${args.inAir}-${args.maxDistance}-${args.minLifetime}`
    },
    humanReadableId: function(args) {
        return `Picking up items`
    },
}
