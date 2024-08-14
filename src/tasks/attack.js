const { Entity } = require('prismarine-entity')
const { wrap, sleepG, sleepTicks } = require('../utils/tasks')
const { Weapons } = require('minecrafthawkeye')
const { Item } = require('prismarine-item')
const { goals } = require('mineflayer-pathfinder')
const goto = require('./goto')
const { Vec3 } = require('vec3')
const MC = require('../mc')
const { EntityPose } = require('../entity-metadata')
const TextDisplay = require('../text-display')

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
 */ // @ts-ignore
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
        const searchFor = bot.mc.data.itemsByName[weapon]?.id

        if (!searchFor) { continue }

        const found = bot.bot.inventory.findInventoryItem(searchFor, null, false)
        if (!found) { continue }

        let ammo

        switch (weapon) {
            case Weapons.bow:
            case Weapons.crossbow:
                ammo = bot.bot.inventory.count(bot.mc.data.itemsByName['arrow'].id, null)
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
        const item = bot.searchItem(meleeWeapon.name)
        if (!item) { continue }
        return {
            ...meleeWeapon,
            item: item,
        }
    }
    return null
}

/**
 * @type {import('../task').TaskDef<boolean, ({
 *   target: Entity;
 * } | {
 *   targets: Record<number, Entity>;
 * }) & PermissionArgs>}
 */
