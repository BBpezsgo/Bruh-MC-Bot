const { wrap } = require('../utils/tasks')
const { backNForthSort } = require('../utils/other')
const goto = require('./goto')
const Vec3Dimension = require('../vec3-dimension')

/**
 * @type {import('../task').TaskDef<number, { farmPosition?: Vec3Dimension }>}
 */
module.exports = {
    task: function*(bot, args) {
        if (bot.quietMode) {
            throw `Can't bonemeal in quiet mode`
        }

        let bonemeal = bot.searchInventoryItem(null, 'bonemeal')
        let n = 0

        while (bonemeal) {
            yield

            if (args.farmPosition) {
                yield* goto.task(bot, { dimension: args.farmPosition.dimension })
            }

            const farmPosition = args.farmPosition.xyz(bot.dimension) ?? bot.bot.entity.position.clone()

            let crops = bot.env.getCrops(bot, farmPosition, false)

            if (crops.length === 0) { break }

            crops = backNForthSort(crops)

            bonemeal = bot.searchInventoryItem(null, 'bonemeal')
            if (!bonemeal) { break }

            for (const crop of crops) {
                bonemeal = bot.searchInventoryItem(null, 'bonemeal')
                if (!bonemeal) { break }

                yield* goto.task(bot, {
                    block: crop,
                })
                
                bonemeal = bot.searchInventoryItem(null, 'bonemeal')
                if (!bonemeal) { break }
                
                bot.bot.equip(bonemeal, 'hand')

                const cropBlock = bot.bot.blockAt(crop)
                if (cropBlock && cropBlock.name !== 'air') {
                    yield* wrap(bot.bot.activateBlock(cropBlock))
                    n++
                }
            }
        }

        return n
    },
    id: 'bonemealing',
    humanReadableId: `Bonemealing`,
    definition: 'bonemealing',
}
