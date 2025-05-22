const GameError = require('../../errors/game-error')
const { Vec3 } = require('vec3')
const EnvironmentError = require('../../errors/environment-error')
const { EntityPose } = require('../../entity-metadata')
const Minecraft = require('../../minecraft')

/**
 * @param {import('../../bruh-bot')} bot
 */
module.exports = (bot) => {
    return () => {
        const hostile = bot.bot.nearestEntity(v => {
            if (v.metadata[2]) { // Has custom name
                // console.log(`"${v.name}": Has custom name`)
                return false
            }
            if (v.metadata[6] === EntityPose.DYING) {
                // console.log(`"${v.name}": Dying`)
                return false
            }

            if (bot.defendMyselfGoal &&
                !bot.defendMyselfGoal.isDone &&
                bot.tasks.get(bot.defendMyselfGoal.id) &&
                'targets' in bot.defendMyselfGoal.args &&
                bot.defendMyselfGoal.args.targets[v.id]) {
                // console.log(`"${v.name}": Already attacking`)
                return false
            }

            const _hostile = Minecraft.hostiles[v.name]
            if (!_hostile) {
                // console.log(`"${v.name}": Not hostile`)
                return false
            }

            if (!_hostile.alwaysAngry) {
                if (v.name === 'enderman') {
                    // Isn't screaming
                    if (!v.metadata[17]) {
                        // console.log(`"${v.name}": Not screaming`)
                        return false
                    }
                } else if (!(v.metadata[15] & 0x04)) { // Not aggressive
                    // console.log(`"${v.name}": Not aggressive`)
                    // console.log(v.name)
                    return false
                }
            }

            if ((typeof v.metadata[15] === 'number') &&
                (v.metadata[15] & 0x01)) { // Has no AI
                // console.log(`"${v.name}": No AI`)
                return false
            }

            const distance = v.position.distanceTo(bot.bot.entity.position)

            if (distance > _hostile.rangeOfSight) {
                // console.log(`${distance.toFixed(2)} > ${_hostile.rangeOfSight.toFixed(2)}`)
                return false
            }

            const raycast = bot.bot.world.raycast(
                bot.bot.entity.position.offset(0, 1.6, 0),
                v.position.clone().subtract(bot.bot.entity.position).normalize(),
                distance + 2,
                block => { return !block.transparent })
            if (raycast) {
                // console.log(`Can't see`)
                return false
            }

            return true
        })

        if (hostile) {
            bot.defendAgainst(hostile)
        }

        return false
    }
}