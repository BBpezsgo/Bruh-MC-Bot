const { wrap, sleepG, sleepTicks } = require('../utils/tasks')
const placeBlock = require('./place-block')
const goto = require('./goto')
const { Recipe } = require('prismarine-recipe')
const { Chest } = require('mineflayer')
const pickupItem = require('./pickup-item')
const trade = require('./trade')
const Vec3Dimension = require('../vec3-dimension')
const bundle = require('../utils/bundle')
const { parseLocationH, Interval, directBlockNeighbors, Timeout } = require('../utils/other')
const giveTo = require('./give-to')
const { Vec3 } = require('vec3')
const dig = require('./dig')
const smelt = require('./smelt')

/**
 * @typedef {PermissionArgs & {
 *   count: number;
 *   item: string | ReadonlyArray<string>;
 *   baseItems?: ReadonlyArray<number>;
 *   originalCount?: number;
 *   depth?: number;
 *   force?: boolean;
 * }} Args
 */

/**
 * @typedef {{
*   canUseInventory?: boolean;
*   canDig?: boolean;
*   canKill?: boolean;
*   canCraft?: boolean;
*   canUseChests?: boolean;
*   canRequestFromPlayers?: boolean;
*   canRequestFromBots?: boolean;
*   canTrade?: boolean;
*   canHarvestMobs?: boolean;
* }} PermissionArgs
*/

/**
 * @typedef {{
 *   'chest': {
 *     type: 'chest';
 *     item: string;
 *     count: number;
 *     chest: Vec3Dimension;
 *   };
 *   'harvest-mob': {
 *     type: 'harvest-mob';
 *     item: string;
 *     count: number;
 *     entity: {
 *       id: number;
 *       expectedType: string;
 *     };
 *     tool: string;
 *     willToolDisappear: boolean;
 *     isDroppingItem: boolean;
 *   };
 *   'craft': {
 *     type: 'craft';
 *     item: string;
 *     count: number;
 *     recipe: Recipe;
 *   };
 *   'smelt': {
 *     type: 'smelt';
 *     recipe: import('../local-minecraft-data').SmeltingRecipe | import('../local-minecraft-data').SmokingRecipe | import('../local-minecraft-data').BlastingRecipe | import('../local-minecraft-data').CampfireRecipe;
 *     count: number;
 *   };
 *   'inventory': {
 *     type: 'inventory';
 *     item: string;
 *     count: number;
 *   };
 *   'goto': {
 *     type: 'goto';
 *     destination: Vec3Dimension;
 *     distance: number;
 *   };
 *   'request': {
 *     type: 'request';
 *     locks: ReadonlyArray<import('../bruh-bot').ItemLock>;
 *   };
 *   'trade': {
 *     type: 'trade';
 *     trade: import('../environment').SavedVillager['trades'][0];
 *     count: number;
 *   };
 *   'bundle-out': {
 *     type: 'bundle-out';
 *     item: string;
 *     count: number;
 *   };
 *   'request-from-anyone': {
 *     type: 'request-from-anyone';
 *     item: string;
 *     count: number;
 *   };
 *   'dig': {
 *     type: 'dig';
 *     block: { position: Vec3; name: string; };
 *     willGet: { item: string; count: number; };
 *     retryCount: number;
 *   };
 * }} PlanSteps
 */

/**
 * @typedef {keyof PlanSteps} PlanStepType
 */

/**
 * @template {PlanStepType} [TType = PlanStepType]
 * @typedef {PlanSteps[TType]} PlanStep
 */

/**
 * @typedef {ReadonlyArray<PlanStep | ReadonlyArray<PlanStep>>} Plan
 */

/**
 * @typedef {ReadonlyArray<PlanStep>} OrganizedPlan
 */

/**
 * @typedef {{
 *   depth: number;
 *   recursiveItems: Array<string>;
 * }} PlanningContext
 */

class PredictedEnvironment {
    /**
     * @readonly
     * @type {Record<string, number>}
     */
    inventory
    /**
     * @readonly
     * @type {Record<import('../environment').PositionHash, { location: Vec3Dimension; delta: Record<string, number>; }>}
     */
    chests
    /**
     * @readonly
     * @type {Array<number>}
     */
    harvestedMobs

    /**
     * @param {ReadonlyArray<PlanStep>} steps
     * @param {import('../minecraft')['registry']} registry
     */
    constructor(steps, registry) {
        this.inventory = {}
        this.chests = {}
        this.harvestedMobs = []

        for (const step of steps) {
            switch (step.type) {
                case 'goto': {
                    continue
                }
                case 'chest': {
                    /**
                     * @type {import('../environment').PositionHash}
                     */
                    const hash = `${step.chest.x}-${step.chest.y}-${step.chest.z}-${step.chest.dimension}`
                    this.chests[hash] ??= {
                        location: step.chest,
                        delta: {},
                    }
                    this.chests[hash].delta[step.item] ??= 0
                    this.chests[hash].delta[step.item] -= step.count
                    // this.inventory[step.item] ??= 0
                    // this.inventory[step.item] += step.count
                    continue
                }
                case 'harvest-mob': {
                    this.harvestedMobs.push(step.entity.id)
                    if (!step.willToolDisappear) {
                        this.inventory[step.tool] ??= 0
                        this.inventory[step.tool]++
                    }
                    continue
                }
                case 'inventory': {
                    this.inventory[step.item] ??= 0
                    this.inventory[step.item] -= step.count
                    continue
                }
                case 'trade': {
                    if (step.trade.inputItem1) {
                        this.inventory[step.trade.inputItem1.name] ??= 0
                        this.inventory[step.trade.inputItem1.name] -= step.trade.inputItem1.count
                    }
                    if (step.trade.inputItem2) {
                        this.inventory[step.trade.inputItem2.name] ??= 0
                        this.inventory[step.trade.inputItem2.name] -= step.trade.inputItem2.count
                    }
                    if (step.trade.outputItem) {
                        this.inventory[step.trade.outputItem.name] ??= 0
                        this.inventory[step.trade.outputItem.name] += step.trade.outputItem.count
                    }
                    continue
                }
                case 'smelt': {
                    this.inventory[step.recipe.result] ??= 0
                    this.inventory[step.recipe.result] += step.count
                    continue
                }
                case 'craft': {
                    for (const delta of step.recipe.delta) {
                        const itemName = registry.items[delta.id].name
                        this.inventory[itemName] ??= 0
                        this.inventory[itemName] += delta.count
                    }
                    continue
                }
                case 'request': {
                    continue
                }
                case 'bundle-out': {
                    continue
                }
            }
        }
    }
}

const planningLogs = false

/**
 * @param {Plan} plan
 * @returns {number}
 */
