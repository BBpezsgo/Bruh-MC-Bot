'use strict'

const CancelledError = require('./errors/cancelled-error')
const Interrupt = require('./utils/interrupt')

/**
 * @typedef {{
 *   args: NonNullable<object>;
 *   priority?: number | undefined;
 *   definition: import('./tasks').TaskId;
 * } & ({
 *   byPlayer: string;
 *   isWhispered: boolean;
 * } | {
 * })} SavedManagedTask
 */

/**
 * @typedef {'queued' | 'running' | 'done' | 'failed' | 'cancelled' | 'aborted' | 'interrupted'} TaskStatus
 */

/**
 * @template [TResult = any]
 * @template {{}} [TArgs = {}]
 */
class ManagedTask {

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
    get id() { return (typeof this._def.id === 'string') ? this._def.id : this._def.id(this.args) }

    /**
     * @readonly
     * @type {string | null}
     */
    get humanReadableId() { return !this._def.humanReadableId ? null : (typeof this._def.humanReadableId === 'string') ? this._def.humanReadableId : this._def.humanReadableId(this.args) }

    /**
     * @readonly
     * @type {number}
     */
    get priority() {
        return (typeof this._priority === 'number') ? this._priority : this._priority(this.args)
    }

    get rawPriority() {
        return this._priority
    }

    set rawPriority(value) {
        this._priority = value
    }

    /**
     * @readonly
     * @type {import('./task').RuntimeArgs<TArgs>}
     */
    args

    /**
     * @type {boolean}
     */
    save

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
     * @type {((value: TResult) => any) | null}
     */
    _resolve

    /**
     * @type {((reason: Error | CancelledError | 'aborted' | string) => any) | null}
     */
    _reject

    /**
     * @private
     * @type {TypedPromise<TResult, Error | CancelledError | 'aborted' | string> | null}
     */
    _promise

    /**
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
     * @type {import('./task').TaskDef<TResult, TArgs>}
     */
    _def

    /**
     * @type {string | null}
     */
    _byPlayer

    /**
     * @type {boolean}
     */
    _isWhispered

    /**
     * @type {boolean}
     */
    _isBackground

    /**
     * @readonly
     * @type {string}
     */
    _stackTrace

    //#endregion

    /**
     * @param {import('./task-manager').Priority<TArgs>} priority
     * @param {import('./task').CommonArgs<TArgs>} args
     * @param {import('./bruh-bot')} bot
     * @param {import('./task').TaskDef<TResult, TArgs, {}>} def
     * @param {boolean} save
     * @param {string | null} byPlayer
     * @param {boolean} isWhispered
     */
    constructor(
        priority,
        args,
        bot,
        def,
        save,
        byPlayer,
        isWhispered
    ) {
        this._priority = priority
        this._status = 'queued'
        this.args = {
            ...args,
            interrupt: new Interrupt(),
            task: this,
            response: args.response ?? null,
            silent: args.silent ?? false,
        }
        this._bot = bot
        this._def = def
        this._task = null
        this._promise = null
        this._resolve = null
        this._reject = null
        this.save = save
        this._byPlayer = byPlayer
        this._isWhispered = isWhispered
        this._isBackground = false
        this._stackTrace = new Error().stack.replace('Error', '')
        this._stackTrace = this._stackTrace.split('\n').filter((v, i) => {
            if (i > 2) return true
            if (v.startsWith('    at new ManagedTask ')) return false
            if (v.startsWith('    at TaskManager.push ')) return false
            return true
        }).join('\n')
    }

    /**
     * @returns {TypedPromise<TResult, Error | CancelledError | 'aborted' | string>}
     */
    wait() {
        if (!this._promise) {
            // @ts-ignore
            this._promise = new Promise((resolve, reject) => {
                this._resolve = resolve
                this._reject = reject
            })
        }
        return this._promise
    }

    interrupt() {
        if (this._status !== 'running') return
        this.args.interrupt.trigger('interrupt')
        this._status = 'interrupted'
        console.log(`[Bot "${this._bot.bot.username}"] Task "${this.id}" interrupted`)
    }

