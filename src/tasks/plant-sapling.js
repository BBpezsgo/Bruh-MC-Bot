const { Item } = require('prismarine-item')
const { wrap } = require('../utils/tasks')
const { Block } = require('prismarine-block')
const { Vec3 } = require('vec3')
const MC = require('../mc')
const goto = require('./goto')

/**
 * @param {import('../bruh-bot')} bot
 * @param {Block} placeOn
 * @param {Item} sapling
 * @param {boolean} clearGrass
 */
function* plant(bot, placeOn, sapling, clearGrass) {
    const above = bot.bot.blockAt(placeOn.position.offset(0, 1, 0))

    let canPlace = !above || MC.replaceableBlocks[above.name] === 'yes'

    if (above && MC.replaceableBlocks[above.name] === 'break') {
        if (!clearGrass) {
            throw `Can't replant this: block above it is "${above.name}" and I'm not allowed to clear grass`
        }

        console.log(`[Bot "${bot.bot.username}"] Planting ... Going to ${placeOn.position} (destroying grass)`)
        yield* goto.task(bot, {
            // block: placeOn.position.clone(),
            destination: above.position.clone(),
            range: 3,
        })
        console.log(`[Bot "${bot.bot.username}"] Planting ... Destroy grass`)
        yield* wrap(bot.bot.dig(above, true))

        canPlace = true
    }

    if (!canPlace) {
        throw `Can't replant this: block above it is "${above?.name ?? 'null'}"`
    }

    console.log(`[Bot "${bot.bot.username}"] Planting ... Going to ${placeOn.position}`)
    yield* goto.task(bot, {
        destination: placeOn.position.clone(),
        range: 2,
    })
    console.log(`[Bot "${bot.bot.username}"] Planting ... Equiping item`)
    yield* wrap(bot.bot.equip(sapling, 'hand'))
    console.log(`[Bot "${bot.bot.username}"] Planting ... Place block`)
    yield* wrap(bot.bot.placeBlock(placeOn, new Vec3(0, 1, 0)))
    return { result: true }
}

/**
 * @type {import('../task').TaskDef<'ok', { harvestedSaplings?: Array<{ position: Vec3, item: string }>; clearGrass: boolean }>}
 */
module.exports = {
    task: function*(bot, args) {
        if (bot.quietMode) {
            throw `Can't plant sapling in quiet mode`
        }

        let plantedSaplingCount = 0

        if (args.harvestedSaplings) {
            let i = 0
            while (i < args.harvestedSaplings.length) {
                const replantPosition = args.harvestedSaplings[i]
                console.log(`[Bot "${bot.bot.username}"] Try plant "${replantPosition.item}" at ${replantPosition.position}`)
    
                const sapling = bot.bot.inventory.findInventoryItem(bot.mc.data.itemsByName[replantPosition.item].id, null, false)
                if (!sapling) {
                    console.warn(`[Bot "${bot.bot.username}"] Can't replant this: doesn't have "${replantPosition.item}"`)
                    i++
                    continue
                }
                
                const placeOn = bot.env.getPlantableBlock(replantPosition.position)
                if (!placeOn) {
                    console.warn(`[Bot "${bot.bot.username}"] Place on is null`)
                    i++
                    continue
                }
    
                console.log(`[Bot "${bot.bot.username}"] Try plant on ${placeOn.name}`)
    
                yield* plant(bot, placeOn, sapling, args.clearGrass)
    
                console.log(`[Bot "${bot.bot.username}"] Sapling ${replantPosition.item} successfully planted`)
                args.harvestedSaplings.splice(i, 1)
                plantedSaplingCount++
            }
        } else {
            while (true) {
                console.log(`[Bot "${bot.bot.username}"] Try plant`)

                const sapling = bot.searchItem(
                    'oak_sapling',
                    'spruce_sapling',
                    'birch_sapling',
                    'jungle_sapling',
                    'acacia_sapling',
                    'mangrove_propagule',
                    'cherry_sapling',
                    'azalea',
                    'flowering_azalea'
                )

                if (!sapling) {
                    break
                }

                const placeOn = bot.env.getPlantableBlock(bot.bot.entity.position.clone())
                if (!placeOn) {
                    console.warn(`[Bot "${bot.bot.username}"] Place on is null`)
                    break
                }
    
                console.log(`[Bot "${bot.bot.username}"] Try plant on ${placeOn.name}`)

                yield* plant(bot, placeOn, sapling, args.clearGrass)
    
                console.log(`[Bot "${bot.bot.username}"] Sapling ${sapling.name} successfully planted`)
                plantedSaplingCount++
            }
        }

        return plantedSaplingCount
    },
    id: function(args) {
        return `plant-${args.clearGrass}`
    },
    humanReadableId: function(args) {
        return `Planting saplings`
    },
}
