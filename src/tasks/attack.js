'use strict'

const { Entity } = require('prismarine-entity')
const { wrap, sleepG, sleepTicks } = require('../utils/tasks')
const Weapons = require('minecrafthawkeye/dist/types/index').Weapons
const { Item } = require('prismarine-item')
const goto = require('./goto')
const { Vec3 } = require('vec3')
const Minecraft = require('../minecraft')
const { EntityPose } = require('../entity-metadata')
const { isItemEquals, trajectoryTime } = require('../utils/other')
const config = require('../config')
const projectilRadar = require('minecrafthawkeye/dist/projectilRadar')
const { weaponsProps } = require('minecrafthawkeye')
const GameError = require('../errors/game-error')
const PermissionError = require('../errors/permission-error')

/**
 * @typedef {{
 *   useMelee: boolean;
 *   useMeleeWeapon: boolean;
 *   useBow: boolean;
 * }} PermissionArgs
 */

/**
 * @param {Item} item
 * @returns {boolean}
 */
function isCrossbowCharged(item) {
    return (
        item.nbt &&
        (item.nbt.type === 'compound') &&
        item.nbt.value['ChargedProjectiles'] &&
        (item.nbt.value['ChargedProjectiles'].type === 'list') &&
        (item.nbt.value['ChargedProjectiles'].value.value.length > 0)
    )
}

/**
 * @param {Item} weapon
 */
function resolveRangeWeapon(weapon) {
    /** @type {Record<string, number>} */
    const enchants = {}
    weapon.enchants.forEach(v => enchants[v.name] = v.lvl)

    if (weapon.components) {
        for (const component of weapon.components) {
            if (component.type !== 'enchantments') continue
            for (const enchantment of component.data.enchantments) {
                enchants[enchantment.id] = enchantment.level
            }
        }
    }

    switch (weapon.name) {
        case Weapons.bow: {
            let damage = 6
            let powerDamage = 0
            if (enchants['power']) {
                const power = enchants['power']
                powerDamage += powerDamage * 0.25 * (power + 1)
            }
            let knockback = 1.985
            if (enchants['punch']) {
                switch (enchants['punch']) {
                    case 1:
                        knockback = 5.492
                        break
                    case 2:
                        knockback = 8.792
                        break
                }
            }
            return {
                item: weapon,
                damage: damage + powerDamage,
                knockback: knockback,
                chargeTime: 1200,
            }
        }
        case Weapons.crossbow: {
            let damage = 9
            let chargeTime = 1250
            if (enchants['quick_charge'] ?? enchants[29]) {
                const quickCharge = enchants['quick_charge'] ?? enchants[29]
                if (quickCharge > 5) {
                    chargeTime = Infinity
                } else {
                    chargeTime = 1250 - (quickCharge * 250)
                }
            }
            return {
                item: weapon,
                damage: damage,
                chargeTime: chargeTime,
            }
        }
        case Weapons.trident: {
            return {
                item: weapon,
                damage: 8,
            }
        }
    }

    return null
}

/**
 * @param {import('../bruh-bot')} bot
 */
function searchRangeWeapon(bot) {
    const keys = Object.values(Weapons)

    for (const weapon of keys) {
        const found = bot.searchInventoryItem(null, weapon)
        if (!found) { continue }

        let ammo = 0

        switch (weapon) {
            case Weapons.bow:
            case Weapons.crossbow:
                ammo = bot.bot.inventory.count(bot.mc.registry.itemsByName['arrow'].id, null)
                break
            case Weapons.egg:
            case Weapons.snowball:
            case Weapons.trident:
                ammo = bot.bot.inventory.count(found.type, null)
                break

            default: continue
        }

        if (ammo === 0) { continue }

        let resolved = resolveRangeWeapon(found)

        if (!resolved) continue

        return {
            ...resolved,
            weapon: weapon,
            ammo: ammo,
        }
    }

    return null
}

/**
 * @type {readonly [ 'wood', 'stone', 'iron', 'gold', 'diamond', 'netherite' ]}
 */
const toolLevels = Object.freeze([
    'wood',
    'stone',
    'iron',
    'gold',
    'diamond',
    'netherite',
])