function planCost(plan) {
    let cost = 0

    for (const step of plan) {
        if ('type' in step) {
            switch (step.type) {
                case 'chest':
                    cost += 0.1
                    break
                case 'inventory':
                    cost += 0
                    break
                case 'goto':
                    cost += 0
                    break
                case 'dig':
                    cost += 0.1
                    break
                case 'harvest-mob':
                    cost += 1
                    break
                case 'craft': {
                    if (step.recipe.requiresTable) {
                        cost += 1
                    }
                    cost += 1
                    break
                }
                case 'bundle-out': {
                    cost += 0.1
                    break
                }
                case 'smelt': {
                    if (step.recipe.type === 'campfire') {
                        cost += 2
                    } else {
                        cost += 4
                    }
                    break
                }
                case 'request': {
                    cost += 5
                    break
                }
                case 'trade': {
                    cost += 10
                    break
                }
                case 'request-from-anyone': {
                    cost += 1000
                    break
                }
                default:
                    debugger
                    break
            }
        } else {
            cost += planCost(step)
        }
    }

    return cost
}

/**
 * @param {Plan} plan
 * @param {string} item
 */
function planResult(plan, item) {
    let count = 0
    for (const step of plan) {
        if ('type' in step) {
            if (step.type === 'goto') { continue }
            if (step.type === 'request') {
                for (const lock of step.locks) {
                    if (lock.item !== item) { continue }
                    count += lock.count
                }
                continue
            }
            if (step.type === 'request-from-anyone' &&
                step.item === item) {
                count += step.count
                continue
            }
            if (step.type === 'bundle-out' &&
                step.item === item) {
                count += step.count
                continue
            }
            if (step.type === 'trade') {
                if (step.trade.outputItem.name === item) {
                    count += step.count * step.trade.outputItem.count
                }
                continue
            }
            if (step.type === 'harvest-mob') {
                if (step.item === item) {
                    count += step.count
                }
                continue
            }
            if (step.type === 'dig') {
                if (step.willGet.item === item) {
                    count += step.willGet.count
                }
                continue
            }
            if (step.type === 'smelt') {
                if (step.recipe.result === item) {
                    count += step.count
                }
                continue
            }
            if (step.item === item) {
                switch (step.type) {
                    case 'chest':
                    case 'inventory': {
                        count += step.count
                        break
                    }
                    case 'craft': {
                        count += step.recipe.result.count * step.count
                        break
                    }
                    default: debugger
                }
            }
        } else {
            count += planResult(step, item)
        }
    }
    return count
}

/**
 * @type {ReadonlyArray<(
 *   bot: import('../bruh-bot'),
 *   item: string,
 *   count: number,
 *   permissions : PermissionArgs & { force?: boolean },
 *   context: PlanningContext,
 *   planSoFar: Plan
 * ) => (import('../task').Task<(PlanStep | Plan) | Array<PlanStep | Plan>> | null)>}
 */
