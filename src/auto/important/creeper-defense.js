const tasks = require('../../tasks')
const priorities = require('../../priorities')

/**
 * @param {import('../../bruh-bot')} bot
 */
module.exports = (bot) => {
    return () => {
        const explodingCreeper = bot.env.getExplodingCreeper(bot)

        if (explodingCreeper) {
            bot.tasks.push(bot, tasks.goto, {
                flee: explodingCreeper,
                distance: 8,
                options: {
                    timeout: 300,
                    sprint: true,
                    retryCount: 10,
                },
            }, priorities.critical, false, null, false)
            return true
        }

        const creeper = bot.bot.nearestEntity((entity) => entity.name === 'creeper')
        if (creeper && bot.bot.entity.position.distanceTo(creeper.position) < 3) {
            bot.tasks.push(bot, tasks.goto, {
                flee: creeper,
                distance: 8,
                options: {
                    timeout: 300,
                    sprint: true,
                },
            }, priorities.critical - 1, false, null, false)
            return true
        }

        return false
    }
}