const meleeWeapons = (/** @type {Array<{ name: string; damage: number; speed: number; level: typeof toolLevels[number]; }>} */ ([
    {
        name: 'wooden_sword',
        damage: 4,
        speed: 1.6,
        level: 'wood',
    },
    {
        name: 'stone_sword',
        damage: 5,
        speed: 1.6,
        level: 'stone',
    },
    {
        name: 'iron_sword',
        damage: 6,
        speed: 1.6,
        level: 'iron',
    },
    {
        name: 'golden_sword',
        damage: 4,
        speed: 1.6,
        level: 'gold',
    },
    {
        name: 'diamond_sword',
        damage: 7,
        speed: 1.6,
        level: 'diamond',
    },
    {
        name: 'netherite_sword',
        damage: 8,
        speed: 1.6,
        level: 'netherite',
    },
    {
        name: 'wooden_axe',
        damage: 7,
        speed: 0.8,
        level: 'wood',
    },
    {
        name: 'stone_axe',
        damage: 9,
        speed: 0.8,
        level: 'stone',
    },
    {
        name: 'iron_axe',
        damage: 9,
        speed: 0.9,
        level: 'iron',
    },
    {
        name: 'golden_axe',
        damage: 7,
        speed: 1,
        level: 'gold',
    },
    {
        name: 'diamond_axe',
        damage: 9,
        speed: 1,
        level: 'diamond',
    },
    {
        name: 'netherite_axe',
        damage: 10,
        speed: 1,
        level: 'netherite',
    },
    {
        name: 'wooden_shovel',
        damage: 2.5,
        speed: 1,
        level: 'wood',
    },
    {
        name: 'stone_shovel',
        damage: 3.5,
        speed: 1,
        level: 'stone',
    },
    {
        name: 'iron_shovel',
        damage: 4.5,
        speed: 1,
        level: 'iron',
    },
    {
        name: 'golden_shovel',
        damage: 2.5,
        speed: 1,
        level: 'gold',
    },
    {
        name: 'diamond_shovel',
        damage: 5.5,
        speed: 1,
        level: 'diamond',
    },
    {
        name: 'netherite_shovel',
        damage: 6.5,
        speed: 1,
        level: 'netherite',
    },
    {
        name: 'wooden_pickaxe',
        damage: 2,
        speed: 1.2,
        level: 'wood',
    },
    {
        name: 'stone_pickaxe',
        damage: 3,
        speed: 1.2,
        level: 'stone',
    },
    {
        name: 'iron_pickaxe',
        damage: 4,
        speed: 1.2,
        level: 'iron',
    },
    {
        name: 'golden_pickaxe',
        damage: 2,
        speed: 1.2,
        level: 'gold',
    },
    {
        name: 'diamond_pickaxe',
        damage: 5,
        speed: 1.2,
        level: 'diamond',
    },
    {
        name: 'netherite_pickaxe',
        damage: 6,
        speed: 1.2,
        level: 'netherite',
    },
    {
        name: 'wooden_hoe',
        damage: 1,
        speed: 1,
        level: 'wood',
    },
    {
        name: 'stone_hoe',
        damage: 1,
        speed: 2,
        level: 'stone',
    },
    {
        name: 'iron_hoe',
        damage: 1,
        speed: 3,
        level: 'iron',
    },
    {
        name: 'golden_hoe',
        damage: 1,
        speed: 1,
        level: 'gold',
    },
    {
        name: 'diamond_hoe',
        damage: 1,
        speed: 4,
        level: 'diamond',
    },
    {
        name: 'netherite_hoe',
        damage: 1,
        speed: 4,
        level: 'netherite',
    },
    {
        name: 'trident',
        damage: 9,
        speed: 1.1,
        level: 'diamond', // ???
    },
])).map(v => ({
    ...v,
    cooldown: 1 / v.speed,
    damagePerSecond: v.damage * v.speed,
})).sort((a, b) => {
    if (a.damagePerSecond === b.damagePerSecond) {
        const aLevel = toolLevels.indexOf(a.level)
        const bLevel = toolLevels.indexOf(b.level)
        return aLevel - bLevel
    }
    return b.damagePerSecond - a.damagePerSecond
})

/**
 * @typedef {(typeof meleeWeapons)[0]} MeleeWeapon
 */

const undeadMobs = [
    'drowned',
    'husk',
    'phantom',
    'skeletom',
    'skeleton_horse',
    'stray',
    'wither',
    'wither_skeleton',
    'zoglin',
    'zombie',
    'zombie_horse',
    'zombie_villager',
    'zombified_piglin',
]

const arthropodMobs = [
    'spider',
    'cave_spider',
    'bee',
    'silverfish',
    'endermite',
]

/**
 * @param {import('../bruh-bot')} bot
 * @param {string} targetEntity
 */
function searchMeleeWeapon(bot, targetEntity) {
    let bestScore = 0
    let bestWeapon = null
    for (const meleeWeapon of meleeWeapons) {
        const item = bot.searchInventoryItem(null, meleeWeapon.name)
        if (!item) { continue }
        const weapon = resolveMeleeWeapon({
            ...meleeWeapon,
            item: item,
        }, targetEntity)
        if (!bestWeapon || weapon.damagePerSecond > bestScore) {
            bestWeapon = weapon
            bestScore = weapon.damagePerSecond
        }
    }
    return bestWeapon
}

/**
 * @param {MeleeWeapon & { item: Item }} weapon
 * @param {string} targetEntity
 */