const planners = [
    function*(bot, item, count, permissions, context, planSoFar) {
        const _depthPrefix = ' '.repeat(context.depth)

        if (!permissions.canUseInventory) { return null }

        if (permissions.force) { return null }

        const future = new PredictedEnvironment(planSoFar.flat(), bot.mc.registry)

        if (planningLogs) console.log(`[Bot "${bot.username}"] ${_depthPrefix} | Check inventory ...`)

        const inInventory = bot.inventoryItemCount(null, { name: item }) + (future.inventory[item] ?? 0)
        if (inInventory === 0) {
            if (planningLogs) console.log(`[Bot "${bot.username}"] ${_depthPrefix} |   None`)
            return null
        }

        if (planningLogs) console.log(`[Bot "${bot.username}"] ${_depthPrefix} |   Has ${inInventory}`)
        const needFromInventory = Math.min(inInventory, count)
        return {
            type: 'inventory',
            item: item,
            count: needFromInventory,
        }
    },
    function*(bot, item, count, permissions, context, planSoFar) {
        // const _depthPrefix = ' '.repeat(context.depth)

        if (!permissions.canUseInventory) { return null }

        const bundleItem = bundle.bestBundleWithItem(bot.bot, item)
        if (!bundleItem) { return null }
        const content = bundle.content(bundleItem.nbt)
        if (!content) { return null }
        const items = content.filter(v => v.name === item)
        if (items.length === 0) { return null }

        return {
            type: 'bundle-out',
            item: item,
            count: items[0].count,
        }
    },
    function*(bot, item, count, permissions, context, planSoFar) {
        const _depthPrefix = ' '.repeat(context.depth)

        if (!permissions.canUseChests) { return null }

        const future = new PredictedEnvironment(planSoFar.flat(), bot.mc.registry)

        if (planningLogs) console.log(`[Bot "${bot.username}"] ${_depthPrefix} | Check chests ...`)
        const inChests = bot.env.searchForItem(bot, item)
        const inChestsWithMyItems = inChests.filter(v => {
            const have = v.myCount + (future.chests[`${v.position.x}-${v.position.y}-${v.position.z}-${v.position.dimension}`]?.delta[item] ?? 0)
            return have > 0 && v.position.dimension === bot.dimension
        })
        inChestsWithMyItems.sort((a, b) => {
            const aDist = bot.bot.entity.position.distanceSquared(a.position.xyz(bot.dimension))
            const bDist = bot.bot.entity.position.distanceSquared(b.position.xyz(bot.dimension))
            return aDist - bDist
        })

        for (const inChestWithMyItems of inChestsWithMyItems) {
            yield
            const have = inChestWithMyItems.myCount + (future.chests[`${inChestWithMyItems.position.x}-${inChestWithMyItems.position.y}-${inChestWithMyItems.position.z}-${inChestWithMyItems.position.dimension}`]?.delta[item] ?? 0)
            if (planningLogs) console.log(`[Bot "${bot.username}"] ${_depthPrefix} |   Found ${have} in a chest`)

            return {
                type: 'chest',
                chest: inChestWithMyItems.position,
                item: item,
                count: Math.min(have, count),
            }
        }

        if (planningLogs) console.log(`[Bot "${bot.username}"] ${_depthPrefix} |   None`)
        return null
    },
    function*(bot, item, count, permissions, context, planSoFar) {
        // const _depthPrefix = ' '.repeat(context.depth)

        if (!permissions.canRequestFromBots) { return null }

        const need = count
        const locked = bot.env.lockOthersItems(bot.username, item, need)
        if (locked.length === 0) { return null }

        return {
            type: 'request',
            locks: locked,
        }
    },
    function*(bot, item, count, permissions, context, planSoFar) {
        const _depthPrefix = ' '.repeat(context.depth)

        if (!permissions.canCraft) { return null }

        const recipes = bot.bot.recipesAll(bot.mc.registry.itemsByName[item].id, null, true)
        if (planningLogs) console.log(`[Bot "${bot.username}"] ${_depthPrefix} | Check ${recipes.length} recipes ...`)
        const scoredRecipes = recipes.map(v => {
            let score = 0
            for (const delta of v.delta) {
                if (delta.count > 0) { continue }
                const item = bot.mc.registry.items[delta.id].name
                const successfulGathering = bot.memory.successfulGatherings[item]
                if (!successfulGathering) { continue }
                // if ((Date.now() - successfulGathering.lastTime) > 120_000) {
                //     delete bot.memory.successfulGatherings[item]
                //     continue
                // }
                score += successfulGathering.successCount
            }
            return {
                ...v,
                score: score,
            }
        })
        yield
        scoredRecipes.sort((a, b) => b.score - a.score)
        yield
        const previousSuccessfulRecipes = scoredRecipes.filter(v => v.score)
        yield
        const previousUnsuccessfulRecipes = scoredRecipes.filter(v => !v.score)
        yield
        /**
         * @type {{ plan: Array<ReadonlyArray<PlanStep>>; recipe: Recipe; } | null}
         */
        let bestRecipe = null
        let bestRecipeCost = Infinity

        /**
         * @param {scoredRecipes[0]} recipe
         */
        const visitRecipe = function*(recipe) {
            const actualCraftCount = Math.ceil(count / recipe.result.count)

            /**
             * @type {Array<ReadonlyArray<PlanStep>>}
             */
            const ingredientPlans = []
            for (const ingredient of recipe.delta) {
                if (ingredient.count >= 0) { continue }
                yield
                const ingredientCount = -ingredient.count * actualCraftCount
                const subplan = yield* plan(bot, bot.mc.registry.items[ingredient.id].name, ingredientCount, {
                    ...permissions,
                    force: false,
                }, {
                    depth: context.depth + 1,
                    recursiveItems: [
                        ...context.recursiveItems,
                        item,
                    ],
                }, [...planSoFar, ...ingredientPlans])
                const subplanResult = planResult(subplan, bot.mc.registry.items[ingredient.id].name)
                if (subplanResult < ingredientCount) {
                    if (planningLogs) console.log(`[Bot "${bot.username}"] ${_depthPrefix} |   Not good`)
                    return null
                }
                ingredientPlans.push(subplan.flat())
            }

            const thisPlanCost = planCost(ingredientPlans)
            if (thisPlanCost < bestRecipeCost) {
                bestRecipe = {
                    plan: ingredientPlans,
                    recipe: recipe,
                }
                bestRecipeCost = thisPlanCost
            }

            return ingredientPlans
        }

        for (const recipe of previousSuccessfulRecipes) {
            yield
            yield* visitRecipe(recipe)
        }

        if (!bestRecipe) {
            for (const recipe of previousUnsuccessfulRecipes) {
                yield
                yield* visitRecipe(recipe)
            }
        }

        if (!bestRecipe) {
            if (planningLogs) console.log(`[Bot "${bot.username}"] ${_depthPrefix} |   No recipe found`)
            return null
        }

        /**
         * @type {Array<PlanStep | ReadonlyArray<PlanStep>>}
         */
        const result = []
        result.push(bestRecipe.plan.flat())

        if (bestRecipe.recipe.requiresTable &&
            planResult([...result, ...planSoFar], 'crafting_table') <= 0) {
            if (planningLogs) console.log(`[Bot "${bot.username}"] ${_depthPrefix} |   Plan for crafting table ...`)
            yield
            const tableInWorld = bot.bot.findBlock({
                matching: bot.mc.registry.blocksByName['crafting_table'].id,
                maxDistance: 32,
            })
            if (!tableInWorld) {
                const tablePlan = yield* plan(bot, 'crafting_table', 1, {
                    ...permissions,
                    force: false,
                }, {
                    depth: context.depth,
                    recursiveItems: [
                        ...context.recursiveItems,
                        item,
                    ],
                }, [...result, ...planSoFar])
                if (planResult(tablePlan, 'crafting_table') <= 0) {
                    if (planningLogs) console.log(`[Bot "${bot.username}"] ${_depthPrefix} |   Can't gather crafting table, recipe is not good`)
                    return null
                }
                result.push(tablePlan.flat())
            } else {
                result.push({
                    type: 'goto',
                    destination: new Vec3Dimension(tableInWorld.position, bot.dimension),
                    distance: 2,
                })
            }
        }

        if (planningLogs) console.log(`[Bot "${bot.username}"] ${_depthPrefix} |   Recipe found`)

        result.push({
            type: 'craft',
            item: bot.mc.registry.items[bestRecipe.recipe.result.id].name,
            count: Math.ceil(count / bestRecipe.recipe.result.count),
            recipe: bestRecipe.recipe,
        })

        return result
    },
    function*(bot, item, count, permissions, context, planSoFar) {
        const _depthPrefix = ' '.repeat(context.depth)

        if (!permissions.canCraft) { return null }

        const recipes = []

        for (const recipeId in bot.mc.local.recipes.blasting) {
            const recipe = bot.mc.local.recipes.blasting[recipeId]
            if (recipe.result !== item) { continue }
            recipes.push(recipe)
        }

        for (const recipeId in bot.mc.local.recipes.smoking) {
            const recipe = bot.mc.local.recipes.smoking[recipeId]
            if (recipe.result !== item) { continue }
            recipes.push(recipe)
        }

        for (const recipeId in bot.mc.local.recipes.smelting) {
            const recipe = bot.mc.local.recipes.smelting[recipeId]
            if (recipe.result !== item) { continue }
            recipes.push(recipe)
        }

        for (const recipeId in bot.mc.local.recipes.campfire) {
            const recipe = bot.mc.local.recipes.campfire[recipeId]
            if (recipe.result !== item) { continue }
            recipes.push(recipe)
        }

        const usableRecipes = smelt.findBestFurnace(bot, recipes, false)

        if (!usableRecipes || usableRecipes.recipes.length === 0) { return null }

        if (planningLogs) console.log(`[Bot "${bot.username}"] ${_depthPrefix} | Check ${recipes.length} recipes ...`)
        yield
        /**
         * @type {{
         *   plan: Array<ReadonlyArray<PlanStep>>;
         *   recipe: import('../local-minecraft-data').CookingRecipe;
         * } | null}
         */
        let bestRecipe = null
        let bestRecipeCost = Infinity

        /**
         * @param {import('../local-minecraft-data').CookingRecipe} recipe
         */
        const visitRecipe = function*(recipe) {
            /**
             * @type {Array<ReadonlyArray<PlanStep>>}
             */
            const ingredientPlans = []
            for (const ingredient of recipe.ingredient) {
                yield
                const subplan = yield* plan(bot, ingredient, count, {
                    ...permissions,
                    force: false,
                }, {
                    depth: context.depth + 1,
                    recursiveItems: [
                        ...context.recursiveItems,
                        item,
                    ],
                }, [...planSoFar, ...ingredientPlans])
                let goodItems
                if (ingredient.startsWith('#')) {
                    goodItems = bot.mc.local.resolveItemTag(ingredient.replace('#', ''))
                } else {
                    goodItems = [ingredient]
                }
                const isGood = goodItems.some(v => planResult(subplan, v))
                if (!isGood) {
                    if (planningLogs) console.log(`[Bot "${bot.username}"] ${_depthPrefix} |   Not good`)
                    return null
                }
                ingredientPlans.push(subplan.flat())
            }

            const thisPlanCost = planCost(ingredientPlans)
            const selfCost = planCost([
                {
                    type: 'smelt',
                    count: count,
                    recipe: recipe,
                }
            ])
            const totalRecipeCost = thisPlanCost + selfCost
            if (totalRecipeCost < bestRecipeCost) {
                bestRecipe = {
                    plan: ingredientPlans,
                    recipe: recipe,
                }
                bestRecipeCost = totalRecipeCost
            }

            return ingredientPlans
        }

        for (const recipe of usableRecipes.recipes) {
            yield
            for (const ingredient of recipe.ingredient) {
                yield* visitRecipe({
                    ...recipe,
                    ingredient: [ingredient],
                })
            }
        }

        if (!bestRecipe) {
            if (planningLogs) console.log(`[Bot "${bot.username}"] ${_depthPrefix} |   No recipe found`)
            return null
        }

        /**
         * @type {Array<PlanStep | ReadonlyArray<PlanStep>>}
         */
        const result = []

        if (planningLogs) console.log(`[Bot "${bot.username}"] ${_depthPrefix} |   Recipe found`)

        result.push(bestRecipe.plan.flat())
        result.push({
            type: 'smelt',
            recipe: bestRecipe.recipe,
            count: count,
        })

        return result
    },
    function*(bot, item, count, permissions, context, planSoFar) {
        // const _depthPrefix = ' '.repeat(context.depth)

        if (!permissions.canTrade) { return null }

        const sortedVillagers = [...Object.values(bot.env.villagers)].sort((a, b) => bot.bot.entity.position.distanceSquared(a.position.xyz(bot.dimension)) - bot.bot.entity.position.distanceSquared(b.position.xyz(bot.dimension)))
        for (const villager of sortedVillagers) {
            yield
            const entity = bot.bot.nearestEntity(v => v.uuid === villager.uuid || v.id === villager.id)
            if (!entity || !entity.isValid) { continue }
            for (const trade of villager.trades) {
                if (trade.outputItem.name !== item) { continue }
                if (count <= 0) { break }
                const tradeCount = Math.ceil(count / trade.outputItem.count)

                const pricePlan1 = trade.inputItem1 ? yield* plan(bot, trade.inputItem1.name, trade.inputItem1.count * tradeCount, {
                    ...permissions,
                    force: false,
                }, {
                    depth: context.depth + 1,
                    recursiveItems: [
                        ...context.recursiveItems,
                        item,
                        trade.outputItem.name,
                    ],
                }, planSoFar) : null

                const pricePlan2 = trade.inputItem2 ? yield* plan(bot, trade.inputItem2.name, trade.inputItem2.count * tradeCount, {
                    ...permissions,
                    force: false,
                }, {
                    depth: context.depth + 1,
                    recursiveItems: [
                        ...context.recursiveItems,
                        item,
                        trade.outputItem.name,
                    ],
                }, planSoFar) : null

                const price1Result = trade.inputItem1 ? planResult([
                    ...planSoFar,
                    ...(pricePlan1 ?? []),
                    ...(pricePlan2 ?? []),
                ], trade.inputItem1.name) : null

                const price2Result = trade.inputItem2 ? planResult([
                    ...planSoFar,
                    ...(pricePlan1 ?? []),
                    ...(pricePlan2 ?? []),
                ], trade.inputItem2.name) : null

                if (trade.inputItem1 && price1Result < trade.inputItem1.count) { continue }
                if (trade.inputItem2 && price2Result < trade.inputItem2.count) { continue }

                /**
                 * @type {Array<PlanStep | Plan>}
                 */
                const result = []

                if (pricePlan1) result.push(...pricePlan1)
                if (pricePlan2) result.push(...pricePlan2)

                result.push({
                    type: 'trade',
                    trade: trade,
                    count: tradeCount,
                })

                return result
            }
        }

        return null
    },
    function*(bot, item, count, permissions, context, planSoFar) {
        // const _depthPrefix = ' '.repeat(context.depth)

        if (!permissions.canRequestFromPlayers) { return null }

        return {
            type: 'request-from-anyone',
            item: item,
            count: count,
        }
    },
    function*(bot, item, count, permissions, context, planSoFar) {
        if (item !== 'cobblestone') { return null }

        if (!permissions.canDig) { return null }

        if (!bot.searchInventoryItem(null,
            'wooden_pickaxe',
            'stone_pickaxe',
            'iron_pickaxe',
            'golden_pickaxe',
            'diamond_pickaxe',
            'netherite_pickaxe',
        )) { return null }

        /** @type {Vec3} */
        let found = null
        bot.bot.findBlock({
            matching: bot.mc.registry.blocksByName['lava'].id,
            count: 1,
            maxDistance: 32,
            useExtraInfo: (block) => {
                for (const lavaNeighborPosition of directBlockNeighbors(block.position, 'side')) {
                    const lavaNeighbor = bot.bot.blockAt(lavaNeighborPosition)
                    if (!lavaNeighbor || lavaNeighbor.name !== 'cobblestone') { continue }

                    for (const cobblestoneNeighborPosition of directBlockNeighbors(lavaNeighbor.position, 'side')) {
                        if (cobblestoneNeighborPosition.equals(block.position)) { continue }
                        const cobblestoneNeighbor = bot.bot.blockAt(cobblestoneNeighborPosition)
                        if (!cobblestoneNeighbor || cobblestoneNeighbor.name !== 'water') { continue }
                        const waterLevel = cobblestoneNeighbor.getProperties()['level']
                        if (!waterLevel) { continue }
                        if (waterLevel !== 1) { continue }
                        const blockBelowFlowingWater = bot.bot.blockAt(cobblestoneNeighborPosition.offset(0, -1, 0))
                        if (!blockBelowFlowingWater) { continue }
                        if (blockBelowFlowingWater.name !== 'water') { continue }
                        if (found) {
                            return false
                        } else {
                            found = lavaNeighborPosition
                        }
                    }
                }
                if (!found) { return false }
                return true
            },
        })

        if (!found) { return null }

        return {
            type: 'dig',
            block: bot.bot.blockAt(found),
            willGet: { item: 'cobblestone', count: 1 },
            retryCount: 5,
        }
    },
    function*(bot, item, count, permissions, context, planSoFar) {
        if (!permissions.canHarvestMobs) { return null }

        switch (item) {
            case 'milk_bucket': {
                const bucketPlan = yield* plan(bot, "bucket", 1, {
                    ...permissions,
                    force: false,
                    canUseInventory: true,
                }, {
                    depth: context.depth + 1,
                    recursiveItems: [
                        ...context.recursiveItems,
                        item,
                    ],
                }, [...planSoFar])
                if (planResult(bucketPlan, 'bucket') <= 0) {
                    // throw `Can't milk cow: aint have a bucket`
                    return null
                }
                const future = new PredictedEnvironment(planSoFar.flat(), bot.mc.registry)
                const entity = bot.bot.nearestEntity(e => {
                    if (e.name !== 'cow') { return false }
                    if (e.metadata[16]) { return false } // Baby
                    if (future.harvestedMobs.includes(e.id)) { return false }
                    return true
                })
                if (!entity) {
                    // throw `Can't milk any cow because there is aint any`
                    return null
                }
                return [
                    ...bucketPlan,
                    {
                        type: 'harvest-mob',
                        count: 1,
                        item: 'milk_bucket',
                        entity: {
                            expectedType: entity.name,
                            id: entity.id,
                        },
                        tool: 'bucket',
                        willToolDisappear: true,
                        isDroppingItem: false,
                    }
                ]
            }
            case 'mushroom_stew': {
                const bowlPlan = yield* plan(bot, "bowl", 1, {
                    ...permissions,
                    force: false,
                    canUseInventory: true,
                }, {
                    depth: context.depth + 1,
                    recursiveItems: [
                        ...context.recursiveItems,
                        item,
                    ],
                }, [...planSoFar])
                if (planResult(bowlPlan, 'bowl') <= 0) {
                    // throw `Can't milk mooshroom: aint have a bowl`
                    return null
                }
                const future = new PredictedEnvironment(planSoFar.flat(), bot.mc.registry)
                const entity = bot.bot.nearestEntity(e => {
                    if (e.name !== 'moshroom') { return false }
                    if (e.metadata[16]) { return false } // Baby
                    if (future.harvestedMobs.includes(e.id)) { return false }
                    return true
                })
                if (!entity) {
                    // throw `Can't milk any mooshroom because there is aint any`
                    return null
                }
                return [
                    ...bowlPlan,
                    {
                        type: 'harvest-mob',
                        count: 1,
                        item: 'mushroom_stew',
                        entity: {
                            expectedType: entity.name,
                            id: entity.id,
                        },
                        tool: 'bowl',
                        willToolDisappear: true,
                        isDroppingItem: false,
                    }
                ]
            }
            default: return null
        }
    },
]

