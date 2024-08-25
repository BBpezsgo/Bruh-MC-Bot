const { Block } = require('prismarine-block')
const { wrap } = require('../utils/tasks')
const placeBlock = require('./place-block')
const { Vec3 } = require('vec3')
const { incrementalNeighbors } = require('../utils/other')

/**
 * @typedef {{
 *   DataVersion: number;
 *   author?: string;
 *   size: [number, number, number];
 *   palette: Array<{
 *     Name: string;
 *     Properties?: Record<string, any>;
 *   }>;
 *   palettes?: Array<any>;
 *   blocks: Array<{
 *     pos: [number, number, number];
 *     state: number;
 *     nbt?: object;
 *   }>;
 *   entities: Array<{
 *     pos: [number, number, number];
 *     blockPos: [number, number, number];
 *     nbt?: object;
 *   }>;
 * }} Structure
 */

/**
 * @param {import("fs").PathOrFileDescriptor} filePath
 */
function* readStructure(filePath) {
    const buffer = require('fs').readFileSync(filePath)
    const nbt = yield* wrap(require('prismarine-nbt').parse(buffer))
    /** @type {Structure} */
    const structure = require('../utils/other').NBT2JSON(nbt.parsed)
    return structure.blocks.map(v => ({
        position: new Vec3(v.pos[0], v.pos[1], v.pos[2]),
        name: structure.palette[v.state].Name.replace('minecraft:', ''),
        properties: structure.palette[v.state].Properties,
        nbt: v.nbt,
    }))
}

/**
 * @param {import('../bruh-bot')} bot 
 * @param {ReadonlyArray<{ position: Vec3; }>} blocks
 * @param {(origin: Vec3) => import('../task').Task<boolean | 'stop'>} confirmationCallback
 * @returns {import('../task').Task<Vec3 | null>}
 */
function* findPosition(bot, blocks, confirmationCallback) {
    /**
     * @type {Array<Vec3>}
     */
    const floorBlocks = []
    let minY = blocks[0].position.y
    let maxY = blocks[0].position.y

    for (const block of blocks) {
        minY = Math.min(block.position.y, minY)
        maxY = Math.max(block.position.y, maxY)
        let found = false
        for (const floorBlock of floorBlocks) {
            if (floorBlock.x == block.position.x &&
                floorBlock.z === block.position.z) {
                floorBlock.y = Math.min(block.position.y, floorBlock.y)
                found = true
            }
        }
        if (found) { continue }
        floorBlocks.push(block.position.clone())
    }

    /**
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {import('../task').Task<boolean>}
     */
    const checkPlacement = function*(x, y, z) {
        for (const block of blocks) {
            yield
            const position = block.position.offset(x, y, z)
            const blockAt = bot.bot.blockAt(position)
            if (!blockAt || blockAt.name !== 'air') {
                bot.debug.drawPoint(position, [1, 0, 0])
                return false
            }
            bot.debug.drawPoint(position, [0, 1, 0])
        }
        return true
    }

    const botPosition = bot.bot.entity.position.floored()
    const margin = 1
    /**
     * @type {Array<Vec3>}
     */
    const marginBlocks = []
    /**
     * @type {Array<Vec3>}
     */
    const floorMarginBlocks = []

    for (const floorBlock of floorBlocks) {
        for (let x = -margin; x <= margin; x++) {
            for (let z = -margin; z <= margin; z++) {
                const position = floorBlock.offset(x, 0, z)
                let added = false
                for (const other of floorMarginBlocks) {
                    if (other.equals(position)) {
                        added = true
                        break
                    }
                }
                if (added) { continue }
                for (const other of floorBlocks) {
                    if (other.equals(position)) {
                        added = true
                        break
                    }
                }
                if (added) { continue }
                floorMarginBlocks.push(position)
            }
        }
    }

    for (const block of blocks) {
        if (floorBlocks.find(v => v.equals(block.position))) { continue }
        for (let x = -margin; x <= margin; x++) {
            for (let y = -margin; y <= margin; y++) {
                for (let z = -margin; z <= margin; z++) {
                    const position = block.position.offset(x, 0, z)
                    let added = false
                    for (const other of marginBlocks) {
                        if (other.equals(position)) {
                            added = true
                            break
                        }
                    }
                    if (added) { continue }
                    for (const other of floorMarginBlocks) {
                        if (other.equals(position)) {
                            added = true
                            break
                        }
                    }
                    if (added) { continue }
                    for (const other of blocks) {
                        if (other.position.equals(position)) {
                            added = true
                            break
                        }
                    }
                    if (added) { continue }
                    marginBlocks.push(position)
                }
            }
        }
    }

    for (const x of incrementalNeighbors(botPosition.x, 20)) {
        for (const z of incrementalNeighbors(botPosition.z, 20)) {
            yield
            for (const y of incrementalNeighbors(botPosition.y, 5)) {
                let isOnGround = true
                for (const floorBlock of floorBlocks) {
                    const belowBlock = bot.bot.blockAt(floorBlock.offset(x, y - 1, z))
                    if (!belowBlock || belowBlock.name !== 'grass_block') {
                        isOnGround = false
                        if (belowBlock) bot.debug.drawPoint(belowBlock.position, [0, 0, 1])
                        break
                    }
                }
                if (!isOnGround) { continue }
                for (const floorMarginBlock of floorMarginBlocks) {
                    const belowBlock = bot.bot.blockAt(floorMarginBlock.offset(x, y - 1, z))
                    if (!belowBlock || belowBlock.name !== 'grass_block') {
                        isOnGround = false
                        if (belowBlock) bot.debug.drawPoint(belowBlock.position, [0, 0, 1])
                        break
                    }
                }
                if (!isOnGround) { continue }
                let marginCheck = true
                for (const marginBlock of marginBlocks) {
                    const belowBlock = bot.bot.blockAt(marginBlock.offset(x, y, z))
                    if (!belowBlock || belowBlock.name !== 'air') {
                        marginCheck = false
                        if (belowBlock) bot.debug.drawPoint(belowBlock.position, [0, 0, 1])
                        break
                    }
                }
                if (!marginCheck) { continue }
                if (yield* checkPlacement(x, y, z)) {
                    const confirmation = yield* confirmationCallback(new Vec3(x, y, z))
                    if (confirmation === true) {
                        return new Vec3(x, y, z)
                    }
                    if (confirmation === 'stop') {
                        return null
                    }
                }
            }
        }
    }

    return null
}

