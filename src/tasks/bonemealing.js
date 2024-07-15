const { Vec3 } = require('vec3')
const { wrap } = require('../utils/tasks')
const { backNForthSort } = require('../utils/other')
const goto = require('./goto')
const { Block } = require('prismarine-block')

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

            const farmPosition = this.farmPosition ?? bot.bot.entity.position.clone()

            let crops = bot.env.getCrops(farmPosition, false)

            if (crops.length === 0) { break }

            crops = backNForthSort(crops)

            bonemeal = bot.searchItem('bonemeal')
            if (!bonemeal) { break }

            for (const crop of crops) {
                bonemeal = bot.searchItem('bonemeal')
                if (!bonemeal) { break }

                yield* goto.task(bot, {
                    destination: crop.clone(),
                    range: 3,
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
