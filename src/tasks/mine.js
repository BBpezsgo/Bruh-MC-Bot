'use strict'

const { goto } = require('../tasks')
const { incrementalNeighbors } = require('../utils/other')
const { Vec3 } = require('vec3')
const dig = require('./dig')
const Vec3Dimension = require('../vec3-dimension')
const placeBlock = require('./place-block')
const config = require('../config')

/**
 * @param {import('../bruh-bot')} bot
 * @param {Vec3} point
 */
function checkMinePosition(bot, point) {
    for (let x = -2; x <= 2; x++) {
        for (let z = -2; z <= 2; z++) {
            const p = point.offset(x, 0, z)
            if (bot.bot.blockAt(p).name === 'water') { return false }
        }
    }
    return true
}

/**
 * @param {number} y
 */
function getStaircaseBlock(y) {
    switch (y % 8) {
        case 0: return new Vec3(-1, 0, -1)
        case 1: return new Vec3(0, 0, -1)
        case 2: return new Vec3(1, 0, -1)
        case 3: return new Vec3(1, 0, 0)
        case 4: return new Vec3(1, 0, 1)
        case 5: return new Vec3(0, 0, 1)
        case 6: return new Vec3(-1, 0, 1)
        case 7: return new Vec3(-1, 0, 0)
        default: throw new Error()
    }
}

/**
 * @type {import('../task').TaskDef}
 */
module.exports = {
    task: function*(bot, args) {
        if (args.cancellationToken.isCancelled) { return }
        // try {
        //     const movements = new Movements(bot.bot, bot.permissiveMovements)
        //     movements.liquidCost = Infinity
        //     movements.canDig = false
        //     yield* goto.task(bot, {
        //         goal: new goals.GoalY(0),
        //         options: {
        //             movements: movements,
        //         }
        //     })
        // } catch (error) { }

        const botPosition = bot.bot.entity.position.floored()
        let minePosition = null
        searchMinePosition: {
            for (const _minePosition of bot.env.minePositions) {
                if (_minePosition.dimension !== bot.dimension) { continue }
                minePosition = _minePosition.xyz(bot.dimension)
                break
            }
            if (minePosition) { break searchMinePosition }
            for (const x of incrementalNeighbors(botPosition.x, config.mine.placeSearchRadius)) {
                for (const z of incrementalNeighbors(botPosition.z, config.mine.placeSearchRadius)) {
                    for (const y of incrementalNeighbors(botPosition.y, config.mine.placeSearchRadius)) {
                        yield

                        if (args.cancellationToken.isCancelled) { return }

                        const point = new Vec3(x, y, z)
                        if (!checkMinePosition(bot, point)) {
                            bot.debug.drawPoint(point, [1, 1, 0])
                            continue
                        }
                        minePosition = point
                        break searchMinePosition
                    }
                }
            }
        }
        if (!minePosition) { throw `I couldn't find a place for a new mine` }

        {
            let isSaved = false
            for (const _minePosition of bot.env.minePositions) {
                if (_minePosition.dimension !== bot.dimension) { continue }
                if (_minePosition.x !== minePosition.x) { continue }
                if (_minePosition.z !== minePosition.z) { continue }
                isSaved = true
            }
            if (!isSaved) {
                bot.env.minePositions.push(new Vec3Dimension(minePosition, bot.dimension))
            }
        }

        const originalMinePosition = minePosition.clone()
        minePosition.y = 0

        let startY = bot.bot.entity.position.floored().y
        let currentYOffset = 0
        let didSomethingSinceLastError = false
        let failStreak = 0
        while (true) {
            if (args.cancellationToken.isCancelled) { break }

            yield
            const y = startY - (currentYOffset++)
            try {
                const digTasks = []
                const staircase = getStaircaseBlock(y)
                digTasks.push(minePosition.offset(staircase.x, staircase.y + y + 2, staircase.z))
                digTasks.push(minePosition.offset(staircase.x, staircase.y + y + 1, staircase.z))
                digTasks.push(minePosition.offset(staircase.x, staircase.y + y, staircase.z))
                digTasks.push(minePosition.offset(0, y, 0))

                let segmentFailStreak = 0
                while (digTasks.length > 0) {
                    if (args.cancellationToken.isCancelled) { break }

                    yield
                    try {
                        const block = bot.bot.blockAt(digTasks[0])
                        if (block.name === 'air' ||
                            block.name === 'cave_air') {
                            digTasks.shift()
                            continue
                        }
                        // bot.bot.chat(`/setblock ${digTasks[0].x} ${digTasks[0].y} ${digTasks[0].z} air`)
                        // yield* sleepG(100)
                        yield* dig.task(bot, {
                            block: block,
                            alsoTheNeighbors: false,
                            pickUpItems: false,
                            cancellationToken: args.cancellationToken,
                        })
                        digTasks.shift()
                        segmentFailStreak = 0
                    } catch (error) {
                        if (segmentFailStreak++ > digTasks.length) {
                            throw error
                        }
                    }
                }

                const shouldBeSolid = minePosition.offset(staircase.x, staircase.y + y - 1, staircase.z)
                if (bot.bot.blockAt(shouldBeSolid).name === 'air') {
                    const scaffoldingBlock = bot.searchInventoryItem(null, 'sandstone', 'cobblestone', 'cobbled_deepslate')
                    if (scaffoldingBlock) {
                        try {
                            yield* goto.task(bot, {
                                point: shouldBeSolid.clone(),
                                distance: 16,
                                cancellationToken: args.cancellationToken,
                            })
                        } catch (error) {
                            console.warn(error)
                        }
                        yield* placeBlock.task(bot, {
                            item: scaffoldingBlock,
                            position: shouldBeSolid,
                            cancellationToken: args.cancellationToken,
                        })
                    } else {
                        throw `I dont have any scaffolding blocks`
                    }
                    // bot.bot.chat(`/setblock ${shouldBesolid.x} ${shouldBesolid.y} ${shouldBesolid.z} cobblestone`)
                }
                didSomethingSinceLastError = true
            } catch (error) {
                if (!didSomethingSinceLastError) {
                    throw error
                }

                failStreak++
                if (failStreak > 5) {
                    throw error
                }

                currentYOffset--
                if (currentYOffset < 0) {
                    throw error
                }

                console.error(error)
                yield* goto.task(bot, {
                    point: originalMinePosition,
                    distance: 2,
                    cancellationToken: args.cancellationToken,
                })
                didSomethingSinceLastError = false
            }
        }
    },
    id: function(args) {
        return `mine`
    },
    humanReadableId: function(args) {
        return `Mine`
    },
}
