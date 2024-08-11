const { Block } = require('prismarine-block')
const { Item } = require('prismarine-item')
const { Recipe, RecipeItem } = require('prismarine-recipe')
const getMcData = require('minecraft-data')
const MinecraftData = require('./mc-data')
const { EntityPose } = require('./entity-metadata')

/**
 * @typedef { 'sword' | 'shovel' | 'pickaxe' | 'axe' | 'hoe' } Tool
 */

/**
 * @typedef {'break' | 'activate'} HarvestMode
 */

/**
 * @typedef {SimpleCrop | SeededCrop | BlockCrop | FruitCrop | Tree | SpreadingCrop} AnyCrop
 */

/**
 * @typedef {{
 *   growsOnBlock: 'solid' | ReadonlyArray<string>;
 *   growsOnSide: 'top' | 'bottom' | 'side';
 *   canUseBonemeal: boolean;
 *   lightLevel?: { min?: number; max?: number; };
 * }} GeneralCrop
 */

/**
 * @typedef {GeneralCrop & {
 *   type: 'simple';
 *   seed: string;
 *   grownAge: number;
 * }} SimpleCrop
 */

/**
 * @typedef {GeneralCrop & {
 *   type: 'seeded';
 *   seed: string;
 *   grownAge: number;
 * }} SeededCrop
 */

/**
 * @typedef {GeneralCrop & {
 *   type: 'grows_block';
 *   seed: string;
 *   grownBlock: string;
 *   attachedCropName?: string;
 * }} BlockCrop
 */

/**
 * @typedef {GeneralCrop & {
 *   type: 'grows_fruit';
 *   seed: string;
 * }} FruitCrop
 */

/**
 * @typedef {GeneralCrop & {
 *   type: 'tree';
 *   sapling: string;
 *   log: string;
 *   size: 'small' | 'can-be-large' | 'always-large';
 *   branches: 'never' | 'sometimes' | 'always';
 * }} Tree
 */

/**
 * @typedef {GeneralCrop & {
 *   type: 'spread';
 *   seed: string;
 * }} SpreadingCrop
 */

/**
 * @typedef { 'wooden' | 'stone' | 'iron' | 'golden' | 'diamond' | 'netherite' } ToolLevel
 */

