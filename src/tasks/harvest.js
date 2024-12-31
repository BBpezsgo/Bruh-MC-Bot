'use strict'

const { basicRouteSearch, directBlockNeighbors } = require('../utils/other')
const goto = require('./goto')
const plantSeed = require('./plant-seed')
const Minecraft = require('../minecraft')
const dig = require('./dig')
const Vec3Dimension = require('../vec3-dimension')
const pickupItem = require('./pickup-item')
const config = require('../config')

/**
 * @type {import('../task').TaskDef<number, {
 *   farmPosition?: Vec3Dimension;
 * }>}
 */
module.exports = {
    task: function*(bot, args) {
        if (args.interrupt.isCancelled) { return 0 }
        if (bot.quietMode) { throw `Can't harvest in quiet mode` }

        if (args.farmPosition) {
            yield* goto.task(bot, {
                dimension: args.farmPosition.dimension,
                interrupt: args.interrupt,
            })
        }

        let n = 0
        /**
         * @type {Array<import('../environment').SavedCrop>}
         */
        const replantPositions = []
        /**
         * @type {Array<import('vec3').Vec3>}
         */
        const harvestedPoints = []
        const farmPosition = args.farmPosition?.xyz(bot.dimension) ?? bot.bot.entity.position.clone()
        const replantDuringHarvesting = true

        while (true) {
            yield

            if (args.interrupt.isCancelled) { break }

            let cropPositions = bot.env.getCrops(bot, farmPosition, true, 128, config.harvest.cropSearchradius).map(v => v.position).toArray()
            if (cropPositions.length === 0) { break }
            // cropPositions = cropPositions.map(b => ({ b: b, d: b.distanceTo(bot.bot.entity.position) })).sort((a, b) => a.d - b.d).map(b => b.b)

            // console.log(`[Bot "${bot.username}"] Harvesting ${cropPositions.length} crops ...`)
            for (const cropPosition of basicRouteSearch(bot.bot.entity.position, cropPositions)) {
                // yield

                if (args.interrupt.isCancelled) { break }

                const cropBlock = bot.bot.blockAt(cropPosition)
                if (!cropBlock) { continue }
                // console.log(`[Bot "${bot.username}"] Harvesting ${cropBlock.name} ...`)

                const cropInfo = Minecraft.resolveCrop(cropBlock.name)
                if (!cropInfo) {
                    console.warn(`[Bot "${bot.username}"] This aint a crop`)
                    continue
                }

                if (cropInfo.type !== 'spread' && !bot.env.cropFilter(bot, true, cropBlock, [])) {
                    console.warn(`[Bot "${bot.username}"] This crop aint good`)
                    continue
                }

                const p = new Vec3Dimension(cropPosition, bot.dimension)

                const gotoCrop = function*() {
                    // console.log(`[Bot "${bot.username}"] Goto block ...`)
                    try {
                        yield* goto.task(bot, {
                            block: cropPosition,
                            interrupt: args.interrupt,
                        })
                        return true
                    } catch (error) {
                        if (error instanceof Error && error.name === 'NoPath') {
                            console.error(`[Bot "${bot.username}"] No path`)
                        } else if (error instanceof Error && error.name === 'GoalChanged') {
                            console.error(`[Bot "${bot.username}"] Goal changed`)
                        } else {
                            console.error(error)
                        }
                        return farmPosition
                    }
                }

                // console.log(`[Bot "${bot.username}"] Actually harvesting ...`)

                switch (cropInfo.type) {
                    case 'seeded':
                    case 'simple':
                    case 'up': {
                        if (!bot.env.getAllocatedBlock(p) && !(yield* gotoCrop())) continue
                        yield* bot.dig(cropBlock)
                        break
                    }
                    case 'grows_fruit': {
                        if (!bot.env.getAllocatedBlock(p) && !(yield* gotoCrop())) continue
                        yield* bot.activate(cropBlock)
                        break
                    }
                    case 'grows_block': {
                        let fruitBlock = null
                        for (const neighbor of directBlockNeighbors(cropBlock.position)) {
                            const neighborBlock = bot.bot.blockAt(neighbor)
                            if (neighborBlock && neighborBlock.name === cropInfo.grownBlock) {
                                fruitBlock = neighborBlock
                                break
                            }
                        }
                        if (!fruitBlock) {
                            console.warn(`[Bot "${bot.username}"] This block isn't grown`)
                            continue
                        }
                        if (!bot.env.getAllocatedBlock(p) && !(yield* gotoCrop())) continue
                        yield* goto.task(bot, {
                            block: fruitBlock.position,
                            interrupt: args.interrupt,
                        })
                        yield* bot.dig(fruitBlock)
                        break
                    }
                    case 'tree': {
                        if (cropInfo.log !== cropBlock.name) {
                            console.warn(`[Bot "${bot.username}"] This tree aint right`)
                            continue
                        }
                        if (cropInfo.size !== 'small') {
                            console.warn(`[Bot "${bot.username}"] This tree is too big for me`)
                            continue
                        }
                        yield* dig.task(bot, {
                            block: cropBlock,
                            alsoTheNeighbors: true,
                            pickUpItems: true,
                            interrupt: args.interrupt,
                        })
                        break
                    }
                    case 'spread': {
                        if (!bot.env.getAllocatedBlock(p) && !(yield* gotoCrop())) continue
                        yield* dig.task(bot, {
                            block: cropBlock,
                            alsoTheNeighbors: false,
                            pickUpItems: true,
                            interrupt: args.interrupt,
                        })
                        break
                    }
                    default:
                        debugger
                        continue
                }
                n++

                if (Minecraft.isCropRoot(bot.bot, cropBlock)) {
                    let isSaved = false

                    for (const crop of bot.env.crops) {
                        if (crop.position.equals(cropPosition)) {
                            crop.block = cropInfo.cropName
                            isSaved = true
                            break
                        }
                    }

                    if (isSaved) {
                        // console.log(`[Bot "${bot.username}"] Crop already saved`)
                    } else {
                        // console.log(`[Bot "${bot.username}"] Crop saved`)
                        bot.env.crops.push({
                            position: new Vec3Dimension(cropPosition, bot.dimension),
                            block: cropInfo.cropName,
                        })
                    }
                }

                harvestedPoints.push(cropPosition)

                if (cropInfo.type === 'grows_block') {
                    continue
                }

                if (cropInfo.type === 'grows_fruit') {
                    continue
                }

                if (cropInfo.type === 'spread') {
                    continue
                }

                if (cropInfo.type === 'up') {
                    continue
                }

                if (!replantDuringHarvesting) {
                    // console.log(`[Bot "${bot.username}"] Crop position saved`)
                    replantPositions.push({
                        position: new Vec3Dimension(cropPosition, bot.dimension),
                        block: cropInfo.cropName,
                    })
                    continue
                }

                try {
                    // console.log(`[Bot "${bot.username}"] Try replant "${cropInfo.seed}" at ${cropBlock.position}`)

                    const seed = bot.searchInventoryItem(null, cropInfo.seed)
                    if (!seed) {
                        throw `Can't replant this: doesn't have "${cropInfo.seed}"`
                    }

                    const placeOn = bot.env.getPlantableBlock(bot, cropBlock.position, cropInfo, true, true)
                    if (!placeOn) {
                        throw `Place on is null`
                    }

                    // console.log(`[Bot "${bot.username}"] Replant on ${placeOn.block.name}`)

                    yield* plantSeed.plant(bot, placeOn.block, placeOn.faceVector, seed, args)

                    // console.log(`[Bot "${bot.username}"] Seed ${cropInfo.seed} replanted`)
                } catch (error) {
                    // console.log(`[Bot "${bot.username}"] Crop position saved`)
                    replantPositions.push({
                        position: new Vec3Dimension(cropPosition, bot.dimension),
                        block: cropInfo.cropName,
                    })
                    // console.warn(error)
                }
            }

            // try {
            //     yield* pickupItem.task(bot, {
            //         inAir: true,
            //         maxDistance: 8,
            //         point: farmPosition,
            //     })
            // } catch (error) {
            //     console.warn(error)
            // }
        }

        if (args.interrupt.isCancelled) { return n }

        yield* plantSeed.task(bot, {
            harvestedCrops: replantPositions,
            locks: [],
            interrupt: args.interrupt,
        })

        if (args.interrupt.isCancelled) { return n }

        /**
         * @type {Array<import('prismarine-entity').Entity>}
         */
        const items = []
        for (const point of harvestedPoints) {
            const item = Object.values(bot.bot.entities).find(e => {
                if (e.name !== 'item') { return false }
                const d = e.position.distanceTo(point)
                if (d > 5) { return false }
                if (items.find(other => other.id === e.id)) { return false }
                return true
            })
            if (!item) { continue }
            items.push(item)
        }

        console.log(`[Bot "${bot.username}"] Picking up ${items.length} items`)

        for (let i = 0; i < 2 && items.length > 0; i++) {
            for (const item of basicRouteSearch(bot.bot.entity.position, items, v => v.position)) {
                if (!item?.isValid) { continue }
                try {
                    yield* pickupItem.task(bot, {
                        item: item,
                        interrupt: args.interrupt,
                    })
                    const j = items.findIndex(v => v.id === item.id)
                    if (j !== -1) {
                        items.splice(j)
                    }
                } catch (error) { }
            }
        }

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
    definition: 'harvest',
}
