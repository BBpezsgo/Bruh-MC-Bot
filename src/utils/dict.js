/**
 * @template TKey
 * @template TValue
 * @typedef {{ k: TKey; v: TValue; }} KVPair
 */

/**
 * @template TKey
 * @template TValue
 */
module.exports = class Dict {
    /**
     * @readonly @type {Array<KVPair<TKey, TValue>>}
     */
    #entries

    /**
     * @readonly @type {(a: TKey, b: TKey) => boolean}
     */
    #comparer

    /**
     * @param {(a: TKey, b: TKey) => boolean} comparer
     */
    constructor(comparer) {
        this.#entries = []
        this.#comparer = comparer
    }

    /**
     * @param {TKey} key
     */
    get(key) {
        for (const entry of this.#entries) {
            if (this.#comparer(entry.k, key)) {
                return entry.v
            }
        }
        return undefined
    }

    /**
     * @param {TKey} key
     * @param {TValue} value
     */
    set(key, value) {
        for (const entry of this.#entries) {
            if (this.#comparer(entry.k, key)) {
                entry.v = value
                return
            }
        }
        this.#entries.push({ k: key, v: value })
    }

    /**
     * @param {TKey} key
     */
    remove(key) {
        for (let i = 0; i < this.#entries.length; i++) {
            if (this.#comparer(this.#entries[i].k, key)) {
                this.#entries.splice(i, 1)
                return true
            }
        }
        return false
    }

    /**
     * @returns {ReadonlyArray<Readonly<KVPair<TKey, TValue>>>}
     */
    toJSON() {
        return this.#entries
    }

    /**
     * @template TKey
     * @template TValue
     * @param {Array<KVPair<TKey, TValue>>} entries
     * @param {(a: TKey, b: TKey) => boolean} comparer
     * @returns {Dict<TKey, TValue>}
     */
    static fromJSON(entries, comparer) {
        const res = new Dict(comparer)
        for (const entry of entries) {
            res.set(entry.k, entry.v)
        }
        return res
    }
}
