'use strict'

/// <reference types="./math-extension.d.ts" />

const { Vec3 } = require('vec3')

Math.randomInt = function(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min)
}

const nonceCharacters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

Math.nonce = function(length = 8) {
    let result = ''
    for (let i = 0; i < length; i++) {
        result += nonceCharacters[Math.round(Math.random() * length)]
    }
    return result
}

Math.clamp = function(v, min, max) {
    return Math.max(min, Math.min(max, v))
}

Math.lerp = function(a, b, t) {
    return a + ((b - a) * Math.clamp(t, 0, 1))
}

Math.lerpDeg = function(a, b, t) {
    const shortest_angle = ((((b - a) % 360) + 540) % 360) - 180
    return shortest_angle * t
}

Math.lerpRad = function(a, b, t) {
    return Math.lerpDeg(a * Math.rad2deg, b * Math.rad2deg, t) * Math.deg2rad
}

Math.lerpColor = function(a, b, t) {
    t = Math.clamp(t, 0, 1)
    return [
        a[0] + ((b[0] - a[0]) * t),
        a[1] + ((b[1] - a[1]) * t),
        a[2] + ((b[2] - a[2]) * t),
    ]
}

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

Math.vectorAngle = function(a, b) {
    return Math.atan2(b.y * a.x - b.x * a.y, b.x * a.x + b.y * a.y)
}

Math.distance = function(a, b) { return Math.sqrt(Math.distanceSquared(a, b)) }
Math.distanceSquared = function(a, b) { return Math.pow((b.x - a.x), 2) + Math.pow((b.y - a.y), 2) + Math.pow((b.z - a.z), 2) }

Math.boxDistance = function(point, box) { return Math.sqrt(Math.boxDistanceSquared(point, box)) }

Math.boxDistanceSquared = function(point, box) {
    const dx = Math.max(box.min.x - point.x, 0, point.x - box.max.x)
    const dy = Math.max(box.min.y - point.y, 0, point.y - box.max.y)
    const dz = Math.max(box.min.z - point.z, 0, point.z - box.max.z)
    return (dx * dx + dy * dy + dz * dz)
}

Math.entityDistance = function(a, b) {
    return Math.sqrt(Math.entityDistanceSquared(a, b))
}

Math.entityDistanceSquared = function(a, b) {
    if ('isValid' in a) {
        if ('isValid' in b) { throw new Error(`Not implemented`) }
        return Math.boxDistanceSquared(b, {
            min: a.position.offset(a.width * -0.5, 0, a.width * -0.5),
            max: a.position.offset(a.width * 0.5, a.height, a.width * 0.5),
        })
    } else {
        if ('isValid' in b) {
            return Math.boxDistanceSquared(a, {
                min: b.position.offset(b.width * -0.5, 0, b.width * -0.5),
                max: b.position.offset(b.width * 0.5, b.height, b.width * 0.5),
            })
        } else {
            return Math.distanceSquared(a, b)
        }
    }
}

Math.lineDistance = function(point, a, b) {
    return Math.sqrt(Math.lineDistanceSquared(point, a, b))
}

Math.lineDistanceSquared = function(point, a, b) {
    const line_dist = Math.distanceSquared(a, b)
    if (line_dist === 0) { return Math.distanceSquared(point, a) }
    let t = ((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y) + (point.z - a.z) * (b.z - a.z)) / line_dist
    t = Math.clamp(t, 0, 1)
    return Math.distanceSquared(
        point,
        {
            x: a.x + t * (b.x - a.x),
            y: a.y + t * (b.y - a.y),
            z: a.z + t * (b.z - a.z),
        })
}

module.exports = { }
