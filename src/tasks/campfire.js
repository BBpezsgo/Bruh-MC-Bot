'use strict'

const { Item } = require('prismarine-item')
const { wrap, sleepTicks, runtimeArgs } = require('../utils/tasks')
const { Timeout } = require('../utils/other')
const goto = require('./goto')
const pickupItem = require('./pickup-item')
const Vec3Dimension = require('../utils/vec3-dimension')
const GameError = require('../errors/game-error')
const TimeoutError = require('../errors/timeout-error')
const EnvironmentError = require('../errors/environment-error')
const KnowledgeError = require('../errors/knowledge-error')

/**
 * @type {import('../task').TaskDef<Array<Item>, {
 *   recipes: ReadonlyArray<import('../local-minecraft-data').CookingRecipe>;
 *   count: 1 | 2 | 3 | 4;
 *   locks: ReadonlyArray<import('../locks/item-lock')>;
 * }>}
 */
module.exports = {
    task: function*(bot, args) {
        if (args.interrupt.isCancelled) { return [] }

        const recipes = args.recipes.filter(v => v.type === 'campfire')

        let campfire = bot.blocks.find({
            matching: 'campfire',
            count: 1,
            maxDistance: 48,
            filter: (campfire) => Boolean(campfire.getProperties()['lit']),
        }).filter(Boolean).first()
        if (!campfire) { throw new EnvironmentError(`No campfire nearby`) }

        args.task?.blur()
        const blockLock = yield* bot.env.waitLock(bot.username, new Vec3Dimension(campfire.position, bot.dimension), 'use')
        args.task?.focus()

        try {
            yield* goto.task(bot, {
                block: campfire.position,
                ...runtimeArgs(args),
            })
    
            campfire = bot.bot.blockAt(campfire.position)
            if (!campfire) { throw new EnvironmentError(`Campfire disappeared`) }

            const recipe = recipes[0]

            const result = bot.mc.registry.itemsByName[recipe.result]
            if (!result) { throw new KnowledgeError(`Unknown item \"${recipe.result}\"`) }

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
            if (!campfire) { throw new EnvironmentError(`Campfire disappeared`) }
            if (!campfire.getProperties()['lit']) { throw new EnvironmentError(`This campfire is out`) }

            for (let i = 0; i < args.count; i++) {
                if (args.interrupt.isCancelled) { break }

                if (!('Items' in campfire.blockEntity)) { continue }
                if (!Array.isArray(campfire.blockEntity.Items)) { continue }
                if (campfire.blockEntity.Items.length >= 4 || placedCount >= 4) {
                    console.log(`[Bot "${bot.username}"] Campfire is full`)
                    break
                }

                let ingredientItem
                for (const ingredient of recipe.ingredient) {
                    const actualIngredient = (ingredient.startsWith('#') ? bot.mc.local.resolveItemTag(ingredient.replace('#', '')) : [ingredient])
                    ingredientItem = bot.inventory.searchInventoryItem(null, ...actualIngredient)
                    if (ingredientItem) { break }
                }

                if (!ingredientItem) { throw new GameError(`No ingredient`) }

                yield* wrap(bot.bot.equip(ingredientItem, 'hand'), args.interrupt)
                yield* wrap(bot.bot.activateBlock(campfire), args.interrupt)
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
                    ...runtimeArgs(args),
                })

                if (args.interrupt.isCancelled) {
                    bot.bot.removeListener('playerCollect', onPickUp)
                    break
                }

                campfire = bot.bot.blockAt(campfire.position)
                if (!campfire) {
                    bot.bot.removeListener('playerCollect', onPickUp)
                    throw new EnvironmentError(`Campfire disappeared`)
                }

                if (!campfire.getProperties()['lit']) {
                    bot.bot.removeListener('playerCollect', onPickUp)
                    throw new EnvironmentError(`This campfire is out`)
                }

                if (minimumTime.done() && pickedUp.length > 0) {
                    console.log(`[Bot "${bot.username}"] Campfire finished`)
                    return pickedUp
                }

                if (maximumTime.done()) {
                    bot.bot.removeListener('playerCollect', onPickUp)
                    throw new GameError(`This isn't cooking`, {
                        cause: TimeoutError.fromTime(maximumTime),
                    })
                }

                yield* sleepTicks(1)

                if (pickupItem.getClosestItem(bot, null, itemFilter)) {
                    console.log(`[Bot "${bot.username}"] Picking up item`)
                    try {
                        yield* pickupItem.task(bot, {
                            ...itemFilter,
                            ...runtimeArgs(args),
                        })
                    } catch (error) {
                        console.log(`[Bot "${bot.username}"]`, error)
                    }
                }
            }

            return pickedUp
        } finally {
            blockLock.unlock()
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
