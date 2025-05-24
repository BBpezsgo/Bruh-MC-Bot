const BruhBot = require('../../bruh-bot')
const priorities = require('../../priorities')
const { Interval } = require('../../utils/other')

/**
 * @param {import('../../bruh-bot')} bot
 */
module.exports = (bot) => {
    const breedAnimalsInterval = new Interval(60000)

    return () => {
        if (bot.tasks.isIdle && breedAnimalsInterval.done() && bot.tasks.timeSinceImportantTask > 10000) {
            bot.tasks.push(bot, {
                task: BruhBot.breedAnimals,
                id: `breed-animals`,
                humanReadableId: `Breed animals`,
            }, {}, priorities.unnecessary, false, null, false)
                ?.wait()
                .then(() => console.log(`[Bot "${bot.username}"] Animals fed`))
                .catch(() => { })
        }

        return false
    }
}