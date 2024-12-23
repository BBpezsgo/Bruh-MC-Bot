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
    return Promise.race([task, timeoutPromise]);
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
    promise.then(v => resolvedValue = v)
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
 * @template {{ once: (event: string, callback: (...args: Array<any>) => void) => void }} TEmitter
 * @param {TEmitter} emitter
 * @param {Parameters<TEmitter['once']>[0]} event
 * @returns {import('../task').Task<Parameters<Parameters<emitter['once']>[1]>>}
 */
function* waitForEvent(emitter, event) {
    let emitted = false
    let args = null
    emitter.once(event, (..._args) => {
        emitted = true
        args = _args
    })
    while (!emitted) {
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
}
