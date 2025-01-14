const Lock = require('./generic')

module.exports = class ItemLock extends Lock {
    /**
     * @readonly
     * @type {import('../utils/other').ItemId}
     */
    item

    /**
     * @type {number}
     */
    count

    /**
     * @param {string} by
     * @param {import('../utils/other').ItemId} item
     * @param {number} count
     */
    constructor(by, item, count) {
        if (count <= 0) { console.warn(`Item locked with count of zero`) }
        super(by)
        this.item = item
        this.count = count
    }
}
