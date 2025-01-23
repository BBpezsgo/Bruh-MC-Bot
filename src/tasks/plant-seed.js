'use strict'

const { Vec3 } = require('vec3')
const { Block } = require('prismarine-block')
const goto = require('./goto')
const hoeing = require('./hoeing')
const Minecraft = require('../minecraft')
const { basicRouteSearch, isItemEquals } = require('../utils/other')
const Vec3Dimension = require('../utils/vec3-dimension')
const Freq = require('../utils/freq')
const { runtimeArgs } = require('../utils/tasks')
const GameError = require('../errors/game-error')
const PermissionError = require('../errors/permission-error')
const EnvironmentError = require('../errors/environment-error')

/**
 * @param {import('../bruh-bot')} bot
 * @param {Block} placeOn
 * @param {Vec3} placeVector
 * @param {import('prismarine-item').Item} seedItem
 * @param {import('../task').RuntimeArgs<{}>} args
 */
function* plant(bot, placeOn, placeVector, seedItem, args) {
    const above = bot.bot.blocks.at(placeOn.position.offset(placeVector.x, placeVector.y, placeVector.z))

    if (bot.quietMode) { throw new PermissionError(`Can't plant in quiet mode`) }

    if (above.name !== 'air') { throw new EnvironmentError(`Can't plant seed: block above is "${above.name}"`) }

    yield* goto.task(bot, {
        block: placeOn.position.clone().offset(0, 0.5, 0),
        ...runtimeArgs(args),
    })

    if (args.interrupt.isCancelled) { return }

    yield* bot.place(placeOn, placeVector, seedItem.name, true)
}

/**
 * @type {import('../task').TaskDef<number, {
 *   fallbackToNear?: boolean;
 *   locks: ReadonlyArray<import('../locks/item-lock')>;
* } & ({
 *   harvestedCrops: ReadonlyArray<import('../environment').SavedCrop>;
 * } | {
 *   seedItems: ReadonlyArray<number>;
 * })> & {
 *   plant: plant;
 * }}
 */
module.exports = {
    task: function*(bot, args) {
        let plantedCount = 0

        if (args.interrupt.isCancelled) { return plantedCount }

        if ('harvestedCrops' in args) {
            const cropsInDimension = args.harvestedCrops.filter(v => v.position.dimension === bot.dimension)

            // const seedsNeed = new Freq(isItemEquals)
            // for (const savedCrop of basicRouteSearch(bot.bot.entity.position, cropsInDimension, v => v.position.xyz(bot.dimension))) {
            //     const crop = Minecraft.cropsByBlockName[savedCrop.block]
            //     if (!crop) { continue }
            //     seedsNeed.add(crop.seed, 1)
            // }

            for (const savedCrop of basicRouteSearch(bot.bot.entity.position, cropsInDimension, v => v.position.xyz(bot.dimension))) {
                if (args.interrupt.isCancelled) { break }

                yield
                const crop = Minecraft.cropsByBlockName[savedCrop.block]
                if (!crop) { continue }
                // console.log(`[Bot "${bot.username}"] Try plant "${savedCrop.block}" at ${savedCrop.position}`)

                const at = bot.bot.blocks.at(savedCrop.position.xyz(bot.dimension))

                if (at && Minecraft.replaceableBlocks[at.name] !== 'yes') {
                    console.warn(`[Bot "${bot.username}"] There is something else there (${at.name})`)
                    continue
                }
                if (crop.type === 'tree' &&
                    crop.size !== 'small') {
                    console.warn(`[Bot "${bot.username}"] This tree is too big to me`)
                }

                let placeOn = bot.env.getPlantableBlock(bot, savedCrop.position.xyz(bot.dimension), crop, true, false)

                if (!placeOn) {
                    console.warn(`[Bot "${bot.username}"] Can't replant "${crop.seed}": There is already something else`)
                    continue
                }

                if (!placeOn.isExactBlock &&
                    crop.growsOnBlock !== 'solid' &&
                    crop.growsOnBlock.length === 1 &&
                    crop.growsOnBlock[0] === 'farmland' &&
                    (
                        placeOn.block.name === 'dirt' ||
                        placeOn.block.name === 'grass_block' ||
                        placeOn.block.name === 'dirt_path'
                    )) {
                    try {
                        yield* hoeing.task(bot, {
                            block: new Vec3Dimension(placeOn.block.position, bot.dimension),
                            gatherTool: false,
                            ...runtimeArgs(args),
                        })
                    } catch (error) {
                        console.error(`[Bot "${bot.username}"]`, error)
                        continue
                    }
                }

                if (args.interrupt.isCancelled) { break }

                placeOn = bot.env.getPlantableBlock(bot, savedCrop.position.xyz(bot.dimension), crop, true, false)

                if (!placeOn.isExactBlock) {
                    console.warn(`[Bot "${bot.username}"] Can't replant ${crop.seed}: couldn't find a good spot`)
                    continue
                }

                const seed = yield* bot.ensureItem({
                    ...runtimeArgs(args),
                    item: crop.seed,
                    count: 1,
                })
                if (!seed) {
                    console.warn(`[Bot "${bot.username}"] Can't replant "${savedCrop.block}": doesn't have "${crop.seed}"`)
                    continue
                }

                // console.log(`[Bot "${bot.username}"] Replant on ${placeOn.block.name}`)
                yield* plant(bot, placeOn.block, placeOn.faceVector, seed, {
                    ...runtimeArgs(args),
                })
                // seedsNeed.add(crop.seed, -1)
                plantedCount++
                continue
            }
        } else {
            debugger
            while (true) {
                yield
                if (args.interrupt.isCancelled) { break }

                // console.log(`[Bot "${bot.username}"] Try plant seed`)

                const seed = bot.searchInventoryItem(null, ...args.seedItems.map(v => bot.mc.registry.items[v].name))
                if (!seed) { break }

                const cropInfo = Object.values(Minecraft.cropsByBlockName).find(v => v.seed === seed.name)
                if (!cropInfo) { break }
                if (cropInfo.type === 'tree') { break }

                const placeOn = bot.env.getPlantableBlock(bot, bot.bot.entity.position.clone(), cropInfo, false, true)
                if (!placeOn) { break }

                // console.log(`[Bot "${bot.username}"] Plant ${seed.displayName} on ${placeOn.block.name}`)

                yield* plant(bot, placeOn.block, placeOn.faceVector, seed, {
                    ...runtimeArgs(args),
                })

                plantedCount++
            }
        }

        return plantedCount
    },
    id: function() {
        return `plant-seed`
    },
    humanReadableId: function() {
        return `Planting seeds`
    },
    definition: 'plantSeed',
    plant: plant,
}
