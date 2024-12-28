/**
 * @template TKey
 */
module.exports = class Freq {
    /**
     * @readonly @type {Array<{ k: TKey; f: number; }>}
     */
    #entries

    /**
     * @readonly @type {(a: TKey, b: TKey) => boolean}
     */
    #comparer

    get isEmpty() { return this.#entries.length === 0 }

    get keys() { return this.#entries.map(v => v.k) }

    /**
     * @param {(a: TKey, b: TKey) => boolean} comparer
     */
    constructor(comparer) {
        this.#entries = []
        this.#comparer = comparer
    }

    /**
     * @param {TKey} key
     * @returns {number | undefined}
     */
    get(key) {
        for (const entry of this.#entries) {
            if (this.#comparer(entry.k, key)) {
                return entry.f
            }
        }
        return 0
    }

    /**
     * @param {TKey} key
     * @param {number} value
     */
    add(key, value = 1) {
        if (value === 0) { return }
        for (let i = 0; i < this.#entries.length; i++) {
            if (this.#comparer(this.#entries[i].k, key)) {
                this.#entries[i].f += value
                if (this.#entries[i].f === 0) {
                    this.#entries.splice(i, 1)
                }
                return
            }
        }
        this.#entries.push({ k: key, f: value })
    }

    /**
     * @param {TKey} key
     * @param {number} value
     */
    set(key, value) {
        if (value === 0) {
            this.remove(key)
            return
        }

        for (let i = 0; i < this.#entries.length; i++) {
            if (this.#comparer(this.#entries[i].k, key)) {
                this.#entries[i].f = value
            }
        }
        this.#entries.push({ k: key, f: value })
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
     * @param  {ReadonlyArray<Freq<TKey>>} entries
     */
    from(...entries) {
        for (const other of entries) {
            for (const otherEntry of other.#entries) {
                this.add(otherEntry.k, otherEntry.f)
            }
        }
    }

    /**
     * @returns {ReadonlyArray<Readonly<{ k: TKey; f: number; }>>}
     */
    toJSON() {
        return Object.freeze(this.#entries)
    }

    /**
     * @param {ReadonlyArray<Readonly<{ k: TKey; f: number; }>>} entries
     * @param {(a: TKey, b: TKey) => boolean} comparer
     */
    static fromJSON(entries, comparer) {
        const res = new Freq(comparer)
        for (const entry of entries) {
            res.set(entry.k, entry.f)
        }
        return res
    }
}
