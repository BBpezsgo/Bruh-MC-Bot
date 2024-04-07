module.exports = class Timeout {
    /**
     * @readonly
     * @type {number}
     */
    started

    /**
     * @readonly
     * @type {number}
     */
    time    

    /**
     * @param {number} time
     */
    constructor(time) {
        this.started = performance.now()
        this.time = time
    }

    is() {
        const waited = performance.now() - this.started
        return waited >= this.time
    }
}
