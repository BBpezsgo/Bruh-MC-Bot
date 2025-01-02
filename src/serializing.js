'use strict'

const { Vec3 } = require('vec3')
const Vec3Dimension = require('./vec3-dimension')
const Freq = require('./utils/freq')
const ItemLock = require('./item-lock')

/**
 * @this {any}
 * @param {string} key
 * @param {any} value
 * @returns {any}
 */
function reviver(key, value) {
    if (!value) { return value }

    if (value &&
        (typeof value === 'object') &&
        ('x' in value) &&
        ('y' in value) &&
        ('z' in value)) {
        if (!Number.isNaN(Number.parseFloat(value.x)) &&
            !Number.isNaN(Number.parseFloat(value.y)) &&
            !Number.isNaN(Number.parseFloat(value.z))) {
            if ('dimension' in value) {
                return new Vec3Dimension({
                    x: Number.parseFloat(value.x),
                    y: Number.parseFloat(value.y),
                    z: Number.parseFloat(value.z),
                }, value.dimension)
            } else {
                return new Vec3(
                    Number.parseFloat(value.x),
                    Number.parseFloat(value.y),
                    Number.parseFloat(value.z),
                )
            }
        }
    }

    if (value &&
        (typeof value === 'object') &&
        ('__class' in value) &&
        ('v' in value)
    ) {
        return Freq.fromJSON(value['v'], (a, b) => { throw new Error() })
    }

    if (typeof value === 'object' &&
        'isUnlocked' in value &&
        'item' in value &&
        'count' in value &&
        'by' in value &&
        Object.keys(value).length === 4) {
        const lock = new ItemLock(
            String(value['by']),
            value['item'],
            Number(value['count'])
        )
        lock.isUnlocked = Boolean(value['isUnlocked'])
        return lock
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
    if (!value) { return value }

    if (value instanceof Vec3) {
        return {
            x: value.x,
            y: value.y,
            z: value.z,
        }
    }

    if (value instanceof Vec3Dimension) {
        return {
            x: value.x,
            y: value.y,
            z: value.z,
            dimension: value.dimension,
        }
    }

    if (value instanceof Freq) {
        return {
            __class: 'Freq',
            v: value.toJSON(),
        }
    }

    if (value instanceof ItemLock) {
        return {
            isUnlocked: value.isUnlocked,
            item: value.item,
            count: value.count,
            by: value.by,
        }
    }

    return value
}

module.exports = {
    reviver,
    replacer,
}
