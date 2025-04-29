'use strict'

/**
 * @template {Array<any>} TArgs
 * @typedef {(...args: TArgs) => void} TaskEventCallback
 */

/**
 * @typedef {'cancel' | 'interrupt'} InterruptType
 */

/**
 * @template {Array<any>} TArgs
 */
class TaskEventEmitter {
    /** @readonly @type {Array<{ callback: TaskEventCallback<TArgs>; remove: boolean; }>} */
    #listeners

    constructor() {
        this.#listeners = []
    }
    /**
     * @param {TArgs} args
     */
    emit(...args) {
        for (let i = this.#listeners.length - 1; i >= 0; i--) {
            try {
                const listener = this.#listeners[i]
                if (listener.remove) this.#listeners.splice(i, 1)
                listener.callback(...args)
            } catch (error) {
                console.error(error)
            }
        }
    }

    /**
     * @param {TaskEventCallback<TArgs>} callback
     */
    once(callback) {
        this.#listeners.push({
            callback: callback,
            remove: true,
        })
    }

    /**
     * @param {TaskEventCallback<TArgs>} callback
     */
    on(callback) {
        this.#listeners.push({
            callback: callback,
            remove: false,
        })
    }

    /**
     * @param {TaskEventCallback<TArgs>} callback
     */
    off(callback) {
        for (let i = this.#listeners.length - 1; i >= 0; i--) {
            if (this.#listeners[i].callback === callback) this.#listeners.splice(i, 1)
        }
    }
}

module.exports = class Interrupt {
    /** @readonly @type {TaskEventEmitter<[InterruptType, any]>} */
    #emitter

    /** @type {boolean} */
    #isCancelled
    /** @type {any} */
    #cancelReason

    /** @type {boolean} */
    #isInterrupted
    /** @type {any} */
    #interruptReason

    /** @type {boolean} */
    get isCancelled() { return this.#isCancelled }

    /** @type {boolean} */
    get isInterrupted() { return this.#isInterrupted }

    constructor() {
        this.#emitter = new TaskEventEmitter()
        this.#isCancelled = false
        this.#isInterrupted = false
        this.#cancelReason = null
        this.#interruptReason = null
    }

    /**
     * @param {InterruptType} type
     * @param {any} [reason]
     */
    trigger(type, reason = undefined) {
        if (type === 'cancel') {
            this.#isCancelled = true
            this.#cancelReason = reason
        }
        if (type === 'interrupt') {
            this.#isInterrupted = true
            this.#interruptReason = reason
        }
        this.#emitter.emit(type, reason)
    }

    resume() {
        this.#isCancelled = false
        this.#cancelReason = undefined
        this.#isInterrupted = false
        this.#interruptReason = undefined
    }

    /** @param {TaskEventCallback<[InterruptType, any]>} callback */
    once(callback) {
        this.#emitter.once(callback)
    }
    /** @param {TaskEventCallback<[InterruptType, any]>} callback */
    on(callback) {
        this.#emitter.on(callback)
    }
    /** @param {TaskEventCallback<[InterruptType, any]>} callback */
    off(callback) {
        this.#emitter.off(callback)
    }

    /**
     * @param {import('../locks/generic')} lock
     */
    registerLock(lock) {
        this.#emitter.on(type => {
            if (type === 'cancel') lock.unlock()
        })
    }
}
