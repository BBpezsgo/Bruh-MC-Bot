const { sleepG, wrap, waitForEvent } = require('../utils/tasks')
const goto = require('./goto')

/**
 * @typedef {{
 *   item: string;
 *   count: number;
 *   type: 'buy' | 'sell';
 * }} TradeArgs
 */

/**
 * @typedef {TradeArgs & {
 *   villager?: import('prismarine-entity').Entity;
 * }} Args
 */

/**
 * 
 * @param {import('../bruh-bot')} bot 
 * @param {import('../environment').SavedVillager['trades']} trades 
 * @param {TradeArgs} args 
 */
function findTradeIndex(bot, trades, args) {
    for (let i = 0; i < trades.length; i++) {
        const trade = trades[i]
        const tradeKind = (trade.outputItem.name === 'emerald') ? 'sell' : 'buy'
        if (tradeKind !== args.type) { continue }
        if (trade.inputItem2) { console.warn(`I don't want to implement it`) }
        if (tradeKind === 'buy') {
            if (trade.outputItem.name !== args.item) { continue }
        } else {
            if (trade.inputItem1.name !== args.item) { continue }
        }

        return i
    }

    return -0
}

/**
 * @type {import('../task').TaskDef<number, Args> & { findTradeIndex: findTradeIndex }}
 */
module.exports = {
    task: function*(bot, args) {
        if (args.villager && (!args.villager.isValid || args.villager.name !== 'villager')) {
            throw `This aint a villager`
        }

        if (!args.villager) {
            for (const uuid in bot.env.villagers) {
                yield
                const villager = bot.env.villagers[uuid]
                if (findTradeIndex(bot, villager.trades, args) !== -1) {
                    let entity = bot.bot.nearestEntity(v => v.uuid === uuid)
                    if (entity) {
                        args.villager = entity
                    } else {
                        yield* goto.task(bot, {
                            destination: villager.position.clone(),
                            range: 2,
                            avoidOccupiedDestinations: true,
                        })
                        entity = bot.bot.nearestEntity(v => v.uuid === uuid)
                        if (entity) {
                            args.villager = entity
                            break
                        }
                    }
                }
            }
        }

        if (!args.villager) {
            const entities = Object.values(bot.bot.entities).filter(v => v.isValid && v.name === 'villager')
            entities.sort((a, b) => (bot.bot.entity.position.distanceSquared(a.position) - bot.bot.entity.position.distanceSquared(b.position)))
            for (const entity of entities) {
                yield* goto.task(bot, {
                    destination: entity.position.clone(),
                    range: 2,
                    avoidOccupiedDestinations: true,
                })
                if (!entity.isValid) { continue }

                const villager = yield* wrap(bot.bot.openVillager(args.villager))
                yield* waitForEvent(villager, 'ready')
                yield

                if (findTradeIndex(bot, villager.trades, args) !== -1) {
                    args.villager = entity
                    villager.close()
                    yield* sleepG(100)
                    break
                }

                bot.env.addVillager(args.villager, villager)
                villager.close()
            }
        }

        yield* goto.task(bot, {
            destination: args.villager.position.clone(),
            range: 2,
            avoidOccupiedDestinations: true,
        })

        const villager = yield* wrap(bot.bot.openVillager(args.villager))
        yield* waitForEvent(villager, 'ready')
        yield

        bot.env.addVillager(args.villager, villager)

        let traded = 0

        try {
            const tradeIndex = findTradeIndex(bot, villager.trades, args)
            if (tradeIndex === -1) {
                throw `No trade found`
            }

            const trade = villager.trades[tradeIndex]
    
            if (trade.tradeDisabled) { throw `This trade is disabled` }
            while (traded < args.count) {
                const have = bot.itemCount(trade.inputItem1.name)
                if (have < trade.inputItem1.count) { break }
                yield* wrap(bot.bot.trade(villager, tradeIndex, 1))
                traded += trade.outputItem.count
            }
        } finally {
            villager.close()
        }

        return traded
    },
    id: function(args) {
        return `trade`
    },
    humanReadableId: function(args) {
        return 'Trading'
    },
    findTradeIndex: findTradeIndex,
}
