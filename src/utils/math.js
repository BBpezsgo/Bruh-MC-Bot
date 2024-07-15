const { Vec3 } = require("vec3")

/**
 * @param {number} min
 * @param {number} max
 */
function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min)
}

/**
 * @param {number} a
 * @param {number} b
 * @param {number} t
 */
function lerp(a, b, t) {
    return a + ((b - a) * t)
}

/**
 * @param {number} a
 * @param {number} b
 * @param {number} t
 */
function lerpDeg(a, b, t) {
    const shortest_angle = ((((b - a) % 360) + 540) % 360) - 180
    return shortest_angle * t
}

/**
 * @param {number} a
 * @param {number} b
 * @param {number} t
 */
function lerpRad(a, b, t) {
    return lerpDeg(a * rad2deg, b * rad2deg, t) * deg2rad
}

const costDepth = 20
const deg2rad =  Math.PI / 180
const rad2deg =  180 / Math.PI

/**
 * @param {number} pitch
 * @param {number} yaw
 */
function rotationToVector(pitch, yaw) {
    if (yaw < -180) { yaw += 360 }
    else if (yaw > 180) { yaw -= 360 }

    let f = Math.cos(-yaw - Math.PI)
    let f1 = Math.sin(-yaw - Math.PI)
    let f2 = -Math.cos(-pitch)
    let f3 = Math.sin(-pitch)
    return new Vec3((f1 * f2), f3, -(f * f2))
}

module.exports = {
    costDepth,
    randomInt,
    deg2rad,
    rad2deg,
    lerp,
    lerpDeg,
    lerpRad,
    rotationToVector,
}
