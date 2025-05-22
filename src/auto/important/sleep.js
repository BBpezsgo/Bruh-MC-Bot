const tasks = require('../../tasks')
const priorities = require('../../priorities')
const { Interval } = require('../../utils/other')

/**
 * @param {import('../../bruh-bot')} bot
 */
module.exports = (bot) => {
    const trySleepInterval = new Interval(5000)

    return () => {
        if (trySleepInterval.done() && tasks.sleep.can(bot)) {
            bot.tasks.push(bot, tasks.sleep, {}, priorities.low + 1, false, null, false)
        }

        return false
    }
}