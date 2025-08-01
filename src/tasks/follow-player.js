'use strict'

const { sleepG, wrap, race, withInterruption: withCancellation, sleepTicks, runtimeArgs } = require('../utils/tasks')
const goto = require('./goto')
const config = require('../config')
const Vec3Dimension = require('../utils/vec3-dimension')
const GameError = require('../errors/game-error')
const { Movements } = require('mineflayer-pathfinder')
const { EntityPose } = require('../entity-metadata')

/**
 * @type {import('../task').TaskDef<void, {
 *   player: string;
 *   range: number;
 * }>}
 */
module.exports = {
    task: function*(bot, args) {
        const goal = {
            'distance': bot.bot.movement.heuristic.new('distance'),
            'danger': bot.bot.movement.heuristic.new('danger'),
            'proximity': bot.bot.movement.heuristic.new('proximity'),
            'conformity': bot.bot.movement.heuristic.new('conformity'),
        }

        args.interrupt.on((type) => {
            if (type === 'cancel') bot.bot.clearControlStates()
        })

        while (!args.interrupt.isCancelled) {
            yield

            let target = bot.env.getPlayerPosition(args.player, config.followPlayer.playerPositionMaxAge)

            if (!target) {
                console.warn(`[Bot "${bot.username}"] Can't find ${args.player}, asking for location ...`)

                const askTask = (/** @type {() => import('../task').Task<Vec3Dimension>} */ function*() {
                    let _error = null
                    try {
                        if (args.response) {
                            const _target = (yield* wrap(args.response.askPosition(`I lost you. Where are you?`, 120000, args.player))).message
                            args.response.respond(`${_target.x} ${_target.y} ${_target.z} in ${_target.dimension} I got it`, args.player)
                            console.log(`[Bot "${bot.username}"] Location response: ${_target}`)
                            bot.env.setPlayerPosition(args.player, _target)
                            return _target
                        }
                    } catch (error) {
                        _error = error
                    }

                    const target = bot.env.getPlayerPosition(args.player)
                    if (!target) {
                        throw new GameError(`Can't find ${args.player}`, {
                            cause: _error
                        })
                    }
                    console.warn(`[Bot "${bot.username}"] Player not responded, using outdated position`)
                    return target
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

                const foundTarget = yield* withCancellation(race([askTask, foundTask]), args.interrupt)
                if (foundTarget.cancelled) { break }
                target = foundTarget.result
            }

            if (target.dimension &&
                bot.dimension !== target.dimension) {
                yield* goto.task(bot, {
                    dimension: target.dimension,
                    ...runtimeArgs(args),
                })
                continue
            }

            const distance = bot.bot.entity.position.distanceTo(target.xyz(bot.dimension))

            // if (distance <= args.range) {
            //     bot.bot.clearControlStates()
            //     yield* sleepTicks()
            //     continue
            // }
            // 
            // goal.proximity
            //     .target(target.xyz(bot.dimension))
            // bot.bot.movement.setGoal(goal)
            // const yaw = bot.bot.movement.getYaw(160, 15, 2)
            // const rotation = Math.rotationToVectorRad(0, yaw)
            // bot.bot.look(yaw, 0, true)
            // bot.bot.setControlState('forward', true)
            // bot.bot.setControlState('sprint', distance > 5)
            // bot.bot.setControlState('jump', distance > 8)
            // 
            // /** @type {import('prismarine-world').RaycastResult | null} */
            // const ray = bot.bot.world.raycast(
            //     bot.bot.entity.position.offset(0, 0.6, 0),
            //     rotation,
            //     bot.bot.controlState.sprint ? 2 : 1)
            // if (ray) {
            //     bot.bot.jumpQueued = true
            // }
            // 
            // yield
            // 
            // continue

            try {
                if (bot.bot.players[args.player]?.entity) {
                    const movements = new Movements(bot.bot, bot.restrictedMovements)
                    const _sneak = movements.sneak
                    movements.sneak = () => (_sneak ? _sneak() : false) || (bot.bot.players[args.player].entity?.metadata[6] === EntityPose.SNEAKING)
                    yield* goto.task(bot, {
                        entity: bot.bot.players[args.player].entity,
                        distance: args.range,
                        options: {
                            sprint: distance > 10,
                            movements: movements,
                        },
                        ...runtimeArgs(args),
                    })
                } else {
                    yield* goto.task(bot, {
                        point: target,
                        distance: args.range,
                        options: {
                            sprint: distance > 10,
                        },
                        ...runtimeArgs(args),
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
