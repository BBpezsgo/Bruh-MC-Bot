const { Entity } = require('prismarine-entity')
const { Vec3 } = require('vec3')

/**
 * @param {ReadonlyArray<import('prismarine-item').Item>} before
 * @param {ReadonlyArray<import('prismarine-item').Item>} after
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
 * @param {ReadonlyArray<Vec3>} blocks
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

    /** @type {Array<Array<Vec3>>} */
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
 * @returns {number | undefined}
 */
function entityAttackDistance(entity) {
    const reachDistance = 2
    return {
        'evoker':           reachDistance,
        'creeper':          3,
        'skeleton':         15,
        'cave_spider':      reachDistance,
        'endermite':        reachDistance,
        'hoglin':           reachDistance,
        'magma_cube':       reachDistance,
        'slime':            reachDistance,
        'wither_skeleton':  reachDistance,
        'witch':            8,
        'spider':           reachDistance,
        'stray':            15,
        'ravager':          reachDistance,
        'husk':             reachDistance,
        'zombie_villager':  reachDistance,
        'zombie':           reachDistance,
        'piglin':           reachDistance,
        'piglin_brute':     reachDistance,
        'pillager':         8,
        'silverfish':       reachDistance,
        'zoglin':           reachDistance,
        'vindicator':       reachDistance,
        'enderman':         reachDistance,
        'zombified_piglin': reachDistance,
        'ghast':            64,
    }[entity.name ?? '']
}

/**
 * @param {Entity} entity
 * @returns {number | undefined}
 */
function entityRangeOfSight(entity) {
    return {
        'evoker':           12,
        'creeper':          15,
        'silverfish':       16, // ?
        'zoglin':           16, // ?
        'vindicator':       16, // ?
        'skeleton':         16,
        'cave_spider':      16,
        'endermite':        16,
        'hoglin':           16,
        'magma_cube':       16,
        'slime':            16,
        'wither_skeleton':  16,
        'witch':            16,
        'spider':           16,
        'stray':            16,
        'ravager':          32,
        'husk':             35,
        'zombie_villager':  35,
        'zombie':           35,
        'piglin':           16,
        'piglin_brute':     16,
        'pillager':         64,
        'ghast':            64,
    }[entity.name ?? '']
}

/**
 * @param {Entity} entity
 * @returns {boolean}
 */
function canEntityAttack(entity) {
    if (entity.metadata[2]) { return false }
    if (entity.metadata[6] === 7) { return false }
    if (entity.name === 'slime') {
        if (entity.metadata[16]) { return true }
        return false
    }
    if (entity.name === 'ghast') { return true }
    if (entity.type !== 'hostile') { return false }
    if (entity.name === 'zombified_piglin') { return false }
    if (entity.name === 'enderman') { return false }
    return true
}

/**
 * @param {Entity} entity
 * @param {Vec3} point
 * @returns {number | null}
 */
function filterHostiles(entity, point) {
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

    const hostileAttackDistance = {
        'evoker':           12,
        'creeper':          15,
        'skeleton':         16,
        'cave_spider':      16,
        'endermite':        16,
        'hoglin':           16,
        'magma_cube':       16,
        'slime':            16,
        'wither_skeleton':  16,
        'witch':            16,
        'spider':           16,
        'stray':            16,
        'ravager':          32,
        'husk':             35,
        'zombie_villager':  35,
        'zombie':           35,

        'piglin': null,
        'piglin_brute': null,
        'pillager': null,
        'silverfish': null,
        'zoglin': null,
        'vindicator': null,
    }[entity.name ?? '']

    if (hostileAttackDistance) {
        const distance = point.distanceTo(entity.position)
        if (distance > hostileAttackDistance) {
            return 0
        }
    }

    return hostileAttackDistance
}

/**
 * @param {ReadonlyArray<Vec3>} trajectory
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

/**
 * @param {Vec3} [origin]
 * @param {ReadonlyArray<'top' | 'bottom' | 'side'>} sides
 * @returns {Array<Vec3>}
 */
function directBlockNeighbors(origin, ...sides) {
    if (!origin) { origin = new Vec3(0, 0, 0) }
    if (sides.length === 0) {
        return [
            new Vec3(origin.x + 1, origin.y, origin.z),
            new Vec3(origin.x - 1, origin.y, origin.z),
            new Vec3(origin.x, origin.y + 1, origin.z),
            new Vec3(origin.x, origin.y - 1, origin.z),
            new Vec3(origin.x, origin.y, origin.z + 1),
            new Vec3(origin.x, origin.y, origin.z - 1),
        ]   
    } else {
        /** @type {Array<Vec3>} */
        const result = [ ]
        const _top = new Vec3(origin.x, origin.y + 1, origin.z)
        const _bottom = new Vec3(origin.x, origin.y - 1, origin.z)
        const _side1 = new Vec3(origin.x + 1, origin.y, origin.z)
        const _side2 = new Vec3(origin.x - 1, origin.y, origin.z)
        const _side3 = new Vec3(origin.x, origin.y, origin.z + 1)
        const _side4 = new Vec3(origin.x, origin.y, origin.z - 1)
        for (const side of sides) {
            switch (side) {
                case 'top': {
                    if (!result.find(v => v.equals(_top))) {
                        result.push(_top)
                    }
                    break
                }
                case 'bottom': {
                    if (!result.find(v => v.equals(_bottom))) {
                        result.push(_bottom)
                    }
                    break
                }
                case 'side': {
                    if (!result.find(v => v.equals(_side1))) {
                        result.push(_side1)
                    }
                    if (!result.find(v => v.equals(_side2))) {
                        result.push(_side2)
                    }
                    if (!result.find(v => v.equals(_side3))) {
                        result.push(_side3)
                    }
                    if (!result.find(v => v.equals(_side4))) {
                        result.push(_side4)
                    }
                    break
                }
            
                default:
                    break
            }
        }
        return result
    }
}

module.exports = {
    itemsDelta,
    backNForthSort,
    filterHostiles,
    trajectoryTime,
    canEntityAttack,
    entityAttackDistance,
    entityRangeOfSight,
    Timeout,
    Interval,
    parseLocationH,
    directBlockNeighbors,
}
