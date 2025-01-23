'use strict'

const goto = require('./goto')
const Freq = require('../utils/freq')
const { isItemEquals } = require('../utils/other')
const { runtimeArgs } = require('../utils/tasks')
const Vec3Dimension = require('../utils/vec3-dimension')
const GameError = require('../errors/game-error')
const PermissionError = require('../errors/permission-error')

/**
 * @type {import('../task').TaskDef<Freq<import('../utils/other').ItemId>, {
 *   items: ReadonlyArray<{ item: import('../utils/other').ItemId; count: number; }>
 * }>}
 */
module.exports = {
    task: function*(bot, args) {
        const dumped = new Freq(isItemEquals)
        if (args.items.length === 0) { return dumped }
        if (bot.quietMode) { throw new PermissionError(`Can't open chest in quiet mode`) }

        while (true) {
            yield

            if (!args.items.some(v => bot.inventoryItemCount(null, v.item))) break

            let chestBlock = null
            let searchChestFailCount = 0
            let allChestsFull = false
            while (!chestBlock) {
                yield
                searchChestFailCount++

                for (const chest of bot.env.chests) {
                    if (chest.position.dimension !== bot.dimension) continue
                    if (bot.env.isChestFull(bot.mc.registry, chest)) {
                        allChestsFull = true
                        continue
                    }
                    chestBlock = bot.bot.blockAt(chest.position.xyz(bot.dimension), true)
                }

                if (!chestBlock) { break }

                const chestPosition = chestBlock.position
                yield* goto.task(bot, {
                    block: chestPosition,
                    ...runtimeArgs(args),
                })
                chestBlock = bot.bot.blockAt(chestPosition.clone())
                if (chestBlock && chestBlock.name !== 'chest') {
                    chestBlock = null
                    continue
                }
            }

            if (!chestBlock) { throw allChestsFull ? `All chests full` : `There is no chest` }

            const remainingItemsToDump = args.items.map(v => ({ item: v.item, count: v.count }))

            const lock = yield* bot.env.waitLock(bot.username, new Vec3Dimension(chestBlock.position, bot.dimension), 'use')

            /** @type {import('mineflayer').Chest} */
            let chest = null

            /**
             * @param {import('../utils/interrupt').InterruptType} type
             */
            const cleanup = (type) => {
                if (type === 'cancel') {
                    lock.unlock()
                    chest?.close()
                    chest = null
                }
            }

            args.interrupt.on(cleanup)

            try {
                chest = yield* bot.openChest(chestBlock)
                while (remainingItemsToDump.some(v => v.count > 0)) {
                    let totalDeposited = 0

                    for (let i = 0; i < remainingItemsToDump.length; i++) {
                        const itemToDump = remainingItemsToDump[i]
                        if (itemToDump.count <= 0) continue

                        if (bot.firstFreeContainerSlot(chest, itemToDump.item) === null) continue

                        const deposited = yield* bot.chestDeposit(
                            chest,
                            chestBlock.position,
                            itemToDump.item,
                            itemToDump.count)
                        dumped.add(itemToDump.item, deposited)
                        itemToDump.count -= deposited
                        if (itemToDump.count <= 0) {
                            if (itemToDump.count < 0) console.warn(`[Bot "${bot.username}"] More items was dumpted than had to`)
                            remainingItemsToDump.splice(i, 1)
                            i--
                        }
                        totalDeposited += deposited
                    }

                    if (!totalDeposited) break

                    yield
                }
            } finally {
                lock.unlock()
                chest?.close()
                args.interrupt.off(cleanup)
            }
        }

        return dumped
    },
    id: `dump`,
    humanReadableId: `Dump items`,
    definition: 'dumpToChest',
}
