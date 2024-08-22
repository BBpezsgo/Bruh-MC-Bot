const { Entity } = require('prismarine-entity')
const { Vec3 } = require('vec3')
const Vec3Dimension = require('../vec3-dimension')
const NBT = require('prismarine-nbt')
const { EntityPose } = require('../entity-metadata')

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
    const res = []

    map.forEach((value, key) => {
        res.push({ name: key, delta: value })
    })

    return res
}

/**
 * @template {{ x: number; y: number; z: number; }} TPoint
 * @param {ReadonlyArray<Readonly<TPoint>>} blocks
 * @returns {Array<TPoint>}
 */
function backNForthSort(blocks) {
    /** @type {Record<number, Array<TPoint>>} */
    const rows = {}

    for (const block of blocks) {
        if (!rows[block.x]) {
            rows[block.x] ??= []
        }
        rows[block.x].push(block)
    }

    const existingRows = Object.values(rows)

    for (let i = 0; i < existingRows.length; i++) {
        const row = existingRows[i]
        if (i % 2) {
            row.sort((a, b) => a.z - b.z)
        } else {
            row.sort((a, b) => b.z - a.z)
        }
    }

    return existingRows.flat()
}

/**
 * @template T
 * @param {Vec3} start
 * @param {ReadonlyArray<T>} points
 * @param {(element: T) => Vec3} [mapper]
 * @returns {Array<T>}
 */
function basicRouteSearch(start, points, mapper) {
    // @ts-ignore
    mapper ??= v => v
    /**
     * @type {Array<T>}
     */
    const result = []
    /**
     * @type {Array<T>}
     */
    const heap = [...points]

    let lastPoint = start

    while (heap.length > 0) {
        let smallestDistance = Infinity
        let nearestIndex = -1
        for (let i = 0; i < heap.length; i++) {
            const d = mapper(heap[i]).distanceTo(lastPoint)
            if (d >= smallestDistance) { continue }
            smallestDistance = d
            nearestIndex = i
        }
        if (nearestIndex < 0) { throw new Error(`No point found`) }
        lastPoint = mapper(heap[nearestIndex])
        result.push(heap[nearestIndex])
        heap.splice(nearestIndex, 1)
    }

    return result
}

/**
 * @param {Entity} entity
 * @param {Vec3} point
 * @returns {number | null}
 */
