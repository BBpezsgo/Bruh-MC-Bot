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

    /** @type {ManagedTask} */ #previousTask
    /** @readonly @type {Array<ManagedTask>} */ #tasks
    /** @type {boolean} */ #isStopping
    /** @type {number} */ #timeSinceImportantTask
    /** @type {number} */ #timeSinceImportantThinkingOrTask

    constructor() {
        this.#previousTask = null
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
     * @param {boolean} [isBackground]
     * @returns {ManagedTask<TResult, TArgs> | null}
     */
    push(bot, task, args, priority, save, byPlayer, isWhispered, isBackground) {
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

        if (this.#tasks.length > 50) {
            if (this.#previousTask === this.#tasks[0]) this.#previousTask = null
            this.#tasks.shift()
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

        newTask._isBackground = !!isBackground

        let added = false
        for (let i = 0; i < this.#tasks.length; i++) {
            const other = this.#tasks[i]
            if (other.priority < newTask.priority) {
                this.#tasks.splice(i, 0, newTask)
                added = true
                break
            }
        }
        if (!added) this.#tasks.push(newTask)

        return newTask
    }

    death() {
        for (let i = this.#tasks.length - 1; i >= 0; i--) {
            const task = this.#tasks[i]
            console.warn(`[Bot ?]: Task ${task.id} removed because I have died`)
            task.cancel('death')
            this.#tasks.splice(i)
            if (this.#previousTask === task) this.#previousTask = null
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
        const backgroundTask = this.#tasks[backgroundTaskIndex]

        if (backgroundTaskIndex !== -1) {
            backgroundTask.resume()

            if (backgroundTask.priority > 0) {
                this.#timeSinceImportantThinkingOrTask = performance.now()
            }

            if (!backgroundTask.tick()) {
                this.#tasks.splice(backgroundTaskIndex, 1)
            }
        }

        const focusedTaskIndex = TaskManager.findImportantTask(this.#tasks, false)
        const focusedTask = this.#tasks[focusedTaskIndex]

        if (focusedTaskIndex !== -1) {
            if (this.#previousTask && this.#previousTask !== focusedTask) {
                this.#previousTask.interrupt({ repalcementTask: focusedTask })
            }

            this.#previousTask = focusedTask

            focusedTask.resume()

            if (focusedTask.priority > 0) {
                this.#timeSinceImportantTask = performance.now()
                this.#timeSinceImportantThinkingOrTask = performance.now()
            }

            if (focusedTask.tick()) {
                return focusedTask
            } else {
                this.#tasks.splice(focusedTaskIndex, 1)
                this.#previousTask = null
                return null
            }
        }

        return null
    }

    /**
     * @param {any} [reason]
     * @returns {Promise<boolean>}
     */
    cancel(reason) {
        this.#isStopping = true
        return new Promise(resolve => {
            let didSomething = false
            const interval = setInterval(() => {
                for (const task of this.#tasks) {
                    task.cancel(reason)
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

    /**
     * @param {any} [reason]
     */
    interrupt(reason) {
        for (const task of this.#tasks) {
            task.interrupt(reason)
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
