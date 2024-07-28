const { wrap, sleepG } = require('../utils/tasks')
const placeBlock = require('./place-block')
const goto = require('./goto')
const { Recipe } = require('prismarine-recipe')
const { Chest } = require('mineflayer')
const pickupItem = require('./pickup-item')
const trade = require('./trade')
const Vec3Dimension = require('../vec3-dimension')

/**
 * @typedef {PermissionArgs & {
 *   count: number;
 *   item: string | ReadonlyArray<string>;
 *   baseItems?: ReadonlyArray<number>;
 *   originalCount?: number;
 *   depth?: number;
 * }} Args
 */

/**
 * @typedef {{
*   canUseInventory: boolean;
*   canDig: boolean;
*   canKill: boolean;
*   canCraft: boolean;
*   canUseChests: boolean;
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
 *   cachedPlans: Record<string, ReadonlyArray<PlanStep>>;
 * }} PlanningContext
 */

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
 * @param {import('../bruh-bot')} bot
 * @param {string} item
 * @param {number} count
 * @param {PermissionArgs} permissions
 * @param {PlanningContext} context
 * @returns {import('../task').Task<Plan>}
 */
function* plan(bot, item, count, permissions, context) {
    const cachedPlan = context.cachedPlans[`${item}-${count}`]
    if (context.cachedPlans[`${item}-${count}`]) {
        return cachedPlan
    }

    const _depthPrefix = ' '.repeat(context.depth)
    if (context.recursiveItems.includes(item)) {
        console.warn(`[Bot "${bot.bot.username}"] ${_depthPrefix} Recursive plan for item "${item}", skipping`)
        return []
    }
    if (context.depth > 10) {
        console.warn(`[Bot "${bot.bot.username}"] ${_depthPrefix} Too plan for item "${item}", skipping`)
        return []
    }

    if (planningLogs) console.log(`[Bot "${bot.bot.username}"] ${_depthPrefix} Planning ${count} "${item}" ...`)

    /**
     * @type {Array<PlanStep | ReadonlyArray<PlanStep>>}
     */
    const result = []

    if (permissions.canUseInventory) {
        yield
        if (planningLogs) console.log(`[Bot "${bot.bot.username}"] ${_depthPrefix} | Check inventory ...`)
        const inInventory = bot.itemCount(item)
        if (inInventory > 0) {
            if (planningLogs) console.log(`[Bot "${bot.bot.username}"] ${_depthPrefix} |   Has ${inInventory}`)
            const needFromInventory = Math.min(inInventory, count)
            result.push({
                type: 'inventory',
                item: item,
                count: needFromInventory,
            })
        } else {
            if (planningLogs) console.log(`[Bot "${bot.bot.username}"] ${_depthPrefix} |   None`)
        }
    }

    if (planResult(result, item) >= count) { return result }

    if (permissions.canUseChests) {
        yield
        if (planningLogs) console.log(`[Bot "${bot.bot.username}"] ${_depthPrefix} | Check chests ...`)
        const inChests = bot.env.searchForItem(bot, item)
        const inChestsWithMyItems = inChests.filter(v => v.myCount > 0 && v.position.dimension === bot.dimension)
        inChestsWithMyItems.sort((a, b) => {
            const aDist = bot.bot.entity.position.distanceSquared(a.position.xyz(bot.dimension))
            const bDist = bot.bot.entity.position.distanceSquared(b.position.xyz(bot.dimension))
            return aDist - bDist
        })
        for (const inChestWithMyItems of inChestsWithMyItems) {
            yield
            const needFromChest = Math.min(inChestWithMyItems.myCount, count)
            if (planningLogs) console.log(`[Bot "${bot.bot.username}"] ${_depthPrefix} |   Found ${inChestWithMyItems.myCount} in a chest`)
            result.push({
                type: 'chest',
                chest: inChestWithMyItems.position,
                item: item,
                count: needFromChest,
            })

            if (planResult(result, item) >= count) { return result }
        }
        if (inChestsWithMyItems.length === 0) {
            if (planningLogs) console.log(`[Bot "${bot.bot.username}"] ${_depthPrefix} |   None`)
        }
    }

    if (planResult(result, item) >= count) { return result }

    {
        const need = count - planResult(result, item)
        const locked = bot.env.lockOthersItems(bot.bot.username, item, need)
        if (locked.length > 0) {
            result.push({
                type: 'request',
                locks: locked,
            })
        }
    }

    if (planResult(result, item) >= count) { return result }

    if (permissions.canCraft) {
        yield
        const recipes = bot.bot.recipesAll(bot.mc.data.itemsByName[item].id, null, true)
        if (planningLogs) console.log(`[Bot "${bot.bot.username}"] ${_depthPrefix} | Check ${recipes.length} recipes ...`)
        /**
         * @type {{ plan: Array<ReadonlyArray<PlanStep>>; recipe: Recipe; } | null}
         */
        let bestRecipe = null
        let bestRecipeCost = 9999999
        for (const recipe of recipes) {
            yield
            let notGood = false
            /**
             * @type {Array<ReadonlyArray<PlanStep>>}
             */
            const ingredientPlans = []
            for (const ingredient of recipe.delta) {
                if (ingredient.count >= 0) { continue }
                yield
                const ingredientCount = -ingredient.count
                const subplan = yield* plan(bot, bot.mc.data.items[ingredient.id].name, ingredientCount, permissions, {
                    depth: context.depth + 1,
                    recursiveItems: [
                        ...context.recursiveItems,
                        item,
                    ],
                    cachedPlans: context.cachedPlans,
                })
                context.cachedPlans[`${ingredient.id}-${ingredientCount}`] = subplan.flat()
                const subplanResult = planResult(subplan, bot.mc.data.items[ingredient.id].name)
                if (subplanResult < ingredientCount) {
                    notGood = true
                    break
                }
                ingredientPlans.push(subplan.flat())
            }
            if (notGood) {
                if (planningLogs) console.log(`[Bot "${bot.bot.username}"] ${_depthPrefix} |   Not good`)
                continue
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
            if (!bestRecipe || bestRecipeCost > thisPlanCost) {
                bestRecipe = {
                    plan: multipliedIngredientPaths,
                    recipe: recipe,
                }
                bestRecipeCost = thisPlanCost
            }
        }

        if (bestRecipe &&
            bestRecipe.recipe.requiresTable &&
            planResult(result, 'crafting_table') <= 0) {
            if (planningLogs) console.log(`[Bot "${bot.bot.username}"] ${_depthPrefix} |   Plan for crafting table ...`)
            yield
            const tableInWorld = bot.bot.findBlock({
                matching: bot.mc.data.blocksByName['crafting_table'].id,
                maxDistance: 32,
            })
            if (!tableInWorld) {
                const tablePlan = yield* plan(bot, 'crafting_table', 1, permissions, {
                    depth: context.depth,
                    recursiveItems: [
                        ...context.recursiveItems,
                        item,
                    ],
                    cachedPlans: context.cachedPlans,
                })
                context.cachedPlans[`${'crafting_table'}-${1}`] = tablePlan.flat()
                if (planResult(tablePlan, 'crafting_table') <= 0) {
                    if (planningLogs) console.log(`[Bot "${bot.bot.username}"] ${_depthPrefix} |   Can't gather crafting table, recipe is not good`)
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

        if (bestRecipe) {
            if (planningLogs) console.log(`[Bot "${bot.bot.username}"] ${_depthPrefix} |   Recipe found`)
            result.push(bestRecipe.plan.flat())
            result.push({
                type: 'craft',
                item: bot.mc.data.items[bestRecipe.recipe.result.id].name,
                count: Math.ceil(count / bestRecipe.recipe.result.count),
                recipe: bestRecipe.recipe,
            })
        } else {
            if (planningLogs) console.log(`[Bot "${bot.bot.username}"] ${_depthPrefix} |   No recipe found`)
        }
    }

    if (planResult(result, item) >= count) { return result }

    {
        const sortedVillagers = [...Object.values(bot.env.villagers)].sort((a, b) => bot.bot.entity.position.distanceSquared(a.position.xyz(bot.dimension)) - bot.bot.entity.position.distanceSquared(b.position.xyz(bot.dimension)))
        for (const villager of sortedVillagers) {
            yield
            const entity = bot.bot.nearestEntity(v => v.uuid === villager.uuid || v.id === villager.id)
            if (!entity || !entity.isValid) { continue }
            for (const trade of villager.trades) {
                if (trade.outputItem.name !== item) { continue }
                const need = count - planResult(result, item)
                if (need <= 0) { break }
                const tradeCount = Math.ceil(need / trade.outputItem.count)

                const pricePlan1 = trade.inputItem1 ? yield* plan(bot, trade.inputItem1.name, trade.inputItem1.count * tradeCount, permissions, {
                    cachedPlans: context.cachedPlans,
                    depth: context.depth + 1,
                    recursiveItems: [
                        ...context.recursiveItems,
                        item,
                        trade.outputItem.name,
                    ],
                }) : null

                const pricePlan2 = trade.inputItem2 ? yield* plan(bot, trade.inputItem2.name, trade.inputItem2.count * tradeCount, permissions, {
                    cachedPlans: context.cachedPlans,
                    depth: context.depth + 1,
                    recursiveItems: [
                        ...context.recursiveItems,
                        item,
                        trade.outputItem.name,
                    ],
                }) : null

                const price1Result = trade.inputItem1 ? planResult([
                    ...result,
                    ...(pricePlan1 ?? []),
                    ...(pricePlan2 ?? []),
                ], trade.inputItem1.name) : null

                const price2Result = trade.inputItem2 ? planResult([
                    ...result,
                    ...(pricePlan1 ?? []),
                    ...(pricePlan2 ?? []),
                ], trade.inputItem2.name) : null

                if (trade.inputItem1 && price1Result < trade.inputItem1.count) { continue }
                if (trade.inputItem2 && price2Result < trade.inputItem2.count) { continue }

                if (pricePlan1) result.push(...pricePlan1)
                if (pricePlan2) result.push(...pricePlan2)

                result.push({
                    type: 'trade',
                    trade: trade,
                    count: tradeCount,
                })
                break
            }
        }
    }

    if (planResult(result, item) >= count) { return result }

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

    console.log(`[Bot "${bot.bot.username}"] Evaluating plan`)

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
                        const chest = yield* wrap(bot.bot.openChest(chestBlock))
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
                                item: tableItem.type,
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
    const inventorySteps = result.filter(v => v.type === 'inventory')
    const chestSteps = result.filter(v => v.type === 'chest')
    const requestSteps = result.filter(v => v.type === 'request')
    const otherSteps = result.filter(v => (v.type !== 'inventory') && (v.type !== 'chest') && (v.type !== 'request'))
    return [
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
 * }}
 */
const def = {
    task: function*(bot, args) {
        if (typeof args.item === 'string') args.item = [args.item]

        /**
         * @type {Array<{ item: string; plan: Plan; planCost: number; planResult: number; }>}
         */
        const itemsAndPlans = []

        for (const item of args.item) {
            const itemPlan = yield* plan(bot, item, args.count, args, {
                depth: 0,
                recursiveItems: [],
                cachedPlans: {},
            })
            itemsAndPlans.push({
                item: item,
                plan: itemPlan,
                planCost: normalizePlanCost(planCost(itemPlan)),
                planResult: planResult(itemPlan, item),
            })
        }

        itemsAndPlans.sort((a, b) => {
            const aGood = a.planResult >= args.count
            const bGood = b.planResult >= args.count
            if (aGood && !bGood) { return -1 }
            if (!aGood && bGood) { return 1 }
            return a.planCost - b.planCost
        })

        const bestPlan = itemsAndPlans[0]

        const _organizedPlan = organizePlan(bestPlan.plan)
        console.log(`[Bot "${bot.bot.username}"] Plan for ${args.count} of ${bestPlan.item}:`)
        console.log(stringifyPlan(bot, _organizedPlan))
        const _planResult = planResult(_organizedPlan, bestPlan.item)
        if (_planResult <= 0) {
            throw `Can't gather ${bestPlan.item}`
        }
        if (_planResult < args.count) {
            throw `I can only gather ${_planResult} ${bestPlan.item}`
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
}

module.exports = def
