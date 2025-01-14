/**
 * @abstract
 */
module.exports = class Lock {
    /** @type {boolean} */ isUnlocked
    /** @type {boolean} */ timeoutNotified

    /** @readonly @type {string | null} */ by
    /** @readonly @type {number} */ time
    /** @readonly @type {string} */ stack

    /**
     * @param {string} by
     */
    constructor(by) {
        this.by = by
        this.isUnlocked = false
        this.time = performance.now()
        this.stack = new Error().stack.replace('Error', '')
        this.timeoutNotified = false
    }

    unlock() {
        this.isUnlocked = true
    }
}