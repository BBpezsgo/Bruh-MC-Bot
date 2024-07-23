const { Vec3 } = require('vec3')
const { wrap } = require('../utils/tasks')
const { Block } = require('prismarine-block')
const goto = require('./goto')
const hoeing = require('./hoeing')
const MC = require('../mc')

/**
 * @param {import('../bruh-bot')} bot
 * @param {Block} placeOn
 * @param {Vec3} placeVector
 * @param {import("prismarine-item").Item} seedItem
 */
function* plant(bot, placeOn, placeVector, seedItem) {
    const above = bot.bot.blockAt(placeOn.position.offset(placeVector.x, placeVector.y, placeVector.z))

    if (bot.quietMode) {
        throw `Can't plant in quiet mode`
    }

    if (above.name !== 'air') {
        throw `Can't plant seed: block above is "${above.name}"`
    }

    if (!bot.env.allocateBlock(bot.bot.username, above.position.clone(), 'place', { item: seedItem.type })) {
        console.log(`[Bot "${bot.bot.username}"] Seed will be planted by someone else, skipping ...`)
        return
    }

    console.log(`[Bot "${bot.bot.username}"] Planting seed ... Going to ${placeOn.position}`)
    yield* goto.task(bot, {
        destination: placeOn.position.clone(),
        range: 3,
        avoidOccupiedDestinations: true,
    })
    
    console.log(`[Bot "${bot.bot.username}"] Planting seed ... Equipping item`)
    yield* wrap(bot.bot.equip(seedItem, 'hand'))

    if (bot.bot.heldItem) {
        console.log(`[Bot "${bot.bot.username}"] Planting seed ... Place block`)
        yield* wrap(bot.bot.placeBlock(placeOn, placeVector))
    }
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
            for (const savedCrop of args.harvestedCrops) {
                yield
                const crop = MC.cropsByBlockName[savedCrop.block]
                if (!crop) { continue }
                console.log(`[Bot "${bot.bot.username}"] Try plant "${savedCrop.block}" at ${savedCrop.position}`)

                const seedName = crop.type === 'tree' ? crop.sapling : crop.seed
                const seed = bot.bot.inventory.findInventoryItem(bot.mc.data.itemsByName[seedName].id, null, false)
                if (!seed) {
                    console.warn(`[Bot "${bot.bot.username}"] Can't replant "${savedCrop.block}": doesn't have "${seedName}"`)
                    continue
                }

                const at = bot.bot.blockAt(savedCrop.position)

                if (at && MC.replaceableBlocks[at.name] !== 'yes') {
                    console.warn(`[Bot "${bot.bot.username}"] There is something else there`)
                    continue
                }
                if (crop.type === 'tree' &&
                    crop.size !== 'small') {
                    console.warn(`[Bot "${bot.bot.username}"] This tree is too big to me`)
                }

                let placeOn = bot.env.getPlantableBlock(bot, savedCrop.position, crop, true, false)

                if (!placeOn) {
                    console.warn(`[Bot "${bot.bot.username}"] Can't replant "${seed.name}": couldn't find a good spot`)
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
                                block: placeOn.block.position.clone(),
                                gatherTool: false,
                            })
                        } catch (error) {
                            console.error(error)
                            continue
                        }
                }

                placeOn = bot.env.getPlantableBlock(bot, savedCrop.position, crop, true, false)

                if (!placeOn.isExactBlock) {
                    console.warn(`[Bot "${bot.bot.username}"] Can't replant ${seed.name}: couldn't find a good spot`)
                    continue
                }

                console.log(`[Bot "${bot.bot.username}"] Replant on ${placeOn.block.name}`)
                yield* plant(bot, placeOn.block, placeOn.faceVector, seed)
                plantedCount++
                continue
            }
        } else {
            while (true) {
                console.log(`[Bot "${bot.bot.username}"] Try plant seed`)

                const seed = bot.searchItem(...args.seedItems)
                if (!seed) { break }

                const cropInfo = Object.values(MC.cropsByBlockName).find(v => {
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

                console.log(`[Bot "${bot.bot.username}"] Plant ${seed.displayName} on ${placeOn.block.name}`)

                yield* plant(bot, placeOn.block, placeOn.faceVector, seed)

                plantedCount++
            }
        }

        return plantedCount
    },
    id: function(args) {
        return `plant-seed`
    },
    humanReadableId: function(args) {
        return `Planting seeds`
    },
    plant: plant,
}
