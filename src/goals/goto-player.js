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
     * @type {number}
     */
    thinkTimeout

    /**
     * @param {Goal<any>} parent
     * @param {string} player
     * @param {number} distance
     * @param {Movements} movements
     * @param {number} [thinkTimeout = 5000]
     */
    constructor(parent, player, distance, movements, thinkTimeout = 5000) {
        super(parent)

        this.player = player
        this.distance = distance
        this.movements = movements
        this.thinkTimeout = thinkTimeout
    }

    /**
     * @override
     * @returns {import('./base').AsyncGoalReturn<'here' | 'done'>}
     * @param {import('../context')} context
     */
    async run(context) {
        super.run(context)
        
        let target = context.bot.players[this.player]?.entity?.position

        if (!target) {
            target = context.playerPositions[this.player]
            if (target) {
                console.warn(`[Bot "${context.bot.username}"] Using saved player position`)
            }
        }

        if (!target) {
            return error(`${this.indent} Can't find ${this.player}`)
        }

        const distance = context.bot.entity.position.distanceTo(target)

        if (distance <= this.distance) {
            return { result: 'here' }
        }

        try {
            context.bot.pathfinder.setMovements(this.movements ?? context.restrictedMovements)
            context.bot.pathfinder.thinkTimeout = this.thinkTimeout

            await context.bot.pathfinder.goto(new goals.GoalNear(target.x, target.y, target.z, this.distance))
        } catch (error) {
            return { error: error }
        }
        
        return { result: 'done' }
    }

    /**
     * @override
     * @param {import("../context")} context
     */
    cancel(context) {
        context.bot.pathfinder.stop()
        super.cancel(context)
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
