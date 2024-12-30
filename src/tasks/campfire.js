'use strict'

const { Item } = require('prismarine-item')
const { wrap, sleepTicks } = require('../utils/tasks')
const { Timeout } = require('../utils/other')
const goto = require('./goto')
const pickupItem = require('./pickup-item')

/**
 * @type {import('../task').TaskDef<Item, {
 *   recipes: ReadonlyArray<import('../local-minecraft-data').CookingRecipe>;
 *   count: 1 | 2 | 3 | 4;
 *   locks: ReadonlyArray<import('../bruh-bot').ItemLock>;
 * }>}
 */
module.exports = {
    task: function*(bot, args) {
        const recipes = args.recipes.filter(v => v.type === 'campfire')
        let campfire = bot.findBlocks({
            matching: 'campfire',
            count: 1,
            maxDistance: 48,
            filter: (campfire) => { return Boolean(campfire.getProperties()['lit']) },
        }).filter(Boolean).first()

        if (!campfire) { throw `No campfire nearby` }

        yield* goto.task(bot, {
            block: campfire.position,
        })

        campfire = bot.bot.blockAt(campfire.position)
        if (!campfire) { throw `Campfire disappeared` }

        const recipe = recipes[0]

        const result = bot.mc.registry.itemsByName[recipe.result]
        if (!result) { throw `What?` }

        const extraWaitTime = 1000

        console.log(`[Bot "${bot.username}"] Doing campfire ...`)

        /**
         * @type {Array<Item>}
         */
        let pickedUp = []
        let placedCount = 0

        /**
         * @param {import('prismarine-entity').Entity} collector
         * @param {import('prismarine-entity').Entity} collected
         */
        function onPickUp(collector, collected) {
            if (!collected) { return }
            if (!collector) { return }
            if (collector.displayName !== bot.bot.entity.displayName) { return }
            const dropped = collected.getDroppedItem()
            if (!dropped) { return }
            console.log(`[Bot "${bot.username}"] Item "${dropped.name}" picked up`)
            if (dropped.type !== result.id) { return }
            console.log(`[Bot "${bot.username}"] This is the expected result`)
            pickedUp.push(dropped)
            placedCount--
            if (placedCount <= 0) {
                bot.bot.removeListener('playerCollect', onPickUp)
            }
        }

        campfire = bot.bot.blockAt(campfire.position)
        if (!campfire) { throw `Campfire disappeared` }
        if (!campfire.getProperties()['lit']) { throw `This campfire is out` }

        for (let i = 0; i < args.count; i++) {
            if (!('Items' in campfire.blockEntity)) { continue }
            if (!Array.isArray(campfire.blockEntity.Items)) { continue }
            if (campfire.blockEntity.Items.length >= 4 || placedCount >= 4) {
                console.log(`[Bot "${bot.username}"] Campfire is full`)
                break
            }

            let ingredientItem
            for (const ingredient of recipe.ingredient) {
                const actualIngredient = (ingredient.startsWith('#') ? bot.mc.local.resolveItemTag(ingredient.replace('#', '')) : [ingredient])
                ingredientItem = bot.searchInventoryItem(null, ...actualIngredient)
                if (ingredientItem) { break }
            }

            if (!ingredientItem) { throw `No ingredient` }

            yield* wrap(bot.bot.equip(ingredientItem, 'hand'))
            yield* wrap(bot.bot.activateBlock(campfire))
            console.log(`[Bot "${bot.username}"] Item placed on campfire`)
            placedCount++
        }

        bot.bot.addListener('playerCollect', onPickUp)

        const minimumTime = new Timeout((recipe.time * 1000))
        const maximumTime = new Timeout((recipe.time * 1000) + extraWaitTime)
        const itemFilter = {
            inAir: true,
            point: campfire.position,
            maxDistance: 4,
            items: [result.name],
        }

        console.log(`[Bot "${bot.username}"] Wait for ${((recipe.time * 1000) + extraWaitTime) / 1000} secs ...`)

        while (true) {
            yield

            yield* goto.task(bot, {
                block: campfire.position,
            })

            campfire = bot.bot.blockAt(campfire.position)
            if (!campfire) {
                bot.bot.removeListener('playerCollect', onPickUp)
                throw `Campfire disappeared`
            }

            if (!campfire.getProperties()['lit']) {
                bot.bot.removeListener('playerCollect', onPickUp)
                throw `This campfire is out`
            }

            if (minimumTime.done() && pickedUp.length > 0) {
                console.log(`[Bot "${bot.username}"] Campfire finished`)
                return pickedUp
            }

            if (maximumTime.done()) {
                bot.bot.removeListener('playerCollect', onPickUp)
                throw `This isn't cooking`
            }

            yield* sleepTicks(1)

            if (bot.env.getClosestItem(bot, null, itemFilter)) {
                console.log(`[Bot "${bot.username}"] Picking up item`)
                try {
                    yield* pickupItem.task(bot, itemFilter)
                } catch (error) {
                    console.log(`[Bot "${bot.username}"]`, error)
                }
            }
        }
    },
    id: function(args) {
        let result = `campfire`
        for (const recipe of args.recipes) {
            result += `-${recipe.type}-${recipe.result}`
        }
        return result
    },
    humanReadableId: function() {
        return `Cooking`
    },
    definition: 'campfire',
}
