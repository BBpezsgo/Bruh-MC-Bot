const BruhBot = require('../../bruh-bot')
const priorities = require('../../priorities')
const { Interval } = require('../../utils/other')

/**
 * @param {import('../../bruh-bot')} bot
 */
module.exports = (bot) => {
    const tryRestoreCropsInterval = new Interval(60000)

    return () => {
        if (bot.tasks.isIdle && bot.tasks.timeSinceImportantTask > 10000 && tryRestoreCropsInterval.done()) {
            bot.tasks.push(bot, {
                task: BruhBot.tryRestoreCrops,
                id: `check-crops`,
                humanReadableId: `Checking crops`,
            }, {
                silent: true
            }, priorities.unnecessary, false, null, false)
                ?.wait()
                .then(() => console.log(`[Bot "${bot.username}"] Crops restored`))
                .catch(() => { })
        }
        return false
    }
}