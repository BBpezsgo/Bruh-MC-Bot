const { Goal } = require('./base')
const AsyncGoal = require('./async-base')

/**
 * @template T
 * @extends {AsyncGoal<T>}
 */
module.exports = class AnyAsyncGoal extends AsyncGoal {
    /**
     * @readonly @private
     * @type {() => Promise<T>}
     */
    task

    /**
     * @param {import('../context')} context
     * @param {Goal<any>} parent
     * @param {() => Promise<T>} task
     */
    constructor(context, parent, task) {
        super(parent)
        this.task = task
    }

    /**
     * @override
     * @returns {import('./base').AsyncGoalReturn<T>}
     * @param {import('../context')} context
     */
    async run(context) {
        super.run(context)

        const result = await this.task()
    
        return { result: result }
    }

    /**
     * @override
     * @param {import('../context')} context
     * @returns {string}
     */
    toReadable(context) { return `Something` }
}
