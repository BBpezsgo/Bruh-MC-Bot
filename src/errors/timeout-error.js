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
        let suffix = 'ms'
        if (waitedTimeMs >= 500) {
            waitedTimeMs /= 1000
            suffix = 'sec'
        }
        if (waitedTimeMs >= 30) {
            waitedTimeMs /= 30
            suffix = 'mins'
        }
        return new TimeoutError(`Waited for ${Math.round(waitedTimeMs * 10) / 10} ${suffix}`, options)
    }
}
