const { goals } = require('mineflayer-pathfinder')
const { sleep, error } = require('../utils')
const AsyncGoal = require('./async-base')
const { Goal } = require('./base')
const Hands = require('../hands')

/**
 * @extends {AsyncGoal<boolean>}
 */
module.exports = class BlockMeleeGoal extends AsyncGoal {
    /**
     * @private
     * @type {import('../result').Result<true> | null}
     */
    fleeResult
    
    /**
     * @param {Goal<any>} parent
     */
    constructor(parent) {
        super(parent)
        
        this.fleeResult = null
    }

    /**
     * @override
     * @returns {import('./base').AsyncGoalReturn<boolean>}
     * @param {import('../context')} context
     */
    async run(context) {
        super.run(context)

        const shield = context.searchItem('shield')
        if (!shield) {
            console.warn(`${this.indent} Has no shield`)
            return { result: false }
        }

        let hazard = BlockMeleeGoal.getHazard(context)

        if (!hazard) {
            console.warn(`${this.indent} There are no hazards`)
            return { result: false }
        }

        if (!context.holdsShield()) {
            console.warn(`${this.indent} Equiping shield`)
            await context.bot.equip(shield.type, 'off-hand')
        }

        context.bot.pathfinder.stop()
        context.bot.pathfinder.setGoal(new goals.GoalInvert(new goals.GoalFollow(hazard, 100)))
        // this.flee(hazard, context)
        //     .then((_result) => {
        //         this.fleeResult = _result
        //     })
        //     .catch((_reason) => {
        //         this.fleeResult = error(_reason)
        //     })

        // Source: https://github.com/PrismarineJS/mineflayer-pvp/blob/master/src/PVP.ts

        let distance = context.bot.entity.position.distanceTo(hazard.position)
        console.warn(`${this.indent} Distance: ${Math.round(distance * 10) / 10}`)

        while ((
                hazard &&
                hazard.isValid &&
                context.holdsShield() &&
                distance < 2
            )) {
            Hands.activate('left')

            console.warn(`${this.indent} Blocking melee attack ...`)
            await context.bot.lookAt(hazard.position.offset(0, hazard.height, 0), true)
            // context.bot.setControlState('back', true)
            await sleep(50)

            distance = context.bot.entity.position.distanceTo(hazard.position)
            console.warn(`${this.indent} Distance: ${Math.round(distance * 10) / 10}`)

            if (this.fleeResult) {
                if ('error' in this.fleeResult) {
                    return error(this.fleeResult.error)
                }
            }
        }

        Hands.deactivate()
        context.bot.pathfinder.setGoal(null)

        return { result: true }
    }

    // /**
    //  * @param {import('../context')} context
    //  * @returns {import('./base').AsyncGoalReturn<true>}
    //  * @param {import('prismarine-entity').Entity} hazard
    //  */
    // async flee(hazard, context) {
    //     try {
    //         await context.bot.pathfinder.goto(new goals.GoalInvert(new goals.GoalNear(hazard, 3)))
    //     } catch (_error) {
    //         return error(_error)
    //     }
    // 
    //     return { result: true }
    // }

    /**
     * @param {import('../context')} context
     */
    static getHazard(context) {
        return context.bot.nearestEntity((entity) => {
            if (entity.type !== 'hostile') {
                return false
            }

            if (!entity.name) {
                return false
            }

            if (entity.name === 'skeleton' ||
                entity.name === 'stray' ||
                entity.name === 'creeper') {
                return false
            }

            const distance = context.bot.entity.position.distanceTo(entity.position)
            return distance < 2
        })
    }
}