    resume() {
        if (this._status !== 'interrupted') return
        this._status = 'running'
        console.log(`[Bot "${this._bot.bot.username}"] Task "${this.id}" resumed`)
    }

    cancel() {
        if (!this._task) {
            this._status = 'cancelled'
        } else {
            this._status = 'cancelled'
            this.args.interrupt.trigger('cancel')
        }
    }

    blur() {
        if (!this._isBackground) {
            console.log(`[Bot "${this._bot.username}"] Task "${this.id}" blurred`)
            this._isBackground = true
            return true
        }
        return false
    }

    focus() {
        if (this._isBackground) {
            console.log(`[Bot "${this._bot.bot.username}"] Task "${this.id}" focused`)
            this._isBackground = false
            return true
        }
        return false
    }

    abort() {
        this._status = 'aborted'
        if (!this._task) { return }

        this._task.throw('aborted')
        console.log(`[Bot "${this._bot.bot.username}"] Task "${this.id}" aborted`)
    }

    tick() {
        if (this._status === 'cancelled') {
            console.log(`[Bot "${this._bot.bot.username}"] Task "${this.id}" cancelled`)
            if (this._reject) { this._reject(new CancelledError()) }
            return false
        }

        if (this._status === 'interrupted') {
            return true
        }

        if (!this._task) {
            this._task = this._def.task(this._bot, this.args)
            this._status = 'running'
            if (!this.args.silent) {
                console.log(`[Bot "${this._bot.bot.username}"] Task "${this.id}" started`)
            }
        }

        try {
            const v = this._task.next()
            if (v.done) {
                this._status = 'done'
                if (!this.args.silent) {
                    if (v.value === undefined) {
                        console.log(`[Bot "${this._bot.bot.username}"] Task "${this.id}" finished`)
                    } else {
                        console.log(`[Bot "${this._bot.bot.username}"] Task "${this.id}" finished with result`, v.value)
                    }
                }
                if (this._resolve) { this._resolve(v.value) }
                return false
            } else {
                this._status = 'running'
                return true
            }
        } catch (error) {
            this._status = 'failed'
            if (!(error instanceof Error)) {
                console.error(`[Bot "${this._bot.bot.username}"] Task "${this.id}" failed:`, error, this._stackTrace)
            } else {
                console.error(`[Bot "${this._bot.bot.username}"] Task "${this.id}" failed:`, error)
            }
            if (this._reject) { this._reject(error) }
            return false
        }
    }

    /**
     * @returns {SavedManagedTask | undefined}
     */
    toJSON() {
        if (!this._def.definition) { return undefined }

        const _args = { ...this.args }

        delete _args['response']
        delete _args['task']

        for (const key of /** @type {Array<keyof import('./task').CommonArgs<TArgs>>} */ (Object.keys(_args))) {
            const arg = _args[key]
            if (typeof arg === 'function') { delete _args[key] }
            if (typeof arg === 'symbol') { delete _args[key] }
        }

        /** @type {SavedManagedTask} */
        let result = {
            args: _args,
            priority: (typeof this._priority === 'number') ? this._priority : undefined,
            definition: this._def.definition,
        }

        if (this._byPlayer) {
            result = {
                ...result,
                byPlayer: this._byPlayer,
                isWhispered: this._isWhispered,
            }
        }

        return result
    }
}

/**
 * @exports
 * @template {import('./task').TaskDef<any, {}, any>} TTask
 * @typedef {TTask extends import('./task').TaskDef<infer T, any> ? T : never} TaskResult
 */

/**
 * @exports
 * @template {import('./task').TaskDef<any, {}, any>} TTask
 * @typedef {TTask extends import('./task').TaskDef<any, infer T> ? T : never} TaskArgs
 */

/**
 * @exports
 * @template {import('./task').TaskDef<any, {}, any>} TTask
 * @typedef {ManagedTask<TaskResult<TTask>, TaskArgs<TTask>>} AsManaged
 */

module.exports = ManagedTask
