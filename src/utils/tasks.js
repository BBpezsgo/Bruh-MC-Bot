/**
 * @param {number} ms
 * @returns {Generator<void, void, void>}
 */
function* sleepG(ms) {
    const end = performance.now() + ms

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
 * @returns {Generator<void, T, void>}
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
        // @ts-ignore
        return resolvedValue
    }
}

/**
 * @template {string} TEvent
 * @param {TEvent} event
 * @param {{ once: (event: TEvent, callback: (...args: any[]) => void) => void }} emitter
 * @returns {import('../task').Task<Array<any>>}
 */
function* waitForEvent(emitter, event) {
    let emitted = false
    let args = null
    // @ts-ignore
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
 * @returns {Generator<void, T, void>}
 */
function* finished(result) {
    return result
}

module.exports = {
    sleepG,
    sleep,
    timeout,
    wrap,
    finished,
    waitForEvent,
}
