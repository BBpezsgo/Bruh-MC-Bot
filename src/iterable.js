/**
 * @template T
 * @implements {Iterable<T>}
 */
module.exports = class Iterable {
    /**
     * @private @readonly
     * @type {() => Iterator<T>}
     */
    iterator

    /**
     * @param {() => Iterator<T>} iterator
     */
    constructor(iterator) {
        this.iterator = iterator
    }

    [Symbol.iterator]() { return this.iterator() }

    /**
     * @returns {Array<T>}
     */
    toArray() {
        const result = []
        const iterator = this.iterator()

        while (true) {
            const v = iterator.next()
            if (v.done === true) { break }
            result.push(v.value)
        }

        return result
    }

    /**
     * @returns {boolean}
     */
    isEmpty() {
        const iterator = this.iterator()
        const v = iterator.next()
        return !!v.done
    }

    /**
     * @returns {T | undefined}
     */
    first() {
        const iterator = this.iterator()
        const result = iterator.next()
        if (result.done === true) { return undefined }
        return result.value
    }

    /**
     * @param {(value: T, index: number) => void} callbackfn 
     */
    forEach(callbackfn) {
        const iterator = this.iterator()
        let i = 0

        while (true) {
            const v = iterator.next()
            if (v.done === true) { break }
            callbackfn(v.value, i++)
        }
    }

    /**
     * @param {(value: T, index: number) => boolean} predicate 
     * @returns {Iterable<T>}
     */
    filter(predicate) {
        const iterator = this.iterator()
        return new Iterable(function*() {
            let i = 0

            while (true) {
                const v = iterator.next()
                if (v.done === true) { break }
                if (predicate(v.value, i++)) {
                    yield v.value
                }
            }
        })
    }

    /**
     * @template U
     * @param {(value: T, index: number) => U} callbackfn
     * @returns {Iterable<U>}
     */
    map(callbackfn) {
        const iterator = this.iterator()
        return new Iterable(function*() {
            let i = 0

            while (true) {
                const v = iterator.next()
                if (v.done === true) { break }
                yield callbackfn(v.value, i++)
            }
        })
    }
}
