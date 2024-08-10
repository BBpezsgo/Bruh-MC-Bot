const { Entity } = require('prismarine-entity')
const { wrap, sleepG } = require('../utils/tasks')
const { Weapons } = require('minecrafthawkeye')
const { Item } = require('prismarine-item')
const MeleeWeapons = require('../melee-weapons')
const { goals } = require('mineflayer-pathfinder')
const goto = require('./goto')
const { Vec3 } = require('vec3')

const distanceToUseRangeWeapons = 12

/**
 * @typedef {{
 *   useMelee: boolean;
 *   useMeleeWeapon: boolean;
 *   useBow: boolean;
 * }} PermissionArgs
 */

/**
 * @type {import('../task').TaskDef<void, ({ target: Entity; } | { targets: Record<number, Entity>; }) & PermissionArgs>}
 */
module.exports = {
    task: function*(bot, args) {
        if (!args.useBow && !args.useMelee) {
            throw `Every possible way of attacking is disabled`
        }
    
        let lastPunch = 0
        const hurtTime = bot.mc.data2.general.hurtTime
        let cooldown = hurtTime
        
        /** @type {(MeleeWeapons.MeleeWeapon & { item: Item }) | null}*/
        let meleeWeapon = null
        /** @type {Item | null} */
        let shield = bot.searchItem('shield')

        const deactivateShield = function(/** @type {Item | null} */ shield) {
            if (shield && bot.isLeftHandActive) {
                bot.deactivateHand()
                // console.log(`[Bot "${bot.bot.username}"] Shield deactivated`)
                return true
            }
            return false
        }
    
        const activateShield = function(/** @type {Item | null} */ shield) {
            if (shield && !bot.isLeftHandActive) {
                bot.activateHand('left')
                // console.log(`[Bot "${bot.bot.username}"] Shield activated`)
                return true
            }
            return false
        }
    
        const equipMeleeWeapon = function*() {
            meleeWeapon = bot.bestMeleeWeapon()
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
                console.log(`[Bot "${bot.bot.username}"] Melee weapon "${meleeWeapon.name}" equipped`)
            } else {
                console.log(`[Bot "${bot.bot.username}"] No melee weapon found`)
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

        console.log(`[Bot "${bot.bot.username}"] Attack ...`)
    
        if (args.useMelee) {
            if (args.useMeleeWeapon) {
                yield* equipMeleeWeapon()
            } else {
                console.log(`[Bot "${bot.bot.username}"] Attacking with bare hands`)
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
            if (entity.metadata[6] === 7) { return false }
            return true
        }

        let reequipMeleeWeapon = false

        /**
         * @param {Entity} entity
         */
        const calculateScore = function(entity) {
            const distanceScore = 1 / bot.bot.entity.position.distanceSquared(entity.position)
            const healthScore = entity.health ? (1 / entity.health) : 0
            const dangerScore = bot.memory.hurtBy[entity.id]?.length ? 1 : 0
            return (
                (distanceScore) +
                (healthScore) +
                (dangerScore * 5)
            )
        }

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
                targetScore = Infinity
                if (!isAlive(target)) { break }

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
                    if (!target || candidateScore > targetScore) {
                        targetScore = candidateScore
                        target = candidate
                    }
                }

                if (!isAlive(target)) { continue }
            }

            if (target.name === 'boat') {
                cooldown = 80
            } else {
                cooldown = hurtTime
            }

            const distance = bot.bot.entity.position.distanceTo(target.position)
    
            if (args.useMelee && (distance <= distanceToUseRangeWeapons || !args.useBow)) {
                if (distance > 6) {
                    console.log(`[Bot "${bot.bot.username}"] Target too far away, moving closer ...`)
                    yield* goto.task(bot, {
                        point: target.position,
                        distance: 5,
                        timeout: 500,
                    })
                    reequipMeleeWeapon = true
                    continue
                }

                stopMoving(target)
    
                if (reequipMeleeWeapon) {
                    console.log(`[Bot "${bot.bot.username}"] Reequipping melee weapon ...`)
                    shield = bot.searchItem('shield')
                    yield* equipMeleeWeapon()
                    console.log(`[Bot "${bot.bot.username}"] Best melee weapon: "${meleeWeapon?.item?.name ?? 'null'}"`)
                    reequipMeleeWeapon = false
                }
    
                if (shield) {
                    if (!bot.holdsShield()) {
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
                    console.log(`[Bot "${bot.bot.username}"] Arrow saved`)
                    bot.memory.myArrows.push(arrow.id)
                }
            }
    
            if (args.useBow && (distance > distanceToUseRangeWeapons || !args.useMelee) && target.name !== 'enderman') {
                stopMoving(target)
                deactivateShield(shield)
    
                const weapon = bot.searchRangeWeapon()
    
                const getGrade = () => {
                    return bot.bot.hawkEye.getMasterGrade({
                        isValid: false,
                        position: target.position.offset(0, target.height / 2, 0),
                    }, new Vec3(0, 0, 0), weapon.weapon)
                }

                if (weapon && weapon.ammo > 0) {
                    let grade = getGrade()
                    if (!grade || grade.blockInTrayect) {
                        console.log(`[Bot "${bot.bot.username}"] Target too far away, moving closer ...`)
                        yield* goto.task(bot, {
                            point: target.position,
                            distance: distance - 2,
                            timeout: 1000,
                            ignoreOthers: true,
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
                            console.log(`[Bot "${bot.bot.username}"] Charging crossbow`)
                            bot.activateHand('right')
                            const chargeTime = bot.getChargeTime(weapon.weapon)
                            yield* sleepG(Math.max(100, chargeTime))
                            bot.deactivateHand()
                            console.log(`[Bot "${bot.bot.username}"] Crossbow charged`)
                        }
    
                        grade = getGrade()
                        if (!grade || grade.blockInTrayect) {
                            console.log(`[Bot "${bot.bot.username}"] Trajectory changed while charging crossbow`)
                            reequipMeleeWeapon = true
                            continue
                        }
                        yield* wrap(bot.bot.look(grade.yaw, grade.pitch, true))
    
                        if (target && target.isValid) {
                            bot.activateHand('right')
                            yield
                            bot.deactivateHand()
                            yield* sleepG(80)
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
                        console.log(`[Bot "${bot.bot.username}"] Pulling bow`)
                        bot.activateHand('right')
                        const chargeTime = bot.getChargeTime(weapon.weapon)
                        yield* sleepG(Math.max(hurtTime, chargeTime))

                        if (!target || !target.isValid) {
                            if (!(yield* bot.clearMainHand())) {
                                console.warn(`[Bot "${bot.bot.username}"] Unnecessary shot`)
                            }
                        }

                        grade = getGrade()
                        if (!grade || grade.blockInTrayect) {
                            console.log(`[Bot "${bot.bot.username}"] Trajectory changed while charging bow`)
                            if (!(yield* bot.clearMainHand())) {
                                console.warn(`[Bot "${bot.bot.username}"] Unnecessary shot`)
                            }
                            reequipMeleeWeapon = true
                            continue
                        }
    
                        yield* wrap(bot.bot.look(grade.yaw, grade.pitch, true))
                        yield
                        bot.deactivateHand()
                        yield* sleepG(80)
                        saveMyArrow()
                    } else {
                        console.warn(`[Bot "${bot.bot.username}"] Unknown range weapon ${weapon.weapon}`)
                    }
                    continue
                }
            }

            if (distance > distanceToUseRangeWeapons && !bot.searchRangeWeapon()) {
                console.log(`[Bot "${bot.bot.username}"] Target too far away, stop attacking it`)
                break
            }
    
            if (target && target.isValid) {
                startMoving(target)
            }
        }
    
        if (bot.isLeftHandActive) {
            bot.deactivateHand()
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
