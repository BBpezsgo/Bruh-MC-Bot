const { wrap, sleepG } = require('../utils/tasks')
const placeBlock = require('./place-block')
const goto = require('./goto')
const { Recipe } = require('prismarine-recipe')
const { Chest } = require('mineflayer')
const pickupItem = require('./pickup-item')
const trade = require('./trade')
const Vec3Dimension = require('../vec3-dimension')
const bundle = require('../utils/bundle')
const { parseYesNoH, parseLocationH, toArray, Interval } = require('../utils/other')
const giveTo = require('./give-to')

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
*   canUseInventory: boolean;
*   canDig: boolean;
*   canKill: boolean;
*   canCraft: boolean;
*   canUseChests: boolean;
*   canRequestFromPlayers: boolean;
* }} PermissionArgs
*/

/**
 * @typedef {({
 *   item: string;
 *   count: number;
 * } & ({
 *   type: 'chest';
 *   chest: Vec3Dimension;
 * } | {
 *   type: 'craft';
 *   recipe: Recipe;
 * } | {
 *   type: 'smelt';
 * } | {
 *   type: 'inventory';
 * })) | {
 *   type: 'goto';
 *   destination: Vec3Dimension;
 *   distance: number;
 * } | {
 *   type: 'request';
 *   locks: ReadonlyArray<import('../bruh-bot').ItemLock>;
 * } | {
 *   type: 'trade';
 *   trade: import('../environment').SavedVillager['trades'][0];
 *   count: number;
 * } | {
 *   type: 'bundle-out';
 *   item: string;
 *   count: number;
 * } | {
 *   type: 'request-from-anyone';
 *   item: string;
 *   count: number;
 * }} PlanStep
 */

