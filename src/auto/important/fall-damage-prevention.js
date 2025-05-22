const tasks = require('../../tasks')
const Minecraft = require('../../minecraft')
const priorities = require('../../priorities')

/**
 * @param {import('../../bruh-bot')} bot
 */
module.exports = (bot) => {
    return () => {
        if (bot.bot.entity.velocity.y < Minecraft.general.fallDamageVelocity) {
            bot.tasks.tick()
            bot.tasks.push(bot, tasks.mlg, {}, priorities.critical, false, null, false)
            return true
        }

        return false
    }
}