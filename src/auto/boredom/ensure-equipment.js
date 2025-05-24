const BruhBot = require('../../bruh-bot')
const priorities = require('../../priorities')
const { Interval } = require('../../utils/other')

/**
 * @param {import('../../bruh-bot')} bot
 */
module.exports = (bot) => {
    const ensureEquipmentInterval = new Interval(60000)

    return () => {
        if (bot.tasks.isIdle && bot.tasks.timeSinceImportantTask > 10000 && ensureEquipmentInterval.done()) {
            bot.tasks.push(bot, {
                task: BruhBot.ensureEquipment,
                id: 'ensure-equipment',
                humanReadableId: 'Ensure equipment',
            }, {
                explicit: false,
            }, priorities.unnecessary, false, null, false)
        }
        return false
    }
}