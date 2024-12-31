'use strict'

/**
 * @template {Array<any>} TArgs
 * @typedef {(...args: TArgs) => void} TaskEventCallback
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
    /** @readonly @type {TaskEventEmitter<['interrupt' | 'cancel']>} */
    #emitter

    /** @type {boolean} */
    #isCancelled

    /** @type {boolean} */
    get isCancelled() { return this.#isCancelled }

    constructor() {
        this.#emitter = new TaskEventEmitter()
        this.#isCancelled = false
    }

    /**
     * @param {'interrupt' | 'cancel'} type
     */
    trigger(type) {
        if (type === 'cancel') this.#isCancelled = true
        this.#emitter.emit(type)
    }

    /** @param {TaskEventCallback<['interrupt' | 'cancel']>} callback */
    once(callback) {
        this.#emitter.once(callback)
    }
    /** @param {TaskEventCallback<['interrupt' | 'cancel']>} callback */
    on(callback) {
        this.#emitter.on(callback)
    }
    /** @param {TaskEventCallback<['interrupt' | 'cancel']>} callback */
    off(callback) {
        this.#emitter.off(callback)
    }
}
