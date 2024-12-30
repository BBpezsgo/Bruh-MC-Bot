module.exports = class CancellationToken {
    /** @readonly @type {Array<() => (void | import('../task').Task<any>)>} */
    #listeners
    /** @type {boolean} */
    #isCancelled

    /** @type {boolean} */
    get isCancelled() { return this.#isCancelled }

    constructor() {
        this.#listeners = []
        this.#isCancelled = false
    }

    /**
     * @returns {import('../task').Task<void>}
     */
    *trigger() {
        this.#isCancelled = true
        for (let i = this.#listeners.length - 1; i >= 0; i--) {
            try {
                const v = this.#listeners.pop()()
                if (v) { yield* v }
            } catch (error) {
                console.error(error)
            }
        }
    }

    /**
     * @param {() => void} callback
     */
    once(callback) {
        this.#listeners.push(callback)
    }

    /**
     * @param {() => void} callback
     */
    off(callback) {
        let i
        while ((i = this.#listeners.indexOf(callback)) !== -1) {
            this.#listeners.splice(i, 1)
        }
    }
}