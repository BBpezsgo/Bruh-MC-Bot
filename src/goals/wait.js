const { Goal } = require('./base')

module.exports = class Wait extends Goal {
    /**
     * @private
     * @readonly
     * @type {number}
     */
    startTime
    
    /**
     * @private
     * @readonly
     * @type {number}
     */
    waitTime

    /**
     * @param {Goal<any>} parent
     * @param {number} ms
     */
    constructor(parent, ms) {
        super(parent)
        this.startTime = performance.now()
        this.waitTime = ms
    }

    /**
     * @override
     * @returns {import('./base').GoalReturn<true>}
     * @param {import('../context')} context
     */
    run(context) {
        super.run(context)

        if ((performance.now() - this.startTime) >= this.waitTime) {
            return { result: true }
        }
        
        return false
    }

    /**
     * @override
     * @param {import('../context')} context
     * @returns {string}
     */
    toReadable(context) {
        return `Wait for ${(Math.round(this.waitTime / 100) / 10)} seconds (${(Math.round(Math.max(this.waitTime - (performance.now() - this.startTime), 0) / 100) / 10)} sec remaining)`
    }
}