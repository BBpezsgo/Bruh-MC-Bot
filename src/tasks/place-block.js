'use strict'

const { Vec3 } = require('vec3')
const { wrap, runtimeArgs } = require('../utils/tasks')
const Minecraft = require('../minecraft')
const goto = require('./goto')
const Vec3Dimension = require('../utils/vec3-dimension')
const config = require('../config')

const interactableBlocks = Object.freeze([
    'acacia_door',
    'acacia_fence_gate',
    'acacia_button',
    'acacia_trapdoor',
    'anvil',
    'armor_stand',
    'barrel',
    'beacon',
    'bed_block',
    'bell',
    'birch_boat',
    'birch_button',
    'birch_door',
    'birch_fence_gate',
    'birch_trapdoor',
    'black_bed',
    'black_shulker_box',
    'blast_furnace',
    'blue_bed',
    'blue_shulker_box',
    'brewing_stand',
    'brown_bed',
    'brown_shulker_box',
    'campfire',
    'cauldron',
    'chest',
    'chest_minecart',
    'chipped_anvil',
    'command',
    'command_block',
    'command_block_minecart',
    'comparator',
    'composter',
    'crafting_table',
    'cyan_bed',
    'cyan_shulker_box',
    'damaged_anvil',
    'dark_oak_boat',
    'dark_oak_button',
    'dark_oak_fence_gate',
    'dark_oak_trapdoor',
    'dark_oak_door',
    'daylight_detector',
    'daylight_detector_inverted',
    'diode',
    'diode_block_off',
    'diode_block_on',
    'dispenser',
    'door',
    'dragon_egg',
    'dropper',
    'enchanting_table',
    'enchantment_table',
    'end_crystal',
    'end_portal_frame',
    'ender_portal_frame',
    'ender_chest',
    'explosive_minecart',
    'farmland',
    'fletching_table',
    'flower_pot',
    'furnace',
    'furnace_minecart',
    'gray_bed',
    'gray_shulker_box',
    'green_bed',
    'green_shulker_box',
    'hopper',
    'hopper_minecart',
    'iron_door',
    'iron_trapdoor',
    'item_frame',
    'jukebox',
    'jungle_button',
    'jungle_boat',
    'jungle_door',
    'jungle_fence_gate',
    'jungle_trapdoor',
    'lever',
    'light_blue_bed',
    'light_blue_shulker_box',
    'light_gray_bed',
    'light_gray_shulker_box',
    'lime_bed',
    'lime_shulker_box',
    'magenta_bed',
    'magenta_shulker_box',
    'minecart',
    'note_block',
    'oak_boat',
    'oak_button',
    'oak_door',
    'oak_fence_gate',
    'oak_trapdoor',
    'orange_bed',
    'orange_shulker_box',
    'pink_bed',
    'pink_shulker_box',
    'powered_minecart',
    'purple_bed',
    'purple_shulker_box',
    'red_bed',
    'red_shulker_box',
    'redstone_ore',
    'redstone_comparator_off',
    'redstone_comparator_on',
    'repeating_command_block',
    'repeater',
    'powered_repeater',
    'unpowered_repeater',
    'redstone_torch',
    'saddle',
    'shulker_box',
    'sign',
    'sign_post',
    'smithing_table',
    'smoker',
    'spruce_boat',
    'spruce_button',
    'spruce_door',
    'spruce_fence_gate',
    'stonecutter',
    'stone_button',
    'storage_minecart',
    'tnt_minecart',
    'tnt',
    'trap_door',
    'trapped_chest',
    'white_bed',
    'white_shulker_box',
    'wood_button',
    'yellow_bed',
    'yellow_shulker_box'
])

/** @type {Readonly<Record<string, string>>} */
const blockToItem = Object.freeze({
    'wall_torch': 'torch',
})

const mirroredBlocks = Object.freeze([
    'chest',
    'furnace',
    'stone_button',
    'polished_blackstone_button',
    'iron_door',

    'oak_trapdoor',
    'spruce_trapdoor',
    'birch_trapdoor',
    'jungle_trapdoor',
    'acacia_trapdoor',
    'dark_oak_trapdoor',
    'mangrove_trapdoor',
    'cherry_trapdoor',
    'bamboo_trapdoor',
    'crimson_trapdoor',
    'warped_trapdoor',

    'oak_button',
    'spruce_button',
    'birch_button',
    'jungle_button',
    'acacia_button',
    'dark_oak_button',
    'mangrove_button',
    'cherry_button',
    'bamboo_button',
    'crimson_button',
    'warped_button',
])

/**
 * @param {string} blockName
 */
function getCorrectItem(blockName) {
    return blockToItem[blockName] ?? blockName
}

/**
 * @param {string} itemName
 */
function getCorrectBlock(itemName) {
    const result = []
    for (const blockName in blockToItem) {
        if (blockToItem[blockName] === itemName) {
            result.push(blockName)
        }
    }
    return result
}

