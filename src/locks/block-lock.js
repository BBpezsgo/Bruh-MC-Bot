const Lock = require('./generic')

module.exports = class BlockLock extends Lock {
    /** @readonly @type {Point3} */ block
    /** @readonly @type {ReadonlyArray<Point3>} */ additionalPoints

    /**
     * @param {string} by
     * @param {Point3} block
     * @param {ReadonlyArray<Point3>} additionalPoints
     */
    constructor(by, block, additionalPoints) {
        super(by)
        this.block = block
        this.additionalPoints = additionalPoints
    }
}
