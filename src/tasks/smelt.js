'use strict'

const { Item } = require('prismarine-item')
const { wrap, sleepTicks, runtimeArgs } = require('../utils/tasks')
const goto = require('./goto')
const { Block } = require('prismarine-block')
const Minecraft = require('../minecraft')
const config = require('../config')
const { Vec3 } = require('vec3')
const { stringifyItemH } = require('../utils/other')
const Vec3Dimension = require('../utils/vec3-dimension')
const GameError = require('../errors/game-error')
const TimeoutError = require('../errors/timeout-error')
const PermissionError = require('../errors/permission-error')
const EnvironmentError = require('../errors/environment-error')

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
            for (const furnaceBlock of bot.blocks.find({
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
 *   locks: ReadonlyArray<import('../locks/item-lock')>;
 *   furnace?: Point3;
 * }> & {
 *   findBestFurnace: findBestFurnace;
 * }}
 */
module.exports = {
    task: function*(bot, args) {
        if (args.interrupt.isCancelled) { return [] }

        const fuels = Minecraft.sortedFuels.filter((/** @type {{ no: any; }} */ fuel) => !fuel.no)

        /** @type {Block} */
        let furnaceBlock = null
        /** @type {import('../local-minecraft-data').SmeltingRecipe | import('../local-minecraft-data').SmokingRecipe | import('../local-minecraft-data').BlastingRecipe} */
        let recipe = null

        if (args.furnace) {
            yield* goto.task(bot, {
                block: new Vec3(args.furnace.x, args.furnace.y, args.furnace.z),
                ...runtimeArgs(args),
            })
            if (args.interrupt.isCancelled) { return [] }

            furnaceBlock = bot.bot.blockAt(new Vec3(args.furnace.x, args.furnace.y, args.furnace.z))
            if (!furnaceBlock) { throw new EnvironmentError(`The provided furnace disappeared`) }

            recipe = args.recipe
        } else {
            let best = yield* findBestFurnace(bot, [args.recipe])
            if (!best) { throw new EnvironmentError(`No furnaces found`) }

            furnaceBlock = best.furnaceBlock
            if (!furnaceBlock) { throw new EnvironmentError(`No furnaces found`) }

            recipe = best.recipes[0]
        }

        let shouldTakeEverything = false
        const outputs = []

        args.task?.blur()
        const blockLock = yield* bot.env.waitLock(bot.username, new Vec3Dimension(furnaceBlock.position, bot.dimension), 'use')
        args.task?.focus()

        /** @type {import('mineflayer').Furnace | null} */
        let furnace = null

        try {
            furnaceBlock = bot.bot.blockAt(furnaceBlock.position)
            if (!furnaceBlock) { throw new EnvironmentError(`Furnace disappeared`) }

            yield* goto.task(bot, {
                block: furnaceBlock.position,
                ...runtimeArgs(args),
            })

            furnace = yield* wrap(bot.bot.openFurnace(furnaceBlock), args.interrupt)
            furnace.once('close', () => {
                furnace = null
                bot.env.unlockBlock(bot.username, blockLock.block)
            })
            args.interrupt.once(() => {
                furnace?.close()
                furnace = null
                bot.env.unlockBlock(bot.username, blockLock.block)
            })

            while (furnace.inputItem() && (furnace.fuel > 0 || furnace.fuelItem())) {
                if (args.interrupt.isCancelled) { return [] }
                yield* sleepTicks()
            }

            if (furnace.inputItem() || furnace.outputItem()) {
                if (!args.response) { throw new PermissionError(`I can't ask questions`) }
                try {
                    const res = yield* wrap(args.response.askYesNo(`There are some stuff in a furnace. Can I take it out?`, 10000, null, q => {
                        if (/what(\s*is\s*it)?\s*\?*/.exec(q)) {
                            let detRes = ''
                            if (furnace.inputItem()) {
                                detRes += `${furnace.inputItem().count > 1 ? furnace.inputItem().count : ''}${stringifyItemH(furnace.inputItem())}\n`
                            }
                            if (furnace.outputItem()) {
                                detRes += `${furnace.outputItem().count > 1 ? furnace.outputItem().count : ''}${stringifyItemH(furnace.outputItem())}\n`
                            }
                            return detRes
                        }

                        if (/where(\s*is\s*it)?\s*\?*/.exec(q)) {
                            return `At ${furnaceBlock.position.x} ${furnaceBlock.position.y} ${furnaceBlock.position.z} in ${bot.dimension}`
                        }

                        return null
                    }))
                    if (res.message) {
                        if (furnace.inputItem()) yield* wrap(furnace.takeInput(), args.interrupt)
                        if (furnace.outputItem()) yield* wrap(furnace.takeOutput(), args.interrupt)
                    } else {
                        throw new PermissionError(`${res.sender} didn't allowed to take out the items from a furnace`)
                    }
                } catch (error) {
                    throw new GameError(`Didn't got a response to my question`, {
                        cause: error
                    })
                }
            }

            shouldTakeEverything = true

            for (let i = 0; i < args.count; i++) {
                if (args.interrupt.isCancelled) { return outputs }

                for (const ingredient of recipe.ingredient) {
                    const actualIngredient = (ingredient.startsWith('#') ? bot.mc.local.resolveItemTag(ingredient.replace('#', '')) : [ingredient])
                    const ingredientItem = bot.inventory.searchInventoryItem(furnace, ...actualIngredient)
                    if (!ingredientItem) {
                        continue
                    }
                    yield* wrap(furnace.putInput(ingredientItem.type, null, 1), args.interrupt)
                    break
                }

                if (!furnace.inputItem()) { throw new GameError(`I have no ingredients`) }

                while (!furnace.outputItem()) {
                    yield

                    if (args.interrupt.isCancelled) { return outputs }

                    puttingFuel: {
                        for (let retry = 0; retry < 5; retry++) {
                            yield* sleepTicks()
                            if (furnace.fuel <= 0 && !furnace.fuelItem()) {
                                for (const fuel of fuels) {
                                    const have = bot.inventory.searchInventoryItem(furnace, fuel.item)
                                    if (!have) continue
                                    const canPut = have.count - bot.inventory.isItemLocked(have, args.locks)
                                    if (canPut > 0) {
                                        yield* wrap(furnace.putFuel(have.type, null, Math.min(canPut, 1)), args.interrupt)
                                        break puttingFuel
                                    }
                                }
                            }
                        }

                        if (furnace.fuel <= 0 && !furnace.fuelItem()) { throw new GameError(`I have no fuel`) }
                    }

                    yield* sleepTicks(1)
                }

                const output = yield* wrap(furnace.takeOutput(), args.interrupt)

                if (!output) { throw new GameError(`Failed to smelt item`) }

                outputs.push(output)
            }

            if (outputs.length !== args.count) { throw new GameError(`Something aint right`) }
            return outputs
        } finally {
            if (shouldTakeEverything) {
                if (furnace.inputItem()) { yield* wrap(furnace.takeInput(), args.interrupt) }
                if (furnace.outputItem()) { yield* wrap(furnace.takeOutput(), args.interrupt) }
            }
            furnace?.close()
            blockLock.unlock()
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