module.exports = {
    task: function*(bot, args) {
        if (!args.useBow && !args.useMelee) {
            throw `Every possible way of attacking is disabled`
        }

        let lastPunch = 0
        const hurtTime = bot.mc.data2.general.hurtTime
        let cooldown = hurtTime

        /** @type {(MeleeWeapon & { item: Item }) | null}*/
        let meleeWeapon = null
        /** @type {Item | null} */
        let shield = bot.searchItem('shield')

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

            if (meleeWeapon) {
                console.log(`[Bot "${bot.username}"] Melee weapon "${meleeWeapon.name}" equipped`)
            } else {
                console.log(`[Bot "${bot.username}"] No melee weapon found`)
            }

            cooldown = meleeWeapon ? (meleeWeapon.cooldown * 1000) : hurtTime
        }

        /**
         * @param {Entity} target 
         */
        const startMoving = function*(target) {
            if (bot.bot.pathfinder.goal &&
                bot.bot.pathfinder.goal instanceof goals.GoalFollow &&
                bot.bot.pathfinder.goal.entity?.id == target?.id) {
                return
            }
            if (bot.bot.pathfinder.goal) {
                bot.bot.pathfinder.stop()
            }
            bot.bot.pathfinder.setGoal(new goals.GoalFollow(target, 3))
        }

        /**
         * @param {Entity} target 
         */
        const stopMoving = (target) => {
            if (bot.bot.pathfinder.goal &&
                bot.bot.pathfinder.goal instanceof goals.GoalFollow &&
                bot.bot.pathfinder.goal.entity?.id == target?.id) {
                bot.bot.pathfinder.stop()
            }
        }

        console.log(`[Bot "${bot.username}"] Attack ...`)

        if (args.useMelee) {
            if (args.useMeleeWeapon) {
                yield* equipMeleeWeapon()
            } else {
                console.log(`[Bot "${bot.username}"] Attacking with bare hands`)
                if (bot.bot.inventory.slots[bot.bot.getEquipmentDestSlot('hand')]) {
                    yield* wrap(bot.bot.unequip('hand'))
                }
            }
        }

        /**
         * @param {Entity} entity
         */
        const isAlive = function(entity) {
            if (!entity) { return false }
            if (!entity.isValid) { return false }
            if (entity.metadata[6] === EntityPose.DYING) { return false }
            return true
        }

        let reequipMeleeWeapon = false

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
            const distance = bot.bot.entity.position.distanceTo(entity.position)

            const hostile = MC.hostiles[entity.name]

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

            return (
                attackRangeScore +
                healthScore +
                dangerScore
            ) *
            damageScore +
            activeDamageScore
        }

        try {
            while (true) {
                yield
                /**
                 * @type {number}
                 */
                let targetScore = 0
                /**
                 * @type {Entity | null}
                 */
                let target = null
                if ('target' in args) {
                    target = args.target
                    if (!isAlive(target)) { break }
                    targetScore = calculateScore(target)

                    const label = TextDisplay.ensure(bot.commands, `attack-${target.id}`)
                    label.lockOn(target.id)
                    label.text = { text: `${targetScore.toFixed(2)}` }

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

                        const label = TextDisplay.ensure(bot.commands, `attack-${candidate.id}`)
                        label.lockOn(candidate.id)
                        label.text = { text: `${candidateScore.toFixed(2)}` }

                        if (!target || candidateScore > targetScore) {
                            targetScore = candidateScore
                            target = candidate
                        }
                    }

                    if (!isAlive(target)) { continue }
                }

                yield* goto.task(bot, {
                    goal: new goals.GoalCompositeAll(('target' in args ? [args.target] : Object.values(args.targets)).filter(v => v && v.isValid).map(v => {
                        return new goals.GoalInvert(new goto.GoalEntity(v, 2))
                    })),
                    options: {
                        timeout: 100,
                        searchRadius: 5,
                    },
                })

                console.log(`[Bot "${bot.username}"] Attack ${target.name}`)

                if (target.name === 'boat') {
                    cooldown = 80
                } else {
                    cooldown = hurtTime
                }

                TextDisplay.registry[`attack-${target.id}`].text = { text: `${targetScore.toFixed(2)}`, color: 'red' }

                const distance = bot.bot.entity.position.distanceTo(target.position)

                if (args.useMelee && (distance <= distanceToUseRangeWeapons || !args.useBow)) {
                    if (distance > 6) {
                        console.log(`[Bot "${bot.username}"] Target too far away, moving closer ...`)
                        yield* goto.task(bot, {
                            entity: target,
                            distance: 5,
                            timeout: 500,
                        })
                        reequipMeleeWeapon = true
                        continue
                    }

                    stopMoving(target)

                    if (reequipMeleeWeapon) {
                        console.log(`[Bot "${bot.username}"] Reequipping melee weapon ...`)
                        shield = bot.searchItem('shield')
                        yield* equipMeleeWeapon()
                        console.log(`[Bot "${bot.username}"] Best melee weapon: "${meleeWeapon?.item?.name ?? 'null'}"`)
                        reequipMeleeWeapon = false
                    }

                    if (shield) {
                        if (!bot.holds('shield', true)) {
                            yield* wrap(bot.bot.equip(shield.type, 'off-hand'))
                        }
                        yield* wrap(bot.bot.lookAt(target.position.offset(0, target.height, 0), true))
                    }

                    const now = performance.now()
                    if (now - lastPunch > cooldown) {
                        if (deactivateShield(shield)) {
                            yield
                        }

                        bot.bot.attack(target)
                        lastPunch = now
                        bot.env.entityHurtTimes[target.id] = performance.now()

                        yield

                        activateShield(shield)
                    }

                    continue
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
                        console.log(`[Bot "${bot.username}"] Arrow saved`)
                        bot.memory.myArrows.push(arrow.id)
                    }
                }

                if (args.useBow && (distance > distanceToUseRangeWeapons || !args.useMelee) && target.name !== 'enderman') {
                    stopMoving(target)
                    deactivateShield(shield)

                    const weapon = searchRangeWeapon(bot)

                    const getGrade = () => {
                        return bot.bot.hawkEye.getMasterGrade({
                            isValid: false,
                            position: target.position.offset(0, target.height / 2, 0),
                        }, new Vec3(0, 0, 0), weapon.weapon)
                    }

                    if (weapon && weapon.ammo > 0) {
                        let grade = getGrade()
                        if (!grade || grade.blockInTrayect) {
                            console.log(`[Bot "${bot.username}"] Target too far away, moving closer ...`)
                            yield* goto.task(bot, {
                                entity: target,
                                distance: distance - 2,
                                timeout: 1000,
                            })
                            reequipMeleeWeapon = true
                            continue
                        }

                        yield* wrap(bot.bot.equip(weapon.item, 'hand'))

                        if (weapon.weapon === Weapons.crossbow) {
                            const isCharged =
                                weapon.item.nbt &&
                                weapon.item.nbt.type === 'compound' &&
                                weapon.item.nbt.value['ChargedProjectiles'] &&
                                weapon.item.nbt.value['ChargedProjectiles'].type === 'list' &&
                                weapon.item.nbt.value['ChargedProjectiles'].value.value.length > 0

                            if (!isCharged) {
                                console.log(`[Bot "${bot.username}"] Charging crossbow`)
                                bot.activateHand('right')
                                const chargeTime = getChargeTime(weapon.weapon)
                                yield* sleepG(Math.max(100, chargeTime))
                                bot.deactivateHand()
                                console.log(`[Bot "${bot.username}"] Crossbow charged`)
                            }

                            grade = getGrade()
                            if (!grade || grade.blockInTrayect) {
                                console.log(`[Bot "${bot.username}"] Trajectory changed while charging crossbow`)
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
                            console.log(`[Bot "${bot.username}"] Pulling bow`)
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
                                console.log(`[Bot "${bot.username}"] Trajectory changed while charging bow`)
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

                if (distance > distanceToUseRangeWeapons && !searchRangeWeapon(bot)) {
                    console.warn(`[Bot "${bot.username}"] Target too far away, stop attacking it`)
                    if ('target' in args) {
                        return false
                    } else {
                        delete args.targets[target.id]
                        if (Object.keys(args.targets).length === 0) {
                            return false
                        }
                    }
                    continue
                }

                if (target && target.isValid) {
                    startMoving(target)
                }
            }
            return true
        } finally {
            if (bot.isLeftHandActive) {
                bot.deactivateHand()
            }
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
    }
}
