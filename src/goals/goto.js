const { goals, Movements } = require('mineflayer-pathfinder')
const { Goal } = require('./base')
const { Vec3 } = require('vec3')
const AsyncGoal = require('./async-base')

/**
 * @extends {AsyncGoal<'here' | 'done'>}
 */
module.exports = class GotoGoal extends AsyncGoal {
    /**
     * @type {Vec3}
     */
    destination

    /**
     * @type {number}
     */
    distance

    /**
     * @type {Movements | null}
     */
    movements

    /**
     * @param {Goal<any>} parent
     * @param {Vec3} destination
     * @param {number} distance
     * @param {Movements} movements
     */
    constructor(parent, destination, distance, movements) {
        super(parent)

        this.destination = destination
        this.distance = distance
        this.movements = movements
    }

    /**
     * @override
     * @returns {import('./base').AsyncGoalReturn<'here' | 'done'>}
     * @param {import('../context')} context
     */
    async run(context) {
        super.run(context)
        
        const distance = context.bot.entity.position.distanceTo(this.destination)

        if (distance <= this.distance) {
            return { result: 'here' }
        }

        try {
            context.bot.pathfinder.setMovements(this.movements ?? context.restrictedMovements)

            await context.bot.pathfinder.goto(new goals.GoalNear(this.destination.x, this.destination.y, this.destination.z, this.distance))
        } catch (error) {
            return { error: error }
        }
        
        return { result: 'done' }
    }

    /**
     * @override
     * @param {import('../context')} context
     * @returns {string}
     */
    toReadable(context) {
        return `Goto ${Math.round(this.destination.x)} ${Math.round(this.destination.y)} ${Math.round(this.destination.z)}`
    }
}
