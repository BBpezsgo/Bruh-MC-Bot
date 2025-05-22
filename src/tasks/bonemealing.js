'use strict'

const Minecraft = require('../minecraft')
const { wrap, runtimeArgs } = require('../utils/tasks')
const { backNForthSort } = require('../utils/other')
const goto = require('./goto')
const Vec3Dimension = require('../utils/vec3-dimension')
const config = require('../config')
const GameError = require('../errors/game-error')
const PermissionError = require('../errors/permission-error')

/**
 * @type {import('../task').TaskDef<number, {
 *   farmPosition?: Vec3Dimension;
 * }>}
 */
module.exports = {
    task: function*(bot, args) {
        if (args.interrupt.isCancelled) { return 0 }
        if (bot.quietMode) { throw new PermissionError(`Can't bonemeal in quiet mode`) }

        let bonemeal = bot.inventory.searchInventoryItem(null, 'bonemeal')
        let n = 0

        while (bonemeal) {
            yield

            if (args.farmPosition) {
                yield* goto.task(bot, {
                    dimension: args.farmPosition.dimension,
                    ...runtimeArgs(args),
                })
            }

            if (args.interrupt.isCancelled) { break }

            const farmPosition = args.farmPosition.xyz(bot.dimension) ?? bot.bot.entity.position.clone()

            let crops = yield* bot.env.getCrops(bot, farmPosition, false, 1, config.bonemealing.cropSearchRadius)
                .filter(v => Minecraft.cropsByBlockName[v.name].canUseBonemeal)
                .map(v => v.position)
                .toArrayAsync()

            if (crops.length === 0) { break }

            crops = backNForthSort(crops)

            bonemeal = bot.inventory.searchInventoryItem(null, 'bonemeal')
            if (!bonemeal) { break }

            for (const crop of crops) {
                bonemeal = bot.inventory.searchInventoryItem(null, 'bonemeal')
                if (!bonemeal) { break }

                yield* goto.task(bot, {
                    block: crop,
                    ...runtimeArgs(args),
                })

                if (args.interrupt.isCancelled) { break }

                bonemeal = bot.inventory.searchInventoryItem(null, 'bonemeal')
                if (!bonemeal) { break }

                bot.bot.equip(bonemeal, 'hand')

                const cropBlock = bot.bot.blocks.at(crop)
                if (cropBlock && cropBlock.name !== 'air') {
                    // @ts-ignore
                    yield* wrap(bot.bot.activateBlock({ position: crop }), args.interrupt)
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
