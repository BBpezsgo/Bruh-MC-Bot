'use strict'

const { Block } = require('prismarine-block')
const { sleepG, wrap, runtimeArgs } = require('../utils/tasks')
const goto = require('./goto')
const { Vec3 } = require('vec3')
const { Weapons } = require('minecrafthawkeye')
const { Interval, directBlockNeighbors } = require('../utils/other')
const config = require('../config')
const GameError = require('../errors/game-error')
const EnvironmentError = require('../errors/environment-error')

/**
 * @param {import('../bruh-bot')} bot
 * @param {Vec3} waterPosition
 */
function checkTreasure(bot, waterPosition) {
    for (let x = -2; x <= 2; x++) {
        for (let z = -2; z <= 2; z++) {
            for (let y = -2; y < 1; y++) {
                const block = bot.bot.blocks.at(waterPosition.offset(x, y, z))
                if (!block || block.name !== 'water') {
                    // if (block) bot.debug.drawPoint(block.position, [1, 0, 0])
                    return false
                }
                // bot.debug.drawPoint(block.position, [0, 1, 0])
            }
            for (let y = 1; y <= 2; y++) {
                const block = bot.bot.blocks.at(waterPosition.offset(x, y, z))
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
        count: 256,
        useExtraInfo: (/** @type {Block} */ water) => {
            if (bot.bot.blocks.at(water.position.offset(0, 1, 0)).name !== 'air') {
                return false
            }
            if (Number(water.getProperties()['level']) !== 0) {
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
            if (Number(neighbor.getProperties()['level']) !== 0) { continue }
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

        const interval = new Interval(30000 + 2000)

        if (!bot.bot.hawkEye) {
            setTimeout(() => bot.bot.loadPlugin(require('minecrafthawkeye').default), 0)
        }

        const interrupt = () => {
            bot.bot.activateItem(false)
        }

        while (true) {
            yield

            if (args.interrupt.isCancelled) { break }

            const fishingRod = yield* bot.inventory.ensureItem({
                ...runtimeArgs(args),
                item: 'fishing_rod',
                count: 1,
            })
            if (!fishingRod) {
                if (n) { return n }
                throw new GameError(`I have no fishing rod`)
            }

            const water = findWater(bot, true)

            if (!water) {
                if (n) { return n }
                throw new EnvironmentError(`There is no water`)
            }

            /** @type {import('./goto').GoalHawkeye} */ //@ts-ignore
            const hawkeyeGoal = goto.getGoal(bot, {
                hawkeye: water.offset(0.5, 0.5, 0.5),
                weapon: Weapons.bobber,
            }).toArray()[0]

            yield* goto.task(bot, {
                goal: {
                    heuristic: node => {
                        return Math.sqrt(Math.pow(node.x - water.x, 2) + Math.pow(node.z - water.z, 2)) + Math.abs(node.y - water.y + 1)
                    },
                    isEnd: node => {
                        if (node.distanceTo(water) <= 8 && node.y <= water.y) return false
                        if (!hawkeyeGoal.isEnd(node)) return false
                        if (bot.bot.world.raycast(
                            node.offset(0, 1, 0),
                            water.offset(0.5, 0.5, 0.5).subtract(node.offset(0, 1, 0)).normalize(),
                            node.offset(0, 1, 0).distanceTo(water.offset(0.5, 0.5, 0.5))
                        )) return false
                        return true
                    },
                },
                options: {
                    searchRadius: 64,
                },
                ...runtimeArgs(args),
            })

            const grade = bot.bot.hawkEye.getMasterGrade({
                position: water.offset(0.5, 1, 0.5),
                isValid: false,
            }, new Vec3(0, 0, 0), Weapons.bobber)

            if (!grade) { throw new GameError(`No`) }

            // bot.debug.drawLines(grade.arrowTrajectoryPoints, [1, 1, 1])

            if (grade.blockInTrayect) {
                throw new EnvironmentError(`Block ${grade.blockInTrayect.displayName} is in the way`)
            }

            yield* wrap(bot.bot.equip(fishingRod, 'hand'), args.interrupt)
            yield* wrap(bot.bot.look(grade.yaw, grade.pitch, bot.instantLook), args.interrupt)
            yield* sleepG(500)
            args.interrupt.once(interrupt)
            bot.bot.activateItem(false)
            // console.log(`[Bot "${bot.username}"] Bobber thrown`)
            splashHeard = 0
            n++

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
                if (soundName !== 'entity.fishing_bobber.splash' &&
                    soundName !== 518) { return }
                if (!bobber || !bobber.isValid) { return }
                splashHeard = performance.now()
                bot.onHeard = null
            }
            interval.restart()

            while ((!splashHeard || performance.now() - splashHeard < 500) &&
                bobber &&
                bobber.isValid &&
                !args.interrupt.isCancelled) {
                if (interval.done()) {
                    console.warn(`[Bot "${bot.username}"] Fishing timed out (${interval.time / 1000} sec)`)
                    break
                }
                yield* sleepG(100)
            }

            args.interrupt.off(interrupt)
            if (!bot.inventory.holds('fishing_rod')) { continue }

            if (bobber && bobber.isValid) {
                bot.bot.activateItem(false)
                // console.log(`[Bot "${bot.username}"] Bobber retracted`)
            }
        }

        return n
    },
    id: 'fish',
    humanReadableId: `Fishing`,
    definition: 'fish',
}
