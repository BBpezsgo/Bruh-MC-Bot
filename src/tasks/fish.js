const { Block } = require('prismarine-block')
const { sleepG, wrap } = require('../utils/tasks')
const goto = require('./goto')
const { Vec3 } = require('vec3')
const { Weapons } = require('minecrafthawkeye')
const { Interval, directBlockNeighbors } = require('../utils/other')
const config = require('../config')

/**
 * @param {import('../bruh-bot')} bot
 * @param {Vec3} waterPosition
 */
function checkTreasure(bot, waterPosition) {
    for (let x = -2; x <= 2; x++) {
        for (let z = -2; z <= 2; z++) {
            for (let y = -2; y < 1; y++) {
                const block = bot.bot.blockAt(waterPosition.offset(x, y, z))
                if (!block || block.name !== 'water') {
                    // if (block) bot.debug.drawPoint(block.position, [1, 0, 0])
                    return false
                }
                // bot.debug.drawPoint(block.position, [0, 1, 0])
            }
            for (let y = 1; y <= 2; y++) {
                const block = bot.bot.blockAt(waterPosition.offset(x, y, z))
                if (!block || block.name !== 'air') {
                    // if (block) bot.debug.drawPoint(block.position, [1, 0, 0])
                    return false
                }
                // bot.debug.drawPoint(block.position, [0, 1, 0])
            }
        }
    }
    return true
}

/**
 * @param {import("../bruh-bot")} bot
 * @param {boolean} preferTreasure
 */
function findWater(bot, preferTreasure) {
    const waters = bot.bot.findBlocks({
        matching: bot.mc.registry.blocksByName['water'].id,
        maxDistance: config.fishing.waterSearchRadius,
        count: 64,
        useExtraInfo: (/** @type {Block} */ water) => {
            if (bot.bot.blockAt(water.position.offset(0, 1, 0)).type !== bot.mc.registry.blocksByName['air'].id) {
                return false
            }
            if (water.getProperties()['level'] !== 0) {
                return false
            }
            return true
        }
    })
    let bestWater = null
    let bestWaterScore = 0
    for (const water of waters) {
        let waterScore = 0
        for (const neighborPosition of directBlockNeighbors(water, 'side')) {
            const neighbor = bot.bot.blockAt(neighborPosition)
            if (!neighbor) { continue }
            if (neighbor.name !== 'water') { continue }
            if (neighbor.getProperties()['level'] !== 0) { continue }
            waterScore++
        }
        if (preferTreasure) {
            const isTreasure = checkTreasure(bot, water)
            if (isTreasure) {
                waterScore += 100
            }
        }
        if (waterScore > bestWaterScore || !bestWater) {
            bestWater = water
            bestWaterScore = waterScore
        }
    }
    return bestWater
}

/**
 * @type {import('../task').TaskDef<number>}
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

        if (!bot.bot.hawkEye) {
            new Promise(resolve => {
                bot.bot.loadPlugin(require('minecrafthawkeye').default)
                resolve()
            })
        }

        while (isFishing) {
            yield

            const fishingRod = yield* bot.ensureItem('fishing_rod')
            if (!fishingRod) {
                if (n) { return n }
                throw `I have no fishing rod`
            }

            const water = findWater(bot, true)

            if (!water) {
                if (n) { return n }
                throw `There is no water`
            }
    
            if (true) {
                yield* goto.task(bot, {
                    point: water.offset(0, 0, 0),
                    distance: 16,
                })
                yield* goto.task(bot, {
                    hawkeye: water.offset(0.5, 0.5, 0.5),
                    weapon: Weapons.bobber,
                })
                const grade = bot.bot.hawkEye.getMasterGrade({
                    position: water.offset(0.5, 0.5, 0.5),
                    isValid: false,
                }, new Vec3(0, 0, 0), Weapons.bobber)

                if (!grade) {
                    throw `No`
                }

                // bot.debug.drawLines(grade.arrowTrajectoryPoints, [1, 1, 1])

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
                if (interval.done()) {
                    console.warn(`[Bot "${bot.username}"] Fishing timed out (${interval.time / 1000} sec)`)
                    break
                }
                yield* sleepG(100)
            }

            if (isFishing && !bot.holds('fishing_rod')) {
                if (n) { return n }
                throw `I have no fishing rod`
            }

            bot.bot.activateItem(false)
        }

        return n
    },
    id: 'fish',
    humanReadableId: `Fishing`,
    definition: 'fish',
}
