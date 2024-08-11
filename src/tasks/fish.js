const { Block } = require('prismarine-block')
const { sleepG, wrap } = require('../utils/tasks')
const goto = require('./goto')
const { Vec3 } = require('vec3')
const { Weapons } = require('minecrafthawkeye')
const { Interval } = require('../utils/other')

/**
 * @type {import('../task').TaskDef<number, { }>}
 */
module.exports = {
    task: function*(bot, args) {
        let n = 0
        let splashHeard = 0
        /**
         * @type {import('prismarine-entity').Entity | null}
         */
        let bobber = null
        let isFishing = true

        const interval = new Interval(30000 + 2000)

        args.cancel = function*() {
            isFishing = false
        }

        while (isFishing) {
            yield

            const fishingRod = bot.searchItem('fishing_rod')
            if (!fishingRod) {
                if (n) { return n }
                throw `I have no fishing rod`
            }

            let water = bot.bot.findBlock({
                matching: bot.mc.data.blocksByName['water'].id,
                maxDistance: 32,
                useExtraInfo: (/** @type {Block} */ water) => {
                    if (bot.bot.blockAt(water.position.offset(0, 1, 0)).type !== bot.mc.data.blocksByName['air'].id) {
                        return false
                    }
                    return true
                }
            })

            if (!water) {
                if (n) { return n }
                throw `There is no water`
            }

            if (true) {
                yield* goto.task(bot, {
                    point: water.position.offset(0, 0, 0),
                    distance: 4,
                })
                yield* goto.task(bot, {
                    hawkeye: water.position.offset(0, 0.5, 0),
                    weapon: Weapons.bobber,
                })
                const grade = bot.bot.hawkEye.getMasterGrade({
                    position: water.position.offset(0, 0.5, 0),
                    isValid: false,
                }, new Vec3(0, 0, 0), Weapons.bobber)

                if (!grade) {
                    throw `No`
                }

                bot.debug.drawLines(grade.arrowTrajectoryPoints, [1, 1, 1])

                if (grade.blockInTrayect) {
                    throw `Block ${grade.blockInTrayect.displayName} is in the way`
                }

                yield* wrap(bot.bot.equip(fishingRod, 'hand'))
                yield* wrap(bot.bot.look(grade.yaw, grade.pitch, true))
                yield* sleepG(500)
                bot.bot.activateItem(false)
                console.log(`[Bot "${bot.username}"] Bobber thrown`)
                splashHeard = 0
                n++
            } else {
                // yield* goto.task(bot, {
                //     point: water.position,
                //     distance: 1,
                // })
                // 
                // yield* wrap(bot.bot.equip(fishingRod, 'hand'))
                // yield* wrap(bot.bot.lookAt(water.position, true))
                // yield* sleepG(500)
                // bot.bot.activateItem(false)
                // console.log(`[Bot "${bot.username}"] Bobber thrown`)
                // splashHeard = 0
                // n++
            }

            yield* sleepG(100)

            bobber = bot.bot.nearestEntity((/** @type {import('prismarine-entity').Entity} */ entity) => {
                return entity.name === 'fishing_bobber'
            })

            // while (bobber &&
            //     bobber.isValid &&
            //     !bobber.velocity.isZero() &&
            //     isFishing) {
            //     yield* sleepG(100)
            // }

            // console.log(`[Bot "${bot.username}"] Bobber landed`)

            bot.onHeard = async (/** @type {string | number} */ soundName) => {
                if (soundName !== 'entity.bobber.splash' &&
                    soundName !== 488) { return }
                if (!bobber || !bobber.isValid) { return }
                splashHeard = performance.now()
                bot.onHeard = null
            }
            interval.restart()

            while ((!splashHeard || performance.now() - splashHeard < 500) &&
                bobber &&
                bobber.isValid &&
                isFishing) {
                if (interval.is()) {
                    console.warn(`[Bot "${bot.username}"] Fishing timed out (${interval.time / 1000} sec)`)
                    break
                }
                yield* sleepG(100)
            }

            if (isFishing && !bot.holds('fishing_rod')) {
                throw `I have no fishing rod`
            }

            bot.bot.activateItem(false)
        }

        return n
    },
    id: function() {
        return 'fish'
    },
    humanReadableId: function() {
        return `Fishing`
    },
}
