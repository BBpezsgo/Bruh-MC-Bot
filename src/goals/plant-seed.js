const { Vec3 } = require('vec3')
const AsyncGoal = require('./async-base')
const { Goal } = require('./base')
const Context = require('../context')
const { Block } = require('prismarine-block')
const { error } = require('../utils')
const GotoGoal = require('./goto')

/**
 * @extends {AsyncGoal<number>}
 */
module.exports = class PlantSeedGoal extends AsyncGoal {
    /**
     * @readonly
     * @type {Array<number> | null}
     */
    seedItems

    /**
     * @readonly
     * @type {Array<{ position: Vec3, item: string }> | null}
     */
    harvestedCrops

    /**
     * @param {Goal<any>} parent
     * @param {Array<number> | null} seedItems
     * @param {Array<{ position: Vec3; item: string; }> | null} harvestedCrops
     */
    constructor(parent, seedItems, harvestedCrops) {
        super(parent)

        this.seedItems = seedItems
        this.harvestedCrops = harvestedCrops
    }

    /**
     * @override
     * @param {Context} context
     * @returns {import('./base').AsyncGoalReturn<number>}
     */
    async run(context) {
        super.run(context)

        let palntedCount = 0

        if (this.harvestedCrops) {
            let i = 0
            while (i < this.harvestedCrops.length) {
                context.refreshTime()

                const harvestedCrop = this.harvestedCrops[i]
                console.log(`[Bot "${context.bot.username}"] ${this.indent} Try plant "${harvestedCrop.item}" at ${harvestedCrop.position}`)

                const seed = context.bot.inventory.findInventoryItem(context.mc.data.itemsByName[harvestedCrop.item].id, null, false)
                if (!seed) {
                    console.warn(`[Bot "${context.bot.username}"] ${this.indent} Can't replant this: doesn't have "${harvestedCrop.item}"`)
                    i++
                    continue
                }

                const placeOn = this.getFreeFarmland(context, harvestedCrop.position)
                if (!placeOn) {
                    console.warn(`[Bot "${context.bot.username}"] ${this.indent} Place on is null`)
                    i++
                    continue
                }

                console.log(`[Bot "${context.bot.username}"] ${this.indent} Try plant on ${placeOn.name}`)

                const plantResult = await this.plant(context, placeOn, seed)

                if ('result' in plantResult) {
                    console.log(`[Bot "${context.bot.username}"] ${this.indent} Seed ${harvestedCrop.item} successfully planted`)
                    this.harvestedCrops.splice(i, 1)
                    palntedCount++
                } else {
                    i++
                }
            }
        } else {
            if (!this.seedItems) {
                throw new Error(`"this.seedItems" is null`)
            }

            while (true) {
                context.refreshTime()
                console.log(`[Bot "${context.bot.username}"] ${this.indent} Try plant seed`)

                const seed = context.searchItem(...this.seedItems)

                if (!seed) {
                    break
                }

                const placeOn = this.getFreeFarmland(context, null)
                if (!placeOn) {
                    break
                }

                console.log(`[Bot "${context.bot.username}"] ${this.indent} Try plant ${seed.displayName} on ${placeOn.name}`)

                const plantResult = await this.plant(context, placeOn, seed)

                if ('result' in plantResult) {
                    console.log(`[Bot "${context.bot.username}"] ${this.indent} Seed successfully planted`)
                    palntedCount++
                }
            }
        }

        return { result: palntedCount }
    }

    /**
     * @private
     * @param {Context} context
     * @param {Vec3 | null} point
     */
    getFreeFarmland(context, point) {
        return context.bot.findBlock({
            matching: [
                context.mc.data.blocksByName['farmland'].id,
            ],
            point: point,
            maxDistance: 10,
            useExtraInfo: (block) => {
                const above = context.bot.blockAt(block.position.offset(0, 1, 0)).name
                return (
                    above === 'air'
                )
            },
        })
    }

    /**
     * 
     * @param {Context} context
     * @param {Block} placeOn
     * @returns {Promise<import('../result').Result<true>>}
     * @param {import("prismarine-item").Item} seedItem
     */
    async plant(context, placeOn, seedItem) {
        const above = context.bot.blockAt(placeOn.position.offset(0, 1, 0))

        if (context.quietMode) {
            return error(`${this.indent} Can't plant in quiet mode`)
        }

        if (above.name !== 'air') {
            return error(`${this.indent} Can't plant seed: block above it is "${above.name}"`)
        }

        console.log(`[Bot "${context.bot.username}"] ${this.indent} Planting seed ... Going to ${placeOn.position}`)
        const subresult = await (new GotoGoal(this, placeOn.position.clone(), 2, context.gentleMovements)).wait()
        if ('error' in subresult) return error(subresult.error)
        
        console.log(`[Bot "${context.bot.username}"] ${this.indent} Planting seed ... Equiping item`)
        await context.bot.equip(seedItem, 'hand')

        if (context.bot.heldItem) {
            console.log(`[Bot "${context.bot.username}"] ${this.indent} Planting seed ... Place block`)
            try {
                await context.bot.placeBlock(placeOn, new Vec3(0, 1, 0))
            } catch (_error) {
                return error(_error)
            }
        }

        return { result: true }
    }

    /**
     * @override
     * @param {import('../context')} context
     * @returns {string}
     */
    toReadable(context) {
        return `Plant seeds`
    }
}
