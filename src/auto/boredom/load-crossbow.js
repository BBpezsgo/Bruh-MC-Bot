const priorities = require('../../priorities')
const tasks = require('../../tasks')
const { Interval } = require('../../utils/other')
const taskUtils = require('../../utils/tasks')

/**
 * @param {import('../../bruh-bot')} bot
 */
module.exports = (bot) => {
    const loadCrossbowsInterval = new Interval(5000)

    return () => {
        if (loadCrossbowsInterval.done() && bot.tasks.timeSinceImportantTask > 5000) {
            bot.tasks.push(bot, {
                task: function*(bot, args) {
                    const crossbows =
                        bot.inventory.inventoryItems(null)
                            .filter(v => v.name === 'crossbow')
                            .toArray()
                    // console.log(`[Bot "${bot.username}"] Loading ${crossbows.length} crossbows`)
                    for (const crossbow of crossbows) {
                        if (!tasks.attack.isCrossbowCharged(crossbow) &&
                            bot.inventory.searchInventoryItem(null, 'arrow')) {
                            const weapon = tasks.attack.resolveRangeWeapon(crossbow)
                            yield* taskUtils.wrap(bot.bot.equip(crossbow, 'hand'), args.interrupt)
                            bot.activateHand('right')
                            yield* taskUtils.sleepG(Math.max(100, weapon.chargeTime))
                            bot.deactivateHand()
                        }
                    }
                },
                id: 'load-crossbow',
            }, {
                silent: true,
            }, priorities.low, false, null, false)
        }

        return false
    }
}