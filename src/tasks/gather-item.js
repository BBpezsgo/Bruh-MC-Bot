'use strict'

const { wrap, sleepG, sleepTicks, runtimeArgs } = require('../utils/tasks')
const placeBlock = require('./place-block')
const goto = require('./goto')
const { Recipe } = require('prismarine-recipe')
const { Chest } = require('mineflayer')
const pickupItem = require('./pickup-item')
const trade = require('./trade')
const Vec3Dimension = require('../utils/vec3-dimension')
const bundle = require('../utils/bundle')
const { Interval, directBlockNeighbors, Timeout, isItemEquals, stringifyItem, stringifyItemH } = require('../utils/other')
const giveTo = require('./give-to')
const dig = require('./dig')
const smelt = require('./smelt')
const campfire = require('./campfire')
const config = require('../config')
const ItemLock = require('../item-lock')
const BruhBot = require('../bruh-bot')
const Freq = require('../utils/freq')
const brew = require('./brew')
const Minecraft = require('../minecraft')

const planningLogs = false

/**
 * @typedef {PermissionArgs & ({
 *   count: number;
 *   item: import('../utils/other').ItemId | ReadonlyArray<import('../utils/other').ItemId>;
 *   force?: boolean;
 * } | {
 *   plan: Plan;
 *   force?: boolean;
 * })} Args
 */

/**
 * @typedef {{
*   canUseInventory?: boolean;
*   canDigGenerators?: boolean;
*   canDigEnvironment?: boolean;
*   canSmelt?: boolean;
*   canKill?: boolean;
*   canCraft?: boolean;
*   canUseChests?: boolean;
*   canRequestFromPlayers?: boolean;
*   canRequestFromBots?: boolean;
*   canTrade?: boolean;
*   canHarvestMobs?: boolean;
*   canBrew?: boolean;
* }} PermissionArgs
*/

/** @type {ReadonlyArray<PlanStepType>} */
const orderedStepTypes = Object.freeze(['craft', 'trade', 'goto', 'smelt', 'campfire', 'dig', 'bundle-out', 'brew', 'fill-item'])

/** @type {ReadonlyArray<PlanStepType>} */
const unorderedStepTypes = Object.freeze(['request-from-anyone', 'request', 'chest', 'inventory'])

/** @type {Readonly<Record<PlanStepType, number>>} */ //@ts-ignore
const unorderedStepPriorities = {}
// @ts-ignore
unorderedStepTypes.forEach((value, index) => unorderedStepPriorities[value] = index)

/**
 * @typedef {{
 *   'brew': {
 *     type: 'brew';
 *     recipe: import('./brew')['recipes'][0]
 *     count: 1 | 2 | 3;
 *     brewingStand: Vec3Dimension;
 *   };
 *   'fill-item': {
 *     type: 'fill-item';
 *     item: import('../utils/other').ItemId;
 *     expectedResult: import('../utils/other').ItemId;
 *     block: { block: import('prismarine-block').Block; position: Vec3Dimension; };
 *   };
 *   'chest': {
 *     type: 'chest';
 *     item: import('../utils/other').ItemId;
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
 *     recipe: import('../local-minecraft-data').SmeltingRecipe | import('../local-minecraft-data').SmokingRecipe | import('../local-minecraft-data').BlastingRecipe;
 *     count: number;
 *     furnace: Point3;
 *   };
 *   'campfire': {
 *     type: 'campfire';
 *     recipe: import('../local-minecraft-data').CampfireRecipe;
 *     count: 1 | 2 | 3 | 4;
 *   };
 *   'inventory': {
 *     type: 'inventory';
 *     item: import('../utils/other').ItemId;
 *     count: number;
 *     locks: Array<ItemLock>;
 *   };
 *   'goto': {
 *     type: 'goto';
 *     destination: Vec3Dimension;
 *     distance: number;
 *   };
 *   'request': {
 *     type: 'request';
 *     remoteLock: import('../item-lock');
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
 *     block: { position: Vec3Dimension; block: import('prismarine-block').Block; };
 *     loot: { item: string; count: number; }
 *     count: number
 *     retryCount: number;
 *     isGenerator: boolean;
 *   };
 * }} PlanSteps
 */

/**
 * @typedef {keyof PlanSteps} PlanStepType
 */

/**
 * @template {PlanStepType} [TType = PlanStepType]
 * @typedef {PlanSteps[TType] & {
 *   isOptional?: true;
 * }} PlanStep
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
 *   recursiveItems: Array<import('../utils/other').ItemId>;
 *   isOptional: boolean;
 *   lockItems: boolean;
 *   localLocks: Array<ItemLock>;
 *   remoteLocks: Array<ItemLock>;
 *   force: boolean;
 * }} PlanningContext
 */

/**
 * @exports
 */
class PredictedEnvironment {
    /**
     * @readonly
     * @type {Freq<import('../utils/other').ItemId>}
     */
    inventory
    /**
     * @readonly
     * @type {Record<import('../environment').PositionHash, { location: Vec3Dimension; delta: Freq<import('../utils/other').ItemId>; }>}
     */
    chests
    /**
     * @readonly
     * @type {Array<number>}
     */
    harvestedMobs
    /**
     * @readonly
     * @type {Array<Vec3Dimension>}
     */
    harvestedBlocks

    /**
     * @param {Plan} steps
     * @param {import('../minecraft')['registry']} registry
     */
    constructor(steps, registry) {
        this.inventory = new Freq(isItemEquals)
        this.chests = {}
        this.harvestedMobs = []
        this.harvestedBlocks = []

        for (const step of steps.flat(1)) {
            switch (step.type) {
                case 'goto': {
                    continue
                }
                case 'brew': {
                    // this.inventory.add(step.recipe.bottle, 1)
                    // this.inventory.add(step.recipe.ingredient, -1)
                    this.inventory.add(step.recipe.result, 1)
                    continue
                }
                case 'fill-item': {
                    this.inventory.add(step.expectedResult, 1)
                    continue
                }
                case 'chest': {
                    /**
                     * @type {import('../environment').PositionHash}
                     */
                    const hash = `${step.chest.x}-${step.chest.y}-${step.chest.z}-${step.chest.dimension}`
                    this.chests[hash] ??= {
                        location: step.chest,
                        delta: new Freq(isItemEquals),
                    }
                    this.chests[hash].delta.add(step.item, -step.count)
                    this.inventory.add(step.item, step.count)
                    continue
                }
                case 'harvest-mob': {
                    this.harvestedMobs.push(step.entity.id)
                    // if (step.willToolDisappear) {
                    //     this.inventory.add(step.tool, -1)
                    // }
                    this.inventory.add(step.item, step.count)
                    continue
                }
                case 'inventory': {
                    this.inventory.add(step.item, -step.count)
                    continue
                }
                case 'trade': {
                    // if (step.trade.inputItem1) {
                    //     this.inventory.add(step.trade.inputItem1.name, -step.trade.inputItem1.count)
                    // }
                    // if (step.trade.inputItem2) {
                    //     this.inventory.add(step.trade.inputItem2.name, -step.trade.inputItem2.count)
                    // }
                    if (step.trade.outputItem) {
                        this.inventory.add(step.trade.outputItem.name, step.trade.outputItem.count * step.count)
                    }
                    continue
                }
                case 'smelt': {
                    // for (const ingredient of step.recipe.ingredient) {
                    //     this.inventory.add(ingredient, -step.count)
                    // }
                    this.inventory.add(step.recipe.result, step.count)
                    continue
                }
                case 'campfire': {
                    // for (const ingredient of step.recipe.ingredient) {
                    //     this.inventory.add(ingredient, -step.count)
                    // }
                    this.inventory.add(step.recipe.result, step.count)
                    continue
                }
                case 'craft': {
                    for (const delta of step.recipe.delta) {
                        const itemName = registry.items[delta.id].name
                        if (delta.count < 0) {
                            // this.inventory.add(itemName, delta.count)
                        } else {
                            this.inventory.add(itemName, delta.count * step.count)
                        }
                    }
                    continue
                }
                case 'request': {
                    continue
                }
                case 'bundle-out': {
                    continue
                }
                case 'dig': {
                    this.inventory.add(step.loot.item, step.loot.count * step.count)
                    if (!step.isGenerator) {
                        this.harvestedBlocks.push(step.block.position)
                    }
                    continue
                }
            }
        }
    }

