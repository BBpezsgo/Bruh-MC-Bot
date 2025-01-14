const Lock = require('./generic')

module.exports = class EntityLock extends Lock {
    /**
     * @readonly
     * @type {import('prismarine-entity').Entity}
     */
    entity

    /**
     * @param {string} by
     * @param {import('prismarine-entity').Entity} entity
     */
    constructor(by, entity) {
        super(by)
        this.entity = entity
    }
}
