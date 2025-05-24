const { Interval } = require('../../utils/other')

/**
 * @param {import('../../bruh-bot')} bot
 */
module.exports = (bot) => {
    const clearHandInterval = new Interval(5000)

    return () => {
        if (bot.bot.heldItem && clearHandInterval?.done() && bot.tasks.isIdleOrThinking && (bot.tasks.timeSinceImportantTask > 1000 || bot.isFollowingButNotMoving)) {
            bot.inventory.tryUnequip()
                .then(() => { })
                .catch(v => console.error(`[Bot "${bot.username}"]`, v))
            return true
        }

        return false
    }
}