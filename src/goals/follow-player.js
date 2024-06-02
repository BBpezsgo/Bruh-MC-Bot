const { Movements } = require('mineflayer-pathfinder')
const { Goal } = require('./base')
const AsyncGoal = require('./async-base')
const { error } = require('../utils')
const Wait = require('./wait')
const GotoPlayerGoal = require('./goto-player')

module.exports = class FollowPlayerGoal extends AsyncGoal {
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
     * @returns {import('./base').AsyncGoalReturn<true>}
     * @param {import('../context')} context
     */
    async run(context) {
        super.run(context)

        while (true) {
            context.refreshTime()
            const target = context.bot.players[this.player]?.entity
    
            if (!target) {
                return error(`${this.indent} Can't find ${this.player}`)
            }
    
            const distance = context.bot.entity.position.distanceTo(target.position)
    
            if (distance <= this.distance) {
                const waited = await (new Wait(this, 2000)).wait()
                if ('error' in waited) {
                    return waited
                }
                continue
            }

            const gotoResult = await (new GotoPlayerGoal(this, this.player, this.distance, this.movements)).wait()
            if ('error' in gotoResult) {
                return gotoResult
            }
        }
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
