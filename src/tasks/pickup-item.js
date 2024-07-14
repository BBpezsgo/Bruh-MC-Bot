const { Vec3 } = require("vec3")
const { sleepG } = require('../utils')
const goto = require("./goto")

/**
 * @type {import('../task').TaskDef<void, { inAir?: boolean; maxDistance?: number; point?: Vec3; minLifetime?: number; }>}
 */
module.exports = {
    task: function*(bot, args) {
        let nearest = bot.env.getClosestItem(null, args)
    
        // if ('error' in nearest) {
        //     const nearestArrow = bot.env.getClosestArrow(bot)
        //     if ('result' in nearestArrow) {
        //         nearest = nearestArrow
        //     }
        // }
    
        if ('error' in nearest) {
            const nearestXp = bot.env.getClosestXp(args)
            if ('result' in nearestXp) {
                nearest = nearestXp
            }
        }
    
        if ('error' in nearest) {
            throw nearest.error
        }
    
        const item = nearest.result.getDroppedItem()
        
        if (item) {
            if (bot.isInventoryFull(item.type)) {
                throw `Inventory is full`
            }
        }
    
        yield* goto.task(bot, {
            destination: nearest.result.position.clone(),
            range: 0,
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
        return `pickup-item-${args.point}-${args.inAir}-${args.maxDistance}-${args.minLifetime}`
    },
    humanReadableId: function(args) {
        return `Picking up items`
    },
}
