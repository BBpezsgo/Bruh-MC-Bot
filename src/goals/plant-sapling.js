const Context = require('../context')
const AsyncGoal = require('./async-base')
const { Vec3 } = require('vec3')
const { Goal } = require('./base')
const { Item } = require("prismarine-item")
const { error } = require('../utils')
const GotoGoal = require('./goto')
const { Block } = require('prismarine-block')
const MC = require('../mc')

/**
 * @extends {AsyncGoal<number>}
 */
module.exports = class PlantSaplingGoal extends AsyncGoal {
    /**
     * @readonly
     * @type {Array<{ position: Vec3, item: string }> | null}
     */
    harvestedSaplings = []

    /**
     * @readonly
     * @type {boolean}
     */
    clearGrass

    /**
     * @param {Goal<any>} parent
     * @param {Array<{ position: Vec3; item: string; }> | null} harvestedSaplings
     * @param {boolean} clearGrass
     */
    constructor(parent, harvestedSaplings, clearGrass) {
        super(parent)

        this.harvestedSaplings = harvestedSaplings
        this.clearGrass = clearGrass
    }

    /**
     * @override
     * @param {Context} context
     * @returns {import('./base').AsyncGoalReturn<number>}
     */
    async run(context) {
        super.run(context)

        let plantedSaplingCount = 0

        if (this.harvestedSaplings) {
            let i = 0
            while (i < this.harvestedSaplings.length) {
                const replantPosition = this.harvestedSaplings[i]
                console.log(`${this.indent} Try plant "${replantPosition.item}" at ${replantPosition.position}`)
    
                const sapling = context.bot.inventory.findInventoryItem(context.mc.data.itemsByName[replantPosition.item].id, null, false)
                if (!sapling) {
                    console.warn(`${this.indent} Can't replant this: doesn't have "${replantPosition.item}"`)
                    i++
                    continue
                }
                
                const placeOn = this.getPlantableBlock(context, replantPosition.position)
                if (!placeOn) {
                    console.warn(`${this.indent} Place on is null`)
                    i++
                    continue
                }
    
                console.log(`${this.indent} Try plant on ${placeOn.name}`)
    
                const plantResult = await this.plant(context, placeOn, sapling)
    
                if ('result' in plantResult) {
                    console.log(`${this.indent} Sapling ${replantPosition.item} successfully planted`)
                    this.harvestedSaplings.splice(i, 1)
                    plantedSaplingCount++
                } else {
                    i++
                }
            }
        } else {
            while (true) {
                console.log(`Try plant`)

                const sapling = context.searchItem(
                    'oak_sapling',
                    'spruce_sapling',
                    'birch_sapling',
                    'jungle_sapling',
                    'acacia_sapling',
                    'mangrove_propagule',
                    'cherry_sapling',
                    'azalea',
                    'flowering_azalea'
                )

                if (!sapling) {
                    break
                }

                const placeOn = this.getPlantableBlock(context, null)
                if (!placeOn) {
                    console.warn(`${this.indent} Place on is null`)
                    break
                }
    
                console.log(`${this.indent} Try plant on ${placeOn.name}`)

                const plantResult = await this.plant(context, placeOn, sapling)
    
                if ('result' in plantResult) {
                    console.log(`${this.indent} Sapling ${sapling.name} successfully planted`)
                    plantedSaplingCount++
                } else {
                    break
                }
            }
        }

        return { result: plantedSaplingCount }
    }

    /**
     * @private
     * @param {Context} context
     * @param {Vec3 | null} point
     */
    getPlantableBlock(context, point) {
        return context.bot.findBlock({
            matching: [
                context.mc.data.blocksByName['grass_block'].id,
                context.mc.data.blocksByName['dirt'].id,
            ],
            point: point,
            maxDistance: 5,
            useExtraInfo: (block) => {
                const above = context.bot.blockAt(block.position.offset(0, 1, 0)).name
                return (
                    above === 'air' ||
                    above === 'short_grass' ||
                    above === 'tall_grass'
                )
            },
        })
    }

    /**
     * @private
     * @param {Context} context
     * @param {Block} placeOn
     * @param {Item} sapling
     * @returns {Promise<import('../result').Result<true>>}
     */
    async plant(context, placeOn, sapling) {
        const above = context.bot.blockAt(placeOn.position.offset(0, 1, 0))

        let canPlace = MC.replaceableBlocks[above.name] === 'yes'

        if (MC.replaceableBlocks[above.name] === 'break') {
            if (!this.clearGrass) {
                return error(`${this.indent} Can't replant this: block above it is "${above.name}" and I'm not allowed to clear grass`)
            }

            console.log(`${this.indent} Planting ... Going to ${placeOn.position} (destroying grass)`)
            const subresult = await (new GotoGoal(this, placeOn.position.clone(), 2, context.restrictedMovements)).wait()
            if ('error' in subresult) return error(subresult.error)
            console.log(`${this.indent} Planting ... Destroy grass`)
            await context.bot.dig(above, true)

            canPlace = true
        }

        if (!canPlace) {
            return error(`${this.indent} Can't replant this: block above it is "${above.name}"`)
        }

        console.log(`${this.indent} Planting ... Going to ${placeOn.position}`)
        const subresult = await (new GotoGoal(this, placeOn.position.clone(), 2, context.restrictedMovements)).wait()
        if ('error' in subresult) return error(subresult.error)
        console.log(`${this.indent} Planting ... Equiping item`)
        await context.bot.equip(sapling, 'hand')
        console.log(`${this.indent} Planting ... Place block`)
        await context.bot.placeBlock(placeOn, new Vec3(0, 1, 0))
        return { result: true }
    }

    /**
     * @override
     * @param {import('../context')} context
     * @returns {string}
     */
    toReadable(context) {
        return `Plant saplings`
    }
}
