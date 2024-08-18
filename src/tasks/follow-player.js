const { sleepG } = require('../utils/tasks')
const goto = require('./goto')
const Vec3Dimension = require('../vec3-dimension')

/**
 * @type {import('../task').TaskDef<void, {
 *   player: string;
 *   range: number;
 *   onNoPlayer?: import('../task').SimpleTaskDef<Vec3Dimension | null, null>;
 * }, Error>}
 */
module.exports = {
    task: function* (bot, args) {
        let failStreak = 0
        let isFollowing = true

        args.cancel = function*() {
            isFollowing = false
        }

        while (isFollowing) {
            yield

            let target = bot.env.getPlayerPosition(args.player, 10000)

            if (!target) {
                if (!args.onNoPlayer) {
                    console.warn(`[Bot "${bot.username}"] Can't find ${args.player}`)
                    throw `Can't find ${args.player}`
                }
                console.warn(`[Bot "${bot.username}"] Can't find ${args.player}, asking for location ...`)
                target = yield* args.onNoPlayer(bot, null)
                console.log(`[Bot "${bot.username}"] Location response: ${target}`)

                if (!target) {
                    target = bot.env.getPlayerPosition(args.player)
                    if (!target) {
                        throw `Can't find ${args.player}`
                    } else {
                        console.warn(`[Bot "${bot.username}"] Player not responded, using outdated position`)
                    }
                } else {
                    bot.env.setPlayerPosition(args.player, target)
                }
            }

            if (target.dimension &&
                bot.dimension !== target.dimension) {
                yield* goto.task(bot, { dimension: target.dimension })
                continue
            }

            const distance = bot.bot.entity.position.distanceTo(target.xyz(bot.dimension))

            if (distance <= args.range) {
                yield* sleepG(1000)
            }

            try {
                if (bot.bot.players[args.player]?.entity) {
                    yield* goto.task(bot, {
                        entity: bot.bot.players[args.player].entity,
                        distance: args.range,
                    })
                } else {
                    yield* goto.task(bot, {
                        point: target,
                        distance: args.range,
                    })
                }
                failStreak = 0
            } catch (error) {
                if (failStreak > 5) {
                    if (error instanceof Error) {
                        if (error.name === 'NoPath') {
                            throw `I can't find a path to you`
                        } else if (error.name === 'Timeout') {
                            yield* sleepG(5000)
                            continue
                        }
                    }
                    throw error
                }
                failStreak++
            }
        }
    },
    id: function (args) {
        return `follow-${args.player}`
    },
    humanReadableId: function(args) {
        return `Follow ${args.player}`
    },
    definition: 'followPlayer',
}
