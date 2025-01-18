'use strict'

const { basicRouteSearch, directBlockNeighbors } = require('../utils/other')
const goto = require('./goto')
const plantSeed = require('./plant-seed')
const Minecraft = require('../minecraft')
const dig = require('./dig')
const Vec3Dimension = require('../utils/vec3-dimension')
const pickupItem = require('./pickup-item')
const config = require('../config')
const { runtimeArgs } = require('../utils/tasks')

/**
 * @type {import('../task').TaskDef<number, {
 *   farmPosition?: Vec3Dimension;
 * }>}
 */
module.exports = {
    task: function*(bot, args) {
        if (args.interrupt.isCancelled) { return 0 }
        if (bot.quietMode) { throw `Can't harvest in quiet mode` }

        args.task.blur()

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

            if (args.interrupt.isCancelled) break

            const cropPositions = bot.env.crops.filter(v => v.position.dimension === bot.dimension && v.position.xyz(bot.dimension).distanceTo(farmPosition) < 32)
            if (cropPositions.length === 0) break

            let didSomething = false

            for (const cropPosition of basicRouteSearch(bot.bot.entity.position, cropPositions, v => v.position.xyz(bot.dimension))) {
                yield
                if (args.interrupt.isCancelled) break

                const crop = Minecraft.resolveCrop(cropPosition.block)
                const grownBlock = bot.env.getCropHarvestPositions(bot, cropPosition)
                if (!grownBlock) continue

                const p = cropPosition.position
                if (bot.env.getAllocatedBlock(p)) continue

                args.task?.focus()

                try {
                    switch (crop.type) {
                        case 'seeded':
                        case 'simple':
                        case 'up':
                        case 'grows_block':
                        case 'spread': {
                            yield* dig.task(bot, {
                                block: cropPosition.position.xyz(bot.dimension),
                                alsoTheNeighbors: false,
                                pickUpItems: true,
                                skipIfAllocated: false,
                                ...runtimeArgs(args),
                            })
                            break
                        }
                        case 'grows_fruit': {
                            const _grownBlock = bot.bot.blockAt(cropPosition.position.xyz(bot.dimension))
                            yield* goto.task(bot, {
                                block: _grownBlock.position,
                                ...runtimeArgs(args),
                            })
                            yield* bot.activate(_grownBlock)
                            break
                        }
                        case 'tree': {
                            if (crop.log !== bot.bot.blocks.at(grownBlock)?.name) {
                                console.warn(`[Bot "${bot.username}"] This tree aint right`)
                                continue
                            }
                            if (crop.size !== 'small') {
                                console.warn(`[Bot "${bot.username}"] This tree is too big for me`)
                                continue
                            }
                            yield* dig.task(bot, {
                                block: grownBlock,
                                alsoTheNeighbors: true,
                                pickUpItems: true,
                                skipIfAllocated: false,
                                ...runtimeArgs(args),
                            })
                            break
                        }
                        default:
                            debugger
                            continue
                    }
                    n++
                    didSomething = true

                    if (Minecraft.isCropRoot(bot.bot, bot.bot.blockAt(grownBlock))) {
                        let isSaved = false

                        for (const savedCrop of bot.env.crops) {
                            if (savedCrop.position.equals(p)) {
                                savedCrop.block = crop.cropName
                                isSaved = true
                                break
                            }
                        }

                        if (!isSaved) {
                            bot.debug.label(p, crop.cropName, 30000)
                            bot.env.crops.push({
                                position: p,
                                block: crop.cropName,
                            })
                        }
                    }

                    harvestedPoints.push(p.xyz(bot.dimension))

                    if (crop.type === 'grows_block') continue
                    if (crop.type === 'grows_fruit') continue
                    if (crop.type === 'spread') continue
                    if (crop.type === 'up') continue

                    if (!replantDuringHarvesting) {
                        replantPositions.push({
                            position: p,
                            block: crop.cropName,
                        })
                        continue
                    }

                    try {
                        const seed = bot.searchInventoryItem(null, crop.seed)
                        if (!seed) { throw `Can't replant this: doesn't have "${crop.seed}"` }

                        const placeOn = bot.env.getPlantableBlock(bot, p.xyz(bot.dimension), crop, true, true)
                        if (!placeOn) { throw `Place on is null` }

                        yield* plantSeed.plant(bot, placeOn.block, placeOn.faceVector, seed, args)
                    } catch (error) {
                        replantPositions.push({
                            position: p,
                            block: crop.cropName,
                        })
                        console.warn(`[Bot "${bot.username}"]`, error)
                    }

                } finally {
                    args.task?.blur()
                }
            }

            if (!didSomething) break
        }

        if (args.interrupt.isCancelled) { return n }

        args.task?.focus()

        yield* plantSeed.task(bot, {
            harvestedCrops: replantPositions,
            locks: [],
            ...runtimeArgs(args),
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
                        ...runtimeArgs(args),
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
