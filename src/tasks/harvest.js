const { Vec3 } = require('vec3')
const { sleepG, wrap, backNForthSort } = require('../utils')
const goto = require('./goto')
const { Block } = require('prismarine-block')
const pickupItem = require('./pickup-item')
const plantSeed = require('./plant-seed')

/**
 * @type {import('../task').TaskDef<'ok', { farmPosition?: Vec3; }>}
 */
module.exports = {
    task: function*(bot, args) {
        if (bot.quietMode) {
            throw `Can't harvest in quiet mode`
        }

        /**
         * @type {Array<{ position: Vec3; item: string; }>}
         */
        const harvestedCrops = [ ]

        while (true) {
            const farmPosition = this.farmPosition ?? bot.bot.entity.position.clone()

            let crops = bot.env.getCrops(farmPosition, true)

            if (crops.length === 0) { break }

            crops = backNForthSort(crops)

            for (const crop of crops) {
                yield* goto.task(bot, {
                    // block: crop.clone(),
                    destination: crop.clone(),
                    range: 3,
                })
                const cropBlock = bot.bot.blockAt(crop)
                if (cropBlock) {
                    yield* wrap(bot.bot.dig(cropBlock))

                    const cropSeed = bot.getCropSeed(cropBlock)
                    if (cropSeed) {
                        let isSaved = false

                        for (const harvestedCrop of bot.env.harvestedCrops) {
                            if (harvestedCrop.position.equals(crop)) {
                                isSaved = true
                                break
                            }
                        }

                        if (isSaved) {
                            console.log(`[Bot "${bot.bot.username}"] Crop position already saved`)
                            continue
                        }

                        try {
                            console.log(`[Bot "${bot.bot.username}"] Try replant "${bot.mc.data.items[cropSeed].name}" at ${cropBlock.position}`)
    
                            const seed = bot.bot.inventory.findInventoryItem(bot.mc.data.itemsByName[bot.mc.data.items[cropSeed].name].id, null, false)
                            if (!seed) {
                                throw `Can't replant this: doesn't have "${bot.mc.data.items[cropSeed].name}"`
                            }
    
                            const placeOn = bot.env.getFreeFarmland(cropBlock.position)
                            if (!placeOn) {
                                throw `Place on is null`
                            }
    
                            console.log(`[Bot "${bot.bot.username}"] Try replant on ${placeOn.name}`)
    
                            yield* plantSeed.plant(bot, placeOn, seed)
    
                            console.log(`[Bot "${bot.bot.username}"] Seed ${bot.mc.data.items[cropSeed].name} successfully replanted`)
                        } catch (error) {
                            console.log(`[Bot "${bot.bot.username}"] Crop position saved`)
                            harvestedCrops.push({ position: crop.clone(), item: bot.mc.data.items[cropSeed].name })
                            bot.env.harvestedCrops.push({ position: crop.clone(), item: bot.mc.data.items[cropSeed].name })
                            console.warn(error)
                        }
                    } else {
                        console.warn(`[Bot "${bot.bot.username}"]: Crop "${cropBlock.name}" doesn't have a seed`)
                    }
                }
            }

            try {
                yield* pickupItem.task(bot, {
                    inAir: true,
                    maxDistance: 8,
                    point: farmPosition,
                })
            } catch (error) {
                console.warn(error)
            }
        }

        yield* plantSeed.task(bot, {
            harvestedCrops: harvestedCrops,
        })

        return 'ok'
    },
    id: function(args) {
        return `harvest-${args.farmPosition}`
    },
    humanReadableId: function(args) {
        if (args.farmPosition) {
            return `Harvesting crops near ${args.farmPosition}`
        } else {
            return `Harvesting crops`
        }
    },
}
