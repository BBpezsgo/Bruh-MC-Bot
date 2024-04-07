const AsyncGoal = require('./async-base')
const { Goal } = require('./base')
const GatherItemGoal = require('./gather-item')
const { error, sortCosts, costDepth } = require('../utils')
const MC = require('../mc')
const GotoBlockGoal = require('./goto-block')
const SmeltGoal = require('./smelt')

/**
 * @extends {AsyncGoal<'have' | import('minecraft-data').Food>}
 */
module.exports = class GatherFood extends AsyncGoal {
    /**
     * @type {boolean}
     * @readonly
     */
    force

    /**
     * @param {Goal<any>} parent
     * @param {boolean} force
     */
    constructor(parent, force) {
        super(parent)

        this.force = force
    }

    /**
     * @override
     * @returns {import('./base').AsyncGoalReturn<'have' | import('minecraft-data').Food>}
     * @param {import('../context')} context
     */
    async run(context) {
        super.run(context)

        const canCook = context.bot.findBlock({
            matching: [ 'furnace', 'lit_furnace', 'smoker', 'lit_smoker', 'campfire' ].filter(name => context.bot.registry.blocksByName[name]).map(name => context.bot.registry.blocksByName[name].id),
            maxDistance: 32,
        }) ? true : false

        const foods = context.mc.getGoodFoods(!canCook)

        /*
        const foodCosts = [ ]
        for (const food of foods) {
            const cost = await GatherItemGoal.itemCost(context, food.id, 1, false, Math.max(this.depth, costDepth - 5))
            foodCosts.push({
                food: food,
                cost: cost,
            })
        }

        sortCosts(foodCosts)
        */

        for (const food of foods) {
            const foodRecipes = context.bot.recipesAll(food.id, null, true)
            if (foodRecipes.length > 0) {
                for (const foodRecipe of foodRecipes) {
                    if (!foodRecipe.ingredients) {
                        continue
                    }
                    let hasEverything = true
                    for (const ingredient of foodRecipe.ingredients) {
                        const has = context.bot.inventory.count(ingredient.id, null)
                        if (has < ingredient.count) {
                            hasEverything = false
                            break
                        }
                    }

                    if (hasEverything) {
                        const result = await (new GatherItemGoal(this, food.id, 1, this.force, false, false)).wait()
                        if ('result' in result) {
                            if (result.result === 'have') {
                                return { result: 'have' }
                            } else {
                                return { result: food }
                            }
                        }
                    }
                }
            }

            const result = await (new GatherItemGoal(this, food.id, 1, this.force, false, true)).wait()
            if ('result' in result) {
                if (result.result === 'have') {
                    return { result: 'have' }
                } else {
                    return { result: food }
                }
            }
        }

        return error(`${this.indent} Failed to gather food`)
    }

    /**
     * @override
     * @param {import('../context')} context
     * @returns {string}
     */
    toReadable(context) {
        return `Gather food`
    }
}
