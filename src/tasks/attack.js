'use strict'

const { Entity } = require('prismarine-entity')
const { wrap, sleepG, sleepTicks } = require('../utils/tasks')
const Weapons = require('minecrafthawkeye/dist/types/index').Weapons
const { Item } = require('prismarine-item')
const goto = require('./goto')
const { Vec3 } = require('vec3')
const Minecraft = require('../minecraft')
const { EntityPose } = require('../entity-metadata')
const TextDisplay = require('../text-display')
const Debug = require('../debug')
const { resolveEntityAttribute } = require('../utils/other')
const config = require('../config')

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
            if (enchants['quick_charge']) {
                const quickCharge = enchants['quick_charge']
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

            // case hawkeye.Weapons.egg:
            case Weapons.snowball:
                // case hawkeye.Weapons.trident:
                ammo = bot.bot.inventory.count(found.type, null)
                break

            default: continue
        }

        if (ammo === 0) { continue }

        let resolved = resolveRangeWeapon(found)
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
            throw `Every possible way of attacking is disabled`
        }

        if (!bot.bot.hawkEye) {
            new Promise(resolve => {
                // @ts-ignore
                bot.bot.loadPlugin(require('minecrafthawkeye').default)
                resolve()
            })
        }

        let lastPunch = 0
        const hurtTime = Minecraft.general.hurtTime
        let cooldown = hurtTime

        /** @type {ReturnType<searchMeleeWeapon> | null}*/
        let meleeWeapon = null
        /** @type {Item | null} */
        let shield = bot.searchInventoryItem(null, 'shield')

        const deactivateShield = function(/** @type {Item | null} */ shield) {
            if (shield && bot.isLeftHandActive) {
                bot.deactivateHand()
                // console.log(`[Bot "${bot.username}"] Shield deactivated`)
                return true
            }
            return false
        }

        const activateShield = function(/** @type {Item | null} */ shield) {
            if (shield && !bot.isLeftHandActive) {
                bot.activateHand('left')
                // console.log(`[Bot "${bot.username}"] Shield activated`)
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

            if (meleeWeapon) {
                if (!holds || holds.type !== meleeWeapon.item.type) {
                    lastPunch = performance.now()
                    yield* wrap(bot.bot.equip(meleeWeapon.item.type, 'hand'))
                }
            } else {
                if (holds) {
                    yield* wrap(bot.bot.unequip('hand'))
                }
            }

            // if (meleeWeapon) {
            //     console.log(`[Bot "${bot.username}"] Melee weapon "${meleeWeapon.name}" equipped`)
            // } else {
            //     console.log(`[Bot "${bot.username}"] No melee weapon found`)
            // }

            cooldown = meleeWeapon ? (meleeWeapon.cooldown * 1000) : hurtTime
        }

        /**
         * @param {Entity} entity
         * @param {(number | { easy: number; normal: number; hard: number; }) | ((entity: import("prismarine-entity").Entity) => number | { easy: number; normal: number; hard: number; }) | ((entity: import("prismarine-entity").Entity) => number | { easy: number; normal: number; hard: number; })} attack
         */
        const resolveAttackDamage = function(entity, attack) {
            if (typeof attack === 'number') { return attack }
            if (typeof attack === 'object') {
                return attack[(bot.bot.game.difficulty === 'peaceful') ? 'easy' : bot.bot.game.difficulty]
            }
            return resolveAttackDamage(entity, attack(entity))
        }

        /**
         * @param {Entity} entity
         */
        const calculateScore = function(entity) {
            const distance = Math.entityDistance(bot.bot.entity.position.offset(0, 1.6, 0), entity)

            const hostile = Minecraft.hostiles[entity.name]

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
                    meleeDamage = resolveAttackDamage(entity, hostile.meleeAttack.damage)
                    meleeDamage /= (hostile.meleeAttack.cooldown ?? 500) / 1000
                    if (distance <= hostile.meleeAttack.range) {
                        activeMeleeDamage = meleeDamage
                    }
                    attackRange = Math.max(attackRange, hostile.meleeAttack.range)
                }
                if (hostile.rangeAttack) {
                    rangeDamage = resolveAttackDamage(entity, hostile.rangeAttack.damage)
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
            for (const hurtAt of (bot.memory.hurtBy[entity.id] ?? [])) {
                const deltaTime = performance.now() - hurtAt
                const hurtScore = Math.max(0, (hurtByMemoryTime - deltaTime) / hurtByMemoryTime)
                dangerScore += hurtScore
            }

            if (entity.name === 'shulker' &&
                !entity.metadata[17]) {
                return 0.01
            }

            return (
                attackRangeScore +
                healthScore +
                dangerScore
            ) *
                damageScore +
                activeDamageScore
        }

        const ensureMovement = function() {
            // console.log(`[Bot "${bot.username}"] Set attacking movement`)
            const options = {
                timeout: 100,
                searchRadius: 5,
                sprint: true,
                movements: bot.restrictedMovements,
                lookAtTarget: false,
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
            // @ts-ignore
            if (bot.bot.pathfinder.goal?.['name'] === goal.name &&
                !isGoalChanged) {
                return
            }
            goto.setOptions(bot, options)
            bot.bot.pathfinder.setGoal(goal, false)
        }

        const stopMovement = function() {
            // @ts-ignore
            if (bot.bot.pathfinder.goal?.['name'] !== goal.name) {
                return
            }
            bot.bot.pathfinder.stop()
        }

        const saveMyArrow = () => {
            const arrow = bot.bot.nearestEntity((/** @type {Entity} */ v) => {
                if (v.name !== 'arrow') { return false }
                const velocity = v.velocity.clone().normalize()
                const dir = v.position.clone().subtract(bot.bot.entity.position).normalize()
                const dot = velocity.dot(dir)
                if (dot < 0) { return false }
                return true
            })
            if (arrow) {
                // console.log(`[Bot "${bot.username}"] Arrow saved`)
                bot.memory.myArrows.push(arrow.id)
            }
        }

        const timeUntilCriticalHit = () => {
            const blockBelow = bot.bot.world.getBlock(bot.bot.entity.position.floored().offset(0, -0.5, 0))
            const initialVelocity =
                bot.bot.entity.onGround
                    ? Math.fround(0.42) * ((blockBelow && blockBelow.name === 'honey_block') ? bot.bot.physics.honeyblockJumpSpeed : 1)
                    : bot.bot.entity.velocity.y
            // if (bot.bot.entity.jumpBoost > 0) {
            //     initialVelocity += 0.1 * bot.bot.entity.jumpBoost
            // }
            const targetVelocity = 0
            const acceleration = -bot.bot.physics.gravity
            const t = (targetVelocity - initialVelocity) / acceleration
            return t * 1000
        }

        let noPath = {
            range: 0,
            melee: 0,
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

        bot.bot.on('path_update', onPathUpdate)

        // console.log(`[Bot "${bot.username}"] Attack ...`)

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

        const goalHawkeye = new goto.GoalHawkeye(null, null, (from, to, weapon) => {
            const savedBotPosition = bot.bot.entity.position
            bot.bot.entity.position = from
            if (!bot.bot.hawkEye) { throw new Error(`Plugin hawekeye not loaded yet`) }
            const masterGrade = bot.bot.hawkEye.getMasterGrade({
                position: to,
                isValid: false,
            }, new Vec3(0, 0, 0), weapon)
            bot.bot.entity.position = savedBotPosition
            return masterGrade
        })

        /**
         * @type {import('mineflayer-pathfinder/lib/goals').GoalBase & {
         *   rangeSq: number;
         *   getEntities: () => Array<Entity>;
         *   getEntityPositions: () => Array<Vec3>;
         *   lastEntityPositions: Array<Vec3>;
         *   name: 'attack_goal';
         * }}
         */
        const goal = {
            rangeSq: Math.sqrt(3),
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
                    if (d <= this.rangeSq) { return false }
                }
                if (target) {
                    switch (movementState) {
                        case 'goto': {
                            const d = node.distanceTo(target.position)
                            return d < 3.5
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

        try {
            while (true) {
                yield

                target = null
                targetScore = 0
                if ('target' in args) {
                    target = args.target
                    if (!isAlive(target)) { break }
                    targetScore = calculateScore(target)

                    if (Debug.enabled) {
                        const label = TextDisplay.ensure(bot.commands, `attack-${target.id}`)
                        label.lockOn(target.id)
                        label.text = { text: `${targetScore.toFixed(2)}` }
                    }

                    if (bot.env.entityHurtTimes[target.id] &&
                        (performance.now() - bot.env.entityHurtTimes[target.id]) < hurtTime) {
                        continue
                    }
                } else {
                    const targetIds = Object.keys(args.targets).map(v => Number.parseInt(v))
                    if (targetIds.length === 0) { break }
                    for (const id of targetIds) {
                        const candidate = args.targets[id]
                        if (!isAlive(candidate)) {
                            delete args.targets[id]
                            continue
                        }

                        if (bot.env.entityHurtTimes[candidate.id] &&
                            (performance.now() - bot.env.entityHurtTimes[candidate.id]) < hurtTime) {
                            continue
                        }

                        const candidateScore = calculateScore(candidate)

                        if (Debug.enabled) {
                            const label = TextDisplay.ensure(bot.commands, `attack-${candidate.id}`)
                            label.lockOn(candidate.id)
                            label.text = { text: `${candidateScore.toFixed(2)}` }
                        }

                        if (!target || candidateScore > targetScore) {
                            targetScore = candidateScore
                            target = candidate
                        }
                    }

                    if (!isAlive(target)) { continue }
                }

                if (noPath.melee && performance.now() - noPath.melee > 5000) {
                    noPath.melee = 0
                }

                if (noPath.range && performance.now() - noPath.range > 5000) {
                    noPath.range = 0
                }

                ensureMovement()

                // {
                //     const now = performance.now()
                //     const timeUntilPunch = (cooldown - (now - lastPunch))
                //     const label = TextDisplay.ensure(bot.commands, 'attack-label')
                //     label.lockOn(bot.bot.entity.id)
                //     label.text = { text: `${movementState}` }
                //     console.log(movementState)
                // }

                // console.log(goal.isEnd(bot.bot.entity.position))

                // yield* goto.task(bot, {
                //     goal: new goals.GoalCompositeAll(('target' in args ? [args.target] : Object.values(args.targets)).filter(v => v && v.isValid).map(v => {
                //         return new goals.GoalInvert(new goto.GoalEntity(v, 2))
                //     })),
                //     options: {
                //         timeout: 100,
                //         searchRadius: 5,
                //         sprint: true,
                //         movements: bot.restrictedMovements,
                //     },
                // })

                // console.log(`[Bot "${bot.username}"] Attack ${target.name}`)

                if (target.name === 'boat') {
                    cooldown = 80
                } else {
                    cooldown = hurtTime
                }

                if (Debug.enabled) {
                    TextDisplay.registry[`attack-${target.id}`].text = { text: `${targetScore.toFixed(2)}`, color: 'red' }
                }

                const distance = Math.entityDistance(bot.bot.entity.position.offset(0, 1.6, 0), target)

                if (args.useMelee && !noPath.melee && (distance <= config.attack.distanceToUseRangeWeapons || !args.useBow)) {
                    if (distance > 4) {
                        // console.log(`[Bot "${bot.username}"] Target too far away, moving closer ...`)
                        // yield* goto.task(bot, {
                        //     entity: target,
                        //     distance: 4,
                        //     timeout: 500,
                        //     retryCount: 0,
                        //     sprint: true,
                        // })
                        reequipMeleeWeapon = true
                        isGoalChanged = movementState !== 'goto-melee'
                        movementState = 'goto-melee'
                        continue
                    }

                    if (movementState !== 'none') {
                        bot.bot.pathfinder.stop()
                    }
                    movementState = 'none'

                    if (reequipMeleeWeapon) {
                        // console.log(`[Bot "${bot.username}"] Equipping melee weapon ...`)
                        if (args.useMeleeWeapon) {
                            yield* equipMeleeWeapon(target.name)
                        } else {
                            // console.log(`[Bot "${bot.username}"] Attacking with bare hands`)
                            if (bot.bot.inventory.slots[bot.bot.getEquipmentDestSlot('hand')]) {
                                yield* wrap(bot.bot.unequip('hand'))
                            }
                        }
                        // console.log(`[Bot "${bot.username}"] Best melee weapon: "${meleeWeapon?.item?.name ?? 'null'}"`)
                        reequipMeleeWeapon = false
                    }

                    shield = bot.searchInventoryItem(null, 'shield')
                    if (shield) {
                        if (!bot.holds('shield', true)) {
                            yield* wrap(bot.bot.equip(shield.type, 'off-hand'))
                        }
                        bot.bot.lookAt(target.position.offset(0, target.height, 0), true)
                        // yield* wrap(bot.bot.lookAt(target.position.offset(0, target.height, 0), true))
                    }

                    const now = performance.now()

                    const timeUntilPunch = (cooldown - (now - lastPunch))

                    if (timeUntilPunch <= 0 && (
                        bot.bot.entity.onGround ||
                        bot.bot.entity.isInWater ||
                        bot.bot.entity.velocity.y <= -0.3
                    )) {
                        bot.bot.attack(target)
                        // @ts-ignore
                        bot._isLeftHandActive = false
                        lastPunch = now
                        bot.env.entityHurtTimes[target.id] = performance.now()

                        activateShield(shield)
                    } else {
                        if (bot.bot.blockAt(bot.bot.entity.position.offset(0, -0.5, 0))?.name !== 'farmland') {
                            bot.bot.setControlState('jump', true)
                            bot.bot.setControlState('jump', false)
                        }
                    }

                    continue
                }

                if (args.useBow && bot.bot.hawkEye && (distance > config.attack.distanceToUseRangeWeapons || !args.useMelee || noPath.melee) && target.name !== 'enderman') {
                    const weapon = searchRangeWeapon(bot)

                    const getGrade = () => {
                        return bot.bot.hawkEye.getMasterGrade({
                            isValid: false,
                            position: target.position.offset(0, target.height / 2, 0),
                        }, new Vec3(0, 0, 0), weapon.weapon)
                    }

                    if (weapon && weapon.ammo > 0) {
                        deactivateShield(shield)

                        let grade = getGrade()
                        if (!grade || grade.blockInTrayect) {
                            // console.log(`[Bot "${bot.username}"] Target too far away, moving closer ...`)
                            // yield* goto.task(bot, {
                            //     entity: target,
                            //     distance: distance - 2,
                            //     timeout: 1000,
                            //     retryCount: 0,
                            //     sprint: true,
                            // })
                            reequipMeleeWeapon = true
                            goalHawkeye.weapon = weapon.weapon
                            goalHawkeye.target = target.position
                            isGoalChanged = movementState !== 'goto-range'
                            movementState = 'goto-range'
                            continue
                        }

                        movementState = 'none'

                        yield* wrap(bot.bot.equip(weapon.item, 'hand'))

                        if (weapon.weapon === Weapons.crossbow) {
                            const isCharged = isCrossbowCharged(weapon.item)

                            if (!isCharged) {
                                // (`[Bot "${bot.username}"] Charging crossbow`)
                                bot.activateHand('right')
                                const chargeTime = weapon.chargeTime
                                yield* sleepG(Math.max(100, chargeTime))
                                bot.deactivateHand()
                                // console.log(`[Bot "${bot.username}"] Crossbow charged`)
                            }

                            if (target.velocity.y < -0.1) {
                                reequipMeleeWeapon = true
                                continue
                            }

                            grade = getGrade()
                            if (!grade || grade.blockInTrayect) {
                                // console.log(`[Bot "${bot.username}"] Trajectory changed while charging crossbow`)
                                reequipMeleeWeapon = true
                                continue
                            }
                            yield* wrap(bot.bot.look(grade.yaw, grade.pitch, true))

                            if (target && target.isValid) {
                                bot.activateHand('right')
                                yield* sleepTicks()
                                bot.deactivateHand()
                                yield* sleepTicks(2)
                                saveMyArrow()
                            }
                        } else if (weapon.weapon === Weapons.egg ||
                            weapon.weapon === Weapons.snowball) {
                            if (target.velocity.y < -0.1) {
                                reequipMeleeWeapon = true
                                continue
                            }

                            yield* wrap(bot.bot.look(grade.yaw, grade.pitch, true))
                            if (bot.bot.supportFeature('useItemWithOwnPacket')) {
                                bot.bot._client.write('use_item', {
                                    hand: 0
                                })
                            }
                            bot.env.entityHurtTimes[target.id] = performance.now() - 50 - 50
                        } else if (weapon.weapon === Weapons.bow) {
                            if (target.velocity.y < -0.1) {
                                reequipMeleeWeapon = true
                                continue
                            }

                            // console.log(`[Bot "${bot.username}"] Pulling bow`)
                            bot.activateHand('right')
                            const chargeTime = weapon.chargeTime
                            yield* sleepG(Math.max(hurtTime, chargeTime))

                            if (!target || !target.isValid || target.velocity.y < -0.1) {
                                if (!(yield* bot.clearMainHand())) {
                                    console.warn(`[Bot "${bot.username}"] Unnecessary shot`)
                                }
                            }

                            grade = getGrade()
                            if (!grade || grade.blockInTrayect) {
                                // console.log(`[Bot "${bot.username}"] Trajectory changed while charging bow`)
                                if (!(yield* bot.clearMainHand())) {
                                    console.warn(`[Bot "${bot.username}"] Unnecessary shot`)
                                }
                                reequipMeleeWeapon = true
                                continue
                            }

                            yield* wrap(bot.bot.look(grade.yaw, grade.pitch, true))
                            bot.deactivateHand()
                            yield* sleepTicks(2)
                            saveMyArrow()
                        } else {
                            console.warn(`[Bot "${bot.username}"] Unknown range weapon ${weapon.weapon}`)
                        }
                        continue
                    }
                }

                // if (distance > config.distanceToUseRangeWeapons && !searchRangeWeapon(bot)) {
                //     console.warn(`[Bot "${bot.username}"] Target too far away, stop attacking it`)
                //     if ('target' in args) {
                //         return false
                //     } else {
                //         delete args.targets[target.id]
                //         if (Object.keys(args.targets).length === 0) {
                //             return false
                //         }
                //     }
                //     continue
                // }

                if (target && target.isValid) {
                    // console.log(`[Bot "${bot.username}"] Target too far away, moving closer ...`)
                    // yield* goto.task(bot, {
                    //     entity: target,
                    //     distance: 4,
                    //     timeout: 500,
                    //     retryCount: 0,
                    //     sprint: true,
                    // })
                    isGoalChanged = movementState !== 'goto'
                    movementState = 'goto'
                    reequipMeleeWeapon = true
                    continue
                }
            }
            return true
        } finally {
            bot.bot.off('path_update', onPathUpdate)
            if (bot.isLeftHandActive) {
                bot.deactivateHand()
            }
            stopMovement()
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
