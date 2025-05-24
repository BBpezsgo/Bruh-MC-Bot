const config = require('../../config')
const priorities = require('../../priorities')
const tasks = require('../../tasks')

/**
 * @param {import('../../bruh-bot')} bot
 */
module.exports = (bot) => {
    /** @type {import('../../managed-task').TaskArgs<import('../../tasks/pickup-item')>} */
    const options = {
        inAir: false,
        maxDistance: config.boredom.pickupItemRadius,
        minLifetime: config.boredom.pickupItemMinAge,
        pathfinderOptions: {
            savePathError: true,
        },
    }

    return () => {
        if (bot.tasks.timeSinceImportantTask > 3000 && tasks.pickupItem.can(bot, options)) {
            bot.tasks.push(bot, tasks.pickupItem, options, priorities.low, false, null, false)
                ?.wait()
                .then(() => console.log(`[Bot "${bot.username}"] Items picked up`))
                .catch(() => { })
        }

        return false
    }
}