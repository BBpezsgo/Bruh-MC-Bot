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
 * @param {Promise<T>} task
 * @param {number} ms
 * @returns {Promise<T>}
 */
function timeout(task, ms) {
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
            reject('Time Limit Exceeded')
        }, ms)
    })
    return Promise.race([task, timeoutPromise])
}

/**
 * @template T
 * @param {Promise<T> | (() => Promise<T>)} promise
 * @returns {import('../task').Task<T>}
 */
function* wrap(promise) {
    if (typeof promise === 'function') { promise = promise() }

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

    if (error) {
        throw error
    } else {
        return resolvedValue
    }
}

/**
 * @typedef {{ isCancelled: boolean; }} CancellationToken
 */

/**
 * @template TEvent
 * @template {{
 *   once: (event: TEvent, callback: (...args: Array<any>) => void) => void;
 *   off: (event: TEvent, callback: (...args: Array<any>) => void) => void;
 * }} TEmitter
 * @param {TEmitter} emitter
 * @param {Parameters<TEmitter['once']>[0]} event
 * @param {CancellationToken | null} [cancellationToken=null]
 * @returns {import('../task').Task<Parameters<Parameters<emitter['once']>[1]>>  | null}
 */
function* waitForEvent(emitter, event, cancellationToken = null) {
    let emitted = false
    let args = null
    const onEmitted = (/** @type {Array<any>} */ ..._args) => {
        emitted = true
        args = _args
    }
    emitter.once(event, onEmitted)
    while (!emitted) {
        if (cancellationToken?.isCancelled) {
            emitter.off(event, onEmitted)
            return null
        }
        yield
    }
    return args
}

/**
 * @template T
 * @param {T} result
 * @returns {import('../task').Task<T>}
 */
function* finished(result) {
    return result
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
 * @param {ReadonlyArray<TaskInParallel<any>>} tasks
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
    const context = tasks.map(v => ({
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
 * @param {CancellationToken} cancellationToken
 * @returns {import('../task').Task<{ cancelled: true; result: undefined; } | { cancelled: false; result: T; }>}
 */
function* withCancellation(task, cancellationToken) {
    while (true) {
        const v = task.next()
        if (v.done) return { cancelled: false, result: v.value }
        if (cancellationToken.isCancelled) { return { cancelled: true, result: v.value } }

        yield
    }
}

module.exports = {
    sleepG,
    sleep,
    timeout,
    wrap,
    finished,
    waitForEvent,
    sleepTicks,
    parallelAll,
    parallel,
    race,
    withCancellation,
}