function resolveMeleeWeapon(weapon, targetEntity) {
    /** @type {Record<string, number>} */
    const enchants = {}
    weapon.item.enchants.forEach(v => enchants[v.name] = v.lvl)

    const swordItems = [
        'golden_sword',
        'wooden_sword',
        'stone_sword',
        'iron_sword',
        'diamond_sword',
        'netherite_sword',
    ]

    const axeItems = [
        'golden_axe',
        'wooden_axe',
        'stone_axe',
        'iron_axe',
        'diamond_axe',
        'netherite_axe',
    ]

    let knockback = 1
    if (enchants['knockback'] &&
        swordItems.includes(weapon.name)) {
        switch (enchants['knockback']) {
            case 1:
                knockback *= 1.05
                break
            case 2:
                knockback *= 1.90
                break
            default:
                break
        }
    }

    let sharpnessDamage = 0
    if (enchants['sharpness'] && (
        swordItems.includes(weapon.name) ||
        axeItems.includes(weapon.name)
    )) {
        const sharpness = enchants['sharpness']
        sharpnessDamage = 0.5 * sharpness + 0.5
    }

    let smiteDamage = 0
    if (enchants['smite'] && (
        swordItems.includes(weapon.name) ||
        axeItems.includes(weapon.name)
    )) {
        const smite = enchants['smite']
        smiteDamage = smite * 2.5
    }

    let baneOfArthropodsDamage = 0
    if (enchants['bane_of_arthropods'] && (
        swordItems.includes(weapon.name) ||
        axeItems.includes(weapon.name)
    )) {
        const baneOfArthropods = enchants['bane_of_arthropods']
        baneOfArthropodsDamage = baneOfArthropods * 2.5
    }

    let finalDamage = weapon.damage
    finalDamage += sharpnessDamage
    if (undeadMobs.includes(targetEntity)) {
        finalDamage += smiteDamage
    }
    if (arthropodMobs.includes(targetEntity)) {
        finalDamage += baneOfArthropodsDamage
    }

    let sweepDamage = 0
    if (enchants['sweeping_edge'] && swordItems.includes(weapon.name)) {
        const sweepingEdge = enchants['sweeping_edge']
        sweepDamage = Math.round(1 + finalDamage * (sweepingEdge / (sweepingEdge + 1)))
    }

    if (weapon.name === 'trident') {
        finalDamage = 9
    }

    return {
        ...weapon,
        damage: finalDamage,
        sweepDamage: sweepDamage,
        knockback: knockback,
        cooldown: 1 / weapon.speed,
        damagePerSecond: finalDamage * weapon.speed,
    }
}

/**
 * @param {Entity} entity
 */
function isAlive(entity) {
    if (!entity) { return false }
    if (!entity.isValid) { return false }
    if (entity.metadata[6] === EntityPose.DYING) { return false }
    return true
}

/**
 * @param {number} damage
 * @param {number} armor
 * @param {number} armorToughness
 */
function resolveDamage(damage, armor, armorToughness) {
    return damage * (1 - ((Math.min(20, Math.max((armor / 5), armor - (4 * damage / (armorToughness + 8))))) / 25))
}

/**
 * @param {import('mineflayer').Bot} bot
 * @param {Entity} entity
 * @param {import('../minecraft').Amount | ((entity: import("prismarine-entity").Entity) => import('../minecraft').Amount)} amount
 */
function resolveAmount(bot, entity, amount) {
    if (typeof amount === 'object') {
        return amount[(bot.game.difficulty === 'peaceful') ? 'easy' : bot.game.difficulty]
    } else if (typeof amount === 'number') {
        return amount
    }
    return resolveAmount(bot, entity, amount(entity))
}

/**
 * @param {import('mineflayer').Bot} bot
 * @param {Entity} entity
 * @param {import('../minecraft').Damage | import('../minecraft').Damage[]} attack
 */
function resolveAttackDamage(bot, entity, attack) {
    let result = 0
    if ('length' in attack) {
        for (const item of attack) {
            result += resolveAttackDamage(bot, entity, item)
        }
    } else {
        switch (attack.type) {
            case 'physical':
                result += resolveAmount(bot, entity, attack.amount)
                break
            case 'explosion':
                const exposure = 1
                const power = resolveAmount(bot, entity, attack.level)
                const blastProtectionLevel = 0
                const impact = 1 - (bot.entity.position.distanceTo(entity.position) / (2 * power)) * exposure * (1 - (0.15 * blastProtectionLevel))
                const difficultyMultiplier = {
                    peaceful: 3.4,
                    easy: 3.4,
                    normal: 7,
                    hard: 10.5,
                }[bot.game.difficulty]
                const explosionDamage = difficultyMultiplier * power * (impact + impact * impact) + 1
                result += explosionDamage
                break
            case 'fire':
                result += (resolveAmount(bot, entity, attack.time) / 1000) * 0.5
                break
            case 'effect':
                switch (attack.effect) {
                    case 'wither':
                        // TODO
                        result += (resolveAmount(bot, entity, attack.time) / 1000) * resolveAmount(bot, entity, attack.level)
                        break
                    case 'poison':
                        // TODO
                        result += (resolveAmount(bot, entity, attack.time) / 1000) * resolveAmount(bot, entity, attack.level)
                        break
                    default:
                        break
                }
                break
            default:
                break
        }
    }
    return result
}

/**
 * @param {import('../bruh-bot')} bot
 * @param {Entity} entity
 */