/**
 * @param {import('../bruh-bot')} bot
 * @param {ReadonlyArray<string>} item
 * @param {number} count
 * @param {PermissionArgs & { force?: boolean }} permissions
 * @param {PlanningContext} context
 * @param {Plan} planSoFar
 * @returns {import('../task').Task<{ item: string; plan: Plan; }>}
 */
function* planAny(bot, item, count, permissions, context, planSoFar) {
    /**
     * @type {{ item: string; plan: Plan; planCost: number; planResult: number; } | null}
     */
    let bestPlan = null

    /**
     * @param {string} item
     */
    const visitItem = function*(item) {
        const itemPlan = yield* plan(bot, item, count, permissions, context, planSoFar)
        const _itemPlan = {
            item: item,
            plan: itemPlan,
            planCost: planCost(itemPlan),
            planResult: planResult(itemPlan, item),
        }
        if (!bestPlan) {
            bestPlan = _itemPlan
            return
        }
        if (!_itemPlan.planResult) { return }
        const bestIsGood = bestPlan.planResult >= count
        const currentIsGood = _itemPlan.planResult >= count
        if (bestIsGood && !currentIsGood) { return }
        if (!bestIsGood && currentIsGood) {
            bestPlan = _itemPlan
            return
        }
        if (_itemPlan.planCost < bestPlan.planCost) {
            bestPlan = _itemPlan
            return
        }
    }

    const scoredItems = item.map(v => ({
        item: v,
        score: bot.memory.successfulGatherings[v]?.successCount ?? 0,
    }))
    yield
    scoredItems.sort((a, b) => (b.score - a.score))
    yield
    const lastSuccessfulItems = scoredItems.filter(v => v.score)
    yield
    const lastFailedItems = scoredItems.filter(v => !v.score)

    for (const item of lastSuccessfulItems) {
        yield* visitItem(item.item)
        if (bestPlan &&
            bestPlan.planCost === 0 &&
            bestPlan.planResult >= count) {
            break
        }
    }

    if (!bestPlan || (bestPlan.planResult < count)) {
        for (const item of lastFailedItems) {
            yield* visitItem(item.item)
            if (bestPlan &&
                bestPlan.planCost === 0 &&
                bestPlan.planResult >= count) {
                break
            }
        }
    }

    return bestPlan
}