module.exports = class MC {
    /**
     * @readonly
     * @type {getMcData.IndexedData}
     */
    data

    /**
     * @readonly
     * @type {MinecraftData}
     */
    data2

    /**
     * @readonly
     * @type {{ [block: string]: undefined | 'yes' | 'break' }}
     */
    static replaceableBlocks = Object.freeze({
        'air': 'yes',
        'cave_air': 'yes',
        'short_grass': 'break',
        'tall_grass': 'break',
    })

    /**
     * @readonly
     */
    static tools = Object.freeze({
        sword: {
            wooden: 'wooden_sword',
            stone: 'stone_sword',
            iron: 'iron_sword',
            golden: 'golden_sword',
            diamond: 'diamond_sword',
            netherite: 'netherite_sword',
        },
        shovel: {
            wooden: 'wooden_shovel',
            stone: 'stone_shovel',
            iron: 'iron_shovel',
            golden: 'golden_shovel',
            diamond: 'diamond_shovel',
            netherite: 'netherite_shovel',
        },
        pickaxe: {
            wooden: 'wooden_pickaxe',
            stone: 'stone_pickaxe',
            iron: 'iron_pickaxe',
            golden: 'golden_pickaxe',
            diamond: 'diamond_pickaxe',
            netherite: 'netherite_pickaxe',
        },
        axe: {
            wooden: 'wooden_axe',
            stone: 'stone_axe',
            iron: 'iron_axe',
            golden: 'golden_axe',
            diamond: 'diamond_axe',
            netherite: 'netherite_axe',
        },
        hoe: {
            wooden: 'wooden_hoe',
            stone: 'stone_hoe',
            iron: 'iron_hoe',
            golden: 'golden_hoe',
            diamond: 'diamond_hoe',
            netherite: 'netherite_hoe',
        },
    })

    /**
     * @readonly
     * @type {readonly [ 'wooden', 'stone', 'iron', 'golden', 'diamond', 'netherite']}
     */
    static toolLevels = Object.freeze([
        'wooden',
        'stone',
        'iron',
        'golden',
        'diamond',
        'netherite',
    ])

    /**
     * @readonly
     */
    static soilBlocks = Object.freeze([
        'grass_block',
        'podzol',
        'mycelium',
        'coarse_dirt',
        'dirt',
        'farmland',
        'rooted_dirt',
        'mud',
        'moss_block',
        'muddy_mangrove_roots',
    ])

    /**
     * @readonly
     * @type {Record<string, AnyCrop>}
     */
    static cropsByBlockName = {
        'potatoes': {
            type: 'simple',
            seed: 'potato',
            grownAge: 7,
            growsOnBlock: ['farmland'],
            growsOnSide: 'top',
            canUseBonemeal: true,
            lightLevel: { min: 9 },
        },
        'beetroots': {
            type: 'seeded',
            seed: 'beetroot_seeds',
            grownAge: 3,
            growsOnBlock: ['farmland'],
            growsOnSide: 'top',
            canUseBonemeal: true,
            lightLevel: { min: 9 },
        },
        'wheat': {
            type: 'seeded',
            seed: 'wheat_seeds',
            grownAge: 7,
            growsOnBlock: ['farmland'],
            growsOnSide: 'top',
            canUseBonemeal: true,
            lightLevel: { min: 9 },
        },
        'carrots': {
            type: 'simple',
            seed: 'carrot',
            grownAge: 7,
            growsOnBlock: ['farmland'],
            growsOnSide: 'top',
            canUseBonemeal: true,
            lightLevel: { min: 9 },
        },
        'melon_stem': {
            type: 'grows_block',
            seed: 'melon_seeds',
            grownBlock: 'melon',
            attachedCropName: 'attached_melon_stem',
            growsOnBlock: ['farmland'],
            growsOnSide: 'top',
            canUseBonemeal: true,
            lightLevel: { min: 9 },
        },
        'pumpkin_stem': {
            type: 'grows_block',
            seed: 'pumpkin_seeds',
            grownBlock: 'pumpkin',
            attachedCropName: 'attached_pumpkin_stem',
            growsOnBlock: ['farmland'],
            growsOnSide: 'top',
            canUseBonemeal: true,
            lightLevel: { min: 9 },
        },
        // 'pitcher_crop': {
        //     type: 'seeded',
        //     seed: 'pitcher_pod',
        // },
        // 'torchflower_crop': {
        //     type: 'seeded',
        //     seed: 'torchflower_seeds',
        // },
        'sweet_berry_bush': {
            type: 'grows_fruit',
            seed: 'sweet_berries',
            growsOnBlock: [
                'grass_block',
                'dirt',
                'podzol',
                'coarse_dirt',
                'farmland',
                'moss_block',
            ],
            growsOnSide: 'top',
            canUseBonemeal: true,
            lightLevel: { min: 9 },
        },
        'cocoa': {
            type: 'simple',
            seed: 'cocoa_beans',
            grownAge: 2,
            growsOnBlock: [
                'jungle_log',
                'jungle_wood',
                'stripped_jungle_log',
                'stripped_jungle_wood',
            ],
            growsOnSide: 'side',
            canUseBonemeal: true,
        },
        'nether_wart': {
            type: 'simple',
            seed: 'nether_wart',
            grownAge: 3,
            growsOnBlock: ['soul_sand'],
            growsOnSide: 'top',
            canUseBonemeal: false,
        },
        'cave_vines': {
            type: 'grows_fruit',
            seed: 'glow_berries',
            growsOnBlock: 'solid',
            growsOnSide: 'bottom',
            canUseBonemeal: true,
        },
        'cave_vines_plant': {
            type: 'grows_fruit',
            seed: 'glow_berries',
            growsOnBlock: 'solid',
            growsOnSide: 'bottom',
            canUseBonemeal: true,
        },
        'oak_sapling': {
            type: 'tree',
            sapling: 'oak_sapling',
            log: 'oak_log',
            size: 'small',
            branches: 'sometimes',
            canUseBonemeal: true,
            growsOnBlock: MC.soilBlocks,
            growsOnSide: 'top',
            lightLevel: { min: 9 },
        },
        'spruce_sapling': {
            type: 'tree',
            sapling: 'spruce_sapling',
            log: 'spruce_log',
            size: 'can-be-large',
            branches: 'never',
            canUseBonemeal: true,
            growsOnBlock: MC.soilBlocks,
            growsOnSide: 'top',
            lightLevel: { min: 9 },
        },
        'birch_sapling': {
            type: 'tree',
            sapling: 'birch_sapling',
            log: 'birch_log',
            size: 'small',
            branches: 'never',
            canUseBonemeal: true,
            growsOnBlock: MC.soilBlocks,
            growsOnSide: 'top',
            lightLevel: { min: 9 },
        },
        'jungle_sapling': {
            type: 'tree',
            sapling: 'jungle_sapling',
            log: 'jungle_log',
            size: 'can-be-large',
            branches: 'never',
            canUseBonemeal: true,
            growsOnBlock: MC.soilBlocks,
            growsOnSide: 'top',
            lightLevel: { min: 9 },
        },
        'acacia_sapling': {
            type: 'tree',
            sapling: 'acacia_sapling',
            log: 'acacia_log',
            size: 'small',
            branches: 'always',
            canUseBonemeal: true,
            growsOnBlock: MC.soilBlocks,
            growsOnSide: 'top',
            lightLevel: { min: 9 },
        },
        'dark_oak_sapling': {
            type: 'tree',
            sapling: 'dark_oak_sapling',
            log: 'dark_oak_log',
            size: 'always-large',
            branches: 'never',
            canUseBonemeal: true,
            growsOnBlock: MC.soilBlocks,
            growsOnSide: 'top',
            lightLevel: { min: 9 },
        },
        'mangrove_propagule': {
            type: 'tree',
            sapling: 'mangrove_propagule',
            log: 'mangrove_log',
            size: 'small',
            branches: 'always',
            canUseBonemeal: true,
            growsOnBlock: [
                ...MC.soilBlocks,
                'clay',
            ],
            growsOnSide: 'top',
            lightLevel: { min: 9 },
        },
        'cherry_sapling': {
            type: 'tree',
            sapling: 'cherry_sapling',
            log: 'cherry_log',
            size: 'small',
            branches: 'always',
            canUseBonemeal: true,
            growsOnBlock: MC.soilBlocks,
            growsOnSide: 'top',
            lightLevel: { min: 9 },
        },
        'azalea': {
            type: 'tree',
            sapling: 'azalea',
            log: 'oak_log',
            size: 'small',
            branches: 'always',
            canUseBonemeal: true,
            growsOnBlock: [
                ...MC.soilBlocks,
                'clay',
            ],
            growsOnSide: 'top',
            lightLevel: { min: 9 },
        },
        'flowering_azalea': {
            type: 'tree',
            sapling: 'flowering_azalea',
            log: 'oak_log',
            size: 'small',
            branches: 'always',
            canUseBonemeal: true,
            growsOnBlock: [
                ...MC.soilBlocks,
                'clay',
            ],
            growsOnSide: 'top',
            lightLevel: { min: 9 },
        },
        'brown_mushroom': {
            type: 'spread',
            seed: 'brown_mushroom',
            canUseBonemeal: false,
            growsOnBlock: [
                ...MC.soilBlocks,
            ],
            growsOnSide: 'top',
            lightLevel: { max: 12 },
        },
        'red_mushroom': {
            type: 'spread',
            seed: 'red_mushroom',
            canUseBonemeal: false,
            growsOnBlock: [
                ...MC.soilBlocks,
            ],
            growsOnSide: 'top',
            lightLevel: { max: 12 },
        },
    }

    // iron_golem, llama, polar_bear, trader_llama, vex, wither

    /**
     * @param {import('prismarine-entity').Entity} entity
     * @returns {boolean}
     */
    static canEntityAttack(entity) {
        if (entity.metadata[2]) { return false }
        if (entity.metadata[6] === EntityPose.DYING) { return false }
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
     * @typedef {number | { easy: number; normal: number; hard: number; }} DamageAmount
     */

    /**
     * @readonly
     * @type {Readonly<Record<string, {
     *   rangeOfSight: number;
     *   meleeAttack?: {
     *     range: number;
     *     damage: DamageAmount | ((entity: import('prismarine-entity').Entity) => DamageAmount);
     *   };
     *   rangeAttack?: {
     *     range: number;
     *     damage: DamageAmount | ((entity: import('prismarine-entity').Entity) => DamageAmount);
     *   };
     * }>>}
     */
    static get hostiles() { return ({
        'shulker': {
            rangeAttack: {
                range: 16,
                damage: 4,
            },
            rangeOfSight: 16,
        },
        'blaze': {
            meleeAttack: {
                range: 1,
                damage: { easy: 4, normal: 6, hard: 9 },
            },
            rangeAttack: {
                range: 48,
                damage: 5,
            },
            rangeOfSight: 48,
        },
        'drowned': {
            meleeAttack: {
                range: 2,
                damage: { easy: 2.5, normal: 3, hard: 4.5 },
            },
            rangeOfSight: 24,
        },
        'illusioner': {
            meleeAttack: {
                range: 2,
                damage: { easy: 5, normal: 5, hard: 5 }
            },
            rangeOfSight: 16,
        },
        'phantom': {
            meleeAttack: {
                range: 2,
                damage: { easy: 2, normal: 2, hard: 3 }
            },
            rangeOfSight: 64,
        },
        'warden': {
            meleeAttack: {
                range: 2,
                damage: { easy: 16, normal: 30, hard: 45 },
            },
            rangeAttack: {
                range: 20,
                damage: { easy: 6, normal: 10, hard: 15 },
            },
            rangeOfSight: 16,
        },
        'evoker': {
            meleeAttack: {
                range: 2,
                damage: 24,
            },
            rangeOfSight: 12,
        },
        'creeper': {
            meleeAttack: {
                range: 3,
                damage: { easy: 22, normal: 43, hard: 64 },
            },
            rangeOfSight: 15,
        },
        'skeleton': {
            meleeAttack: {
                range: 2,
                damage: { easy: 2, normal: 2, hard: 3 }
            },
            rangeAttack: {
                range: 15,
                damage: { easy: 4, normal: 4, hard: 5 },
            },
            rangeOfSight: 16,
        },
        'cave_spider': {
            meleeAttack: {
                range: 2,
                damage: { easy: 2, normal: 2, hard: 3 },
            },
            rangeOfSight: 16,
        },
        'endermite': {
            meleeAttack: {
                range: 2,
                damage: { easy: 2, normal: 2, hard: 3 },
            },
            rangeOfSight: 16,
        },
        'hoglin': {
            meleeAttack: {
                range: 2,
                damage: { easy: 5, normal: 8, hard: 12 },
            },
            rangeOfSight: 16,
        },
        'magma_cube': {
            meleeAttack: {
                range: 2,
                damage: function(entity) {
                    /** @type {number} */ //@ts-ignore
                    const size = entity.metadata[16]
                    switch (size) {
                        case 0: return { easy: 2.5, normal: 3, hard: 4.5 }
                        case 1: return { easy: 3, normal: 5, hard: 6 }
                        case 2: return { easy: 4, normal: 6, hard: 9 }
                        default: return { easy: 4, normal: 6, hard: 9 }
                    }
                },
            },
            rangeOfSight: 16,
        },
        'slime': {
            meleeAttack: {
                range: 2,
                damage: function(entity) {
                    /** @type {number} */ //@ts-ignore
                    const size = entity.metadata[16]
                    switch (size) {
                        case 0: return { easy: 0, normal: 0, hard: 0 }
                        case 1: return { easy: 2, normal: 2, hard: 3 }
                        case 2: return { easy: 3, normal: 4, hard: 6 }
                        default: return { easy: 3, normal: 4, hard: 6 }
                    }
                },
            },
            rangeOfSight: 16,
        },
        'wither_skeleton': {
            meleeAttack: {
                range: 2,
                // armed
                damage: { easy: 5, normal: 8, hard: 12 },
            },
            rangeOfSight: 16,
        },
        'witch': {
            rangeAttack: {
                range: 8,
                damage: 6, // harming potion
            },
            rangeOfSight: 16,
        },
        'spider': {
            meleeAttack: {
                range: 2,
                damage: { easy: 2, normal: 2, hard: 3 },
            },
            rangeOfSight: 16,
        },
        'stray': {
            meleeAttack: {
                range: 2,
                damage: { easy: 2, normal: 2, hard: 3 },
            },
            rangeAttack: {
                range: 15,
                // 3 - 5
                damage: { easy: 5, normal: 5, hard: 5 },
            },
            // also has tipped arrows
            rangeOfSight: 16,
        },
        'ravager': {
            meleeAttack: {
                range: 2,
                damage: { easy: 7, normal: 12, hard: 18 },
            },
            // roar: 6
            rangeOfSight: 32,
        },
        'husk': {
            meleeAttack: {
                range: 2,
                damage: { easy: 2.5, normal: 3, hard: 4.5 },
            },
            rangeOfSight: 35,
        },
        'zombie_villager': {
            meleeAttack: {
                range: 2,
                damage: { easy: 2.5, normal: 3, hard: 4.5 },
            },
            rangeOfSight: 35,
        },
        'zombie': {
            meleeAttack: {
                range: 2,
                damage: { easy: 2.5, normal: 3, hard: 4.5 },
            },
            rangeOfSight: 35,
        },
        'piglin': {
            meleeAttack: {
                range: 2,
                damage: { easy: 5, normal: 8, hard: 12 },
            },
            rangeAttack: {
                range: 16, // ?
                damage: { easy: 5, normal: 5, hard: 5 },
            },
            rangeOfSight: 16,
        },
        'piglin_brute': {
            meleeAttack: {
                range: 2,
                damage: { easy: 7.5, normal: 13, hard: 19.5 },
            },
            // also can be unarmed
            rangeOfSight: 16,
        },
        'pillager': {
            rangeAttack: {
                range: 8,
                damage: { easy: 3.5, normal: 4, hard: 4.5 },
            },
            rangeOfSight: 64,
        },
        'silverfish': {
            meleeAttack: {
                range: 2,
                damage: { easy: 1, normal: 1, hard: 1.5 },
            },
            rangeOfSight: 16,
        },
        'zoglin': {
            meleeAttack: {
                range: 2,
                damage: { easy: 5, normal: 8, hard: 12 },
            },
            rangeOfSight: 16,
        },
        'vindicator': {
            meleeAttack: {
                range: 2,
                damage: { easy: 7.5, normal: 13, hard: 19.5 },
            },
            // also can be unarmed
            rangeOfSight: 16,
        },
        'enderman': {
            meleeAttack: {
                range: 2,
                damage: { easy: 4.5, normal: 7, hard: 10.5 },
            },
            rangeOfSight: 64,
        },
        'zombified_piglin': {
            meleeAttack: {
                range: 2,
                damage: { easy: 5, normal: 8, hard: 12 },
            },
            // also can be unarmed
            rangeOfSight: 55,
        },
        'ghast': {
            rangeAttack: {
                range: 64,
                damage: 6,
                // + explosion
            },
            rangeOfSight: 64,
        },
    }) }

    /**
     * @param {string} blockName
     * @returns {(AnyCrop & { cropName: string }) | null}
     */
    static resolveCrop(blockName) {
        for (const cropBlockName in MC.cropsByBlockName) {
            const crop = MC.cropsByBlockName[cropBlockName]
            if (cropBlockName === blockName) {
                return {
                    ...crop,
                    cropName: cropBlockName,
                }
            }
            switch (crop.type) {
                case 'tree':
                    if (blockName === crop.log) {
                        return {
                            ...crop,
                            cropName: cropBlockName,
                        }
                    }
                    break
                case 'grows_block':
                    if (crop.attachedCropName && blockName === crop.attachedCropName) {
                        return {
                            ...crop,
                            cropName: cropBlockName,
                        }
                    }
                    break
            }
        }
        return null
    }

    /**
     * @param {string} version
     * @param {string} jarPath
     */
    constructor(version, jarPath) {
        this.data = getMcData(version)
        this.data2 = new MinecraftData(jarPath)

        for (const key in this.data2.compost) {
            if (!this.data.itemsByName[key]) {
                console.warn(`Unknown item "${key}"`)
            }
        }
    }

    /**
     * @param {string} name
     * @returns {Array<getMcData.Block>}
     */
    getCorrectBlocks(name) {
        if (name === 'dirt') {
            return [
                this.data.blocksByName['grass_block'],
                this.data.blocksByName['dirt'],
            ]
        }

        if (name === 'wood') {
            return [
                this.data.blocksByName['oak_log'],
                this.data.blocksByName['spruce_log'],
                this.data.blocksByName['birch_log'],
                this.data.blocksByName['jungle_log'],
                this.data.blocksByName['acacia_log'],
                this.data.blocksByName['dark_oak_log'],
                this.data.blocksByName['mangrove_log'],
                this.data.blocksByName['cherry_log'],
                this.data.blocksByName['crimson_stem'],
                this.data.blocksByName['warped_stem'],
            ]
        }

        if (name === 'stone') {
            return [
                this.data.blocksByName['stone'],
                this.data.blocksByName['cobblestone'],
                this.data.blocksByName['deepslate'],
                this.data.blocksByName['cobbled_deepslate'],
            ]
        }

        if (this.data.blocksByName[name]) {
            return [this.data.blocksByName[name]]
        }

        if (this.data.blocksByName[name.replace(/ /g, '_')]) {
            return [this.data.blocksByName[name.replace(/ /g, '_')]]
        }

        return []
    }

    /**
     * @param {string} name
     * @returns {getMcData.Item | null}
     */
    getCorrectItems(name) {
        if (this.data.itemsByName[name]) {
            return this.data.itemsByName[name]
        }

        if (this.data.itemsByName[name.replace(/ /g, '_')]) {
            return this.data.itemsByName[name.replace(/ /g, '_')]
        }

        return null
    }

    /**
     * @param {Block} blockToBreak
     * @param {import('mineflayer').Bot | null} bot
     * @returns {{ has: boolean, item: getMcData.Item | null } | null}
     */
    getCorrectTool(blockToBreak, bot) {
        /** @ts-ignore @type {[ keyof MC.tools ]} */
        const toolNames = Object.keys(MC.tools)

        /** @type {Array<{ time: number, item: getMcData.Item }>} */
        let bestTools = []

        for (const category_ of toolNames) {
            const subTools = MC.tools[category_]
            for (const level of MC.toolLevels) {
                const subTool = subTools[level]
                const item = this.data.itemsByName[subTool]

                if (blockToBreak.canHarvest(item.id)) {
                    const time = blockToBreak.digTime(item.id, false, false, false, [], [])
                    bestTools.push({ time: time, item: item })
                }
            }
        }

        if (bestTools.length === 0) { return null }

        bestTools.sort((a, b) => a.time - b.time)

        /** @ts-ignore @type {keyof MC.tools} */
        let bestToolCategory = bestTools[0].item.name.split('_')[1]
        if (!toolNames.includes(bestToolCategory)) {
            console.warn(`Invalid tool "${bestTools[0].item.name}" ("${bestToolCategory}")`)
            return null
        }

        bestTools.sort((a, b) => {
            /** @ts-ignore @type {MC.toolLevels[0 | 1 | 2 | 3 | 4 | 5]} */
            const levelA = a.item.name.split('_')[0]
            if (!MC.toolLevels.includes(levelA)) {
                console.warn(`Invalid tool level ${levelA}`)
                return 0
            }

            /** @ts-ignore @type {MC.toolLevels[0 | 1 | 2 | 3 | 4 | 5]} */
            const levelB = b.item.name.split('_')[0]
            if (!MC.toolLevels.includes(levelB)) {
                console.warn(`Invalid tool level ${levelB}`)
                return 0
            }

            const indexofA = MC.toolLevels.indexOf(levelA)
            const indexofB = MC.toolLevels.indexOf(levelB)

            return indexofB - indexofA
        })

        // console.log(`Best tool for block "${blockToBreak.displayName}" is "${bestToolCategory}"`)

        bestTools = bestTools.filter(tool =>
            tool.item.name.endsWith(bestToolCategory))

        if (bestTools.length === 0) { return null }

        if (bot) {
            for (const tool of bestTools) {
                const found = bot.inventory.findInventoryItem(tool.item.id, null, false)
                if (found) {
                    return { has: true, item: tool.item }
                }
            }
        }

        return { has: false, item: bestTools[bestTools.length - 1].item }
    }

    /**
     * @param {Recipe} recipe
     */
    getIngredients(recipe) {
        /** @type {Array<RecipeItem>} */
        const res = []

        if (recipe.delta) {
            for (const item of recipe.delta) {
                if (item.count < 0) {
                    res.push({
                        id: item.id,
                        metadata: item.metadata,
                        count: -item.count,
                    })
                }
            }
        } else if (recipe.ingredients) {
            res.push(...recipe.ingredients)
        } else if (recipe.inShape) {
            for (const item of recipe.inShape) {
                res.push(...item)
            }
        } else if (recipe.outShape) {
            for (const item of recipe.outShape) {
                res.push(...item)
            }
        }

        return res
    }

    /**
     * @readonly
     */
    static get badFoods() {
        return [
            // puffer fish - only gives negative effects
            'pufferfish',
            // spider eye - gives poison effect
            'spider_eye',
            // poisonous potato - gives poison effect
            'poisonous_potato',
            // rotten flesh - gives hunger effect
            'rotten_flesh',
            // chorus fruit - randomly teleports you
            'chorus_fruit',
            // raw chicken - 30% chance of getting hunger effect
            'chicken',
            // suspicious stew - gives random effects (including hunger)
            'suspicious_stew',
            // golden apple - shouldn't be eaten unless the user wants to
            'golden_apple',
            'cake',
            'honey_bottle',
            'golden_carrot',
        ]
    }

    /**
     * @readonly
     */
    static get cookedFoods() {
        return [
            'baked_potato',
            'cooked_beef',
            'cooked_porkchop',
            'cooked_mutton',
            'cooked_chicken',
            'cooked_rabbit',
            'cooked_cod',
            'cooked_salmon',
            'dried_kelp',
        ]
    }

    /**
     * @readonly
     */
    static get rawFoods() {
        return [
            'potato',
            'beef',
            'porkchop',
            'mutton',
            'chicken',
            'rabbit',
            'cod',
            'salmon',
        ]
    }

    /**
     * @param {ReadonlyArray<Item>} foods
     * @param {'foodPoints' | 'saturation' | undefined} [sort]
     * @returns {Array<Item>}
     */
    filterFoods(foods, sort) {
        const bad = MC.badFoods
        const allFoods = this.data.foodsByName

        const _foods = foods
            .filter((item) => item.name in allFoods)
            .filter((item) => !bad.includes(item.name))
        if (sort) {
            return _foods.sort((a, b) => allFoods[b.name][sort] - allFoods[a.name][sort])
        } else {
            return _foods
        }
    }

    /**
     * @returns {Array<getMcData.Food>}
     * @param {boolean} includeRaws
     */
    getGoodFoods(includeRaws) {
        return this.data.foodsArray.filter((item) => {
            if (MC.badFoods.includes(item.name)) { return false }
            if (MC.rawFoods.includes(item.name) && !includeRaws) { return false }
            return true
        })
    }

    /**
     * @param {import('mineflayer-pathfinder').Movements} movements
     */
    setPermissiveMovements(movements) {
        movements.canDig = true
        movements.digCost = 40
        movements.placeCost = 30
        movements.entityCost = 10
        movements.allowParkour = true
        movements.allowSprinting = true
        movements.allowEntityDetection = true
        movements.canOpenDoors = false

        // movements.exclusionAreasStep.push((block) => {
        //     if (block.name === 'composter') return 50
        //     return 0
        // })

        Object.values(this.data.entities)
            .filter(v => v.type === 'hostile')
            .map(v => v.name)
            .forEach(v => movements.entitiesToAvoid.add(v));

        ([
            'furnace',
            'blast_furnace',
            'smoker',
            'campfire',
            'soul_campfire',
            'brewing_stand',
            'beacon',
            'conduit',
            'bee_nest',
            'beehive',
            'suspicious_sand',
            'suspicious_gravel',
            'decorated_pot',
            'bookshelf',
            'barrel',
            'ender_chest',
            'respawn_anchor',
            'infested_stone',
            'infested_cobblestone',
            'infested_stone_bricks',
            'infested_mossy_stone_bricks',
            'infested_cracked_stone_bricks',
            'infested_chiseled_stone_bricks',
            'infested_deepslate',
            'end_portal_frame',
            'spawner',
            'composter',
        ]
            .map(v => this.data.blocksByName[v]?.id ?? (() => { throw new Error(`Unknown block "${v}"`) })())
            .forEach(v => movements.blocksCantBreak.add(v)));

        ([
            'campfire',
            'composter',
            'sculk_sensor',
            'sweet_berry_bush',
            'end_portal',
            'nether_portal',
        ]
            .map(v => this.data.blocksByName[v]?.id ?? (() => { throw new Error(`Unknown block "${v}"`) })())
            .forEach(v => movements.blocksToAvoid.add(v)));

        ([
            'vine',
            'scaffolding',
            'ladder',
            'twisting_vines',
            'twisting_vines_plant',
            'weeping_vines',
            'weeping_vines_plant',
        ]
            .map(v => this.data.blocksByName[v]?.id ?? (() => { throw new Error(`Unknown block "${v}"`) })())
            .forEach(v => movements.climbables.add(v)));

        ([
            'short_grass',
            'tall_grass',
        ]
            .map(v => this.data.blocksByName[v]?.id ?? (() => { throw new Error(`Unknown block "${v}"`) })())
            .forEach(v => movements.replaceables.add(v)));
    }

    /**
     * @param {import('mineflayer-pathfinder').Movements} movements
     */
    setRestrictedMovements(movements) {
        this.setPermissiveMovements(movements)
        movements.canDig = false
        movements.allow1by1towers = false
        movements.scafoldingBlocks.splice(0, movements.scafoldingBlocks.length)
        movements.placeCost = 500
    }
}
