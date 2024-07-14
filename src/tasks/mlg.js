const { wrap, sleepG } = require('../utils')
const { Vec3 } = require('vec3')

/**
 * @typedef {{
 *   type: 'water'
 *   position: Vec3
 * } | {
 *   type: 'block'
 *   blockName: string
 *   position: Vec3
 * } | {
 *   type: 'boat'
 *   id: number
 * }} MlgJunkBlock
 */

/**
 * @type {import('../task').TaskDef<void, null>}
 */
module.exports = {
    task: function*(bot, args) {
        let didMLG = false
    
        const neighbour = bot.bot.nearestEntity()
        if (neighbour &&
            bot.mc.data2.mlg.vehicles.includes(neighbour.name) &&
            bot.bot.entity.position.distanceTo(neighbour.position) < 6) {
            console.log(`[Bot "${bot.bot.username}"]: MLG: Mounting "${neighbour.name}" ...`)
            bot.bot.mount(neighbour)
            didMLG = true
            yield* sleepG(100)
            bot.bot.dismount()
            return 'ok'
        }
    
        while (!didMLG) {
            try {
                let haveMlgItem = 0
                for (const item of bot.bot.inventory.slots) {
                    if (!item) { continue }
    
                    if (bot.mc.data2.mlg.boats.includes(item.name) &&
                        haveMlgItem < 1) {
                        yield* wrap(bot.bot.equip(item.type, 'hand'))
                        haveMlgItem = 1
                        continue
                    }
    
                    if (bot.mc.data2.mlg.mlgBlocks.includes(item.name) &&
                        haveMlgItem < 2) {
                        yield* wrap(bot.bot.equip(item.type, 'hand'))
                        haveMlgItem = 2
                        break
                    }
                }
    
                if (!haveMlgItem) {
                    console.warn(`[Bot "${bot.bot.username}"]: MLG: No suitable item found`)
                    return 'failed'
                }
    
                console.log(`[Bot "${bot.bot.username}"]: MLG: Will use ${bot.bot.heldItem?.name ?? 'null'} ...`)
    
                yield* wrap(bot.bot.look(bot.bot.entity.yaw, -Math.PI / 2, true))

                yield

                const reference = bot.bot.blockAtCursor()
                if (!reference) {
                    console.warn(`[Bot "${bot.bot.username}"]: MLG: No reference block`)
                    return 'failed'
                }

                while (reference.position.distanceTo(bot.bot.entity.position) > 3) {
                    yield
                }

                if (!bot.bot.heldItem) {
                    console.warn(`[Bot "${bot.bot.username}"]: MLG: Not holding anything`)
                    return 'failed'
                }
                
                if (bot.bot.heldItem.name === 'bucket') {
                    console.warn(`[Bot "${bot.bot.username}"]: MLG: This is a bucket`)
                    return 'failed'
                }
    
                console.log(`[Bot "${bot.bot.username}"]: MLG: Using "${bot.bot.heldItem.name ?? 'null'}" ...`)
    
                if (bot.bot.heldItem.name === 'water_bucket') {
                    console.log(`[Bot "${bot.bot.username}"]: MLG: Placing water ...`)
                    bot.bot.activateItem(false)
                    didMLG = true
    
                    yield* sleepG(40)
                    
                    const junkBlock = bot.bot.blockAt(reference.position.offset(0, 1, 0))
                    if (junkBlock) {
                        console.log(`[Bot "${bot.bot.username}"]: MLG: Junk water saved`)
                        bot.memory.mlgJunkBlocks.push({
                            type: 'water',
                            position: junkBlock.position.clone(),
                        })
                    } else {
                        console.log(`[Bot "${bot.bot.username}"]: MLG: Possible junk water saved`)
                        bot.memory.mlgJunkBlocks.push({
                            type: 'water',
                            position: reference.position.offset(0, 1, 0),
                        })
                    }
                } else if (bot.mc.data2.mlg.boats.includes(bot.bot.heldItem.name)) {
                    console.log(`[Bot "${bot.bot.username}"]: MLG: Activating item ...`)
                    bot.bot.activateItem()
    
                    yield* sleepG(40)
    
                    const junkBoat = bot.bot.nearestEntity((/** @type {import('prismarine-entity').Entity} */ v) => v.name === 'boat')
                    if (junkBoat) {
                        console.log(`[Bot "${bot.bot.username}"]: MLG: Junk boat saved`)
                        bot.memory.mlgJunkBlocks.push({
                            type: 'boat',
                            id: junkBoat.id,
                        })
                    }
                } else {
                    console.log(`[Bot "${bot.bot.username}"]: MLG: Placing block ...`)
                    yield* wrap(bot.bot.placeBlock(reference, new Vec3(0, 1, 0)))
                    didMLG = true
    
                    yield* sleepG(40)
                    
                    const junkBlock = bot.bot.blockAt(reference.position.offset(0, 1, 0))
                    if (junkBlock) {
                        console.log(`[Bot "${bot.bot.username}"]: MLG: Junk block saved`)
                        bot.memory.mlgJunkBlocks.push({
                            type: 'block',
                            blockName: junkBlock.name,
                            position: junkBlock.position.clone(),
                        })
                    } else {
                        console.warn(`[Bot "${bot.bot.username}"]: MLG: No junk block saved`)
                    }
                }
            } catch (error) {
                console.error(error)
            }
            yield
        }

        while (bot.bot.entity.velocity.y < bot.mc.data2.general.fallDamageVelocity) {
            console.log(`[Bot "${bot.bot.username}"]: Already did MLG, just falling ...`)
            yield
        }

        yield* sleepG(100)

        return 'ok'
    },
    id: function(args) {
        return `mlg`
    },
    humanReadableId: function(args) {
        return `MLG`
    },
}
