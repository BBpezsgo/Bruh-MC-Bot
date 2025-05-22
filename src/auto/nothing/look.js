const { Interval } = require('../../utils/other')

/**
 * @param {import('../../bruh-bot')} bot
 */
module.exports = (bot) => {
    const randomLookInterval = new Interval(5000)
    const lookAtPlayerTimeout = new Interval(3000)
    let _lookAtPlayer = 0

    const lookAtNearestPlayer = function() {
        const selfEye = (bot.bot.entity.metadata[6] === 5)
            ? bot.bot.entity.position.offset(0, 1.2, 0)
            : bot.bot.entity.position.offset(0, 1.6, 0)

        const players = Object.values(bot.bot.players)
            .filter(v => v.username !== bot.username)
            .filter(v => !bots[v.username])
            .filter(v => v.entity)
            .filter(v => v.entity.position.distanceTo(bot.bot.entity.position) < 5)
            .filter(v => {
                const playerEye = (v.entity.metadata[6] === 5)
                    ? v.entity.position.offset(0, 1.2, 0)
                    : v.entity.position.offset(0, 1.6, 0)

                const dirToSelf = selfEye.clone().subtract(playerEye).normalize()
                const playerDir = Math.rotationToVectorRad(v.entity.pitch, v.entity.yaw)
                return dirToSelf.dot(playerDir) > 0.9
            })

        if (players.length === 0) { return false }

        if (lookAtPlayerTimeout.done()) {
            lookAtPlayerTimeout.restart()
            _lookAtPlayer++
        }

        while (_lookAtPlayer < 0) {
            lookAtPlayerTimeout.restart()
            _lookAtPlayer += players.length
        }

        while (_lookAtPlayer >= players.length) {
            lookAtPlayerTimeout.restart()
            _lookAtPlayer -= players.length
        }

        const selected = players[_lookAtPlayer]

        if (!selected?.entity) { return false }

        const playerEye = (selected.entity.metadata[6] === 5)
            ? selected.entity.position.offset(0, 1.2, 0)
            : selected.entity.position.offset(0, 1.6, 0)

        bot.bot.lookAt(playerEye, false)
        return true
    }

    const lookRandomly = function() {
        const pitch = Math.randomInt(-40, 30)
        const yaw = Math.randomInt(-180, 180)
        return bot.bot.look(yaw * Math.deg2rad, pitch * Math.deg2rad, false)
    }

    return () => {
        if (bot.tasks.isIdleOrThinking || bot.isFollowingButNotMoving) {
            if ((!bot.tasks.isIdleOrThinking || bot.tasks.timeSinceImportantTask > 1000) && lookAtNearestPlayer()) {
                randomLookInterval?.restart()
                return true
            }

            if ((!bot.tasks.isIdle || bot.tasks.timeSinceImportantTask > 1000) && randomLookInterval?.done()) {
                lookRandomly()
                return true
            }
        }

        return false
    }
}