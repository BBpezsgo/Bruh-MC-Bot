'use strict'

const { Vec3 } = require('vec3')
const { sleepG, wrap, runtimeArgs } = require('../utils/tasks')
const { trajectoryTime } = require('../utils/other')
const { Weapons } = require('minecrafthawkeye')
const goto = require('./goto')

/**
 * @type {import('../task').TaskDef<'here' | 'ok', {
 *   destination: Vec3;
 *   locks: ReadonlyArray<import('../item-lock')>;
 * }>}
 */
module.exports = {
    task: function*(bot, args) {
        const distance = bot.bot.entity.position.distanceTo(args.destination)

        if (distance <= 2) {
            return 'here'
        }

        const enderpearl = bot.searchInventoryItem(null, 'ender_pearl')
        if (!enderpearl) {
            throw `I have no enderpearl`
        }

        if (!bot.bot.hawkEye) {
            setTimeout(() => bot.bot.loadPlugin(require('minecrafthawkeye').default), 0)
        }

        yield* goto.task(bot, {
            hawkeye: args.destination,
            weapon: Weapons.ender_pearl,
            ...runtimeArgs(args),
        })

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

        yield* wrap(bot.bot.look(grade.yaw, grade.pitch, bot.instantLook), args.interrupt)
        yield* sleepG(100)

        yield* wrap(bot.bot.equip(enderpearl, 'hand'), args.interrupt)
        bot.bot.activateItem(false)

        const thrownFrom = bot.bot.entity.position.clone()

        const time = trajectoryTime(grade.arrowTrajectoryPoints, 20) * 1000
        const predictedImpactAt = performance.now() + time
        while (true) {
            if (args.interrupt.isCancelled) { break }
            yield* sleepG(100)

            if (predictedImpactAt - performance.now() < 0 &&
                bot.bot.entity.position.distanceTo(thrownFrom) > 2) {
                break
            }
        }

        if (args.interrupt.isCancelled) { return 'ok' }

        yield* sleepG(1000)

        return 'ok'
    },
    id: function(args) {
        return `tp-${Math.round(args.destination.x)}-${Math.round(args.destination.y)}-${Math.round(args.destination.z)}`
    },
    humanReadableId: function() {
        return `Teleporting`
    },
    definition: 'enderpearlTo',
}
