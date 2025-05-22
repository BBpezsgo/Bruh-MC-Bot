const priorities = require('../../priorities')
const tasks = require('../../tasks')
const taskUtils = require('../../utils/tasks')

/**
 * @param {import('../../bruh-bot')} bot
 */
module.exports = (bot) => {
    return () => {
        if (bot.memory.myArrows.length > 0) {
            bot.tasks.push(bot, {
                task: function*(bot, args) {
                    const myArrow = bot.memory.myArrows.shift()
                    if (!myArrow) {
                        return
                    }
                    const entity = bot.bot.nearestEntity((/** @type {import('prismarine-entity').Entity} */ v) => v.id === myArrow)
                    if (!entity) {
                        console.warn(`[Bot "${bot.username}"] Can't find the arrow`)
                        return
                    }
                    yield* tasks.goto.task(bot, {
                        point: entity.position,
                        distance: 1,
                        ...taskUtils.runtimeArgs(args),
                    })
                    yield* taskUtils.sleepG(1000)
                    if (entity.isValid) {
                        console.warn(`[Bot "${bot.username}"] Can't pick up this arrow`)
                    } else {
                        console.log(`[Bot "${bot.username}"] Arrow picked up`)
                    }
                },
                id: `pickup-my-arrows`,
                humanReadableId: `Picking up my arrows`,
            }, {}, priorities.cleanup, false, null, false)
        }

        return false
    }
}