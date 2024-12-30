'use strict'

const CancellationToken = require('./utils/cancellationToken')

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
     * @type {((reason: TError | 'cancelled' | 'aborted') => any) | null}
     */
    _reject

    /**
     * @private
     * @type {TypedPromise<TResult, TError | 'cancelled' | 'aborted'> | null}
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

    //#endregion

    /**
     * @param {import('./task-manager').Priority<TArgs>} priority
     * @param {import('./task').CommonArgs<TArgs>} args
     * @param {import('./bruh-bot')} bot
     * @param {import('./task').TaskDef<TResult, TArgs>} def
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
            cancellationToken: new CancellationToken(),
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
    }

    /**
     * @returns {TypedPromise<TResult, TError | 'cancelled' | 'aborted'>}
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

    cancel() {
        if (!this._task) {
            this._status = 'cancelled'
        } else {
            this._status = 'cancelling'
            //@ts-ignore
            this._task = this.args.cancellationToken.trigger()
        }
    }

    abort() {
        this._status = 'aborted'
        if (!this._task) { return }

        this._task.throw('aborted')
        console.log(`[Tasks] Task "${this.id}" aborted`)
    }

    tick() {
        if (this._status === 'cancelled') {
            console.log(`[Tasks] Task "${this.id}" cancelled`)
            if (this._reject) { this._reject('cancelled') }
            return true
        }

        if (!this._task && this._status !== 'cancelling') {
            this._task = this._def.task(this._bot, this.args)
            this._status = 'running'
            if (!this.args.silent) {
                console.log(`[Bot "${this._bot.bot.username}"] Task "${this.id}" started`)
            }
        }

        try {
            const v = this._task.next()
            if (v.done) {
                if (this._status === 'cancelling') {
                    this._status = 'cancelled'
                    if (!this.args.silent) {
                        if (v.value === undefined) {
                            console.log(`[Bot "${this._bot.bot.username}"] Task "${this.id}" cancelled gracefully`)
                        } else {
                            console.log(`[Bot "${this._bot.bot.username}"] Task "${this.id}" cancelled gracefully with result`, v.value)
                        }
                    }
                    if (this._reject) { this._reject('cancelled') }
                } else {
                    this._status = 'done'
                    if (!this.args.silent) {
                        if (v.value === undefined) {
                            console.log(`[Bot "${this._bot.bot.username}"] Task "${this.id}" finished`)
                        } else {
                            console.log(`[Bot "${this._bot.bot.username}"] Task "${this.id}" finished with result`, v.value)
                        }
                    }
                    if (this._resolve) { this._resolve(v.value) }
                }
                return true
            } else {
                this._status = 'running'
                return false
            }
        } catch (error) {
            this._status = 'failed'
            console.error(`[Bot "${this._bot.bot.username}"] Task "${this.id}" failed:`, error)
            if (this._reject) { this._reject(error) }
            return true
        }
    }

    /**
     * @returns {SavedManagedTask | undefined}
     */
    toJSON() {
        if (!this._def.definition) { return undefined }

        /** @type {import('./task').CommonArgs<TArgs>} */
        const _args = { ...this.args }

        delete _args['response']

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
 * @template {import('./task').TaskDef<any, any, any>} TTask
 * @typedef {TTask extends import('./task').TaskDef<any, infer T> ? T : never} TaskArgs
 */

/**
 * @exports
 * @template {import('./task').TaskDef<any, any>} TTask
 * @template {any} [TError = any]
 * @typedef {ManagedTask<TaskResult<TTask>, TaskArgs<TTask>, TError>} AsManaged
 */

module.exports = ManagedTask
