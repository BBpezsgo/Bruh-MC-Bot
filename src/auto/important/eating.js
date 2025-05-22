const tasks = require('../../tasks')
const priorities = require('../../priorities')

/**
 * @param {import('../../bruh-bot')} bot
 */
module.exports = (bot) => {
    return () => {
        if (bot.bot.food < 18 && tasks.eat.can(bot, { includeLocked: bot.bot.food === 0 })) {
            bot.tasks.push(bot, tasks.eat, {
                sortBy: 'foodPoints',
                includeLocked: bot.bot.food === 0,
            }, priorities.surviving, false, null, false)
            return true
        }

        return false
    }
}