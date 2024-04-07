const { Vec3 } = require('vec3')
const AsyncGoal = require('./async-base')
const { Goal } = require('./base')
const { backNForthSort } = require('../utils')
const GotoGoal = require('./goto')
const PickupItemGoal = require('./pickup-item')
const PlantSeedGoal = require('./plant-seed')

module.exports = class HarvestGoal extends AsyncGoal {
    /**
     * @readonly
     * @type {Vec3 | null}
     */
    farmPosition

    /**
     * @readonly
     * @type {Array<{ position: Vec3, item: string }> | null}
     */
    harvestedCrops

    /**
     * @param {Goal<any>} parent
     * @param {Vec3 | null} farmPosition
     * @param {Array<{ position: Vec3; item: string; }> | null} harvestedCrops
     */
    constructor(parent, farmPosition, harvestedCrops) {
        super(parent)

        this.farmPosition = farmPosition
        this.harvestedCrops = harvestedCrops
    }

    /**
     * @override
     * @returns {import('./base').AsyncGoalReturn<true>}
     * @param {import('../context')} context
     */
    async run(context) {
        super.run(context)

        /**
         * @type {Array<{ position: Vec3; item: string; }>}
         */
        const harvestedCrops = []

        while (true) {
            const farmPosition = this.farmPosition ?? context.bot.entity.position.clone()

            let crops = HarvestGoal.getCrops(context, farmPosition)

            if (crops.length === 0) { break }

            crops = backNForthSort(crops)

            for (const crop of crops) {
                await (new GotoGoal(this, crop.clone(), 3, context.gentleMovements)).wait()
                const cropBlock = context.bot.blockAt(crop)
                if (cropBlock) {

                    const cropSeed = context.getCropSeed(cropBlock)
                    if (cropSeed) {
                        let isSaved = false

                        for (const harvestedCrop of harvestedCrops) {
                            if (harvestedCrop.position.equals(crop)) {
                                isSaved = true
                                break
                            }
                        }

                        if (!isSaved) {
                            harvestedCrops.push({ position: crop.clone(), item: context.mc.data.items[cropSeed].name })
                        }
                    }

                    await context.bot.dig(cropBlock)
                }
            }

            await (new PickupItemGoal(this, { inAir: true, maxDistance: 8, point: farmPosition }, null)).wait()
        }

        await (new PlantSeedGoal(this, null, harvestedCrops)).wait()

        if (this.harvestedCrops) {
            this.harvestedCrops.push(...harvestedCrops)
        }

        return { result: true }
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
