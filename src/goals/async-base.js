const { Goal } = require('./base')

/**
 * @template {any} [TResult = true]
 * @extends Goal<TResult>
 */
module.exports = class AsyncGoal extends Goal {
    /**
     * @param {Goal<any> | null} parent
     */
    constructor(parent) {
        super(parent)
    }

    /**
     * @abstract
     * @override
     * @returns {import('./base').AsyncGoalReturn<TResult>}
     * @param {import('../context')} context
     */
    run(context) {
        super.run(context)
        return Promise.resolve(null)
    }
}
