'use strict'

const { Block } = require('prismarine-block')
const { Item } = require('prismarine-item')
const { Recipe, RecipeItem } = require('prismarine-recipe')
const getMcData = require('minecraft-data')
const LocalMinecraftData = require('./local-minecraft-data')

/**
 * @typedef { 'sword' | 'shovel' | 'pickaxe' | 'axe' | 'hoe' } Tool
 */

/**
 * @typedef {'break' | 'activate'} HarvestMode
 */

/**
 * @typedef {SimpleCrop | SeededCrop | BlockCrop | FruitCrop | Tree | SpreadingCrop | UpwardsCrop} AnyCrop
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
 *   seed: string;
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
 * @typedef {GeneralCrop & {
 *   type: 'up';
 *   seed: string;
 *   needsWater: boolean;
 *   root?: string;
 * }} UpwardsCrop
 */

/**
 * @typedef {number | { easy: number; normal: number; hard: number; }} Amount
 */

/**
 * @typedef {{
 *   type: 'physical';
 *   amount: Amount | ((entity: import('prismarine-entity').Entity) => Amount);
 * } | {
 *   type: 'explosion';
 *   level: Amount | ((entity: import('prismarine-entity').Entity) => Amount);
 * } | {
 *   type: 'effect';
 *   effect: string;
 *   time: Amount;
 *   level: Amount;
 * } | {
 *   type: 'fire';
 *   time: Amount;
 * }} Damage
 */

/**
 * @typedef { 'wooden' | 'stone' | 'iron' | 'golden' | 'diamond' | 'netherite' } ToolLevel
 */

