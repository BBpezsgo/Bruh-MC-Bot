'use strict'

const ManagedTask = require('./managed-task')
const { replacer, reviver } = require('./serializing')

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
     * @private
     * @type {number}
     */
    _previousTask

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
        this._previousTask = -1
        this._tasks = []
        this._isStopping = false
    }

    /**
     * @template {{}} TArgs
     * @template TResult
     * @template TError
     * @param {import('./bruh-bot')} bot
     * @param {import('./task').TaskDef<TResult, TArgs>} task
     * @param {import('./task').CommonArgs<TArgs>} args
     * @param {Priority<TArgs>} priority
     * @param {boolean} save
     * @param {string | null} byPlayer
     * @param {boolean} isWhispered
     * @returns {ManagedTask<TResult, TArgs, TError> | null}
     */
    push(bot, task, args, priority, save, byPlayer, isWhispered) {
        if (this._isStopping) {
            return null
        }
        const id = (typeof task.id === 'string') ? task.id : task.id(args)
        const existingTask = this.get(id)

        if (existingTask) {
            let isUpdated = false
            if (typeof existingTask.rawPriority !== typeof priority) {
                existingTask.rawPriority = priority
                isUpdated = true
            }
            if (typeof existingTask.rawPriority === 'number' &&
                typeof priority === 'number' &&
                existingTask.rawPriority < priority) {
                existingTask.rawPriority = priority
                isUpdated = true
            }
            if (existingTask.save !== save) {
                existingTask.save = save
                isUpdated = true
            }
            if (existingTask._byPlayer !== byPlayer) {
                existingTask._byPlayer = byPlayer
                existingTask._isWhispered = isWhispered
                isUpdated = true
            }
            if (existingTask._isWhispered !== isWhispered) {
                existingTask._isWhispered = isWhispered
                isUpdated = true
            }
            return isUpdated ? existingTask : null
        }

        if (this._tasks.length > 10) {
            this._tasks.shift()
            this._previousTask--
            console.warn(`Too many tasks in _queue`)
        }

        /**
         * @type {ManagedTask<TResult, TArgs, TError>}
         */
        const newTask = new ManagedTask(
            priority,
            args,
            bot,
            task,
            save,
            byPlayer,
            isWhispered
        )

        this._tasks.push(newTask)

        return newTask
    }

    death() {
        for (let i = this._tasks.length - 1; i >= 0; i--) {
            const task = this._tasks[i]
            if (task.priority < 100 || task.id === 'mlg' || task.id === 'eat') {
                console.warn(`[Bot ?]: Task ${task.id} removed because I have died`)
                this._tasks.splice(i)
                if (this._previousTask === i) this._previousTask = -1
                else if (this._previousTask > i) this._previousTask--
            }
        }
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
     * @param {string} id
     */
    get(id) {
        if (id) {
            return this._tasks.find(v => v.id === id)
        }

        return undefined
    }

    tick() {
        if (this._tasks.length === 0) { return null }

        const i = TaskManager.findImportantTask(this._tasks)

        if (i === -1) { return null }

        if (this._previousTask !== i && this._previousTask !== -1) {
            console.warn(`Switching task, expect unexpected behavior!`)
        }

        this._previousTask = i

        if (this._isStopping && this._tasks[i].status === 'queued') {
            this._tasks.splice(i, 1)
            this._previousTask = -1
            return null
        }

        let running = null
        for (let step = 0; step < 3; step++) {
            if (this._tasks[i].tick()) {
                this._tasks.splice(i, 1)
                running = null
                this._previousTask = -1
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

    toJSON() {
        const _tasks = this._tasks
            .filter(v => !v.isDone && v.save)
            .map(v => v.toJSON())
            .filter(v => v)
        return JSON.stringify(_tasks, replacer)
    }

    /**
     * @param {import("./bruh-bot")} bot
     * @param {string} json
     * @param {(task: import('./managed-task').SavedManagedTask) => import('./task').CommonArgs<{}>} commonArgs 
     */
    fromJSON(bot, json, commonArgs) {
        const tasks = require('./tasks')
        /** @type {ReadonlyArray<import('./managed-task').SavedManagedTask>} */
        const rawTasks = JSON.parse(json, reviver)
        for (const rawTask of rawTasks) {
            /**
             * @type {import('./task').TaskDef<any, any, any>}
             */
            const definition = tasks[rawTask.definition]
            this.push(bot, definition, {
                ...rawTask.args,
                ...commonArgs(rawTask),
            }, rawTask.priority, true, 'byPlayer' in rawTask ? rawTask.byPlayer : null, 'isWhispered' in rawTask ? rawTask.isWhispered : false)
        }
    }
}