/**
 * @param {import('../bruh-bot')} bot
 * @param {string} item
 * @param {number} count
 * @param {PermissionArgs & { force?: boolean }} permissions
 * @param {PlanningContext} context
 * @param {Plan} planSoFar
 * @returns {import('../task').Task<Plan>}
 */
function* plan(bot, item, count, permissions, context, planSoFar) {
    if (item.startsWith('#')) {
        const resolvedItems = bot.mc.local.resolveItemTag(item.replace('#', ''))
        return (yield* planAny(
            bot,
            resolvedItems,
            count,
            permissions,
            context,
            planSoFar))?.plan ?? []
    }

    if (!bot.mc.registry.itemsByName[item]) {
        console.warn(`[Bot "${bot.username}"] Unknown item "${item}"`)
        return []
    }

    const _depthPrefix = ' '.repeat(context.depth)
    if (context.recursiveItems.includes(item)) {
        if (planningLogs) console.warn(`[Bot "${bot.username}"] ${_depthPrefix} Recursive plan for item "${item}", skipping`)
        return []
    }
    if (context.depth > 10) {
        console.warn(`[Bot "${bot.username}"] ${_depthPrefix} Too deep plan for item "${item}", skipping`)
        return []
    }

    if (planningLogs) console.log(`[Bot "${bot.username}"] ${_depthPrefix} Planning ${count} "${item}" ...`)

    /**
     * @type {Array<PlanStep | ReadonlyArray<PlanStep>>}
     */
    const result = []

    while (true) {
        yield
        const alreadyGot = planResult(result, item)
        const need = count - alreadyGot
        if (need <= 0) { break }
        /**
         * @type {ReadonlyArray<PlanStep> | null}
         */
        let bestPlan = null
        let bestPlanCost = Infinity
        for (const planner of planners) {
            const _plan = yield* planner(bot, item, need, permissions, context, [...planSoFar, ...result])
            if (!_plan) { continue }
            const _planCost = planCost([_plan].flat(3))
            if (_planCost < bestPlanCost) {
                bestPlan = [_plan].flat(3)
                bestPlanCost = _planCost

                if (bestPlanCost <= 0) {
                    break
                }
            }
        }
        if (!bestPlan) { break }
        result.push(bestPlan)
    }

    if (count &&
        (planResult(result, item) >= count) &&
        !result.flat().find(v => v.type === 'request-from-anyone')) {
        const existing = bot.memory.successfulGatherings[item]
        if (existing) {
            bot.memory.successfulGatherings[item].lastTime = Date.now()
            bot.memory.successfulGatherings[item].successCount++
        } else {
            bot.memory.successfulGatherings[item] = {
                lastTime: Date.now(),
                successCount: 1,
            }
        }
    } else {
        // delete bot.memory.successfulGatherings[item]
    }

    return result
}

