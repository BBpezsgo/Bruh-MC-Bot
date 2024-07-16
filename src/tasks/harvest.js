const { Vec3 } = require('vec3')
const { wrap } = require('../utils/tasks')
const { backNForthSort } = require('../utils/other')
const goto = require('./goto')
const pickupItem = require('./pickup-item')
const plantSeed = require('./plant-seed')

/**
 * @type {import('../task').TaskDef<number, { farmPosition?: Vec3; }>}
 */
module.exports = {
    task: function*(bot, args) {
        if (bot.quietMode) {
            throw `Can't harvest in quiet mode`
        }

        let n = 0

        /**
         * @type {Array<{ position: Vec3; block: number; }>}
         */
        const harvestedCrops = [ ]

        while (true) {
            yield

            const farmPosition = args.farmPosition ?? bot.bot.entity.position.clone()

            let cropPositions = bot.env.getCrops(bot, farmPosition, true)

            if (cropPositions.length === 0) { break }

            cropPositions = backNForthSort(cropPositions)

            for (const cropPosition of cropPositions) {
                if (!bot.env.allocateBlock(bot.bot.username, cropPosition, 'dig')) {
                    console.log(`[Bot "${bot.bot.username}"]: Crop will be digged by someone else, skipping ...`)
                    yield
                    continue
                }

                yield* goto.task(bot, {
                    // block: crop.clone(),
                    destination: cropPosition.clone(),
                    range: 3,
                    avoidOccupiedDestinations: true,
                })
                const cropBlock = bot.bot.blockAt(cropPosition)
                if (cropBlock) {
                    const cropBlockId = cropBlock.type
                    yield* wrap(bot.bot.dig(cropBlock))
                    n++

                    let isSaved = false

                    for (const crop of bot.env.crops) {
                        if (crop.position.equals(cropPosition)) {
                            crop.block = cropBlockId
                            isSaved = true
                            break
                        }
                    }

                    if (isSaved) {
                        console.log(`[Bot "${bot.bot.username}"] Crop already saved`)
                    } else {
                        console.log(`[Bot "${bot.bot.username}"] Crop saved`)
                        bot.env.crops.push({
                            position: cropPosition.clone(),
                            block: cropBlockId,
                        })
                    }

                    const cropSeed = bot.getCropSeed(cropBlock)
                    if (cropSeed) {
                        try {
                            console.log(`[Bot "${bot.bot.username}"] Try replant "${bot.mc.data.items[cropSeed].name}" at ${cropBlock.position}`)
    
                            const seed = bot.bot.inventory.findInventoryItem(bot.mc.data.itemsByName[bot.mc.data.items[cropSeed].name].id, null, false)
                            if (!seed) {
                                throw `Can't replant this: doesn't have "${bot.mc.data.items[cropSeed].name}"`
                            }
    
                            const placeOn = bot.env.getFreeFarmland(bot, cropBlock.position)
                            if (!placeOn) {
                                throw `Place on is null`
                            }
    
                            console.log(`[Bot "${bot.bot.username}"] Try replant on ${placeOn.name}`)
    
                            yield* plantSeed.plant(bot, placeOn, seed)
    
                            console.log(`[Bot "${bot.bot.username}"] Seed ${bot.mc.data.items[cropSeed].name} successfully replanted`)
                        } catch (error) {
                            console.log(`[Bot "${bot.bot.username}"] Crop position saved`)
                            harvestedCrops.push({ 
                                position: cropPosition.clone(),
                                block: cropBlockId,
                            })
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

        return n
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
