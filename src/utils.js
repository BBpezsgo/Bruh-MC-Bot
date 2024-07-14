const { Entity } = require('prismarine-entity')
const { Vec3 } = require('vec3')

/**
 * @param {number} ms
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * @param {number} ms
 * @returns {Generator<void, void, void>}
 */
function* sleepG(ms) {
    const end = performance.now() + ms

    while (performance.now() < end) {
        yield
    }
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
        map.set(item.name, (map.get(item.name) ?? 0) - item.count)
    }

    for (const item of after) {
        map.set(item.name, (map.get(item.name) ?? 0) + item.count)
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
    /** @type {{ [index: number]: Array<Vec3> }} */
    let rows = { }

    for (const block of blocks) {
        if (!rows[block.x]) {
            rows[block.x] ??= [ ]
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
 * @param {Vec3 | null} point
 * @returns {number | null}
 */
function filterHostiles(entity, point = null) {
    if (entity.metadata[2]) { return null }
    if (entity.metadata[6] === 7) { return null }

    if (entity.name === 'slime') {
        if (entity.metadata[16]) { return 1 }
        return 0
    }

    if (entity.name === 'ghast') {
        return 50
    }

    if (entity.type !== 'hostile') { return null }

    if (entity.name === 'zombified_piglin') {
        return 0
    }

    if (entity.name === 'enderman') {
        return 0
    }

    if (point) {
        const hostileAttackDistance = {
            'creeper': 15,
            'zombie': 35,
            'skeleton': 16,
            'cave_spider': 16,
            'endermite': 16,
            'evoker': 12,
            'hoglin': 16,
            'magma_cube': 16,
            'husk': 35,
            'piglin': null,
            'piglin_brute': null,
            'pillager': null,
            'slime': 16,
            'silverfish': null,
            'ravager': 32,
            'spider': 16,
            'stray': 16,
            'zoglin': null,
            'wither_skeleton': 16,
            'witch': 16,
            'vindicator': null,
            'zombie_villager': 35,
        }[entity.name ?? '']
        if (hostileAttackDistance) {
            const distnace = point.distanceTo(entity.position)
            if (distnace > hostileAttackDistance) {
                return 0
            }
        }
    }

    return 1
}

/**
 * @param {Array<Vec3>} trajectory
 * @param {number} speed
 * @returns {number}
 */
function trajectoryTime(trajectory, speed) {
    let time = 0
    for (let i = 1; i < trajectory.length; i++) {
        const a = trajectory[i - 1]
        const b = trajectory[i]
        const d = a.distanceTo(b)
        time += d / speed
    }
    return time
}

/**
 * @template T
 * @param {Promise<T> | (() => Promise<T>)} promise
 * @returns {Generator<void, T, void>}
 */
function* wrap(promise) {
    if (typeof promise === 'function') { promise = promise() }

    let isDone = false
    /** @type {any | undefined} */
    let error = undefined
    /** @type {T | undefined} */
    let resolvedValue = undefined
    promise.then(v => resolvedValue = v)
    .catch(v => error = v)
    .finally(() => isDone = true)

    while (!isDone) {
        yield
    }

    if (error) {
        throw error
    } else {
        // @ts-ignore
        return resolvedValue
    }
}

/**
 * @template T
 * @param {T} result
 * @returns {Generator<void, T, void>}
 */
function* finished(result) {
    return result
}

class Timeout {
    /**
     * @private @readonly
     * @type {number}
     */
    end

    /**
     * @param {number} ms
     */
    constructor(ms) {
        this.end = performance.now() + ms
    }

    done() { return performance.now() >= this.end }
}

class Interval {
    /**
     * @type {number}
     */
    time

    /**
     * @private
     * @type {number}
     */
    startTime

    /**
     * @param {number} ms
     */
    constructor(ms) {
        this.time = ms
        this.startTime = 0
    }

    /**
     * @returns {boolean}
     */
    is(justRead = false) {
        const now = performance.now()
        if (now - this.startTime >= this.time) {
            if (!justRead) {
                this.startTime = now
            }
            return true
        }
        return false
    }

    restart() {
        this.startTime = performance.now()
    }
}

/**
 * @param {string} text
 * @returns {null | Vec3}
 */
function parseLocationH(text) {
    text = text.trim().toLowerCase()
    const match = /x(-?[0-9]+), y(-?[0-9]+), z(-?[0-9]+), ([a-zA-Z]*)/.exec(text)
    if (!match) {
        return null
    }
    if (match.length !== 5) {
        return null
    }
    const x = Number.parseInt(match[1])
    const y = Number.parseInt(match[2])
    const z = Number.parseInt(match[3])
    if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) {
        return null
    }
    return new Vec3(x, y, z)
}

module.exports = {
    itemsDelta,
    sleep,
    sleepG,
    timeout,
    costDepth,
    randomInt,
    deg2rad,
    rad2deg,
    lerp,
    lerpDeg,
    lerpRad,
    rotationToVector,
    backNForthSort,
    filterHostiles,
    trajectoryTime,
    wrap,
    finished,
    Timeout,
    Interval,
    parseLocationH,
}
