'use strict'

const ManagedTask = require('./managed-task')
const { replacer, reviver } = require('./utils/serializing')

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
    get isIdle() { return this.#tasks.length === 0 }

    /**
     * @readonly
     * @returns {boolean}
     */
    get isIdleOrThinking() { return this.#tasks.length === 0 || this.#tasks.every(v => v._isBackground) }

    /**
     * @returns {ReadonlyArray<ManagedTask>}
     */
    get tasks() { return this.#tasks }

    /** @returns {number} */
    get timeSinceImportantTask() { return performance.now() - this.#timeSinceImportantTask }

    /** @returns {number} */
    get timeSinceImportantThinkingOrTask() { return performance.now() - this.#timeSinceImportantThinkingOrTask }

    /** @type {number} */ #previousTask
    /** @readonly @type {Array<ManagedTask>} */ #tasks
    /** @type {boolean} */ #isStopping
    /** @type {number} */ #timeSinceImportantTask
    /** @type {number} */ #timeSinceImportantThinkingOrTask

    constructor() {
        this.#previousTask = -1
        this.#tasks = []
        this.#isStopping = false
        this.#timeSinceImportantTask = 0
        this.#timeSinceImportantThinkingOrTask = 0
    }

    /**
     * @template {{}} TArgs
     * @template TResult
     * @param {import('./bruh-bot')} bot
     * @param {import('./task').TaskDef<TResult, TArgs>} task
     * @param {import('./task').CommonArgs<TArgs>} args
     * @param {Priority<TArgs>} priority
     * @param {boolean} save
     * @param {string | null} byPlayer
     * @param {boolean} isWhispered
     * @returns {ManagedTask<TResult, TArgs> | null}
     */
    push(bot, task, args, priority, save, byPlayer, isWhispered) {
        if (this.#isStopping) {
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

        if (this.#tasks.length > 10) {
            this.#tasks.shift()
            this.#previousTask--
            console.warn(`Too many tasks in queue`)
        }

        /**
         * @type {ManagedTask<TResult, TArgs>}
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

        this.#tasks.push(newTask)

        return newTask
    }

    death() {
        for (let i = this.#tasks.length - 1; i >= 0; i--) {
            const task = this.#tasks[i]
            if (task.priority < 100 || task.id === 'mlg' || task.id === 'eat') {
                console.warn(`[Bot ?]: Task ${task.id} removed because I have died`)
                this.#tasks.splice(i)
                if (this.#previousTask === i) this.#previousTask = -1
                else if (this.#previousTask > i) this.#previousTask--
            }
        }
    }

    /**
     * @private
     * @param {ReadonlyArray<ManagedTask>} tasks
     * @param {boolean} background
     * @returns {number}
     */
    static findImportantTask(tasks, background) {
        let maxPriority = null
        let index = -1
        for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i]
            if (task._isBackground !== background) { continue }
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
            return this.#tasks.find(v => v.id === id)
        }

        return undefined
    }

    tick() {
        if (this.#tasks.length === 0) { return null }

        const backgroundTaskIndex = TaskManager.findImportantTask(this.#tasks, true)

        if (backgroundTaskIndex !== -1) {
            if (this.#tasks[backgroundTaskIndex].status === 'running') {
                if (this.#tasks[backgroundTaskIndex].priority > 0) {
                    this.#timeSinceImportantThinkingOrTask = performance.now()
                }
                this.#tasks[backgroundTaskIndex].tick()
            } else {
                this.#tasks[backgroundTaskIndex].focus()
            }
        }

        const focusedTaskIndex = TaskManager.findImportantTask(this.#tasks, false)

        if (focusedTaskIndex !== -1) {
            if (this.#previousTask !== focusedTaskIndex && this.#previousTask !== -1) {
                const prev = this.#tasks[this.#previousTask]
                if (prev) {
                    prev.interrupt()
                }
            }

            this.#previousTask = focusedTaskIndex

            this.#tasks[focusedTaskIndex].resume()

            if (this.#isStopping && this.#tasks[focusedTaskIndex].status === 'queued') {
                this.#tasks.splice(focusedTaskIndex, 1)
                this.#previousTask = -1
                return null
            }

            if (this.#tasks[focusedTaskIndex].priority > 0) {
                this.#timeSinceImportantTask = performance.now()
                this.#timeSinceImportantThinkingOrTask = performance.now()
            }

            if (this.#tasks[focusedTaskIndex].tick()) {
                this.#tasks.splice(focusedTaskIndex, 1)
                this.#previousTask = -1
                return null
            } else {
                return this.#tasks[focusedTaskIndex]
            }
        }

        return null
    }

    /**
     * @returns {Promise<boolean>}
     */
    cancel() {
        this.#isStopping = true
        return new Promise(resolve => {
            let didSomething = false
            const interval = setInterval(() => {
                for (const task of this.#tasks) {
                    task.cancel()
                    didSomething = true
                }
                if (this.#tasks.length === 0) {
                    this.#isStopping = false
                    clearInterval(interval)
                    resolve(didSomething)
                }
            }, 10)
        })
    }

    abort() {
        for (const task of this.#tasks) {
            task.abort()
        }
    }

    interrupt() {
        for (const task of this.#tasks) {
            task.interrupt()
        }
    }

    resume() {
        for (const task of this.#tasks) {
            task.resume()
        }
    }

    toJSON() {
        const _tasks = this.#tasks
            .filter(v => !v.isDone && v.save)
            .map(v => v.toJSON())
            .filter(v => v)
        return JSON.stringify(_tasks, replacer)
    }

    /**
     * @param {import('./bruh-bot')} bot
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
