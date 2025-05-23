'use strict'

/**
 * @param {number} ms
 * @returns {import('../task').Task<void>}
 */
function* sleepG(ms) {
    const end = performance.now() + ms

    while (performance.now() < end) {
        yield
    }
}

/**
 * @param {number} [ticks = 1]
 * @returns {import('../task').Task<void>}
 */
function* sleepTicks(ticks = 1) {
    const end = performance.now() + ticks * 50

    while (performance.now() < end) {
        yield
    }
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

/**
 * @template T
 * @param {Promise<T> | (() => Promise<T>)} promise
 * @param {import('./interrupt') | null} interrupt
 * @returns {import('../task').Task<T>}
 */
function* wrap(promise, interrupt = null) {
    if (typeof promise === 'function') { promise = promise() }
    const stacktrace = new Error().stack.replace('Error', '')

    const onInterrupt = (/** @type {'cancel' | 'interrupt'} */ type) => {
        if (type === 'cancel') {
            console.warn(`Task cancelled while a promise is running`, stacktrace)
            interrupt?.off(onInterrupt)
        } else {
            console.warn(`Task interrupted while a promise is running`, stacktrace)
        }
    }

    interrupt?.on(onInterrupt)

    let isDone = false
    /** @type {any | undefined} */
    let error = undefined
    /** @type {T | undefined} */
    let resolvedValue = undefined
    promise
        .then(v => resolvedValue = v)
        .catch(v => error = v)
        .finally(() => isDone = true)

    while (!isDone) {
        yield
    }

    interrupt?.off(onInterrupt)

    if (error) {
        throw error
    } else {
        return resolvedValue
    }
}

/**
 * @template TEvent
 * @template {{
 *   once: (event: TEvent, callback: (...args: Array<any>) => void) => void;
 *   off: (event: TEvent, callback: (...args: Array<any>) => void) => void;
 * }} TEmitter
 * @param {TEmitter} emitter
 * @param {Parameters<TEmitter['once']>[0]} event
 * @param {import('./interrupt') | null} [interrupt=null]
 * @returns {import('../task').Task<Parameters<Parameters<emitter['once']>[1]>>  | null}
 */
function* waitForEvent(emitter, event, interrupt = null) {
    let emitted = false
    let args = null
    const onEmitted = (/** @type {Array<any>} */ ..._args) => {
        emitted = true
        args = _args
    }
    emitter.once(event, onEmitted)
    interrupt?.once(() => emitter.off(event, onEmitted))
    while (!emitted) {
        if (interrupt?.isCancelled) return null
        yield
    }
    return args
}

/**
 * @param {ReadonlyArray<import('../task').Task<any>>} tasks
 * @returns {import('../task').Task<Array<any>>}
 */
function* parallelAll(...tasks) {
    /**
     * @type {ReadonlyArray<{
     *   task: import('../task').Task<any>;
     *   value: IteratorResult<any, any> | null;
     * }>}
     */
    const context = tasks.map(v => ({
        task: v,
        /** @type {any} */
        value: null,
    }))
    while (true) {
        yield
        let isDone = true
        for (const item of context) {
            if (item.value?.done) { continue }
            isDone = false
            item.value = item.task.next()
        }
        if (isDone) { break }
    }
    return context.map(v => v.value.value)
}

/**
 * @template T
 * @typedef {{
 *   task: import('../task').Task<T>;
 *   callback: (result: T) => void;
 * }} TaskInParallel
 */

/**
 * @param {ReadonlyArray<TaskInParallel<any> | import('../task').Task<any>>} tasks
 * @returns {import('../task').Task<void>}
 */
function* parallel(tasks) {
    /**
     * @type {ReadonlyArray<{
     *   task: import('../task').Task<any>;
     *   value: IteratorResult<any, any> | null;
     *   callback: (result: any) => void;
     * }>}
     */
    const context = tasks.map(v => 'next' in v ? ({
        task: v,
        callback: () => { },
        /** @type {any} */
        value: null,
    }) : ({
        task: v.task,
        callback: v.callback,
        /** @type {any} */
        value: null,
    }))
    while (true) {
        yield
        let isDone = true
        for (const item of context) {
            if (item.value?.done) { continue }
            isDone = false
            item.value = item.task.next()
            if (item.value.done) {
                item.callback(item.value.value)
            }
        }
        if (isDone) { break }
    }
}

/**
 * @template {ReadonlyArray<import("../task").Task<any>>} TTasks
 * @param {TTasks} tasks
 * @returns {import('../task').Task<Parameters<TTasks[number]['return']>[0]>}
 */
function* race(tasks) {
    while (true) {
        yield
        for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i]
            const v = task.next()
            if (v.done) {
                return v.value
            }
        }
    }
}

/**
 * @template T
 * @param {import('../task').Task<T>} task
 * @param {import('./interrupt')} interrupt
 * @returns {import('../task').Task<{ cancelled: true; result: undefined; } | { cancelled: false; result: T; }>}
 */
function* withInterruption(task, interrupt) {
    while (true) {
        const v = task.next()
        if (v.done) return { cancelled: false, result: v.value }
        if (interrupt.isCancelled) { return { cancelled: true, result: undefined } }

        yield
    }
}

/**
 * @template {{}} TArgs
 * @param {import('../task').RuntimeArgs<TArgs>} args
 * @returns {import('../task').RuntimeArgs<{}>}
 */
function runtimeArgs(args) {
    return {
        interrupt: args.interrupt,
        response: args.response,
        silent: args.silent,
        task: args.task,
        log: args.log,
        warn: args.warn,
        error: args.error,
    }
}

module.exports = {
    sleepG,
    sleep,
    wrap,
    waitForEvent,
    sleepTicks,
    parallelAll,
    parallel,
    race,
    withInterruption,
    runtimeArgs,
}
