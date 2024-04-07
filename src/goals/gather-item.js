const { Goal } = require('./base')
const { Block } = require('prismarine-block')
const GotoBlockGoal = require('./goto-block')
const PlaceBlockAnywhereGoal = require('./place-block')
const AsyncGoal = require('./async-base')
const { error, costDepth, sortCosts } = require('../utils')
const AttackGoal = require('./attack')
const GotoGoal = require('./goto')
const PickupItemGoal = require('./pickup-item')
const { Item } = require('prismarine-item')
const { Recipe } = require('prismarine-recipe')

/**
 * @extends {AsyncGoal<'have' | 'digged' | 'looted' | 'crafted' | 'smelted'>}
 */
module.exports = class GatherItemGoal extends AsyncGoal {
    /**
     * @type {number}
     */
    count

    /**
     * @type {number}
     */
    item

    /**
     * @type {Array<number>}
     */
    baseItems

    /**
     * @readonly
     * @type {number}
     */
    originalCount

    /**
     * @type {boolean}
     * @readonly
     */
    force

    /**
     * @readonly
     * @type {boolean}
     */
    canDig

    /**
     * @readonly
     * @type {boolean}
     */
    canKill

    /**
     * @param {Goal<any>} parent
     * @param {number} item
     * @param {number} count
     * @param {boolean} force
     * @param {boolean} canDig
     * @param {boolean} canKill
     * @param {Array<number>} baseItems
     */
    constructor(parent, item, count, force, canDig, canKill, ...baseItems) {
        super(parent)

        this.item = item
        this.count = count
        this.force = force

        this.canDig = canDig
        this.canKill = canKill

        this.baseItems = baseItems
    }

    /**
     * @override
     * @returns {import('./base').AsyncGoalReturn<'have' | 'digged' | 'looted' | 'crafted' | 'smelted'>}
     * @param {import('../context')} context
     */
    async run(context) {
        super.run(context)

        // @ts-ignore
        this.originalCount = context.itemCount(this.item)

        console.log(`${this.indent} Gathering ${this.count} of "${context.mc.data.items[this.item]?.displayName ?? this.item}" ...`)

        let requiredCount = this.requiredCount(context)
        console.log(`${this.indent} Required ${requiredCount}`)

        if (requiredCount <= 0) {
            console.log(`${this.indent} Already have`)
            return { result: 'have' }
        }

        let endlessSafe = 50
        const hasRecipe = context.bot.recipesAll(this.item, null, true).length > 0
        console.log(`${this.indent} Has recipe:`, hasRecipe)

        while (requiredCount > 0) {
            let requiredCount = this.requiredCount(context)

            endlessSafe--
            if (endlessSafe <= 0) {
                return error(`${this.indent} Endless loop`)
            }

            if (requiredCount <= 0) {
                console.log(`${this.indent} Item ${context.mc.data.items[this.item]?.displayName ?? this.item} successfully gathered`)
                break
            }

            let fromEnvResult = null
            if (!hasRecipe) {
                fromEnvResult = await this.gatherFromEnvironment(context, requiredCount)
                if ('result' in fromEnvResult) {
                    return fromEnvResult
                }
                
                const SmeltGoal = require('./smelt')
    
                const cookingRecipes = context.getCookingRecipesFromResult(this.item)
                const best = SmeltGoal.findBestFurnace(context, cookingRecipes, true)
        
                if (best) {
                    let hasRecipe = false
                    for (const recipe of best.recipes) {
                        if (context.searchItem(...recipe.ingredient)) {
                            hasRecipe = true
                        }
                    }
                    
                    if (!hasRecipe) {
                        for (const recipe of best.recipes) {
                            for (const ingredient of recipe.ingredient) {
                                const gatherResult = await (new GatherItemGoal(this, context.mc.data.itemsByName[ingredient].id, requiredCount, false, this.canDig, this.canKill, this.item, ...this.baseItems)).wait()
                                if ('result' in gatherResult) {
                                    hasRecipe = true
                                    break
                                }
                            }
                        }
                    }

                    const smeltResult = await (new SmeltGoal(this, context.getCookingRecipesFromResult(this.item), true)).wait()
                    if ('result' in smeltResult) {
                        return { result: 'smelted' }
                    }
                }
            }

            if (this.baseItems.includes(this.item)) {
                return error(`${this.indent} Recursive recipe`)
            }

            const craftResult = await this.craft(context, requiredCount)
            if ('error' in craftResult) {
                if (fromEnvResult) {
                    return fromEnvResult
                }
                return craftResult
            }

            continue
        }

        console.log(`${this.indent} Item ${context.mc.data.items[this.item]?.displayName ?? this.item} successfully crafted`)
        return { result: 'crafted' }
    }

    /**
     * @param {import('../context')} context
     */
    getDelta(context) {
        const have = context.itemCount(this.item)
        return have - this.originalCount
    }

    /**
     * @param {import('../context')} context
     * @param {number} requiredCount
     * @returns {import('./base').AsyncGoalReturn<'digged' | 'looted'>}
     */
    async gatherFromEnvironment(context, requiredCount) {
        if (!this.canDig && !this.canKill) {
            return error(`${this.indent} Can't gather "${context.mc.data.items[this.item]?.displayName ?? this.item}" because I'm not allowed to dig or kill`)
        }

        while (true) {
            const block = context.findBlockWithDrop(this.item, 16)

            if (block && this.canDig) {
                console.log(`${this.indent} Digging ${context.mc.data.items[this.item]?.displayName ?? this.item} ...`)
        
                const DigGoal = require('./dig')
                const digged = await (new DigGoal(this, block, true)).wait()
                if ('error' in digged) return error(digged.error)

                const _requiredCount = this.requiredCount(context)
                if (_requiredCount === requiredCount) {
                    return error(`${this.indent} Failed to dig ${block.displayName}`)
                }
                requiredCount = _requiredCount

                if (requiredCount <= 0) {
                    console.log(`${this.indent} Item ${context.mc.data.items[this.item]?.displayName ?? this.item} successfully gathered`)
                    return { result: 'digged' }
                }

                if (!digged.result) {
                    return error(`${this.indent} Failed to dig ${block.displayName}`)
                }

                continue
            }

            const entity = context.findEntityWithDrop(this.item)

            if (entity && this.canKill) {
                console.log(`${this.indent} Looting ${context.mc.data.items[this.item]?.displayName ?? this.item} ...`)
        
                const entityPosition = entity.position.clone()
                {
                    const subresult = await (new AttackGoal(this, entity)).wait()
                    if ('error' in subresult) return error(subresult.error)
                }

                {
                    const subresult = await (new GotoGoal(this, entityPosition, 1, context.restrictedMovements)).wait()
                    if ('error' in subresult) return error(subresult.error)
                }

                while (true) {
                    const subresult = await (new PickupItemGoal(this, { inAir: true }, null)).wait()
                    if ('error' in subresult) break
                }

                const _requiredCount = this.requiredCount(context)
                if (_requiredCount === requiredCount) {
                    return error(`${this.indent} Failed to loot ${entity?.displayName ?? entity?.name}`)
                }
                requiredCount = _requiredCount

                if (requiredCount <= 0) {
                    console.log(`${this.indent} Item ${context.mc.data.items[this.item]?.displayName ?? this.item} successfully looted`)
                    return { result: 'looted' }
                }

                continue
            }

            if (block && entity) {
                return error(`${this.indent} Can't gather "${context.mc.data.items[this.item]?.displayName ?? this.item}" because I'm not allowed to dig or kill`)
            }

            if (!block && !entity) {
                return error(`${this.indent} Can't gather "${context.mc.data.items[this.item]?.displayName ?? this.item}" because there is none`)
            }

            if (block) {
                return error(`${this.indent} Can't gather "${context.mc.data.items[this.item]?.displayName ?? this.item}" because I'm not allowed to dig`)
            }

            if (entity) {
                return error(`${this.indent} Can't gather "${context.mc.data.items[this.item]?.displayName ?? this.item}" because I'm not allowed to kill`)
            }

            return error(`${this.indent} Can't gather "${context.mc.data.items[this.item]?.displayName ?? this.item}"`)
        }
    }

    /**
     * @param {import('../context')} context
     * @returns {import('./base').AsyncGoalReturn<Block>}
     */
    async obtainCraftingTable(context) {
        const maxDistance = 32
        const maxDistanceIfCantDig = 48

        let craftingTable = context.bot.findBlock({
            matching: context.mc.data.blocksByName['crafting_table'].id,
            maxDistance: this.canDig ? maxDistance : maxDistanceIfCantDig,
        })

        if (craftingTable) {
            console.log(`${this.indent} Crafting table is there`)
            return { result: craftingTable }
        }

        if (!craftingTable) {
            console.log(`${this.indent} Searching for crafting table ...`)

            const craftingTableInInventory = context.searchItem('crafting_table')
            if (craftingTableInInventory) {
                console.log(`${this.indent} Found in inventory, placing down ...`)
                const subresult = await (new PlaceBlockAnywhereGoal(this, craftingTableInInventory.type, true)).wait()
                if ('error' in subresult) return error(subresult.error)
            }

            craftingTable = context.bot.findBlock({
                matching: context.mc.data.blocksByName['crafting_table'].id,
                maxDistance: maxDistance,
            })
        }

        if (!craftingTable) {
            console.log(`${this.indent} Gathering crafting table ...`)

            {
                const subresult = await (new GatherItemGoal(this, context.mc.data.itemsByName['crafting_table'].id, 1, false, this.canDig, this.canKill)).wait()
                if ('error' in subresult) return error(subresult.error)
            }

            const craftingTableInInventory = context.searchItem('crafting_table')
            if (craftingTableInInventory) {
                console.log(`${this.indent} Crafting table gathered, placing down ...`)
                const subresult = await (new PlaceBlockAnywhereGoal(this, craftingTableInInventory.type, true)).wait()
                if ('error' in subresult) return error(subresult.error)
            } else {
                console.error(`${this.indent} Failed to gather crafting table`)
                return error(`${this.indent} Failed to gather crafting table`)
            }

            craftingTable = context.bot.findBlock({
                matching: context.mc.data.blocksByName['crafting_table'].id,
                maxDistance: maxDistance,
            })
        }
        
        return { result: craftingTable }
    }

    /**
     * @param {import('../context')} context
     * @param {number} requiredCount
     * @returns {import('./base').AsyncGoalReturn<number>}
     */
    async craft(context, requiredCount) {
        const needCraftingTable = context.bot.recipesAll(this.item, null, null).length === 0

        console.log(`${this.indent} Crafting ${context.mc.data.items[this.item]?.displayName ?? this.item} ...`)

        console.log(`${this.indent} Need crafting table:`, needCraftingTable)

        let craftingTable = null
        if (needCraftingTable) {
            const obtainCraftingTableResult = await this.obtainCraftingTable(context)
            if ('error' in obtainCraftingTableResult) {
                return obtainCraftingTableResult
            }
            craftingTable = obtainCraftingTableResult.result
        }

        let recipes = context.bot.recipesFor(this.item, null, null, craftingTable)
        if (recipes.length > 0) {
            console.log(`${this.indent} Has all the ingredients`)
            if (craftingTable) {
                console.log(`${this.indent} Goto crafing table ...`)
                const subresult = await (new GotoBlockGoal(this, craftingTable.position.clone(), context.restrictedMovements)).wait()
                if ('error' in subresult) return error(subresult.error)
            } else if (recipes[0].requiresTable) {
                return error(`${this.indent} No crafing table found`)
            }

            console.log(`${this.indent} Crafting ...`)
            await context.bot.craft(recipes[0], 1, craftingTable)
            return { result: recipes[0].result.count }
        } else {
            console.log(`${this.indent} Doesn't have all the ingredients ...`)
        }

        recipes = context.bot.recipesAll(this.item, null, craftingTable)
        if (recipes.length === 0) {
            return error(`${this.indent} Item ${context.mc.data.items[this.item]?.displayName ?? this.item} has no recipes`)
        }

        /*
        const recipesWithCosts = [ ]
        for (const recipe of recipes) {
            const recipeCost = await GatherItemGoal.recipeCost(context, recipe, true, this.depth - 2)
            recipesWithCosts.push({
                recipe: recipe,
                cost: recipeCost,
            })
        }
        
        sortCosts(recipesWithCosts)
        */

        for (const recipe of recipes) {
            const ingredients = context.mc.getIngredients(recipe)

            console.log(`${this.indent} Gathering ingredients for recipe { req: [ ${recipe.delta.filter(v => v.count < 0).map(v => context.mc.data.items[v.id]?.displayName ?? v.id).join(', ')} ], res: ${recipe.delta.filter(v => v.count > 0).map(v => context.mc.data.items[v.id]?.displayName ?? v.id).join(', ')} } ...`)

            for (const ingredient of ingredients) {
                if (ingredient.id === -1) {
                    console.warn(`${this.indent} Skipping ingredient`, ingredient)
                    continue
                }

                console.log(`${this.indent} Gathering ingredient ${context.mc.data.items[ingredient.id]?.displayName ?? ingredient.id} ...`)

                const gathered = await (new GatherItemGoal(this, ingredient.id, ingredient.count, false, this.canDig, this.canKill, this.item, ...this.baseItems)).wait()
                if ('error' in gathered) { continue }

                requiredCount = this.requiredCount(context)
                if (requiredCount <= 0) { break }
            }

            const goodRecipes = context.bot.recipesFor(this.item, null, null, craftingTable)
            if (goodRecipes.length > 0) {
                if (craftingTable) {
                    console.log(`${this.indent} Goto crafing table ...`)
                    const subresult = await (new GotoBlockGoal(this, craftingTable.position.clone(), context.restrictedMovements)).wait()
                    if ('error' in subresult) return error(subresult.error)
                }

                console.log(`${this.indent} Crafting ${context.mc.data.items[this.item]?.displayName ?? this.item} ...`)

                await context.bot.craft(goodRecipes[0], 1, craftingTable)
                
                return { result: goodRecipes[0].result.count }
            }
        }

        return error(`${this.indent} Failed to gather ingredients for ${context.mc.data.items[this.item]?.displayName ?? this.item}`)
    }

    /**
     * @param {import('../context')} context
     * @returns {number}
     */
    requiredCount(context) {
        let requiredCount = this.count
        if (!this.force) { requiredCount -= context.bot.inventory.count(this.item, null) }
        requiredCount -= this.getDelta(context)
        return requiredCount
    }

    /**
     * @override
     * @param {import('../context')} context
     * @returns {string}
     */
    toReadable(context) {
        return `Gather ${this.count} of ${context.mc.data.items[this.item]?.displayName ?? 'something'}`
    }

    /**
     * @param {import('../context')} context
     * @param {number} item
     * @param {number} count
     * @param {boolean} gatherTool
     * @param {number} depth
     */
    static async itemCost(context, item, count, gatherTool, depth) {
        if (depth > costDepth) {
            return Infinity
        }

        let requiredCount = count - context.bot.inventory.count(item, null)
        if (requiredCount <= 0) {
            return 0
        }

        const block = context.findBlockWithDrop(item, 32)
        let blockCost = Infinity
        if (block) {
            const DigGoal = require('./dig')
            blockCost = await DigGoal.cost(context, block, gatherTool, depth + 1)
        }

        const entity = context.findEntityWithDrop(item)
        let entityCost = Infinity
        if (entity) {
            entityCost = await AttackGoal.cost(context, entity, gatherTool, depth + 1)
        }

        let recipeCost = Infinity
        const recipes = context.bot.recipesAll(item, null, true)

        for (const recipe of recipes) {
            const thisRecipeCost = await GatherItemGoal.recipeCost(context, recipe, gatherTool, depth + 1)
            recipeCost = Math.min(recipeCost, thisRecipeCost)
        }

        return Math.min(blockCost, entityCost, recipeCost)
    }

    /**
     * @param {import('../context')} context
     * @param {Recipe} recipe
     * @param {boolean} gatherTool
     * @param {number} depth
     */
    static async recipeCost(context, recipe, gatherTool, depth) {
        if (depth > costDepth) {
            return Infinity
        }
        
        const ingredients = context.mc.getIngredients(recipe)
        let ingredientCost = 0

        for (const ingredient of ingredients) {
            if (ingredient.id === -1) {
                continue
            }
            if (ingredientCost === Infinity) {
                return Infinity
            }

            ingredientCost += await GatherItemGoal.itemCost(context, ingredient.id, ingredient.count, gatherTool, depth + 1)
        }

        return ingredientCost
    }
}
