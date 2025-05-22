'use strict'

const { Item } = require('prismarine-item')
const { wrap, sleepTicks, runtimeArgs } = require('../utils/tasks')
const { Timeout, isItemEquals } = require('../utils/other')
const { Block } = require('prismarine-block')
const pickupItem = require('./pickup-item')
const goto = require('./goto')
const Minecraft = require('../minecraft')
const config = require('../config')
const Vec3Dimension = require('../utils/vec3-dimension')
const GameError = require('../errors/game-error')
const PermissionError = require('../errors/permission-error')
const EnvironmentError = require('../errors/environment-error')

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
        yield* wrap(bot.bot.unequip('hand'), args.interrupt)
        yield* wrap(bot.bot.activateBlock(composter), args.interrupt)
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
    const trashItems = bot.inventory.getTrashItems()
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
        const has = bot.inventory.searchInventoryItem(null, trashItem.item)
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
        if (bot.quietMode) { throw new PermissionError(`Can't compost in quiet mode`) }

        let composted = 0

        let composter = bot.bot.findBlock({
            matching: bot.mc.registry.blocksByName['composter'].id,
            maxDistance: config.compost.composterSearchRadius,
        })

        if (!composter) { throw new EnvironmentError(`There is no composter`) }

        args.task?.blur()
        const blockLock = yield* bot.env.waitLock(bot.username, new Vec3Dimension(composter.position, bot.dimension), 'use')
        args.task?.focus()

        try {
            while (true) {
                yield

                const item = getItem(bot, false)
                if (!item) { break }

                yield* goto.task(bot, {
                    block: composter.position,
                    ...runtimeArgs(args),
                })

                composter = bot.bot.blockAt(composter.position)
                if (!composter) { throw new EnvironmentError(`Composter destroyed while I was trying to get there`) }

                yield* waitCompost(bot, composter, args)

                yield* wrap(bot.bot.equip(item, 'hand'), args.interrupt)
                if (!bot.bot.heldItem) { continue }

                yield* wrap(bot.bot.activateBlock(composter), args.interrupt)
                composted++
            }
        } finally {
            blockLock.unlock()
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
