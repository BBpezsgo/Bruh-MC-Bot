/**
 * @typedef {{
 *   priority: 'must' | 'maybe';
 * }} EquipmentItemBase
 */

/**
 * @typedef {EquipmentItemBase & {
 *   type: 'any';
 *   item: ReadonlyArray<string>;
 *   prefer: string;
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
        priority: 'maybe',
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
        priority: 'maybe',
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
        type: 'single',
        priority: 'must',
        item: 'shield',
    },
    {
        type: 'single',
        priority: 'maybe',
        item: 'fishing_rod',
    },
    {
        type: 'single',
        priority: 'maybe',
        item: 'water_bucket',
    },
]

module.exports = equipment
