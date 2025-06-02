const GameError = require('../errors/game-error')
const { stringifyItemH, isItemEquals } = require('./other')
const taskUtils = require('./tasks')
const Vec3Dimension = require('./vec3-dimension')
const { Vec3 } = require('vec3')
const EnvironmentError = require('../errors/environment-error')
const Iterable = require('./iterable')

/**
 * @param {import('../bruh-bot')} bot
 */
module.exports = (bot) => {


    /**
     * @param {import('prismarine-block').Block} block
     * @param {boolean | 'ignore'} forceLook
     * @param {boolean} allocate
     * @param {import('./interrupt')} interrupt
     * @returns {import('../task').Task<boolean>}
     */
    const dig = function*(block, forceLook, allocate, interrupt) {
        if (allocate) {
            const blockLocation = new Vec3Dimension(block.position, bot.dimension)
            const digLock = bot.env.tryLockBlock(bot.username, blockLocation, 'dig')
            if (!digLock) return false
            try {
                yield* dig(block, forceLook, false, interrupt)
            } finally {
                digLock.unlock()
            }
            return true
        } else {
            const onInterrupt = () => {
                bot.bot.stopDigging()
            }
            interrupt?.on(onInterrupt)
            try {
                yield* taskUtils.wrap(bot.bot.dig(block, forceLook))
            } catch (error) {
                if (error instanceof Error && error.message === 'Digging aborted') {
                    return false
                }
            } finally {
                interrupt?.off(onInterrupt)
            }
            return true
        }
    }

    /**
     * @param {import('prismarine-block').Block} referenceBlock
     * @param {Vec3} faceVector
     * @param {import('./other').ItemId} item
     * @param {boolean} [allocate]
     * @returns {import('../task').Task<boolean>}
     */
    const place = function*(referenceBlock, faceVector, item, allocate = true) {
        const above = referenceBlock.position.offset(faceVector.x, faceVector.y, faceVector.z)
        if (allocate) {
            const blockLocation = new Vec3Dimension(above, bot.dimension)
            const lock = yield* bot.env.lockBlockPlacing(bot, blockLocation, v => v?.name !== 'air')
            if (!lock) return false

            try {
                return yield* place(referenceBlock, faceVector, item, false)
            } finally {
                lock.unlock()
            }
        } else {
            let holds = bot.bot.inventory.slots[bot.bot.getEquipmentDestSlot('hand')]
            if (!holds || !isItemEquals(holds, item)) {
                const itemId = bot.mc.registry.itemsByName[typeof item === 'string' ? item : item.name].id
                yield* taskUtils.wrap(bot.bot.equip(itemId, 'hand'))
            }
            holds = bot.bot.inventory.slots[bot.bot.getEquipmentDestSlot('hand')]
            if (!holds || !isItemEquals(holds, item)) {
                throw new GameError(`I have no ${stringifyItemH(item)}`)
            }

            if (bot.bot.blocks.at(above)?.name !== 'air') {
                throw new EnvironmentError(`Can't place \"${item}\": there is something else there (${bot.bot.blocks.at(above)?.name})`)
            }

            yield* taskUtils.wrap(bot.bot._placeBlockWithOptions(referenceBlock, faceVector, { forceLook: 'ignore' }))

            return true
        }
    }

    /**
     * @param {import('prismarine-block').Block} block
     * @param {boolean} [forceLook]
     * @param {boolean} [allocate]
     * @returns {import('../task').Task<void>}
     */
    const activate = function*(block, forceLook = false, allocate = true) {
        if (allocate) {
            const lock = yield* bot.env.waitLock(bot.username, new Vec3Dimension(block.position, bot.dimension), 'use')
            try {
                yield* taskUtils.wrap(bot.bot.activateBlock(block, null, null, forceLook))
            } finally {
                lock.unlock()
            }
        } else {
            yield* taskUtils.wrap(bot.bot.activateBlock(block, null, null, forceLook))
        }
    }


    /**
     * @type {undefined | Array<{
     *   options: {
     *     matching: ReadonlySet<number>;
     *     point: Vec3;
     *     maxDistance: number;
     *   };
     *   result: ReadonlyArray<import('prismarine-block').Block>;
     *   time: number;
     * }>}
     */
    const findBlocksCache = []

    /**
     * @param {{
     *   matching: number | string | Iterable<string | number> | ReadonlySet<number>;
     *   filter?: (block: import('prismarine-block').Block) => boolean;
     *   point?: Vec3
     *   maxDistance?: number
     *   count?: number
     *   force?: boolean
     * }} options
     * @returns {Iterable<import('prismarine-block').Block>}
     */
    const find = function(options) {
        const Block = require('prismarine-block')(bot.bot.registry)

        /** @type {Set<number>} */
        let matching = null

        if (typeof options.matching === 'number') {
            matching = new Set([options.matching])
            // console.log(`Find block${options.count === 1 ? '' : 's'}`, bot.bot.registry.blocks[options.matching]?.name)
        } else if (typeof options.matching === 'string') {
            matching = new Set([bot.bot.registry.blocksByName[options.matching].id])
            // console.log(`Find block${options.count === 1 ? '' : 's'}`, options.matching)
        } else if ('has' in options.matching) {
            matching = options.matching
            // console.log(`Find block${options.count === 1 ? '' : 's'}`, options.matching.entries().map(v => bot.bot.registry.blocks[v[0]]?.name).toArray())
        } else {
            matching = new Set()
            for (const item of options.matching) {
                if (typeof item === 'string') {
                    matching.add(bot.bot.registry.blocksByName[item].id)
                } else {
                    matching.add(item)
                }
            }
            // console.log(`Find block${options.count === 1 ? '' : 's'}`, options.matching.map(v => typeof v === 'number' ? bot.bot.registry.blocks[v]?.name : v).toArray())
        }

        /**
         * @param {import('prismarine-chunk').PCChunk['sections'][0]} section
         */
        const isBlockInSection = (section) => {
            if (!section) return false // section is empty, skip it (yay!)
            // If the chunk use a palette we can speed up the search by first
            // checking the palette which usually contains less than 20 ids
            // vs checking the 4096 block of the section. If we don't have a
            // match in the palette, we can skip bot section.
            if (section.palette) {
                for (const stateId of section.palette) {
                    if (matching.has(Block.fromStateId(stateId, 0).type)) {
                        return true // the block is in the palette
                    }
                }
                return false // skip
            }
            return true // global palette, the block might be in there
        }

        return new Iterable(function*() {
            const point = (options.point || bot.bot.entity.position).floored()
            const maxDistance = options.maxDistance || 16
            const count = options.count || 1

            if (!options.force) {
                const now = performance.now()
                for (let i = findBlocksCache.length - 1; i >= 0; i--) {
                    const item = findBlocksCache[i]
                    if ((now - item.time) > 20000) {
                        findBlocksCache.splice(i, 1)
                        continue
                    }
                    if (!item.options.point.equals(point)) { continue }
                    if (item.options.maxDistance !== maxDistance) { continue }
                    if (item.options.matching.symmetricDifference(matching).size) { continue }
                    for (const cached of item.result) {
                        yield cached
                    }
                    return
                }
            }

            const start = new Vec3(Math.floor(point.x / 16), Math.floor(point.y / 16), Math.floor(point.z / 16))
            const it = new (require('prismarine-world').iterators.OctahedronIterator)(start, Math.ceil((maxDistance + 8) / 16))
            // the octahedron iterator can sometime go through the same section again
            // we use a set to keep track of visited sections
            const visitedSections = new Set()

            let n = 0
            let startedLayer = 0
            let next = start
            /** @type {Array<import('prismarine-block').Block>} */
            const currentCachedItemResult = []
            /** @type {(typeof findBlocksCache)[0]} */
            const currentCachedItem = {
                options: { matching, maxDistance, point },
                result: currentCachedItemResult,
                time: performance.now(),
            }
            findBlocksCache.push(currentCachedItem)
            while (next) {
                yield
                const column = bot.bot.world.getColumn(next.x, next.z)
                const sectionY = next.y + Math.abs(bot.bot.game.minY >> 4)
                const totalSections = bot.bot.game.height >> 4
                if (sectionY >= 0 && sectionY < totalSections && column && !visitedSections.has(next.toString())) {
                    /** @type {import('prismarine-chunk').PCChunk['sections'][0]} */
                    const section = column.sections[sectionY]
                    if (isBlockInSection(section)) {
                        const begin = new Vec3(next.x * 16, sectionY * 16 + bot.bot.game.minY, next.z * 16)
                        const cursor = begin.clone()
                        const end = cursor.offset(16, 16, 16)
                        for (cursor.x = begin.x; cursor.x < end.x; cursor.x++) {
                            for (cursor.y = begin.y; cursor.y < end.y; cursor.y++) {
                                for (cursor.z = begin.z; cursor.z < end.z; cursor.z++) {
                                    const block = bot.bot.blockAt(cursor)
                                    if (matching.has(block.type) && (!options.filter || options.filter(block)) && cursor.distanceTo(point) <= maxDistance) {
                                        currentCachedItemResult.push(block)
                                        currentCachedItem.time = performance.now()
                                        yield block
                                        n++
                                    }
                                }
                            }
                        }
                    }
                    visitedSections.add(next.toString())
                }
                // If we started a layer, we have to finish it otherwise we might miss closer blocks
                if (startedLayer !== it.apothem && n >= count) {
                    break
                }
                startedLayer = it.apothem
                next = it.next()
            }
        })
    }

    /**
     * @private
     * @param {import('prismarine-block').Block} block
     * @param {Vec3} [eye]
     */
    const _blockVisibility = function(block, eye = null) {
        if (!eye) {
            eye = bot.bot.entity.position.offset(0, bot.bot.entity.eyeHeight, 0)
        }

        // Check faces that could be seen from the current position. If the delta is smaller then 0.5 that means the
        // bot can most likely not see the face as the block is 1 block thick
        // bot could be false for blocks that have a smaller bounding box than 1x1x1
        const dx = eye.x - (block.position.x + 0.5)
        const dy = eye.y - (block.position.y + 0.5)
        const dz = eye.z - (block.position.z + 0.5)

        // Check y first then x and z
        const visibleFaces = {
            y: Math.sign(Math.abs(dy) > 0.5 ? dy : 0),
            x: Math.sign(Math.abs(dx) > 0.5 ? dx : 0),
            z: Math.sign(Math.abs(dz) > 0.5 ? dz : 0)
        }

        const validFaces = []
        const closerBlocks = []

        for (const i of /** @type {['x', 'y', 'z']} */ (Object.keys(visibleFaces))) {
            if (!visibleFaces[i]) continue // skip as bot face is not visible
            // target position on the target block face. -> 0.5 + (current face) * 0.5
            const targetPos = block.position.offset(
                0.5 + (i === 'x' ? visibleFaces[i] * 0.5 : 0),
                0.5 + (i === 'y' ? visibleFaces[i] * 0.5 : 0),
                0.5 + (i === 'z' ? visibleFaces[i] * 0.5 : 0)
            )
            const rayBlock = bot.bot.world.raycast(eye, targetPos.clone().subtract(eye).normalize(), 5)
            if (rayBlock) {
                if (eye.distanceTo(rayBlock.intersect) < eye.distanceTo(targetPos)) {
                    // Block is closer then the raycasted block
                    closerBlocks.push(rayBlock)
                    // continue since if distance is ever less, then we did not intersect the block we wanted,
                    // meaning that the position of the intersected block is not what we want.
                    continue
                }
                const rayPos = rayBlock.position
                if (
                    rayPos.x === block.position.x &&
                    rayPos.y === block.position.y &&
                    rayPos.z === block.position.z
                ) {
                    validFaces.push({
                        face: rayBlock.face,
                        targetPos: rayBlock.intersect
                    })
                }
            }
        }

        return { validFaces, closerBlocks }
    }

    /**
     * @param {import('prismarine-block').Block} block
     * @param {Vec3} [eye]
     */
    const lookAt = async function(block, eye = undefined, force = true) {
        const { validFaces, closerBlocks } = _blockVisibility(block, eye)

        if (validFaces.length > 0) {
            // Chose closest valid face
            let closest
            let distSqrt = 999
            for (const i in validFaces) {
                const tPos = validFaces[i].targetPos
                const cDist = new Vec3(tPos.x, tPos.y, tPos.z).distanceSquared(
                    bot.bot.entity.position.offset(0, bot.bot.entity.eyeHeight, 0)
                )
                if (distSqrt > cDist) {
                    closest = validFaces[i]
                    distSqrt = cDist
                }
            }
            await bot.bot.lookAt(closest.targetPos, force)
        } else if (closerBlocks.length === 0 && block.shapes.length === 0) {
            // no other blocks were detected and the block has no shapes.
            // The block in question is replaceable (like tall grass) so we can just dig it
            // TODO: do AABB + ray intercept check to bot position for digFace.
            await bot.bot.lookAt(block.position.offset(0.5, 0.5, 0.5), force)
        } else {
            // Block is obstructed return error?
            throw new EnvironmentError('Block not in view')
        }
    }

    /**
     * @param {import('prismarine-block').Block} block
     * @param {Vec3} [eye]
     */
    const inView = function(block, eye = null) {
        const { validFaces, closerBlocks } = _blockVisibility(block, eye)
        if (validFaces.length > 0) {
            return true
        } else if (closerBlocks.length === 0 && block.shapes.length === 0) {
            return true
        } else {
            return false
        }
    }


    return {
        dig,
        place,
        activate,
        find,
        lookAt,
        inView,
    }
}
