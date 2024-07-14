/**
 * @type {[ 'wood', 'stone', 'iron', 'gold', 'diamond', 'netherite' ]}
 */
const levels = [
    'wood',
    'stone',
    'iron',
    'gold',
    'diamond',
    'netherite',
]

/**
 * @exports
 * @typedef {{
*   name: string;
*   damage: number;
*   speed: number;
*   cooldown: number;
*   level: typeof levels[number];
* }} MeleeWeapon
*/

/**
 * @type {Array<MeleeWeapon>}
 */
const swords = [
    {
        name: 'wooden_sword',
        damage: 4,
        speed: 1.6,
        cooldown: 1 / 1.6,
        level: 'wood',
    },
    {
        name: 'stone_sword',
        damage: 5,
        speed: 1.6,
        cooldown: 1 / 1.6,
        level: 'stone',
    },
    {
        name: 'iron_sword',
        damage: 6,
        speed: 1.6,
        cooldown: 1 / 1.6,
        level: 'iron',
    },
    {
        name: 'golden_sword',
        damage: 4,
        speed: 1.6,
        cooldown: 1 / 1.6,
        level: 'gold',
    },
    {
        name: 'diamond_sword',
        damage: 7,
        speed: 1.6,
        cooldown: 1 / 1.6,
        level: 'diamond',
    },
    {
        name: 'netherite_sword',
        damage: 8,
        speed: 1.6,
        cooldown: 1 / 1.6,
        level: 'netherite',
    },
]

/**
 * @type {Array<MeleeWeapon>}
 */
const axes = [
    {
        name: 'wooden_axe',
        damage: 7,
        speed: 0.8,
        cooldown: 1 / 0.8,
        level: 'wood',
    },
    {
        name: 'stone_axe',
        damage: 9,
        speed: 0.8,
        cooldown: 1 / 0.8,
        level: 'stone',
    },
    {
        name: 'iron_axe',
        damage: 9,
        speed: 0.9,
        cooldown: 1 / 0.9,
        level: 'iron',
    },
    {
        name: 'golden_axe',
        damage: 7,
        speed: 1,
        cooldown: 1 / 1,
        level: 'gold',
    },
    {
        name: 'diamond_axe',
        damage: 9,
        speed: 1,
        cooldown: 1 / 1,
        level: 'diamond',
    },
    {
        name: 'netherite_axe',
        damage: 10,
        speed: 1,
        cooldown: 1 / 1,
        level: 'netherite',
    },
]

/**
 * @type {Array<MeleeWeapon>}
 */
const shovels = [
    {
        name: 'wooden_shovel',
        damage: 2.5,
        speed: 1,
        cooldown: 1 / 1,
        level: 'wood',
    },
    {
        name: 'stone_shovel',
        damage: 3.5,
        speed: 1,
        cooldown: 1 / 1,
        level: 'stone',
    },
    {
        name: 'iron_shovel',
        damage: 4.5,
        speed: 1,
        cooldown: 1 / 1,
        level: 'iron',
    },
    {
        name: 'golden_shovel',
        damage: 2.5,
        speed: 1,
        cooldown: 1 / 1,
        level: 'gold',
    },
    {
        name: 'diamond_shovel',
        damage: 5.5,
        speed: 1,
        cooldown: 1 / 1,
        level: 'diamond',
    },
    {
        name: 'netherite_shovel',
        damage: 6.5,
        speed: 1,
        cooldown: 1 / 1,
        level: 'netherite',
    },
]

/**
 * @type {Array<MeleeWeapon>}
 */
const pickaxes = [
    {
        name: 'wooden_pickaxe',
        damage: 2,
        speed: 1.2,
        cooldown: 1 / 1.2,
        level: 'wood',
    },
    {
        name: 'stone_pickaxe',
        damage: 3,
        speed: 1.2,
        cooldown: 1 / 1.2,
        level: 'stone',
    },
    {
        name: 'iron_pickaxe',
        damage: 4,
        speed: 1.2,
        cooldown: 1 / 1.2,
        level: 'iron',
    },
    {
        name: 'golden_pickaxe',
        damage: 2,
        speed: 1.2,
        cooldown: 1 / 1.2,
        level: 'gold',
    },
    {
        name: 'diamond_pickaxe',
        damage: 5,
        speed: 1.2,
        cooldown: 1 / 1.2,
        level: 'diamond',
    },
    {
        name: 'netherite_pickaxe',
        damage: 6,
        speed: 1.2,
        cooldown: 1 / 1.2,
        level: 'netherite',
    },
]

/**
 * @type {Array<MeleeWeapon>}
 */
const hoes = [
    {
        name: 'wooden_hoe',
        damage: 1,
        speed: 1,
        cooldown: 1 / 1,
        level: 'wood',
    },
    {
        name: 'stone_hoe',
        damage: 1,
        speed: 2,
        cooldown: 1 / 2,
        level: 'stone',
    },
    {
        name: 'iron_hoe',
        damage: 1,
        speed: 3,
        cooldown: 1 / 3,
        level: 'iron',
    },
    {
        name: 'golden_hoe',
        damage: 1,
        speed: 1,
        cooldown: 1 / 1,
        level: 'gold',
    },
    {
        name: 'diamond_hoe',
        damage: 1,
        speed: 4,
        cooldown: 1 / 4,
        level: 'diamond',
    },
    {
        name: 'netherite_hoe',
        damage: 1,
        speed: 4,
        cooldown: 1 / 4,
        level: 'netherite',
    },
]

const weapons = [
    ...swords,
    ...axes,
    ...shovels,
    ...pickaxes,
    ...hoes,
]

/**
 * @param {Array<MeleeWeapon>} weapons
 */
function sort(weapons) {
    return weapons.sort((a, b) => {
        const aScore = a.damage * a.speed
        const bScore = b.damage * b.speed

        if (aScore === bScore) {
            const aLevel = levels.indexOf(a.level)
            const bLevel = levels.indexOf(b.level)
            return aLevel - bLevel
        }

        return bScore - aScore
    })
}

sort(weapons)
sort(swords)

module.exports = {
    /** @readonly */
    swords: Object.freeze(swords),
    /** @readonly */
    weapons: Object.freeze(weapons),
}
