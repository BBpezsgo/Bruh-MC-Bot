'use strict'

const { Item } = require('prismarine-item')
const { wrap, sleepTicks, runtimeArgs } = require('../utils/tasks')
const goto = require('./goto')
const { Block } = require('prismarine-block')
const Minecraft = require('../minecraft')
const config = require('../config')
const { Vec3 } = require('vec3')
const { stringifyItem } = require('../utils/other')

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
 *   locks: ReadonlyArray<import('../item-lock')>;
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
            if (!furnaceBlock) { throw `The provided furnace disappeared` }

            recipe = args.recipe
        } else {
            let best = yield* findBestFurnace(bot, [args.recipe])
            if (!best) { throw `No furnaces found` }

            furnaceBlock = best.furnaceBlock
            if (!furnaceBlock) { throw `No furnaces found` }

            recipe = best.recipes[0]
        }

        if (!furnaceBlock) { throw `Furnace disappeared` }

        yield* goto.task(bot, {
            block: furnaceBlock.position,
            ...runtimeArgs(args),
        })
        if (args.interrupt.isCancelled) { return [] }

        furnaceBlock = bot.bot.blockAt(furnaceBlock.position)

        if (!furnaceBlock) { throw `Furnace disappeared` }

        if (args.interrupt.isCancelled) { return [] }

        let shouldTakeEverything = false
        const outputs = []

        let blockLock = null
        try {
            args.task?.blur()
            while (!(blockLock = bot.env.tryLockBlock(bot.username, furnaceBlock.position))) {
                yield sleepTicks()
            }
        } finally {
            args.task?.focus()
        }

        /** @type {import('mineflayer').Furnace | null} */
        let furnace = null

        try {
            furnace = yield* wrap(bot.bot.openFurnace(furnaceBlock))
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
                if (!args.response) { throw `I can't ask questions` }
                const res = yield* wrap(args.response.askYesNo(`There are some stuff in a furnace. Can I take it out?`, 10000, null, q => {
                    if (/what(\s*is\s*it)?\s*\?*/.exec(q)) {
                        let detRes = ''
                        if (furnace.inputItem()) {
                            detRes += `${furnace.inputItem().count > 1 ? furnace.inputItem().count : ''}${stringifyItem(furnace.inputItem())}\n`
                        }
                        if (furnace.outputItem()) {
                            detRes += `${furnace.outputItem().count > 1 ? furnace.outputItem().count : ''}${stringifyItem(furnace.outputItem())}\n`
                        }
                        return detRes
                    }

                    if (/where(\s*is\s*it)?\s*\?*/.exec(q)) {
                        return `At ${furnaceBlock.position.x} ${furnaceBlock.position.y} ${furnaceBlock.position.z} in ${bot.dimension}`
                    }

                    return null
                }))
                if (res?.message) {
                    if (furnace.inputItem()) yield* wrap(furnace.takeInput())
                    if (furnace.outputItem()) yield* wrap(furnace.takeOutput())
                } else {
                    throw `Didn't got a response to my question`
                }
            }

            shouldTakeEverything = true

            for (let i = 0; i < args.count; i++) {
                if (args.interrupt.isCancelled) { return outputs }

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

                    if (args.interrupt.isCancelled) { return outputs }

                    if (furnace.fuel <= 0 && !furnace.fuelItem()) {
                        let havePutSomething = false
                        for (const fuel of fuels) {
                            const have = bot.searchInventoryItem(furnace, fuel.item)
                            if (!have) continue
                            const canPut = have.count - bot.isItemLocked(have)
                            if (canPut > 0) {
                                yield* wrap(furnace.putFuel(have.type, null, Math.min(canPut, 1)))
                                havePutSomething = true
                                break
                            }
                        }

                        if (!havePutSomething && furnace.fuel <= 0 && !furnace.fuelItem()) { throw `I have no fuel` }
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
            furnace?.close()
            bot.env.unlockBlock(bot.username, blockLock.block)
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
