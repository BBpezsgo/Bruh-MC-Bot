module.exports = class Capabilies {
    /**
     * @typedef {'move' | 'use-hand'} Capability
     */

    /**
     * @private @readonly
     * @type {{ [capability in Capability]: boolean }}
     */
    capabilies

    /**
     * @param {import('./bruh-bot')} bot
     */
    constructor(bot) {
        this.capabilies = {
            'move': true,
            'use-hand': true,
        }
    }

    /**
     * @param {Capability} capability
     */
    lock(capability) {
        this.capabilies[capability] = false
    }

    /**
     * @param {Capability} capability
     */
    unlock(capability) {
        this.capabilies[capability] = true
    }

    /**
     * @param {Capability} capability
     */
    can(capability) {
        return this.capabilies[capability]
    }

    /**
     * @param {Capability} capability
     * @param {number} timeout
     * @returns {Generator<void, boolean, void>}
     */
    *waitFor(capability, timeout = -1) {
        const timeoutAt = performance.now() + timeout
        while (!this.can(capability)) {
            if (timeout > 0 && timeoutAt <= performance.now()) {
                return false
            }
            yield
        }
        return true
    }

    /**
     * @param {Capability} capability
     * @param {number} timeout
     * @returns {Generator<void, boolean, void>}
     */
    *waitForAndLock(capability, timeout) {
        const timeoutAt = performance.now() + timeout
        while (!this.can(capability)) {
            if (timeout > 0 && timeoutAt <= performance.now()) {
                return false
            }
            yield
        }
        this.lock(capability)
        return true
    }
}
