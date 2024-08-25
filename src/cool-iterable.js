/**
 * @template T
 * @implements {Iterable<T>}
 */
module.exports = class CoolIterable {
    /**
     * @private @readonly
     * @type {() => Generator<T>}
     */
    generator

    /**
     * @param {() => Generator<T>} generator
     */
    constructor(generator) {
        this.generator = generator
    }

    [Symbol.iterator]() { return this.generator() }

    /**
     * @returns {Array<T>}
     */
    toArray() {
        const result = []
        const gen = this.generator()

        while (true) {
            const v = gen.next()
            if (v.done === true) { break }
            result.push(v.value)
        }

        return result
    }

    /**
     * @returns {boolean}
     */
    isEmpty() {
        const gen = this.generator()
        const v = gen.next()
        return !!v.done
    }

    /**
     * @returns {T | undefined}
     */
    first() {
        const gen = this.generator()
        const result = gen.next()
        return result.value
    }

    /**
     * @param {(value: T, index: number) => void} callbackfn 
     */
    forEach(callbackfn) {
        const gen = this.generator()
        let i = 0

        while (true) {
            const v = gen.next()
            if (v.done === true) { break }
            callbackfn(v.value, i++)
        }
    }

    /**
     * @param {(value: T, index: number) => boolean} predicate 
     * @returns {CoolIterable<T>}
     */
    filter(predicate) {
        const gen = this.generator()
        return new CoolIterable(function*() {
            let i = 0
    
            while (true) {
                const v = gen.next()
                if (v.done === true) { break }
                if (predicate(v.value, i++)) {
                    yield v.value
                }
            }
        })
    }
}
