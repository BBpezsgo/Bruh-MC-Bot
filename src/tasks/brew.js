'use strict'

const { wrap, waitForEvent } = require('../utils/tasks')
const { NBT2JSON, stringifyItem } = require('../utils/other')
const goto = require('./goto')
const Vec3Dimension = require('../vec3-dimension')

const potions = Object.freeze([
    {
        displayName: 'Water Bottle',
        name: 'water',
        level2: null,
        long: null,
    },
    {
        displayName: 'Mundane Potion',
        name: 'mundane',
        level2: null,
        long: null,
    },
    {
        displayName: 'Thick Potion',
        name: 'thick',
        level2: null,
        long: null,
    },
    {
        displayName: 'Awkward Potion',
        name: 'awkward',
        level2: null,
        long: null,
    },
    {
        displayName: 'Night Vision',
        name: 'night_vision',
        level2: null,
        long: 'long_night_vision',
    },
    {
        displayName: 'Invisibility',
        name: 'invisibility',
        level2: null,
        long: 'long_invisibility',
    },
    {
        displayName: 'Leaping',
        name: 'leaping',
        level2: 'strong_leaping',
        long: 'long_leaping',
    },
    {
        displayName: 'Fire Resistance',
        name: 'fire_resistance',
        level2: null,
        long: 'long_fire_resistance',
    },
    {
        displayName: 'Swiftness',
        name: 'swiftness',
        level2: 'strong_swiftness',
        long: 'long_swiftness',
    },
    {
        displayName: 'Slowness',
        name: 'slowness',
        level2: 'strong_slowness',
        long: 'long_slowness',
    },
    {
        displayName: 'Water Breathing',
        name: 'water_breathing',
        level2: null,
        long: 'long_water_breathing',
    },
    {
        displayName: 'Instant Health',
        name: 'healing',
        level2: 'strong_healing',
        long: null,
    },
    {
        displayName: 'Harming',
        name: 'harming',
        level2: 'strong_harming',
        long: null,
    },
    {
        displayName: 'Poison',
        name: 'poison',
        level2: 'strong_poison',
        long: 'long_poison',
    },
    {
        displayName: 'Regeneration',
        name: 'regeneration',
        level2: 'strong_regeneration',
        long: 'long_regeneration',
    },
    {
        displayName: 'Strength',
        name: 'strength',
        level2: 'strong_strength',
        long: 'long_strength',
    },
    {
        displayName: 'Weakness',
        name: 'weakness',
        level2: null,
        long: 'long_weakness',
    },
    {
        displayName: 'Luck',
        name: 'luck',
        level2: null,
        long: null,
    },
    {
        displayName: 'The Turtle Master',
        name: 'turtle_master',
        level2: 'strong_turtle_master',
        long: 'long_turtle_master',
    },
    {
        displayName: 'Slow Falling',
        name: 'slow_falling',
        level2: null,
        long: 'long_slow_falling',
    },
])

/**
 * @param {string} potion
 * @param {string} [item='potion']
 * @returns {{ name: string; nbt: import('../bruh-bot').NBT; potion: string; }}
 */
function makePotionItem(potion, item = 'potion') {
    if (!potion.startsWith('minecraft:')) {
        potion = `minecraft:${potion.toLowerCase()}`
    }
    return {
        name: item,
        nbt: { type: 'compound', value: { 'Potion': { type: 'string', value: potion } } },
        // @ts-ignore
        potion: potion,
    }
}


