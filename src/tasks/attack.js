const { Entity } = require('prismarine-entity')
const { wrap, sleepG, sleepTicks } = require('../utils/tasks')
const { Weapons } = require('minecrafthawkeye')
const { Item } = require('prismarine-item')
const goto = require('./goto')
const { Vec3 } = require('vec3')
const Minecraft = require('../minecraft')
const { EntityPose } = require('../entity-metadata')
const TextDisplay = require('../text-display')
const { entityDistance, entityDistanceSquared } = require('../utils/math')
const Debug = require('../debug')

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

/**
 * @typedef {{
*   name: string;
*   damage: number;
*   speed: number;
*   cooldown: number;
*   level: typeof toolLevels[number];
* }} MeleeWeapon
*/

/**
 * @type {ReadonlyArray<MeleeWeapon>}
 */
const meleeWeapons = (/** @type {Array<MeleeWeapon>} */ ([
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
])).sort((a, b) => {
    const aScore = a.damage * a.speed
    const bScore = b.damage * b.speed

    if (aScore === bScore) {
        const aLevel = toolLevels.indexOf(a.level)
        const bLevel = toolLevels.indexOf(b.level)
        return aLevel - bLevel
    }

    return bScore - aScore
})

const distanceToUseRangeWeapons = 12

/**
 * @typedef {{
 *   useMelee: boolean;
 *   useMeleeWeapon: boolean;
 *   useBow: boolean;
 * }} PermissionArgs
 */

/**
 * @param {Weapons} item
 * @returns {number}
 */
function getChargeTime(item) {
    switch (item) {
        case 'bow':
            return 1200
        case 'crossbow':
            return 1300 // 1250
        default:
            return 0
    }
}

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
 * @param {import('../bruh-bot')} bot
 * @returns {{
 *   item: import('prismarine-item').Item;
 *   weapon: Weapons;
 *   ammo: number;
 * } | null}
 */
function searchRangeWeapon(bot) {
    const keys = Object.values(Weapons)

    for (const weapon of keys) {
        const found = bot.searchInventoryItem(null, weapon)
        if (!found) { continue }

        let ammo

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

        if (ammo === 0) {
            continue
        }

        return {
            item: found,
            weapon: weapon,
            ammo: ammo,
        }
    }

    return null
}

/**
 * @param {import('../bruh-bot')} bot
 * @returns {(MeleeWeapon & { item: Item }) | null}
 */
function bestMeleeWeapon(bot) {
    for (const meleeWeapon of meleeWeapons) {
        const item = bot.searchInventoryItem(null, meleeWeapon.name)
        if (!item) { continue }

        return {
            ...meleeWeapon,
            item: item,
        }
    }
    return null
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
 * @type {import('../task').TaskDef<boolean, ({
 *   target: Entity;
 * } | {
 *   targets: Record<number, Entity>;
 * }) & PermissionArgs> & {
 *   can: (bot: import('../bruh-bot'), entity: Entity, permissions: PermissionArgs) => boolean;
 * }}
 */
module.exports = {
    task: function*(bot, args) {
        if (!args.useBow && !args.useMelee) {
            throw `Every possible way of attacking is disabled`
        }

        let lastPunch = 0
        const hurtTime = Minecraft.general.hurtTime
        let cooldown = hurtTime

        /** @type {(MeleeWeapon & { item: Item }) | null}*/
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

        const equipMeleeWeapon = function*() {
            meleeWeapon = bestMeleeWeapon(bot)
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
            const distance = entityDistance(bot.bot.entity.position.offset(0, 1.6, 0), entity)

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
            }

            /** `0..(hurtAt.length)` */
            let dangerScore = 0
            for (const hurtAt of (bot.memory.hurtBy[entity.id] ?? [])) {
                const deltaTime = performance.now() - hurtAt
                const hurtScore = Math.max(0, (10000 - deltaTime) / 10000)
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
            goto.setOptions(bot, options)
            // @ts-ignore
            if (bot.bot.pathfinder.goal?.['name'] === goal.name) {
                return
            }
            bot.bot.pathfinder.setGoal(goal, true)
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

        // console.log(`[Bot "${bot.username}"] Attack ...`)

        if (args.useMelee) {
            if (args.useMeleeWeapon) {
                yield* equipMeleeWeapon()
            } else {
                // console.log(`[Bot "${bot.username}"] Attacking with bare hands`)
                if (bot.bot.inventory.slots[bot.bot.getEquipmentDestSlot('hand')]) {
                    yield* wrap(bot.bot.unequip('hand'))
                }
            }
        }

        let reequipMeleeWeapon = false
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
                    const d = entityDistanceSquared(node, entity)
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

                const distance = entityDistance(bot.bot.entity.position.offset(0, 1.6, 0), target)

                if (args.useMelee && (distance <= distanceToUseRangeWeapons || !args.useBow)) {
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
                        // console.log(`[Bot "${bot.username}"] Reequipping melee weapon ...`)
                        yield* equipMeleeWeapon()
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

                if (args.useBow && (distance > distanceToUseRangeWeapons || !args.useMelee) && target.name !== 'enderman') {
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
                                const chargeTime = getChargeTime(weapon.weapon)
                                yield* sleepG(Math.max(100, chargeTime))
                                bot.deactivateHand()
                                // console.log(`[Bot "${bot.username}"] Crossbow charged`)
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
                            yield* wrap(bot.bot.look(grade.yaw, grade.pitch, true))
                            if (bot.bot.supportFeature('useItemWithOwnPacket')) {
                                bot.bot._client.write('use_item', {
                                    hand: 0
                                })
                            }
                            bot.env.entityHurtTimes[target.id] = performance.now() - 50 - 50
                        } else if (weapon.weapon === Weapons.bow) {
                            // console.log(`[Bot "${bot.username}"] Pulling bow`)
                            bot.activateHand('right')
                            const chargeTime = getChargeTime(weapon.weapon)
                            yield* sleepG(Math.max(hurtTime, chargeTime))

                            if (!target || !target.isValid) {
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

                // if (distance > distanceToUseRangeWeapons && !searchRangeWeapon(bot)) {
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
            return `Attack multiple targets`
        }
    },
    definition: 'attack',
    can: function(bot, entity, permissions) {
        if (!permissions.useBow && !permissions.useMelee) { return false }

        if (!isAlive(entity)) { return false }

        const distance = entityDistance(bot.bot.entity.position.offset(0, 1.6, 0), entity)

        if (permissions.useMelee && (distance <= distanceToUseRangeWeapons || !permissions.useBow)) {
            return distance <= 6
        }

        if (permissions.useBow && (distance > distanceToUseRangeWeapons || !permissions.useMelee) && entity.name !== 'enderman') {
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
}
