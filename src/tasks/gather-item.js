const { wrap } = require('../utils/tasks')
const placeBlock = require('./place-block')
const goto = require('./goto')
const { Vec3 } = require('vec3')
const { Recipe } = require('prismarine-recipe')
const { Chest } = require('mineflayer')

/**
 * @typedef {PermissionArgs & {
 *   count: number;
 *   item: string;
 *   baseItems?: Array<number>;
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
 *   item: number;
 *   count: number;
 * } & ({
 *   type: 'chest';
 *   chest: Vec3;
 * } | {
 *   type: 'craft';
 *   recipe: Recipe;
 * } | {
 *   type: 'smelt';
 * } | {
 *   type: 'inventory';
 * })) | {
 *   type: 'goto';
 *   destination: Vec3;
 *   distance: number;
 * }} PlanStep
 */

/**
 * @typedef {{
 *   depth: number;
 *   recursivityItems: Array<number>;
 *   cachedPlans: Record<string, ReadonlyArray<PlanStep>>;
 * }} PlanningContext
 */

const planningLogs = false

/**
 * @param {ReadonlyArray<PlanStep | ReadonlyArray<PlanStep>>} plan
 */
function planCost(plan) {
    let cost = 0
    for (const step of plan) {
        if ('type' in step) {
            switch (step.type) {
                case 'chest':
                case 'inventory':
                case 'goto':
                    break
                case 'craft': {
                    if (step.recipe.requiresTable) {
                        cost += 1
                    }
                    break
                }
                case 'smelt': {
                    cost += 2
                    break
                }
                default:
                    break
            }
        } else {
            cost += planCost(step)
        }
    }
    return cost
}

/**
 * @param {ReadonlyArray<PlanStep | ReadonlyArray<PlanStep>>} plan
 * @param {number} item
 */
