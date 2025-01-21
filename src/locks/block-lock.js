const Vec3Dimension = require('../utils/vec3-dimension')
const Lock = require('./generic')

/**
 * @typedef {'use' | 'dig' | 'place'} BlockLockReason
 */

module.exports = class BlockLock extends Lock {
    /** @readonly @type {Vec3Dimension} */ block
    /** @readonly @type {BlockLockReason} */ reason
    /** @readonly @type {ReadonlyArray<Point3>} */ additionalPoints

    /**
     * @param {string} by
     * @param {Vec3Dimension} block
     * @param {BlockLockReason} reason
     * @param {ReadonlyArray<Point3>} additionalPoints
     */
    constructor(by, block, reason, additionalPoints) {
        super(by)
        this.block = block
        this.reason = reason
        this.additionalPoints = additionalPoints
    }
}
