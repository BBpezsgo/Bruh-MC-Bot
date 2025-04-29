'use strict'

const { Block } = require('prismarine-block')
const { sleepG, wrap, runtimeArgs, sleepTicks } = require('../utils/tasks')
const goto = require('./goto')
const Vec3Dimension = require('../utils/vec3-dimension')
const config = require('../config')
const GameError = require('../errors/game-error')
const EnvironmentError = require('../errors/environment-error')
const { Timeout } = require('../utils/other')

/**
 * @param {import('../bruh-bot')} bot
 * @returns {boolean}
 */
function can(bot) {
    if (bot.dimension !== 'overworld') { return false }

    const thunderstorm = bot.bot.isRaining && (bot.bot.thunderState > 0)

    if (!thunderstorm && !(bot.bot.time.timeOfDay >= 12541 && bot.bot.time.timeOfDay <= 23458)) {
        return false
    }

    if (bot.bot.isSleeping) {
        return false
    }

    return true
}

/**
 * @param {import('../bruh-bot')} bot
 */
function wake(bot) {
    if (!bot.bot.isSleeping) return false
    bot.bot._client.write('entity_action', {
        entityId: bot.bot.entity.id,
        actionId: 2,
        jumpBoost: 0
    })
    return true
}

/**
 * @param {import('../bruh-bot')} bot
 * @param {Block} bedBlock
 * @param {import('../utils/interrupt')} interrupt
 */
function* sleep(bot, bedBlock, interrupt) {
    const thunderstorm = bot.bot.isRaining && (bot.bot.thunderState > 0)
    if (!thunderstorm && !(bot.bot.time.timeOfDay >= 12541 && bot.bot.time.timeOfDay <= 23458)) {
        throw new EnvironmentError("It's not night and it's not a thunderstorm")
    }

    if (bot.bot.isSleeping) {
        throw new GameError('Already sleeping')
    }

    if (!bot.bot.isABed(bedBlock)) {
        throw new EnvironmentError('Its aint a bed')
    }

    const metadata = bot.bot.parseBedMetadata(bedBlock)

    if (metadata.occupied) {
        throw new EnvironmentError('The bed is occupied')
    }

    const botPos = bot.bot.entity.position.floored()
    let headPoint = bedBlock.position

    if (!metadata.part) { // Is foot
        const upperBlock = bot.bot.blockAt(bedBlock.position.plus(metadata.headOffset))

        if (bot.bot.isABed(upperBlock)) {
            headPoint = upperBlock.position
        } else {
            const lowerBlock = bot.bot.blockAt(bedBlock.position.plus(metadata.headOffset.scaled(-1)))

            if (bot.bot.isABed(lowerBlock)) {
                // If there are 2 foot parts, minecraft only lets you sleep if you click on the lower one
                headPoint = bedBlock.position
                bedBlock = lowerBlock
            } else {
                throw new EnvironmentError('Half of the bed is missing')
            }
        }
    }

    if (!bot.bot.canDigBlock(bedBlock)) {
        throw new GameError('Can\'t click on the bed')
    }

    const clickRange = [2, -3, -3, 2] // [south, west, north, east]
    const monsterRange = [7, -8, -8, 7]
    const oppositeCardinal = (metadata.facing + 2) % 4

    if (clickRange[oppositeCardinal] < 0) {
        clickRange[oppositeCardinal]--
    } else {
        clickRange[oppositeCardinal]++
    }

    const nwClickCorner = headPoint.offset(clickRange[1], -2, clickRange[2]) // North-West lower corner
    const seClickCorner = headPoint.offset(clickRange[3], 2, clickRange[0]) // South-East upper corner
    if (botPos.x > seClickCorner.x || botPos.x < nwClickCorner.x || botPos.y > seClickCorner.y || botPos.y < nwClickCorner.y || botPos.z > seClickCorner.z || botPos.z < nwClickCorner.z) {
        throw new GameError('The bed is too far')
    }

    if (bot.bot.game.gameMode !== 'creative' || bot.bot.supportFeature('creativeSleepNearMobs')) { // If in creative mode the bot should be able to sleep even if there are monster nearby (starting in 1.13)
        const nwMonsterCorner = headPoint.offset(monsterRange[1], -6, monsterRange[2]) // North-West lower corner
        const seMonsterCorner = headPoint.offset(monsterRange[3], 4, monsterRange[0]) // South-East upper corner

        for (const key of Object.keys(bot.bot.entities)) {
            const entity = bot.bot.entities[key]
            if (entity.kind === 'Hostile mobs') {
                const entityPos = entity.position.floored()
                if (entityPos.x <= seMonsterCorner.x && entityPos.x >= nwMonsterCorner.x && entityPos.y <= seMonsterCorner.y && entityPos.y >= nwMonsterCorner.y && entityPos.z <= seMonsterCorner.z && entityPos.z >= nwMonsterCorner.z) {
                    throw new EnvironmentError('There are monsters nearby')
                }
            }
        }
    }

    bot.bot.activateBlock(bedBlock)

    const timeoutForSleep = new Timeout(3000)
    let isSleeping = false
    const onSleep = () => {
        isSleeping = true
    }
    bot.bot.once('sleep', onSleep)

    interrupt.once(type => {
        if (type === 'cancel') {
            bot.bot.off('sleep', onSleep)
            wake(bot)
        }
    })

    while (!isSleeping) {
        yield* sleepTicks()

        if (timeoutForSleep.done()) {
            bot.bot.off('sleep', onSleep)
            throw new GameError(`Aint sleeping`)
        }
    }
}

