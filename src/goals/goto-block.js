const { goals, Movements } = require('mineflayer-pathfinder')
const { Goal } = require('./base')
const { Vec3 } = require('vec3')
const AsyncGoal = require('./async-base')

/**
 * @extends {AsyncGoal<'here' | 'done'>}
 */
module.exports = class GotoBlockGoal extends AsyncGoal {
    /**
     * @type {Vec3}
     */
    destination

    /**
     * @param {Goal<any>} parent
     * @param {Vec3} destination
     * @param {Movements} movements
     */
    constructor(parent, destination, movements) {
        super(parent)

        this.destination = destination
        this.movements = movements
    }

    /**
     * @type {Movements | null}
     */
    movements

    /**
     * @override
     * @returns {import('./base').AsyncGoalReturn<'here' | 'done'>}
     * @param {import('../context')} context
     */
    async run(context) {
        super.run(context)
        
        const distance = context.bot.entity.position.distanceTo(this.destination)

        if (distance < 2.5) {
            return { result: 'here' }
        }

        const oldMovements = this.movements ? context.bot.pathfinder.movements : null

        try {
            if (this.movements) {
                context.bot.pathfinder.setMovements(this.movements)
            }

            await context.bot.pathfinder.goto(new goals.GoalGetToBlock(this.destination.x, this.destination.y, this.destination.z))
            
            if (oldMovements) {
                context.bot.pathfinder.setMovements(oldMovements)
            }
        } catch (error) {
            if (oldMovements) {
                context.bot.pathfinder.setMovements(oldMovements)
            }

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
