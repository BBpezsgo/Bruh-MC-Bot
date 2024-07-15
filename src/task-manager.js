/**
 * @template [TResult = any]
 * @template [TArgs = any]
 * @template [TError = any]
 */
class ManagedTask {
    /**
     * @private
     * @type {import('./promise').TypedPromise<TResult, TError> | null}
     */
    _promise
    
    /**
     * @readonly
     * @type {((value: TResult) => any) | null}
     */// @ts-ignore
    resolve
    
    /**
     * @readonly
     * @type {((reason: TError) => any) | null}
     */// @ts-ignore
    reject
    
    /**
     * @private @readonly
     * @type {Priority<TArgs>}
     */
    priority
    
    /**
     * @readonly
     * @type {TaskStatus}
     */
    status
    
    /**
     * @readonly
     * @type {TArgs}
     */
    args
    
    /**
     * @private @readonly
     * @type {import('./bruh-bot')}
     */
    bot
    
    /**
     * @private @readonly
     * @type {import('./task').TaskDef<TResult, TArgs, TError>}
     */
    def
    
    /**
     * @readonly
     * @type {import('./task').Task<TResult> | null}
     */
    task

    /**
     * @param {Priority<TArgs>} priority
     * @param {TaskStatus} status
     * @param {import('./task').CommontArgs<TArgs>} args
     * @param {import('./bruh-bot')} bot
     * @param {import("./task").TaskDef<TResult, TArgs, TError>} def
     * @param {import("./task").Task<TResult> | null} task
     */
    constructor(
        priority,
        status,
        args,
        bot,
        def,
        task
    ) {
        this.priority = priority
        this.status = status
        this.args = args
        this.bot = bot
        this.def = def
        this.task = task
        this._promise = null
        this.resolve = null
        this.reject = null
    }

    getId() { return this.def.id(this.args) }
    getHumanReadableId() { return this.def.humanReadableId(this.args) }

    /**
     * @returns {import('./promise').TypedPromise<TResult, TError>}
     */
    wait() {
        if (!this._promise) {
            // @ts-ignore
            this._promise = new Promise((resolve, reject) => {
                // @ts-ignore
                this.resolve = resolve
                // @ts-ignore
                this.reject = reject
            })
        }
        // @ts-ignore
        return this._promise
    }

    start() {
        // @ts-ignore
        this.task = this.def.task(this.bot, this.args)
        // @ts-ignore
        this.status = '_running'
        
        console.log(`[Tasks]: Task "${this.getId()}" started`)
    }

    finish() {
        // @ts-ignore
        this.status = 'done'
    
        console.log(`[Tasks]: Task "${this.getId()}" finished`)
    }

    cancel() {
        // @ts-ignore
        this.status = 'done'
    
        console.log(`[Tasks]: Task "${this.getId()}" canceled`)
    }

    getPriority() {
        return (typeof this.priority === 'number') ? this.priority : this.priority(this.args)
    }
}

/**
 * @exports
 * @typedef {'queued' | '_running' | 'done'} TaskStatus
 */

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
     * @readonly @type {ReadonlyArray<ManagedTask<any, any, any>>}
     */
    get queue() { return this._queue }
    /**
     * @readonly @type {ReadonlyArray<ManagedTask<any, any, any>>}
     */
    get running() { return this._running }

    /**
     * @private @readonly
     * @type {Array<ManagedTask<any, any>>}
     */
    _queue

    /**
     * @private @readonly
     * @type {Array<ManagedTask<any, any>>}
     */
    _running

    get isIdle() { return this._queue.length === 0 && this._running.length === 0 }

    constructor() {
        this._queue = [ ]
        this._running = [ ]
    }

    /**
     * @template TArgs
     * @template TResult
     * @template TError
     * @param {import('./bruh-bot')} bot
     * @param {import('./task').TaskDef<TResult, TArgs, TError>} task
     * @param {import('./task').CommontArgs<TArgs>} args
     * @param {Priority<TArgs>} priority
     * @returns {ManagedTask<TResult, TArgs, TError> | null}
     */
    push(bot, task, args, priority = 0) {
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
            'queued',
            args,
            bot,
            task,
            null
        )

        this._queue.push(newTask)

        return newTask
    }

    /**
     * @param {ManagedTask} a
     * @param {ManagedTask} b
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
        return a.getPriority() - b.getPriority()
    }

    /**
     * @param {ReadonlyArray<ManagedTask>} tasks
     * @returns {number}
     */
    static findImportantTask(tasks) {
        let maxPriority = null
        let index = -1
        for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i]
            const priority = task.getPriority()
            if (maxPriority === null || priority > maxPriority) {
                maxPriority = priority
                index = i
            }
        }
        return index
    }

    /**
     * @param {Array<ManagedTask>} tasks
     * @returns {ManagedTask | null}
     */
    static takeImportantTask(tasks) {
        const index = TaskManager.findImportantTask(tasks)
        return tasks.splice(index, 1)[0]
    }

    /**
     * @private
     * @param {ManagedTask} task
     */
    startTask(task) {
        task.start()
        this._running.push(task)
    }

    /**
     * @param {string | null} id
     */
    has(id) {
        if (id) {
            for (let i = 0; i < this._queue.length; i++) {
                const _task = this._queue[i]
                if (_task.getId() === id) {
                    // console.log(`Task "${id}" already added`)
                    return true
                }
            }
            for (let i = 0; i < this._running.length; i++) {
                const _task = this._running[i]
                if (_task.getId() === id) {
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
                moreImportantTask.start()
                this._running.push(moreImportantTask)
                return moreImportantTask
            } else if (i !== -1 && this._running[i].task) {
                try {
                    const v = this._running[i].task.next()
                    if (v.done) {
                        const finished = this._running.splice(i, 1)[0]
                        finished.finish()
                        if (finished.resolve) finished.resolve(v.value)
                        return null
                    } else {
                        return this._running[i]
                    }
                } catch (error) {
                    const finished = this._running.splice(i, 1)[0]
                    finished.finish()
                    if (finished.reject) finished.reject(error)
                    console.error(`Task "${finished.getId()}" failed:`, error)
                    return null
                }
            } else {
                return null
            }
        } else if (this._queue.length > 0) {
            const nextTask = TaskManager.takeImportantTask(this._queue)
            if (nextTask) {
                nextTask.start()
                this._running.push(nextTask)
                return nextTask
            } else {
                return null
            }
        } else {
            return null
        }
    }

    stop() {
        for (const task of this._queue) {
            task.cancel()
        }
        this._queue.splice(0, this._queue.length)
        for (const task of this._running) {
            task.cancel()
            task.task?.return('cancelled')
        }
    }
}
