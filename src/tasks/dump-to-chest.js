const { Vec3 } = require('vec3')
const { sleepG } = require('../utils/tasks')
const goto = require('./goto')
const Vec3Dimension = require('../vec3-dimension')

/**
 * @param {import('../bruh-bot')} bot
 * @param {Array<Vec3>} fullChests
 * @returns {import('prismarine-block').Block | null}
 */
function getChest(bot, fullChests) {
    for (const myChest of bot.memory.myChests) {
        if (myChest.dimension !== bot.dimension) { continue }
        const myChestBlock = bot.bot.blockAt(myChest.xyz(bot.dimension), true)
        if (myChestBlock && myChestBlock.type === bot.mc.registry.blocksByName['chest'].id) {
            return myChestBlock
        }
    }
    return bot.bot.findBlock({
        matching: bot.mc.registry.blocksByName['chest'].id,
        useExtraInfo: (block) => {
            for (const fullChest of fullChests) {
                if (fullChest.equals(block.position)) {
                    return false
                }
            }
            return true
        }
    })
}

/**
 * @typedef {{ name: string; nbt?: import('../bruh-bot').NBT; count: number; }} CountedItem
 */

/**
 * @type {import('../task').TaskDef<boolean, { items: ReadonlyArray<CountedItem> }>}
 */
module.exports = {
    task: function*(bot, args) {
        if (bot.quietMode) { throw `Can't open chest in quiet mode` }

        if (args.items.length === 0) { return false }

        /**
         * @type {Record<string, number>}
         */
        const originalCount = {}
        for (const item of args.items) {
            originalCount[item.name] ??= 0
            originalCount[item.name] += item.count
        }
        const fullChests = []

        while (true) {
            yield

            if (!args.items.some(v => bot.inventoryItemCount(null, v))) { break }

            let chestBlock = null

            {
                let tryCount = 0
                while (!chestBlock) {
                    yield
                    tryCount++

                    chestBlock = getChest(bot, fullChests)
                    if (!chestBlock && tryCount > 5) { throw `There is no chest` }
                    const chestPosition = chestBlock.position

                    if (chestBlock) {
                        yield* goto.task(bot, {
                            block: chestPosition,
                        })
                        chestBlock = bot.bot.blockAt(chestPosition.clone())
                    }
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
                        if (bot.firstFreeContainerSlot(chest, itemToDeposit) === null) {
                            fullChests.push(chestBlock.position.clone())
                            shouldBreak = true
                            break
                        }

                        const deposited = yield* bot.chestDeposit(
                            chest,
                            chestBlock.position,
                            itemToDeposit,
                            itemToDeposit.count)
                        shouldBreak = !deposited
                    }

                    if (shouldBreak) { break }
                }
            } finally {
                yield* sleepG(100)
                chest.close()
                yield* sleepG(100)
            }
        }

        return true
    },
    id: `dump`,
    humanReadableId: `Dump items`,
    definition: 'dumpToChest',
}