/**
 * @param {import('../bruh-bot')} bot
 * @param {OrganizedPlan} plan
 * @returns {import('../task').Task<void>}
 */
function* evaluatePlan(bot, plan) {
    /**
     * @type {{ chestPosition: Vec3Dimension; chest: Chest; } | null}
     */
    let openedChest = null

    console.log(`[Bot "${bot.username}"] Evaluating plan`)

    try {
        for (const step of plan) {
            yield

            if (openedChest) {
                if (step.type !== 'chest') {
                    openedChest.chest.close()
                    openedChest = null
                }
            }

            switch (step.type) {
                case 'inventory': continue
                case 'goto': {
                    yield* goto.task(bot, {
                        point: step.destination,
                        distance: step.distance,
                    })
                    continue
                }
                case 'chest': {
                    yield* goto.task(bot, {
                        block: step.chest.clone(),
                    })
                    const chestBlock = bot.bot.blockAt(step.chest.xyz(bot.dimension))
                    if (!chestBlock || chestBlock.name !== 'chest') {
                        throw `Chest disappeared`
                    }
                    if (openedChest && !step.chest.equals(openedChest.chestPosition)) {
                        openedChest.chest.close()
                        openedChest = null
                    }
                    if (!openedChest) {
                        const chest = yield* bot.openChest(chestBlock)
                        openedChest = {
                            chestPosition: new Vec3Dimension(chestBlock.position, bot.dimension),
                            chest: chest,
                        }
                    }
                    const took = yield* bot.chestWithdraw(openedChest.chest, openedChest.chestPosition.xyz(bot.dimension), { name: step.item }, step.count)
                    if (took < step.count) {
                        throw `Item ${step.item} disappeared from chest: took ${took} but expected ${step.count}`
                    }
                    continue
                }
                case 'harvest-mob': {
                    const entity = bot.bot.nearestEntity(e => e.id === step.entity.id)
                    if (!entity) {
                        throw `The ${step.entity.expectedType} disappeared`
                    }
                    if (!entity.isValid) {
                        throw `The ${step.entity.expectedType} is invalid`
                    }
                    if (entity.name !== step.entity.expectedType) {
                        throw `The ${step.entity.expectedType} disappeared`
                    }
                    yield* goto.task(bot, {
                        entity: entity,
                        distance: 3,
                    })
                    if (!entity.isValid) {
                        throw `The ${step.entity.expectedType} is invalid`
                    }
                    const toolItem = bot.searchInventoryItem(null, step.tool)
                    if (!toolItem) {
                        throw `I have no ${step.tool}`
                    }
                    yield* wrap(bot.bot.equip(toolItem, 'hand'))
                    yield* sleepTicks()
                    yield* wrap(bot.bot.activateEntity(entity))
                    yield* sleepTicks()
                    if (step.isDroppingItem) {
                        yield* pickupItem.task(bot, {
                            items: [ step.item ],
                            inAir: true,
                            maxDistance: 8,
                            minLifetime: 0,
                            silent: true,
                            point: entity.position.clone(),
                        })
                    }
                    continue
                }
                case 'craft': {
                    for (const ingredient of step.recipe.delta) {
                        if (ingredient.count >= 0) { continue }
                        const has = bot.bot.inventory.count(ingredient.id, ingredient.metadata)
                        if (has < -ingredient.count) {
                            throw `Not enough ${bot.mc.registry.items[ingredient.id].name} for ${step.item}, I have ${has} but I need ${-ingredient.count}`
                        }
                    }
                    if (step.recipe.requiresTable) {
                        let tableBlock = bot.bot.findBlock({
                            matching: bot.mc.registry.blocksByName['crafting_table'].id,
                            maxDistance: 64,
                        })
                        if (!tableBlock) {
                            const tableItem = bot.searchInventoryItem(null, 'crafting_table')
                            if (!tableItem) {
                                throw `I have no crafting table`
                            }
                            yield* placeBlock.task(bot, {
                                item: tableItem.name,
                                clearGrass: true,
                            })
                            tableBlock = bot.bot.findBlock({
                                matching: bot.mc.registry.blocksByName['crafting_table'].id,
                                maxDistance: 64,
                            })
                            if (!tableBlock) {
                                throw `Failed to place down the crafting table`
                            }
                        }
                        if (!tableBlock) {
                            throw `There is no crafting table`
                        }
                        yield* goto.task(bot, {
                            block: tableBlock.position,
                        })
                        yield* wrap(bot.bot.craft(step.recipe, step.count, tableBlock))
                    } else {
                        yield* wrap(bot.bot.craft(step.recipe, step.count))
                    }
                    continue
                }
                case 'smelt': {
                    yield* smelt.task(bot, {
                        count: step.count,
                        noFuel: false,
                        recipes: [step.recipe],
                    })
                    continue
                }
                case 'request': {
                    for (const lock of step.locks) {
                        const result = yield* bot.env.requestItem(lock, 60000)
                        if (!result) {
                            throw `Failed to request item \"${lock.item}\"`
                        }
                        yield* sleepG(2000)
                        try {
                            yield* pickupItem.task(bot, {
                                inAir: true,
                                items: [lock.item],
                                maxDistance: 4,
                                minLifetime: 0,
                            })
                        } catch (error) {
                            console.warn(error)
                        }
                        yield* sleepG(40)
                    }
                    continue
                }
                case 'trade': {
                    yield* trade.task(bot, {
                        trade: step.trade,
                        numberOfTrades: step.count,
                    })
                    continue
                }
                case 'bundle-out': {
                    const bundleItem = bundle.bestBundleWithItem(bot.bot, step.item)
                    if (!bundleItem) { throw `Bundle disappeared` }
                    const content = bundle.content(bundleItem.nbt)
                    if (!content) { throw `Bundle content sublimated` }
                    const items = content.filter(v => v.name === step.item)
                    if (items.length === 0) { throw `Item disappeared from the bundle` }
                    if (items[0].count < step.count) { throw `Item count decreased in the bundle` }

                    const takenOut = yield* wrap(bundle.takeOutItem(bot.bot, bot.mc.registry, bundleItem.slot, items[0].name))

                    if (takenOut.name !== items[0].name) { throw `Unexpected item taken out from the bundle` }
                    if (takenOut.count !== items[0].count) { throw `Unexpected number of item taken out from the bundle` }

                    continue
                }
                case 'request-from-anyone': {
                    if (bot.isLeaving) { throw `Can't ask: currently leaving the game` }
                    let requestPlayer
                    let response
                    try {
                        const _response = yield* bot.askYesNo(
                            (step.count === 1) ?
                                `Can someone give me a ${step.item}?` :
                                `Can someone give me ${step.count} ${step.item}?`,
                            bot.bot.chat,
                            null,
                            30000)
                        response = _response.message
                        requestPlayer = _response.sender
                    } catch (error) {
                        throw `:(`
                    }
                    if (!response) { throw `:(` }

                    bot.bot.whisper(requestPlayer, `I'm going to you for ${step.count} ${step.item}`)

                    let location = bot.env.getPlayerPosition(requestPlayer, 10000)
                    if (!location) {
                        if (bot.isLeaving) { throw `Can't ask: currently leaving the game` }
                        try {
                            const response = yield* bot.ask(`Where are you?`, v => bot.bot.whisper(requestPlayer, v), requestPlayer, 30000)
                            location = parseLocationH(response.message)
                        } catch (error) {

                        }
                        if (location) {
                            bot.bot.whisper(requestPlayer, `${location.x} ${location.y} ${location.z} in ${location.dimension} I got it`)
                        } else {
                            throw `I can't find you`
                        }
                    }

                    yield* goto.task(bot, {
                        point: location,
                        distance: 1,
                        timeout: 30000,
                    })

                    bot.bot.whisper(requestPlayer, `Please give me ${step.count} ${step.item}`)

                    /** @type {Record<string, number>} */
                    const originalItems = {}
                    bot.inventoryItems().forEach(item => {
                        originalItems[item.name] ??= 0
                        originalItems[item.name] += item.count
                    })

                    const interval = new Interval(20000)
                    const timeout = new Interval(60000)

                    while (true) {
                        yield* sleepG(100)
                        /** @type {Record<string, number>} */
                        const newItems = {}
                        bot.inventoryItems().forEach(item => {
                            newItems[item.name] ??= 0
                            newItems[item.name] += item.count
                        })

                        /** @type {Record<string, number>} */
                        const delta = { ...newItems }
                        for (const key in originalItems) {
                            delta[key] ??= 0
                            delta[key] -= originalItems[key]
                            if (delta[key] === 0) { delete delta[key] }
                        }
                        let done = false
                        for (const key in delta) {
                            if (key === step.item &&
                                delta[key] >= step.count) {
                                done = true
                                if (delta[key] > step.count) {
                                    bot.bot.whisper(requestPlayer, `Too much`)
                                    yield* giveTo.task(bot, {
                                        player: requestPlayer,
                                        items: [{ name: key, count: step.count - delta[key] }],
                                    })
                                }
                            } else if (delta[key] > 0) {
                                bot.bot.whisper(requestPlayer, `This aint a ${step.item}`)
                                yield* giveTo.task(bot, {
                                    player: requestPlayer,
                                    items: [{ name: key, count: delta[key] }],
                                })
                            }
                        }

                        if (done) {
                            bot.bot.whisper(requestPlayer, `Thanks`)
                            break
                        }

                        if (timeout.done()) {
                            for (const key in delta) {
                                if (delta[key] > 0) {
                                    yield* giveTo.task(bot, {
                                        player: requestPlayer,
                                        items: [{ name: key, count: delta[key] }],
                                    })
                                }
                            }
                            throw `${requestPlayer} didn't give me ${step.count} ${step.item}`
                        }

                        if (interval.done()) {
                            bot.bot.whisper(requestPlayer, `Please give me ${step.count - (delta[step.item] ?? 0)} ${step.item}`)
                        }
                    }

                    continue
                }

                case 'dig': {
                    for (let i = step.retryCount - 1; i >= 0; i--) {
                        try {
                            let block = bot.bot.blockAt(step.block.position)
                            while (!block || block.name !== step.block.name) {
                                yield* sleepG(100)
                                if (!block) {
                                    yield* goto.task(bot, {
                                        block: step.block.position,
                                    })
                                    block = bot.bot.blockAt(step.block.position)
                                }

                                if (!block) { break }

                                const timeout = new Timeout(5000)
                                while (!timeout.done() && block && block.name !== step.block.name) {
                                    yield* sleepG(100)
                                    block = bot.bot.blockAt(step.block.position)
                                }
                            }

                            if (!block) {
                                throw `Chunk where I like to dig aint loaded`
                            }

                            if (block.name !== step.block.name) {
                                throw `Unexpected block at ${step.block.position}: expected ${step.block.name}, found ${block.name}`
                            }

                            const digResult = yield* dig.task(bot, {
                                block: block,
                                alsoTheNeighbors: false,
                            })

                            if (digResult.itemsDelta[step.willGet.item] < step.willGet.count) {
                                throw `Couldn't dig ${step.willGet.count} ${step.willGet.item}: got ${digResult.itemsDelta[step.willGet.item]}`
                            }
                            break
                        } catch (error) {
                            if (i === 0) { throw error }
                            console.warn(`[Bot "${bot.username}"]: ${error} (remaining retries: ${i})`)
                        }
                    }
                    continue
                }

                default: debugger
            }
        }
    } finally {
        if (openedChest !== null) {
            openedChest.chest.close()
            openedChest = null
        }
    }
}

