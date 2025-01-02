'use strict'

const { Item } = require('prismarine-item')
const { wrap, sleepTicks, runtimeArgs } = require('../utils/tasks')
const { Timeout, isItemEquals } = require('../utils/other')
const { Block } = require('prismarine-block')
const pickupItem = require('./pickup-item')
const goto = require('./goto')
const Minecraft = require('../minecraft')
const config = require('../config')

/**
 * @param {import('../bruh-bot')} bot
 * @param {Block} composter
 * @param {import('../task').RuntimeArgs<{}>} args
 */
const waitCompost = function*(bot, composter, args) {
    if (Number(composter.getProperties()['level']) === 7) {
        const timeout = new Timeout(2000)
        while (!timeout.done() && Number(composter.getProperties()['level']) !== 8) {
            if (args.interrupt.isCancelled) { return false }
            yield* sleepTicks()
        }
    }

    if (args.interrupt.isCancelled) { return false }

    if (Number(composter.getProperties()['level']) === 8) {
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
        const compostable = Minecraft.compost[typeof trashItem.item === 'string' ? trashItem.item : trashItem.item.name]
        if (!compostable) { continue }
        if (compostable.no && !includeNono) { continue }
        let isSeed = false
        for (const cropBlockName in Minecraft.cropsByBlockName) {
            if (isSeed) { break }
            const crop = Minecraft.cropsByBlockName[cropBlockName]
            isSeed = isItemEquals(crop.seed, trashItem.item)
        }
        if (isSeed && trashItem.count <= 4) { continue }
        const has = bot.searchInventoryItem(null, trashItem.item)
        if (!has) { continue }
        return has
    }
    return null
}

/**
 * @type {import('../task').TaskDef<number>}
 */
module.exports = {
    task: function*(bot, args) {
        if (args.interrupt.isCancelled) { return 0 }
        if (bot.quietMode) { throw `Can't compost in quiet mode` }

        let composted = 0

        let composter = bot.bot.findBlock({
            matching: bot.mc.registry.blocksByName['composter'].id,
            maxDistance: config.compost.composterSearchRadius,
        })

        if (!composter) { throw `There is no composter` }

        while (true) {
            yield

            if (args.interrupt.isCancelled) { break }

            const item = getItem(bot, false)
            if (!item) { break }

            yield* goto.task(bot, {
                block: composter.position,
                ...runtimeArgs(args),
            })

            if (args.interrupt.isCancelled) { break }

            composter = bot.bot.blockAt(composter.position)
            if (composter.type !== bot.mc.registry.blocksByName['composter'].id) {
                throw `Composter destroyed while I was trying to get there`
            }

            yield* waitCompost(bot, composter, args)

            if (args.interrupt.isCancelled) { break }

            yield* wrap(bot.bot.equip(item, 'hand'))
            if (!bot.bot.heldItem) { continue }

            yield* wrap(bot.bot.activateBlock(composter))
            composted++
        }

        if (composted) {
            try {
                yield* pickupItem.task(bot, {
                    point: composter.position,
                    items: ['bonemeal'],
                    inAir: true,
                    maxDistance: 4,
                    ...runtimeArgs(args),
                })
            } catch (error) {
                console.error(`[Bot "${bot.username}"]`, error)
            }
        }

        return composted
    },
    id: 'compost',
    humanReadableId: `Compost`,
    definition: 'compost',
}