/**
 * @type {import('../task').TaskDef<void, ({
 *   item: string | import('prismarine-item').Item;
 * } | {
 *   block: string;
 * }) & {
 *   clearGrass?: boolean;
 *   cheat?: boolean;
 * } & ({} | {
 *   position: Vec3;
 *   properties?: object;
 * })> & {
 *   getCorrectItem: getCorrectItem;
 *   getCorrectBlock: getCorrectBlock;
 * }}
 */
module.exports = {
    task: function*(bot, args) {
        if (args.interrupt.isCancelled) { return }
        if (bot.quietMode) { throw `Can't place block in quiet mode` }

        const item = ('item' in args) ? ((typeof args.item === 'string') ? args.item : args.item.name) : getCorrectItem(args.block)
        const block = ('block' in args) ? args.block : getCorrectBlock((typeof args.item === 'string') ? args.item : args.item.name)[0]

        if (!args.cheat && !bot.searchInventoryItem(null, item)) { throw `I don't have ${item}` }

        /**
         * @param {Vec3} target
         */
        const findBestReferenceBlock = (target) => {
            let validFaceVectors = [
                new Vec3(1, 0, 0),
                new Vec3(0, 1, 0),
                new Vec3(0, 0, 1),
                new Vec3(-1, 0, 0),
                new Vec3(0, -1, 0),
                new Vec3(0, 0, -1),
            ]

            if ('properties' in args && args.properties) {
                if ('axis' in args.properties) {
                    switch (args.properties['axis']) {
                        case 'x':
                            validFaceVectors = [
                                new Vec3(-1, 0, 0),
                                new Vec3(1, 0, 0),
                            ]
                            break
                        case 'y':
                            validFaceVectors = [
                                new Vec3(0, -1, 0),
                                new Vec3(0, 1, 0),
                            ]
                            break
                        case 'z':
                            validFaceVectors = [
                                new Vec3(0, 0, -1),
                                new Vec3(0, 0, 1),
                            ]
                            break
                        default:
                            debugger
                            break
                    }
                } else if ('facing' in args.properties) {
                    /*
                    switch (args.properties['facing']) {
                        case 'east':
                            validFaceVectors = [
                                new Vec3(-1, 0, 0),
                            ]
                            break
                        case 'west':
                            validFaceVectors = [
                                new Vec3(1, 0, 0),
                            ]
                            break
                        case 'south':
                            validFaceVectors = [
                                new Vec3(0, 0, -1),
                            ]
                            break
                        case 'north':
                            validFaceVectors = [
                                new Vec3(0, 0, 1),
                            ]
                            break
                        default:
                            debugger
                            break
                    }
                    */
                }
            }

            for (const faceVector of validFaceVectors) {
                const referenceBlock = bot.bot.blockAt(target.offset(-faceVector.x, -faceVector.y, -faceVector.z))
                if (!referenceBlock || Minecraft.replaceableBlocks[referenceBlock.name]) { continue }
                if (interactableBlocks.includes(referenceBlock.name)) { continue }
                return { referenceBlock, faceVector }
            }

            return null
        }

        /** @type {ReturnType<typeof findBestReferenceBlock>} */
        let placeInfo = null
        /** @type {Vec3 | null} */
        let position = null
        /** @type {Vec3 | null} */
        let botFacing = null
        /** @type {null | 'top' | 'bottom'} */
        let half = null

        if ('properties' in args && args.properties) {
            if ('facing' in args.properties) {
                switch (args.properties['facing']) {
                    case 'west':
                        botFacing = new Vec3(-1, 0, 0)
                        break
                    case 'east':
                        botFacing = new Vec3(1, 0, 0)
                        break
                    case 'north':
                        botFacing = new Vec3(0, 0, -1)
                        break
                    case 'south':
                        botFacing = new Vec3(0, 0, 1)
                        break
                    default:
                        debugger
                        break
                }
            }
            if ('half' in args.properties) {
                switch (args.properties['half']) {
                    case 'top':
                        half = 'top'
                        break
                    case 'bottom':
                        half = 'bottom'
                        break
                    default:
                        break
                }

                if (args.properties.half === 'upper') {
                    return
                }
            }
        }

        if (mirroredBlocks.includes(block)) {
            botFacing.x *= -1
            botFacing.y *= -1
            botFacing.z *= -1
        }

        if ('position' in args) {
            position = args.position
            placeInfo = findBestReferenceBlock(position)
        } else {
            for (let x = -config.placeAnywhere.placeSearchRadiusH; x <= config.placeAnywhere.placeSearchRadiusH; x++) {
                for (let y = -config.placeAnywhere.placeSearchRadiusV; y <= config.placeAnywhere.placeSearchRadiusV; y++) {
                    for (let z = -config.placeAnywhere.placeSearchRadiusH; z <= config.placeAnywhere.placeSearchRadiusH; z++) {
                        if (x === 0 && z === 0) { continue }

                        const current = bot.bot.entity.position.floored().offset(x, y, z)
                        const above = bot.bot.blockAt(current)
                        const _placeInfo = findBestReferenceBlock(current)
                        if (!_placeInfo) { continue }

                        if (Minecraft.replaceableBlocks[above.name]) {
                            if (!position) {
                                position = current
                                placeInfo = _placeInfo
                            } else {
                                const d1 = position.distanceSquared(bot.bot.entity.position)
                                const d2 = current.distanceSquared(bot.bot.entity.position)
                                if (d2 < d1) {
                                    position = current
                                    placeInfo = _placeInfo
                                }
                            }
                        }
                    }
                }
            }

            if (!position) { throw `Couldn't find a place to place the block` }
        }

        if (!placeInfo) { throw `Couldn't find a reference block` }

        const referencePosition = position.offset(-placeInfo.faceVector.x, -placeInfo.faceVector.y, -placeInfo.faceVector.z)
        const blockPosition = new Vec3Dimension(position, bot.dimension)

        let blockHere = bot.bot.blockAt(position)
        while (blockHere && Minecraft.replaceableBlocks[blockHere.name] === 'break') {
            yield* goto.task(bot, {
                block: position,
                ...runtimeArgs(args),
            })

            if (args.interrupt.isCancelled) { return }

            if (!bot.env.allocateBlock(bot.username, blockPosition, 'dig')) {
                console.log(`[Bot "${bot.username}"] Block will be digged by someone else, waiting ...`)
                yield* bot.env.waitUntilBlockIs(blockPosition, 'dig')
                blockHere = bot.bot.blockAt(position)
                continue
            }

            if (!args.clearGrass) {
                throw `Can't place the block because the block above is "${blockHere.name}" and I'm not allowed to break it`
            }

            yield* goto.task(bot, {
                block: position,
                ...runtimeArgs(args),
            })

            if (args.interrupt.isCancelled) { return }

            yield* wrap(bot.bot.dig(blockHere), args.interrupt)
        }

        if (!bot.env.allocateBlock(bot.username, blockPosition, 'place', { item: bot.bot.registry.itemsByName[item].id })) {
            console.log(`Block will be placed by someone else`)
            return
        }

        try {
            for (let i = 3; i >= 0; i--) {
                yield* goto.task(bot, {
                    block: position,
                    ...runtimeArgs(args),
                })

                let imInTheWay = false

                if (position.offset(0.5, 0.5, 0.5).manhattanDistanceTo(bot.bot.entity.position) <= bot.bot.entity.width + 0.5) {
                    imInTheWay = true
                } else if (position.offset(0.5, 0.5, 0.5).manhattanDistanceTo(bot.bot.entity.position.offset(0, 1, 0)) <= bot.bot.entity.width + 0.5) {
                    imInTheWay = true
                }

                if (imInTheWay) {
                    yield* goto.task(bot, {
                        flee: position,
                        distance: 1.9,
                        ...runtimeArgs(args),
                    })
                }

                if (blockHere && Minecraft.replaceableBlocks[blockHere.name] !== 'yes') {
                    throw `There is already a block here: ${blockHere.name}`
                }

                const referenceBlock = bot.bot.blockAt(referencePosition)
                if (!referenceBlock || Minecraft.replaceableBlocks[referenceBlock.name]) {
                    throw `Invalid reference block ${referenceBlock.name}`
                }

                if (args.interrupt.isCancelled) { return }

                if (!bot.searchInventoryItem(null, item)) {
                    if (args.cheat) {
                        yield* wrap(bot.commands.sendAsync(`/give @p ${item}`), args.interrupt)
                    } else {
                        throw `I don't have ${item}`
                    }
                }

                try {
                    yield* wrap(bot.bot.equip(bot.mc.registry.itemsByName[item].id, 'hand'), args.interrupt)
                    if (botFacing) {
                        const yaw = Math.atan2(-botFacing.x, -botFacing.z)
                        const groundDistance = Math.sqrt(botFacing.x * botFacing.x + botFacing.z * botFacing.z)
                        const pitch = Math.atan2(botFacing.y, groundDistance)
                        yield* wrap(bot.bot.look(yaw, pitch, bot.instantLook), args.interrupt)
                    }

                    if (args.interrupt.isCancelled) { return }
                    yield* wrap(bot.bot._placeBlockWithOptions(referenceBlock, placeInfo.faceVector, { forceLook: 'ignore', half: half }), args.interrupt)
                    break
                } catch (error) {
                    if (i === 0) { throw error }
                    // console.warn(`[Bot "${bot.username}"] Failed to place ${item}, retrying ... (${i})`)
                }
            }
        } finally {
            bot.env.deallocateBlock(bot.username, blockPosition)
        }
    },
    id: function(args) {
        if ('item' in args) {
            return `place-item-${args.item}-${args.clearGrass}`
        } else {
            return `place-block-${args.block}-${args.clearGrass}`
        }
    },
    humanReadableId: function(args) {
        if ('item' in args) {
            return `Placing ${args.item}`
        } else {
            return `Placing ${args.block}`
        }
    },
    definition: 'placeBlock',
    getCorrectItem: getCorrectItem,
    getCorrectBlock: getCorrectBlock,
}
