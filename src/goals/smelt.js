const { Recipe } = require('prismarine-recipe')
const AsyncGoal = require('./async-base')
const { Goal } = require('./base')
const GotoBlockGoal = require('./goto-block')
const { error } = require('../utils')
const Wait = require('./wait')
const GatherItemGoal = require('./gather-item')
const { Item } = require('prismarine-item')
const { Block } = require('prismarine-block')
const PickupItemGoal = require('./pickup-item')
const { Entity } = require('prismarine-entity')

/**
 * @extends {AsyncGoal<Item>}
 */
module.exports = class SmeltGoal extends AsyncGoal {
    /**
     * @readonly
     * @type {Array<import('../mc-data').CookingRecipe>}
     */
    recipes

    /**
     * @readonly
     * @type {boolean}
     */
    noFuel

    /**
     * @param {Goal<any> | null} parent
     * @param {Array<import("../mc-data").CookingRecipe>} recipes
     * @param {boolean} noFuel
     */
    constructor(parent, recipes, noFuel) {
        super(parent)

        this.recipes = recipes
        this.noFuel = noFuel
    }

    /**
     * @override
     * @returns {import('./base').AsyncGoalReturn<Item>}
     * @param {import('../context')} context
     */
    async run(context) {
        super.run(context)

        const fuels = context.mc.data2.sortedFuels.filter(fuel => !fuel.no)

        const best = SmeltGoal.findBestFurnace(context, this.recipes, this.noFuel)

        if (!best) {
            return error(`${this.indent} No furnaces found`)
        }

        const furnaceBlock = best.furnaceBlock
        const bestRecipes = best.recipes

        if (!furnaceBlock) {
            return error(`${this.indent} No furnaces found`)
        }

        await (new GotoBlockGoal(this, furnaceBlock.position.clone(), context.restrictedMovements)).wait()
            
        if (!furnaceBlock) {
            return error(`${this.indent} Furnace disappeared`)
        }

        for (const recipe of bestRecipes) {
            if (recipe.type === 'campfire') {
                const campfireResult = await this.doCampfire(context, furnaceBlock, recipe)
                if ('result' in campfireResult) {
                    return { result: null }
                }
                continue
            }

            let furnace = await context.bot.openFurnace(furnaceBlock)

            while (furnace.inputItem() && furnace.fuel > 0) {
                await (new Wait(this, 1000)).wait()
            }

            {
                const inputItem = furnace.inputItem()
                if (inputItem) {
                    context.bot.chat(`There are ${inputItem.count} of ${inputItem.displayName} waiting in a ${furnaceBlock.displayName} but there is no fuel. Should I take it out?`)
                    const resp = await context.awaitYesNoResponse(10000)
                    if (!resp || resp.message) {
                        await furnace.takeInput()
                    } else {
                        furnace.close()
                        return error(`${this.indent} Cancelled`)
                    }
                }
            }

            {
                const outputItem = furnace.outputItem()
                if (outputItem) {
                    context.bot.chat(`There are ${outputItem.count} of ${outputItem.displayName} finished in a ${furnaceBlock.displayName} but there is no fuel. Should I take it out?`)
                    const resp = await context.awaitYesNoResponse(10000)
                    if (!resp || resp.message) {
                        await furnace.takeOutput()
                    } else {
                        furnace.close()
                        return error(`${this.indent} Cancelled`)
                    }
                }
            }

            if (!furnace.fuelItem()) {
                furnace.close()

                const fuelResult = await this.gatherFuel(context)

                if ('error' in fuelResult) {
                    return fuelResult
                }

                if (!furnaceBlock) {
                    return error(`${this.indent} Furnace disappeared`)
                }

                furnace = await context.bot.openFurnace(furnaceBlock)
    
                for (const fuel of fuels) {
                    const have = context.searchItem(fuel.item)
                    if (have) {
                        await furnace.putFuel(have.type, null, 1)
                        break
                    }
                }

                if (furnace.fuel <= 0 && !furnace.fuelItem()) {
                    furnace.close()
                    return error(`${this.indent} Failed to gather fuel`)
                }
            }

            for (const ingredient of recipe.ingredient) {
                const _i = context.mc.data.itemsByName[ingredient]
                if (!_i) {
                    console.warn(`[Bot "${context.bot.username}"] ${this.indent} Unknown ingredient "${ingredient}"`)
                    continue
                }
                if (!context.searchItem(_i.id)) {
                    continue
                }
                await furnace.putInput(_i.id, null, 1)
                break
            }

            if (!furnace.inputItem()) {
                furnace.close()
                continue
            }

            while (!furnace.outputItem()) {
                if (furnace.fuel <= 0 && !furnace.fuelItem()) {
                    furnace.close()
    
                    const fuelResult = await this.gatherFuel(context)
    
                    if ('error' in fuelResult) {
                        return fuelResult
                    }
    
                    if (!furnaceBlock) {
                        return error(`${this.indent} Furnace disappeared`)
                    }

                    furnace = await context.bot.openFurnace(furnaceBlock)
    
                    for (const fuel of fuels) {
                        const have = context.searchItem(fuel.item)
                        if (have) {
                            await furnace.putFuel(have.type, null, 1)
                            break
                        }
                    }
    
                    if (furnace.fuel <= 0 && !furnace.fuelItem()) {
                        furnace.close()
                        return error(`${this.indent} Failed to gather fuel`)
                    }
                }
    
                await (new Wait(this, 1000)).wait()
            }

            const output = await furnace.takeOutput()

            if (!output) {
                furnace.close()
                return error(`${this.indent} Failed to smelt item`)
            }

            if (furnace.inputItem()) {
                await furnace.takeInput()
            }

            furnace.close()
            return { result: output }
        }

        return error(`${this.indent} I can't smelt`)
    }

    /**
     * @param {import('../context')} context
     * @returns {Promise<import('../result').Result<'have' | 'digged' | 'looted' | 'crafted' | 'smelted'>>}
     */
    async gatherFuel(context) {
        const fuels = context.mc.data2.sortedFuels.filter(fuel => !fuel.no)
       
        for (const fuel of fuels) {
            const have = context.searchItem(fuel.item)
            if (have) {
                return { result: 'have' }
            }
        }

        for (const fuel of fuels) {
            const gatherResult = await (new GatherItemGoal(this, context.mc.data.itemsByName[fuel.item].id, 1, false, false, false)).wait()
            if ('result' in gatherResult) {
                return gatherResult
            }
        }

        return error(`${this.indent} Failed to gather fuel`)
    }

    /**
     * @param {import('../context')} context
     * @param {Array<(import('../mc-data').SmeltingRecipe | import('../mc-data').SmokingRecipe | import('../mc-data').BlastingRecipe | import('../mc-data').CampfireRecipe)> | null} recipes
     * @param {boolean} noFuel
     */
    static findBestFurnace(context, recipes, noFuel) {
        let bestFurnaceId = -1
        /**
         * @type {Array<(import('../mc-data').SmeltingRecipe | import('../mc-data').SmokingRecipe | import('../mc-data').BlastingRecipe | import('../mc-data').CampfireRecipe)>}
         */
        let _recipes = [ ]
        let bestFurnace = null

        for (const recipe of recipes) {
            /**
             * @type {string}
             */
            let goodFurnace
            let needFuel

            switch (recipe.type) {
                case 'blasting':
                    goodFurnace = 'blast_furnace'
                    needFuel = true
                    break
                case 'smelting':
                    goodFurnace = 'furnace'
                    needFuel = true
                    break
                case 'smoking':
                    goodFurnace = 'smoker'
                    needFuel = true
                    break
                case 'campfire':
                    goodFurnace = 'campfire'
                    needFuel = false
                    break
                default:
                    continue
            }

            if (needFuel && noFuel) {
                continue
            }

            const furnaceId = context.mc.data.blocksByName[goodFurnace]?.id

            if (furnaceId === bestFurnaceId) {
                _recipes.push(recipe)
            } else {
                const furnaceBlock = context.bot.findBlock({
                    matching: (block) => {
                        if (block.type !== furnaceId) { return false }
                        if (goodFurnace === 'campfire') {
                            if (!block.getProperties()['lit']) { return false }
                        }
                        return true
                    },
                    maxDistance: 32,
                })
                if (furnaceBlock) {
                    bestFurnace = furnaceBlock
                    bestFurnaceId = furnaceId
                    _recipes = [ recipe ]
                }
            }
        }

        if (bestFurnace && _recipes.length > 0) {
            return {
                furnaceBlock: bestFurnace,
                recipes: _recipes,
            }
        }
        return null
    }

    /**
     * @param {import('../context')} context
     * @param {Block} campfire
     * @param {import('../mc-data').CampfireRecipe} recipe
     * @returns {Promise<import('../result').Result<true>>}
     */
    async doCampfire(context, campfire, recipe) {
        let item
        const result = context.mc.data.itemsByName[recipe.result]

        if (!campfire.getProperties()['lit']) {
            return error(`${this.indent} This campfire is out`)
        }

        const finishingWait = 1000

        if (!result) {
            return error(`qa`)
        }

        for (const ingredient of recipe.ingredient) {
            const _i = context.mc.data.itemsByName[ingredient]
            if (!_i) {
                console.warn(`[Bot "${context.bot.username}"] ${this.indent} Unknown ingredient "${ingredient}"`)
                continue
            }
            item = context.searchItem(_i.id)
            if (item) {
                break
            }
        }

        if (!item) {
            return error(`${this.indent} No ingredient`)
        }

        let pickedUp = false

        /**
         * @param {Entity} collector
         * @param {Entity} collected
         */
        function onPickUp(collector, collected) {
            if (!collected) { return }
            if (!collector) { return }
            if (collector.displayName !== context.bot.entity.displayName) { return }
            const dropped = collected.getDroppedItem()
            if (!dropped) { return }
            if (dropped.type !== result.id) { return }
            console.log(`[Bot "${context.bot.username}"] Item ${dropped.displayName} collected`)
            pickedUp = true
            context.bot.removeListener('playerCollect', onPickUp)
        }

        await context.bot.equip(item, 'hand')
        await context.bot.activateBlock(campfire)
        context.bot.addListener('playerCollect', onPickUp)

        const startedAt = performance.now()
        const cookTime = recipe.time * 1000

        const itemFilter = { inAir: true, point: campfire.position }

        while (true) {
            const waited = performance.now() - startedAt
            if (waited - cookTime > finishingWait) {
                if (!pickedUp) {
                    context.bot.removeListener('playerCollect', onPickUp)
                    return error(`${this.indent} This isn't cooking`)
                } else {
                    return { result: true }
                }
            }

            await (new Wait(this, 1000)).wait()
            if ('result' in PickupItemGoal.getClosestItem(context, null, itemFilter)) {
                await (new PickupItemGoal(this, itemFilter, null)).wait()
            }
        }
    }

    /**
     * @override
     * @param {import('../context')} context
     * @returns {string}
     */
    toReadable(context) {
        return `Cook`
    }
}