function filterHostiles(entity, point) {
    if (entity.metadata[2]) { return null }
    if (entity.metadata[6] === EntityPose.DYING) { return null }

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
        'evoker': 12,
        'creeper': 15,
        'skeleton': 16,
        'cave_spider': 16,
        'endermite': 16,
        'hoglin': 16,
        'magma_cube': 16,
        'slime': 16,
        'wither_skeleton': 16,
        'witch': 16,
        'spider': 16,
        'stray': 16,
        'ravager': 32,
        'husk': 35,
        'zombie_villager': 35,
        'zombie': 35,

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
    done(justRead = false) {
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
 * @returns {null | Vec3Dimension}
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
    const rawDimension = match[4]
    /**
     * @type {import('mineflayer').Dimension}
     */
    let dimension
    switch (rawDimension.toLowerCase()) {
        case 'overworld':
            dimension = 'overworld'
            break
        case 'end':
            dimension = 'the_end'
            break
        case 'nether':
            dimension = 'the_nether'
            break
        default:
            return null
    }
    return new Vec3Dimension({ x, y, z }, dimension)
}

/**
 * @param {string} text
 * @param {import('../bruh-bot')} [bot=null]
 * @returns {null | string | Vec3Dimension | Entity}
 */
function parseAnyLocationH(text, bot = null) {
    text = text.trim().toLowerCase()

    if (bot) {
        if (text === 'home') {
            if (!bot.memory.idlePosition) { return `I don't have a home` }

            return bot.memory.idlePosition.clone()
        }

        if (bot.bot.players[text]?.entity) {
            if (text === bot.username) { return `That's me!` }

            return bot.bot.players[text].entity
        }
    }

    return parseLocationH(text)
}

/**
 * @param {string} text
 * @returns {null | boolean}
 */
function parseYesNoH(text) {
    text = text.trim().toLowerCase()
    switch (text) {
        case 'y':
        case 'yes':
        case 'ye':
        case 'yah':
        case 'yeah': {
            return true
        }
        case 'n':
        case 'no':
        case 'nope':
        // cspell: disable-next-line
        case 'nuhuh':
        case 'nuh uh': {
            return false
        }
    }
    return null
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
        const result = []
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

/**
 * @param {{ x: number; y: number; z: number; }} origin
 * @param {{ x: number; y: number; z: number; }} point
 */
function isDirectNeighbor(origin, point) {
    return (
        Math.pow(origin.x - point.x, 2) +
        Math.pow(origin.y - point.y, 2) +
        Math.pow(origin.z - point.z, 2)
    ) === 1
}

/**
 * @param {NBT.Tags[NBT.TagType] | null} nbt
 * @returns {any}
 */
function NBT2JSON(nbt) {
    if (!nbt) { return nbt }
    switch (nbt.type) {
        case NBT.TagType.Byte:
        case NBT.TagType.Double:
        case NBT.TagType.Float:
        case NBT.TagType.Int:
        case NBT.TagType.Short:
            return nbt.value
        case NBT.TagType.IntArray:
        case NBT.TagType.ByteArray:
        case NBT.TagType.ShortArray:
            return nbt.value
        case NBT.TagType.String:
            return nbt.value
        case NBT.TagType.Compound: {
            /** @type {any} */
            const result = {}
            for (const key in nbt.value) {
                result[key] = NBT2JSON(nbt.value[key])
            }
            return result
        }
        case NBT.TagType.List: {
            return nbt.value.value.map(v => ({
                type: nbt.value.type,
                value: v,
            // @ts-ignore
            })).map(NBT2JSON)
        }
        case NBT.TagType.Long:
            if (nbt.value[0]) {
                return Infinity
            } else {
                return nbt.value[1]
            }
        case NBT.TagType.LongArray:
            return nbt.value.map(v => {
                if (v[0]) {
                    return Infinity
                } else {
                    return v[1]
                }
            })
        default:
            return undefined
    }
}

/**
 * @param {NBT.Tags[NBT.TagType] | null | undefined} a
 * @param {NBT.Tags[NBT.TagType] | null | undefined} b
 * @returns {boolean}
 */
function isNBTEquals(a, b) {
    if (!a && !b) { return true }
    if (!a) { return false }
    if (!b) { return false }

    switch (a.type) {
        case NBT.TagType.Byte:
        case NBT.TagType.Double:
        case NBT.TagType.Float:
        case NBT.TagType.Int:
        case NBT.TagType.Short: {
            if (b.type !== a.type) { return false }
            return a.value === b.value
        }
        case NBT.TagType.ByteArray:
        case NBT.TagType.IntArray:
        case NBT.TagType.ShortArray: {
            if (b.type !== NBT.TagType.ByteArray) { return false }
            if (a.value.length !== b.value.length) { return false }
            return a.value.every((value, i) => b.value[i] === value)
        }
        case NBT.TagType.Compound: {
            if (b.type !== NBT.TagType.Compound) { return false }
            const keysA = Object.keys(a.value)
            const keysB = Object.keys(b.value)
            if (keysA.length !== keysB.length) { return false }
            for (const key of keysA) {
                const _a = a.value[key]
                const _b = b.value[key]
                if (!isNBTEquals(_a, _b)) { return false }
            }
            return true
        }
        case NBT.TagType.List: {
            if (b.type !== NBT.TagType.List) { return false }
            if (a.value.value.length !== b.value.value.length) { return false }
            if (a.value.type !== b.value.type) { return false }
            /** @type {Array<NBT.Tags[NBT.TagType]>} */ //@ts-ignore
            const _a = a.value.value.map(v => ({ type: a.value.type, value: v }))
            /** @type {Array<NBT.Tags[NBT.TagType]>} */ //@ts-ignore
            const _b = b.value.value.map(v => ({ type: b.value.type, value: v }))
            return _a.every((value, i) => isNBTEquals(value, _b[i]))
        }
        case NBT.TagType.Long: {
            if (b.type !== NBT.TagType.Long) { return false }
            return (a.value[0] === b.value[0]) && (a.value[1] === b.value[1])
        }
        case NBT.TagType.LongArray: {
            if (b.type !== NBT.TagType.LongArray) { return false }
            if (a.value.length !== b.value.length) { return false }
            return a.value.every((value, i) => ((b.value[i][0] === value[0]) && (b.value[i][1] === value[1])))
        }
        case NBT.TagType.String: {
            if (b.type !== NBT.TagType.String) { return false }
            return a.value === b.value
        }
        default: {
            return false
        }
    }
}

/**
 * @template TItem
 * @param {Generator<TItem, any, any>} generator
 * @returns {Array<TItem>}
 */
function toArray(generator) {
    const result = []
    while (true) {
        const v = generator.next()
        if (v.done === true) { break }
        result.push(v.value)
    }
    return result
}

/**
 * @param {number} origin
 * @param {number} d
 * @returns {Generator<number, void, void>}
 */
function* yeah(origin, d) {
    for (let i = 0; i < d; i++) {
        yield origin + i
        yield origin - i
    }
}

/**
 * @overload
 * @param {ReadonlyArray<{ equals: (other: T) => void; }>} a
 * @param {ReadonlyArray<{ equals: (other: T) => void; }>} b
 */
/**
 * @template {any} T
 * @param {ReadonlyArray<T>} a
 * @param {ReadonlyArray<T>} b
 */
function sequenceEquals(a, b) {
    if (a.length !== b.length) { return false }
    if (typeof a[0] === 'object' &&
        'equals' in a[0]) {
        for (let i = 0; i < a.length; i++) {
            // @ts-ignore
            if (!a[i].equals(b[i])) { return false }
        }
        return true
    } else {
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) { return false }
        }
        return true
    }
}

module.exports = {
    itemsDelta,
    backNForthSort,
    basicRouteSearch,
    filterHostiles,
    trajectoryTime,
    Timeout,
    Interval,
    parseLocationH,
    parseAnyLocationH,
    parseYesNoH,
    directBlockNeighbors,
    isDirectNeighbor,
    NBT2JSON,
    isNBTEquals,
    toArray,
    yeah,
    sequenceEquals,
}
