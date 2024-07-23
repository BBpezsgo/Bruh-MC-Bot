const { Vec3 } = require('vec3')
const { sleepG, wrap } = require('../utils/tasks')
const goto = require('./goto')

/**
 * @param {import('../bruh-bot')} bot
 * @param {Array<Vec3>} fullChests
 * @returns {import('prismarine-block').Block | null}
 */
function getChest(bot, fullChests) {
    for (const myChest of bot.memory.myChests) {
        const myChestBlock = bot.bot.blockAt(myChest, true)
        if (myChestBlock && myChestBlock.type === bot.mc.data.blocksByName['chest'].id) {
            return myChestBlock
        }
    }
    return bot.bot.findBlock({
        matching: bot.mc.data.blocksByName['chest'].id,
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
 * @typedef {{ item: string; count: number; }} CountedItem
 */

/**
 * @type {import('../task').TaskDef<boolean, { items: ReadonlyArray<CountedItem> }>}
 */
module.exports = {
    task: function*(bot, args) {
        if (bot.quietMode) {
            throw `Can't open chest in quiet mode`
        }

        if (args.items.length === 0) {
            return false
        }

        /**
         * @type {Record<string, number>}
         */
        const originalCount = { }
        for (const item of args.items) {
            originalCount[item.item] ??= 0
            originalCount[item.item] += item.count
        }
        const fullChests = [ ]

        const BruhBot = require('../bruh-bot')
        
        while (true) {
            yield

            let chestBlock = null
            let tryCount = 0
            while (!chestBlock) {
                yield
                tryCount++

                chestBlock = getChest(bot, fullChests)
                if (!chestBlock && tryCount > 5) {
                    throw `There is no chest`
                }
                const chestPosition = chestBlock.position
        
                if (chestBlock) {
                    yield* goto.task(bot, {
                        destination: chestPosition.clone(),
                        range: 3,
                        avoidOccupiedDestinations: true,
                    })
                    chestBlock = bot.bot.blockAt(chestPosition.clone())
                }
            }

            const chest = yield* wrap(bot.bot.openChest(chestBlock))
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
                        bot.memory.myChests.push(chestBlock.position.clone())
                    }
                }
        
                for (const itemToDeposit of args.items) {
                    const have = bot.itemCount(itemToDeposit.item)
                    if (have === 0) {
                        return true
                    }
                    const count = Math.max((itemToDeposit.count === Infinity) ? (bot.itemCount(itemToDeposit.item)) : (itemToDeposit.count - (originalCount[itemToDeposit.item] - bot.itemCount(itemToDeposit.item))), bot.mc.data.itemsByName[itemToDeposit.item].stackSize, have)
                    if (count === 0) {
                        return true
                    }
    
                    if (BruhBot.firstFreeSlot(chest, itemToDeposit.item) === null) {
                        fullChests.push(chestBlock.position.clone())
                        break
                    } else {
                        yield* bot.env.chestDeposit(bot, chest, chestBlock.position.clone(), itemToDeposit.item, count)
                    }
                }
            } finally {
                yield* sleepG(100)
                chest.close()
                yield* sleepG(100)
            }
        }
    },
    id: function(args) {
        return `dump`
    },
    humanReadableId: function(args) {
        return `Dump items`
    },
}
