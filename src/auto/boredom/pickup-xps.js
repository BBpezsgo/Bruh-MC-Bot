const config = require('../../config')
const priorities = require('../../priorities')
const tasks = require('../../tasks')

/**
 * @param {import('../../bruh-bot')} bot
 */
module.exports = (bot) => {
    return () => {
        /** @type {import('../../managed-task').TaskArgs<import('../../tasks/pickup-xp')>} */
        const options = {
            maxDistance: config.boredom.pickupXpRadius,
        }
        if (tasks.pickupXp.getClosestXp(bot, options)) {
            bot.tasks.push(bot, tasks.pickupXp, options, priorities.low, false, null, false)
        }

        return false
    }
}