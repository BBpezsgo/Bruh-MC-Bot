const BruhBot = require('../../bruh-bot')
const priorities = require('../../priorities')
const { Interval } = require('../../utils/other')

/**
 * @param {import('../../bruh-bot')} bot
 */
module.exports = (bot) => {
    const tryAutoHarvestInterval = new Interval(60000)

    return () => {
        if (bot.tasks.isIdle && tryAutoHarvestInterval.done()) {
            bot.tasks.push(bot, {
                task: BruhBot.tryHarvestCrops,
                id: `harvest-crops`,
                humanReadableId: 'Harvest crops',
            }, {}, priorities.unnecessary, false, null, false)
        }
        return false
    }
}