module.exports = class Minecraft {
    /**
     * @readonly
     * @type {getMcData.IndexedData}
     */
    registry

    /**
     * @readonly
     * @type {LocalMinecraftData}
     */
    local

    /**
     * @readonly
     */
    static general = Object.freeze({
        /** @type {number} */
        hurtTime: 500,
        /** @type {number} */
        fallDamageVelocity: -1,
        /** @type {number} */
        jumpTotalTime: 600,
    })

    /**
     * @readonly
     */
    static mlg = Object.freeze({
        /**
         * @type {ReadonlyArray<string>}
         */
        boats: [
            "oak_boat",
            "spruce_boat",
            "birch_boat",
            "jungle_boat",
            "acacia_boat",
            "dark_oak_boat"
        ],
        /**
         * @type {ReadonlyArray<string>}
         */
        mlgBlocks: [
            "water_bucket",
            "slime_block",
            "sweet_berries",
            "cobweb",
            "hay_block"
        ],
        /**
         * @type {ReadonlyArray<string>}
         */
        vehicles: [
            "boat",
            "donkey",
            "horse",
            "minecart"
        ]
    })

    /**
     * @readonly
     * @type {Readonly<Record<string, Readonly<{ time: number; no: boolean; }>>>}
     */
    static fuels = Object.freeze({
        "lava_bucket": { "time": 1000, "no": true },
        "coal_block": { "time": 800, "no": false },
        "dried_kelp_block": { "time": 200, "no": false },

        "blaze_rod": { "time": 120, "no": true },
        "coal": { "time": 80, "no": true },
        "charcoal": { "time": 80, "no": false },

        "oak_boat": { "time": 60, "no": true },
        "spruce_boat": { "time": 60, "no": true },
        "birch_boat": { "time": 60, "no": true },
        "jungle_boat": { "time": 60, "no": true },
        "acacia_boat": { "time": 60, "no": true },
        "dark_oak_boat": { "time": 60, "no": true },
        "mangrove_boat": { "time": 60, "no": true },
        "cherry_boat": { "time": 60, "no": true },
        "bamboo_raft": { "time": 60, "no": true },

        "oak_chest_boat": { "time": 60, "no": true },
        "spruce_chest_boat": { "time": 60, "no": true },
        "birch_chest_boat": { "time": 60, "no": true },
        "jungle_chest_boat": { "time": 60, "no": true },
        "acacia_chest_boat": { "time": 60, "no": true },
        "dark_oak_chest_boat": { "time": 60, "no": true },
        "mangrove_chest_boat": { "time": 60, "no": true },
        "cherry_chest_boat": { "time": 60, "no": true },
        "bamboo_chest_raft": { "time": 60, "no": true },

        "oak_log": { "time": 15, "no": false },
        "spruce_log": { "time": 15, "no": false },
        "birch_log": { "time": 15, "no": false },
        "jungle_log": { "time": 15, "no": false },
        "acacia_log": { "time": 15, "no": false },
        "dark_oak_log": { "time": 15, "no": false },
        "mangrove_log": { "time": 15, "no": false },
        "cherry_log": { "time": 15, "no": false },
        "bamboo_block": { "time": 15, "no": false },

        "stripped_oak_log": { "time": 15, "no": false },
        "stripped_spruce_log": { "time": 15, "no": false },
        "stripped_birch_log": { "time": 15, "no": false },
        "stripped_jungle_log": { "time": 15, "no": false },
        "stripped_acacia_log": { "time": 15, "no": false },
        "stripped_dark_oak_log": { "time": 15, "no": false },
        "stripped_mangrove_log": { "time": 15, "no": false },
        "stripped_cherry_log": { "time": 15, "no": false },
        "stripped_bamboo_block": { "time": 15, "no": false },

        "oak_planks": { "time": 15, "no": false },
        "spruce_planks": { "time": 15, "no": false },
        "birch_planks": { "time": 15, "no": false },
        "jungle_planks": { "time": 15, "no": false },
        "acacia_planks": { "time": 15, "no": false },
        "dark_oak_planks": { "time": 15, "no": false },
        "mangrove_planks": { "time": 15, "no": false },
        "cherry_planks": { "time": 15, "no": false },
        "bamboo_planks": { "time": 15, "no": false },
        "bamboo_mosaic": { "time": 15, "no": false },
        "bamboo_mosaic_slab": { "time": 7.5, "no": false },
        "bamboo_mosaic_stairs": { "time": 15, "no": false },

        "chiseled_bookshelf": { "time": 15, "no": false },

        "oak_slab": { "time": 7.5, "no": false },
        "spruce_slab": { "time": 7.5, "no": false },
        "birch_slab": { "time": 7.5, "no": false },
        "jungle_slab": { "time": 7.5, "no": false },
        "acacia_slab": { "time": 7.5, "no": false },
        "dark_oak_slab": { "time": 7.5, "no": false },
        "mangrove_slab": { "time": 7.5, "no": false },
        "cherry_slab": { "time": 7.5, "no": false },
        "bamboo_slab": { "time": 7.5, "no": false },

        "oak_stairs": { "time": 15, "no": false },
        "spruce_stairs": { "time": 15, "no": false },
        "birch_stairs": { "time": 15, "no": false },
        "jungle_stairs": { "time": 15, "no": false },
        "acacia_stairs": { "time": 15, "no": false },
        "dark_oak_stairs": { "time": 15, "no": false },
        "mangrove_stairs": { "time": 15, "no": false },
        "cherry_stairs": { "time": 15, "no": false },
        "bamboo_stairs": { "time": 15, "no": false },

        "oak_pressure_plate": { "time": 15, "no": false },
        "spruce_pressure_plate": { "time": 15, "no": false },
        "birch_pressure_plate": { "time": 15, "no": false },
        "jungle_pressure_plate": { "time": 15, "no": false },
        "acacia_pressure_plate": { "time": 15, "no": false },
        "dark_oak_pressure_plate": { "time": 15, "no": false },
        "mangrove_pressure_plate": { "time": 15, "no": false },
        "cherry_pressure_plate": { "time": 15, "no": false },
        "bamboo_pressure_plate": { "time": 15, "no": false },

        "oak_button": { "time": 5, "no": false },
        "spruce_button": { "time": 5, "no": false },
        "birch_button": { "time": 5, "no": false },
        "jungle_button": { "time": 5, "no": false },
        "acacia_button": { "time": 5, "no": false },
        "dark_oak_button": { "time": 5, "no": false },
        "mangrove_button": { "time": 5, "no": false },
        "cherry_button": { "time": 5, "no": false },
        "bamboo_button": { "time": 5, "no": false },

        "oak_trapdoor": { "time": 15, "no": false },
        "spruce_trapdoor": { "time": 15, "no": false },
        "birch_trapdoor": { "time": 15, "no": false },
        "jungle_trapdoor": { "time": 15, "no": false },
        "acacia_trapdoor": { "time": 15, "no": false },
        "dark_oak_trapdoor": { "time": 15, "no": false },
        "mangrove_trapdoor": { "time": 15, "no": false },
        "cherry_trapdoor": { "time": 15, "no": false },
        "bamboo_trapdoor": { "time": 15, "no": false },

        "oak_fence": { "time": 15, "no": false },
        "spruce_fence": { "time": 15, "no": false },
        "birch_fence": { "time": 15, "no": false },
        "jungle_fence": { "time": 15, "no": false },
        "acacia_fence": { "time": 15, "no": false },
        "dark_oak_fence": { "time": 15, "no": false },
        "mangrove_fence": { "time": 15, "no": false },
        "cherry_fence": { "time": 15, "no": false },
        "bamboo_fence": { "time": 15, "no": false },

        "oak_fence_gate": { "time": 15, "no": false },
        "spruce_fence_gate": { "time": 15, "no": false },
        "birch_fence_gate": { "time": 15, "no": false },
        "jungle_fence_gate": { "time": 15, "no": false },
        "acacia_fence_gate": { "time": 15, "no": false },
        "dark_oak_fence_gate": { "time": 15, "no": false },
        "mangrove_fence_gate": { "time": 15, "no": false },
        "cherry_fence_gate": { "time": 15, "no": false },
        "bamboo_fence_gate": { "time": 15, "no": false },

        "oak_door": { "time": 10, "no": false },
        "spruce_door": { "time": 10, "no": false },
        "birch_door": { "time": 10, "no": false },
        "jungle_door": { "time": 10, "no": false },
        "acacia_door": { "time": 10, "no": false },
        "dark_oak_door": { "time": 10, "no": false },
        "mangrove_door": { "time": 10, "no": false },
        "cherry_door": { "time": 10, "no": false },
        "bamboo_door": { "time": 10, "no": false },

        "oak_sign": { "time": 10, "no": false },
        "spruce_sign": { "time": 10, "no": false },
        "birch_sign": { "time": 10, "no": false },
        "jungle_sign": { "time": 10, "no": false },
        "acacia_sign": { "time": 10, "no": false },
        "dark_oak_sign": { "time": 10, "no": false },
        "mangrove_sign": { "time": 10, "no": false },
        "cherry_sign": { "time": 10, "no": false },
        "bamboo_sign": { "time": 10, "no": false },

        "oak_hanging_sign": { "time": 10, "no": true },
        "spruce_hanging_sign": { "time": 10, "no": true },
        "birch_hanging_sign": { "time": 10, "no": true },
        "jungle_hanging_sign": { "time": 10, "no": true },
        "acacia_hanging_sign": { "time": 10, "no": true },
        "dark_oak_hanging_sign": { "time": 10, "no": true },
        "mangrove_hanging_sign": { "time": 10, "no": true },
        "cherry_hanging_sign": { "time": 10, "no": true },
        "bamboo_hanging_sign": { "time": 10, "no": true },

        "oak_sapling": { "time": 5, "no": true },
        "spruce_sapling": { "time": 5, "no": true },
        "birch_sapling": { "time": 5, "no": true },
        "jungle_sapling": { "time": 5, "no": true },
        "acacia_sapling": { "time": 5, "no": true },
        "dark_oak_sapling": { "time": 5, "no": true },
        "mangrove_propagule": { "time": 5, "no": true },
        "cherry_sapling": { "time": 5, "no": true },
        "azalea": { "time": 5, "no": true },
        "flowering_azalea": { "time": 5, "no": true },

        "wooden_sword": { "time": 10, "no": false },
        "wooden_axe": { "time": 10, "no": false },
        "wooden_hoe": { "time": 10, "no": true },
        "wooden_shovel": { "time": 10, "no": false },
        "wooden_pickaxe": { "time": 10, "no": false },
        "fishing_rod": { "time": 15, "no": true },
        "crossbow": { "time": 15, "no": true },
        "bow": { "time": 15, "no": true },

        "bowl": { "time": 5, "no": false },
        "stick": { "time": 5, "no": false },
        "ladder": { "time": 15, "no": false },

        "mangrove_roots": { "time": 15, "no": false },
        "dead_bush": { "time": 5, "no": false },

        "crafting_table": { "time": 15, "no": false },
        "cartography_table": { "time": 15, "no": true },
        "fletching_table": { "time": 15, "no": true },
        "smithing_table": { "time": 15, "no": true },
        "loom": { "time": 15, "no": true },
        "bookshelf": { "time": 15, "no": true },
        "lectern": { "time": 15, "no": true },
        "composter": { "time": 15, "no": true },
        "chest": { "time": 15, "no": true },
        "trapped_chest": { "time": 15, "no": true },
        "barrel": { "time": 15, "no": true },
        "daylight_detector": { "time": 15, "no": true },
        "jukebox": { "time": 15, "no": true },
        "note_block": { "time": 15, "no": true },

        "white_wool": { "time": 5, "no": false },
        "light_gray_wool": { "time": 5, "no": false },
        "gray_wool": { "time": 5, "no": false },
        "black_wool": { "time": 5, "no": false },
        "brown_wool": { "time": 5, "no": false },
        "red_wool": { "time": 5, "no": false },
        "orange_wool": { "time": 5, "no": false },
        "yellow_wool": { "time": 5, "no": false },
        "lime_wool": { "time": 5, "no": false },
        "green_wool": { "time": 5, "no": false },
        "cyan_wool": { "time": 5, "no": false },
        "light_blue_wool": { "time": 5, "no": false },
        "blue_wool": { "time": 5, "no": false },
        "purple_wool": { "time": 5, "no": false },
        "magenta_wool": { "time": 5, "no": false },
        "pink_wool": { "time": 5, "no": false },

        "white_banner": { "time": 5, "no": false },
        "light_gray_banner": { "time": 5, "no": false },
        "gray_banner": { "time": 5, "no": false },
        "black_banner": { "time": 5, "no": false },
        "brown_banner": { "time": 5, "no": false },
        "red_banner": { "time": 5, "no": false },
        "orange_banner": { "time": 5, "no": false },
        "yellow_banner": { "time": 5, "no": false },
        "lime_banner": { "time": 5, "no": false },
        "green_banner": { "time": 5, "no": false },
        "cyan_banner": { "time": 5, "no": false },
        "light_blue_banner": { "time": 5, "no": false },
        "blue_banner": { "time": 5, "no": false },
        "purple_banner": { "time": 5, "no": false },
        "magenta_banner": { "time": 5, "no": false },
        "pink_banner": { "time": 5, "no": false },

        "white_carpet": { "time": 3.35, "no": false },
        "light_gray_carpet": { "time": 3.35, "no": false },
        "gray_carpet": { "time": 3.35, "no": false },
        "black_carpet": { "time": 3.35, "no": false },
        "brown_carpet": { "time": 3.35, "no": false },
        "red_carpet": { "time": 3.35, "no": false },
        "orange_carpet": { "time": 3.35, "no": false },
        "yellow_carpet": { "time": 3.35, "no": false },
        "lime_carpet": { "time": 3.35, "no": false },
        "green_carpet": { "time": 3.35, "no": false },
        "cyan_carpet": { "time": 3.35, "no": false },
        "light_blue_carpet": { "time": 3.35, "no": false },
        "blue_carpet": { "time": 3.35, "no": false },
        "purple_carpet": { "time": 3.35, "no": false },
        "magenta_carpet": { "time": 3.35, "no": false },
        "pink_carpet": { "time": 3.35, "no": false },

        "bamboo": { "time": 2.5, "no": true },
        "scaffolding": { "time": 2.5, "no": true }
    })

    /**
     * @readonly
     * @type {ReadonlyArray<Readonly<{ item: string; time: number; no: boolean; }>>}
     */
    static sortedFuels

    static {
        // @ts-ignore
        this.sortedFuels = Object.entries(this.fuels)
            .map(([item, value]) => ({
                item: item,
                time: value.time,
                no: value.no,
            }))
            .sort((a, b) => a.time - b.time)
    }

    /**
     * @readonly
     * @type {Readonly<Record<string, Readonly<{ chance: number; no: boolean; }>>>}
     */
    static compost = Object.freeze({
        "beetroot_seeds": { "chance": 0.30, "no": false },
        "dried_kelp": { "chance": 0.30, "no": true },
        "glow_berries": { "chance": 0.30, "no": true },
        "short_grass": { "chance": 0.30, "no": false },
        "hanging_roots": { "chance": 0.30, "no": false },
        "mangrove_roots": { "chance": 0.30, "no": false },
        "kelp": { "chance": 0.30, "no": true },
        "oak_leaves": { "chance": 0.30, "no": false },
        "spruce_leaves": { "chance": 0.30, "no": false },
        "birch_leaves": { "chance": 0.30, "no": false },
        "jungle_leaves": { "chance": 0.30, "no": false },
        "acacia_leaves": { "chance": 0.30, "no": false },
        "dark_oak_leaves": { "chance": 0.30, "no": true },
        "mangrove_leaves": { "chance": 0.30, "no": false },
        "cherry_leaves": { "chance": 0.30, "no": false },
        "melon_seeds": { "chance": 0.30, "no": false },
        "moss_carpet": { "chance": 0.30, "no": true },
        "pink_petals": { "chance": 0.30, "no": true },
        "pitcher_pod": { "chance": 0.30, "no": true },
        "pumpkin_seeds": { "chance": 0.30, "no": false },
        "oak_sapling": { "chance": 0.30, "no": false },
        "spruce_sapling": { "chance": 0.30, "no": false },
        "birch_sapling": { "chance": 0.30, "no": false },
        "jungle_sapling": { "chance": 0.30, "no": false },
        "acacia_sapling": { "chance": 0.30, "no": false },
        "dark_oak_sapling": { "chance": 0.30, "no": true },
        "mangrove_propagule": { "chance": 0.30, "no": false },
        "cherry_sapling": { "chance": 0.30, "no": false },
        "seagrass": { "chance": 0.30, "no": true },
        "small_dripleaf": { "chance": 0.30, "no": true },
        "sweet_berries": { "chance": 0.30, "no": true },
        "torchflower_seeds": { "chance": 0.30, "no": true },
        "wheat_seeds": { "chance": 0.30, "no": false },

        "cactus": { "chance": 0.50, "no": false },
        "dried_kelp_block": { "chance": 0.50, "no": true },
        "flowering_azalea_leaves": { "chance": 0.50, "no": true },
        "glow_lichen": { "chance": 0.50, "no": true },
        "melon_slice": { "chance": 0.50, "no": true },
        "nether_sprouts": { "chance": 0.50, "no": true },
        "sugar_cane": { "chance": 0.50, "no": true },
        "tall_grass": { "chance": 0.50, "no": false },
        "vine": { "chance": 0.50, "no": true },
        "twisting_vines": { "chance": 0.50, "no": true },
        "weeping_vines": { "chance": 0.50, "no": true },

        "apple": { "chance": 0.65, "no": true },
        "azalea": { "chance": 0.65, "no": true },
        "beetroot": { "chance": 0.65, "no": true },
        "big_dripleaf": { "chance": 0.65, "no": true },
        "carrot": { "chance": 0.65, "no": true },
        "cocoa_beans": { "chance": 0.65, "no": false },
        "fern": { "chance": 0.65, "no": true },
        "large_fern": { "chance": 0.65, "no": true },
        "dandelion": { "chance": 0.65, "no": true },
        "poppy": { "chance": 0.65, "no": true },
        "blue_orchid": { "chance": 0.65, "no": true },
        "allium": { "chance": 0.65, "no": true },
        "azure_bluet": { "chance": 0.65, "no": true },
        "red_tulip": { "chance": 0.65, "no": true },
        "orange_tulip": { "chance": 0.65, "no": true },
        "white_tulip": { "chance": 0.65, "no": true },
        "pink_tulip": { "chance": 0.65, "no": true },
        "oxeye_daisy": { "chance": 0.65, "no": true },
        "cornflower": { "chance": 0.65, "no": true },
        "lily_of_the_valley": { "chance": 0.65, "no": true },
        "wither_rose": { "chance": 0.65, "no": true },
        "sunflower": { "chance": 0.65, "no": true },
        "lilac": { "chance": 0.65, "no": true },
        "rose_bush": { "chance": 0.65, "no": true },
        "peony": { "chance": 0.65, "no": true },
        "crimson_fungus": { "chance": 0.65, "no": true },
        "warped_fungus": { "chance": 0.65, "no": true },
        "lily_pad": { "chance": 0.65, "no": true },
        "melon": { "chance": 0.65, "no": true },
        "moss_block": { "chance": 0.65, "no": true },
        "brown_mushroom": { "chance": 0.65, "no": true },
        "red_mushroom": { "chance": 0.65, "no": true },
        "mushroom_stem": { "chance": 0.65, "no": true },
        "nether_wart": { "chance": 0.65, "no": true },
        "potato": { "chance": 0.65, "no": true },
        "pumpkin": { "chance": 0.65, "no": true },
        "carved_pumpkin": { "chance": 0.65, "no": true },
        "crimson_roots": { "chance": 0.65, "no": true },
        "warped_roots": { "chance": 0.65, "no": true },
        "sea_pickle": { "chance": 0.65, "no": true },
        "shroomlight": { "chance": 0.65, "no": true },
        "spore_blossom": { "chance": 0.65, "no": true },
        "wheat": { "chance": 0.65, "no": true },

        "baked_potato": { "chance": 0.85, "no": true },
        "bread": { "chance": 0.85, "no": true },
        "cookie": { "chance": 0.85, "no": true },
        "flowering_azalea": { "chance": 0.85, "no": true },
        "hay_block": { "chance": 0.85, "no": true },
        "brown_mushroom_block": { "chance": 0.85, "no": true },
        "red_mushroom_block": { "chance": 0.85, "no": true },
        "nether_wart_block": { "chance": 0.85, "no": true },
        "pitcher_plant": { "chance": 0.85, "no": true },
        "torchflower": { "chance": 0.85, "no": true },
        "warped_wart_block": { "chance": 0.85, "no": true },

        "cake": { "chance": 1.00, "no": true },
        "pumpkin_pie": { "chance": 1.00, "no": true }
    })

    /**
     * @readonly
     * @type {Readonly<Record<string, undefined | 'yes' | 'break'>>}
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
     * @type {ReadonlyArray<string>}
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
            seed: 'oak_sapling',
            log: 'oak_log',
            size: 'small',
            branches: 'sometimes',
            canUseBonemeal: true,
            growsOnBlock: Minecraft.soilBlocks,
            growsOnSide: 'top',
            lightLevel: { min: 9 },
        },
        'spruce_sapling': {
            type: 'tree',
            seed: 'spruce_sapling',
            log: 'spruce_log',
            size: 'can-be-large',
            branches: 'never',
            canUseBonemeal: true,
            growsOnBlock: Minecraft.soilBlocks,
            growsOnSide: 'top',
            lightLevel: { min: 9 },
        },
        'birch_sapling': {
            type: 'tree',
            seed: 'birch_sapling',
            log: 'birch_log',
            size: 'small',
            branches: 'never',
            canUseBonemeal: true,
            growsOnBlock: Minecraft.soilBlocks,
            growsOnSide: 'top',
            lightLevel: { min: 9 },
        },
        'jungle_sapling': {
            type: 'tree',
            seed: 'jungle_sapling',
            log: 'jungle_log',
            size: 'can-be-large',
            branches: 'never',
            canUseBonemeal: true,
            growsOnBlock: Minecraft.soilBlocks,
            growsOnSide: 'top',
            lightLevel: { min: 9 },
        },
        'acacia_sapling': {
            type: 'tree',
            seed: 'acacia_sapling',
            log: 'acacia_log',
            size: 'small',
            branches: 'always',
            canUseBonemeal: true,
            growsOnBlock: Minecraft.soilBlocks,
            growsOnSide: 'top',
            lightLevel: { min: 9 },
        },
        'dark_oak_sapling': {
            type: 'tree',
            seed: 'dark_oak_sapling',
            log: 'dark_oak_log',
            size: 'always-large',
            branches: 'never',
            canUseBonemeal: true,
            growsOnBlock: Minecraft.soilBlocks,
            growsOnSide: 'top',
            lightLevel: { min: 9 },
        },
        'mangrove_propagule': {
            type: 'tree',
            seed: 'mangrove_propagule',
            log: 'mangrove_log',
            size: 'small',
            branches: 'always',
            canUseBonemeal: true,
            growsOnBlock: [
                ...Minecraft.soilBlocks,
                'clay',
            ],
            growsOnSide: 'top',
            lightLevel: { min: 9 },
        },
        'cherry_sapling': {
            type: 'tree',
            seed: 'cherry_sapling',
            log: 'cherry_log',
            size: 'small',
            branches: 'always',
            canUseBonemeal: true,
            growsOnBlock: Minecraft.soilBlocks,
            growsOnSide: 'top',
            lightLevel: { min: 9 },
        },
        'azalea': {
            type: 'tree',
            seed: 'azalea',
            log: 'oak_log',
            size: 'small',
            branches: 'always',
            canUseBonemeal: true,
            growsOnBlock: [
                ...Minecraft.soilBlocks,
                'clay',
            ],
            growsOnSide: 'top',
            lightLevel: { min: 9 },
        },
        'flowering_azalea': {
            type: 'tree',
            seed: 'flowering_azalea',
            log: 'oak_log',
            size: 'small',
            branches: 'always',
            canUseBonemeal: true,
            growsOnBlock: [
                ...Minecraft.soilBlocks,
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
                ...Minecraft.soilBlocks,
            ],
            growsOnSide: 'top',
            lightLevel: { max: 12 },
        },
        'red_mushroom': {
            type: 'spread',
            seed: 'red_mushroom',
            canUseBonemeal: false,
            growsOnBlock: [
                ...Minecraft.soilBlocks,
            ],
            growsOnSide: 'top',
            lightLevel: { max: 12 },
        },
        'sugar_cane': {
            type: 'up',
            canUseBonemeal: false,
            growsOnBlock: [
                ...Minecraft.soilBlocks,
                'sand',
                'red_sand',
            ],
            growsOnSide: 'top',
            needsWater: true,
            seed: 'sugar_cane',
        },
        'bamboo': {
            type: 'up',
            canUseBonemeal: true,
            growsOnBlock: [
                ...Minecraft.soilBlocks,
                'sand',
                'red_sand',
                'gravel',
            ],
            growsOnSide: 'top',
            needsWater: false,
            seed: 'bamboo',
            root: 'bamboo_sapling',
        },
        'bamboo_sapling': {
            type: 'up',
            canUseBonemeal: true,
            growsOnBlock: [
                ...Minecraft.soilBlocks,
                'sand',
                'red_sand',
                'gravel',
            ],
            growsOnSide: 'top',
            needsWater: false,
            seed: 'bamboo',
            root: 'bamboo_sapling',
        },
        'cactus': {
            type: 'up',
            canUseBonemeal: false,
            growsOnBlock: [
                'sand',
                'red_sand',
            ],
            growsOnSide: 'top',
            needsWater: false,
            seed: 'cactus',
        },
    }

    /**
     * @param {import('mineflayer').Bot} bot
     * @param {import('prismarine-block').Block} block
     * @returns {boolean | null}
     */
    static isCropRoot(bot, block) {
        if (!block?.name) return false
        const crop = Minecraft.cropsByBlockName[block.name]
        if (!crop) return false
        if (crop.type === 'up') {
            if (crop.root && block.name === crop.root) {
                return true
            } else {
                const below = bot.blockAt(block.position.offset(0, -1, 0))
                if (!below) return null
                return below.type !== block.type
            }
        } else {
            return true
        }
    }

    /**
     * @readonly
     * @type {ReadonlySet<number>}
     */
    cropBlockIds

    /**
     * @readonly
     * @type {Readonly<Record<string, {
     *   rangeOfSight: number;
     *   meleeAttack?: {
     *     range: number;
     *     damage: Damage | Array<Damage>;
     *     cooldown?: number;
     *   };
     *   rangeAttack?: {
     *     range: number;
     *     damage: Damage | Array<Damage>;
     *     cooldown: number;
     *   };
     *   alwaysAngry: boolean;
     * }>>}
     */
    static get hostiles() {
        return ({
            'snow_golem': {
                rangeAttack: {
                    damage: { type: 'physical', amount: 0 },
                    cooldown: 1,
                    range: 16, // ?
                },
                alwaysAngry: false,
                rangeOfSight: 16,
            },
            'shulker_bullet': {
                meleeAttack: {
                    damage: { type: 'physical', amount: 4 },
                    range: 2,
                    cooldown: 1, // ?
                },
                rangeOfSight: 16,
                alwaysAngry: true,
            },
            'ender_dragon': {
                meleeAttack: {
                    damage: { type: 'physical', amount: { easy: 6, normal: 10, hard: 15 } },
                    range: 8, // ?
                    cooldown: 1, // ?
                },
                rangeAttack: {
                    damage: { type: 'physical', amount: 12 },
                    cooldown: 6, // ?
                    range: 64,
                },
                rangeOfSight: 150,
                alwaysAngry: true,
            },
            'breeze': {
                rangeAttack: {
                    damage: { type: 'physical', amount: 6 },
                    cooldown: 3, // ?
                    range: 16, // ?
                },
                alwaysAngry: true,
                rangeOfSight: 16, // ?
            },
            'evoker_fangs': {
                meleeAttack: {
                    damage: { type: 'physical', amount: 6 },
                    cooldown: 1, // ?
                    range: 1, // ?
                },
                alwaysAngry: true,
                rangeOfSight: 3, // ?
            },
            'elder_guardian': {
                rangeAttack: {
                    damage: { type: 'physical', amount: { easy: 5, normal: 8, hard: 12 } },
                    cooldown: 3, // ?
                    range: 15,
                },
                alwaysAngry: true,
                rangeOfSight: 16, // ?
            },
            'guardian': {
                rangeAttack: {
                    damage: { type: 'physical', amount: { easy: 4, normal: 6, hard: 9 } },
                    cooldown: 3 + 5,
                    range: 15,
                },
                alwaysAngry: true,
                rangeOfSight: 16, // ?
            },
            'panda': {
                meleeAttack: {
                    damage: { type: 'physical', amount: { easy: 4, normal: 6, hard: 9 } },
                    cooldown: 1, // ?
                    range: 2, // ?
                },
                alwaysAngry: false,
                rangeOfSight: 16, // ?
            },
            'wither': {
                rangeAttack: {
                    damage: [
                        { type: 'physical', amount: { easy: 5, normal: 8, hard: 12 } },
                        // { type: 'explosion', amount: 5 },
                        { type: 'effect', effect: 'wither', time: 40000, level: 2 },
                    ],
                    range: 24, // ?
                    cooldown: 1, // ?
                },
                alwaysAngry: true,
                rangeOfSight: 32, // ?
            },
            'polar_bear': {
                meleeAttack: {
                    damage: { type: 'physical', amount: { easy: 4, normal: 6, hard: 9 } },
                    cooldown: 1, // ?
                    range: 2, // ?
                },
                alwaysAngry: false,
                rangeOfSight: 16, // ?
            },
            'iron_golem': {
                meleeAttack: {
                    damage: { type: 'physical', amount: { easy: 11.75, normal: 21.5, hard: 32.25 } },
                    cooldown: 1, // ?
                    range: 3, // ?
                },
                alwaysAngry: false,
                rangeOfSight: 16, // ?
            },
            'trader_llama': {
                rangeAttack: {
                    damage: { type: 'physical', amount: 1 },
                    cooldown: 3, // ?
                    range: 4, // ?
                },
                alwaysAngry: false,
                rangeOfSight: 4, // ?
            },
            'llama': {
                rangeAttack: {
                    damage: { type: 'physical', amount: 1 },
                    cooldown: 3, // ?
                    range: 4, // ?
                },
                alwaysAngry: false,
                rangeOfSight: 4, // ?
            },
            'vex': {
                meleeAttack: {
                    range: 2,
                    damage: { type: 'physical', amount: { easy: 5.5, normal: 9, hard: 13.5 } },
                    cooldown: 1, // ?
                },
                rangeOfSight: 16, // ?
                alwaysAngry: true,
            },
            'shulker': {
                rangeAttack: {
                    range: 16,
                    damage: { type: 'physical', amount: 4 },
                    cooldown: 1000, // 1000 - 5500
                },
                rangeOfSight: 16,
                alwaysAngry: true,
            },
            'blaze': {
                meleeAttack: {
                    range: 1,
                    damage: { type: 'physical', amount: { easy: 4, normal: 6, hard: 9 } },
                    cooldown: 1000,
                },
                rangeAttack: {
                    range: 48,
                    damage: [
                        { type: 'physical', amount: 5 },
                        { type: 'fire', time: 5000 },
                    ],
                    cooldown: 5000, // burstCooldown: 300
                },
                rangeOfSight: 48,
                alwaysAngry: true,
            },
            'drowned': {
                meleeAttack: {
                    range: 2,
                    damage: { type: 'physical', amount: { easy: 2.5, normal: 3, hard: 4.5 } },
                },
                rangeAttack: {
                    range: 20,
                    damage: { type: 'physical', amount: { easy: 5, normal: 8, hard: 12 } },
                    cooldown: 1500,
                },
                rangeOfSight: 24,
                alwaysAngry: true,
            },
            'illusioner': {
                meleeAttack: {
                    range: 2,
                    damage: { type: 'physical', amount: { easy: 5, normal: 5, hard: 5 } },
                },
                rangeOfSight: 16,
                alwaysAngry: true,
            },
            'phantom': {
                meleeAttack: {
                    range: 2,
                    damage: { type: 'physical', amount: { easy: 2, normal: 2, hard: 3 } },
                },
                rangeOfSight: 64,
                alwaysAngry: true,
            },
            'warden': {
                meleeAttack: {
                    range: 2,
                    damage: { type: 'physical', amount: { easy: 16, normal: 30, hard: 45 } },
                    cooldown: 900,
                },
                rangeAttack: {
                    range: 20,
                    damage: { type: 'physical', amount: { easy: 6, normal: 10, hard: 15 } },
                    cooldown: 5,
                },
                rangeOfSight: 16,
                alwaysAngry: false,
            },
            'evoker': {
                meleeAttack: {
                    range: 2,
                    damage: { type: 'physical', amount: 24 },
                },
                rangeOfSight: 12,
                alwaysAngry: true,
            },
            'creeper': {
                meleeAttack: {
                    range: 3,
                    damage: { type: 'explosion', level: 7 },
                },
                rangeOfSight: 15,
                alwaysAngry: true,
            },
            'skeleton': {
                meleeAttack: {
                    range: 2,
                    damage: { type: 'physical', amount: { easy: 2, normal: 2, hard: 3 } }
                },
                rangeAttack: {
                    range: 15,
                    damage: { type: 'physical', amount: { easy: 4, normal: 4, hard: 5 } },
                    cooldown: 2000, // hard: 1000
                },
                rangeOfSight: 16,
                alwaysAngry: true,
            },
            'cave_spider': {
                meleeAttack: {
                    range: 2,
                    damage: [
                        { type: 'physical', amount: { easy: 2, normal: 2, hard: 3 } },
                        { type: 'effect', effect: 'poison', time: 15000, level: 1 },
                    ],
                },
                rangeOfSight: 16,
                alwaysAngry: false,
            },
            'endermite': {
                meleeAttack: {
                    range: 2,
                    damage: { type: 'physical', amount: { easy: 2, normal: 2, hard: 3 } },
                },
                rangeOfSight: 16,
                alwaysAngry: true,
            },
            'hoglin': {
                meleeAttack: {
                    range: 2,
                    damage: { type: 'physical', amount: { easy: 5, normal: 8, hard: 12 } },
                },
                rangeOfSight: 16,
                alwaysAngry: false,
            },
            'magma_cube': {
                meleeAttack: {
                    range: 2,
                    damage: {
                        type: 'physical',
                        amount: function(entity) {
                            const size = entity.metadata[16]
                            switch (size) {
                                case 0: return { easy: 2.5, normal: 3, hard: 4.5 }
                                case 1: return { easy: 3, normal: 5, hard: 6 }
                                case 2: return { easy: 4, normal: 6, hard: 9 }
                                default: return { easy: 4, normal: 6, hard: 9 }
                            }
                        },
                    },
                },
                rangeOfSight: 16,
                alwaysAngry: true,
            },
            'slime': {
                meleeAttack: {
                    range: 2,
                    damage: {
                        type: 'physical',
                        amount: function(entity) {
                            const size = entity.metadata[16]
                            switch (size) {
                                case 0: return { easy: 0, normal: 0, hard: 0 }
                                case 1: return { easy: 2, normal: 2, hard: 3 }
                                case 2: return { easy: 3, normal: 4, hard: 6 }
                                default: return { easy: 3, normal: 4, hard: 6 }
                            }
                        },
                    },
                },
                rangeOfSight: 16,
                alwaysAngry: true,
            },
            'wither_skeleton': {
                meleeAttack: {
                    range: 2,
                    damage: [
                        // armed
                        { type: 'physical', amount: { easy: 5, normal: 8, hard: 12 } },
                        // unarmed
                        // { type: 'physical', amount: { easy: 2, normal: 2, hard: 3 } },
                        { type: 'effect', effect: 'wither', time: 10000, level: 1 },
                    ],
                },
                rangeOfSight: 16,
                alwaysAngry: true,
            },
            'witch': {
                rangeAttack: {
                    range: 8,
                    damage: { type: 'physical', amount: 6 }, // harming potion
                    cooldown: 3000,
                },
                rangeOfSight: 16,
                alwaysAngry: true,
            },
            'spider': {
                meleeAttack: {
                    range: 2,
                    damage: { type: 'physical', amount: { easy: 2, normal: 2, hard: 3 } },
                },
                rangeOfSight: 16,
                alwaysAngry: false,
            },
            'stray': {
                meleeAttack: {
                    range: 2,
                    damage: { type: 'physical', amount: { easy: 2, normal: 2, hard: 3 } },
                },
                rangeAttack: {
                    range: 15,
                    damage: [
                        { type: 'physical', amount: { easy: 4, normal: 5, hard: 8 } },
                        { type: 'effect', effect: 'slowness', time: 30000, level: 1 },
                    ],
                    cooldown: 2, // ?
                },
                rangeOfSight: 16,
                alwaysAngry: true,
            },
            'ravager': {
                meleeAttack: {
                    range: 2,
                    damage: { type: 'physical', amount: { easy: 7, normal: 12, hard: 18 } },
                },
                // roar: 6
                rangeOfSight: 32,
                alwaysAngry: true,
            },
            'husk': {
                meleeAttack: {
                    range: 2,
                    damage: [
                        { type: 'physical', amount: { easy: 2.5, normal: 3, hard: 4.5 } },
                        { type: 'effect', effect: 'hunger', level: 1, time: 7000 /* Regional */ },
                    ],
                },
                rangeOfSight: 35,
                alwaysAngry: true,
            },
            'zombie_villager': {
                meleeAttack: {
                    range: 2,
                    damage: { type: 'physical', amount: { easy: 2.5, normal: 3, hard: 4.5 } },
                },
                rangeOfSight: 35,
                alwaysAngry: true,
            },
            'zombie': {
                meleeAttack: {
                    range: 2,
                    damage: { type: 'physical', amount: { easy: 2.5, normal: 3, hard: 4.5 } },
                },
                rangeOfSight: 35,
                alwaysAngry: true,
            },
            'piglin': {
                meleeAttack: {
                    range: 2,
                    damage: { type: 'physical', amount: { easy: 5, normal: 8, hard: 12 } },
                },
                rangeAttack: {
                    range: 16, // ?
                    damage: { type: 'physical', amount: { easy: 5, normal: 5, hard: 5 } },
                    cooldown: 2,
                },
                rangeOfSight: 16,
                alwaysAngry: false,
            },
            'piglin_brute': {
                meleeAttack: {
                    range: 2,
                    damage: { type: 'physical', amount: { easy: 7.5, normal: 13, hard: 19.5 } },
                },
                // also can be unarmed
                rangeOfSight: 16,
                alwaysAngry: true,
            },
            'pillager': {
                rangeAttack: {
                    range: 8,
                    damage: { type: 'physical', amount: { easy: 3.5, normal: 4, hard: 4.5 } },
                    cooldown: 2, // ?
                },
                rangeOfSight: 64,
                alwaysAngry: true,
            },
            'silverfish': {
                meleeAttack: {
                    range: 2,
                    damage: { type: 'physical', amount: { easy: 1, normal: 1, hard: 1.5 } },
                },
                rangeOfSight: 16,
                alwaysAngry: true,
            },
            'zoglin': {
                meleeAttack: {
                    range: 2,
                    damage: { type: 'physical', amount: { easy: 5, normal: 8, hard: 12 } },
                },
                rangeOfSight: 16,
                alwaysAngry: true,
            },
            'vindicator': {
                meleeAttack: {
                    range: 2,
                    damage: { type: 'physical', amount: { easy: 7.5, normal: 13, hard: 19.5 } },
                },
                // also can be unarmed
                rangeOfSight: 16,
                alwaysAngry: true,
            },
            'enderman': {
                meleeAttack: {
                    range: 2,
                    damage: { type: 'physical', amount: { easy: 4.5, normal: 7, hard: 10.5 } },
                },
                rangeOfSight: 64,
                alwaysAngry: false,
            },
            'zombified_piglin': {
                meleeAttack: {
                    range: 2,
                    damage: { type: 'physical', amount: { easy: 5, normal: 8, hard: 12 } },
                },
                // also can be unarmed
                rangeOfSight: 55,
                alwaysAngry: false,
            },
            'ghast': {
                rangeAttack: {
                    range: 64,
                    damage: [
                        { type: 'physical', amount: { easy: 4, normal: 6, hard: 9 } },
                        { type: 'explosion', level: 1 },
                    ],
                    cooldown: 3000
                },
                rangeOfSight: 64,
                alwaysAngry: true,
            },
        })
    }

    /**
     * @param {string} blockName
     * @returns {(AnyCrop & { cropName: string }) | null}
     */
    static resolveCrop(blockName) {
        for (const cropBlockName in Minecraft.cropsByBlockName) {
            const crop = Minecraft.cropsByBlockName[cropBlockName]
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
        this.registry = getMcData(version)
        this.local = new LocalMinecraftData(jarPath)

        /** @type {Set<number>} */
        const cropBlockIds = new Set()
        for (const cropName in Minecraft.cropsByBlockName) {
            const crop = Minecraft.cropsByBlockName[cropName]
            switch (crop.type) {
                case 'tree':
                    cropBlockIds.add(this.registry.blocksByName[crop.log].id)
                    cropBlockIds.add(this.registry.blocksByName[cropName].id)
                    break
                case 'grows_block':
                    cropBlockIds.add(this.registry.blocksByName[cropName].id)
                    if (crop.attachedCropName) {
                        cropBlockIds.add(this.registry.blocksByName[crop.attachedCropName].id)
                    }
                    break
                default:
                    cropBlockIds.add(this.registry.blocksByName[cropName].id)
                    break
            }
        }
        this.cropBlockIds = cropBlockIds

        for (const key in Minecraft.compost) {
            if (!this.registry.itemsByName[key]) {
                console.warn(`Unknown item "${key}"`)
            }
        }
    }

    /**
     * @param {string} name
     * @returns {Array<getMcData.IndexedBlock>}
     */
    getCorrectBlocks(name) {
        if (name === 'dirt') {
            return [
                this.registry.blocksByName['grass_block'],
                this.registry.blocksByName['dirt'],
            ]
        }

        if (name === 'wood') {
            return [
                this.registry.blocksByName['oak_log'],
                this.registry.blocksByName['spruce_log'],
                this.registry.blocksByName['birch_log'],
                this.registry.blocksByName['jungle_log'],
                this.registry.blocksByName['acacia_log'],
                this.registry.blocksByName['dark_oak_log'],
                this.registry.blocksByName['mangrove_log'],
                this.registry.blocksByName['cherry_log'],
                this.registry.blocksByName['crimson_stem'],
                this.registry.blocksByName['warped_stem'],
            ]
        }

        if (name === 'stone') {
            return [
                this.registry.blocksByName['stone'],
                this.registry.blocksByName['cobblestone'],
                this.registry.blocksByName['deepslate'],
                this.registry.blocksByName['cobbled_deepslate'],
            ]
        }

        if (this.registry.blocksByName[name]) {
            return [this.registry.blocksByName[name]]
        }

        if (this.registry.blocksByName[name.replace(/ /g, '_')]) {
            return [this.registry.blocksByName[name.replace(/ /g, '_')]]
        }

        return []
    }

    /**
     * @param {string} name
     * @returns {getMcData.Item | null}
     */
    getCorrectItems(name) {
        if (this.registry.itemsByName[name]) {
            return this.registry.itemsByName[name]
        }

        if (this.registry.itemsByName[name.replace(/ /g, '_')]) {
            return this.registry.itemsByName[name.replace(/ /g, '_')]
        }

        return null
    }

    /**
     * @param {Block} blockToBreak
     * @param {import('mineflayer').Bot | null} bot
     * @returns {{ has: boolean, item: getMcData.Item | null } | null}
     */
    getCorrectTool(blockToBreak, bot) {
        /** @ts-ignore @type {UnionToArray<keyof Minecraft.tools>} */
        const toolNames = Object.keys(Minecraft.tools)

        /** @type {Array<{ time: number, item: getMcData.Item }>} */
        let bestTools = []

        for (const category_ of toolNames) {
            const subTools = Minecraft.tools[category_]
            for (const level of Minecraft.toolLevels) {
                const subTool = subTools[level]
                const item = this.registry.itemsByName[subTool]

                if (blockToBreak.canHarvest(item.id)) {
                    const time = blockToBreak.digTime(item.id, false, false, false, [], [])
                    bestTools.push({ time: time, item: item })
                }
            }
        }

        if (bestTools.length === 0) { return null }

        bestTools.sort((a, b) => a.time - b.time)

        /** @ts-ignore @type {keyof Minecraft.tools} */
        let bestToolCategory = bestTools[0].item.name.split('_')[1]
        if (!toolNames.includes(bestToolCategory)) {
            console.warn(`Invalid tool "${bestTools[0].item.name}" ("${bestToolCategory}")`)
            return null
        }

        bestTools.sort((a, b) => {
            /** @ts-ignore @type {Minecraft.toolLevels[number]} */
            const levelA = a.item.name.split('_')[0]
            if (!Minecraft.toolLevels.includes(levelA)) {
                console.warn(`Invalid tool level ${levelA}`)
                return 0
            }

            /** @ts-ignore @type {Minecraft.toolLevels[number]} */
            const levelB = b.item.name.split('_')[0]
            if (!Minecraft.toolLevels.includes(levelB)) {
                console.warn(`Invalid tool level ${levelB}`)
                return 0
            }

            const indexofA = Minecraft.toolLevels.indexOf(levelA)
            const indexofB = Minecraft.toolLevels.indexOf(levelB)

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
     * @param {'foodPoints' | 'saturation'} sort
     * @param {boolean} includeRaw
     * @returns {Array<Item>}
     */
    filterFoods(foods, sort, includeRaw) {
        const goodFoods = Object.keys(this.registry.foodsByName)
            .filter(v => {
                if (Minecraft.badFoods.includes(v)) { return false }
                if (!includeRaw && Minecraft.rawFoods.includes(v)) { return false }
                return true
            })

        const _foods = foods
            .filter(v => v.name in this.registry.foodsByName)
            .filter(v => goodFoods.includes(v.name))
        if (sort) {
            return _foods.sort((a, b) => this.registry.foodsByName[b.name][sort] - this.registry.foodsByName[a.name][sort])
        } else {
            return _foods
        }
    }

    /**
     * @returns {Array<getMcData.Food>}
     * @param {boolean} includeRaws
     */
    getGoodFoods(includeRaws) {
        return this.registry.foodsArray.filter((item) => {
            if (Minecraft.badFoods.includes(item.name)) { return false }
            if (Minecraft.rawFoods.includes(item.name) && !includeRaws) { return false }
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
        movements.allowParkour = true
        movements.allowSprinting = true
        movements.canOpenDoors = true

        // movements.exclusionAreasStep.push((block) => {
        //     if (block.name === 'composter') return 50
        //     return 0
        // })

        Object.values(this.registry.entities)
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
            .map(v => this.registry.blocksByName[v]?.id ?? (() => { throw new Error(`Unknown block "${v}"`) })())
            .forEach(v => movements.blocksCantBreak.add(v)));

        ([
            'campfire',
            'composter',
            'sculk_sensor',
            'sweet_berry_bush',
            'end_portal',
            'nether_portal',
        ]
            .map(v => this.registry.blocksByName[v]?.id ?? (() => { throw new Error(`Unknown block "${v}"`) })())
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
            .map(v => this.registry.blocksByName[v]?.id ?? (() => { throw new Error(`Unknown block "${v}"`) })())
            .forEach(v => movements.climbables.add(v)));

        ([
            'short_grass',
            'tall_grass',
        ]
            .map(v => this.registry.blocksByName[v]?.id ?? (() => { throw new Error(`Unknown block "${v}"`) })())
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
        movements.canOpenDoors = false
    }
}
