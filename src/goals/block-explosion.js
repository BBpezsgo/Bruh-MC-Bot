const { goals } = require('mineflayer-pathfinder')
const { sleep, error } = require('../utils')
const AsyncGoal = require('./async-base')
const { Goal } = require('./base')

/**
 * @extends {AsyncGoal<boolean>}
 */
module.exports = class BlockExplosionGoal extends AsyncGoal {
    /**
     * @param {Goal<any>} parent
     */
    constructor(parent) {
        super(parent)
    }

    /**
     * @override
     * @returns {import('./base').AsyncGoalReturn<boolean>}
     * @param {import('../context')} context
     */
    async run(context) {
        super.run(context)

        const shield = context.searchItem('shield')
        if (!shield) {
            return error(`${this.indent} I have no shield`)
        }

        let hazard = context.explodingCreeper()

        if (!hazard) {
            return { result: false }
        }

        if (!context.holdsShield()) {
            await context.bot.equip(shield.type, 'off-hand')
        }

        // Source: https://github.com/PrismarineJS/mineflayer-pvp/blob/master/src/PVP.ts

        context.bot.pathfinder.setGoal(null)
        context.bot.pathfinder.setMovements(context.restrictedMovements)
        context.bot.pathfinder.thinkTimeout = 1000
        context.bot.pathfinder.setGoal(new goals.GoalInvert(new goals.GoalNear(hazard.position.x, hazard.position.y, hazard.position.z, 8)), true)

        while (hazard && context.holdsShield()) {
            context.refreshTime()
            context.activateHand('left')

            await context.bot.lookAt(hazard.position.offset(0, 1, 0), true)
            await sleep(100)

            hazard = context.explodingCreeper()
        }

        context.deactivateHand()
        context.bot.pathfinder.setGoal(null)
        context.bot.pathfinder.setMovements(context.permissiveMovements)

        return { result: true }
    }
}
