const Minecraft = require('../minecraft')
const { wrap } = require('../utils/tasks')
const { backNForthSort } = require('../utils/other')
const goto = require('./goto')
const Vec3Dimension = require('../vec3-dimension')
const config = require('../config')

/**
 * @type {import('../task').TaskDef<number, { farmPosition?: Vec3Dimension }>}
 */
module.exports = {
    task: function*(bot, args) {
        if (args.cancellationToken.isCancelled) { return 0 }
        if (bot.quietMode) { throw `Can't bonemeal in quiet mode` }

        let bonemeal = bot.searchInventoryItem(null, 'bonemeal')
        let n = 0

        while (bonemeal) {
            yield

            if (args.farmPosition) {
                yield* goto.task(bot, {
                    dimension: args.farmPosition.dimension,
                    cancellationToken: args.cancellationToken,
                })
            }

            if (args.cancellationToken.isCancelled) { break }

            const farmPosition = args.farmPosition.xyz(bot.dimension) ?? bot.bot.entity.position.clone()

            let crops = bot.env.getCrops(bot, farmPosition, false, 1, config.bonemealing.cropSearchRadius)
                .filter(v => Minecraft.cropsByBlockName[v.name].canUseBonemeal)
                .map(v => v.position)
                .toArray()

            if (crops.length === 0) { break }

            crops = backNForthSort(crops)

            bonemeal = bot.searchInventoryItem(null, 'bonemeal')
            if (!bonemeal) { break }

            for (const crop of crops) {
                bonemeal = bot.searchInventoryItem(null, 'bonemeal')
                if (!bonemeal) { break }

                yield* goto.task(bot, {
                    block: crop,
                    cancellationToken: args.cancellationToken,
                })

                if (args.cancellationToken.isCancelled) { break }

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
