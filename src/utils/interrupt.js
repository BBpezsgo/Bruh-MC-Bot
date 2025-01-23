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
    /** @readonly @type {TaskEventEmitter<[InterruptType]>} */
    #emitter

    /** @type {boolean} */
    #isCancelled

    /** @type {boolean} */
    #isInterrupted

    /** @type {boolean} */
    get isCancelled() { return this.#isCancelled }

    /** @type {boolean} */
    get isInterrupted() { return this.#isInterrupted }

    constructor() {
        this.#emitter = new TaskEventEmitter()
        this.#isCancelled = false
        this.#isInterrupted = false
    }

    /**
     * @param {InterruptType} type
     */
    trigger(type) {
        if (type === 'cancel') this.#isCancelled = true
        if (type === 'interrupt') this.#isInterrupted = true
        this.#emitter.emit(type)
    }

    resume() {
        this.#isCancelled = false
        this.#isInterrupted = false
    }

    /** @param {TaskEventCallback<[InterruptType]>} callback */
    once(callback) {
        this.#emitter.once(callback)
    }
    /** @param {TaskEventCallback<[InterruptType]>} callback */
    on(callback) {
        this.#emitter.on(callback)
    }
    /** @param {TaskEventCallback<[InterruptType]>} callback */
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