function calculateScore(bot, entity) {
    const distance = Math.entityDistance(bot.bot.entity.position.offset(0, 1.6, 0), entity)

    const hostile = Minecraft.hostiles[entity.name]

    if (entity.name === 'shulker') {
        if (!entity.metadata[17]) { return 0.01 }
        if (distance > config.attack.distanceToUseRangeWeapons) { return 0.01 }
    }

    let activeMeleeDamage = (distance < 2) ? 1 : 0
    let activeRangeDamage = 0

    /** per second */
    let meleeDamage = 0
    /** per second */
    let rangeDamage = 0

    let attackRange = 2
    if (hostile) {
        if (distance > hostile.rangeOfSight) {
            return 0
        }
        if (hostile.meleeAttack) {
            meleeDamage = resolveAttackDamage(bot.bot, entity, hostile.meleeAttack.damage)
            meleeDamage /= (hostile.meleeAttack.cooldown ?? 500) / 1000
            if (distance <= hostile.meleeAttack.range) {
                activeMeleeDamage = meleeDamage
            }
            attackRange = Math.max(attackRange, hostile.meleeAttack.range)
        }
        if (hostile.rangeAttack) {
            rangeDamage = resolveAttackDamage(bot.bot, entity, hostile.rangeAttack.damage)
            rangeDamage /= hostile.rangeAttack.cooldown / 1000
            if (distance <= hostile.rangeAttack.range) {
                activeRangeDamage = rangeDamage
            }
            attackRange = Math.max(attackRange, hostile.rangeAttack.range)
        }
    }

    const activeDamageScore = Math.max(activeMeleeDamage, activeRangeDamage)
    const damageScore = Math.max(meleeDamage, rangeDamage)

    /** `0..1` */
    let attackRangeScore = 0
    if (distance < attackRange) {
        attackRangeScore = 1
    } else {
        const distanceUntilAttack = distance - attackRange
        attackRangeScore = Math.max(0, Math.min(1, 1 / distanceUntilAttack))
    }

    /** `0..1` */
    let healthScore = 0
    if (entity.health) {
        const healthToConsider = 10
        healthScore = (healthToConsider - (Math.sqrt(entity.health) * Math.sqrt(healthToConsider))) / healthToConsider

        // const armor = resolveEntityAttribute(entity.attributes['minecraft:generic.armor']) ?? 0
        // const armorToughness = resolveEntityAttribute(entity.attributes['minecraft:generic.armor_toughness']) ?? 0

        // const resolvedDamage = resolveDamage(meleeWeapon?.damage ?? 1, armor, armorToughness)
    }

    /** `0..(hurtAt.length)` */
    let dangerScore = 0
    const hurtByMemoryTime = 10000
    const hurtTimes = bot.memory.hurtBy[entity.id]?.times ?? []
    for (const hurtAt of hurtTimes) {
        const deltaTime = performance.now() - hurtAt
        const hurtScore = Math.max(0, (hurtByMemoryTime - deltaTime) / hurtByMemoryTime)
        dangerScore += hurtScore
    }

    const hurtCooldownScoreMultiplier = bot.env.isEntityHurting(entity) ?? (bot.env.entityHurtTimeRecords[entity.id]?.length) ? 0.1 : 1

    return ((
        attackRangeScore +
        healthScore +
        dangerScore
    ) * damageScore
        + activeDamageScore
    ) * hurtCooldownScoreMultiplier
}

/**
 * @param {import('mineflayer').Bot} bot
 */
function timeUntilCriticalHit(bot) {
    const blockBelow = bot.world.getBlock(bot.entity.position.floored().offset(0, -0.5, 0))
    const initialVelocity =
        bot.entity.onGround
            // @ts-ignore
            ? Math.fround(0.42) * ((blockBelow && blockBelow.name === 'honey_block') ? bot.bot.physics.honeyblockJumpSpeed : 1)
            : bot.entity.velocity.y
    // if (bot.entity.jumpBoost > 0) {
    //     initialVelocity += 0.1 * bot.entity.jumpBoost
    // }
    const targetVelocity = 0
    const acceleration = -bot.physics.gravity
    const t = (targetVelocity - initialVelocity) / acceleration
    return t * 1000
}

/**
 * @type {import('../task').TaskDef<boolean, ({
 *   target: Entity;
 * } | {
 *   targets: Record<number, Entity>;
 * }) & PermissionArgs> & {
 *   can: (bot: import('../bruh-bot'), entity: Entity, permissions: PermissionArgs) => boolean;
 *   isCrossbowCharged: isCrossbowCharged;
 *   resolveRangeWeapon: resolveRangeWeapon;
 * }}
 */
