const { Vec3 } = require('vec3')
const tasks = require('../../tasks')
const priorities = require('../../priorities')

/**
 * @param {import('../../bruh-bot')} bot
 */
module.exports = (bot) => {
    return () => {
        bot.bot.nearestEntity(e => {
            if (!e.velocity.x && !e.velocity.y && !e.velocity.z) { return false }

            if (e.name === 'fireball') {
                const entityPosition = e.position.clone()
                if ('time' in e) {
                    const deltaTime = (performance.now() - e.time) / 1000
                    entityPosition.add(e.velocity.scaled(deltaTime))
                }
                const directionToMe = bot.bot.entity.position.clone().subtract(entityPosition).normalize()
                const fireballDirection = e.velocity.clone().normalize()
                const dot = fireballDirection.dot(directionToMe)
                if (dot < 0) { return false }
                const distance = bot.bot.entity.position.offset(0, 1.6, 0).distanceTo(entityPosition)
                if (distance > 5) { return false }
                if (distance < 3) { return false }
                const ghast = bot.bot.nearestEntity(v => v.name === 'ghast')
                if (ghast) {
                    const directionToGhast = ghast.position.clone().subtract(entityPosition)
                    const yaw = Math.atan2(-directionToGhast.x, -directionToGhast.z)
                    const groundDistance = Math.sqrt(directionToGhast.x * directionToGhast.x + directionToGhast.z * directionToGhast.z)
                    const pitch = Math.atan2(directionToGhast.y, groundDistance)
                    bot.bot.look(yaw, pitch, true)
                }
                console.log(`[Bot "${bot.bot.username}"] Attacking ${e.name ?? e.uuid ?? e.id}`)
                bot.bot.attack(e)
                return true
            }

            if (e.name === 'small_fireball') {
                const entityPosition = e.position.clone()
                if ('time' in e) {
                    const deltaTime = (performance.now() - e.time) / 1000
                    entityPosition.add(e.velocity.scaled(deltaTime))
                }
                const directionToMe = bot.bot.entity.position.clone().subtract(entityPosition).normalize()
                const fireballDirection = e.velocity.clone().normalize()
                const dot = fireballDirection.dot(directionToMe)
                if (dot < 0) { return false }
                const a = entityPosition.clone()
                const b = bot.bot.entity.position.clone().add(
                    fireballDirection.scaled(10)
                )
                bot.debug.drawLine(a, b, [1, 0, 0], [1, 0.4, 0])
                /**
                 * @param {Vec3} p
                 */
                const d = (p) => Math.lineDistanceSquared(p, a, b)
                bot.tasks.push(bot, {
                    task: tasks.goto.task,
                    id: `flee-from-${e.id}`,
                    humanReadableId: `Flee from small fireball`,
                }, {
                    goal: {
                        heuristic: node => {
                            return -d(node.offset(0, 1, 0))
                        },
                        isEnd: node => {
                            return d(node.offset(0, 1, 0)) > 2
                        },
                    },
                    options: {
                        searchRadius: 5,
                        sprint: true,
                        timeout: 500,
                    },
                }, priorities.critical - 1, false, null, false)
                return true
            }

            return false
        })

        return false
    }
}