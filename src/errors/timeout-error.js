const { Timeout } = require("../utils/other")

module.exports = class TimeoutError extends Error {
    /**
     * @param {string} message
     * @param {ErrorOptions} [options]
     */
    constructor(message, options) {
        super(message, options)
    }

    /**
     * @param {number | Timeout} waitedTimeMs
     * @param {ErrorOptions} [options]
     */
    static fromTime(waitedTimeMs, options) {
        if (waitedTimeMs instanceof Timeout) {
            // @ts-ignore
            waitedTimeMs = waitedTimeMs.start - performance.now()
        }
        return new TimeoutError(`Waited for ${waitedTimeMs} ms`, options)
    }
}