/**
 * @param {import('../bruh-bot')} bot
 * @param {Plan} plan
 */
function stringifyPlan(bot, plan) {
    let builder = ''

    for (const step of plan) {
        if (!('type' in step)) {
            builder += `/--SUB-PLAN\n`
            const stringifiedSubplan = stringifyPlan(bot, step).split('\n')
            for (const stringifiedSubstep of stringifiedSubplan) {
                builder += `| ${stringifiedSubstep}\n`
            }
            continue
        }
        switch (step.type) {
            case 'inventory': {
                builder += `I have ${step.count} ${step.item} in my inventory\n`
                break
            }
            case 'chest': {
                builder += `I found ${step.count} ${step.item} in a chest (${step.chest})\n`
                break
            }
            case 'harvest-mob': {
                builder += `Harvest mob ${step.entity.expectedType} for ${step.count} ${step.item}\n`
                break
            }
            case 'craft': {
                builder += `Craft ${step.recipe.result.count} ${step.item}, ${step.count} times\n`
                break
            }
            case 'smelt': {
                builder += `Smelt ${step.count} ${step.recipe.result}\n`
                break
            }
            case 'goto': {
                builder += `Goto ${step.destination}\n`
                break
            }
            case 'request': {
                builder += `Request item from others\n`
                break
            }
            case 'trade': {
                if (step.trade.inputItem2) {
                    builder += `Buy ${step.trade.outputItem.count} ${step.trade.outputItem.name} for ${step.trade.inputItem1.count} ${step.trade.inputItem1.name} and ${step.trade.inputItem2.count} ${step.trade.inputItem2.name}, ${step.count} times\n`
                } else {
                    builder += `Buy ${step.trade.outputItem.count} ${step.trade.outputItem.name} for ${step.trade.inputItem1.count} ${step.trade.inputItem1.name}, ${step.count} times\n`
                }
                break
            }
            case 'bundle-out': {
                builder += `I have a bundle with ${step.count} ${step.item} in it\n`
                break
            }
            case 'request-from-anyone': {
                builder += `Request ${step.count} ${step.item} from anyone\n`
                break
            }
            case 'dig': {
                builder += `Dig ${step.block.name} at ${step.block.position}\n`
                break
            }
            default: {
                debugger
                break
            }
        }
    }

    return builder.trim()
}

