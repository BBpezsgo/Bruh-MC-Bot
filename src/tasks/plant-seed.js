const { Vec3 } = require('vec3')
const { sleepG, wrap } = require('../utils')
const { Block } = require('prismarine-block')
const goto = require('./goto')

/**
 * @param {import('../bruh-bot')} bot
 * @param {Block} placeOn
 * @param {import("prismarine-item").Item} seedItem
 */
function* plant(bot, placeOn, seedItem) {
    const above = bot.bot.blockAt(placeOn.position.offset(0, 1, 0))

    if (bot.quietMode) {
        throw `Can't plant in quiet mode`
    }

    if (above.name !== 'air') {
        throw `Can't plant seed: block above it is "${above.name}"`
    }

    console.log(`[Bot "${bot.bot.username}"] Planting seed ... Going to ${placeOn.position}`)
    yield* goto.task(bot, {
        destination: placeOn.position.clone(),
        range: 2,
    })
    
    console.log(`[Bot "${bot.bot.username}"] Planting seed ... Equiping item`)
    yield* wrap(bot.bot.equip(seedItem, 'hand'))

    if (bot.bot.heldItem) {
        console.log(`[Bot "${bot.bot.username}"] Planting seed ... Place block`)
        yield* wrap(bot.bot.placeBlock(placeOn, new Vec3(0, 1, 0)))
    }
}

/**
 * @type {import('../task').TaskDef<'ok', { seedItems?: Array<number>; harvestedCrops?: Array<{ position: Vec3, item: string }> }> & {
 *   plant: plant;
 * }}
 */
module.exports = {
    task: function*(bot, args) {
        let palntedCount = 0

        if (args.harvestedCrops) {
            let i = 0
            while (i < args.harvestedCrops.length) {
                const harvestedCrop = args.harvestedCrops[i]
                console.log(`[Bot "${bot.bot.username}"] Try plant "${harvestedCrop.item}" at ${harvestedCrop.position}`)

                const seed = bot.bot.inventory.findInventoryItem(bot.mc.data.itemsByName[harvestedCrop.item].id, null, false)
                if (!seed) {
                    console.warn(`[Bot "${bot.bot.username}"] Can't replant this: doesn't have "${harvestedCrop.item}"`)
                    i++
                    continue
                }

                const placeOn = bot.env.getFreeFarmland(harvestedCrop.position)
                if (!placeOn) {
                    console.warn(`[Bot "${bot.bot.username}"] Place on is null`)
                    i++
                    continue
                }

                console.log(`[Bot "${bot.bot.username}"] Try plant on ${placeOn.name}`)

                yield* plant(bot, placeOn, seed)

                console.log(`[Bot "${bot.bot.username}"] Seed ${harvestedCrop.item} successfully planted`)
                args.harvestedCrops.splice(i, 1)
                palntedCount++
            }
        } else {
            if (!args.seedItems) {
                throw new Error(`"this.seedItems" is null`)
            }

            while (true) {
                console.log(`[Bot "${bot.bot.username}"] Try plant seed`)

                const seed = bot.searchItem(...args.seedItems)

                if (!seed) {
                    break
                }

                const placeOn = bot.env.getFreeFarmland(bot.bot.entity.position.clone())
                if (!placeOn) {
                    break
                }

                console.log(`[Bot "${bot.bot.username}"] Try plant ${seed.displayName} on ${placeOn.name}`)

                yield* plant(bot, placeOn, seed)

                console.log(`[Bot "${bot.bot.username}"] Seed successfully planted`)
                palntedCount++
            }
        }

        return 'ok'
    },
    id: function(args) {
        return `plant-seed`
    },
    humanReadableId: function(args) {
        return `Planting seeds`
    },
    plant: plant,
}
