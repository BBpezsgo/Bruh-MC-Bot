const { wrap } = require('../utils/tasks')
const { backNForthSort } = require('../utils/other')
const goto = require('./goto')
const { Vec3 } = require('vec3')

/**
 * @type {import('../task').TaskDef<number, { farmPosition?: Vec3 }>}
 */
module.exports = {
    task: function*(bot, args) {
        if (bot.quietMode) {
            throw `Can't bonemeal in quiet mode`
        }

        let bonemeal = bot.searchItem('bonemeal')
        let n = 0

        while (bonemeal) {
            yield

            const farmPosition = args.farmPosition ?? bot.bot.entity.position.clone()

            let crops = bot.env.getCrops(bot, farmPosition, false)

            if (crops.length === 0) { break }

            crops = backNForthSort(crops)

            bonemeal = bot.searchItem('bonemeal')
            if (!bonemeal) { break }

            for (const crop of crops) {
                bonemeal = bot.searchItem('bonemeal')
                if (!bonemeal) { break }

                yield* goto.task(bot, {
                    block: crop.clone(),
                })
                
                bonemeal = bot.searchItem('bonemeal')
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
    id: function(args) {
        return 'bonemealing'
    },
    humanReadableId: function(args) {
        return `Bonemealing`
    }
}
