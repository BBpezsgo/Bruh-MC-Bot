const AsyncGoal = require('./async-base')
const { Goal } = require('./base')
const { Entity } = require('prismarine-entity')
const Wait = require('./wait')
const GotoGoal = require('./goto')
const FleeGoal = require('./flee')
const { sleep, error, costDepth } = require('../utils')
const { Weapons } = require('minecrafthawkeye')
const { Item } = require('prismarine-item')
const MeleeWeapons = require('../melee-weapons')
const Hands = require('../hands')
const { goals } = require('mineflayer-pathfinder')

module.exports = class AttackGoal extends AsyncGoal {
    /**
     * @type {Entity}
     */
    entity

    /**
     * @param {Goal<any>} parent
     * @param {Entity} entity
     */
    constructor(parent, entity) {
        super(parent)

        this.entity = entity
    }

    /**
     * @override
     * @returns {import('./base').AsyncGoalReturn<true>}
     * @param {import('../context')} context
     */
    async run(context) {
        super.run(context)

        let lastPunch = performance.now()

        const deactivateShield = function(/** @type {Item} */ shield) {
            if (shield && Hands.isLeftActive) {
                Hands.deactivate()
                return true
            }
            return false
        }

        const activateShield = function(/** @type {Item} */ shield) {
            if (shield && !Hands.isLeftActive) {
                Hands.activate('left')
                return true
            }
            return false
        }

        while (this.entity && this.entity.isValid) {
            const distance = context.bot.entity.position.distanceTo(this.entity.position)

            const shield = context.searchItem('shield')
            if (shield && !context.holdsShield()) {
                await context.bot.equip(shield.type, 'off-hand')
            }

            let height

            if (this.entity.type === 'player') {
                height = 1.6
            } else {
                height = this.entity.height / 2
            }

            await context.bot.lookAt(this.entity.position.offset(0, height, 0), true)

            if (distance <= 3) {
                const meleeWeapon = context.bestMeleeWeapon()
                const holds = context.bot.inventory.slots[context.bot.getEquipmentDestSlot('hand')]
                if (meleeWeapon) {
                    if (!holds || holds.type !== meleeWeapon.item.type) {
                        await context.bot.equip(meleeWeapon.item.type, 'hand')
                    }
                } else {
                    if (holds) {
                        await context.bot.unequip('hand')
                    }
                }
                const cooldown = meleeWeapon ? (meleeWeapon.cooldown * 1000) : 500

                const now = performance.now()
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

            if (distance > 7) {
                deactivateShield(shield)

                const weapon = context.searchRangeWeapon()
                if (weapon && weapon.ammo > 0) {
                    const grade = context.bot.hawkEye.getMasterGrade(this.entity, context.bot.entity.velocity, weapon.weapon)

                    if (!grade || grade.blockInTrayect) {
                        const subresult = await (new GotoGoal(this, this.entity.position.clone(), distance - 2, context.restrictedMovements)).wait()
                        if ('error' in subresult) return error(subresult.error)
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
                            Hands.activate('right')
                            const chargeTime = context.getChargeTime(weapon.weapon)
                            await sleep(Math.max(100, chargeTime))
                            Hands.deactivate()
                        }

                        if (this.entity && this.entity.isValid) {
                            Hands.activate('right')
                            await sleep(40)
                            Hands.deactivate()
                        }
                    } else {
                        Hands.activate('right')
                        const chargeTime = context.getChargeTime(weapon.weapon)
                        await sleep(Math.max(100, chargeTime))
                        if (!this.entity || !this.entity.isValid) {
                            if (!(await context.clearMainHand())) {
                                console.warn(`${this.indent} Unnecessary shot`)
                            }
                        }
                        Hands.deactivate()
                    }
                    continue
                }
            }

            if (this.entity && this.entity.isValid) {
                const subresult = await (new GotoGoal(this, this.entity.position.clone(), 3, context.restrictedMovements)).wait()
                if ('error' in subresult) return error(subresult.error)
            }
        }

        if (Hands.isLeftActive) {
            Hands.deactivate()
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
