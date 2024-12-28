'use strict'

const { Vec3 } = require('vec3')
const { sleepG } = require('../utils/tasks')
const goto = require('./goto')
const Vec3Dimension = require('../vec3-dimension')
const { stringifyItem } = require('../utils/other')

/**
 * @param {import('../bruh-bot')} bot
 * @param {Array<Vec3>} fullChests
 * @returns {import('prismarine-block').Block | null}
 */
function getChest(bot, fullChests) {
    for (const myChest of bot.memory.myChests) {
        if (myChest.dimension !== bot.dimension) { continue }
        if (fullChests.some(v => v.equals(myChest.xyz(bot.dimension)))) { continue }
        const myChestBlock = bot.bot.blockAt(myChest.xyz(bot.dimension), true)
        if (myChestBlock && myChestBlock.type === bot.mc.registry.blocksByName['chest'].id) {
            return myChestBlock
        }
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
 * @type {import('../task').TaskDef<boolean, { items: ReadonlyArray<{ item: import('../utils/other').ItemId; count: number; }> }>}
 */
module.exports = {
    task: function*(bot, args) {
        if (bot.quietMode) { throw `Can't open chest in quiet mode` }

        if (args.items.length === 0) { return false }

        const fullChests = []

        while (true) {
            yield

            if (!args.items.some(v => bot.inventoryItemCount(null, v.item))) { break }

            let chestBlock = null

            {
                let tryCount = 0
                while (!chestBlock) {
                    yield
                    tryCount++

                    chestBlock = getChest(bot, fullChests)
                    if (!chestBlock) {
                        if (tryCount > 5) { throw `There is no chest` }
                        continue
                    }

                    const chestPosition = chestBlock.position
                    yield* goto.task(bot, {
                        block: chestPosition,
                    })
                    chestBlock = bot.bot.blockAt(chestPosition.clone())
                }
            }

            const chest = yield* bot.openChest(chestBlock)

            try {
                {
                    let isNewChest = true
                    for (const myChest of bot.memory.myChests) {
                        if (myChest.equals(chestBlock.position)) {
                            isNewChest = false
                            break
                        }
                    }

                    if (isNewChest) {
                        bot.memory.myChests.push(new Vec3Dimension(chestBlock.position, bot.dimension))
                    }
                }

                while (true) {
                    yield

                    let shouldBreak = true
                    for (const itemToDeposit of args.items) {
                        yield
                        if (bot.firstFreeContainerSlot(chest, itemToDeposit.item) === null) {
                            fullChests.push(chestBlock.position.clone())
                            shouldBreak = true
                            break
                        }

                        try {
                            const deposited = yield* bot.chestDeposit(
                                chest,
                                chestBlock.position,
                                itemToDeposit.item,
                                itemToDeposit.count)
                            shouldBreak = !deposited
                        } catch (error) {
                            if (error instanceof Error) {
                                console.warn(`[Bot \"${bot.username}\"] Can't dump ${stringifyItem(itemToDeposit.item)}: ${error.message}`)
                            } else {
                                console.warn(`[Bot \"${bot.username}\"] Can't dump ${stringifyItem(itemToDeposit.item)}: ${error}`)
                            }
                        }
                    }

                    if (shouldBreak) { break }
                }
            } finally {
                yield* sleepG(20)
                chest.close()
                yield* sleepG(20)
            }
        }

        return true
    },
    id: `dump`,
    humanReadableId: `Dump items`,
    definition: 'dumpToChest',
}
