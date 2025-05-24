const priorities = require('../../priorities')
const tasks = require('../../tasks')
const { Interval } = require('../../utils/other')

/**
 * @param {import('../../bruh-bot')} bot
 */
module.exports = (bot) => {
    const moveAwayInterval = new Interval(1000)

    return () => {
        if ((bot.tasks.isIdleOrThinking || bot.isFollowingButNotMoving) && moveAwayInterval?.done()) {
            for (const playerName in bot.bot.players) {
                if (playerName === bot.username) { continue }
                const playerEntity = bot.bot.players[playerName].entity
                if (!playerEntity) { continue }
                if (bot.bot.entity.position.distanceTo(playerEntity.position) < 1) {
                    bot.tasks.push(bot, {
                        task: tasks.move.task,
                        id: `move-away-${playerName}`,
                        humanReadableId: `Move away from ${playerName}`,
                    }, {
                        goal: {
                            distance: bot.bot.movement.heuristic.new('distance'),
                            danger: bot.bot.movement.heuristic.new('danger')
                                .weight(5),
                            proximity: bot.bot.movement.heuristic.new('proximity'),
                        },
                        freemotion: true,
                        update: (goal) => {
                            goal.proximity
                                .target(playerEntity.position)
                                .avoid(true)
                        },
                        isDone: () => bot.bot.entity.position.distanceSquared(playerEntity.position) > 1,
                    }, bot._runningTask ? bot._runningTask.priority + 1 : priorities.unnecessary, false, null, false)
                    return true
                }
            }
        }

        return false
    }
}