/**
 * @typedef {{
 *   movement: number;
 *   other: number;
 * }} PlanCost
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
     * @type {Record<import('../environment').PositionHash, Record<string, number>>}
     */
    chests

    /**
     * @param {ReadonlyArray<PlanStep>} steps
     * @param {import('../mc')['data']} registry
     */
    constructor(steps, registry) {
        this.inventory = {}
        this.chests = {}
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
                    this.chests[hash] ??= {}
                    this.chests[hash][step.item] ??= 0
                    this.chests[hash][step.item] -= step.count
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
                    this.inventory[step.item] ??= 0
                    this.inventory[step.item] += step.count
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
 * @returns {PlanCost}
 */
function planCost(plan) {
    /**
     * @type {PlanCost}
     */
    const cost = {
        movement: 0,
        other: 0,
    }

    for (const step of plan) {
        if ('type' in step) {
            switch (step.type) {
                case 'chest':
                case 'inventory':
                case 'goto':
                    break
                case 'craft': {
                    if (step.recipe.requiresTable) {
                        cost.other += 1
                    }
                    break
                }
                case 'bundle-out': {
                    cost.other += 1
                    break
                }
                case 'smelt': {
                    cost.other += 2
                    break
                }
                case 'request': {
                    cost.other += 5
                    break
                }
                case 'trade': {
                    cost.other += 10
                    break
                }
                case 'request-from-anyone': {
                    cost.other += 1000
                    break
                }
                default:
                    break
            }
        } else {
            const subCost = planCost(step)
            cost.movement += subCost.movement;
            cost.other += subCost.other;
        }
    }
    return cost
}

/**
 * @param {PlanCost} planCost 
 */
function normalizePlanCost(planCost) {
    return planCost.movement + planCost.other
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
            if (step.item === item) {
                switch (step.type) {
                    case 'chest':
                    case 'inventory':
                    case 'smelt': {
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

        const future = new PredictedEnvironment(planSoFar.flat(), bot.mc.data)

        if (planningLogs) console.log(`[Bot "${bot.username}"] ${_depthPrefix} | Check inventory ...`)

        const inInventory = bot.itemCount(item) + (future.inventory[item] ?? 0)
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
        const _depthPrefix = ' '.repeat(context.depth)

        if (!permissions.canUseChests) { return null }

        const future = new PredictedEnvironment(planSoFar.flat(), bot.mc.data)

        if (planningLogs) console.log(`[Bot "${bot.username}"] ${_depthPrefix} | Check chests ...`)
        const inChests = bot.env.searchForItem(bot, item)
        const inChestsWithMyItems = inChests.filter(v => {
            const have = v.myCount + (future.chests[`${v.position.x}-${v.position.y}-${v.position.z}-${v.position.dimension}`]?.[item] ?? 0)
            return have > 0 && v.position.dimension === bot.dimension
        })
        inChestsWithMyItems.sort((a, b) => {
            const aDist = bot.bot.entity.position.distanceSquared(a.position.xyz(bot.dimension))
            const bDist = bot.bot.entity.position.distanceSquared(b.position.xyz(bot.dimension))
            return aDist - bDist
        })

        for (const inChestWithMyItems of inChestsWithMyItems) {
            yield
            const have = inChestWithMyItems.myCount + (future.chests[`${inChestWithMyItems.position.x}-${inChestWithMyItems.position.y}-${inChestWithMyItems.position.z}-${inChestWithMyItems.position.dimension}`]?.[item] ?? 0)
            const needFromChest = Math.min(have, count)
            if (planningLogs) console.log(`[Bot "${bot.username}"] ${_depthPrefix} |   Found ${have} in a chest`)

            return {
                type: 'chest',
                chest: inChestWithMyItems.position,
                item: item,
                count: needFromChest,
            }
        }

        if (planningLogs) console.log(`[Bot "${bot.username}"] ${_depthPrefix} |   None`)
        return null
    },
    function*(bot, item, count, permissions, context, planSoFar) {
        // const _depthPrefix = ' '.repeat(context.depth)

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

        const recipes = bot.bot.recipesAll(bot.mc.data.itemsByName[item].id, null, true)
        if (planningLogs) console.log(`[Bot "${bot.username}"] ${_depthPrefix} | Check ${recipes.length} recipes ...`)
        const scoredRecipes = recipes.map(v => {
            let score = 0
            for (const delta of v.delta) {
                if (delta.count > 0) { continue }
                const item = bot.mc.data.items[delta.id].name
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
            /**
             * @type {Array<ReadonlyArray<PlanStep>>}
             */
            const ingredientPlans = []
            for (const ingredient of recipe.delta) {
                if (ingredient.count >= 0) { continue }
                yield
                const ingredientCount = -ingredient.count
                const subplan = yield* plan(bot, bot.mc.data.items[ingredient.id].name, ingredientCount, {
                    ...permissions,
                    force: false,
                }, {
                    depth: context.depth + 1,
                    recursiveItems: [
                        ...context.recursiveItems,
                        item,
                    ],
                })
                const subplanResult = planResult(subplan, bot.mc.data.items[ingredient.id].name)
                if (subplanResult < ingredientCount) {
                    if (planningLogs) console.log(`[Bot "${bot.username}"] ${_depthPrefix} |   Not good`)
                    return null
                }
                ingredientPlans.push(subplan.flat())
            }

            /**
             * @type {Array<ReadonlyArray<PlanStep>>}
             */
            const multipliedIngredientPaths = []
            const actualCraftCount = Math.ceil(count / recipe.result.count)
            for (let i = 0; i < actualCraftCount; i++) {
                multipliedIngredientPaths.push(...ingredientPlans)
            }
            const thisPlanCost = normalizePlanCost(planCost(multipliedIngredientPaths))
            if (thisPlanCost < bestRecipeCost) {
                bestRecipe = {
                    plan: multipliedIngredientPaths,
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

        if (bestRecipe.recipe.requiresTable &&
            planResult(planSoFar, 'crafting_table') <= 0) {
            if (planningLogs) console.log(`[Bot "${bot.username}"] ${_depthPrefix} |   Plan for crafting table ...`)
            yield
            const tableInWorld = bot.bot.findBlock({
                matching: bot.mc.data.blocksByName['crafting_table'].id,
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
                })
                if (planResult(tablePlan, 'crafting_table') <= 0) {
                    if (planningLogs) console.log(`[Bot "${bot.username}"] ${_depthPrefix} |   Can't gather crafting table, recipe is not good`)
                    bestRecipe = null
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

        if (!bestRecipe) { return null }

        if (planningLogs) console.log(`[Bot "${bot.username}"] ${_depthPrefix} |   Recipe found`)

        result.push(bestRecipe.plan.flat())
        result.push({
            type: 'craft',
            item: bot.mc.data.items[bestRecipe.recipe.result.id].name,
            count: Math.ceil(count / bestRecipe.recipe.result.count),
            recipe: bestRecipe.recipe,
        })

        return result
    },
    function*(bot, item, count, permissions, context, planSoFar) {
        // const _depthPrefix = ' '.repeat(context.depth)

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
                }) : null

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
                }) : null

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
        // const _depthPrefix = ' '.repeat(context.depth)

        if (!permissions.canRequestFromPlayers) { return null }

        return {
            type: 'request-from-anyone',
            item: item,
            count: count,
        }
    },
]

/**
 * @param {import('../bruh-bot')} bot
 * @param {string} item
 * @param {number} count
 * @param {PermissionArgs & { force?: boolean }} permissions
 * @param {PlanningContext} context
 * @returns {import('../task').Task<Plan>}
 */
function* plan(bot, item, count, permissions, context) {
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
            const _plan = yield* planner(bot, item, need, permissions, context, result)
            if (!_plan) { continue }
            const _planCost = normalizePlanCost(planCost([_plan].flat(3)))
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
                    const took = yield* bot.env.chestDeposit(bot, openedChest.chest, new Vec3Dimension(openedChest.chestPosition, bot.dimension), step.item, -step.count)
                    if (took < step.count) {
                        throw `Item disappeared from chest`
                    }
                    continue
                }
                case 'craft': {
                    for (const ingredient of step.recipe.delta) {
                        if (ingredient.count >= 0) { continue }
                        const has = bot.bot.inventory.count(ingredient.id, ingredient.metadata)
                        if (has < -ingredient.count) {
                            throw `Not enough ${bot.mc.data.items[ingredient.id].name} for ${step.item}, I have ${has} but I need ${-ingredient.count}`
                        }
                    }
                    if (step.recipe.requiresTable) {
                        let tableBlock = bot.bot.findBlock({
                            matching: bot.mc.data.blocksByName['crafting_table'].id,
                            maxDistance: 64,
                        })
                        if (!tableBlock) {
                            const tableItem = bot.searchItem('crafting_table')
                            if (!tableItem) {
                                throw `I have no crafting table`
                            }
                            yield* placeBlock.task(bot, {
                                item: tableItem.name,
                                clearGrass: true,
                            })
                            tableBlock = bot.bot.findBlock({
                                matching: bot.mc.data.blocksByName['crafting_table'].id,
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
                    debugger
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

                    const takenOut = yield* wrap(bundle.takeOutItem(bot.bot, bot.mc.data, bundleItem.slot, items[0].name))

                    if (takenOut.name !== items[0].name) { throw `Unexpected item taken out from the bundle` }
                    if (takenOut.count !== items[0].count) { throw `Unexpected number of item taken out from the bundle` }

                    continue
                }
                case 'request-from-anyone': {
                    let requestPlayer
                    let response
                    try {
                        const _response = yield* bot.ask(
                            (step.count === 1) ?
                                `Can someone give me a ${step.item}?` :
                                `Can someone give me ${step.count} ${step.item}?`,
                            bot.bot.chat,
                            null,
                            30000)
                        response = parseYesNoH(_response.message)
                        requestPlayer = _response.sender
                    } catch (error) {
                        throw `:(`
                    }
                    if (!response) { throw `:(` }

                    bot.bot.whisper(requestPlayer, `I'm going to you for ${step.count} ${step.item}`)

                    let location = bot.env.getPlayerPosition(requestPlayer, 10000)
                    if (!location) {
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
                    toArray(bot.items()).forEach(item => {
                        originalItems[item.name] ??= 0
                        originalItems[item.name] += item.count
                    })

                    const interval = new Interval(20000)
                    const timeout = new Interval(60000)

                    while (true) {
                        yield* sleepG(100)
                        /** @type {Record<string, number>} */
                        const newItems = {}
                        toArray(bot.items()).forEach(item => {
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

                        if (timeout.is()) {
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

                        if (interval.is()) {
                            bot.bot.whisper(requestPlayer, `Please give me ${step.count - (delta[step.item] ?? 0)} ${step.item}`)
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
                builder += `I found ${step.count} ${step.item} in a chest\n`
                break
            }
            case 'craft': {
                builder += `Craft ${step.recipe.result.count} ${step.item}, ${step.count} times\n`
                break
            }
            case 'smelt': {
                builder += `Smelt ${step.count} ${step.item}\n`
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
            default: {
                builder += `<unknown>\n`
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
    let result = []
    for (const step of plan) {
        if ('type' in step) {
            result.push(step)
        } else {
            result.push(...step)
        }
    }
    const userRequestSteps = result.filter(v => v.type === 'smelt')
    const inventorySteps = result.filter(v => v.type === 'inventory')
    const chestSteps = result.filter(v => v.type === 'chest')
    const requestSteps = result.filter(v => v.type === 'request')
    const otherSteps = result.filter(v => (v.type !== 'inventory') && (v.type !== 'chest') && (v.type !== 'request'))
    return [
        ...userRequestSteps,
        ...inventorySteps,
        ...chestSteps,
        ...requestSteps,
        ...otherSteps,
    ]
}

/**
 * @type {import('../task').TaskDef<void, Args> & {
 *   planCost: planCost;
 *   planResult: planResult;
 *   plan: plan;
 *   organizePlan: organizePlan;
 *   stringifyPlan: stringifyPlan;
 *   normalizePlanCost: normalizePlanCost;
 *   PredictedEnvironment: typeof PredictedEnvironment,
 * }}
 */
const def = {
    task: function*(bot, args) {
        if (typeof args.item === 'string') args.item = [args.item]

        /**
         * @type {{ item: string; plan: Plan; planCost: number; planResult: number; } | null}
         */
        let bestPlan = null

        /**
         * @param {string} item
         */
        const visitItem = function*(item) {
            const itemPlan = yield* plan(bot, item, args.count, args, {
                depth: 0,
                recursiveItems: [],
            })
            const _itemPlan = {
                item: item,
                plan: itemPlan,
                planCost: normalizePlanCost(planCost(itemPlan)),
                planResult: planResult(itemPlan, item),
            }
            if (!bestPlan) {
                bestPlan = _itemPlan
                return
            }
            if (!_itemPlan.planResult) { return }
            const bestIsGood = bestPlan.planResult >= args.count
            const currentIsGood = _itemPlan.planResult >= args.count
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

        const scoredItems = args.item.map(v => ({
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
        }

        if (!bestPlan || (bestPlan.planResult < args.count)) {
            for (const item of lastFailedItems) {
                yield* visitItem(item.item)
            }
        }

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
            const future = new PredictedEnvironment(_organizedPlan, bot.mc.data)

            let inventoryBuilder = ''
            for (const name in future.inventory) {
                const delta = future.inventory[name]
                inventoryBuilder += `  ${(delta < 0) ? delta : ('+' + delta)} ${name}\n`
            }
            if (inventoryBuilder) {
                builder += 'Inventory:\n'
                builder += inventoryBuilder
            }
            
            let chestsBuilder = ''
            for (const position in future.chests) {
                /** @type {Record<string, number>} */ // @ts-ignore
                const chest = future.chests[position]
                chestsBuilder += `  at ${position}`
                for (const name in chest) {
                    const delta = chest[name]
                    chestsBuilder += `    ${(delta < 0) ? delta : ('+' + delta)} ${name}\n`
                }
            }
            if (chestsBuilder) {
                builder += 'Chests:\n'
                builder += chestsBuilder
            }

            console.log(builder)
        }
        yield* evaluatePlan(bot, _organizedPlan)
    },
    id: function(args) {
        return `gather-${args.count}-${args.item}`
    },
    humanReadableId: function(args) {
        return `Gathering ${args.count} ${args.item}`
    },
    planCost: planCost,
    normalizePlanCost: normalizePlanCost,
    planResult: planResult,
    plan: plan,
    organizePlan: organizePlan,
    stringifyPlan: stringifyPlan,
    PredictedEnvironment: PredictedEnvironment,
}

module.exports = def
