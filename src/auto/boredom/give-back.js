const priorities = require('../../priorities')
const tasks = require('../../tasks')
const { Interval } = require('../../utils/other')

/**
 * @param {import('../../bruh-bot')} bot
 */
module.exports = (bot) => {
    const giveBackItemsInterval = new Interval(5000)

    return () => {
        if (giveBackItemsInterval.done() && bot.memory.playerDeathLoots.length > 0 && bot.tasks.timeSinceImportantTask > 10000) {
            const playerDeath = bot.memory.playerDeathLoots[0]
            for (let i = 0; i < playerDeath.items.length; i++) {
                if (playerDeath.items[i].count <= 0 || playerDeath.items[i].isUnlocked) {
                    playerDeath.items.splice(i, 1)
                    i--
                }
            }
            if (playerDeath.items.length === 0) {
                bot.memory.playerDeathLoots.shift()
            } else {
                bot.tasks.push(bot, tasks.giveTo, {
                    player: playerDeath.username,
                    items: playerDeath.items,
                }, priorities.low - 1, false, null, false)
                    ?.wait()
                    .catch(error => {
                        // TODO: better way of handling this
                        if (String(error).replace('Error: ', '').startsWith(`Don't have`)) {
                            playerDeath.items.forEach(v => v.unlock())
                        }
                    })
            }
        }
        
        return false
    }
}