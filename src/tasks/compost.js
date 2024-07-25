const { Item } = require('prismarine-item')
const { wrap, sleepG } = require('../utils/tasks')
const { Timeout } = require('../utils/other')
const { Block } = require('prismarine-block')
const pickupItem = require('./pickup-item')
const goto = require('./goto')

/**
 * @param {import('../bruh-bot')} bot
 * @param {Block} composter
 */
const waitCompost = function*(bot, composter) {
    if (composter.getProperties()['level'] === 7) {
        const timeout = new Timeout(2000)
        while (!timeout.done() && composter.getProperties()['level'] !== 8) {
            yield* sleepG(500)
        }

        yield* wrap(bot.bot.unequip('hand'))
        yield* wrap(bot.bot.activateBlock(composter))
        return true
    }
    
    if (composter.getProperties()['level'] === 8) {
        yield* wrap(bot.bot.unequip('hand'))
        yield* wrap(bot.bot.activateBlock(composter))
        return true
    }

    return false
}

/**
 * @param {import('../bruh-bot')} bot
 * @param {boolean} includeNono
 * @returns {Item | null}
 */
const getItem = function(bot, includeNono) {
    for (const compostable in bot.mc.data2.compost) {
        if (bot.mc.data2.compost[compostable].no &&
            !includeNono) {
            continue
        }
        const compostableId = bot.mc.data.itemsByName[compostable]?.id
        if (!compostableId) { continue }
        const item = bot.searchItem(compostableId)
        if (item) {
            return item
        }
    }
    return null
}

/**
 * @type {import('../task').TaskDef<number, { }>}
 */
module.exports = {
    task: function*(bot, args) {
        if (bot.quietMode) {
            throw `Can't compost in quiet mode`
        }
    
        let composted = 0

        while (true) {
            const item = getItem(bot, false)
            if (!item) {
                break
            }
    
            let composter = bot.bot.findBlock({
                matching: bot.mc.data.blocksByName['composter'].id,
                maxDistance: 32,
            })
    
            if (!composter) {
                throw `There is no composter`
            }
    
            yield* goto.task(bot, {
                block: composter.position.clone(),
            })
    
            composter = bot.bot.blockAt(composter.position)
            if (composter.type !== bot.mc.data.blocksByName['composter'].id) {
                throw `Composter destroyed while I was trying to get there`
            }
    
            yield* waitCompost(bot, composter)
    
            yield* wrap(bot.bot.equip(item, 'hand'))
            if (!bot.bot.heldItem) {
                continue
            }
    
            yield* wrap(bot.bot.activateBlock(composter))
            composted++
    
            yield* waitCompost(bot, composter)
        }
    
        yield* pickupItem.task(bot, {
            inAir: false,
            maxDistance: 4,
        })
    
        return composted
    },
    id: function(args) {
        return 'compost'
    },
    humanReadableId: function(args) {
        return `Compost`
    },
}