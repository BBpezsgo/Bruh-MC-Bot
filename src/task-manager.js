/**
 * @template [TResult = any]
 * @template {{}} [TArgs = {}]
 * @template [TError = any]
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
     * @type {((reason: TError) => any) | null}
     */
    _reject

    /**
     * @private
     * @type {Promise<TResult> | null}
     */
    _promise

    /**
     * @private @readonly
     * @type {Priority<TArgs>}
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
     * @param {Priority<TArgs>} priority
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
     * @returns {import('./promise').TypedPromise<TResult, TError>}
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
        this._status = 'cancelled'
        if (!this._task) {
            return
        }

        if (this.args.cancel) {
            if (this._cancellingTask) { return }
            this._cancellingTask = this.args.cancel()
        } else {
            // @ts-ignore
            this._task.return('cancelled')
            console.log(`[Tasks]: Task "${this.id}" cancelled`)
        }
    }

    abort() {
        this._status = 'aborted'
        if (!this._task) {
            return
        }

        // @ts-ignore
        this._task.return('aborted')
        console.log(`[Tasks]: Task "${this.id}" aborted`)
    }

    tick() {
        if (this._cancellingTask) {
            const v = this._cancellingTask.next()
            if (v.done) {
                this._status = 'cancelled'
                console.log(`[Tasks]: Task "${this.id}" cancelled gracefully`)
                return true
            } else {
                this._status = 'cancelling'
                return false
            }
        }

        if (!this._task) {
            this._task = this._def.task(this._bot, this.args)
            this._status = 'running'
            console.log(`[Bot "${this._bot.bot.username}"]: Task "${this.id}" started`)
        }

        try {
            const v = this._task.next()
            if (v.done) {
                this._status = 'done'
                console.log(`[Bot "${this._bot.bot.username}"]: Task "${this.id}" finished with result`, v.value)
                if (this._resolve) { this._resolve(v.value) }
                return true
            } else {
                this._status = 'running'
                return false
            }
        } catch (error) {
            this._status = 'failed'
            console.error(`[Bot "${this._bot.bot.username}"]: Task "${this.id}" failed:`, error)
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

/**
 * @template TArgs
 * @exports
 * @typedef {number | ((args: TArgs) => number)} Priority
 */

module.exports = class TaskManager {
    /**
     * @readonly @type {ReadonlyArray<ManagedTask>}
     */
    get queue() { return this._queue }
    /**
     * @readonly @type {ReadonlyArray<ManagedTask>}
     */
    get running() { return this._running }

    /**
     * @private @readonly
     * @type {Array<ManagedTask>}
     */
    _queue

    /**
     * @private @readonly
     * @type {Array<ManagedTask>}
     */
    _running

    get isIdle() { return this._queue.length === 0 && this._running.length === 0 }

    /**
     * @private
     * @type {boolean}
     */
    _isStopping

    constructor() {
        this._queue = []
        this._running = []
        this._isStopping = false
    }

    /**
     * @template {{}} TArgs
     * @template TResult
     * @template TError
     * @param {import('./bruh-bot')} bot
     * @param {import('./task').TaskDef<TResult, TArgs, TError>} task
     * @param {import('./task').CommonArgs<TArgs>} args
     * @param {Priority<TArgs>} priority
     * @returns {ManagedTask<TResult, TArgs, TError> | null}
     */
    push(bot, task, args, priority = 0) {
        if (this._isStopping) {
            return null
        }
        const id = task.id(args)
        if (this.has(id)) {
            // console.log(`Task "${id}" already added`)
            return null
        }

        if (this._queue.length > 10) {
            this._queue.shift()
            console.warn(`Too many tasks in _queue`)
        }

        const newTask = new ManagedTask(
            priority,
            args,
            bot,
            task
        )

        this._queue.push(newTask)

        return newTask
    }

    /**
     * @private
     * @param {ManagedTask | null} a
     * @param {ManagedTask | null} b
     * **Returns:**
     * 
     *  Positive - `a` is more important
     * 
     *  Negative - `b` is more important
     * 
     *  Zero - idk
     */
    static compareTasks(a, b) {
        if (!a && !b) { return 0 }
        if (!b) { return 1 }
        if (!a) { return -1 }
        return a.priority - b.priority
    }

    /**
     * @private
     * @param {ReadonlyArray<ManagedTask>} tasks
     * @returns {number}
     */
    static findImportantTask(tasks) {
        let maxPriority = null
        let index = -1
        for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i]
            const priority = task.priority
            if (maxPriority === null || priority > maxPriority) {
                maxPriority = priority
                index = i
            }
        }
        return index
    }

    /**
     * @private
     * @param {Array<ManagedTask>} tasks
     * @returns {ManagedTask | null}
     */
    static takeImportantTask(tasks) {
        const index = TaskManager.findImportantTask(tasks)
        return tasks.splice(index, 1)[0]
    }

    /**
     * @param {string | null} id
     */
    has(id) {
        if (id) {
            for (let i = 0; i < this._queue.length; i++) {
                const _task = this._queue[i]
                if (_task.id === id) {
                    // console.log(`Task "${id}" already added`)
                    return true
                }
            }
            for (let i = 0; i < this._running.length; i++) {
                const _task = this._running[i]
                if (_task.id === id) {
                    // console.log(`Task "${id}" already added`)
                    return true
                }
            }
        }

        return false
    }

    tick() {
        if (this._running.length > 0) {
            const i = TaskManager.findImportantTask(this._running)
            const j = TaskManager.findImportantTask(this._queue)
            if (j !== -1 && TaskManager.compareTasks(this._running[i], this._queue[j]) < 0) {
                const moreImportantTask = this._queue.splice(j, 1)[0]
                this._running.push(moreImportantTask)
                return moreImportantTask
            } else if (i !== -1) {
                let running = null
                for (let step = 0; step < 3; step++) {
                    if (this._running[i].tick()) {
                        this._running.splice(i, 1)[0]
                        running = null
                        break
                    } else {
                        running = this._running[i]
                    }
                }
                return running
            } else {
                return null
            }
        } else if (this._queue.length > 0 && !this._isStopping) {
            const nextTask = TaskManager.takeImportantTask(this._queue)
            if (nextTask) {
                this._running.push(nextTask)
                return nextTask
            } else {
                return null
            }
        } else {
            return null
        }
    }

    /**
     * @returns {Promise<void>}
     */
    cancel() {
        this._isStopping = true
        return new Promise(resolve => {
            const interval = setInterval(() => {
                for (const runningTask of this._running) {
                    runningTask.cancel()
                }
                this._queue.splice(0, this._queue.length)
                if (this._running.length === 0) {
                    clearInterval(interval)
                    resolve()
                }
            }, 10)
        })
    }

    abort() {
        this._queue.splice(0, this._queue.length)
        for (const runningTask of this._running) {
            runningTask.abort()
        }
    }
}
