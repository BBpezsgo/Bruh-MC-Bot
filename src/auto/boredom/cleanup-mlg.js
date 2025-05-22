const priorities = require('../../priorities')
const tasks = require('../../tasks')

/**
 * @param {import('../../bruh-bot')} bot
 */
module.exports = (bot) => {
    return () => {
        if (bot.tasks.isIdle && bot.memory.mlgJunkBlocks.length > 0) {
            bot.tasks.push(bot, tasks.clearMlgJunk, {}, priorities.cleanup, false, null, false)
            return true
        }

        return false
    }
}