'use strict'

const { sleepG, wrap, parallel, race, withCancellation } = require('../utils/tasks')
const goto = require('./goto')
const config = require('../config')
const { Vec3 } = require('vec3')
const Vec3Dimension = require('../vec3-dimension')

/**
 * @type {import('../task').TaskDef<void, {
 *   player: string;
 *   range: number;
 * }>}
 */
module.exports = {
    task: function*(bot, args) {
        while (!args.cancellationToken.isCancelled) {
            yield

            let target = bot.env.getPlayerPosition(args.player, config.followPlayer.playerPositionMaxAge)

            if (!target) {
                console.warn(`[Bot "${bot.username}"] Can't find ${args.player}, asking for location ...`)

                const askTask = (/** @type {() => import('../task').Task<Vec3Dimension>} */ function*() {
                    let _target = args.response ? (yield* wrap(args.response.askPosition(`I lost you. Where are you?`, 120000, args.player)))?.message : null

                    if (!_target) {
                        _target = bot.env.getPlayerPosition(args.player)
                        if (!_target) { throw `Can't find ${args.player}` }
                        console.warn(`[Bot "${bot.username}"] Player not responded, using outdated position`)
                        return _target
                    }

                    args.response.respond(`${_target.x} ${_target.y} ${_target.z} in ${_target.dimension} I got it`, args.player)
                    console.log(`[Bot "${bot.username}"] Location response: ${_target}`)
                    bot.env.setPlayerPosition(args.player, _target)
                    return _target
                }())

                const foundTask = (/** @type {() => import('../task').Task<Vec3Dimension>} */ function*() {
                    while (true) {
                        yield
                        const _target = bot.env.getPlayerPosition(args.player, 1)
                        if (_target) {
                            console.log(`[Bot "${bot.username}"] Player appeared after asking for location`)
                            args.response.respond(`Nevermind`, args.player)
                            return new Vec3Dimension(_target, bot.dimension)
                        }
                    }
                }())

                const foundTarget = yield* withCancellation(race([askTask, foundTask]), args.cancellationToken)
                if (foundTarget.cancelled) { break }
                target = foundTarget.result
            }

            if (target.dimension &&
                bot.dimension !== target.dimension) {
                yield* goto.task(bot, {
                    dimension: target.dimension,
                    cancellationToken: args.cancellationToken,
                })
                continue
            }

            const distance = bot.bot.entity.position.distanceTo(target.xyz(bot.dimension))

            if (distance <= args.range) {
                yield* sleepG(300)
            }

            try {
                if (bot.bot.players[args.player]?.entity) {
                    yield* goto.task(bot, {
                        entity: bot.bot.players[args.player].entity,
                        distance: args.range,
                        sprint: distance > 10,
                        cancellationToken: args.cancellationToken,
                    })
                } else {
                    yield* goto.task(bot, {
                        point: target,
                        distance: args.range,
                        sprint: distance > 10,
                        cancellationToken: args.cancellationToken,
                    })
                }
            } catch (error) {
                console.error(`[Bot "${bot.username}"]`, error)
                yield* sleepG(5000)
            }
        }
    },
    id: function(args) {
        return `follow-${args.player}`
    },
    humanReadableId: function(args) {
        return `Follow ${args.player}`
    },
    definition: 'followPlayer',
}
