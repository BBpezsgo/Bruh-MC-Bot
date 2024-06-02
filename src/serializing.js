const { Vec3 } = require('vec3')

/**
 * @param {any} json
 * @param {string} property
 * @returns {Vec3 | null}
 */
function toVec3(json, property) {
    if (!json) {
        return null
    }

    if (typeof json !== 'object') {
        return null
    }

    if (property in json && typeof json[property] === 'object') {
        const x = toNumber(json[property], 'x')
        const y = toNumber(json[property], 'y')
        const z = toNumber(json[property], 'z')
        if (x && y && z) {
            return new Vec3(x, y, z)
        }
    }

    return null
}

/**
 * @param {any} json
 * @param {string} property
 * @returns {number | null}
 */
function toNumber(json, property) {
    if (!json) {
        return null
    }

    if (typeof json !== 'object') {
        return null
    }

    if (property in json && typeof json[property] === 'number') {
        return json[property]
    }

    return null
}

/**
 * @param {any} json
 * @param {string} property
 * @returns {string | null}
 */
function toString(json, property) {
    if (!json) {
        return null
    }

    if (typeof json !== 'object') {
        return null
    }

    if (property in json && typeof json[property] === 'string') {
        return json[property]
    }

    return null
}

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
 * @param {any} json
 * @param {Semantics} semantics
 * @returns {any}
 */
function fromSemantics(json, semantics) {
    if (typeof semantics === 'string') {
        switch (semantics) {
            case 'string':
                if (typeof json !== 'string') { throw new Error(`Invalid JSON`) }
                return json

            case 'boolean':
                if (typeof json !== 'boolean') { throw new Error(`Invalid JSON`) }
                return json
        
            case 'number':
                if (typeof json !== 'number') { throw new Error(`Invalid JSON`) }
                return json
        
            default:
                throw new Error(`Invalid semantics`)
        }
    } else {
        if (typeof json !== 'object') { throw new Error(`Invalid JSON`) }

        if (semantics.type === 'array') {
            if (!Array.isArray(json)) { throw new Error(`Invalid JSON`) }

            const result = [ ]
            for (const item of json) {
                result.push(fromSemantics(item, semantics.of))
            }
            return result
        }
        
        if (semantics.type === 'object') {
            /** @type {any} */
            const result = { }
            for (const key in semantics.value) {
                if (json[key] === undefined) { throw new Error(`Invalid JSON`) }
                result[key] = fromSemantics(json[key], semantics.value[key])
            }
            return result
        }
        
        throw new Error(`Invalid semantics`)
    }
}

/**
 * @type {Readonly<{ [key: string]: Semantics }>}
 */// @ts-ignore
const semantics = Object.freeze({
    vec3: {
        type: 'object',
        value: {
            x: 'number',
            y: 'number',
            z: 'number',
        }
    }
})

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

module.exports = {
    toVec3,
    toNumber,
    toString,
    ensureSemantics,
}
