const { Vec3 } = require('vec3')
const { Block } = require('prismarine-block')
const goto = require('./goto')
const hoeing = require('./hoeing')
const Minecraft = require('../minecraft')
const { basicRouteSearch } = require('../utils/other')
const Vec3Dimension = require('../vec3-dimension')

/**
 * @param {import('../bruh-bot')} bot
 * @param {Block} placeOn
 * @param {Vec3} placeVector
 * @param {import('prismarine-item').Item} seedItem
 */
function* plant(bot, placeOn, placeVector, seedItem) {
    const above = bot.bot.blockAt(placeOn.position.offset(placeVector.x, placeVector.y, placeVector.z))

    if (bot.quietMode) {
        throw `Can't plant in quiet mode`
    }

    if (above.name !== 'air') {
        throw `Can't plant seed: block above is "${above.name}"`
    }

    yield* goto.task(bot, {
        block: placeOn.position.clone().offset(0, 0.5, 0),
    })

    yield* bot.place(placeOn, placeVector, seedItem.name, true)
}

/**
 * @type {import('../task').TaskDef<number, {
 *   fallbackToNear?: boolean;
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

        if ('harvestedCrops' in args) {
            const cropsInDimension = args.harvestedCrops.filter(v => v.position.dimension === bot.dimension)

            /** @type {Record<string, number>} */
            const seedsNeed = {}
            for (const savedCrop of basicRouteSearch(bot.bot.entity.position, cropsInDimension, v => v.position.xyz(bot.dimension))) {
                const crop = Minecraft.cropsByBlockName[savedCrop.block]
                if (!crop) { continue }
                const seedName = crop.type === 'tree' ? crop.sapling : crop.seed
                seedsNeed[seedName] ??= 0
                seedsNeed[seedName] += 1
            }

            // for (const seedName in seedsNeed) {
            //     yield* bot.ensureItem(seedName, seedsNeed[seedName])
            // }

            for (const savedCrop of basicRouteSearch(bot.bot.entity.position, cropsInDimension, v => v.position.xyz(bot.dimension))) {
                // yield
                const crop = Minecraft.cropsByBlockName[savedCrop.block]
                if (!crop) { continue }
                // console.log(`[Bot "${bot.username}"] Try plant "${savedCrop.block}" at ${savedCrop.position}`)

                const seedName = crop.type === 'tree' ? crop.sapling : crop.seed

                const at = bot.bot.blockAt(savedCrop.position.xyz(bot.dimension))

                if (at && Minecraft.replaceableBlocks[at.name] !== 'yes') {
                    console.warn(`[Bot "${bot.username}"] There is something else there`)
                    continue
                }
                if (crop.type === 'tree' &&
                    crop.size !== 'small') {
                    console.warn(`[Bot "${bot.username}"] This tree is too big to me`)
                }

                let placeOn = bot.env.getPlantableBlock(bot, savedCrop.position.xyz(bot.dimension), crop, true, false)

                if (!placeOn) {
                    console.warn(`[Bot "${bot.username}"] Can't replant "${seedName}": Couldn't find a good spot`)
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
                        })
                    } catch (error) {
                        console.error(`[Bot "${bot.username}"]`, error)
                        continue
                    }
                }

                placeOn = bot.env.getPlantableBlock(bot, savedCrop.position.xyz(bot.dimension), crop, true, false)

                if (!placeOn.isExactBlock) {
                    console.warn(`[Bot "${bot.username}"] Can't replant ${seedName}: couldn't find a good spot`)
                    continue
                }

                const seed = yield* bot.ensureItem(seedName, seedsNeed[seedName])
                if (!seed) {
                    console.warn(`[Bot "${bot.username}"] Can't replant "${savedCrop.block}": doesn't have "${seedName}"`)
                    continue
                }

                // console.log(`[Bot "${bot.username}"] Replant on ${placeOn.block.name}`)
                yield* plant(bot, placeOn.block, placeOn.faceVector, seed)
                seedsNeed[seedName] -= 1
                plantedCount++
                continue
            }
        } else {
            while (true) {
                // console.log(`[Bot "${bot.username}"] Try plant seed`)

                const seed = bot.searchInventoryItem(null, ...args.seedItems.map(v => bot.mc.registry.items[v].name))
                if (!seed) { break }

                const cropInfo = Object.values(Minecraft.cropsByBlockName).find(v => {
                    if (v.type === 'tree') {
                        return v.sapling === seed.name
                    } else {
                        return v.seed === seed.name
                    }
                })
                if (!cropInfo) { break }
                if (cropInfo.type === 'tree') { break }

                const placeOn = bot.env.getPlantableBlock(bot, bot.bot.entity.position.clone(), cropInfo, false, true)
                if (!placeOn) { break }

                // console.log(`[Bot "${bot.username}"] Plant ${seed.displayName} on ${placeOn.block.name}`)

                yield* plant(bot, placeOn.block, placeOn.faceVector, seed)

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