/**
 * @type {import('../task').TaskDef<void, {
 *   blocks: ReadonlyArray<{
 *     position: Vec3;
 *     name: string;
 *     properties: Record<string, any>;
 *     nbt: object;
 *   }>
 * }> & {
 *   findPosition: findPosition;
 *   readStructure: readStructure;
 * }}
 */
module.exports = {
    task: function*(bot, args) {
        const blocks = args.blocks.filter(v => {
            if (v.name === 'air') { return false }
            if (v.properties &&
                (v.name === 'white_bed' ||
                    v.name === 'light_gray_bed' ||
                    v.name === 'gray_bed' ||
                    v.name === 'black_bed' ||
                    v.name === 'brown_bed' ||
                    v.name === 'red_bed' ||
                    v.name === 'orange_bed' ||
                    v.name === 'yellow_bed' ||
                    v.name === 'lime_bed' ||
                    v.name === 'green_bed' ||
                    v.name === 'cyan_bed' ||
                    v.name === 'light_blue_bed' ||
                    v.name === 'blue_bed' ||
                    v.name === 'purple_bed' ||
                    v.name === 'magenta_bed' ||
                    v.name === 'pink_bed')) {
                if (v.properties['part'] === 'head') { return false }
            }
            return true
        })

        /** @type {Record<string, number>} */
        const itemsToGive = {}
        for (const block of blocks) {
            const itemToGive = placeBlock.getCorrectItem(block.name)
            itemsToGive[itemToGive] ??= 0
            itemsToGive[itemToGive]++
        }

        // yield* wrap(bot.commands.sendAsync(`/clear @p`))
        // for (const itemName in itemsToGive) {
        //     yield* wrap(bot.commands.sendAsync(`/give @p ${itemName} ${itemsToGive[itemName]}`))
        // }

        // for (const block of blocks) {
        //     if (bot.bot.blockAt(block.position)?.name !== 'air') {
        //         yield* wrap(bot.commands.sendAsync(`/setblock ${block.position.x} ${block.position.y} ${block.position.z} minecraft:air`))
        //     }
        // }

        /**
         * @param {Block | { name: string; properties: any; }} a
         * @param {Block | { name: string; properties: any; }} b
         */
        const areBlockEqual = (a, b) => {
            if (a.name !== b.name) { return false }
            const propA = (('properties' in a) ? a.properties : a.getProperties()) ?? {}
            const propB = (('properties' in b) ? b.properties : b.getProperties()) ?? {}

            if (Object.keys(propA).length !== Object.keys(propB).length) {
                return false
            }

            for (const key of Object.keys(propB)) {
                if ((propB[key] + '') !== (propA[key] + '')) {
                    return false
                }
            }

            return true
        }

        const remainingBlocks = [...blocks]

        remainingBlocks.reverse()

        while (remainingBlocks.length > 0) {
            yield
            const blockCountBefore = remainingBlocks.length
            let lastError = null
            for (let i = remainingBlocks.length - 1; i >= 0; i--) {
                const block = remainingBlocks[i]
                const alreadyHere = bot.bot.blockAt(block.position)

                if (areBlockEqual(block, alreadyHere)) {
                    remainingBlocks.splice(i, 1)
                    continue
                }

                try {
                    yield* placeBlock.task(bot, {
                        block: block.name,
                        position: block.position,
                        properties: block.properties,
                        cheat: true,
                    })
                    remainingBlocks.splice(i, 1)
                } catch (error) {
                    lastError = error
                }
            }
            if (blockCountBefore === remainingBlocks.length) {
                throw lastError ?? `Failed`
            }
        }

        for (const block of blocks) {
            const alreadyHere = bot.bot.blockAt(block.position)
            if (!alreadyHere) { continue }
            if (areBlockEqual(alreadyHere, block)) { continue }
            debugger
            throw `Failed`
        }
    },
    id: `build`,
    humanReadableId: 'Build something',
    definition: 'build',
    findPosition: findPosition,
    readStructure: readStructure,
}
