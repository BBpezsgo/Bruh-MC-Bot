const AsyncGoal = require('./async-base')
const { Goal } = require('./base')
const { Entity } = require('prismarine-entity')
const GotoGoal = require('./goto')
const { sleep, error, costDepth } = require('../utils')
const { Weapons } = require('minecrafthawkeye')
const { Item } = require('prismarine-item')
const MeleeWeapons = require('../melee-weapons')
const { goals } = require('mineflayer-pathfinder')

module.exports = class AttackGoal extends AsyncGoal {
    /**
     * @type {Entity}
     */
    entity

    /** @readonly @type {boolean} */ useMelee
    /** @readonly @type {boolean} */ useMeleeWeapon
    /** @readonly @type {boolean} */ useBow

    /**
     * @param {Goal<any>} parent
     * @param {Entity} entity
     */
    constructor(parent, entity, useMelee = true, useMeleeWeapon = true, useBow = true) {
        super(parent)

        this.entity = entity
        this.useMelee = useMelee
        this.useMeleeWeapon = useMeleeWeapon
        this.useBow = useBow
    }

    /**
     * @override
     * @returns {import('./base').AsyncGoalReturn<true>}
     * @param {import('../context')} context
     */
    async run(context) {
        super.run(context)

        if (context.quietMode) {
            return error(`${this.indent} Can't attack in quiet mode`)
        }

        if (!this.useBow && !this.useMelee) {
            return error(`${this.indent} Every possible way of attacking is disabled`)
        }

        let lastPunch = 0
        const hurtTime = context.mc.data2.general.hurtTime
        let cooldown = hurtTime
        
        /** @type {(MeleeWeapons.MeleeWeapon & { item: Item }) | null}*/
        let meleeWeapon = null
        /** @type {Item | null} */
        let shield = context.searchItem('shield')

        /** @type {GotoGoal | null} */
        let gotoGoal = null

        if (this.entity.name === 'boat') {
            shield = null
        }

        const deactivateShield = function(/** @type {Item} */ shield) {
            if (shield && context.isLeftHandActive) {
                context.deactivateHand()
                return true
            }
            return false
        }

        const activateShield = function(/** @type {Item} */ shield) {
            if (shield && !context.isLeftHandActive) {
                context.activateHand('left')
                return true
            }
            return false
        }

        const equipMeleeWeapon = async function() {
            meleeWeapon = context.bestMeleeWeapon()
            const holds = context.bot.inventory.slots[context.bot.getEquipmentDestSlot('hand')]

            if (meleeWeapon) {
                if (!holds || holds.type !== meleeWeapon.item.type) {
                    lastPunch = context.time
                    await context.bot.equip(meleeWeapon.item.type, 'hand')
                }
            } else {
                if (holds) {
                    await context.bot.unequip('hand')
                }
            }
            cooldown = meleeWeapon ? (meleeWeapon.cooldown * 1000) : hurtTime
        }

        const startMoving = () => {
            if (context.bot.pathfinder.goal && 
                context.bot.pathfinder.goal instanceof goals.GoalFollow &&
                context.bot.pathfinder.goal.entity?.id == this.entity?.id) {
                return
            }
            if (context.bot.pathfinder.goal) {
                context.bot.pathfinder.stop()
            }
            context.bot.pathfinder.setGoal(new goals.GoalFollow(this.entity, 3))
            return

            if (gotoGoal && !gotoGoal.resolvedValue) { return }
            gotoGoal = new GotoGoal(this, this.entity.position.clone(), 3, context.restrictedMovements, 1000)
        }

        const stopMoving = () => {
            if (context.bot.pathfinder.goal && 
                context.bot.pathfinder.goal instanceof goals.GoalFollow &&
                context.bot.pathfinder.goal.entity?.id == this.entity?.id) {
                context.bot.pathfinder.stop()
            }
            return
            if (!gotoGoal || gotoGoal.resolvedValue) {
                gotoGoal = null
                return
            }
            gotoGoal.cancel(context)
        }

        if (this.useMelee) {
            if (this.useMeleeWeapon) {
                await equipMeleeWeapon()
            } else {
                if (context.bot.inventory.slots[context.bot.getEquipmentDestSlot('hand')]) {
                    await context.bot.unequip('hand')
                }
                if (this.entity.name === 'boat') {
                    cooldown = 80
                } else {
                    cooldown = hurtTime
                }
            }
        }

        let reequipMeleeWeapon = false

        while (this.entity && this.entity.isValid) {
            if (this.entity.metadata[6] &&
                typeof this.entity.metadata[6] === 'number' &&
                this.entity.metadata[6] === 7) {
                break
            }

            context.refreshTime()
            await this.yield()

            const distance = context.bot.entity.position.distanceTo(this.entity.position)

            /*
            if (distance <= 2 && !context.bot.pathfinder.goal) {
                context.bot.pathfinder.setGoal(new goals.GoalInvert(new goals.GoalFollow(this.entity, 3)), true)
            }
            */

            if (distance <= 6 && this.useMelee) {
                stopMoving()

                if (reequipMeleeWeapon) {
                    console.log(`[Bot "${context.bot.username}"] ${this.indent} Reequipping melee weapon ...`)
                    shield = context.searchItem('shield')
                    await equipMeleeWeapon()
                    console.log(`[Bot "${context.bot.username}"] ${this.indent} Best melee weapon: "${meleeWeapon?.item?.name ?? 'null'}"`)
                    reequipMeleeWeapon = false
                }

                if (shield && !context.holdsShield()) {
                    await context.bot.equip(shield.type, 'off-hand')
                    await context.bot.lookAt(this.entity.position.offset(0, this.entity.height, 0), true)
                }

                const now = context.time
                if (now - lastPunch > cooldown) {
                    if (deactivateShield(shield)) {
                        await sleep(40)
                    }

                    context.bot.attack(this.entity)
                    lastPunch = now

                    await sleep(40)

                    activateShield(shield)
                }

                continue
            }

            const saveMyArrow = () => {
                const arrow = context.bot.nearestEntity(v => {
                    if (v.name !== 'arrow') { return false }
                    const velocity = v.velocity.clone().normalize()
                    const dir = v.position.clone().subtract(context.bot.entity.position).normalize()
                    const dot = velocity.dot(dir)
                    if (dot < 0) { return false }
                    return true
                })
                if (arrow) {
                    console.log(`[Bot "${context.bot.username}"] ${this.indent} Arrow saved`)
                    context.myArrows.push(arrow.id)
                }
            }

            if (distance > 7 && this.entity.name !== 'enderman' && this.useBow) {
                stopMoving()
                deactivateShield(shield)

                const weapon = context.searchRangeWeapon()
                
                const getGrade = () => {
                    return context.bot.hawkEye.getMasterGrade(this.entity, context.bot.entity.velocity.clone().offset(-this.entity.velocity.x, 0, -this.entity.velocity.z), weapon.weapon)
                }

                if (weapon && weapon.ammo > 0) {
                    let grade = getGrade()
                    if (!grade || grade.blockInTrayect) {
                        const subresult = await (new GotoGoal(this, this.entity.position.clone(), distance - 2, context.restrictedMovements, 1000)).wait()
                        if ('error' in subresult) return error(subresult.error)
                        reequipMeleeWeapon = true
                        continue
                    }

                    await context.bot.equip(weapon.item, 'hand')
                    await context.bot.look(grade.yaw, grade.pitch, true)

                    if (weapon.weapon === Weapons.crossbow) {
                        const isCharged =
                            weapon.item.nbt &&
                            weapon.item.nbt.type === 'compound' &&
                            weapon.item.nbt.value['ChargedProjectiles'] &&
                            weapon.item.nbt.value['ChargedProjectiles'].type === 'list' &&
                            weapon.item.nbt.value['ChargedProjectiles'].value.value.length > 0

                        if (!isCharged) {
                            context.activateHand('right')
                            const chargeTime = context.getChargeTime(weapon.weapon)
                            await sleep(Math.max(100, chargeTime))
                            context.deactivateHand()
                        }

                        grade = getGrade()
                        if (!grade || grade.blockInTrayect) {
                            console.log(`[Bot "${context.bot.username}"] ${this.indent} Trajectory changed while charging crossbow`)
                            reequipMeleeWeapon = true
                            continue
                        }
                        await context.bot.look(grade.yaw, grade.pitch, true)

                        if (this.entity && this.entity.isValid) {
                            context.activateHand('right')
                            await sleep(40)
                            context.deactivateHand()
                            sleep(80).then(saveMyArrow)
                        }
                    } else if (weapon.weapon === Weapons.egg ||
                               weapon.weapon === Weapons.snowball) {
                        await context.bot.look(grade.yaw, grade.pitch, true)
                        await sleep(40)
                        context.activateHand('right')
                        await sleep(hurtTime - 40)
                        context.deactivateHand()
                    } else if (weapon.weapon === Weapons.bow) {
                        context.activateHand('right')
                        const chargeTime = context.getChargeTime(weapon.weapon)
                        await sleep(Math.max(hurtTime, chargeTime))

                        if (!this.entity || !this.entity.isValid) {
                            if (!(await context.clearMainHand())) {
                                console.warn(`[Bot "${context.bot.username}"] ${this.indent} Unnecessary shot`)
                            }
                        }

                        grade = getGrade()
                        if (!grade || grade.blockInTrayect) {
                            console.log(`[Bot "${context.bot.username}"] ${this.indent} Trajectory changed while charging bow`)
                            if (!(await context.clearMainHand())) {
                                console.warn(`[Bot "${context.bot.username}"] ${this.indent} Unnecessary shot`)
                            }
                            reequipMeleeWeapon = true
                            continue
                        }
                        await context.bot.look(grade.yaw, grade.pitch, true)

                        await context.bot.look(grade.yaw, grade.pitch, true)
                        context.deactivateHand()
                        
                        sleep(80).then(saveMyArrow)
                    } else {
                        console.warn(`[Bot "${context.bot.username}"] ${this.indent} Unknown range weapon ${weapon.weapon}`)
                    }
                    continue
                }
            }

            if (this.entity && this.entity.isValid) {
                startMoving()
            }
        }

        if (context.isLeftHandActive) {
            context.deactivateHand()
        }

        return { result: true }
    }

    /**
     * @param {import('../context')} context
     * @param {Entity} entity
     * @param {boolean} gatherTool
     * @param {number} depth
     */
    static async cost(context, entity, gatherTool, depth) {
        if (depth > costDepth) {
            return Infinity
        }

        const distance = context.bot.entity.position.distanceTo(entity.position)
        return distance + 15
    }

    /**
     * @override
     * @param {import('../context')} context
     * @returns {string}
     */
    toReadable(context) {
        return `Attack ${this.entity?.displayName ?? this.entity?.name ?? 'something'}`
    }
}
