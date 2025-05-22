const tasks = require('../../tasks')

/**
 * @param {import('../../bruh-bot')} bot
 */
module.exports = (bot) => {
    return () => {
        if (bot.tasks.timeSinceImportantTask > 10000 &&
            bot.tasks.isIdleOrThinking &&
            bot.memory.idlePosition &&
            bot.dimension === bot.memory.idlePosition.dimension &&
            bot.bot.entity.position.distanceTo(bot.memory.idlePosition.xyz(bot.dimension)) > 10) {
            bot.tasks.push(bot, {
                task: tasks.goto.task,
                id: `goto-idle-position`,
                humanReadableId: `Goto idle position`,
            }, {
                point: bot.memory.idlePosition,
                distance: 4,
                options: {
                    sprint: false,
                },
            }, -999, false, null, false)
        }

        return false
    }
}