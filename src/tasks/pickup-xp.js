const { Vec3 } = require('vec3')
const { sleepG } = require('../utils/tasks')
const goto = require('./goto')

/**
 * @type {import('../task').TaskDef<void, { maxDistance?: number; point?: Vec3; }>}
 */
module.exports = {
    task: function*(bot, args) {
        const nearest = bot.env.getClosestXp(bot, args)
        if (!nearest) {
            throw `No xps nearby`
        }

        yield* goto.task(bot, {
            entity: nearest,
            distance: 3, // max: 7.25
        })

        while (nearest && nearest.isValid) {
            yield* sleepG(100)
        }
    },
    id: function(args) {
        return `pickup-xp-${(args.point ? `${Math.round(args.point.x)}-${Math.round(args.point.y)}-${Math.round(args.point.z)}` : 'null')}-${args.maxDistance}`
    },
    humanReadableId: function() {
        return `Picking up XP orbs`
    },
    definition: 'pickupXp',
}
