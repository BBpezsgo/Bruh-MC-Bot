'use strict'

const { Item } = require('prismarine-item')
const { wrap, sleepTicks } = require('../utils/tasks')
const goto = require('./goto')
const { Block } = require('prismarine-block')
const Minecraft = require('../minecraft')
const config = require('../config')

/**
 * @param {import('../bruh-bot')} bot
 * @param {ReadonlyArray<(import('../local-minecraft-data').SmeltingRecipe | import('../local-minecraft-data').SmokingRecipe | import('../local-minecraft-data').BlastingRecipe)> | null} recipes
 * @returns {import('../task').Task<{furnaceBlock: Block; recipes: Array<import('../local-minecraft-data').SmeltingRecipe | import('../local-minecraft-data').SmokingRecipe | import('../local-minecraft-data').BlastingRecipe>; } | null>}
 */
function* findBestFurnace(bot, recipes) {
    let bestFurnaceId = -1
    /**
     * @type {Array<(import('../local-minecraft-data').SmeltingRecipe | import('../local-minecraft-data').SmokingRecipe | import('../local-minecraft-data').BlastingRecipe)>}
     */
    let _recipes = []
    let bestFurnace = null
    recipes ??= []

    for (const recipe of recipes) {
        /**
         * @type {string}
         */
        let goodFurnace

        switch (recipe.type) {
            case 'blasting':
                goodFurnace = 'blast_furnace'
                break
            case 'smelting':
                goodFurnace = 'furnace'
                break
            case 'smoking':
                goodFurnace = 'smoker'
                break
            default:
                continue
        }

        const furnaceId = bot.mc.registry.blocksByName[goodFurnace]?.id

        if (furnaceId === bestFurnaceId) {
            _recipes.push(recipe)
        } else {
            for (const furnaceBlock of bot.findBlocks({
                matching: furnaceId,
                maxDistance: config.smelt.furnaceSearchRadius,
                count: 1,
            })) {
                yield
                if (!furnaceBlock) { continue }
                bestFurnace = furnaceBlock
                bestFurnaceId = furnaceId
                _recipes = [recipe]
                break
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
 * @type {import('../task').TaskDef<Array<Item>, {
 *   recipe: Exclude<import('../local-minecraft-data').CookingRecipe, import('../local-minecraft-data').CampfireRecipe>;
 *   count: number;
 *   locks: ReadonlyArray<import('../bruh-bot').ItemLock>;
 * }> & {
 *   findBestFurnace: findBestFurnace;
 * }}
 */
module.exports = {
    task: function*(bot, args) {
        if (args.cancellationToken.isCancelled) { return [] }

        const fuels = Minecraft.sortedFuels.filter((/** @type {{ no: any; }} */ fuel) => !fuel.no)

        const best = yield* findBestFurnace(bot, [args.recipe])
        if (!best) { throw `No furnaces found` }

        let furnaceBlock = best.furnaceBlock
        if (!furnaceBlock) { throw `No furnaces found` }

        yield* goto.task(bot, {
            block: furnaceBlock.position,
            cancellationToken: args.cancellationToken,
        })

        if (args.cancellationToken.isCancelled) { return [] }

        const recipe = best.recipes[0]

        furnaceBlock = bot.bot.blockAt(furnaceBlock.position)
        if (!furnaceBlock) { throw `Furnace disappeared` }

        const furnace = yield* wrap(bot.bot.openFurnace(furnaceBlock))
        let shouldTakeEverything = false

        try {
            while (furnace.inputItem() && furnace.fuel > 0) {
                if (args.cancellationToken.isCancelled) { return [] }
                yield* sleepTicks()
            }

            {
                const inputItem = furnace.inputItem()
                const outputItem = furnace.outputItem()
                if (inputItem || outputItem) {
                    if (!args.response) { throw `cancelled` }
                    const res = yield* wrap(args.response.askYesNo(`There are some stuff in a furnace. Can I take it out?`, 10000))
                    if (res?.message) {
                        if (inputItem) yield* wrap(furnace.takeInput())
                        if (outputItem) yield* wrap(furnace.takeOutput())
                    } else {
                        throw `cancelled`
                    }
                }
            }

            shouldTakeEverything = true

            const outputs = []

            for (let i = 0; i < args.count; i++) {
                if (args.cancellationToken.isCancelled) { return outputs }

                for (const ingredient of recipe.ingredient) {
                    const actualIngredient = (ingredient.startsWith('#') ? bot.mc.local.resolveItemTag(ingredient.replace('#', '')) : [ingredient])
                    const ingredientItem = bot.searchInventoryItem(furnace, ...actualIngredient)
                    if (!ingredientItem) {
                        continue
                    }
                    yield* wrap(furnace.putInput(ingredientItem.type, null, 1))
                    break
                }

                if (!furnace.inputItem()) { throw `I have no ingredients` }

                while (!furnace.outputItem()) {
                    yield

                    if (args.cancellationToken.isCancelled) { return outputs }

                    if (furnace.fuel <= 0 && !furnace.fuelItem()) {
                        for (const fuel of fuels) {
                            const have = bot.searchInventoryItem(furnace, fuel.item)
                            if (!have) continue
                            const canPut = have.count - bot.isItemLocked(have)
                            if (canPut > 0) {
                                yield* wrap(furnace.putFuel(have.type, null, Math.min(canPut, 1)))
                                break
                            }
                        }

                        if (furnace.fuel <= 0 && !furnace.fuelItem()) { throw `I have no fuel` }
                    }

                    yield* sleepTicks(1)
                }

                const output = yield* wrap(furnace.takeOutput())

                if (!output) { throw `Failed to smelt item` }

                outputs.push(output)
            }

            if (outputs.length !== args.count) { throw `Something aint right` }
            return outputs
        } finally {
            if (shouldTakeEverything) {
                if (furnace.inputItem()) { yield* wrap(furnace.takeInput()) }
                if (furnace.outputItem()) { yield* wrap(furnace.takeOutput()) }
            }
            furnace.close()
        }
    },
    id: function(args) {
        return `smelt-${args.recipe.type}-${args.count}-${args.recipe.result}`
    },
    humanReadableId: function() {
        return `Cooking`
    },
    definition: 'smelt',
    findBestFurnace: findBestFurnace,
}