/**
 * @param {Plan} plan
 * @returns {OrganizedPlan}
 */
function organizePlan(plan) {
    const indexedSteps = plan.flat(2).map((v, index) => ({
        ...v,
        i: index,
    }))

    const grouped = indexedSteps.reduce((memo, x) => {
        if (!memo[x.type]) { memo[x.type] = [] }
        // @ts-ignore
        memo[x.type].push(x)
        return memo
    }, /** @type {{ [K in PlanStep['type']]: Array<PlanStep<K> & { i: number; }> }} */({}))

    /** @type {ReadonlyArray<PlanStepType>} */ //@ts-ignore
    const stepTypes = Object.keys(grouped)

    /** @type {readonly ['craft', 'trade', 'goto', 'smelt', 'dig', 'bundle-out']} */
    const orderedStepTypes = ['craft', 'trade', 'goto', 'smelt', 'dig', 'bundle-out']

    /** @typedef {orderedStepTypes[number]} OrderedStepTypes */
    /** @typedef {Exclude<PlanStepType, OrderedStepTypes>} UnorderedStepTypes */

    /** @type {Array<PlanStep<OrderedStepTypes> & { i: number; }>} */
    const orderedSteps = []
    /** @type {Array<PlanStep<UnorderedStepTypes> & { i: number; }>} */
    const unorderedSteps = []

    for (const stepType of stepTypes) {
        const steps = grouped[stepType]
        // @ts-ignore
        if (orderedStepTypes.includes(stepType)) {
            // @ts-ignore
            orderedSteps.push(...steps)
        } else {
            // @ts-ignore
            unorderedSteps.push(...steps)
        }
    }

    /** @type {Record<UnorderedStepTypes, number>} */ //@ts-ignore
    const unorderedStepPriorities = {}
        ;[
            'request-from-anyone',
            'request',
            'chest',
            'inventory',
            // @ts-ignore
        ].forEach((value, index) => unorderedStepPriorities[value] = index)

    orderedSteps.sort((a, b) => a.i - b.i)
    unorderedSteps.sort((a, b) => unorderedStepPriorities[a.type] - unorderedStepPriorities[b.type])

    return [
        ...unorderedSteps,
        ...orderedSteps,
    ]
}

/**
 * @type {import('../task').TaskDef<{ item: string; count: number; }, Args> & {
 *   planCost: planCost;
 *   planResult: planResult;
 *   plan: plan;
 *   organizePlan: organizePlan;
 *   stringifyPlan: stringifyPlan;
 *   PredictedEnvironment: typeof PredictedEnvironment,
 * }}
 */
const def = {
    task: function*(bot, args) {
        if (typeof args.item === 'string') args.item = [args.item]

        const bestPlan = yield* planAny(
            bot,
            args.item,
            args.count,
            args,
            {
                depth: 0,
                recursiveItems: [],
            },
            [])

        yield

        const _organizedPlan = organizePlan(bestPlan.plan)
        const _planResult = planResult(_organizedPlan, bestPlan.item)
        if (_planResult <= 0) {
            throw `Can't gather ${bestPlan.item}`
        }
        if (_planResult < args.count) {
            throw `I can only gather ${_planResult} ${bestPlan.item}`
        }
        console.log(`[Bot "${bot.username}"] Plan for ${args.count} of ${bestPlan.item}:`)
        console.log(stringifyPlan(bot, _organizedPlan))
        console.log(`[Bot "${bot.username}"] Environment in the future:`)
        {
            let builder = ''
            const future = new PredictedEnvironment(_organizedPlan, bot.mc.registry)

            let inventoryBuilder = ''
            for (const name in future.inventory) {
                const delta = future.inventory[name]
                if (!delta) { continue }
                inventoryBuilder += `  ${(delta < 0) ? delta : ('+' + delta)} ${name}\n`
            }
            if (inventoryBuilder) {
                builder += 'Inventory:\n'
                builder += inventoryBuilder
            }

            let chestsBuilder = ''
            for (const position in future.chests) {
                /** @type {typeof future.chests[keyof typeof future.chests]} */ // @ts-ignore
                const chest = future.chests[position]
                chestsBuilder += `  at "${chest.location}"`
                for (const name in chest.delta) {
                    const delta = chest.delta[name]
                    if (!delta) { continue }
                    chestsBuilder += ` ${(delta < 0) ? delta : ('+' + delta)} ${name}\n`
                }
            }
            if (chestsBuilder) {
                builder += 'Chests:\n'
                builder += chestsBuilder
            }

            console.log(builder)
        }

        const itemsBefore = bot.inventoryItemCount(null, { name: bestPlan.item })
        yield* evaluatePlan(bot, _organizedPlan)
        const itemsAfter = bot.inventoryItemCount(null, { name: bestPlan.item })
        const itemsGathered = itemsAfter - itemsBefore

        return {
            item: bestPlan.item,
            count: itemsGathered,
        }
    },
    id: function(args) {
        return `gather-${args.count}-${args.item}`
    },
    humanReadableId: function(args) {
        return `Gathering ${args.count} ${args.item}`
    },
    definition: 'gatherItem',
    planCost: planCost,
    planResult: planResult,
    plan: plan,
    organizePlan: organizePlan,
    stringifyPlan: stringifyPlan,
    PredictedEnvironment: PredictedEnvironment,
}

module.exports = def
