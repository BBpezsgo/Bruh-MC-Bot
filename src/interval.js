const Context = require("./context")

module.exports = class Interval {
    /**
     * @type {number}
     */
    time

    /**
     * @private
     * @type {number}
     */
    startTime

    /**
     * @private @readonly
     * @type {Context}
     */
    context

    /**
     * @param {Context} context
     * @param {number} time
     */
    constructor(context, time) {
        this.context = context
        this.time = time
        this.startTime = 0
    }

    /**
     * @returns {boolean}
     */
    is(justRead = false) {
        const now = this.context.time
        if (now - this.startTime >= this.time) {
            if (!justRead) {
                this.startTime = now
            }
            return true
        }
        return false
    }

    restart() {
        this.startTime = this.context.time
    }
}