const recipes = (() => {
    const result = [
        {
            bottle: { name: 'potion', potion: 'minecraft:water' },
            ingredient: 'nether_wart',
            result: { name: 'potion', potion: 'minecraft:awkward' },
        },
        {
            bottle: { name: 'potion', potion: 'minecraft:water' },
            ingredient: 'spider_eye',
            result: { name: 'potion', potion: 'minecraft:mundane' },
        },
        {
            bottle: { name: 'potion', potion: 'minecraft:water' },
            ingredient: 'ghast_tear',
            result: { name: 'potion', potion: 'minecraft:mundane' },
        },
        {
            bottle: { name: 'potion', potion: 'minecraft:water' },
            ingredient: 'rabbit_foot',
            result: { name: 'potion', potion: 'minecraft:mundane' },
        },
        {
            bottle: { name: 'potion', potion: 'minecraft:water' },
            ingredient: 'blaze_powder',
            result: { name: 'potion', potion: 'minecraft:mundane' },
        },
        {
            bottle: { name: 'potion', potion: 'minecraft:water' },
            ingredient: 'glistering_melon_slice',
            result: { name: 'potion', potion: 'minecraft:mundane' },
        },
        {
            bottle: { name: 'potion', potion: 'minecraft:water' },
            ingredient: 'sugar',
            result: { name: 'potion', potion: 'minecraft:mundane' },
        },
        {
            bottle: { name: 'potion', potion: 'minecraft:water' },
            ingredient: 'magma_cream',
            result: { name: 'potion', potion: 'minecraft:mundane' },
        },
        {
            bottle: { name: 'potion', potion: 'minecraft:water' },
            ingredient: 'redstone',
            result: { name: 'potion', potion: 'minecraft:mundane' },
        },
        {
            bottle: { name: 'potion', potion: 'minecraft:water' },
            ingredient: 'glowstone_dust',
            result: { name: 'potion', potion: 'minecraft:thick' },
        },
        {
            bottle: { name: 'potion', potion: 'minecraft:awkward' },
            ingredient: 'sugar',
            result: { name: 'potion', potion: 'minecraft:swiftness' },
        },
        {
            bottle: { name: 'potion', potion: 'minecraft:awkward' },
            ingredient: 'rabbit_foot',
            result: { name: 'potion', potion: 'minecraft:leaping' },
        },
        {
            bottle: { name: 'potion', potion: 'minecraft:awkward' },
            ingredient: 'blaze_powder',
            result: { name: 'potion', potion: 'minecraft:strength' },
        },
        {
            bottle: { name: 'potion', potion: 'minecraft:awkward' },
            ingredient: 'glistering_melon_slice',
            result: { name: 'potion', potion: 'minecraft:healing' },
        },
        {
            bottle: { name: 'potion', potion: 'minecraft:awkward' },
            ingredient: 'spider_eye',
            result: { name: 'potion', potion: 'minecraft:poison' },
        },
        {
            bottle: { name: 'potion', potion: 'minecraft:awkward' },
            ingredient: 'ghast_tear',
            result: { name: 'potion', potion: 'minecraft:regeneration' },
        },
        {
            bottle: { name: 'potion', potion: 'minecraft:awkward' },
            ingredient: 'magma_cream',
            result: { name: 'potion', potion: 'minecraft:fire_resistance' },
        },
        {
            bottle: { name: 'potion', potion: 'minecraft:awkward' },
            ingredient: 'golden_carrot',
            result: { name: 'potion', potion: 'minecraft:night_vision' },
        },
        {
            bottle: { name: 'potion', potion: 'minecraft:awkward' },
            ingredient: 'turtle_helmet',
            result: { name: 'potion', potion: 'minecraft:turtle_master' },
        },
        {
            bottle: { name: 'potion', potion: 'minecraft:awkward' },
            ingredient: 'phantom_membrane',
            result: { name: 'potion', potion: 'minecraft:slow_falling' },
        },
        {
            bottle: { name: 'potion', potion: 'minecraft:awkward' },
            ingredient: 'pufferfish',
            result: { name: 'potion', potion: 'minecraft:water_breathing' },
        },
        {
            bottle: { name: 'potion', potion: 'minecraft:water' },
            ingredient: 'fermented_spider_eye',
            result: { name: 'potion', potion: 'minecraft:weakness' },
        },
        {
            bottle: { name: 'potion', potion: 'minecraft:night_vision' },
            ingredient: 'fermented_spider_eye',
            result: { name: 'potion', potion: 'minecraft:invisibility' },
        },
        {
            bottle: { name: 'potion', potion: 'minecraft:healing' },
            ingredient: 'fermented_spider_eye',
            result: { name: 'potion', potion: 'minecraft:harming' },
        },
        {
            bottle: { name: 'potion', potion: 'minecraft:healing' },
            ingredient: 'fermented_spider_eye',
            result: { name: 'potion', potion: 'minecraft:harming' },
        },
        {
            bottle: { name: 'potion', potion: 'minecraft:swiftness' },
            ingredient: 'fermented_spider_eye',
            result: { name: 'potion', potion: 'minecraft:slowness' },
        },
        {
            bottle: { name: 'potion', potion: 'minecraft:leaping' },
            ingredient: 'fermented_spider_eye',
            result: { name: 'potion', potion: 'minecraft:slowness' },
        },
    ]

    for (const potion of potions) {
        if (potion.level2) {
            result.push({
                bottle: { name: 'potion', potion: `minecraft:${potion.name}` },
                ingredient: `glowstone_dust`,
                result: { name: 'potion', potion: `minecraft:${potion.level2}` }
            })
        }
        if (potion.long) {
            result.push({
                bottle: { name: 'potion', potion: `minecraft:${potion.name}` },
                ingredient: `redstone`,
                result: { name: 'potion', potion: `minecraft:${potion.long}` }
            })
        }
    }

    return Object.freeze(result.map(v => ({
        bottle: makePotionItem(v.bottle.potion, v.bottle.name),
        ingredient: v.ingredient,
        result: makePotionItem(v.result.potion, v.result.name),
    })))
})()