/**
 * @type {import('../task').TaskDef & {
 *   can: can
 * }}
 */
module.exports = {
    task: function*(bot, args) {
        if (args.interrupt.isCancelled) { return }

        /**
         * @type {Block}
         */
        let bed = null

        if (bot.memory.myBed) {
            yield* goto.task(bot, {
                dimension: bot.memory.myBed.dimension,
                ...runtimeArgs(args),
            })
            bed = bot.bot.blockAt(bot.memory.myBed.xyz(bot.dimension))
        }

        if (args.interrupt.isCancelled) { return }

        const bedFilter = (/** @type {Block} */ block) => (
            block &&
            bot.bot.isABed(block) &&
            !bot.bot.parseBedMetadata(block)?.occupied
        )

        for (let retry = 0; retry < 20; retry++) {
            if (!bedFilter(bed)) {
                bed = bot.bot.findBlock({
                    maxDistance: config.sleep.bedSearchRadius,
                    matching: (/** @type {Block} */ block) => {
                        if (!bedFilter(block)) {
                            return false
                        }
    
                        if (block.getProperties()['part'] !== 'head') {
                            return false
                        }
    
                        return true
                    },
                })
    
                if (!bed) { throw new EnvironmentError(`No beds found`) }
            }

            yield* goto.task(bot, {
                block: bed.position,
                reach: 3,
                options: {
                    timeout: 30000,
                },
                ...runtimeArgs(args),
            })

            if (args.interrupt.isCancelled) { return }

            bed = bot.bot.blockAt(bed.position)
            if (bedFilter(bed)) { break }
        }

        yield* sleep(bot, bed, args.interrupt)

        bot.memory.myBed = new Vec3Dimension(bed.position, bot.dimension)

        args.interrupt.once((type, reason) => {
            wake(bot)
            console.log(type, reason)
        })

        while (bot.bot.isSleeping) {
            if (args.interrupt.isCancelled) {
                yield* wrap(bot.bot.wake(), args.interrupt)
                break
            }
            yield* sleepG(500)
        }
    },
    id: 'sleep',
    humanReadableId: `Sleeping`,
    definition: 'sleep',
    can: can,
}
