const { Item } = require('prismarine-item')
const { sleepG, wrap } = require('../utils/tasks')
const { Timeout } = require('../utils/other')
const goto = require('./goto')
const pickupItem = require('./pickup-item')
const { Block } = require('prismarine-block')

/**
 * @param {import('../bruh-bot')} bot
 * @param {ReadonlyArray<(import('../mc-data').SmeltingRecipe | import('../mc-data').SmokingRecipe | import('../mc-data').BlastingRecipe | import('../mc-data').CampfireRecipe)> | null} recipes
 * @param {boolean} noFuel
 */
function findBestFurnace(bot, recipes, noFuel) {
    let bestFurnaceId = -1
    /**
     * @type {Array<(import('../mc-data').SmeltingRecipe | import('../mc-data').SmokingRecipe | import('../mc-data').BlastingRecipe | import('../mc-data').CampfireRecipe)>}
     */
    let _recipes = []
    let bestFurnace = null
    recipes ??= [ ]

    for (const recipe of recipes) {
        /**
         * @type {string}
         */
        let goodFurnace
        let needFuel

        switch (recipe.type) {
            case 'blasting':
                goodFurnace = 'blast_furnace'
                needFuel = true
                break
            case 'smelting':
                goodFurnace = 'furnace'
                needFuel = true
                break
            case 'smoking':
                goodFurnace = 'smoker'
                needFuel = true
                break
            case 'campfire':
                goodFurnace = 'campfire'
                needFuel = false
                break
            default:
                continue
        }

        if (needFuel && noFuel) {
            continue
        }

        const furnaceId = bot.mc.data.blocksByName[goodFurnace]?.id

        if (furnaceId === bestFurnaceId) {
            _recipes.push(recipe)
        } else {
            const furnaceBlock = bot.bot.findBlock({
                matching: (/** @type {Block} */ block) => {
                    if (block.type !== furnaceId) { return false }
                    if (goodFurnace === 'campfire') {
                        if (!block.getProperties()['lit']) { return false }
                    }
                    return true
                },
                maxDistance: 32,
            })
            if (furnaceBlock) {
                bestFurnace = furnaceBlock
                bestFurnaceId = furnaceId
                _recipes = [recipe]
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
 * @param {import('../bruh-bot')} bot
 * @param {Block} campfire
 * @param {import('../mc-data').CampfireRecipe} recipe
 * @param {number} count
 * @returns {import('../task').Task<Item>}
 */
function* doCampfire(bot, campfire, recipe, count) {
    const result = bot.mc.data.itemsByName[recipe.result]
    if (!result) { throw `What?` }

    if (!campfire.getProperties()['lit']) {
        throw `This campfire is out`
    }

    const exceedingWaitTime = 1000

    console.log(`[Bot: "${bot.bot.username}"]: Doing campfire ...`)

    let item
    for (const ingredient of recipe.ingredient) {
        const _i = bot.mc.data.itemsByName[ingredient]
        if (!_i) {
            console.warn(`[Bot "${bot.bot.username}"] Unknown ingredient "${ingredient}"`)
            continue
        }
        item = bot.searchItem(_i.id)
        if (item) {
            break
        }
    }

    if (!item) {
        throw `No ingredient`
    }

    /**
     * @type {Item | null}
     */
    let pickedUp = null
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
        console.log(`[Bot: "${bot.bot.username}"]: Item "${dropped.name}" picked up`)
        if (dropped.type !== result.id) { return }
        console.log(`[Bot "${bot.bot.username}"] This is the expected result`)
        pickedUp = dropped
        placedCount--
        if (placedCount <= 0) {
            bot.bot.removeListener('playerCollect', onPickUp)
        }
    }

    for (let i = 0; i < count; i++) {
        // @ts-ignore
        if (campfire.blockEntity['Items'].length >= 4 || placedCount >= 4) {
            console.log(`[Bot: "${bot.bot.username}"]: Campfire is full`)
            break
        }
        yield* wrap(bot.bot.equip(item, 'hand'))
        yield* wrap(bot.bot.activateBlock(campfire))
        console.log(`[Bot: "${bot.bot.username}"]: Food placed on campfire`)
        placedCount++
    }

    bot.bot.addListener('playerCollect', onPickUp)

    const minimumTime = new Timeout((recipe.time * 1000))
    const maximumTime = new Timeout((recipe.time * 1000) + exceedingWaitTime)
    const itemFilter = {
        inAir: true,
        point: campfire.position.clone(),
        maxDistance: 4,
        items: [ result.id ],
    }

    console.log(`[Bot: "${bot.bot.username}"]: Wait for ${((recipe.time * 1000) + exceedingWaitTime) / 1000} secs ...`)

    while (true) {
        yield

        if (minimumTime.done() && pickedUp) {
            console.log(`[Bot: "${bot.bot.username}"]: Campfire finished`)
            return pickedUp
        }

        if (maximumTime.done()) {
            bot.bot.removeListener('playerCollect', onPickUp)
            throw `This isn't cooking`
        }

        yield* sleepG(500)

        if ('result' in bot.env.getClosestItem(bot, null, itemFilter)) {
            console.log(`[Bot: "${bot.bot.username}"]: Picking up item`)
            yield* pickupItem.task(bot, itemFilter)
        }
    }
}

/**
 * @type {import('../task').TaskDef<Item, {
 *   recipes: ReadonlyArray<import('../mc-data').CookingRecipe>;
 *   noFuel: boolean;
 *   count: number;
 *   onNeedYesNo?: (question: string, timeout: number) => import('../task').Task<boolean | null>;
 * }> & {
 *   findBestFurnace: findBestFurnace;
 * }}
 */
module.exports = {
    task: function* (bot, args) {
        const fuels = bot.mc.data2.sortedFuels.filter((/** @type {{ no: any; }} */ fuel) => !fuel.no)

        const best = findBestFurnace(bot, args.recipes, args.noFuel)

        if (!best) {
            throw `No furnaces found`
        }

        const furnaceBlock = best.furnaceBlock
        const bestRecipes = best.recipes

        if (!furnaceBlock) {
            throw `No furnaces found`
        }

        yield* goto.task(bot, {
            destination: furnaceBlock.position.clone(),
            range: 2,
            avoidOccupiedDestinations: true,
        })

        if (!furnaceBlock) {
            throw `Furnace disappeared`
        }

        for (const recipe of bestRecipes) {
            if (recipe.type === 'campfire') {
                return yield* doCampfire(bot, furnaceBlock, recipe, args.count)
            }

            let furnace = yield* wrap(bot.bot.openFurnace(furnaceBlock))

            while (furnace.inputItem() && furnace.fuel > 0) {
                yield* sleepG(1000)
            }

            {
                const inputItem = furnace.inputItem()
                if (inputItem) {
                    if (!args.onNeedYesNo) {
                        furnace.close()
                        throw `Cancelled`
                    }
                    const resp = yield* args.onNeedYesNo(`There are ${inputItem.count} of ${inputItem.displayName} waiting in a ${furnaceBlock.displayName} but there is no fuel. Should I take it out?`, 10000)
                    if (resp === null || resp) {
                        yield* wrap(furnace.takeInput())
                    } else {
                        furnace.close()
                        throw `Cancelled`
                    }
                }
            }

            {
                const outputItem = furnace.outputItem()
                if (outputItem) {
                    if (!args.onNeedYesNo) {
                        furnace.close()
                        throw `Cancelled`
                    }
                    const resp = yield* args.onNeedYesNo(`There are ${outputItem.count} of ${outputItem.displayName} finished in a ${furnaceBlock.displayName} but there is no fuel. Should I take it out?`, 10000)
                    if (resp === null || resp) {
                        yield* wrap(furnace.takeOutput())
                    } else {
                        furnace.close()
                        throw `Cancelled`
                    }
                }
            }

            if (!furnace.fuelItem()) {
                furnace.close()

                throw `I have no fuel`

                if (!furnaceBlock) {
                    throw `Furnace disappeared`
                }

                furnace = yield* wrap(bot.bot.openFurnace(furnaceBlock))

                for (const fuel of fuels) {
                    const have = bot.searchItem(fuel.item)
                    if (have) {
                        yield* wrap(furnace.putFuel(have.type, null, 1))
                        break
                    }
                }

                if (furnace.fuel <= 0 && !furnace.fuelItem()) {
                    furnace.close()
                    throw `Failed to gather fuel`
                }
            }

            for (const ingredient of recipe.ingredient) {
                const _i = bot.mc.data.itemsByName[ingredient]
                if (!_i) {
                    console.warn(`[Bot "${bot.bot.username}"] Unknown ingredient "${ingredient}"`)
                    continue
                }
                if (!bot.searchItem(_i.id)) {
                    continue
                }
                yield* wrap(furnace.putInput(_i.id, null, 1))
                break
            }

            if (!furnace.inputItem()) {
                furnace.close()
                continue
            }

            while (!furnace.outputItem()) {
                yield

                if (furnace.fuel <= 0 && !furnace.fuelItem()) {
                    furnace.close()

                    throw `I have no fuel`

                    if (!furnaceBlock) {
                        throw `Furnace disappeared`
                    }

                    furnace = yield* wrap(bot.bot.openFurnace(furnaceBlock))

                    for (const fuel of fuels) {
                        const have = bot.searchItem(fuel.item)
                        if (have) {
                            yield* wrap(furnace.putFuel(have.type, null, 1))
                            break
                        }
                    }

                    if (furnace.fuel <= 0 && !furnace.fuelItem()) {
                        furnace.close()
                        throw `Failed to gather fuel`
                    }
                }

                yield* sleepG(1000)
            }

            const output = yield* wrap(furnace.takeOutput())

            if (!output) {
                furnace.close()
                throw `Failed to smelt item`
            }

            if (furnace.inputItem()) {
                yield* wrap(furnace.takeInput())
            }

            furnace.close()
            return output
        }

        throw `I can't smelt`
    },
    id: function (args) {
        let result = `smelt`
        for (const recipe of args.recipes) {
            result += `-${recipe.type}-${recipe.result}`
        }
        return result
    },
    humanReadableId: function (args) {
        return `Cooking`
    },
    findBestFurnace: findBestFurnace,
}