/**
 * @type {import('../task').TaskDef<Array<import('prismarine-item').Item>, ({
 *   potion: string
 * } | {
 *   recipe: recipes[0]
 * }) & {
 *   count: 1 | 2 | 3;
 *   brewingStand?: Vec3Dimension;
 *   locks: ReadonlyArray<import('../bruh-bot').ItemLock>;
 * }> & {
 *   recipes: typeof recipes;
 *   potions: typeof potions;
 *   makePotionItem: makePotionItem;
 * }}
 */
module.exports = {
    task: function*(bot, args) {
        if (args.cancellationToken.isCancelled) { return [] }

        const recipe = (() => {
            if ('potion' in args) {
                let potionName = args.potion.toLowerCase()
                if (!potionName.startsWith('minecraft:')) {
                    potionName = 'minecraft:' + potionName
                }
                const goodRecipes = recipes.filter(v => v.result.potion === potionName)

                if (!goodRecipes.length) {
                    throw `I don't know what potion \"${args.potion}\" is`
                }

                return goodRecipes[0]
            } else {
                return args.recipe
            }
        })()

        let bottleItem = bot.inventoryItems(null).filter(v => v.name === recipe.bottle.name && NBT2JSON(v.nbt)?.['Potion'] === recipe.bottle.potion).first()
        let ingredientItem = bot.inventoryItems(null).filter(v => v.name === recipe.ingredient).first()

        if (!bottleItem && !ingredientItem) {
            throw `I don't have \"${recipe.ingredient}\" and the bottle`
        }

        if (!bottleItem) {
            throw `I don't have the bottle`
        }

        if (!ingredientItem) {
            throw `I don't have \"${recipe.ingredient}\"`
        }

        if (args.brewingStand) {
            yield* goto.task(bot, {
                point: args.brewingStand,
                distance: 8,
                cancellationToken: args.cancellationToken,
            })
        }

        let brewingStand = bot.findBlocks({
            matching: 'brewing_stand',
            count: 1,
            maxDistance: 64,
        }).filter(v => !!v).first()

        if (!brewingStand) { throw `No brewing stand found` }

        yield* goto.task(bot, {
            block: brewingStand.position,
            cancellationToken: args.cancellationToken,
        })

        brewingStand = bot.bot.blockAt(brewingStand.position, true)

        if (!brewingStand) {
            throw `Brewing stand disappeared`
        }

        const slot1 = 0
        const slot2 = 1
        const slot3 = 2
        const ingredientSlot = 3
        const fuelSlot = 4

        const window = yield* wrap(bot.bot.openBrewingStand(brewingStand))

        try {
            bottleItem = bot.inventoryItems(window).filter(v => v.name === recipe.bottle.name && NBT2JSON(v.nbt)?.['Potion'] === recipe.bottle.potion).first()
            ingredientItem = bot.inventoryItems(window).filter(v => v.name === recipe.ingredient).first()

            if (!bottleItem || !ingredientItem) {
                throw `Ingredients disappeared`
            }

            if (window.potions().some(Boolean) || window.ingredientItem()) {
                if (!args.response) { throw `cancelled` }
                const res = yield* wrap(args.response.askYesNo(`There are some stuff in a brewing stand. Can I take it out?`, 10000, null, q => {
                    if (/what(\s*is\s*it)?\s*\?*/.exec(q)) {
                        let detRes = ''
                        for (const potion of window.potions().filter(Boolean)) {
                            detRes += `${potion.count > 1 ? potion.count : ''}${stringifyItem(potion)}\n`
                        }
                        if (window.ingredientItem()) {
                            detRes += `${window.ingredientItem().count > 1 ? window.ingredientItem().count : ''}${stringifyItem(window.ingredientItem())}\n`
                        }
                        return detRes
                    }
                    return null
                }))
                if (res?.message) {
                    if (window.potions().some(Boolean)) yield* wrap(window.takePotions())
                    if (window.ingredientItem()) yield* wrap(window.takeIngredient())
                } else {
                    throw `cancelled`
                }
            }

            if (!window.fuel && !window.fuelItem()) {
                const fuelItem = bot.searchInventoryItem(window, 'blaze_powder')
                if (!fuelItem) { throw `I have no blaze powder` }
                yield* wrap(window.putFuel(fuelItem.type, fuelItem.metadata, 1))
            }

            yield
            bot.bot.clickWindow(ingredientItem.slot, 0, 0)
            yield
            bot.bot.clickWindow(ingredientSlot, 1, 0)
            yield
            bot.bot.clickWindow(ingredientItem.slot, 0, 0)

            for (let slot = 0; slot < Math.clamp(args.count, 1, 3); slot++) {
                bottleItem = bot.inventoryItems(window).filter(v => v.name === recipe.bottle.name && NBT2JSON(v.nbt)?.['Potion'] === recipe.bottle.potion).first()

                if (!bottleItem) {
                    yield
                    bot.bot.clickWindow(ingredientSlot, 0, 0)
                    yield
                    bot.bot.clickWindow(ingredientItem.slot, 0, 0)
                    yield

                    throw `I don't have the required bottles`
                }

                yield
                bot.bot.clickWindow(bottleItem.slot, 0, 0)
                yield
                bot.bot.clickWindow(slot, 0, 0)
            }

            yield* waitForEvent(window, 'brewingStopped')

            const res = yield* wrap(window.takePotions())
            if (window.ingredientItem()) {
                yield* wrap(window.takeIngredient())
            }

            if (res.length !== args.count) { throw `Something aint right` }
            return res
        } finally {
            yield
            bot.bot.closeWindow(window)
        }
    },
    id: function(args) {
        return `brew-${args.count}-${'recipe' in args ? args.recipe.result.potion : args.potion}`
    },
    humanReadableId: function() {
        return `Brewing`
    },
    definition: 'brew',
    recipes: recipes,
    potions: potions,
    makePotionItem: makePotionItem,
}
