const { Goal } = require('./base')
const AsyncGoal = require('./async-base')
const { error, sleep, trajectoryTime } = require('../utils')
const { Weapons } = require('minecrafthawkeye')
const Wait = require('./wait')
const { Vec3 } = require('vec3')

/**
 * @extends {AsyncGoal<'here' | 'done'>}
 */
module.exports = class EnderpearlToGoal extends AsyncGoal {
    /**
     * @type {Vec3}
     */
    target

    /**
     * @param {Goal<any>} parent
     * @param {Vec3} target
     */
    constructor(parent, target) {
        super(parent)

        this.target = target
    }

    /**
     * @override
     * @returns {import('./base').AsyncGoalReturn<'here' | 'done'>}
     * @param {import('../context')} context
     */
    async run(context) {
        super.run(context)
        
        const distance = context.bot.entity.position.distanceTo(this.target)

        if (distance <= 2) {
            return { result: 'here' }
        }

        const enderpearl = context.searchItem('ender_pearl')
        if (!enderpearl) {
            return error(`I have no enderpearl`)
        }

        const grade = context.bot.hawkEye.getMasterGrade({
            position: this.target,
            isValid: false,
        }, new Vec3(0, 0, 0), Weapons.ender_pearl)
        if (!grade) {
            return error(`No`)
        }
        
        if (grade.blockInTrayect) {
            return error(`There are blocks intersecting the trayecotry`)
        }

        await context.bot.look(grade.yaw, grade.pitch, true)
        await sleep(500)

        await context.bot.look(grade.yaw, grade.pitch, true)
        await sleep(500)

        await context.bot.equip(enderpearl, 'hand')
        context.bot.activateItem(false)

        const thrownFrom = context.bot.entity.position.clone()

        const time = trajectoryTime(grade.arrowTrajectoryPoints, 20) * 1000
        const predictedImpactAt = context.time + time
        while (true) {
            context.refreshTime()

            await (new Wait(this, 500)).wait()

            if (predictedImpactAt - context.time < 0 &&
                context.bot.entity.position.distanceTo(thrownFrom) > 2) {
                break
            }
        }

        await (new Wait(this, 2000)).wait()
        return { result: 'done' }
    }

    /**
     * @override
     * @param {import('../context')} context
     * @returns {string}
     */
    toReadable(context) {
        return `Enderpearl to ${this.target.x} ${this.target.y} ${this.target.z}`
    }
}
