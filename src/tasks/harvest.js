const { Vec3 } = require('vec3')
const { wrap } = require('../utils/tasks')
const { backNForthSort, directBlockNeighbours } = require('../utils/other')
const goto = require('./goto')
const pickupItem = require('./pickup-item')
const plantSeed = require('./plant-seed')
const MC = require('../mc')
const dig = require('./dig')

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
         * @type {Array<import('../environment').SavedCrop>}
         */
        const harvestedCrops = [ ]

        while (true) {
            yield

            const farmPosition = args.farmPosition ?? bot.bot.entity.position.clone()

            let cropPositions = bot.env.getCrops(bot, farmPosition, true)

            if (cropPositions.length === 0) { break }

            cropPositions = backNForthSort(cropPositions)

            for (const cropPosition of cropPositions) {
                const cropBlock = bot.bot.blockAt(cropPosition)
                if (!cropBlock) { continue }
                console.log(`[Bot "${bot.bot.username}"]: Harvesting ${cropBlock.name} ...`)

                const cropInfo = MC.findCropByAnyBlockName(cropBlock.name)
                if (!cropInfo) {
                    console.warn(`[Bot "${bot.bot.username}"]: This aint a crop`)
                    continue
                }

                console.log(`[Bot "${bot.bot.username}"]: Goto block ...`)

                yield* goto.task(bot, {
                    // block: crop.clone(),
                    destination: cropPosition.clone(),
                    range: 3,
                    avoidOccupiedDestinations: true,
                })

                console.log(`[Bot "${bot.bot.username}"]: Actually harvesting ...`)

                switch (cropInfo.type) {
                    case 'seeded':
                    case 'simple': {
                        if (!(bot.env.allocateBlock(bot.bot.username, cropPosition, 'dig'))) {
                            console.log(`[Bot "${bot.bot.username}"]: Crop will be digged by someone else, skipping ...`)
                            yield
                            continue
                        }
                        yield* wrap(bot.bot.dig(cropBlock))
                        break
                    }
                    case 'grows_fruit': {
                        yield* wrap(bot.bot.activateBlock(cropBlock))
                        break
                    }
                    case 'grows_block': {
                        let fruitBlock = null
                        for (const neighbour of directBlockNeighbours(cropBlock.position)) {
                            const neighbourBlock = bot.bot.blockAt(neighbour)
                            if (neighbourBlock && neighbourBlock.name === cropInfo.grownBlock) {
                                fruitBlock = neighbourBlock
                                break
                            }
                        }
                        if (!fruitBlock) {
                            console.warn(`[Bot "${bot.bot.username}"] This block isn't grown`)
                            continue
                        }
                        yield* goto.task(bot, {
                            destination: fruitBlock.position.clone(),
                            range: 3,
                            avoidOccupiedDestinations: true,
                        })
                        if (!(bot.env.allocateBlock(bot.bot.username, fruitBlock.position, 'dig'))) {
                            console.log(`[Bot "${bot.bot.username}"]: Crop fruit will be digged by someone else, skipping ...`)
                            yield
                            continue
                        }
                        yield* wrap(bot.bot.dig(fruitBlock))
                        break
                    }
                    case 'tree': {
                        if (cropInfo.log !== cropBlock.name) {
                            console.warn(`[Bot "${bot.bot.username}"]: This tree aint right`)
                            continue
                        }
                        if (cropInfo.size !== 'small') {
                            console.warn(`[Bot "${bot.bot.username}"]: This tree is too big for me`)
                            continue
                        }
                        yield* dig.task(bot, {
                            block: cropBlock,
                            alsoTheNeighbours: true,
                        })
                        break
                    }
                    default:
                        debugger
                        continue
                }
                n++

                let isSaved = false
                
                for (const crop of bot.env.crops) {
                    if (crop.position.equals(cropPosition)) {
                        crop.block = cropInfo.cropName
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
                        block: cropInfo.cropName,
                    })
                }

                if (cropInfo.type === 'grows_block') {
                    continue
                }

                if (cropInfo.type === 'grows_fruit') {
                    continue
                }

                if (cropInfo.type === 'tree') {
                    continue
                }

                try {
                    console.log(`[Bot "${bot.bot.username}"] Try replant "${cropInfo.seed}" at ${cropBlock.position}`)

                    const seed = bot.bot.inventory.findInventoryItem(bot.mc.data.itemsByName[cropInfo.seed].id, null, false)
                    if (!seed) {
                        throw `Can't replant this: doesn't have "${cropInfo.seed}"`
                    }

                    const placeOn = bot.env.getPlantableBlock(bot, cropBlock.position, cropInfo, true, true)
                    if (!placeOn) {
                        throw `Place on is null`
                    }

                    console.log(`[Bot "${bot.bot.username}"] Replant on ${placeOn.block.name}`)

                    yield* plantSeed.plant(bot, placeOn.block, placeOn.faceVector, seed)

                    console.log(`[Bot "${bot.bot.username}"] Seed ${cropInfo.seed} replanted`)
                } catch (error) {
                    console.log(`[Bot "${bot.bot.username}"] Crop position saved`)
                    harvestedCrops.push({ 
                        position: cropPosition.clone(),
                        block: cropInfo.cropName,
                    })
                    console.warn(error)
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
