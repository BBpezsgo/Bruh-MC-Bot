module.exports = class Interval {
    /**
     * @type {number}
     */
    time

    /**
     * @private
     * @type {number}
     */
    lastCheck

    /**
     * @param {number} time
     */
    constructor(time) {
        this.time = time
        this.lastCheck = 0
    }

    /**
     * @returns {boolean}
     */
    is(justRead = false) {
        const waited = performance.now() - this.lastCheck
        if (waited >= this.time) {
            if (!justRead) {
                this.lastCheck = performance.now()
            }
            return true
        }
        return false
    }

    restart() {
        this.lastCheck = performance.now()
    }
}
