/// <reference types="./math-extension.d.ts" />

const { Vec3 } = require('vec3')

/**
 * @param {number} min
 * @param {number} max
 */
function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min)
}

const nonceCharacters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

function nonce(length = 8) {
    let result = ''
    for (let i = 0; i < length; i++) {
        result += nonceCharacters[Math.round(Math.random() * length)]
    }
    return result
}

Math.lerp = function(a, b, t) {
    return a + ((b - a) * Math.max(0, Math.min(1, t)))
}

Math.lerpDeg = function(a, b, t) {
    const shortest_angle = ((((b - a) % 360) + 540) % 360) - 180
    return shortest_angle * t
}

Math.lerpRad = function(a, b, t) {
    return Math.lerpDeg(a * Math.rad2deg, b * Math.rad2deg, t) * Math.deg2rad
}

Math.lerpColor = function(a, b, t) {
    t = Math.max(0, Math.min(1, t))
    return [
        a[0] + ((b[0] - a[0]) * t),
        a[1] + ((b[1] - a[1]) * t),
        a[2] + ((b[2] - a[2]) * t),
    ]
}

const costDepth = 20
// @ts-ignore
Math.deg2rad = Math.PI / 180
// @ts-ignore
Math.rad2deg = 180 / Math.PI

Math.rotationToVectorRad = function(pitchRad, yawRad) {
    const f = Math.cos(-yawRad - Math.PI)
    const f1 = Math.sin(-yawRad - Math.PI)
    const f2 = -Math.cos(-pitchRad)
    const f3 = Math.sin(pitchRad)
    return new Vec3((f1 * f2), f3, -(f * f2))
}

Math.rotationToVector = function(pitchDeg, yawDeg) {
    return Math.rotationToVectorRad(pitchDeg * Math.deg2rad, yawDeg * Math.deg2rad)
}

/**
 * @param {Readonly<{ x: number; y: number; }>} a
 * @param {Readonly<{ x: number; y: number; }>} b
 */
function vectorAngle(a, b) {
    return Math.atan2(b.y * a.x - b.x * a.y, b.x * a.x + b.y * a.y)
}

/**
 * @param {Readonly<{ x: number; y: number; z: number; }>} point 
 * @param {Readonly<{ min: { x: number; y: number; z: number; }; max: { x: number; y: number; z: number; }; }>} box 
 */
function boxDistance(point, box) { return Math.sqrt(boxDistanceSquared(point, box)) }

/**
 * @param {Readonly<{ x: number; y: number; z: number; }>} point 
 * @param {Readonly<{ min: { x: number; y: number; z: number; }; max: { x: number; y: number; z: number; }; }>} box 
 */
function boxDistanceSquared(point, box) {
    const dx = Math.max(box.min.x - point.x, 0, point.x - box.max.x)
    const dy = Math.max(box.min.y - point.y, 0, point.y - box.max.y)
    const dz = Math.max(box.min.z - point.z, 0, point.z - box.max.z)
    return (dx * dx + dy * dy + dz * dz)
}

/**
 * @overload
 * @param {Vec3} a
 * @param {Vec3 | import('prismarine-entity').Entity} b
 * @returns {number}
 */
/**
 * @overload
 * @param {Vec3 | import('prismarine-entity').Entity} a
 * @param {Vec3} b
 * @returns {number}
 */
/**
 * @param {Vec3 | import('prismarine-entity').Entity} a
 * @param {Vec3 | import('prismarine-entity').Entity} b
 * @returns {number}
 */
function entityDistance(a, b) {
    // @ts-ignore
    return Math.sqrt(entityDistanceSquared(a, b))
}

/**
 * @overload
 * @param {Vec3} a
 * @param {Vec3 | import('prismarine-entity').Entity} b
 * @returns {number}
 */
/**
 * @overload
 * @param {Vec3 | import('prismarine-entity').Entity} a
 * @param {Vec3} b
 * @returns {number}
 */
/**
 * @param {Vec3 | import('prismarine-entity').Entity} a
 * @param {Vec3 | import('prismarine-entity').Entity} b
 * @returns {number}
 */
function entityDistanceSquared(a, b) {
    if ('isValid' in a) {
        if ('isValid' in b) { throw new Error(`Not implemented`) }
        return boxDistanceSquared(b, {
            min: a.position.offset(a.width * -0.5, 0, a.width * -0.5),
            max: a.position.offset(a.width * 0.5, a.height, a.width * 0.5),
        })
    } else {
        if ('isValid' in b) {
            return boxDistanceSquared(a, {
                min: b.position.offset(b.width * -0.5, 0, b.width * -0.5),
                max: b.position.offset(b.width * 0.5, b.height, b.width * 0.5),
            })
        } else {
            return a.distanceSquared(b)
        }
    }
}

/**
 * @param {Vec3} point
 * @param {Vec3} a
 * @param {Vec3} b
 */
function lineDistance(point, a, b) {
    return Math.sqrt(lineDistanceSquared(point, a, b))
}

/**
 * @param {Vec3} point
 * @param {Vec3} a
 * @param {Vec3} b
 */
function lineDistanceSquared(point, a, b) {
    const line_dist = a.distanceSquared(b)
    if (line_dist === 0) { return point.distanceSquared(a) }
    let t = ((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y) + (point.z - a.z) * (b.z - a.z)) / line_dist
    t = Math.max(0, Math.min(1, t))
    return point.distanceSquared(new Vec3(a.x + t * (b.x - a.x), a.y + t * (b.y - a.y), a.z + t * (b.z - a.z)))
}

module.exports = {
    costDepth,
    randomInt,
    vectorAngle,
    nonce,
    boxDistance,
    boxDistanceSquared,
    entityDistance,
    entityDistanceSquared,
    lineDistance,
    lineDistanceSquared,
}
