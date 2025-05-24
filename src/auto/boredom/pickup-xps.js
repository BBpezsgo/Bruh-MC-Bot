const config = require('../../config')
const priorities = require('../../priorities')
const tasks = require('../../tasks')

/**
 * @param {import('../../bruh-bot')} bot
 */
module.exports = (bot) => {
    /** @type {import('../../managed-task').TaskArgs<import('../../tasks/pickup-xp')>} */
    const options = {
        maxDistance: config.boredom.pickupXpRadius,
    }

    return () => {
        if (bot.tasks.timeSinceImportantTask > 3000 && tasks.pickupXp.getClosestXp(bot, options)) {
            bot.tasks.push(bot, tasks.pickupXp, options, priorities.low, false, null, false)
                ?.wait()
                .then(() => console.log(`[Bot "${bot.username}"] XPs picked up`))
                .catch(() => { })
        }

        return false
    }
}