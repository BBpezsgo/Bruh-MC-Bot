const { Vec3 } = require('vec3')

/**
 * @this {any}
 * @param {string} key
 * @param {any} value
 * @returns {any}
 */
function reviver(key, value) {
    if (value &&
        (typeof value === 'object') &&
        ('x' in value) &&
        ('y' in value) &&
        ('z' in value)) {
        if (!Number.isNaN(Number.parseFloat(value.x)) &&
            !Number.isNaN(Number.parseFloat(value.y)) &&
            !Number.isNaN(Number.parseFloat(value.z))) {
            return new Vec3(
                Number.parseFloat(value.x),
                Number.parseFloat(value.y),
                Number.parseFloat(value.z),
            )
        }
    }

    return value
}

/**
 * @this {any}
 * @param {string} key
 * @param {any} value
 * @returns {any}
 */
function replacer(key, value) {
    if (value && value instanceof Vec3) {
        return {
            x: value.x,
            y: value.y,
            z: value.z,
        }
    }
    
    return value
}

module.exports = {
    reviver,
    replacer,
}
