const { Entity } = require('prismarine-entity')
const { wrap, sleepG, trajectoryTime } = require('../utils')
const { Weapons } = require('minecrafthawkeye')
const { Item } = require('prismarine-item')
const MeleeWeapons = require('../melee-weapons')
const { goals } = require('mineflayer-pathfinder')
const goto = require('./goto')

/**
 * @type {import('../task').TaskDef<void, { target: Entity; useMelee: boolean; useMeleeWeapon: boolean; useBow: boolean; }>}
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
    
        if (args.target.name === 'boat') {
            shield = null
        }
    
        const deactivateShield = function(/** @type {Item | null} */ shield) {
            if (shield && bot.isLeftHandActive) {
                bot.deactivateHand()
                // console.log(`[Bot "${bot.bot.username}"]: Shield deactivated`)
                return true
            }
            return false
        }
    
        const activateShield = function(/** @type {Item | null} */ shield) {
            if (shield && !bot.isLeftHandActive) {
                bot.activateHand('left')
                // console.log(`[Bot "${bot.bot.username}"]: Shield activated`)
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
                console.log(`[Bot "${bot.bot.username}"]: Melee weapon "${meleeWeapon.name}" equiped`)
            } else {
                console.log(`[Bot "${bot.bot.username}"]: No melee weapon found`)
            }
        
            cooldown = meleeWeapon ? (meleeWeapon.cooldown * 1000) : hurtTime
        }
    
        const startMoving = function*() {
            if (bot.bot.pathfinder.goal && 
                bot.bot.pathfinder.goal instanceof goals.GoalFollow &&
                bot.bot.pathfinder.goal.entity?.id == args.target?.id) {
                return
            }
            if (bot.bot.pathfinder.goal) {
                bot.bot.pathfinder.stop()
            }
            bot.bot.pathfinder.setGoal(new goals.GoalFollow(args.target, 3))
        }
    
        const stopMoving = () => {
            if (bot.bot.pathfinder.goal && 
                bot.bot.pathfinder.goal instanceof goals.GoalFollow &&
                bot.bot.pathfinder.goal.entity?.id == args.target?.id) {
                bot.bot.pathfinder.stop()
            }
        }

        console.log(`[Bot "${bot.bot.username}"]: Attack ...`)
    
        if (args.useMelee) {
            if (args.useMeleeWeapon) {
                yield* equipMeleeWeapon()
            } else {
                console.log(`[Bot "${bot.bot.username}"]: Attacking with bare hands`)
                if (bot.bot.inventory.slots[bot.bot.getEquipmentDestSlot('hand')]) {
                    yield* wrap(bot.bot.unequip('hand'))
                }
                if (args.target.name === 'boat') {
                    cooldown = 80
                } else {
                    cooldown = hurtTime
                }
            }
        }
    
        let reequipMeleeWeapon = false
    
        while (args.target && args.target.isValid) {
            yield
    
            if (args.target.metadata[6] &&
                typeof args.target.metadata[6] === 'number' &&
                args.target.metadata[6] === 7) {
                break
            }

            // if (bot.env.entityHurtTimes[args.target.id]) {
            //     const hurtingTime = performance.now() - bot.env.entityHurtTimes[args.target.id]
            //     if (hurtingTime < 0) {
            //         continue
            //     }
            // }
    
            const distance = bot.bot.entity.position.distanceTo(args.target.position)
    
            if (distance <= 6 && args.useMelee) {
                stopMoving()
    
                if (reequipMeleeWeapon) {
                    console.log(`[Bot "${bot.bot.username}"] Reequipping melee weapon ...`)
                    shield = bot.searchItem('shield')
                    yield* equipMeleeWeapon()
                    // @ts-ignore
                    console.log(`[Bot "${bot.bot.username}"] Best melee weapon: "${meleeWeapon?.item?.name ?? 'null'}"`)
                    reequipMeleeWeapon = false
                }
    
                if (shield) {
                    if (!bot.holdsShield()) {
                        yield* wrap(bot.bot.equip(shield.type, 'off-hand'))
                    }
                    yield* wrap(bot.bot.lookAt(args.target.position.offset(0, args.target.height, 0), true))
                }

                const now = performance.now()
                if (now - lastPunch > cooldown) {
                    if (deactivateShield(shield)) {
                        yield
                    }
    
                    bot.bot.attack(args.target)
                    lastPunch = now

                    // bot.env.entityHurtTimes[args.target.id] = performance.now()

                    yield

                    activateShield(shield)
                    
                    // console.log(`[Bot "${bot.bot.username}"]: PUNCH`)
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
    
            if (distance > 6 && args.target.name !== 'enderman' && args.useBow) {
                stopMoving()
                deactivateShield(shield)
    
                const weapon = bot.searchRangeWeapon()
    
                const getGrade = () => {
                    return bot.bot.hawkEye.getMasterGrade(args.target, bot.bot.entity.velocity.clone().offset(-args.target.velocity.x, 0, -args.target.velocity.z), weapon.weapon)
                }

                if (weapon && weapon.ammo > 0) {
                    let grade = getGrade()
                    if (!grade || grade.blockInTrayect) {
                        console.log(`[Bot "${bot.bot.username}"]: Target too far away, moving closer ...`)
                        yield* goto.task(bot, {
                            destination: args.target.position.clone(),
                            range: distance - 2,
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
                            console.log(`[Bot "${bot.bot.username}"]: Charging crossbow`)
                            bot.activateHand('right')
                            const chargeTime = bot.getChargeTime(weapon.weapon)
                            yield* sleepG(Math.max(100, chargeTime))
                            bot.deactivateHand()
                            console.log(`[Bot "${bot.bot.username}"]: Crossbow charged`)
                        }
    
                        grade = getGrade()
                        if (!grade || grade.blockInTrayect) {
                            console.log(`[Bot "${bot.bot.username}"] Trajectory changed while charging crossbow`)
                            reequipMeleeWeapon = true
                            continue
                        }
                        yield* wrap(bot.bot.look(grade.yaw, grade.pitch, true))
    
                        if (args.target && args.target.isValid) {
                            bot.activateHand('right')
                            yield
                            bot.deactivateHand()
                            // bot.env.entityHurtTimes[args.target.id] = performance.now() + (trajectoryTime(grade.arrowTrajectoryPoints, 60) * 1000)
                            console.log(`[Bot "${bot.bot.username}"]: SHOOT`)
                            yield* sleepG(80)
                            saveMyArrow()
                        }
                    } else if (weapon.weapon === Weapons.egg ||
                               weapon.weapon === Weapons.snowball) {
                        yield* wrap(bot.bot.look(grade.yaw, grade.pitch, true))
                        yield
                        bot.activateHand('right')
                        yield
                        bot.deactivateHand()
                        // bot.env.entityHurtTimes[args.target.id] = performance.now() + (trajectoryTime(grade.arrowTrajectoryPoints, 15) * 1000)
                        console.log(`[Bot "${bot.bot.username}"]: THROW`)
                    } else if (weapon.weapon === Weapons.bow) {
                        console.log(`[Bot "${bot.bot.username}"]: Pulling bow`)
                        bot.activateHand('right')
                        const chargeTime = bot.getChargeTime(weapon.weapon)
                        yield* sleepG(Math.max(hurtTime, chargeTime))

                        if (!args.target || !args.target.isValid) {
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
                        // bot.env.entityHurtTimes[args.target.id] = performance.now() + (trajectoryTime(grade.arrowTrajectoryPoints, 60) * 1000)
                        console.log(`[Bot "${bot.bot.username}"]: SHOOT`)
                        yield* sleepG(80)
                        saveMyArrow()
                    } else {
                        console.warn(`[Bot "${bot.bot.username}"] Unknown range weapon ${weapon.weapon}`)
                    }
                    continue
                }
            }
    
            if (args.target && args.target.isValid) {
                startMoving()
            }
        }
    
        if (bot.isLeftHandActive) {
            bot.deactivateHand()
        }
    },
    id: function(args) {
        return `attack-${args.target.id}`
    },
    humanReadableId: function(args) {
        return `Attack ${args.target.displayName ?? args.target.name ?? 'something'}`
    }
}
