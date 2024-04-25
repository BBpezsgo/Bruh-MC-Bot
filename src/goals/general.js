const { Goal } = require('./base')
const AsyncGoal = require('./async-base')

/**
 * @template T
 * @extends {AsyncGoal<T>}
 */
module.exports = class GeneralGoal extends AsyncGoal {
    /**
     * @param {Goal<any>} parent
     * @param {(context: import('../context')) => Promise<import('../result').Result<T>>} callback
     */
    constructor(parent, callback) {
        super(parent)

        this.callback = callback
    }

    /**
     * @override
     * @returns {import('./base').AsyncGoalReturn<T>}
     * @param {import('../context')} context
     */
    run(context) {
        super.run(context)
        return this.callback(context)
    }

    /**
     * @override
     * @param {import('../context')} context
     * @returns {string}
     */
    toReadable(context) {
        return `Something`
    }
}
