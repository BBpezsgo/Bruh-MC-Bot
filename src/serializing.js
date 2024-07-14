const { Vec3 } = require('vec3')

/**
 * @typedef {'string' | 'number' | 'boolean'} LiteralSemantics
 */

/**
 * @typedef {{ type: 'object', value: { [key: (string | number | symbol)]: Semantics } }} ObjectSemantics
 */

/**
 * @typedef {{ type: 'array', of: Semantics }} ArraySemantics
 */

/**
 * @typedef {LiteralSemantics | ObjectSemantics | ArraySemantics} Semantics
 */

/**
 * @param {any} value
 * @param {Semantics} semantics
 */
function ensureSemantics(value, semantics) {
    if (typeof semantics === 'string') {
        switch (semantics) {
            case 'string':
                if (typeof value !== 'string') { throw new Error(`Invalid JSON`) }
                return

            case 'boolean':
                if (typeof value !== 'boolean') { throw new Error(`Invalid JSON`) }
                return
        
            case 'number':
                if (typeof value !== 'number') { throw new Error(`Invalid JSON`) }
                return
        
            default:
                throw new Error(`Invalid semantics`)
        }
    } else {
        if (typeof value !== 'object') { throw new Error(`Invalid JSON`) }

        if (semantics.type === 'array') {
            if (!Array.isArray(value)) { throw new Error(`Invalid JSON`) }

            for (const item of value) {
                ensureSemantics(item, semantics.of)
            }
            return
        }
        
        if (semantics.type === 'object') {
            for (const key in semantics.value) {
                if (value[key] === undefined) { throw new Error(`Invalid JSON`) }
                ensureSemantics(value[key], semantics.value[key])
            }
            return
        }
        
        throw new Error(`Invalid semantics`)
    }
}

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
    ensureSemantics,
    reviver,
    replacer,
}
