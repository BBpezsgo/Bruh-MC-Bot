const { Entity } = require('prismarine-entity')
const { Vec3 } = require('vec3')

/**
 * @param {import('./result').GoalError | Error} error
 * @returns {import('./result').ErroredResult}
 */
function error(error) {
    if (typeof error === 'string') {
        console.error(error)
        return { error: error.trim() }
    } else if (error instanceof Error) {
        console.error(error)
        return { error: error.message }
    } else {
        return { error: { inner: error } }
    }
}

/**
 * @param {number} ms
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * @param {Array<import('prismarine-item').Item>} before
 * @param {Array<import('prismarine-item').Item>} after
 * @returns {Array<{ name: string; delta: number; }>}
 */
function itemsDelta(before, after) {
    /**
     * @type {Map<string, number>}
     */
    const map = new Map()

    for (const item of before) {
        if (!map.has(item.name)) {
            map.set(item.name, -item.count)
        } else {
            map.set(item.name, map.get(item.name) - item.count)
        }
    }

    for (const item of after) {
        if (!map.has(item.name)) {
            map.set(item.name, item.count)
        } else {
            map.set(item.name, map.get(item.name) + item.count)
        }
    }

    /**
     * @type {Array<{ name: string; delta: number; }>}
     */
    const res = [ ]

    map.forEach((value, key) => {
        res.push({ name: key, delta: value })
    })

    return res
}

/**
 * @template T
 * @param {Promise<T>} task
 * @param {number} ms
 * @returns {Promise<T>}
 */
function timeout(task, ms) {
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
            reject('Time Limit Exceeded')
        }, ms)
    })
    return Promise.race([task, timeoutPromise]);
}

/**
 * @param {Array<{ cost: number }>} costs
 */
function sortCosts(costs) {
    costs.sort((a, b) => {
        if (a.cost === Infinity &&
            b.cost === Infinity) {
            return 0
        }

        if (a.cost === Infinity) {
            return 1
        } else {
            return -1
        }
    })
}

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

/**
 * @param {Array<Vec3>} blocks
 * @returns {Array<Vec3>}
 */
function backNForthSort(blocks) {
    /** @type {{ [index: number]: Vec3[] }} */
    let rows = {  }

    for (const block of blocks) {
        if (!rows[block.x]) {
            rows[block.x] = [ ]
        }
        rows[block.x].push(block)
    }

    /** @type {Vec3[][]} */
    const rows2 = [ ]
    for (const key in rows) {
        rows2.push(rows[key])
    }

    for (let i = 0; i < rows2.length; i++) {
        const row = rows2[i]
        if (i % 2) {
            row.sort((a, b) => a.z - b.z)
        } else {
            row.sort((a, b) => b.z - a.z)
        }
    }

    const result = [ ]
    for (const row of rows2) {
        result.push(...row)
    }

    return result
}

/**
 * @param {Entity} entity
 * @returns {number | null}
 */
function filterHostiles(entity) {
    if (entity.type === 'hostile') { return 1 }
    if (entity.name === 'slime') {
        if (entity.metadata[16]) { return 1 }
        return 0
    }
    
    return null
}

module.exports = {
    error,
    itemsDelta,
    sleep,
    timeout,
    costDepth,
    sortCosts,
    randomInt,
    deg2rad,
    rad2deg,
    lerp,
    lerpDeg,
    lerpRad,
    rotationToVector,
    backNForthSort,
    filterHostiles,
}
