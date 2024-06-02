const { Vec3 } = require('vec3')
const AsyncGoal = require('./async-base')
const { Goal } = require('./base')
const { backNForthSort, error } = require('../utils')
const GotoGoal = require('./goto')

/**
 * @extends {AsyncGoal<number>}
 */
module.exports = class BonemealingGoal extends AsyncGoal {
    /**
     * @readonly
     * @type {Vec3 | null}
     */
    farmPosition

    /**
     * @param {Goal<any>} parent
     * @param {Vec3 | null} farmPosition
     */
    constructor(parent, farmPosition) {
        super(parent)

        this.farmPosition = farmPosition
    }

    /**
     * @override
     * @returns {import('./base').AsyncGoalReturn<number>}
     * @param {import('../context')} context
     */
    async run(context) {
        super.run(context)

        if (context.quietMode) {
            return error(`${this.indent} Can't bonemeal in quiet mode`)
        }

        let bonemeal = context.searchItem('bonemeal')
        let n = 0

        while (bonemeal) {
            context.refreshTime()

            const farmPosition = this.farmPosition ?? context.bot.entity.position.clone()

            let crops = BonemealingGoal.getCrops(context, farmPosition)

            if (crops.length === 0) { break }

            crops = backNForthSort(crops)

            bonemeal = context.searchItem('bonemeal')
            if (!bonemeal) { break }

            for (const crop of crops) {
                bonemeal = context.searchItem('bonemeal')
                if (!bonemeal) { break }

                await (new GotoGoal(this, crop.clone(), 3, context.gentleMovements)).wait()
                
                bonemeal = context.searchItem('bonemeal')
                if (!bonemeal) { break }
                
                context.bot.equip(bonemeal, 'hand')

                const cropBlock = context.bot.blockAt(crop)
                if (cropBlock && cropBlock.name !== 'air') {
                    await context.bot.activateBlock(cropBlock)
                    n++
                }
            }
        }

        return { result: n }
    }

    /**
     * @param {import('../context')} context
     * @param {Vec3 | null} farmPosition
     */
    static getCrops(context, farmPosition = null) {
        return context.bot.findBlocks({
            matching: [
                context.mc.data.blocksByName['wheat'].id,
                context.mc.data.blocksByName['carrots'].id,
                context.mc.data.blocksByName['beetroots'].id,
                context.mc.data.blocksByName['potatoes'].id,
                context.mc.data.blocksByName['melon'].id,
                context.mc.data.blocksByName['pumpkin'].id,
            ],
            useExtraInfo: (block) => {
                let goodAge = null
                switch (block.name) {
                    case 'wheat':
                    case 'carrots':
                    case 'potatoes':
                        goodAge = 7
                        break

                    case 'beetroots':
                        goodAge = 3
                        break

                    case 'melon':
                    case 'pumpkin':
                        goodAge = null
                        break

                    default:
                        return false
                }

                if (goodAge) {
                    const age = block.getProperties()['age']
                    if (!age) { return false }
                    if (typeof age !== 'number') { return false }
                    return age >= goodAge
                } else {
                    return true
                }
            },
            point: farmPosition,
        })
    }

    /**
     * @override
     * @param {import('../context')} context
     * @returns {string}
     */
    toReadable(context) {
        return `Harvest`
    }
}
