'use strict'

const { Vec3 } = require('vec3')
const goto = require('./goto')
const Freq = require('../utils/freq')
const { isItemEquals } = require('../utils/other')

/**
 * @param {import('../bruh-bot')} bot
 * @param {Array<Vec3>} fullChests
 * @returns {import('prismarine-block').Block | null}
 */
function getChest(bot, fullChests) {
    for (const chest of bot.env.chests) {
        if (chest.position.dimension !== bot.dimension) { continue }
        if (fullChests.some(v => v.equals(chest.position.xyz(bot.dimension)))) { continue }
        const chestBlock = bot.bot.blockAt(chest.position.xyz(bot.dimension), true)
        if (!chestBlock) { continue }
        if (chestBlock.name !== 'chest') {
            bot.env.deleteChest(chest.position)
            continue
        }
        return chestBlock
    }
    return bot.bot.findBlock({
        matching: bot.mc.registry.blocksByName['chest'].id,
        useExtraInfo: (block) => {
            if (fullChests.some(v => v.equals(block.position))) { return false }
            return true
        }
    })
}

/**
 * @type {import('../task').TaskDef<Freq<import('../utils/other').ItemId>, {
 *   items: ReadonlyArray<{ item: import('../utils/other').ItemId; count: number; }>
 * }>}
 */
module.exports = {
    task: function*(bot, args) {
        const dumped = new Freq(isItemEquals)

        if (args.interrupt.isCancelled) { return dumped }
        if (bot.quietMode) { throw `Can't open chest in quiet mode` }

        if (args.items.length === 0) { return dumped }

        const fullChests = []

        while (true) {
            yield

            if (args.interrupt.isCancelled) { break }

            if (!args.items.some(v => bot.inventoryItemCount(null, v.item))) { break }

            let chestBlock = null

            {
                let tryCount = 0
                while (!chestBlock) {
                    yield
                    tryCount++

                    if (args.interrupt.isCancelled) { break }

                    chestBlock = getChest(bot, fullChests)
                    if (!chestBlock) {
                        if (tryCount > 5) { throw `There is no chest` }
                        continue
                    }

                    const chestPosition = chestBlock.position
                    yield* goto.task(bot, {
                        block: chestPosition,
                        interrupt: args.interrupt,
                    })
                    chestBlock = bot.bot.blockAt(chestPosition.clone())
                }
            }

            const remainingItemsToDump = args.items.map(v => ({ item: v.item, count: v.count }))

            if (args.interrupt.isCancelled) { break }

            const chest = yield* bot.openChest(chestBlock)

            try {
                while (remainingItemsToDump.some(v => v.count > 0)) {
                    if (args.interrupt.isCancelled) { break }

                    let chestIsFull = false
                    let notDeposited = true

                    for (let i = 0; i < remainingItemsToDump.length; i++) {
                        const itemToDump = remainingItemsToDump[i]

                        if (args.interrupt.isCancelled) { break }

                        if (bot.firstFreeContainerSlot(chest, itemToDump.item) === null) {
                            fullChests.push(chestBlock.position.clone())
                            chestIsFull = true
                            break
                        }

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
                        if (deposited === 0) { notDeposited = false }
                    }

                    if (notDeposited || chestIsFull) { break }

                    yield
                }
            } finally {
                chest.close()
            }
        }

        return dumped
    },
    id: `dump`,
    humanReadableId: `Dump items`,
    definition: 'dumpToChest',
}
