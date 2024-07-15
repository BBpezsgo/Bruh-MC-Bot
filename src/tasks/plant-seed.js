const { Vec3 } = require('vec3')
const { wrap } = require('../utils/tasks')
const { Block } = require('prismarine-block')
const goto = require('./goto')
const hoeing = require('./hoeing')

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
        range: 3,
    })
    
    console.log(`[Bot "${bot.bot.username}"] Planting seed ... Equiping item`)
    yield* wrap(bot.bot.equip(seedItem, 'hand'))

    if (bot.bot.heldItem) {
        console.log(`[Bot "${bot.bot.username}"] Planting seed ... Place block`)
        yield* wrap(bot.bot.placeBlock(placeOn, new Vec3(0, 1, 0)))
    }
}

/**
 * @type {import('../task').TaskDef<'ok', {
 *   seedItems?: ReadonlyArray<number>;
 *   harvestedCrops?: ReadonlyArray<{ position: Vec3; block: number; }>;
 *   fallbackToNear?: boolean;
 * }> & {
 *   plant: plant;
 * }}
 */
module.exports = {
    task: function*(bot, args) {
        let palntedCount = 0

        if (args.harvestedCrops) {
            for (const harvestedCrop of args.harvestedCrops) {
                const seedId = bot.getCropSeed(harvestedCrop.block)
                console.log(`[Bot "${bot.bot.username}"] Try plant "${harvestedCrop.block}" at ${harvestedCrop.position}`)

                const seed = bot.bot.inventory.findInventoryItem(seedId, null, false)
                if (!seed) {
                    console.warn(`[Bot "${bot.bot.username}"] Can't replant this: doesn't have "${seedId}"`)
                    continue
                }

                const at = bot.bot.blockAt(harvestedCrop.position)
                /** @type {Block | null} */
                let placeOn = null
                if (!at || at.name === 'air') {
                    let below = bot.bot.blockAt(harvestedCrop.position.offset(0, -1, 0))
                    if (below.name === 'farmland') {
                        console.log(`[Bot "${bot.bot.username}"] Try plant on ${below.name}`)
                        yield* plant(bot, below, seed)
                        continue
                    } else if (below.name === 'dirt' ||
                               below.name === 'grass_block') {
                        try {
                            yield* hoeing.task(bot, {
                                block: below.position.clone(),
                                gatherTool: false,
                            })
                        } catch (error) {
                            console.error(error)
                            continue
                        }
                    } else {
                        console.warn(`[Bot "${bot.bot.username}"] Can't replant this on ${below.name ?? 'null'}`)
                        continue
                    }
                    yield
                    below = bot.bot.blockAt(harvestedCrop.position.offset(0, -1, 0))
                    if (below.name !== 'farmland') {
                        console.warn(`[Bot "${bot.bot.username}"] Failed to hoe`)
                        continue
                    }
                    placeOn = below
                }

                if (!placeOn && args.fallbackToNear) {
                    console.warn(`[Bot "${bot.bot.username}"] Falling back to nearest free farmland ...`)
                    placeOn = bot.env.getFreeFarmland(harvestedCrop.position)
                }

                if (!placeOn) {
                    console.warn(`[Bot "${bot.bot.username}"] Place on is null`)
                    continue
                }

                console.log(`[Bot "${bot.bot.username}"] Try plant on ${placeOn.name}`)

                yield* plant(bot, placeOn, seed)

                console.log(`[Bot "${bot.bot.username}"] Seed ${seed.name} successfully planted`)
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