    /**
     * @param {ReadonlyArray<{ name: string; count: number; }>} items
     * @param {Freq<import('../utils/other').ItemId>} delta
     * @returns {Array<{ name: string; count: number; }>}
     */
    static applyDelta(items, delta) {
        const _items = items.map(v => ({ ...v }))
        for (const item of delta.keys) {
            const count = delta.get(item)
            for (let i = _items.length - 1; i >= 0; i--) {
                if (_items[i].name !== item) continue
                const remove = Math.min(_items[i].count, count)
                _items[i].count -= remove
                delta.add(item, -remove)
                if (_items[i].count <= 0) {
                    _items.splice(i, 1)
                }
            }
        }
        return _items
    }
}

/**
 * @param {Plan} plan
 * @returns {number}
 */
function planCost(plan) {
    let cost = 0

    for (const step of plan) {
        if ('type' in step) {
            switch (step.type) {
                case 'fill-item':
                    cost += 1
                    break
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
                    cost += 2 * step.count
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
                    cost += 3
                    break
                }
                case 'campfire': {
                    cost += 2
                    break
                }
                case 'brew': {
                    cost += 2
                    break
                }
                case 'request': {
                    cost += 0.1
                    break
                }
                case 'trade': {
                    cost += 2
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
 * @param {import('../utils/other').ItemId} item
 */
function planResult(plan, item) {
    let count = 0
    for (const step of plan) {
        if ('type' in step) {
            if (step.type === 'goto') { continue }
            if (step.type === 'fill-item') {
                if (isItemEquals(item, step.expectedResult)) {
                    count++
                }
                continue
            }
            if (step.type === 'brew') {
                if (isItemEquals(step.recipe.result, item)) {
                    count += step.count
                }
                continue
            }
            if (step.type === 'request') {
                if (!isItemEquals(step.remoteLock.item, item)) { continue }
                count += step.remoteLock.count
                continue
            }
            if (step.type === 'request-from-anyone' &&
                isItemEquals(step.item, item)) {
                count += step.count
                continue
            }
            if (step.type === 'bundle-out' &&
                isItemEquals(step.item, item)) {
                count += step.count
                continue
            }
            if (step.type === 'trade') {
                if (isItemEquals(step.trade.outputItem.name, item)) {
                    count += step.count * step.trade.outputItem.count
                }
                continue
            }
            if (step.type === 'harvest-mob') {
                if (isItemEquals(step.item, item)) {
                    count += step.count
                }
                continue
            }
            if (step.type === 'dig') {
                if (isItemEquals(step.loot.item, item)) {
                    count += step.count * step.loot.count
                }
                continue
            }
            if (step.type === 'smelt') {
                if (isItemEquals(step.recipe.result, item)) {
                    count += step.count
                }
                continue
            }
            if (step.type === 'campfire') {
                if (isItemEquals(step.recipe.result, item)) {
                    count += step.count
                }
                continue
            }
            if (isItemEquals(step.item, item)) {
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
 * @param {Plan} plan
 */
function unlockPlanItems(plan) {
    if (!plan) { return }
    for (const step of plan.flat()) {
        if ('locks' in step) for (const lock of step.locks) {
            lock.isUnlocked = true
        }
        if ('remoteLock' in step) step.remoteLock.isUnlocked = true
    }
}

/**
 * @type {ReadonlyArray<(
 *   bot: import('../bruh-bot'),
 *   item: import('../utils/other').ItemId,
 *   count: number,
 *   permissions : PermissionArgs,
 *   context: PlanningContext,
 *   planSoFar: Plan
 * ) => (import('../task').Task<(PlanStep | Plan) | Array<PlanStep | Plan>> | null)>}
 */
const planners = [
    function*(bot, item, count, permissions, context, planSoFar) {
        const _depthPrefix = ' '.repeat(context.depth)

        if (!permissions.canUseInventory) { return null }

        if (context.force) { return null }

        const future = new PredictedEnvironment(planSoFar.flat(), bot.mc.registry)

        if (planningLogs) console.log(`[Bot "${bot.username}"] ${_depthPrefix} | Check inventory ...`)

        let inInventory = bot.inventoryItemCount(null, item) + (future.inventory.get(item) ?? 0)
        inInventory -= bot.isItemLocked(item)

        if (inInventory <= 0) {
            if (planningLogs) console.log(`[Bot "${bot.username}"] ${_depthPrefix} |   None`)
            return null
        }

        if (planningLogs) console.log(`[Bot "${bot.username}"] ${_depthPrefix} |   Has ${inInventory}`)
        const needFromInventory = Math.min(inInventory, count)

        let locks = []
        if (context.lockItems) {
            debugger
            const lock = bot.tryLockItem(bot.username, item, needFromInventory)
            if (!lock) { return null }
            context.localLocks.push(lock)
            locks.push(lock)
        }

        return {
            type: 'inventory',
            item: item,
            count: needFromInventory,
            locks: locks,
        }
    },
    function*(bot, item, count, permissions, context, planSoFar) {
        // const _depthPrefix = ' '.repeat(context.depth)

        if (!permissions.canUseInventory) { return null }
        if (typeof item !== 'string') { return null }

        const bundleItem = bundle.bestBundleWithItem(bot.bot, item)
        if (!bundleItem) { return null }

        const content = bundle.content(bundleItem.nbt)
        if (!content) { return null }

        const items = content.filter(v => isItemEquals(v.name, item))
        if (items.length === 0) { return null }

        return {
            type: 'bundle-out',
            item: item,
            count: items[0].count,
            locks: [],
        }
    },
    function*(bot, item, count, permissions, context, planSoFar) {
        const _depthPrefix = ' '.repeat(context.depth)

        if (!permissions.canUseChests) { return null }

        const future = new PredictedEnvironment(planSoFar.flat(), bot.mc.registry)

        if (planningLogs) console.log(`[Bot "${bot.username}"] ${_depthPrefix} | Check chests ...`)
        const inChests = bot.env.searchForItem(item)
        const inChestsWithMyItems = inChests.filter(v => {
            const have = v.myCount + (future.chests[`${v.position.x}-${v.position.y}-${v.position.z}-${v.position.dimension}`]?.delta.get(item) ?? 0)
            return have > 0 && v.position.dimension === bot.dimension
        })
        inChestsWithMyItems.sort((a, b) => {
            const aDist = bot.bot.entity.position.distanceSquared(a.position.xyz(bot.dimension))
            const bDist = bot.bot.entity.position.distanceSquared(b.position.xyz(bot.dimension))
            return aDist - bDist
        })

        for (const inChestWithMyItems of inChestsWithMyItems) {
            yield
            const have = inChestWithMyItems.myCount + (future.chests[`${inChestWithMyItems.position.x}-${inChestWithMyItems.position.y}-${inChestWithMyItems.position.z}-${inChestWithMyItems.position.dimension}`]?.delta.get(item) ?? 0)
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
        if (typeof item !== 'string') { return null }

        const need = count
        const locked = bot.env.lockOthersItems(bot.username, item, need)
        if (locked.length === 0) { return null }

        context.remoteLocks.push(...locked)
        return locked.map(lock => ({
            type: 'request',
            remoteLock: lock,
        }))
    },
    function*(bot, item, count, permissions, context, planSoFar) {
        const _depthPrefix = ' '.repeat(context.depth)

        if (!permissions.canCraft) { return null }
        if (typeof item !== 'string') { return null }

        const recipes = bot.bot.recipesAll(bot.mc.registry.itemsByName[item].id, null, true)
        if (!recipes.length) { return null }

        if (planningLogs) console.log(`[Bot "${bot.username}"] ${_depthPrefix} | Check ${recipes.length} recipes ...`)
        const scoredRecipes = recipes.map(v => {
            let score = 0
            for (const delta of v.delta) {
                if (delta.count > 0) { continue }
                const item = bot.mc.registry.items[delta.id].name
                const successfulGathering = bot.memory.successfulGatherings.get(item)
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
                yield
                if (ingredient.count >= 0) { continue }
                const ingredientCount = -ingredient.count * actualCraftCount
                const subplan = yield* plan(bot, bot.mc.registry.items[ingredient.id].name, ingredientCount, {
                    ...permissions,
                }, {
                    ...context,
                    depth: context.depth + 1,
                    recursiveItems: [
                        ...context.recursiveItems,
                        item,
                    ],
                    force: false,
                }, [...planSoFar, ...ingredientPlans])
                const subplanResult = planResult(subplan, bot.mc.registry.items[ingredient.id].name)
                if (subplanResult < ingredientCount) {
                    unlockPlanItems(ingredientPlans)
                    unlockPlanItems(subplan)
                    if (planningLogs) console.log(`[Bot "${bot.username}"] ${_depthPrefix} |   Not good`)
                    return
                }
                ingredientPlans.push(subplan.flat())
            }

            const thisPlanCost = planCost(ingredientPlans)
            if (thisPlanCost < bestRecipeCost) {
                if (bestRecipe) { unlockPlanItems(bestRecipe.plan) }
                bestRecipe = {
                    plan: ingredientPlans,
                    recipe: recipe,
                }
                bestRecipeCost = thisPlanCost
            } else {
                unlockPlanItems(ingredientPlans)
            }
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
                maxDistance: config.gatherItem.craftingTableSearchRadius,
            })
            if (!tableInWorld) {
                const tablePlan = yield* plan(bot, 'crafting_table', 1, {
                    ...permissions,
                }, {
                    ...context,
                    recursiveItems: [
                        ...context.recursiveItems,
                        item,
                    ],
                    force: false,
                }, [...result, ...planSoFar])
                if (planResult(tablePlan, 'crafting_table') <= 0) {
                    unlockPlanItems(tablePlan)
                    unlockPlanItems(bestRecipe.plan)
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

        if (!permissions.canSmelt) { return null }
        if (typeof item !== 'string') { return null }

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

        const usableRecipes = yield* smelt.findBestFurnace(bot, recipes)

        if (!usableRecipes || usableRecipes.recipes.length === 0) { return null }

        if (planningLogs) console.log(`[Bot "${bot.username}"] ${_depthPrefix} | Check ${recipes.length} recipes ...`)
        yield
        /**
         * @type {{
         *   plan: Array<ReadonlyArray<PlanStep>>;
         *   recipe: Exclude<import('../local-minecraft-data').CookingRecipe, import('../local-minecraft-data').CampfireRecipe>;
         *   furnace: import('prismarine-block').Block;
         * } | null}
         */
        let bestRecipe = null
        let bestRecipeCost = Infinity

        /**
         * @param {Exclude<import('../local-minecraft-data').CookingRecipe, import('../local-minecraft-data').CampfireRecipe>} recipe
         * @param {import('prismarine-block').Block} furnace
         */
        const visitRecipe = function*(recipe, furnace) {
            /**
             * @type {Array<ReadonlyArray<PlanStep>>}
             */
            const ingredientPlans = []
            for (const ingredient of recipe.ingredient) {
                yield
                const subplan = yield* plan(bot, ingredient, count, {
                    ...permissions,
                }, {
                    ...context,
                    depth: context.depth + 1,
                    recursiveItems: [
                        ...context.recursiveItems,
                        item,
                    ],
                    force: false,
                }, [...planSoFar, ...ingredientPlans])
                let goodItems
                if (ingredient.startsWith('#')) {
                    goodItems = bot.mc.local.resolveItemTag(ingredient.replace('#', ''))
                } else {
                    goodItems = [ingredient]
                }
                let goodItem = goodItems.find(v => planResult(subplan, v) >= count)
                if (!goodItem) {
                    unlockPlanItems(ingredientPlans)
                    unlockPlanItems(subplan)
                    if (planningLogs) console.log(`[Bot "${bot.username}"] ${_depthPrefix} |   Not good`)
                    return
                }
                ingredientPlans.push(subplan.flat())
            }

            const totalRecipeCost = planCost([
                ...ingredientPlans,
                {
                    type: 'smelt',
                    count: count,
                    recipe: recipe,
                    furnace: furnace.position,
                }
            ])
            if (totalRecipeCost < bestRecipeCost) {
                if (bestRecipe) unlockPlanItems(bestRecipe.plan)
                bestRecipe = {
                    plan: ingredientPlans,
                    recipe: recipe,
                    furnace: furnace,
                }
                bestRecipeCost = totalRecipeCost
            } else {
                unlockPlanItems(ingredientPlans)
            }
        }

        for (const recipe of usableRecipes.recipes) {
            yield
            for (const ingredient of recipe.ingredient) {
                yield* visitRecipe({
                    ...recipe,
                    ingredient: [ingredient],
                }, usableRecipes.furnaceBlock)
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

        let fuelPlan = yield* planAny(
            bot,
            Minecraft.sortedFuels.filter(v => !v.no && v.simple).map(v => v.item),
            (item) => Math.ceil(bestRecipe.recipe.time / Minecraft.fuels[item].time),
            {
                ...permissions,
                canBrew: false,
                canCraft: permissions.canCraft,
                canSmelt: false,
            },
            {
                ...context,
                depth: context.depth + 1,
                recursiveItems: [
                    ...context.recursiveItems,
                    item,
                ],
                force: false,
            })

        if (!fuelPlan) {
            fuelPlan = yield* planAny(
                bot,
                Minecraft.sortedFuels.filter(v => !v.no && !v.simple).map(v => v.item),
                (item) => Math.ceil(bestRecipe.recipe.time / Minecraft.fuels[item].time),
                {
                    ...permissions,
                    canBrew: false,
                    canCraft: false,
                    canSmelt: false,
                    canTrade: false,
                    canKill: false,
                    canDigEnvironment: false,
                    canDigGenerators: false,
                    canHarvestMobs: false,
                    canRequestFromPlayers: false,
                },
                {
                    ...context,
                    depth: context.depth + 1,
                    recursiveItems: [
                        ...context.recursiveItems,
                        item,
                    ],
                    force: false,
                })
        }

        if (fuelPlan) {
            result.push(fuelPlan.plan.flat())
        }

        result.push(bestRecipe.plan.flat())
        result.push({
            type: 'smelt',
            recipe: bestRecipe.recipe,
            count: count,
            furnace: bestRecipe.furnace.position,
        })

        return result
    },
    function*(bot, item, count, permissions, context, planSoFar) {
        const _depthPrefix = ' '.repeat(context.depth)

        if (!permissions.canSmelt) { return null }
        if (typeof item !== 'string') { return null }
        if (count !== 1 && count !== 2 && count !== 3 && count !== 4) { return null }

        const recipes = Object.values(bot.mc.local.recipes.campfire).filter(v => isItemEquals(v.result, item))
        if (!recipes.length) { return null }

        const campfire = bot.findBlocks({
            matching: 'campfire',
            count: 1,
            maxDistance: 48,
            filter: (campfire) => { return Boolean(campfire.getProperties()['lit']) },
        }).filter(Boolean).first()

        if (!campfire) { return null }

        if (planningLogs) console.log(`[Bot "${bot.username}"] ${_depthPrefix} | Check ${recipes.length} recipes ...`)
        yield
        /**
         * @type {{
         *   plan: Array<ReadonlyArray<PlanStep>>;
         *   recipe: import('../local-minecraft-data').CampfireRecipe;
         * } | null}
         */
        let bestRecipe = null
        let bestRecipeCost = Infinity

        /**
         * @param {import('../local-minecraft-data').CampfireRecipe} recipe
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
                }, {
                    ...context,
                    depth: context.depth + 1,
                    recursiveItems: [
                        ...context.recursiveItems,
                        item,
                    ],
                    force: false,
                }, [...planSoFar, ...ingredientPlans])
                let goodItems
                if (ingredient.startsWith('#')) {
                    goodItems = bot.mc.local.resolveItemTag(ingredient.replace('#', ''))
                } else {
                    goodItems = [ingredient]
                }
                let goodItem = goodItems.find(v => planResult(subplan, v) >= count)
                if (!goodItem) {
                    unlockPlanItems(subplan)
                    unlockPlanItems(ingredientPlans)
                    if (planningLogs) console.log(`[Bot "${bot.username}"] ${_depthPrefix} |   Not good`)
                    return
                }
                ingredientPlans.push(subplan.flat())
            }

            const totalRecipeCost = planCost([
                ...ingredientPlans,
                {
                    type: 'campfire',
                    count: count,
                    recipe: recipe,
                }
            ])
            if (totalRecipeCost < bestRecipeCost) {
                if (bestRecipe) unlockPlanItems(bestRecipe.plan)
                bestRecipe = {
                    plan: ingredientPlans,
                    recipe: recipe,
                }
                bestRecipeCost = totalRecipeCost
            } else {
                unlockPlanItems(ingredientPlans)
            }
        }

        for (const recipe of recipes) {
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
            type: 'campfire',
            recipe: bestRecipe.recipe,
            count: count,
        })

        return result
    },
    function*(bot, item, count, permissions, context, planSoFar) {
        const _depthPrefix = ' '.repeat(context.depth)

        if (!permissions.canBrew) { return null }
        if (typeof item === 'string') { return null }
        if (count !== 1) { return null }

        const recipes = []

        for (const recipe of brew.recipes) {
            if (!isItemEquals(recipe.result, item)) { continue }
            recipes.push(recipe)
        }

        if (recipes.length === 0) { return null }

        const brewingStand = bot.findBlocks({
            matching: 'brewing_stand',
            maxDistance: 32,
            count: 1,
        }).filter(v => !!v).first()

        if (!brewingStand) { return null }

        yield

        /**
         * @type {{
         *   plan: Plan;
         *   recipe: import('./brew')['recipes'][0];
         * } | null}
         */
        let bestRecipe = null
        let bestRecipeCost = Infinity

        /**
         * @param {import('./brew')['recipes'][0]} recipe
         */
        const visitRecipe = function*(recipe) {
            const ingredientPlan = yield* plan(bot, recipe.ingredient, count, {
                ...permissions,
            }, {
                ...context,
                depth: context.depth + 1,
                recursiveItems: [
                    ...context.recursiveItems,
                    recipe.result,
                ],
                force: false,
            }, [...planSoFar])
            if (!planResult(ingredientPlan, recipe.ingredient)) {
                unlockPlanItems(ingredientPlan)
                if (planningLogs) console.log(`[Bot "${bot.username}"] ${_depthPrefix} |   Not good`)
                return
            }

            const bottlePlan = yield* plan(bot, recipe.bottle, count, {
                ...permissions,
            }, {
                ...context,
                depth: context.depth + 1,
                recursiveItems: [
                    ...context.recursiveItems,
                    recipe.result,
                ],
                force: false,
            }, [...planSoFar])
            if (!planResult(bottlePlan, recipe.bottle)) {
                unlockPlanItems(ingredientPlan)
                unlockPlanItems(bottlePlan)
                if (planningLogs) console.log(`[Bot "${bot.username}"] ${_depthPrefix} |   Not good`)
                return
            }

            const totalIngredientPlans = [
                ...ingredientPlan,
                ...bottlePlan,
            ]

            const thisPlanCost = planCost(totalIngredientPlans)
            const selfCost = planCost([
                {
                    type: 'brew',
                    count: count,
                    recipe: recipe,
                    brewingStand: new Vec3Dimension(brewingStand.position, bot.dimension),
                }
            ])
            const totalRecipeCost = thisPlanCost + selfCost
            if (totalRecipeCost < bestRecipeCost) {
                if (bestRecipe) unlockPlanItems(bestRecipe.plan)
                bestRecipe = {
                    plan: totalIngredientPlans,
                    recipe: recipe,
                }
                bestRecipeCost = totalRecipeCost
            } else {
                unlockPlanItems(totalIngredientPlans)
            }
        }

        for (const recipe of recipes) {
            yield
            yield* visitRecipe(recipe)
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
            type: 'brew',
            recipe: bestRecipe.recipe,
            brewingStand: new Vec3Dimension(brewingStand.position, bot.dimension),
            count: count,
        })

        return result
    },
    function*(bot, item, count, permissions, context, planSoFar) {
        // const _depthPrefix = ' '.repeat(context.depth)

        if (!permissions.canTrade) { return null }
        if (typeof item !== 'string') { return null }

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
                }, {
                    ...context,
                    depth: context.depth + 1,
                    recursiveItems: [
                        ...context.recursiveItems,
                        item,
                        trade.outputItem.name,
                    ],
                    force: false,
                }, planSoFar) : null

                const pricePlan2 = trade.inputItem2 ? yield* plan(bot, trade.inputItem2.name, trade.inputItem2.count * tradeCount, {
                    ...permissions,
                }, {
                    ...context,
                    depth: context.depth + 1,
                    recursiveItems: [
                        ...context.recursiveItems,
                        item,
                        trade.outputItem.name,
                    ],
                    force: false,
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

                if (trade.inputItem1 && price1Result < trade.inputItem1.count) {
                    unlockPlanItems(pricePlan1)
                    unlockPlanItems(pricePlan2)
                    continue
                }
                if (trade.inputItem2 && price2Result < trade.inputItem2.count) {
                    unlockPlanItems(pricePlan1)
                    unlockPlanItems(pricePlan2)
                    continue
                }

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
        if (typeof item !== 'string') { return null }

        return {
            type: 'request-from-anyone',
            item: item,
            count: count,
        }
    },
    function*(bot, item, count, permissions, context, planSoFar) {
        if (item !== 'cobblestone') { return null }

        if (!permissions.canDigGenerators) { return null }
        if (typeof item !== 'string') { return null }

        if (!bot.searchInventoryItem(null,
            'wooden_pickaxe',
            'stone_pickaxe',
            'iron_pickaxe',
            'golden_pickaxe',
            'diamond_pickaxe',
            'netherite_pickaxe',
        )) { return null }

        const future = new PredictedEnvironment(planSoFar, bot.bot.registry)

        /** @type {Vec3Dimension} */
        let found = null
        bot.bot.findBlock({
            matching: bot.mc.registry.blocksByName['lava'].id,
            count: 1,
            maxDistance: config.gatherItem.cobblestoneGeneratorSearchRadius,
            useExtraInfo: (block) => {
                for (const lavaNeighborPosition of directBlockNeighbors(block.position, 'side')) {
                    const lavaNeighbor = bot.bot.blockAt(lavaNeighborPosition)
                    if (!lavaNeighbor || lavaNeighbor.name !== 'cobblestone') { continue }
                    if (future.harvestedBlocks.some(v => v.equals(new Vec3Dimension(lavaNeighborPosition, bot.dimension)))) { continue }

                    let isNextToWater = false
                    for (const cobblestoneNeighborPosition of directBlockNeighbors(lavaNeighbor.position, 'side')) {
                        if (cobblestoneNeighborPosition.equals(block.position)) { continue }

                        const cobblestoneNeighbor = bot.bot.blockAt(cobblestoneNeighborPosition)
                        if (!cobblestoneNeighbor || cobblestoneNeighbor.name !== 'water') { continue }

                        const waterLevel = Number(cobblestoneNeighbor.getProperties()['level'])
                        if (!waterLevel) { continue }

                        if (waterLevel !== 1) { continue }

                        const blockBelowFlowingWater = bot.bot.blockAt(cobblestoneNeighborPosition.offset(0, -1, 0))
                        if (!blockBelowFlowingWater) { continue }
                        if (blockBelowFlowingWater.name !== 'water') { continue }

                        if (isNextToWater) {
                            isNextToWater = false
                            break
                        } else {
                            isNextToWater = true
                        }
                    }

                    if (!isNextToWater) { continue }

                    found = new Vec3Dimension(lavaNeighborPosition, bot.dimension)
                }
                if (!found) { return false }
                return true
            },
        })

        if (!found) { return null }

        return {
            type: 'dig',
            block: {
                position: found,
                block: bot.bot.blockAt(found.xyz(bot.dimension)),
            },
            loot: { item: 'cobblestone', count: 1 },
            count: count,
            isGenerator: true,
            retryCount: 30,
        }
    },
    function*(bot, item, count, permissions, context, planSoFar) {
        if (!permissions.canHarvestMobs) { return null }
        if (typeof item !== 'string') { return null }

        switch (item) {
            case 'milk_bucket': {
                const bucketPlan = yield* plan(bot, 'bucket', 1, {
                    ...permissions,
                    canUseInventory: true,
                }, {
                    ...context,
                    depth: context.depth + 1,
                    recursiveItems: [
                        ...context.recursiveItems,
                        item,
                    ],
                    force: false,
                }, [...planSoFar])
                if (planResult(bucketPlan, 'bucket') <= 0) {
                    unlockPlanItems(bucketPlan)
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
                    unlockPlanItems(bucketPlan)
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
                const bowlPlan = yield* plan(bot, 'bowl', 1, {
                    ...permissions,
                    canUseInventory: true,
                }, {
                    ...context,
                    depth: context.depth + 1,
                    recursiveItems: [
                        ...context.recursiveItems,
                        item,
                    ],
                    force: false,
                }, [...planSoFar])
                if (planResult(bowlPlan, 'bowl') <= 0) {
                    // throw `Can't milk mooshroom: aint have a bowl`
                    unlockPlanItems(bowlPlan)
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
                    unlockPlanItems(bowlPlan)
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
    function*(bot, item, count, permissions, context, planSoFar) {
        if (!isItemEquals(item, brew.makePotionItem('water'))) { return null }
        if (count !== 1) { return null }

        const bottlePlan = yield* plan(bot, 'glass_bottle', count, permissions, {
            ...context,
            depth: context.depth + 1,
            recursiveItems: [
                ...context.recursiveItems,
                brew.makePotionItem('water'),
            ],
            force: false,
        }, planSoFar)
        if (!planResult(bottlePlan, 'glass_bottle')) {
            unlockPlanItems(bottlePlan)
            return null
        }

        const water = bot.bot.findBlock({
            matching: bot.mc.registry.blocksByName['water'].id,
            count: 1,
            maxDistance: 32,
        })

        if (!water) {
            unlockPlanItems(bottlePlan)
            return null
        }

        return [
            bottlePlan,
            {
                type: 'fill-item',
                item: 'glass_bottle',
                expectedResult: brew.makePotionItem('water'),
                block: {
                    position: new Vec3Dimension(water.position, bot.dimension),
                    block: water,
                },
            },
        ]
    },
    function*(bot, item, count, permissions, context, planSoFar) {
        if (!isItemEquals(item, 'water_bucket')) { return null }
        if (count !== 1) { return null }

        const bucketPlan = yield* plan(bot, 'bucket', 1, permissions, {
            ...context,
            depth: context.depth + 1,
            recursiveItems: [
                ...context.recursiveItems,
                'water_bucket',
            ],
            force: false,
        }, planSoFar)

        if (planResult(bucketPlan, 'bucket') <= 0) {
            unlockPlanItems(bucketPlan)
            return null
        }

        const water = bot.findBlocks({
            matching: 'water',
            count: 1,
            maxDistance: 64,
            filter: (block) => {
                let n = 0
                for (const neighborPos of directBlockNeighbors(block.position, 'side')) {
                    const neighbor = bot.bot.blockAt(neighborPos, true)
                    if (!neighbor) continue
                    const waterLevel = Number(neighbor.getProperties()['level'])
                    if (waterLevel !== 0) { continue }
                    n++
                    if (n >= 2) return true
                }
                return false
            },
        }).filter(Boolean).first()

        if (!water) {
            unlockPlanItems(bucketPlan)
            return null
        }

        return [
            bucketPlan,
            {
                type: 'fill-item',
                block: {
                    block: water,
                    position: new Vec3Dimension(water.position, bot.dimension),
                },
                expectedResult: 'water_bucket',
                item: 'bucket',
            },
        ]
    },
]

/**
 * @template {import('../utils/other').ItemId} [TItem=import('../utils/other').ItemId]
 * @typedef {{
 *   item:  TItem;
 *   plan: Plan;
 *   planCost: number;
 *   planResult: number;
 *   needsThisMany: number
 * }} PlannedItem
 */

/**
 * @template {import('../utils/other').ItemId} [TItem=import('../utils/other').ItemId]
 * @param {import('../bruh-bot')} bot
 * @param {ReadonlyArray<TItem>} item
 * @param {number | ((item: TItem) => number)} count
 * @param {PermissionArgs & { force?: boolean }} permissions
 * @param {PlanningContext} context
 * @param {Plan} [planSoFar]
 * @param {(plan: PlannedItem<TItem>) => boolean} [postprocessor]
 * @returns {import('../task').Task<{ item: TItem; plan: Plan; } | null>}
 */
function* planAny(bot, item, count, permissions, context, planSoFar, postprocessor) {
    planSoFar = []

    /**
     * @type {PlannedItem<TItem> | null}
     */
    let bestPlan = null

    /**
     * @param {TItem} item
     */
    const visitItem = function*(item) {
        const requiredCount = typeof count === 'function' ? count(item) : count
        const itemPlan = yield* plan(bot, item, requiredCount, permissions, context, planSoFar)
        const _itemPlan = {
            item: item,
            plan: itemPlan,
            planCost: planCost(itemPlan),
            planResult: planResult(itemPlan, item),
            needsThisMany: requiredCount,
        }

        let isPostprocessedGood = true
        if (postprocessor) {
            isPostprocessedGood = postprocessor(_itemPlan)
        }

        if (!bestPlan) {
            bestPlan = _itemPlan
            return
        }
        if (!_itemPlan.planResult) {
            unlockPlanItems(_itemPlan.plan)
            return
        }
        const bestIsGood = bestPlan.planResult >= _itemPlan.needsThisMany
        const currentIsGood = (_itemPlan.planResult >= _itemPlan.needsThisMany) && isPostprocessedGood
        if (bestIsGood && !currentIsGood) {
            unlockPlanItems(_itemPlan.plan)
            return
        }
        if (!bestIsGood && currentIsGood) {
            unlockPlanItems(bestPlan?.plan)
            bestPlan = _itemPlan
            return
        }
        if (_itemPlan.planCost < bestPlan.planCost) {
            unlockPlanItems(bestPlan?.plan)
            bestPlan = _itemPlan
            return
        }
    }

    const scoredItems = item.map(v => ({
        item: v,
        score: bot.memory.successfulGatherings.get(v)?.successCount ?? 0,
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
            bestPlan.planResult >= bestPlan.needsThisMany) {
            break
        }
    }

    if (!bestPlan || (bestPlan.planResult < bestPlan.needsThisMany)) {
        for (const item of lastFailedItems) {
            yield* visitItem(item.item)
            if (bestPlan &&
                bestPlan.planCost === 0 &&
                bestPlan.planResult >= bestPlan.needsThisMany) {
                break
            }
        }
    }

    return bestPlan
}

/**
 * @param {import('../bruh-bot')} bot
 * @param {import('../utils/other').ItemId} item
 * @param {number} count
 * @param {PermissionArgs} permissions
 * @param {PlanningContext} context
 * @param {Plan} planSoFar
 * @returns {import('../task').Task<Plan>}
 */
function* plan(bot, item, count, permissions, context, planSoFar) {
    if (typeof item === 'string' && item.startsWith('#')) {
        const resolvedItems = bot.mc.local.resolveItemTag(item.replace('#', ''))
        return (yield* planAny(
            bot,
            resolvedItems,
            count,
            permissions,
            context,
            planSoFar))?.plan ?? []
    }

    if (typeof item === 'string' && !bot.mc.registry.itemsByName[item]) {
        console.warn(`[Bot "${bot.username}"] Unknown item "${item}"`)
        return []
    }

    const _depthPrefix = ' '.repeat(context.depth)
    if (context.recursiveItems.some(v => isItemEquals(v, item))) {
        if (planningLogs) console.warn(`[Bot "${bot.username}"] ${_depthPrefix} Recursive plan for item "${stringifyItem(item)}", skipping`)
        return []
    }
    if (context.depth > 10) {
        console.warn(`[Bot "${bot.username}"] ${_depthPrefix} Too deep plan for item "${stringifyItem(item)}", skipping`)
        return []
    }

    if (planningLogs) console.log(`[Bot "${bot.username}"] ${_depthPrefix} Planning ${count} "${stringifyItem(item)}" ...`)

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
                unlockPlanItems(bestPlan)
                bestPlan = [_plan].flat(3)
                bestPlanCost = _planCost
            }
        }
        if (!bestPlan) { break }
        result.push(bestPlan)
    }

    if (count &&
        (planResult(result, item) >= count) &&
        !result.flat().find(v => v.type === 'request-from-anyone')) {
        const existing = bot.memory.successfulGatherings.get(item)
        if (existing) {
            bot.memory.successfulGatherings.get(item).lastTime = Date.now()
            bot.memory.successfulGatherings.get(item).successCount++
        } else {
            bot.memory.successfulGatherings.set(item, {
                lastTime: Date.now(),
                successCount: 1,
            })
        }
    } else {
        // delete bot.memory.successfulGatherings[item]
    }

    return result
}

/**
 * @param {import('../bruh-bot')} bot
 * @param {OrganizedPlan} plan
 * @param {import('../task').RuntimeArgs<{
 *   locks: ReadonlyArray<import('../item-lock')>;
 * }>} args
 * @returns {import('../task').Task<void>}
 */
function* evaluatePlan(bot, plan, args) {
    /**
     * @type {{ chestPosition: Vec3Dimension; chest: Chest; } | null}
     */
    let openedChest = null

    console.log(`[Bot "${bot.username}"] Evaluating plan`)

    try {
        for (const step of plan) {
            yield

            // console.log(`[Bot "${bot.username}"]`, step.type, step)

            if (openedChest) {
                if (step.type !== 'chest') {
                    openedChest.chest.close()
                    openedChest = null
                }
            }

            try {
                switch (step.type) {
                    case 'inventory': continue
                    case 'goto': {
                        yield* goto.task(bot, {
                            point: step.destination,
                            distance: step.distance,
                            ...runtimeArgs(args),
                        })
                        continue
                    }
                    case 'fill-item': {
                        const filledItemBefore = bot.inventoryItemCount(null, step.expectedResult)
                        yield* goto.task(bot, {
                            block: step.block.position,
                            reach: 3,
                            options: {

                            },
                            ...runtimeArgs(args),
                        })
                        let itemToFill = bot.searchInventoryItem(null, step.item)
                        if (!itemToFill) { throw `I have no ${stringifyItemH(step.item)}` }

                        itemToFill = yield* bot.equip(itemToFill)
                        const block = bot.bot.blockAt(step.block.position.xyz(bot.dimension))
                        if (!block) { throw `The chunk where I want to fill my ${stringifyItemH(itemToFill)} aint loaded` }

                        if (block.name !== step.block.block.name) { throw `Aint ${step.block.block.name}` }

                        if (!bot.blockInView(block)) {
                            yield* goto.task(bot, {
                                block: step.block.position,
                                raycast: true,
                                ...runtimeArgs(args),
                            })
                        }
                        yield* wrap(bot.lookAtBlock(block, null, bot.instantLook), args.interrupt)
                        yield* sleepTicks(1)

                        bot.bot.activateItem(false)
                        yield* sleepTicks(1)

                        bot.bot.deactivateItem()

                        const filledItemAfter = bot.inventoryItemCount(null, step.expectedResult)
                        if (filledItemAfter <= filledItemBefore) {
                            throw `Failed to fill my ${stringifyItemH(itemToFill)}`
                        }
                        continue
                    }
                    case 'chest': {
                        yield* goto.task(bot, {
                            block: step.chest.clone(),
                            ...runtimeArgs(args),
                        })
                        const chestBlock = bot.bot.blockAt(step.chest.xyz(bot.dimension))
                        if (!chestBlock || chestBlock.name !== 'chest') {
                            bot.env.deleteChest(step.chest)
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
                        const took = yield* bot.chestWithdraw(openedChest.chest, openedChest.chestPosition.xyz(bot.dimension), step.item, step.count)
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
                            ...runtimeArgs(args),
                        })
                        if (!entity.isValid) {
                            throw `The ${step.entity.expectedType} is invalid`
                        }
                        const toolItem = bot.searchInventoryItem(null, step.tool)
                        if (!toolItem) {
                            throw `I have no ${step.tool}`
                        }
                        yield* wrap(bot.bot.equip(toolItem, 'hand'), args.interrupt)
                        yield* sleepTicks()
                        yield* wrap(bot.bot.activateEntity(entity), args.interrupt)
                        yield* sleepTicks()
                        if (step.isDroppingItem) {
                            yield* pickupItem.task(bot, {
                                items: [step.item],
                                inAir: true,
                                maxDistance: 8,
                                minLifetime: 0,
                                silent: true,
                                point: entity.position.clone(),
                                ...runtimeArgs(args),
                            })
                        }
                        continue
                    }
                    case 'craft': {
                        const checkIngredients = () => {
                            for (const ingredient of step.recipe.delta) {
                                if (ingredient.count >= 0) { continue }
                                const has = bot.bot.inventory.count(ingredient.id, ingredient.metadata)
                                const need = Math.abs(ingredient.count) * step.count
                                if (has < need) {
                                    throw `Not enough ${bot.mc.registry.items[ingredient.id].name} for ${step.item}, I have ${has} but I need ${need}`
                                }
                            }
                        }

                        checkIngredients()
                        let tableBlock = null
                        if (step.recipe.requiresTable) {
                            tableBlock = bot.bot.findBlock({
                                matching: bot.mc.registry.blocksByName['crafting_table'].id,
                                maxDistance: config.gatherItem.craftingTableSearchRadius,
                            })
                            if (!tableBlock) {
                                const tableItem = bot.searchInventoryItem(null, 'crafting_table')
                                if (!tableItem) {
                                    throw `I have no crafting table`
                                }
                                yield* placeBlock.task(bot, {
                                    item: tableItem.name,
                                    clearGrass: true,
                                    ...runtimeArgs(args),
                                })
                                tableBlock = bot.bot.findBlock({
                                    matching: bot.mc.registry.blocksByName['crafting_table'].id,
                                    maxDistance: config.gatherItem.craftingTableSearchRadius,
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
                                ...runtimeArgs(args),
                            })
                        }
                        checkIngredients()
                        yield* wrap(bot.bot.craft(step.recipe, step.count, tableBlock), args.interrupt)
                        continue
                    }
                    case 'smelt': {
                        yield* smelt.task(bot, {
                            count: step.count,
                            recipe: step.recipe,
                            furnace: step.furnace,
                            locks: args.locks,
                            ...runtimeArgs(args),
                        })
                        continue
                    }
                    case 'campfire': {
                        yield* campfire.task(bot, {
                            count: step.count,
                            recipes: [step.recipe],
                            locks: args.locks,
                            ...runtimeArgs(args),
                        })
                        continue
                    }
                    case 'request': {
                        /** @type {import('../environment')['itemRequests'][0]} */
                        const request = {
                            lock: step.remoteLock,
                            priority: args.task?.priority,
                        }
                        bot.env.itemRequests.push(request)

                        try {
                            while (true) {
                                yield* sleepG(100)

                                if (request.itemEntity &&
                                    request.itemEntity.isValid) {
                                    args.task?.focus()
                                    try {
                                        yield* pickupItem.task(bot, {
                                            item: request.itemEntity,
                                            ...runtimeArgs(args),
                                        })
                                        break
                                    } catch (error) { }
                                }

                                if (request.status === 'dropped') {
                                    console.error(`[Bot "${bot.username}"] The requested item is dropped but I aint picked it up`)
                                    break
                                }

                                if (request.status === 'failed') {
                                    console.error(`[Bot "${bot.username}"] Failed to receive the requested item`)
                                    break
                                }

                                if (request.status === 'served') {
                                    console.error(`[Bot "${bot.username}"] The request looks like served but I didn't picked up the item`)
                                    break
                                }

                                if (!request.status) {
                                    args.task?.blur()
                                }
                            }
                        } finally {
                            args.task?.focus()
                        }
                        yield* sleepTicks()
                        continue
                    }
                    case 'trade': {
                        yield* trade.task(bot, {
                            trade: step.trade,
                            numberOfTrades: step.count,
                            ...runtimeArgs(args),
                        })
                        continue
                    }
                    case 'bundle-out': {
                        const bundleItem = bundle.bestBundleWithItem(bot.bot, step.item)
                        if (!bundleItem) { throw `Bundle disappeared` }
                        const content = bundle.content(bundleItem.nbt)
                        if (!content) { throw `Bundle content sublimated` }
                        const items = content.filter(v => isItemEquals(v.name, step.item))
                        if (items.length === 0) { throw `Item disappeared from the bundle` }
                        if (items[0].count < step.count) { throw `Item count decreased in the bundle` }

                        const takenOut = yield* wrap(bundle.takeOutItem(bot.bot, bot.mc.registry, bundleItem.slot, items[0].name), args.interrupt)

                        if (takenOut.name !== items[0].name) { throw `Unexpected item taken out from the bundle` }
                        if (takenOut.count !== items[0].count) { throw `Unexpected number of item taken out from the bundle` }

                        continue
                    }
                    case 'request-from-anyone': {
                        if (bot.isLeaving) { throw `Can't ask: currently leaving the game` }
                        if (!args.response) { throw `Can't ask anything` }
                        let requestPlayer
                        const res1 = yield* wrap(args.response.askYesNo(
                            (step.count === 1) ?
                                `Can someone give me a ${stringifyItemH(step.item)}?` :
                                `Can someone give me ${step.count} ${stringifyItemH(step.item)}?`,
                            30000))
                        if (!res1 || !res1.message) { throw `:(` }

                        bot.bot.whisper(requestPlayer, `I'm going to you for ${step.count} ${stringifyItemH(step.item)}`)

                        let location = bot.env.getPlayerPosition(requestPlayer, 10000)
                        if (!location) {
                            if (bot.isLeaving) { throw `Can't ask: currently leaving the game` }
                            location = (yield* wrap(args.response.askPosition(`Where are you?`, 30000, requestPlayer)))?.message
                            if (location) {
                                args.response.respond(`${location.x} ${location.y} ${location.z} in ${location.dimension} I got it`, requestPlayer)
                            } else {
                                throw `I can't find you`
                            }
                        }

                        yield* goto.task(bot, {
                            point: location,
                            distance: 1,
                            options: {
                                timeout: 30000,
                            },
                            ...runtimeArgs(args),
                        })

                        bot.bot.whisper(requestPlayer, `Please give me ${step.count} ${step.item}`)

                        /** @type {Freq<import('../utils/other').ItemId>} */
                        const originalItems = new Freq(isItemEquals)
                        bot.inventoryItems().forEach(item => {
                            originalItems.add(item, item.count)
                        })

                        const interval = new Interval(20000)
                        const timeout = new Interval(60000)

                        while (true) {
                            yield* sleepG(100)
                            /** @type {Freq<import('../utils/other').ItemId>} */
                            const newItems = new Freq(isItemEquals)
                            bot.inventoryItems().forEach(item => {
                                newItems.add(item, item.count)
                            })

                            /** @type {Freq<import('../utils/other').ItemId>} */
                            const delta = new Freq(isItemEquals)
                            delta.from(newItems)
                            for (const key of originalItems.keys) {
                                delta.add(key, -originalItems.get(key))
                                if (delta.get(key) === 0) { delta.remove(key) }
                            }
                            let done = false
                            for (const key of delta.keys) {
                                if (key === step.item &&
                                    delta.get(key) >= step.count) {
                                    done = true
                                    if (delta.get(key) > step.count) {
                                        bot.bot.whisper(requestPlayer, `Too much`)
                                        yield* giveTo.task(bot, {
                                            player: requestPlayer,
                                            items: [{ item: key, count: step.count - delta.get(key) }],
                                            ...runtimeArgs(args),
                                        })
                                    }
                                } else if (delta.get(key) > 0) {
                                    bot.bot.whisper(requestPlayer, `This aint a ${step.item}`)
                                    yield* giveTo.task(bot, {
                                        player: requestPlayer,
                                        items: [{ item: key, count: delta.get(key) }],
                                        ...runtimeArgs(args),
                                    })
                                }
                            }

                            if (done) {
                                bot.bot.whisper(requestPlayer, `Thanks`)
                                break
                            }

                            if (timeout.done()) {
                                for (const key of delta.keys) {
                                    if (delta.get(key) > 0) {
                                        yield* giveTo.task(bot, {
                                            player: requestPlayer,
                                            items: [{ item: key, count: delta.get(key) }],
                                            ...runtimeArgs(args),
                                        })
                                    }
                                }
                                throw `${requestPlayer} didn't give me ${step.count} ${step.item}`
                            }

                            if (interval.done()) {
                                bot.bot.whisper(requestPlayer, `Please give me ${step.count - (delta.get(step.item) ?? 0)} ${step.item}`)
                            }
                        }

                        continue
                    }
                    case 'dig': {
                        for (let i = 0; i < step.count; i++) {
                            let remainingRetries = step.retryCount
                            while (remainingRetries--) {
                                try {
                                    if (step.block.position.dimension !== bot.dimension) {
                                        yield* goto.task(bot, {
                                            block: step.block.position,
                                            ...runtimeArgs(args),
                                        })
                                    }

                                    let block = bot.bot.blockAt(step.block.position.xyz(bot.dimension))
                                    while (!block || block.name !== step.block.block.name) {
                                        yield* sleepG(100)
                                        if (!block) {
                                            yield* goto.task(bot, {
                                                block: step.block.position,
                                                ...runtimeArgs(args),
                                            })
                                            block = bot.bot.blockAt(step.block.position.xyz(bot.dimension))
                                        }

                                        if (!block) { break }

                                        const timeout = new Timeout(5000)
                                        while (!timeout.done() && block && block.name !== step.block.block.name) {
                                            yield* sleepG(100)
                                            block = bot.bot.blockAt(step.block.position.xyz(bot.dimension))
                                        }
                                    }

                                    if (!block) {
                                        throw `Chunk where I like to dig aint loaded`
                                    }

                                    if (block.name !== step.block.block.name) {
                                        throw `Unexpected block at ${step.block.position}: expected ${step.block.block.name}, found ${block.name}`
                                    }

                                    const digResult = yield* dig.task(bot, {
                                        block: block,
                                        alsoTheNeighbors: false,
                                        pickUpItems: true,
                                        ...runtimeArgs(args),
                                    })

                                    if (digResult.itemsDelta.get(step.loot.item) < step.loot.count) {
                                        if (step.isGenerator) { continue }
                                        throw `Couldn't dig ${step.loot.count} ${step.loot.item}: got ${digResult.itemsDelta.get(step.loot.item)}`
                                    }
                                    break
                                } catch (error) {
                                    if (remainingRetries === 0) { throw error }
                                    console.warn(`[Bot "${bot.username}"] ${error} (remaining retries: ${remainingRetries})`)
                                }
                            }
                        }
                        continue
                    }
                    case 'brew': {
                        yield* brew.task(bot, {
                            count: step.count,
                            recipe: step.recipe,
                            brewingStand: step.brewingStand,
                            locks: args.locks,
                            ...runtimeArgs(args),
                        })
                        break
                    }
                    default: debugger
                }
            } catch (error) {
                if (step.isOptional) {
                    console.warn(`[Bot "${bot.username}"] Step ${step.type} failed but that was optional so no problem`)
                } else {
                    throw error
                }
            }
        }
    } finally {
        if (openedChest) {
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
            case 'fill-item': {
                builder += `Fill ${stringifyItem(step.item)}`
                break
            }
            case 'inventory': {
                builder += `I have ${step.count} ${stringifyItem(step.item)}`
                break
            }
            case 'chest': {
                builder += `I found ${step.count} ${stringifyItem(step.item)} in a chest (${step.chest})`
                break
            }
            case 'harvest-mob': {
                builder += `Harvest mob ${step.entity.expectedType} for ${step.count} ${stringifyItem(step.item)}`
                break
            }
            case 'craft': {
                builder += `Craft ${step.recipe.result.count} ${stringifyItem(step.item)}`
                if (step.count > 1) {
                    builder += `, ${step.count} times`
                }
                builder += ``
                break
            }
            case 'smelt': {
                builder += `Smelt ${step.count} ${stringifyItem(step.recipe.result)}`
                break
            }
            case 'campfire': {
                builder += `Cook ${step.count} ${stringifyItem(step.recipe.result)}`
                break
            }
            case 'goto': {
                builder += `Goto ${step.destination}`
                break
            }
            case 'request': {
                builder += `Request ${step.remoteLock.count} ${stringifyItem(step.remoteLock.item)} from someone`
                break
            }
            case 'trade': {
                if (step.trade.inputItem2) {
                    builder += `Buy ${step.trade.outputItem.count} ${step.trade.outputItem.name} for ${step.trade.inputItem1.count} ${step.trade.inputItem1.name} and ${step.trade.inputItem2.count} ${step.trade.inputItem2.name}, ${step.count} times`
                } else {
                    builder += `Buy ${step.trade.outputItem.count} ${step.trade.outputItem.name} for ${step.trade.inputItem1.count} ${step.trade.inputItem1.name}, ${step.count} times`
                }
                break
            }
            case 'bundle-out': {
                builder += `I have a bundle with ${step.count} ${stringifyItem(step.item)} in it`
                break
            }
            case 'request-from-anyone': {
                builder += `Request ${step.count} ${stringifyItem(step.item)} from anyone`
                break
            }
            case 'dig': {
                builder += `Dig ${step.block.block.name} at ${step.block.position}${(step.count > 1 ? ` ${step.count} times` : '')}`
                break
            }
            case 'brew': {
                builder += `Brew ${step.count} ${stringifyItem(step.recipe.result)}`
                break
            }
            default: {
                debugger
                break
            }
        }

        if (step.isOptional) builder += ` (optional)`
        builder += '\n'
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

    /** @type {Array<PlanStep<PlanStepType> & { i: number; }>} */
    const orderedSteps = []
    /** @type {Array<PlanStep<PlanStepType> & { i: number; }>} */
    const unorderedSteps = []

    for (const stepType of stepTypes) {
        const steps = grouped[stepType]
        if (orderedStepTypes.includes(stepType)) {
            orderedSteps.push(...steps)
        } else {
            unorderedSteps.push(...steps)
        }
    }

    orderedSteps.sort((a, b) => a.i - b.i)
    unorderedSteps.sort((a, b) => unorderedStepPriorities[a.type] - unorderedStepPriorities[b.type])

    indexedSteps.forEach(v => delete v.i)

    const res = [
        ...unorderedSteps,
        ...orderedSteps,
    ]

    const compressed = []

    for (let i = 0; i < res.length; i++) {
        const item = res[i]
        if (compressed.length === 0) {
            compressed.push(item)
            continue
        }
        const last = compressed[compressed.length - 1]
        if (last.type === 'campfire' && item.type === 'campfire' &&
            last.recipe.ingredient === item.recipe.ingredient &&
            last.isOptional === item.isOptional
        ) {
            const canAdd = Math.max(item.count, 4 - last.count)
            last.count += canAdd
            item.count -= canAdd
            if (item.count <= 0) continue
        }
        compressed.push(item)
    }

    return compressed
}

/**
 * @param {BruhBot} bot
 * @param {OrganizedPlan} plan
 */
function lockPlanItems(bot, plan) {
    /** @type {Array<ItemLock>} */
    const locks = []
    for (const step of plan) {
        switch (step.type) {
            case 'brew':
                locks.push(new ItemLock(bot.username, step.recipe.ingredient, step.count))
                locks.push(new ItemLock(bot.username, step.recipe.bottle, step.count))
                // locks.push(new ItemLock(bot.username, step.recipe.result, step.count))
                break
            case 'bundle-out':
                // locks.push(new ItemLock(bot.username, step.item, step.count))
                break
            case 'chest':
                // locks.push(new ItemLock(bot.username, step.item, step.count))
                break
            case 'craft':
                locks.push(...step.recipe.delta.filter(v => v.count < 0).map(v => new ItemLock(bot.username, bot.bot.registry.items[v.id].name, Math.abs(v.count) * step.count)))
                break
            case 'dig':
                // if (step.loot.item) locks.push(new ItemLock(bot.username, step.loot.item, step.loot.count))
                break
            case 'goto':
                break
            case 'harvest-mob':
                // if (step.item) locks.push(new ItemLock(bot.username, step.item, step.count))
                if (step.tool) {
                    locks.push(new ItemLock(bot.username, step.tool, step.willToolDisappear ? step.count : 1))
                }
                break
            case 'inventory':
                // locks.push(new ItemLock(bot.username, step.item, step.count))
                break
            case 'request':
                // locks.push(...step.locks.map(v => new ItemLock(bot.username, v.item, v.count)))
                break
            case 'request-from-anyone':
                // locks.push(new ItemLock(bot.username, step.item, step.count))
                break
            case 'smelt':
                locks.push(...step.recipe.ingredient.map(v => new ItemLock(bot.username, v, step.count)))
                // locks.push(new ItemLock(bot.username, step.recipe.result, step.count))
                break
            case 'campfire':
                locks.push(...step.recipe.ingredient.map(v => new ItemLock(bot.username, v, step.count)))
                // locks.push(new ItemLock(bot.username, step.recipe.result, step.count))
                break
            case 'trade':
                if (step.trade.inputItem1) locks.push(new ItemLock(bot.username, step.trade.inputItem1.name, step.trade.inputItem1.count * step.count))
                if (step.trade.inputItem2) locks.push(new ItemLock(bot.username, step.trade.inputItem2.name, step.trade.inputItem2.count * step.count))
                // if (step.trade.outputItem) locks.push(new ItemLock(bot.username, step.trade.outputItem.name, step.trade.outputItem.count * step.count))
                break
            case 'fill-item':
                // locks.push(new ItemLock(bot.username, brew.makePotionItem('water'), 1))
                locks.push(new ItemLock(bot.username, step.item, 1))
                break
            default:
                break
        }
    }
    return locks
}

/**
 * @type {import('../task').TaskDef<{item: import('../utils/other').ItemId | null; count: number | NaN; }, Args> & {
 *   planCost: planCost;
 *   planResult: planResult;
 *   plan: plan;
 *   planAny: planAny;
 *   organizePlan: organizePlan;
 *   stringifyPlan: stringifyPlan;
 *   PredictedEnvironment: typeof PredictedEnvironment,
 * }}
 */
const def = {
    task: function*(bot, args) {
        if ('plan' in args) {
            const bestPlan = args.plan

            const _organizedPlan = organizePlan(bestPlan)
            console.log(`[Bot "${bot.username}"] Plan for something:`)
            console.log(stringifyPlan(bot, _organizedPlan))
            console.log(`[Bot "${bot.username}"] Environment in the future:`)
            {
                let builder = ''
                const future = new PredictedEnvironment(_organizedPlan, bot.mc.registry)

                let inventoryBuilder = ''
                for (const name of future.inventory.keys) {
                    const delta = future.inventory.get(name)
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
                    for (const name of chest.delta.keys) {
                        const delta = chest.delta.get(name)
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

            console.log(`[Bot "${bot.username}"] Evaluating plan ...`)
            _organizedPlan.filter(v => 'locks' in v).map(v => v.locks).flat().forEach(v => v.isUnlocked = true)
            const locks = lockPlanItems(bot, _organizedPlan)
            bot.lockedItems.push(...locks)
            locks.push(..._organizedPlan.filter(v => v.type === 'request').map(v => v.remoteLock))
            /** @param {'interrupt' | 'cancel'} type */
            const cleanup = (type) => {
                if (type !== 'cancel') { return }
                for (const lock of locks) {
                    lock.isUnlocked = true
                }
            }
            args.interrupt.on(cleanup)
            try {
                yield* evaluatePlan(bot, _organizedPlan, {
                    locks: locks,
                    ...runtimeArgs(args),
                })
            } finally {
                args.interrupt.off(cleanup)
                cleanup('cancel')
            }

            return {
                item: null,
                count: NaN,
            }
        } else {
            args.item = [args.item].flat()

            let bestPlan = null
            /** @type {Array<ItemLock>} */
            const planningLocalLocks = []
            /** @type {Array<ItemLock>} */
            const planningRemoteLocks = []
            try {
                console.log(`[Bot "${bot.username}"] Planning ...`, args.count, args.item)
                args.task?.blur()
                bestPlan = yield* planAny(
                    bot,
                    args.item,
                    args.count,
                    args,
                    {
                        depth: 0,
                        isOptional: false,
                        lockItems: false,
                        localLocks: planningLocalLocks,
                        remoteLocks: planningRemoteLocks,
                        recursiveItems: [],
                        force: false,
                    })
            } finally {
                args.task?.focus()
            }

            yield

            planningLocalLocks.forEach(v => v.isUnlocked = true)

            const _organizedPlan = organizePlan(bestPlan.plan)
            const _planResult = planResult(_organizedPlan, bestPlan.item)

            if (_planResult <= 0) {
                planningRemoteLocks.forEach(v => v.isUnlocked = true)
                throw `Can't gather ${stringifyItemH(bestPlan.item)}`
            }

            if (_planResult < args.count) {
                planningRemoteLocks.forEach(v => v.isUnlocked = true)
                throw `I can only gather ${_planResult} ${stringifyItemH(bestPlan.item)}`
            }

            console.log(`[Bot "${bot.username}"] Plan for ${args.count} of ${stringifyItem(bestPlan.item)}:`)
            console.log(stringifyPlan(bot, _organizedPlan))
            console.log(`[Bot "${bot.username}"] Environment in the future:`)
            {
                let builder = ''
                const future = new PredictedEnvironment(_organizedPlan, bot.mc.registry)

                let inventoryBuilder = ''
                for (const name of future.inventory.keys) {
                    const delta = future.inventory.get(name)
                    if (!delta) { continue }
                    inventoryBuilder += `  ${(delta < 0) ? delta : ('+' + delta)} ${stringifyItem(name)}\n`
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
                    for (const name of chest.delta.keys) {
                        const delta = chest.delta.get(name)
                        if (!delta) { continue }
                        chestsBuilder += ` ${(delta < 0) ? delta : ('+' + delta)} ${stringifyItem(name)}\n`
                    }
                }
                if (chestsBuilder) {
                    builder += 'Chests:\n'
                    builder += chestsBuilder
                }

                console.log(builder)
            }

            const itemsBefore = bot.inventoryItemCount(null, bestPlan.item)

            console.log(`[Bot "${bot.username}"] Evaluating plan ...`)
            const locks = lockPlanItems(bot, _organizedPlan)
            locks.push(new ItemLock(bot.username, bestPlan.item, args.count))
            bot.lockedItems.push(...locks)
            locks.push(..._organizedPlan.filter(v => v.type === 'request').map(v => v.remoteLock))
            /** @param {'interrupt' | 'cancel'} type */
            const cleanup = (type) => {
                if (type !== 'cancel') { return }
                locks.forEach(v => v.isUnlocked = true)
                planningRemoteLocks.forEach(v => v.isUnlocked = true)
            }
            args.interrupt.on(cleanup)
            try {
                yield* evaluatePlan(bot, _organizedPlan, {
                    locks: locks,
                    ...runtimeArgs(args),
                })
            } finally {
                args.interrupt.off(cleanup)
                cleanup('cancel')
            }

            const itemsAfter = bot.inventoryItemCount(null, bestPlan.item)
            const itemsGathered = itemsAfter - itemsBefore

            return {
                item: bestPlan.item,
                count: itemsGathered,
            }
        }
    },
    id: function(args) {
        if ('plan' in args) {
            return `gather-${args.plan}`
        } else {
            return `gather-${args.count}-${[args.item].flat().map(stringifyItem).join('-')}`
        }
    },
    humanReadableId: function(args) {
        if ('plan' in args) {
            return `Gathering something`
        } else {
            return `Gathering ${args.count} ${[args.item].flat().length > 1 ? 'something' : stringifyItemH([args.item].flat()[0])}`
        }
    },
    definition: 'gatherItem',
    planCost: planCost,
    planResult: planResult,
    plan: plan,
    planAny: planAny,
    organizePlan: organizePlan,
    stringifyPlan: stringifyPlan,
    PredictedEnvironment: PredictedEnvironment,
}

module.exports = def
