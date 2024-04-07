const { goals, Movements } = require('mineflayer-pathfinder')
const { Goal } = require('./base')
const AsyncGoal = require('./async-base')
const { error } = require('../utils')

/**
 * @extends {AsyncGoal<'here' | 'done'>}
 */
module.exports = class GotoPlayerGoal extends AsyncGoal {
    /**
     * @type {string}
     */
    player

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
     * @param {string} player
     * @param {number} distance
     * @param {Movements} movements
     */
    constructor(parent, player, distance, movements) {
        super(parent)

        this.player = player
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
        
        const target = context.bot.players[this.player]?.entity

        if (!target) {
            return error(`${this.indent} Can't find ${this.player}`)
        }

        const distance = context.bot.entity.position.distanceTo(target.position)

        if (distance <= this.distance) {
            return { result: 'here' }
        }

        const oldMovements = this.movements ? context.bot.pathfinder.movements : null

        try {
            if (this.movements) {
                context.bot.pathfinder.setMovements(this.movements)
            }

            await context.bot.pathfinder.goto(new goals.GoalNear(target.position.x, target.position.y, target.position.z, this.distance))
        
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
        return `Goto ${this.player}`
    }
}
