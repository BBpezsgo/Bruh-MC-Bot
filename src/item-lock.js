module.exports = class ItemLock {
    /**
     * @readonly
     * @type {string | null}
     */
    by

    /**
     * @readonly
     * @type {import('./utils/other').ItemId}
     */
    item

    /**
     * @type {number}
     */
    count

    /**
     * @type {boolean}
     */
    isUnlocked

    /**
     * @readonly
     * @type {number}
     */
    time

    /**
     * @readonly
     * @type {string}
     */
    stack

    /**
     * @type {boolean}
     */
    timeoutNotified

    /**
     * @param {string} by
     * @param {import('./utils/other').ItemId} item
     * @param {number} count
     */
    constructor(by, item, count) {
        if (count <= 0) { console.warn(`Item locked with count of zero`) }
        this.by = by
        this.item = item
        this.count = count
        this.isUnlocked = false
        this.time = performance.now()
        this.stack = new Error().stack.replace('Error', '')
        this.timeoutNotified = false
    }
}
