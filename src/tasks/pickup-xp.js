const { Vec3 } = require("vec3")
const { sleepG } = require('../utils/tasks')
const goto = require("./goto")

/**
 * @type {import('../task').TaskDef<void, { maxDistance?: number; point?: Vec3; }>}
 */
module.exports = {
    task: function*(bot, args) {        
        const nearest = bot.env.getClosestXp(bot, args)
        if ('error' in nearest) {
            throw nearest.error
        }

        yield* goto.task(bot, {
            destination: nearest.result.position.clone(),
            range: 0,
            avoidOccupiedDestinations: true,
        })

        while (nearest.result && nearest.result.isValid) {
            yield* sleepG(100)
        }
    },
    id: function(args) {
        return `pickup-xp-${(args.point ? `${Math.round(args.point.x)}-${Math.round(args.point.y)}-${Math.round(args.point.z)}` : 'null')}-${args.maxDistance}`
    },
    humanReadableId: function(args) {
        return `Picking up XP orbs`
    },
}
