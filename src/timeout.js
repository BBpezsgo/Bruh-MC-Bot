const Context = require("./context")

module.exports = class Timeout {
    /**
     * @readonly
     * @type {number}
     */
    startTime

    /**
     * @readonly
     * @type {number}
     */
    time

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
        this.startTime = context.time
        this.time = time
    }

    is() { return this.context.time - this.startTime >= this.time }
}
