'use strict'

const EnvironmentError = require('../errors/environment-error')
const GameError = require('../errors/game-error')
const { wrap, sleepTicks, runtimeArgs } = require('../utils/tasks')
const goto = require('./goto')

/**
 * @typedef {{
 *   trade: import('../environment').SavedVillager['trades'][0];
 *   numberOfTrades: number;
 * }} TradeArgs
 */

/**
 * @typedef {TradeArgs & {
 *   villager?: import('prismarine-entity').Entity;
 * }} Args
 */

/**
 * @param {import('../environment').SavedVillager['trades'][0]} a
 * @param {import('../environment').SavedVillager['trades'][0]} b
 */
function tradeEquality(a, b) {
    return (
        a.inputItem1?.name == b.inputItem1?.name &&
        a.inputItem2?.name == b.inputItem2?.name &&
        a.outputItem?.name == b.outputItem?.name
    )
}

/**
 * @type {import('../task').TaskDef<number, Args> & {
 *   tradeEquality: tradeEquality
 * }}
 */
module.exports = {
    task: function*(bot, args) {
        if (args.interrupt.isCancelled) { return 0 }

        if (args.villager && (!args.villager.isValid || args.villager.name !== 'villager')) {
            throw new EnvironmentError(`This aint a villager`)
        }

        if (!args.villager) {
            for (const uuid in bot.env.villagers) {
                if (args.interrupt.isCancelled) { return 0 }

                yield
                const villager = bot.env.villagers[uuid]
                const tradeIndex = villager.trades.findIndex(v => tradeEquality(v, args.trade))
                if (tradeIndex !== -1) {
                    let entity = bot.bot.nearestEntity(v => v.uuid === villager.uuid || v.id === villager.id)
                    if (entity) {
                        args.villager = entity
                    } else {
                        yield* goto.task(bot, {
                            point: villager.position.clone(),
                            distance: 2,
                            ...runtimeArgs(args),
                        })
                        entity = bot.bot.nearestEntity(v => v.uuid === villager.uuid || v.id === villager.id)
                        if (entity) {
                            args.villager = entity
                            break
                        }
                    }
                }
            }
        }

        if (!args.villager) {
            const entities = Object.values(bot.bot.entities).filter(v => (v.isValid) && (v.name === 'villager'))
            entities.sort((a, b) => (bot.bot.entity.position.distanceSquared(a.position) - bot.bot.entity.position.distanceSquared(b.position)))
            for (const entity of entities) {
                yield* goto.task(bot, {
                    point: entity.position,
                    distance: 2,
                    ...runtimeArgs(args),
                })
                if (args.interrupt.isCancelled) { break }
                if (!entity.isValid) { continue }
                if (entity.name !== 'villager') { continue }

                const villager = yield* wrap(bot.bot.openVillager(args.villager), args.interrupt)
                while (!villager.trades) { yield }
                yield

                const tradeIndex = villager.trades.findIndex(v => tradeEquality(v, args.trade))
                if (tradeIndex !== -1) {
                    args.villager = entity
                    villager.close()
                    yield* sleepTicks()
                    break
                }

                bot.env.addVillager(args.villager, villager, bot.dimension)
                villager.close()
            }
        }

        if (args.interrupt.isCancelled) { return 0 }

        yield* goto.task(bot, {
            point: args.villager.position,
            distance: 2,
            ...runtimeArgs(args),
        })

        if (args.villager && (!args.villager.isValid || args.villager.name !== 'villager')) {
            throw new EnvironmentError(`This aint a villager`)
        }

        const villager = yield* wrap(bot.bot.openVillager(args.villager), args.interrupt)
        while (!villager.trades) { yield }
        yield

        bot.env.addVillager(args.villager, villager, bot.dimension)

        let traded = 0

        try {
            const tradeIndex = villager.trades.findIndex(v => tradeEquality(v, args.trade))
            if (tradeIndex === -1) {
                throw new EnvironmentError(`No trade found`)
            }

            const trade = villager.trades[tradeIndex]

            if (trade.tradeDisabled) { throw new EnvironmentError(`This trade is disabled`) }
            while (traded < args.numberOfTrades) {
                if (args.interrupt.isCancelled) { break }
                const have = bot.inventory.inventoryItemCount(villager, trade.inputItem1)
                if (have < trade.inputItem1.count) { break }
                yield* wrap(bot.bot.trade(villager, tradeIndex, 1), args.interrupt)
                traded++
            }
        } finally {
            villager.close()
        }

        return traded
    },
    id: function() {
        return `trade`
    },
    humanReadableId: function() {
        return 'Trading'
    },
    definition: 'trade',
    tradeEquality: tradeEquality,
}
