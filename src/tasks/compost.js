const { Item } = require('prismarine-item')
const { wrap, sleepTicks } = require('../utils/tasks')
const { Timeout } = require('../utils/other')
const { Block } = require('prismarine-block')
const pickupItem = require('./pickup-item')
const goto = require('./goto')
const Minecraft = require('../minecraft')

/**
 * @param {import('../bruh-bot')} bot
 * @param {Block} composter
 */
const waitCompost = function*(bot, composter) {
    if (composter.getProperties()['level'] === 7) {
        const timeout = new Timeout(2000)
        while (!timeout.done() && composter.getProperties()['level'] !== 8) {
            yield* sleepTicks()
        }
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
    const trashItems = bot.getTrashItems()
    for (const trashItem of trashItems) {
        const compostable = Minecraft.compost[trashItem.name]
        if (!compostable) { continue }
        if (compostable.no && !includeNono) { continue }
        let isSeed = false
        for (const cropBlockName in Minecraft.cropsByBlockName) {
            if (isSeed) { break }
            const crop = Minecraft.cropsByBlockName[cropBlockName]
            switch (crop.type) {
                case 'seeded':
                case 'simple':
                case 'spread':
                case 'grows_fruit':
                case 'grows_block': {
                    isSeed = crop.seed === trashItem.name
                    break
                }
                case 'tree': {
                    isSeed = crop.sapling === trashItem.name
                    break
                }
                default: break
            }
        }
        if (isSeed && trashItem.count <= 4) { continue }
        const has = bot.searchItem(trashItem.name)
        if (!has) { continue }
        return has
    }
    return null
}

/**
 * @type {import('../task').TaskDef<number>}
 */
module.exports = {
    task: function*(bot) {
        if (bot.quietMode) {
            throw `Can't compost in quiet mode`
        }

        let composted = 0

        let composter = bot.bot.findBlock({
            matching: bot.mc.registry.blocksByName['composter'].id,
            maxDistance: 32,
        })

        if (!composter) {
            throw `There is no composter`
        }

        while (true) {
            yield
            const item = getItem(bot, false)
            if (!item) {
                break
            }

            yield* goto.task(bot, {
                block: composter.position,
            })

            composter = bot.bot.blockAt(composter.position)
            if (composter.type !== bot.mc.registry.blocksByName['composter'].id) {
                throw `Composter destroyed while I was trying to get there`
            }

            yield* waitCompost(bot, composter)

            yield* wrap(bot.bot.equip(item, 'hand'))
            if (!bot.bot.heldItem) { continue }

            yield* wrap(bot.bot.activateBlock(composter))
            composted++
        }

        yield* pickupItem.task(bot, {
            point: composter.position,
            inAir: false,
            maxDistance: 4,
        })

        return composted
    },
    id: function() {
        return 'compost'
    },
    humanReadableId: function() {
        return `Compost`
    },
    definition: 'compost',
}