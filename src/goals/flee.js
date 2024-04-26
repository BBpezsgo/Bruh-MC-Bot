const { goals } = require('mineflayer-pathfinder')
const { Goal } = require('./base')
const { Vec3 } = require('vec3')
const AsyncGoal = require('./async-base')

/**
 * @extends {AsyncGoal<'away' | 'done'>}
 */
module.exports = class FleeGoal extends AsyncGoal {
    /**
     * @type {Vec3}
     */
    point

    /**
     * @type {number}
     */
    distance

    /**
     * @param {Goal<any>} parent
     * @param {Vec3} point
     * @param {number} distance
     */
    constructor(parent, point, distance) {
        super(parent)

        this.point = point
        this.distance = distance
    }

    /**
     * @override
     * @returns {import('./base').AsyncGoalReturn<'away' | 'done'>}
     * @param {import('../context')} context
     */
    async run(context) {
        super.run(context)
        
        const distance = context.bot.entity.position.distanceTo(this.point)

        if (distance > this.distance) {
            return { result: 'away' }
        }

        try {
            context.bot.pathfinder.setMovements(context.restrictedMovements)
            context.bot.pathfinder.setGoal(null)

            await context.bot.pathfinder.goto(new goals.GoalInvert(new goals.GoalNear(this.point.x, this.point.y, this.point.z, this.distance)))
        } catch (error) {
            return { error: error }
        }
        
        return { result: 'done' }
    }
}