function planResult(plan, item) {
    let count = 0
    for (const step of plan) {
        if ('type' in step) {
            if (step.type === 'goto') { continue }
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
 * @param {number} item
 * @param {number} count
 * @param {PermissionArgs} permissions
 * @param {PlanningContext} context
 * @returns {import('../task').Task<ReadonlyArray<PlanStep | ReadonlyArray<PlanStep>>>}
 */
function* plan(bot, item, count, permissions, context) {
    const cachedPlan = context.cachedPlans[`${item}-${count}`]
    if (context.cachedPlans[`${item}-${count}`]) {
        return cachedPlan
    }

    const _depthPrefix = ' '.repeat(context.depth)
    if (context.recursivityItems.includes(item)) {
        console.warn(`[Bot "${bot.bot.username}"] ${_depthPrefix} Recursive plan for item "${bot.mc.data.items[item].name}", skipping`)
        return [ ]
    }
    if (context.depth > 10) {
        console.warn(`[Bot "${bot.bot.username}"] ${_depthPrefix} Too plan for item "${bot.mc.data.items[item].name}", skipping`)
        return [ ]
    }

    if (planningLogs) console.log(`[Bot "${bot.bot.username}"] ${_depthPrefix} Plan ${count} of item "${bot.mc.data.items[item].name}" ...`)

    /**
     * @type {Array<PlanStep | ReadonlyArray<PlanStep>>}
     */
    const result = [ ]

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
        const inChestsWithMyItems = inChests.filter(v => v.myCount > 0)
        inChestsWithMyItems.sort((a, b) => {
            const aDist = bot.bot.entity.position.distanceSquared(a.position)
            const bDist = bot.bot.entity.position.distanceSquared(b.position)
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

    if (permissions.canCraft) {
        yield
        const recipes = bot.bot.recipesAll(item, null, true)
        if (planningLogs) console.log(`[Bot "${bot.bot.username}"] ${_depthPrefix} | Check ${recipes.length} recepies ...`)
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
            const ingredientPlans = [ ]
            for (const ingredient of recipe.delta) {
                if (ingredient.count >= 0) { continue }
                yield
                const ingredientCount = -ingredient.count
                const subplan = yield* plan(bot, ingredient.id, ingredientCount, permissions, {
                    depth: context.depth + 1,
                    recursivityItems: [
                        ...context.recursivityItems,
                        item,
                    ],
                    cachedPlans: context.cachedPlans,
                })
                context.cachedPlans[`${ingredient.id}-${ingredientCount}`] = subplan.flat()
                const subplanResult = planResult(subplan, ingredient.id)
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
            const thisPlanCost = planCost(multipliedIngredientPaths)
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
            planResult(result, bot.mc.data.itemsByName['crafting_table'].id) <= 0) {
            if (planningLogs) console.log(`[Bot "${bot.bot.username}"] ${_depthPrefix} |   Plan for crafting table ...`)
            yield
            const tableInWorld = bot.bot.findBlock({
                matching: bot.mc.data.blocksByName['crafting_table'].id,
                maxDistance: 32,
            })
            if (!tableInWorld) {
                const tablePlan = yield* plan(bot, bot.mc.data.itemsByName['crafting_table'].id, 1, permissions, {
                    depth: context.depth,
                    recursivityItems: [
                        ...context.recursivityItems,
                        item,
                    ],
                    cachedPlans: context.cachedPlans,
                })
                context.cachedPlans[`${bot.mc.data.itemsByName['crafting_table'].id}-${1}`] = tablePlan.flat()
                if (planResult(tablePlan, bot.mc.data.itemsByName['crafting_table'].id) <= 0) {
                    if (planningLogs) console.log(`[Bot "${bot.bot.username}"] ${_depthPrefix} |   Can't gather crafting table, recipe is not good`)
                    bestRecipe = null
                }
                result.push(tablePlan.flat())
            } else {
                result.push({
                    type: 'goto',
                    destination: tableInWorld.position.clone(),
                    distance: 2,
                })
            }
        }

        if (bestRecipe) {
            if (planningLogs) console.log(`[Bot "${bot.bot.username}"] ${_depthPrefix} |   Recepie found`)
            result.push(bestRecipe.plan.flat())
            result.push({
                type: 'craft',
                item: bestRecipe.recipe.result.id,
                count: Math.ceil(count / bestRecipe.recipe.result.count),
                recipe: bestRecipe.recipe,
            })
        } else {
            if (planningLogs) console.log(`[Bot "${bot.bot.username}"] ${_depthPrefix} |   No recepie found`)
        }
    }

    if (planResult(result, item) >= count) { return result }

    return result
}

/**
 * @param {import('../bruh-bot')} bot
 * @param {ReadonlyArray<PlanStep>} plan
 * @returns {import('../task').Task<void>}
 */
function* evaluatePlan(bot, plan) {
    /**
     * @type {{ chestPosition: Vec3; chest: Chest; } | null}
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
                        destination: step.destination,
                        range: step.distance,
                    })
                    continue
                }
                case 'chest': {
                    yield* goto.task(bot, {
                        destination: step.chest.clone(),
                        range: 2,
                    })
                    const chestBlock = bot.bot.blockAt(step.chest)
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
                            chestPosition: chestBlock.position.clone(),
                            chest: chest,
                        }
                    }
                    const took = yield* bot.env.chestDeposit(bot, openedChest.chest, openedChest.chestPosition, step.item, -step.count)
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
                            throw `There is no crafing table`
                        }
                        yield* goto.task(bot, {
                            destination: tableBlock.position.clone(),
                            range: 2,
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
 * @param {ReadonlyArray<PlanStep | ReadonlyArray<PlanStep>>} plan
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
                builder += `I have ${step.count} of ${bot.mc.data.items[step.item].name} in my inventory\n`
                break
            }
            case 'chest': {
                builder += `I found ${step.count} of ${bot.mc.data.items[step.item].name} in a chest\n`
                break
            }
            case 'craft': {
                builder += `Craft ${step.count} of ${step.recipe.result.count}x ${bot.mc.data.items[step.item].name}\n`
                break
            }
            case 'smelt': {
                builder += `Smelt ${step.count} of ${bot.mc.data.items[step.item].name}\n`
                break
            }
            case 'goto': {
                builder += `Goto ${step.destination}\n`
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
 * @param {ReadonlyArray<PlanStep | ReadonlyArray<PlanStep>>} plan
 * @returns {ReadonlyArray<PlanStep>}
 */
function organizePlan(plan) {
    let result = [ ]
    for (const step of plan) {
        if ('type' in step) {
            result.push(step)
        } else {
            result.push(...step)
        }
    }
    const inventorySteps = result.filter(v => v.type === 'inventory')
    const chestSteps = result.filter(v => v.type === 'chest')
    const otherSteps = result.filter(v => (v.type !== 'inventory') && (v.type !== 'chest'))
    return [
        ...inventorySteps,
        ...chestSteps,
        ...otherSteps,
    ]
}

/**
 * @type {import('../task').TaskDef<void, Args>}
 */
const def = {
    task: function*(bot, args) {
        const itemId = bot.mc.data.itemsByName[args.item].id
        const _plan = yield* plan(bot, itemId, args.count, args, {
            depth: 0,
            recursivityItems: [ ],
            cachedPlans: { },
        })
        // console.log(`[Bot "${bot.bot.username}"] PLAN:`)
        // console.log(stringifyPlan(bot, _plan))
        const _organizedPlan = organizePlan(_plan)
        console.log(`[Bot "${bot.bot.username}"] Plan for ${args.count} of ${bot.mc.data.items[itemId].name}:`)
        console.log(stringifyPlan(bot, _organizedPlan))
        const _planResult = planResult(_organizedPlan, itemId)
        if (_planResult <= 0) {
            throw `Can't gather ${bot.mc.data.items[itemId].name}`
        }
        if (_planResult < args.count) {
            throw `I can only gather ${_planResult} of ${bot.mc.data.items[itemId].name}`
        }
        yield* evaluatePlan(bot, _organizedPlan)
    },
    id: function(args) {
        return `gather-${args.count}-${args.item}`
    },
    humanReadableId: function(args) {
        return `Gathering ${args.count} of ${args.item}`
    },
}

module.exports = def
