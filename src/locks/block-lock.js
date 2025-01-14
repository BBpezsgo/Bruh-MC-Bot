const Lock = require('./generic')

module.exports = class BlockLock extends Lock {
    /**
     * @readonly
     * @type {Point3}
     */
    block

    /**
     * @param {string} by
     * @param {Point3} block
     */
    constructor(by, block) {
        super(by)
        this.block = block
    }
}
