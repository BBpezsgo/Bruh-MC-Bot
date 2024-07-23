const { Vec3 } = require('vec3')
const { sleepG, wrap } = require('../utils/tasks')
const { trajectoryTime } = require('../utils/other')
const { Weapons } = require('minecrafthawkeye')

/**
 * @type {import('../task').TaskDef<'here' | 'ok', { destination: Vec3; }>}
 */
module.exports = {
    task: function*(bot, args) {
        const distance = bot.bot.entity.position.distanceTo(args.destination)

        if (distance <= 2) {
            return 'here'
        }

        const enderpearl = bot.searchItem('ender_pearl')
        if (!enderpearl) {
            throw `I have no enderpearl`
        }

        const grade = bot.bot.hawkEye.getMasterGrade({
            position: args.destination,
            isValid: false,
        }, new Vec3(0, 0, 0), Weapons.ender_pearl)
        if (!grade) {
            throw `No`
        }
        
        if (grade.blockInTrayect) {
            throw `There are blocks (${grade.blockInTrayect.name}) intersecting the trajectory`
        }

        yield* wrap(bot.bot.look(grade.yaw, grade.pitch, true))
        yield* sleepG(100)

        yield* wrap(bot.bot.equip(enderpearl, 'hand'))
        bot.bot.activateItem(false)

        const thrownFrom = bot.bot.entity.position.clone()

        const time = trajectoryTime(grade.arrowTrajectoryPoints, 20) * 1000
        const predictedImpactAt = performance.now() + time
        while (true) {
            yield

            yield* sleepG(200)

            if (predictedImpactAt - performance.now() < 0 &&
                bot.bot.entity.position.distanceTo(thrownFrom) > 2) {
                break
            }
        }

        yield* sleepG(1000)

        return 'ok'
    },
    id: function(args) {
        return `tp-${Math.round(args.destination.x)}-${Math.round(args.destination.y)}-${Math.round(args.destination.z)}`
    },
    humanReadableId: function(args) {
        return `Teleporting`
    },
}
