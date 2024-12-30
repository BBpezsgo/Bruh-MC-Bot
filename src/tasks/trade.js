'use strict'

const { wrap, sleepTicks } = require('../utils/tasks')
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
 * @type {import('../task').TaskDef<number, Args> & { tradeEquality: tradeEquality }}
 */
module.exports = {
    task: function*(bot, args) {
        if (args.cancellationToken.isCancelled) { return 0 }

        if (args.villager && (!args.villager.isValid || args.villager.name !== 'villager')) {
            throw `This aint a villager`
        }

        if (!args.villager) {
            for (const uuid in bot.env.villagers) {
                if (args.cancellationToken.isCancelled) { return 0 }

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
                            cancellationToken: args.cancellationToken,
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
                    cancellationToken: args.cancellationToken,
                })
                if (args.cancellationToken.isCancelled) { break }
                if (!entity.isValid) { continue }
                if (entity.name !== 'villager') { continue }

                const villager = yield* wrap(bot.bot.openVillager(args.villager))
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

        if (args.cancellationToken.isCancelled) { return 0 }

        yield* goto.task(bot, {
            point: args.villager.position,
            distance: 2,
            cancellationToken: args.cancellationToken,
        })

        if (args.villager && (!args.villager.isValid || args.villager.name !== 'villager')) {
            throw `This aint a villager`
        }

        const villager = yield* wrap(bot.bot.openVillager(args.villager))
        while (!villager.trades) { yield }
        yield

        bot.env.addVillager(args.villager, villager, bot.dimension)

        let traded = 0

        try {
            const tradeIndex = villager.trades.findIndex(v => tradeEquality(v, args.trade))
            if (tradeIndex === -1) {
                throw `No trade found`
            }

            const trade = villager.trades[tradeIndex]

            if (trade.tradeDisabled) { throw `This trade is disabled` }
            while (traded < args.numberOfTrades) {
                if (args.cancellationToken.isCancelled) { break }
                const have = bot.inventoryItemCount(villager, trade.inputItem1)
                if (have < trade.inputItem1.count) { break }
                yield* wrap(bot.bot.trade(villager, tradeIndex, 1))
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
