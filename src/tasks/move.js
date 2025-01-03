'use strict'

const { sleepTicks } = require('../utils/tasks')
const angle = require('mineflayer-movement/src/angle')

/**
 * @typedef {{
 *   goal: MovementGoal;
 *   fov?: number;
 *   rotations?: number;
 *   blend?: number;
 *   freemotion?: boolean;
 *   sprint?: boolean;
 * }} Args
 */

/**
 * @typedef {{
 * [label in import('mineflayer-movement/src/heuristics').HeuristicType]?: import('mineflayer-movement/src/heuristics').HeuristicsMap[label]
 * }} MovementGoal
 */

/**
 * @param {import('../bruh-bot')} bot
 * @param {Args} args
 */
function setControlState(bot, args) {
    bot.bot.movement.setGoal(args.goal)
    const yaw = bot.bot.movement.getYaw(args.fov ?? (args.freemotion ? 360 : 160), args.rotations ?? 15, args.blend ?? 2)
    if (args.freemotion) {
        bot.bot.freemotion.moveTowards(yaw)
        if (angle.difference(bot.bot.entity.yaw, yaw) < Math.PI * 0.75) {
            bot.bot.setControlState('sprint', Boolean(args.sprint))
        } else {
            bot.bot.setControlState('sprint', false)
        }
    } else {
        bot.bot.look(yaw, 0, true)
        bot.bot.setControlState('left', false)
        bot.bot.setControlState('right', true)
        bot.bot.setControlState('back', true)
        bot.bot.setControlState('forward', true)
        bot.bot.setControlState('sprint', Boolean(args.sprint))
    }

    const rotation = Math.rotationToVectorRad(0, yaw)
    if (bot.bot.world.raycast(
        bot.bot.entity.position.offset(0, 0.6, 0),
        rotation,
        bot.bot.controlState.sprint ? 2 : 1) &&
        !bot.bot.world.raycast(
            bot.bot.entity.position.offset(0, 1.6, 0),
            rotation,
            bot.bot.controlState.sprint ? 2 : 1)) {
        bot.bot.jumpQueued = true
    }
}

/**
 * @type {import('../task').TaskDef<void, Args & {
 *   isDone: () => boolean;
 *   update?: (goal: MovementGoal) => void;
 * }> & {
 *   setControlState: setControlState;
 * }}
 */
module.exports = {
    task: function*(bot, args) {
        args.interrupt.on(() => {
            bot.bot.clearControlStates()
            bot.bot.jumpQueued = false
        })

        let lastPosition = bot.bot.entity.position.clone()
        let lastPositionChange = performance.now()

        while (!args.isDone()) {
            args.update?.(args.goal)
            setControlState(bot, args)
            if (bot.bot.controlState.forward || bot.bot.controlState.back || bot.bot.controlState.left || bot.bot.controlState.right) {
                const moved = bot.bot.entity.position.xzDistanceTo(lastPosition)
                if (moved > 0.01) {
                    lastPosition = bot.bot.entity.position.clone()
                    lastPositionChange = performance.now()
                } else if (performance.now() - lastPositionChange > 1000) {
                    console.warn(`[Bot "${bot.username}"] Aint look like I'm moving`)
                    break
                }
            }
            yield* sleepTicks()
        }
        bot.bot.clearControlStates()
    },
    id: `move`,
    humanReadableId: `Move`,
    definition: 'move',
    setControlState: setControlState,
}
