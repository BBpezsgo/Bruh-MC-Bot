'use strict'

const { Entity } = require('prismarine-entity')
const { Vec3 } = require('vec3')
const Vec3Dimension = require('../vec3-dimension')
const NBT = require('prismarine-nbt')
const Iterable = require('../iterable')
const { Item } = require('prismarine-item')

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
 * @overload
 * @param {Vec3} start
 * @param {ReadonlyArray<Vec3>} points
 * @param {undefined} [mapper]
 * @returns {Generator<Vec3>}
 * @overload
 * @param {Vec3} start
 * @param {ReadonlyArray<T>} points
 * @param {(element: T) => Vec3} mapper
 * @returns {Generator<T>}
 */
function* basicRouteSearch(start, points, mapper) {
    // @ts-ignore
    mapper ??= v => v
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
        yield heap[nearestIndex]
        heap.splice(nearestIndex, 1)
    }
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
 * @typedef {Readonly<{ name: string; nbt: NBT.Tags[NBT.TagType] | null; }> | string | Readonly<Item>} ItemId
 */

/**
 * @param {ItemId} item
 */
function stringifyItem(item) {
    if (!item) { return 'null' }
    if (typeof item === 'string') {
        return item
    } else {
        let result = 'displayName' in item ? item.displayName : item.name

        if (item.name === 'bundle') {
            const content = require('./bundle').content(item.nbt)
            if (content.length) {
                result += ` (...)`
            }
        } else if (item.nbt) {
            const nbt = NBT2JSON(item.nbt)
            if (nbt['Potion']) {
                const potion = require('../tasks/brew').potions.find(v => [v.name, v.long, v.level2].includes(nbt['Potion']))
                if (potion) {
                    result = potion.displayName
                    if (nbt['Potion'] === potion.level2) {
                        result += ` (strong)`
                    } else if (nbt['Potion'] === potion.long) {
                        result += ` (long)`
                    }
                } else {
                    result += ` (${nbt['Potion'].replace('minecraft:', '')})`
                }
            } else {
                result += ` (+NBT)`
            }
        }

        return result
    }
}

/**
 * @param {ItemId} a 
 * @param {ItemId} b 
 * @returns {boolean}
 */
function isItemEquals(a, b) {
    if (!a || !b) { return false }
    if (typeof a === 'string') {
        if (typeof b === 'string') {
            return a === b
        } else {
            return a === b.name
        }
    } else {
        if (typeof b === 'string') {
            return a.name === b
        } else {
            if (a.name !== b.name) { return false }
            if (a.nbt === undefined) { return true }
            if (b.nbt === undefined) { return true }
            return isNBTEquals(a.nbt, b.nbt)
        }
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
 * @param {number} origin
 * @param {number} d
 * @returns {Iterable<number>}
 */
function incrementalNeighbors(origin, d) {
    return new Iterable(function*() {
        for (let i = 0; i < d; i++) {
            yield origin + i
            yield origin - i
        }
    })
}

/**
 * @param {Point3} origin
 * @param {number} minDistance
 * @param {number} maxDistance
 * @returns {Iterable<Vec3>}
 */
function spiralIterator(origin, minDistance, maxDistance) {
    return new Iterable(function*() {
        for (let d = minDistance; d <= maxDistance; d++) {
            let wh = d * 2 + 1
            for (let i = 0; i < wh; i++) {
                yield new Vec3(origin.x - d, origin.y, origin.z - d + i)
            }
            for (let i = 1; i < wh; i++) {
                yield new Vec3(origin.x - d + i, origin.y, origin.z - d + wh - 1)
            }
            for (let i = wh - 2; i >= 0; i--) {
                yield new Vec3(origin.x - d + wh - 1, origin.y, origin.z - d + i)
            }
            for (let i = wh - 2; i >= 1; i--) {
                yield new Vec3(origin.x - d + i, origin.y, origin.z - d)
            }
        }
    })
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

/**
 * @param {Readonly<{ value: any; modifiers: Array<{ uuid: string; amount: number; operation: number }>; }>} attribute
 */
function resolveEntityAttribute(attribute) {
    if (!attribute) { return null }
    let res = attribute.value
    if (typeof res !== 'number') { return null }
    for (const modifier of attribute.modifiers) {
        switch (modifier.operation) {
            case 0:
                res += modifier.amount
                break
            // case 1:
            //     debugger
            //     break
            // case 2:
            //     debugger
            //     break
            default:
                throw new Error(`Not implemented`)
        }
    }
    return res
}

/**
 * @typedef {'splice' | 'push' | 'pop' | 'shift' |  'unshift'} ArrayLengthMutationKeys
 */

/**
 * @template T
 * @template {number} L
 * @template [TObj=[T, ...Array<T>]]
 * @typedef {Pick<TObj, Exclude<keyof TObj, ArrayLengthMutationKeys>>
 *  & {
 *    readonly length: L
 *    [I: number]: T
 *    [Symbol.iterator]: () => IterableIterator<T>
 *  }} FixedLengthArray
 */

module.exports = {
    backNForthSort,
    basicRouteSearch,
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
    incrementalNeighbors,
    spiralIterator,
    sequenceEquals,
    stringifyItem,
    isItemEquals,
    resolveEntityAttribute,
}
