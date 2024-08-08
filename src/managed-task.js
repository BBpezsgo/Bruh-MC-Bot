/**
 * @template [TResult = any]
 * @template {{}} [TArgs = {}]
 * @template {any} [TError = any]
 */
class ManagedTask {

    /**
     * @exports
     * @typedef {'queued' | 'running' | 'done' | 'failed' | 'cancelling' | 'cancelled' | 'aborted'} TaskStatus
     */

    //#region Public

    /**
     * @readonly
     * @type {boolean}
     */
    get isDone() {
        return (
            this._status === 'aborted' ||
            this._status === 'cancelled' ||
            this._status === 'failed' ||
            this._status === 'done'
        )
    }

    /**
     * @readonly
     * @type {string}
     */
    get id() { return this._def.id(this.args) }

    /**
     * @readonly
     * @type {string}
     */
    get humanReadableId() { return this._def.humanReadableId(this.args) }

    /**
     * @readonly
     * @type {number}
     */
    get priority() {
        return (typeof this._priority === 'number') ? this._priority : this._priority(this.args)
    }

    /**
     * @readonly
     * @type {import('./task').CommonArgs<TArgs>}
     */
    args

    /**
     * @readonly
     */
    get status() { return this._status }

    //#endregion

    //#region Private

    /**
     * @private
     * @type {import('./task').Task<TResult> | null}
     */
    _task

    /**
     * @private
     * @type {import('./task').Task<void> | null}
     */
    _cancellingTask

    /**
     * @type {((value: TResult) => any) | null}
     */
    _resolve

    /**
     * @type {((reason: TError | 'cancelled') => any) | null}
     */
    _reject

    /**
     * @private
     * @type {Promise<TResult> | null}
     */
    _promise

    /**
     * @private @readonly
     * @type {import('./task-manager').Priority<TArgs>}
     */
    _priority

    /**
     * @private
     * @type {TaskStatus}
     */
    _status

    /**
     * @private @readonly
     * @type {import('./bruh-bot')}
     */
    _bot

    /**
     * @private @readonly
     * @type {import('./task').TaskDef<TResult, TArgs, TError>}
     */
    _def

    //#endregion

    /**
     * @param {import('./task-manager').Priority<TArgs>} priority
     * @param {import('./task').CommonArgs<TArgs>} args
     * @param {import('./bruh-bot')} bot
     * @param {import("./task").TaskDef<TResult, TArgs, TError>} def
     */
    constructor(
        priority,
        args,
        bot,
        def
    ) {
        this._priority = priority
        this._status = 'queued'
        this.args = args
        this._bot = bot
        this._def = def
        this._task = null
        this._cancellingTask = null
        this._promise = null
        this._resolve = null
        this._reject = null
    }

    /**
     * @returns {import('./promise').TypedPromise<TResult, TError | 'cancelled'>}
     */
    wait() {
        if (!this._promise) {
            this._promise = new Promise((resolve, reject) => {
                this._resolve = resolve
                this._reject = reject
            })
        }
        // @ts-ignore
        return this._promise
    }

    cancel() {
        this._status = 'cancelling'
        if (!this._task) { return }
        if (this._cancellingTask) { return }

        if (this.args?.cancel) {
            this._cancellingTask = this.args.cancel()
        } else {
            this._status = 'cancelled'
        }
    }

    abort() {
        this._status = 'aborted'
        if (!this._task) { return }

        // @ts-ignore
        this._task.return('aborted')
        console.log(`[Tasks] Task "${this.id}" aborted`)
    }

    tick() {
        if (this._cancellingTask) {
            try {
                const v = this._cancellingTask.next()
                if (v.done) {
                    if (this._task) {
                        const v2 = this._task.next()
                        if (!v2.done) {
                            this._status = 'cancelling'
                            return false
                        }
                    }
                    this._status = 'cancelled'
                    console.log(`[Tasks] Task "${this.id}" cancelled gracefully`)
                    if (this._reject) { this._reject('cancelled') }
                    return true
                } else {
                    this._status = 'cancelling'
                    return false
                }
            } catch (error) {
                this._status = 'failed'
                console.error(`[Bot "${this._bot.bot.username}"] Task "${this.id}" failed:`, error)
                if (this._reject) { this._reject(error) }
                return true
            }
        }

        if (this._status === 'cancelled') {
            console.log(`[Tasks] Task "${this.id}" cancelled`)
            if (this._reject) { this._reject('cancelled') }
            return true
        }

        if (!this._task) {
            this._task = this._def.task(this._bot, this.args)
            this._status = 'running'
            console.log(`[Bot "${this._bot.bot.username}"] Task "${this.id}" started`)
        }

        try {
            const v = this._task.next()
            if (v.done) {
                this._status = 'done'
                console.log(`[Bot "${this._bot.bot.username}"] Task "${this.id}" finished with result`, v.value)
                if (this._resolve) { this._resolve(v.value) }
                return true
            } else {
                this._status = 'running'
                return false
            }
        } catch (error) {
            this._status = 'failed'
            if (error instanceof Error && (
                error.name === 'NoPath' ||
                error.name === 'GoalChanged' ||
                error.name === 'Timeout' ||
                error.name === 'PathStopped'
            )) {
                console.error(`[Bot "${this._bot.bot.username}"] Task "${this.id}" failed:`, error.message)
            } else {
                console.error(`[Bot "${this._bot.bot.username}"] Task "${this.id}" failed:`, error)
            }
            if (this._reject) { this._reject(error) }
            return true
        }
    }
}

/**
 * @exports
 * @template {import('./task').TaskDef<any, any, any>} TTask
 * @typedef {ManagedTask<
 *   TTask extends import('./task').TaskDef<infer TResult, any> ? TResult : never,
 *   TTask extends import('./task').TaskDef<any, infer TArgs, any> ? TArgs : never,
 *   TTask extends import('./task').TaskDef<any, any, infer TError> ? TError : never
 * >} AsManaged
 */

module.exports = ManagedTask