module.exports = {
    task: function*(bot, args) {
        if (!args.useBow && !args.useMelee) {
            throw new PermissionError(`Every possible way of attacking is disabled`)
        }

        if (!bot.bot.hawkEye) {
            setTimeout(() => bot.bot.loadPlugin(require('minecrafthawkeye').default), 0)
        }

        /**
         * @param {Item | null} shield
         */
        const deactivateShield = function(shield) {
            if (shield && bot.leftHand.isActivated) {
                bot.deactivateHand()
                return true
            }
            return false
        }

        /**
         * @param {Item | null} shield
         */
        const activateShield = function(shield) {
            if (shield && !bot.leftHand.isActivated) {
                bot.activateHand('left')
                return true
            }
            return false
        }

        /**
         * @param {string} targetEntity
         */
        const equipMeleeWeapon = function*(targetEntity) {
            meleeWeapon = searchMeleeWeapon(bot, targetEntity)
            const holds = bot.bot.inventory.slots[bot.bot.getEquipmentDestSlot('hand')]

            // @ts-ignore
            cooldown = (meleeWeapon ? meleeWeapon.cooldown : (1 / (bot.bot.entity.attributes['minecraft:generic.attack_speed'] ?? 4))) * 1000

            if (meleeWeapon) {
                if (!holds || holds.type !== meleeWeapon.item.type) {
                    yield* wrap(bot.bot.equip(meleeWeapon.item.type, 'hand'), args.interrupt)
                    cooldownEndAt = performance.now() + cooldown
                }
            } else {
                if (holds) {
                    yield* wrap(bot.bot.unequip('hand'), args.interrupt)
                    cooldownEndAt = performance.now() + cooldown
                }
            }
        }

        const ensureMovement = function() {
            if (bot.bot.pathfinder.goal?.['name'] === goal.name) return
            const options = {
                timeout: 100,
                searchRadius: 5,
                sprint: true,
                movements: bot.restrictedMovements,
                lookAtTarget: true, // FIXME jumping backward
                retryCount: 0,
            }
            switch (movementState) {
                case 'goto': {
                    options.timeout = 1500
                    options.searchRadius = 32
                    options.lookAtTarget = true
                    options.retryCount = 3
                    break
                }
                case 'goto-range': {
                    options.timeout = 1500
                    options.searchRadius = 32
                    options.lookAtTarget = true
                    options.retryCount = 1
                    break
                }
                case 'goto-melee': {
                    options.timeout = 700
                    options.searchRadius = 16
                    options.lookAtTarget = true
                    options.retryCount = 0
                    break
                }
            }
            goto.setOptions(bot, options)
            bot.bot.pathfinder.setGoal(goal, false)
        }

        const stopMovement = function() {
            if (bot.bot.pathfinder.goal?.['name'] !== goal.name) {
                return
            }
            bot.bot.pathfinder.stop()
        }

        /**
         * @param {import('mineflayer-pathfinder').PartiallyComputedPath} path
         */
        const onPathUpdate = (path) => {
            if (isGoalChanged) { return }
            /**
             * @type {keyof noPath}
             */
            let key
            if (movementState === 'goto-melee') {
                key = 'melee'
            } else if (movementState === 'goto-range') {
                key = 'range'
            } else {
                return
            }

            if (path.status === 'noPath') {
                noPath[key] = performance.now()
            } else {
                noPath[key] = 0
            }
        }

        /**
         * @param {Entity} target
         * @param {Weapons} weapon
         */
        const getGrade = (target, weapon) => {
            const grade = bot.bot.hawkEye.getMasterGrade({
                isValid: false,
                position: target.position.offset(0, target.height / 2, 0),
            }, new Vec3(0, 0, 0), weapon)
            if (!grade) return null
            if (grade.blockInTrayect) return null
            if (projectilRadar.trajectoryCollisions(
                bot.bot,
                grade.arrowTrajectoryPoints,
                Object.values(bot.bot.players)
                    .map(v => v.entity)
                    .filter(v => v && v.isValid && v.id !== target.id && v.id !== bot.bot.entity.id))
            ) return null
            return grade
        }

        let cooldownEndAt = 0
        let cooldown = 500

        /** @type {ReturnType<searchMeleeWeapon> | null}*/
        let meleeWeapon = null
        /** @type {Item | null} */
        let shield = bot.searchInventoryItem(null, 'shield')

        let noPath = {
            range: 0,
            melee: 0,
        }

        bot.bot.on('path_update', onPathUpdate)

        let reequipMeleeWeapon = true
        let isGoalChanged = false

        /**
         * @param {Vec3} node
         * @param {Entity} entity
         */
        const getEntityHeuristic = function(node, entity) {
            const dx = entity.position.x - node.x
            const dy = entity.position.y - node.y
            const dz = entity.position.z - node.z
            return Math.sqrt(dx * dx + dz * dz) + Math.abs(dy)
        }

        const selectTarget = function() {
            target = null
            targetScore = 0
            if ('target' in args) {
                target = args.target
                if (!isAlive(target)) return { target: null, targetScore: 0 }
                targetScore = calculateScore(bot, target)
            } else {
                for (const id of Object.keys(args.targets).map(Number.parseInt)) {
                    const candidate = args.targets[id]
                    if (!isAlive(candidate)) {
                        delete args.targets[id]
                        continue
                    }

                    const candidateScore = calculateScore(bot, candidate)

                    if (!target || candidateScore > targetScore) {
                        targetScore = candidateScore
                        target = candidate
                    }
                }
            }
            return { target, targetScore }
        }

        /**
         * @param {Entity} entity
         */
        const onEntitySpawn = (entity) => {
            return
            if (entity.name !== 'arrow') return
            if (entity.position.distanceTo(bot.bot.entity.position.offset(0, bot.bot.entity.eyeHeight ?? 1.6, 0)) > 1.5) return
            const velocity = entity.velocity.clone().normalize()
            const dir = entity.position.clone().subtract(bot.bot.entity.position).normalize()
            const dot = velocity.dot(dir)
            if (dot < 0) return
            bot.memory.myArrows.push(entity.id)
        }

        const goalHawkeye = {
            /** @type {Entity} */ _target: null,
            /** @type {Weapons} */ _weapon: null,
            /** @type {import('mineflayer-pathfinder/lib/goals').GoalBase['isEnd']} */
            isEnd: function(node) {
                if (!bot.bot.hawkEye) { throw new Error(`Plugin hawekeye not loaded yet`) }
                const savedBotPosition = bot.bot.entity.position
                bot.bot.entity.position = node
                const grade = getGrade(this._target, this._weapon)
                bot.bot.entity.position = savedBotPosition
                return Boolean(grade)
            },
            /** @type {import('mineflayer-pathfinder/lib/goals').GoalBase['isValid']} */
            isValid: function() {
                return this._target && this._target.isValid
            },
            /** @type {import('mineflayer-pathfinder/lib/goals').GoalBase['heuristic']} */
            heuristic: function(node) {
                const dx = this._target.position.x - node.x
                const dy = this._target.position.y - node.y
                const dz = this._target.position.z - node.z
                return (Math.sqrt(dx * dx + dz * dz) + Math.abs(dy))
            }
        }

        /**
         * @type {import('mineflayer-pathfinder/lib/goals').GoalBase & {
         *   getEntities: () => Array<Entity>;
         *   getEntityPositions: () => Array<Vec3>;
         *   lastEntityPositions: Array<Vec3>;
         *   name: 'attack_goal';
         * }}
         */
        const goal = {
            isValid: function() {
                for (const entity of this.getEntities()) {
                    if (entity && entity.isValid) { return true }
                }
                return false
            },
            hasChanged: function() {
                if (isGoalChanged) {
                    isGoalChanged = false
                    return true
                }
                const entityPositions = this.getEntityPositions()
                if (this.lastEntityPositions.length !== entityPositions.length) {
                    this.lastEntityPositions = entityPositions
                    return true
                }
                for (let i = 0; i < entityPositions.length; i++) {
                    const d = entityPositions[i].distanceTo(this.lastEntityPositions[i])
                    if (d >= 1) {
                        this.lastEntityPositions = entityPositions
                        return true
                    }
                }
                return false
            },
            heuristic: function(node) {
                if (target) {
                    switch (movementState) {
                        case 'goto': {
                            return getEntityHeuristic(node, target)
                        }
                        case 'goto-melee': {
                            return getEntityHeuristic(node, target)
                        }
                        case 'goto-range': {
                            return goalHawkeye.heuristic(node)
                        }
                    }
                }
                let fleeHeuristic = Number.MIN_VALUE
                for (const entity of this.getEntities()) {
                    fleeHeuristic = Math.max(fleeHeuristic, getEntityHeuristic(node, entity))
                }
                return -fleeHeuristic
            },
            isEnd: function(node) {
                for (const entity of this.getEntities()) {
                    const d = Math.entityDistanceSquared(node, entity)
                    if (d <= (3 * 3)) { return false }
                }
                if (target) {
                    switch (movementState) {
                        case 'goto': {
                            const d = node.distanceTo(target.position)
                            return d < 8
                        }
                        case 'goto-melee': {
                            const d = node.distanceTo(target.position)
                            return d < 4
                        }
                        case 'goto-range': {
                            return goalHawkeye.isEnd(node)
                        }
                    }
                }
                return true
            },
            getEntities: function() {
                return (('target' in args) ? [args.target] : Object.values(args.targets)).filter(v => v?.isValid)
            },
            getEntityPositions: function() {
                return this.getEntities().map(v => v.position.clone())
            },
            lastEntityPositions: [],
            name: 'attack_goal',
        }
        goal.lastEntityPositions = goal.getEntityPositions()

        const movementGoal = {
            'distance': bot.bot.movement.heuristic.new('distance'),
            'danger': bot.bot.movement.heuristic.new('danger'),
            'proximity': bot.bot.movement.heuristic.new('proximity'),
            'conformity': bot.bot.movement.heuristic.new('conformity'),
        }

        /**
         * @type {'none' | 'goto' | 'goto-melee' | 'goto-range'}
         */
        let movementState = 'none'
        /**
         * @type {number}
         */
        let targetScore = 0
        /**
         * @type {Entity | null}
         */
        let target = null

        bot.bot.on('entitySpawn', onEntitySpawn)

        const cleanup = () => {
            bot.bot.off('path_update', onPathUpdate)
            bot.bot.off('entitySpawn', onEntitySpawn)
            if (bot.leftHand.isActivated) {
                bot.deactivateHand()
            }
            stopMovement()
        }

        /**
         * @param {import('../utils/interrupt').InterruptType} type
         */
        const onInterrupt = (type) => {
            if (type === 'cancel') cleanup()
        }

        args.interrupt.on(onInterrupt)

        try {
            while (true) {
                yield

                const { target } = selectTarget()
                if (!target) break

                if (noPath.melee && performance.now() - noPath.melee > 5000) {
                    noPath.melee = 0
                }

                if (noPath.range && performance.now() - noPath.range > 5000) {
                    noPath.range = 0
                }

                ensureMovement()

                const distance = Math.entityDistance(bot.bot.entity.position.offset(0, bot.bot.entity.eyeHeight ?? 1.6, 0), target)

                if (args.useMelee && !noPath.melee && (distance <= config.attack.distanceToUseRangeWeapons || !args.useBow)) {
                    if (distance > 4) {
                        reequipMeleeWeapon = true
                        isGoalChanged = movementState !== 'goto-melee'
                        movementState = 'goto-melee'
                        continue
                    }

                    if (movementState !== 'none') {
                        bot.bot.pathfinder.stop()
                    }
                    movementState = 'none'

                    {
                        const newGoal = {
                            ...movementGoal,
                        }
                        if ('targets' in args) {
                            for (const otherTarget of Object.entries(args.targets)) {
                                if (String(otherTarget[0]) === String(target.id)) continue
                                // @ts-ignore
                                newGoal[`avoid-${otherTarget[0]}`] = bot.bot.movement.heuristic.new('proximity')
                                    .target(otherTarget[1].position)
                                    .avoid(true)
                            }
                        }

                        movementGoal.proximity
                            .target(target.position)
                            .avoid(distance < 3)
                        bot.bot.movement.setGoal(newGoal)
                        const yaw = bot.bot.movement.getYaw(160, 15, 2)
                        bot.bot.freemotion.moveTowards(yaw)
                        bot.bot.setControlState('sprint', true)
                        const rotation = Math.rotationToVectorRad(0, yaw)
                        /** @type {import('prismarine-world').RaycastResult | null} */
                        const ray = bot.bot.world.raycast(
                            bot.bot.entity.position.offset(0, 0.6, 0),
                            rotation,
                            bot.bot.controlState.sprint ? 2 : 1)
                        if (ray) { bot.bot.jumpQueued = true }
                    }

                    if (reequipMeleeWeapon) {
                        if (args.useMeleeWeapon) {
                            yield* equipMeleeWeapon(target.name)
                        } else {
                            if (bot.bot.inventory.slots[bot.bot.getEquipmentDestSlot('hand')]) {
                                yield* wrap(bot.bot.unequip('hand'), args.interrupt)
                            }
                        }
                        reequipMeleeWeapon = false
                    }

                    shield = bot.searchInventoryItem(null, 'shield')
                    if (shield) {
                        if (!bot.holds('shield', true)) {
                            yield* wrap(bot.bot.equip(shield.type, 'off-hand'), args.interrupt)
                        }
                        bot.bot.lookAt(target.position.offset(0, target.height, 0), true)
                    }

                    const extraCooldown = 40
                    const now = performance.now()

                    if (bot.bot.entity.onGround &&
                        bot.bot.blocks.at(bot.bot.entity.position.offset(0, -0.5, 0))?.name !== 'farmland' &&
                        now + Minecraft.general.jumpTotalTime > cooldownEndAt + extraCooldown) {
                        bot.bot.jumpQueued = true
                    }

                    if (now <= cooldownEndAt + extraCooldown) {
                        continue
                    }

                    if (bot.env.isEntityHurting(target)) {
                        continue
                    }

                    bot.bot.attack(target)
                    bot.leftHand.isActivated = false
                    cooldownEndAt = now + cooldown
                    bot.env.recordEntityHurt(target)

                    activateShield(shield)

                    continue
                }

                const isProjectileImmune = (
                    (target.name === 'shulker' && !target.metadata[17])
                )

                if (!isProjectileImmune && args.useBow && bot.bot.hawkEye && (distance > config.attack.distanceToUseRangeWeapons || !args.useMelee || noPath.melee) && target.name !== 'enderman') {
                    const weapon = searchRangeWeapon(bot)

                    if (weapon && weapon.ammo > 0) {
                        deactivateShield(shield)

                        let grade = getGrade(target, weapon.weapon)
                        if (!grade) {
                            reequipMeleeWeapon = true
                            goalHawkeye._weapon = weapon.weapon
                            goalHawkeye._target = target
                            isGoalChanged = movementState !== 'goto-range'
                            movementState = 'goto-range'
                            continue
                        }

                        movementState = 'none'

                        if (!isItemEquals(bot.bot.heldItem, weapon.item)) yield* wrap(bot.bot.equip(weapon.item, 'hand'), args.interrupt)
                        // @ts-ignore
                        cooldown = 1 / (bot.bot.entity.attributes['minecraft:generic.attack_speed'] ?? 4)
                        cooldownEndAt = performance.now() + cooldown

                        if (weapon.weapon === Weapons.crossbow) {
                            if (!isCrossbowCharged(weapon.item)) {
                                bot.activateHand('right')
                                yield* sleepG(Math.max(50, weapon.chargeTime))
                                bot.deactivateHand()
                            }

                            if (target.velocity.y < -0.1) {
                                reequipMeleeWeapon = true
                                continue
                            }

                            grade = getGrade(target, weapon.weapon)
                            if (!grade || grade.blockInTrayect) {
                                reequipMeleeWeapon = true
                                continue
                            }

                            const t = trajectoryTime(grade.arrowTrajectoryPoints, weaponsProps.crossbow.BaseVo, -0.01) * 50
                            if (bot.env.isEntityHurting(target, performance.now() + t)) {
                                reequipMeleeWeapon = true
                                continue
                            }

                            yield* wrap(bot.bot.look(grade.yaw, grade.pitch, true), args.interrupt)

                            if (target && target.isValid) {
                                bot.env.recordEntityHurt(target, performance.now() + t)
                                bot.activateHand('right')
                                // yield* sleepTicks()
                                bot.deactivateHand()
                                // yield* sleepTicks()
                            }
                        } else if (weapon.weapon === Weapons.egg ||
                            weapon.weapon === Weapons.snowball) {
                            if (target.velocity.y < -0.1) {
                                reequipMeleeWeapon = true
                                continue
                            }

                            yield* wrap(bot.bot.look(grade.yaw, grade.pitch, true), args.interrupt)
                            if (bot.bot.supportFeature('useItemWithOwnPacket')) {
                                bot.bot._client.write('use_item', {
                                    hand: 0
                                })
                            }
                        } else if (weapon.weapon === Weapons.bow) {
                            if (target.velocity.y < -0.1) {
                                reequipMeleeWeapon = true
                                continue
                            }

                            // let t = trajectoryTime(grade.arrowTrajectoryPoints, weaponsProps.bow.BaseVo, -0.01) * 50

                            // if (bot.env.isEntityHurting(target, performance.now() + chargeTime + t)) {
                            //     reequipMeleeWeapon = true
                            //     continue
                            // }

                            bot.activateHand('right')
                            yield* sleepG(weapon.chargeTime)

                            if (!target || !target.isValid || target.velocity.y < -0.1) {
                                if (!(yield* bot.clearMainHand())) {
                                    console.warn(`[Bot "${bot.username}"] Unnecessary shot`)
                                }
                            }

                            grade = getGrade(target, weapon.weapon)
                            if (!grade || grade.blockInTrayect) {
                                if (!(yield* bot.clearMainHand())) {
                                    console.warn(`[Bot "${bot.username}"] Unnecessary shot`)
                                }
                                reequipMeleeWeapon = true
                                continue
                            }

                            yield* wrap(bot.bot.look(grade.yaw, grade.pitch, true), args.interrupt)
                            bot.deactivateHand()
                            // t = trajectoryTime(grade.arrowTrajectoryPoints, weaponsProps.bow.BaseVo, -0.01) * 50
                            // bot.env.recordEntityHurt(target, performance.now() + t)
                            yield* sleepTicks(2)
                        } else {
                            console.warn(`[Bot "${bot.username}"] Unknown range weapon ${weapon.weapon}`)
                        }
                        continue
                    }
                }

                if (target && target.isValid) {
                    isGoalChanged = movementState !== 'goto'
                    movementState = 'goto'
                    reequipMeleeWeapon = true
                    continue
                }
            }
            return true
        } finally {
            args.interrupt.off(onInterrupt)
            cleanup()
        }
    },
    id: function(args) {
        if ('target' in args) {
            return `attack-${args.target.id}`
        } else {
            const ids = Object.keys(args.targets)
            if (ids.length === 0) {
                return `attack-null`
            }
            return `attack-${ids.reduce((prev, curr) => prev + '_' + curr)}`
        }
    },
    humanReadableId: function(args) {
        if ('target' in args) {
            return `Attack ${args.target.displayName ?? args.target.name ?? 'something'}`
        } else {
            return `Attack multiple targets [${Object.values(args.targets).map(v => `"${v.displayName ?? v.name ?? v.id}"`).join(', ')}]`
        }
    },
    definition: 'attack',
    can: function(bot, entity, permissions) {
        if (!permissions.useBow && !permissions.useMelee) { return false }

        if (!isAlive(entity)) { return false }

        const distance = Math.entityDistance(bot.bot.entity.position.offset(0, 1.6, 0), entity)

        if (permissions.useMelee && (distance <= config.attack.distanceToUseRangeWeapons || !permissions.useBow)) {
            return distance <= 6
        }

        if (permissions.useBow && (distance > config.attack.distanceToUseRangeWeapons || !permissions.useMelee) && entity.name !== 'enderman') {
            const weapon = searchRangeWeapon(bot)

            if (!weapon || weapon.ammo <= 0) { return false }

            const grade = bot.bot.hawkEye.getMasterGrade({
                isValid: false,
                position: entity.position.offset(0, entity.height / 2, 0),
            }, new Vec3(0, 0, 0), weapon.weapon)

            return grade && !grade.blockInTrayect
        }

        return true
    },
    isCrossbowCharged: isCrossbowCharged,
    resolveRangeWeapon: resolveRangeWeapon,
}
