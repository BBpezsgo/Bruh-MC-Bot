const { Interval } = require('../../utils/other')

/**
 * @param {import('../../bruh-bot')} bot
 */
module.exports = (bot) => {
    const checkQuietInterval = new Interval(500)

    return () => {
        if (checkQuietInterval.done()) {
            let shouldBeQuiet = false

            if (!shouldBeQuiet && bot.bot.findBlock({
                matching: bot.mc.registry.blocksByName['sculk_sensor'].id,
                maxDistance: 8,
                count: 1,
                point: bot.bot.entity.position,
                useExtraInfo: false,
            })) { shouldBeQuiet = true }

            if (!shouldBeQuiet && bot.bot.findBlock({
                matching: bot.mc.registry.blocksByName['calibrated_sculk_sensor'].id,
                maxDistance: 16,
                count: 1,
                point: bot.bot.entity.position,
                useExtraInfo: false,
            })) { shouldBeQuiet = true }

            if (!shouldBeQuiet && bot.bot.nearestEntity(entity => {
                if (entity.name !== 'warden') { return false }
                const distance = entity.position.distanceTo(bot.bot.entity.position)
                if (distance > 16) { return false }
                return true
            })) { shouldBeQuiet = true }

            checkQuietInterval.time = shouldBeQuiet ? 5000 : 500

            if (bot.tasks.isIdle) {
                if (!shouldBeQuiet && bot.bot.controlState.sneak) {
                    bot.bot.setControlState('sneak', false)
                } else if (shouldBeQuiet && !bot.bot.controlState.sneak) {
                    bot.bot.setControlState('sneak', true)
                }
            }

            bot.permissiveMovements.sneak = () => shouldBeQuiet
            bot.restrictedMovements.sneak = () => shouldBeQuiet
            bot.cutTreeMovements.sneak = () => shouldBeQuiet
            bot._quietMode = shouldBeQuiet
        }

        return false
    }
}