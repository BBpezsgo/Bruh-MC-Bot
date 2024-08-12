const ManagedTask = require('./managed-task')

/**
 * @exports
 * @template {{}} TArgs
 * @typedef {number | ((args: TArgs) => number)} Priority
 */

module.exports = class TaskManager {
    /**
     * @readonly
     * @returns {boolean}
     */
    get isIdle() { return this._tasks.length === 0 }

    /**
     * @readonly
     * @returns {ReadonlyArray<ManagedTask>}
     */
    get tasks() { return this._tasks }

    /**
     * @private @readonly
     * @type {Array<ManagedTask>}
     */
    _tasks

    /**
     * @private
     * @type {boolean}
     */
    _isStopping

    constructor() {
        this._tasks = []
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

        if (this._tasks.length > 10) {
            this._tasks.shift()
            console.warn(`Too many tasks in _queue`)
        }

        const newTask = new ManagedTask(
            priority,
            args,
            bot,
            task
        )

        this._tasks.push(newTask)

        return newTask
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
     * @param {string | null} id
     */
    has(id) {
        if (id) {
            return !!this._tasks.find(v => v.id === id)
        }

        return false
    }

    tick() {
        if (this._tasks.length === 0) { return null }

        const i = TaskManager.findImportantTask(this._tasks)

        if (i === -1) { return null }

        if (this._isStopping && this._tasks[i].status === 'queued') {
            this._tasks.splice(i, 1)
            return null
        }

        let running = null
        for (let step = 0; step < 3; step++) {
            if (this._tasks[i].tick()) {
                this._tasks.splice(i, 1)[0]
                running = null
                break
            } else {
                running = this._tasks[i]
            }
        }
        return running
    }

    /**
     * @returns {Promise<boolean>}
     */
    cancel() {
        this._isStopping = true
        return new Promise(resolve => {
            let didSomething = false
            const interval = setInterval(() => {
                for (const task of this._tasks) {
                    task.cancel()
                    didSomething = true
                }
                if (this._tasks.length === 0) {
                    this._isStopping = false
                    clearInterval(interval)
                    resolve(didSomething)
                }
            }, 10)
        })
    }

    abort() {
        for (const task of this._tasks) {
            task.abort()
        }
    }
}
