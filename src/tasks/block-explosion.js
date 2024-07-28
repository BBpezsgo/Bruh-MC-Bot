const { goals } = require('mineflayer-pathfinder')
const { sleepG, wrap } = require('../utils/tasks')

/**
 * @type {import('../task').TaskDef<'ok' | 'none', { }>}
 */
module.exports = {
    task: function*(bot) {
        const shield = bot.searchItem('shield')
        if (!shield) {
            throw `I have no shield`
        }

        let hazard = bot.env.getExplodingCreeper(bot)

        if (!hazard) {
            return 'none'
        }

        if (!bot.holdsShield()) {
            yield* wrap(bot.bot.equip(shield.type, 'off-hand'))
        }

        // Source: https://github.com/PrismarineJS/mineflayer-pvp/blob/master/src/PVP.ts

        bot.bot.pathfinder.setGoal(null)
        bot.bot.pathfinder.setMovements(bot.restrictedMovements)
        bot.bot.pathfinder.thinkTimeout = 1000
        bot.bot.pathfinder.setGoal(new goals.GoalInvert(new goals.GoalNear(hazard.position.x, hazard.position.y, hazard.position.z, 8)), true)

        while (hazard && bot.holdsShield()) {
            bot.activateHand('left')

            yield* wrap(bot.bot.lookAt(hazard.position.offset(0, 1, 0), true))
            yield* sleepG(100)

            hazard = bot.env.getExplodingCreeper(bot)
        }

        bot.deactivateHand()
        bot.bot.pathfinder.setGoal(null)
        bot.bot.pathfinder.setMovements(bot.permissiveMovements)

        return 'ok'
    },
    id: function() {
        return 'block-explosion'
    },
    humanReadableId: function() {
        return `Blocking some explosion`
    }
}
