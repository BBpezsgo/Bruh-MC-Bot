'use strict'

const Freq = require('../utils/freq')
const { stringifyItem, isItemEquals } = require('../utils/other')
const { wrap, sleepTicks, runtimeArgs } = require('../utils/tasks')
const goto = require('./goto')
const ItemLock = require('../item-lock')
const move = require('./move')
const { ItemRequest } = require('../environment')

/**
 * @type {import('../task').TaskDef<Freq<import('../utils/other').ItemId>, ({
 *   player: string;
 *   items: ReadonlyArray<{ item: import('../utils/other').ItemId; count: number; } | ItemLock>;
 * } | {
 *   request: import('../environment').ItemRequest;
 * }) & {
 *   waitUntilTargetPickedUp?: boolean;
 * }>}
 */
module.exports = {
    task: function*(bot, args) {
        const tossedMap = new Freq(isItemEquals)

        if (args.interrupt.isCancelled) { return tossedMap }
        if (bot.inventoryItems().isEmpty()) { throw `I don't have anything` }

        let canGiveSomething = false

        const itemsToGive = 'items' in args ? [...args.items] : [args.request.lock]
        const itemsToGiveOriginal = [...itemsToGive]
        const player = 'player' in args ? args.player : args.request.lock.by

        for (const itemToGive of itemsToGive) {
            const has = bot.inventoryItemCount(null, itemToGive.item)
            if (!has) { continue }
            canGiveSomething = true
            break
        }

        if (!canGiveSomething) {
            if (itemsToGive.length === 1) {
                throw `Don't have ${stringifyItem(itemsToGive[0].item)}`
            } else {
                throw `Don't have anything`
            }
        }

        /** @type {Array<import('prismarine-entity').Entity>} */
        const droppedItemEntities = []

        /**
         * @param {import('prismarine-entity').Entity} collector
         * @param {import('prismarine-entity').Entity} collected
         */
        const onCollect = (collector, collected) => {
            if (!droppedItemEntities.some(v => v.id === collected.id)) return
            for (let i = 0; i < droppedItemEntities.length; i++) {
                if (droppedItemEntities[i].id === collected.id) {
                    droppedItemEntities.splice(i, 1)
                    i--
                }
            }

            const collectedItem = collected.getDroppedItem()
            if (!collectedItem) return

            if (collector.username && collector.username === player) {
                console.log(`[Bot "${bot.username}"] The target picked up the item I just dropped`)
                return
            }

            if (collector.username && collector.username === bot.username) {
                itemsToGive.push({
                    item: collectedItem,
                    count: collectedItem.count,
                })
                console.log(`[Bot "${bot.username}"] I picked up the item I just dropped, trying again ...`)
                return
            }

            if (collector.username && bots[collector.username] && 'request' in args && isItemEquals(args.request.lock.item, collectedItem)) {
                const badBot = bots[collector.username]
                const lock = badBot.tryLockItems(player, collectedItem, collectedItem.count)
                if (lock) {
                    console.warn(`[Bot "${bot.username}"] The bot \"${collector.username}\" picked up the item I just dropped so I asked to give it to \"${player}\" ...`)
                    bot.env.itemRequests.push(new ItemRequest(lock, 10000, args.request.callback, args.request.priority))
                } else {
                    console.warn(`[Bot "${bot.username}"] The bot \"${collector.username}\" picked up the item I just dropped and it aint want to give it back ...`)
                }
                return
            }

            console.warn(`[Bot "${bot.username}"] Someone else picked up the item I just dropped ...`)
        }

        bot.bot.on('playerCollect', onCollect)

        try {
            while (itemsToGive.length > 0) {
                const target = bot.env.getPlayerPosition(player)
                if (!target) { throw `Can't find ${player}` }

                const MAX_DISTANCE = 3
                const MIN_DISTANCE = 2

                yield* goto.task(bot, {
                    point: target,
                    distance: MAX_DISTANCE,
                    ...runtimeArgs(args),
                })
                yield* move.task(bot, {
                    goal: {
                        danger: bot.bot.movement.heuristic.new('danger'),
                        distance: bot.bot.movement.heuristic.new('distance'),
                        proximity: bot.bot.movement.heuristic.new('proximity'),
                    },
                    update: (goal) => {
                        const d = bot.bot.entity.position.distanceTo(target.xyz(bot.dimension))
                        goal.proximity
                            .target(target.xyz(bot.dimension))
                            .avoid(d <= MIN_DISTANCE)
                    },
                    isDone: () => {
                        const d = bot.bot.entity.position.distanceTo(target.xyz(bot.dimension))
                        return d < MAX_DISTANCE && d > MIN_DISTANCE
                    },
                    freemotion: true,
                    ...runtimeArgs(args),
                })

                if (args.interrupt.isCancelled) { return tossedMap }

                yield* wrap(bot.bot.lookAt(target.xyz(bot.dimension).offset(0, 0.2, 0), bot.instantLook))

                if (args.interrupt.isCancelled) { break }

                const itemToGive = itemsToGive.shift()

                const has = bot.inventoryItemCount(null, itemToGive.item)
                if (!has) { continue }

                const countCanGive = Math.min(has, itemToGive.count)
                const { tossed, droppedItems } = yield* bot.toss(itemToGive.item, countCanGive)
                droppedItemEntities.push(...droppedItems)
                if (itemToGive instanceof ItemLock) {
                    itemToGive.count -= tossed
                    itemToGive.isUnlocked = itemToGive.count <= 0
                }

                while (args.waitUntilTargetPickedUp && droppedItemEntities.some(v => v.isValid)) {
                    yield* sleepTicks()
                }

                tossedMap.add(itemToGive.item, tossed)
                yield* sleepTicks()
            }
        } finally {
            bot.bot.off('playerCollect', onCollect)
        }

        if (tossedMap.isEmpty) {
            if (itemsToGiveOriginal.length === 1) {
                throw `Don't have ${stringifyItem(itemsToGiveOriginal[0].item)}`
            } else {
                throw `Don't have anything`
            }
        }

        return tossedMap
    },
    id: function(args) {
        return `give-items-${'player' in args ? args.player : args.request.lock.by}-${('items' in args ? args.items : [args.request.lock]).map(v => `${v.count}x${stringifyItem(v.item)}`).join('-')}`
    },
    humanReadableId: function(args) {
        return `Giving items to ${'player' in args ? args.player : args.request.lock.by}`
    },
    definition: 'giveTo',
}
