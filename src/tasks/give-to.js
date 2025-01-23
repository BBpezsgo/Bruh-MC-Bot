'use strict'

const Freq = require('../utils/freq')
const { stringifyItem, isItemEquals, stringifyItemH } = require('../utils/other')
const { wrap, sleepTicks, runtimeArgs } = require('../utils/tasks')
const goto = require('./goto')
const ItemLock = require('../locks/item-lock')
const move = require('./move')
const pickupItem = require('./pickup-item')
const GameError = require('../errors/game-error')

/**
 * @type {import('../task').TaskDef<Freq<import('../utils/other').ItemId>, ({
 *   player: string;
 *   items: ReadonlyArray<{ item: import('../utils/other').ItemId; count: number; } | ItemLock>;
 * } | {
 *   request: import('../environment')['itemRequests'][0];
 * }) & {
 *   waitUntilTargetPickedUp?: boolean;
 * }>}
 */
module.exports = {
    task: function*(bot, args) {
        const tossedMap = new Freq(isItemEquals)

        if (args.interrupt.isCancelled) { return tossedMap }
        if (bot.inventoryItems().isEmpty()) { throw new GameError(`I don't have anything`) }

        let canGiveSomething = false

        const itemsToGive = 'items' in args ? [...args.items] : [args.request.lock]
        const itemsToGiveOriginal = [...itemsToGive]
        const player = 'player' in args ? args.player : args.request.lock.by

        if (player === bot.username) {
            console.warn(`[Bot "${bot.username}"] Giving myself item (???)`)
            if ('request' in args) {
                args.request.status = 'served'
            }
            itemsToGive.filter(v => 'isUnlocked' in v).forEach(v => v.unlock())
            return tossedMap
        }

        for (const itemToGive of itemsToGive) {
            const has = bot.inventoryItemCount(null, itemToGive.item)
            if (!has) { continue }
            canGiveSomething = true
            break
        }

        if (!canGiveSomething) {
            if (itemsToGive.length === 1) {
                throw new GameError(`Don't have ${stringifyItemH(itemsToGive[0].item)}`)
            } else {
                throw new GameError(`Don't have anything`)
            }
        }

        if ('request' in args && !args.request.status) args.request.status = 'on-the-way'

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
            if (!collectedItem) {
                if ('request' in args) args.request.status = 'failed'
                return
            }

            if (collector.username && collector.username === player) {
                console.log(`[Bot "${bot.username}"] The target picked up the item I just dropped`)
                return
            }

            if (collector.username && collector.username === bot.username) {
                if ('request' in args) args.request.status = 'on-the-way'
                itemsToGive.push({
                    item: collectedItem,
                    count: collectedItem.count,
                })
                console.log(`[Bot "${bot.username}"] I picked up the item I just dropped, trying again ...`)
                return
            }

            if (collector.username && bots[collector.username] && 'request' in args && isItemEquals(args.request.lock.item, collectedItem)) {
                const badBot = bots[collector.username]
                const lock = badBot.forceLockItem(player, collectedItem, collectedItem.count)
                if (!lock) {
                    console.warn(`[Bot "${bot.username}"] The bot \"${collector.username}\" picked up the item I just dropped and it aint want to give it back`)
                    args.request.status = 'failed'
                } else {
                    console.log(`[Bot "${bot.username}"] The bot \"${collector.username}\" picked up the item I just dropped so I asked to give it to \"${player}\" ...`)
                    args.request.lock = lock
                    args.request.status = undefined
                }
                return
            }

            console.warn(`[Bot "${bot.username}"] Someone else picked up the item I just dropped ...`)
            if ('request' in args) args.request.status = 'failed'
        }

        bot.bot.on('playerCollect', onCollect)

        try {
            while (itemsToGive.length > 0) {
                /** @type {import('../utils/vec3-dimension')} */
                let target = null

                while (true) {
                    yield

                    target = bot.env.getPlayerPosition(player)
                    if (!target) { throw new GameError(`Can't find ${player}`) }

                    const MAX_DISTANCE = 3
                    const MIN_DISTANCE = 2

                    if (bot.bot.entity.position.distanceTo(target.xyz(bot.dimension)) > MAX_DISTANCE + 1) {
                        yield* goto.task(bot, {
                            point: target,
                            distance: MAX_DISTANCE,
                            ...runtimeArgs(args),
                        })
                    }

                    const alreadyDroppedItem = pickupItem.getClosestItem(bot, v => isItemEquals(v, itemsToGive[0].item), {
                        inAir: true,
                        minLifetime: 0,
                        alsoLocked: true,
                        evenIfFull: true,
                        maxDistance: 4,
                        point: target.xyz(bot.dimension),
                    })
                    if (alreadyDroppedItem) continue

                    if (bot.bot.entity.position.distanceTo(target.xyz(bot.dimension)) > MAX_DISTANCE + 1) continue

                    target = bot.env.getPlayerPosition(player)
                    if (!target) { throw new GameError(`Can't find ${player}`) }

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

                    target = bot.env.getPlayerPosition(player)
                    if (!target) { throw new GameError(`Can't find ${player}`) }
                    
                    if (bot.bot.entity.position.distanceTo(target.xyz(bot.dimension)) > MAX_DISTANCE) continue
                    break
                }

                const itemToGive = itemsToGive.shift()

                const has = bot.inventoryItemCount(null, itemToGive.item)
                if (!has) {
                    if ('request' in args) args.request.status = 'failed'
                    continue
                }

                yield* wrap(bot.bot.lookAt(target.xyz(bot.dimension).offset(0, 0.2, 0), bot.instantLook), args.interrupt)

                const countCanGive = Math.min(has, itemToGive.count)
                const { tossed, droppedItems } = yield* bot.toss(itemToGive.item, countCanGive)

                if ('request' in args) {
                    args.request.itemEntity = droppedItems[0]
                    args.request.status = args.waitUntilTargetPickedUp ? 'dropped' : 'served'
                }

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
                throw new GameError(`Don't have ${stringifyItemH(itemsToGiveOriginal[0].item)}`)
            } else {
                throw new GameError(`Don't have anything`)
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
