/**
 * @template {any} [TResult = true]
 */
class Goal {
    /**
     * @readonly
     * @type {Goal | null}
     */
    parent

    /**
     * @type {import('../result').Result<TResult> | null}
     */
    resolvedValue

    /**
     * @readonly
     * @type {Array<Goal<any>>}
     */
    goals

    /**
     * @readonly
     * @type {number}
     */
    depth

    /**
     * @type {boolean}
     */
    quiet

    /**
     * @protected
     * @type {string}
     */
    get indent() {
        return (''.padStart(this.depth * 2 + 1, ' '))
    }

    /**
     * @private
     * @readonly
     * @type {Array<(result: TResult) => any>}
     */
    thenCallbacks

    /**
     * @private
     * @readonly
     * @type {Array<(error: import('../result').GoalError) => any>}
     */
    catchCallbacks

    /**
     * @private
     * @readonly
     * @type {Array<(result: import('../result').Result<TResult>) => any>}
     */
    finallyCallbacks

    /**
     * @readonly
     * @type {boolean}
     */
    started

    /**
     * @param {Goal<null> | null} parent
     */
    constructor(parent) {
        this.goals = [ ]
        this.started = false
        this.quiet = false
        this.thenCallbacks = [ ]
        this.catchCallbacks = [ ]
        this.finallyCallbacks = [ ]

        this.parent = parent
        if (this.parent) this.parent.goals.push(this)

        let current = this.parent
        let depth = 0
        while (current) {
            depth++
            current = current.parent
        }
        this.depth = depth
    }

    /**
     * @abstract
     * @returns {GoalReturn<TResult> | AsyncGoalReturn<TResult>}
     * @param {import('../context')} context
     */
    run(context) {
        // @ts-ignore
        this.started = true
        return { result: null }
    }

    /**
     * @param {import('../result').Result<TResult>} result
     */
    finish(result) {
        this.resolvedValue = result

        if ('error' in result) {
            for (const callback of this.catchCallbacks) {
                if (callback) {
                    try {
                        callback(result.error)
                    } catch (error) {
                        console.error(error)
                    }
                }
            }
        } else {
            for (const callback of this.thenCallbacks) {
                if (callback) {
                    try {
                        callback(result.result)
                    } catch (error) {
                        console.error(error)
                    }
                }
            }
        }
        
        for (const callback of this.finallyCallbacks) {
            if (callback) {
                try {
                    callback(result)
                } catch (error) {
                    console.error(error)
                }
            }
        }
    }

    /**
     * @param {(result: TResult) => any} callback
     */
    then(callback) { this.thenCallbacks.push(callback) }

    /**
     * @param {(error: import('../result').GoalError) => any} callback
     */
    catch(callback) { this.catchCallbacks.push(callback) }

    /**
     * @param {(result: import('../result').Result<TResult>) => any} callback
     */
    finally(callback) { this.finallyCallbacks.push(callback) }

    /**
     * @returns {Promise<import('../result').Result<TResult>>}
     */
    wait() {
        return new Promise((resolve) => {
            this.thenCallbacks.push(result => resolve({ result }))
            this.catchCallbacks.push(error => resolve({ error }))
        })
    }

    /**
     * @virtual
     * @param {import('../context')} context
     * @returns {string}
     */
    toReadable(context) {
        return this.constructor.name
    }
}

/**
 * @exports @template TResult @typedef {false | import('../result').Result<TResult>} GoalStatus
 */

/**
 * @exports @template TResult @typedef {GoalStatus<TResult>} GoalReturn
 */

/**
 * @exports @template TResult @typedef {Promise<import('../result').Result<TResult>>} AsyncGoalReturn
 */

module.exports = {
    Goal
}
