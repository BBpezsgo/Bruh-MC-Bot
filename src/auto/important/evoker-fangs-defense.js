const tasks = require('../../tasks')
const priorities = require('../../priorities')

/**
 * @param {import('../../bruh-bot')} bot
 */
module.exports = (bot) => {
    return () => {
        bot.bot.nearestEntity(e => {
            if (Math.distanceSquared(e.position, bot.bot.entity.position) > 1) return false
            if (e.name !== 'evoker_fangs') return false

            bot.tasks.push(bot, tasks.goto, {
                flee: e,
                distance: 2,
                options: {
                    timeout: 300,
                    sprint: true,
                    retryCount: 10,
                },
            }, priorities.critical, false, null, false)
            return true
        })

        return false
    }
}