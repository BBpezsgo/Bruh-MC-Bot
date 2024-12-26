'use strict'

/**
 * @typedef {{
 *   priority: 'must' | 'good';
 * }} EquipmentItemBase
 */

/**
 * @typedef {EquipmentItemBase & {
 *   type: 'any';
 *   item: ReadonlyArray<string>;
 *   prefer: string;
 *   count: 'any' | number
 * }} AnyEquipmentItem
 */

/**
 * @typedef {EquipmentItemBase & {
 *   type: 'food';
 *   food: number;
 * }} FoodEquipment
 */

/**
 * @typedef {EquipmentItemBase & {
 *   type: 'single';
 *   item: string;
 *   count: 'any' | number
 * }} SingleEquipmentItem
 */

/**
 * @typedef {AnyEquipmentItem |
 *   SingleEquipmentItem |
 *   FoodEquipment
 * } EquipmentItem
 */

/**
 * @typedef {EquipmentItem & {
 *   satisfied: boolean;
 * }} SatisfiedEquipmentItem
 */

/**
 * @type {ReadonlyArray<EquipmentItem>}
 */
const equipment = [
    {
        type: 'food',
        priority: 'must',
        food: 40,
    },
    {
        type: 'any',
        priority: 'must',
        count: 1,
        item: [
            'wooden_pickaxe',
            'stone_pickaxe',
            'iron_pickaxe',
            'golden_pickaxe',
            'diamond_pickaxe',
            'netherite_pickaxe',
        ],
        prefer: 'stone_pickaxe',
    },
    {
        type: 'any',
        priority: 'must',
        count: 1,
        item: [
            'wooden_sword',
            'stone_sword',
            'iron_sword',
            'golden_sword',
            'diamond_sword',
            'netherite_sword',
        ],
        prefer: 'stone_sword',
    },
    {
        type: 'any',
        priority: 'good',
        count: 1,
        item: [
            'wooden_hoe',
            'stone_hoe',
            'iron_hoe',
            'golden_hoe',
            'diamond_hoe',
            'netherite_hoe',
        ],
        prefer: 'wooden_hoe',
    },
    {
        type: 'any',
        priority: 'good',
        count: 1,
        item: [
            'leather_helmet',
            'iron_helmet',
            // 'chainmail_helmet',
            // 'golden_helmet',
            'diamond_helmet',
            'netherite_helmet',
        ],
        prefer: 'iron_helmet',
    },
    {
        type: 'any',
        priority: 'good',
        count: 1,
        item: [
            'leather_chestplate',
            'iron_chestplate',
            // 'chainmail_chestplate',
            // 'golden_chestplate',
            'diamond_chestplate',
            'netherite_chestplate',
        ],
        prefer: 'iron_chestplate',
    },
    {
        type: 'any',
        priority: 'good',
        count: 1,
        item: [
            'leather_leggings',
            'iron_leggings',
            // 'chainmail_leggings',
            // 'golden_leggings',
            'diamond_leggings',
            'netherite_leggings',
        ],
        prefer: 'iron_leggings',
    },
    {
        type: 'any',
        priority: 'good',
        count: 1,
        item: [
            'leather_boots',
            'iron_boots',
            // 'chainmail_boots',
            // 'golden_boots',
            'diamond_boots',
            'netherite_boots',
        ],
        prefer: 'iron_boots',
    },
    {
        type: 'single',
        priority: 'good',
        item: 'shield',
        count: 1,
    },
    {
        type: 'single',
        priority: 'good',
        item: 'fishing_rod',
        count: 1,
    },
    {
        type: 'single',
        priority: 'good',
        item: 'water_bucket',
        count: 1,
    },
    {
        type: 'any',
        priority: 'good',
        item: ['bow', 'crossbow'],
        prefer: 'crossbow',
        count: 1,
    },
    {
        type: 'single',
        priority: 'good',
        item: 'arrow',
        count: 'any',
    },
]

module.exports = equipment
