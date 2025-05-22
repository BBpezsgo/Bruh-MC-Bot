'use strict'

const { goto } = require('../tasks')
const { incrementalNeighbors, spiralIterator, directBlockNeighbors } = require('../utils/other')
const { Vec3 } = require('vec3')
const dig = require('./dig')
const Vec3Dimension = require('../utils/vec3-dimension')
const placeBlock = require('./place-block')
const config = require('../config')
const { sleepTicks, runtimeArgs, sleepG } = require('../utils/tasks')
const dumpToChest = require('./dump-to-chest')
const Iterable = require('../utils/iterable')
const { Movements } = require('mineflayer-pathfinder')
const GameError = require('../errors/game-error')
const EnvironmentError = require('../errors/environment-error')

/**
 * @param {import('../bruh-bot')} bot
 * @param {Vec3} point
 */
function checkMinePosition(bot, point) {
    for (let x = -2; x <= 2; x++) {
        for (let z = -2; z <= 2; z++) {
            const p = point.offset(x, 0, z)
            if (bot.bot.blocks.at(p).name === 'water') { return false }
        }
    }
    return true
}

/**
 * @param {number} y
 */
function getStaircaseBlock(y) {
    while (y < 0) { y += 8 }
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
 * @type {import('../task').TaskDef<void, {}, {
 *   addMovementExclusions(movements: import('mineflayer-pathfinder').Pathfinder['movements'], bot: import('../bruh-bot')): void
* }>}
 */
module.exports = {
    task: function*(bot, args) {
        const scaffoldingBlocks = [
            'sandstone',
            'cobblestone',
            'cobbled_deepslate',
        ]

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

                        if (args.interrupt.isCancelled) { return }

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
        if (!minePosition) { throw new EnvironmentError(`I couldn't find a place for a new mine`) }

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

        const stripIterator =
            new Iterable(function*() {
                for (let y = 52; y > -60; y -= 4) {
                    yield y
                }
            })
            .map(level =>
                spiralIterator({
                    x: minePosition.x,
                    y: level,
                    z: minePosition.z,
                }, 2, 16)
                .map(v => [v, v.offset(0, 1, 0), v.offset(0, 2, 0)])
                .flat()
                .filter(v => {
                    const chunkMinX = Math.floor(minePosition.x / 16) * 16
                    const chunkMinZ = Math.floor(minePosition.z / 16) * 16
                    const chunkMaxX = chunkMinX + 15
                    const chunkMaxZ = chunkMinZ + 15
                    if (v.x < chunkMinX) return false
                    if (v.z < chunkMinZ) return false
                    if (v.x > chunkMaxX) return false
                    if (v.z > chunkMaxZ) return false
                    const block = bot.bot.blocks.at(v)
                    if (block.name === 'air' || block.name === 'cave_air') return false
                    return true
                })
            )
            .flat()
            [Symbol.iterator]()

        const movements = new Movements(bot.bot, bot.restrictedMovements)
        movements.scafoldingBlocks.push(...scaffoldingBlocks.map(v => bot.bot.registry.blocksByName[v].id))
        movements.maxDropDown = 2

        while (true) {
            if (args.interrupt.isCancelled) { break }

            yield
            const y = startY - (currentYOffset++)
            try {
                /** @type {Array<Vec3>} */
                const digTasks = []

                const staircase = y > -60 ? getStaircaseBlock(y) : null
                if (staircase) {
                    digTasks.push(minePosition.offset(staircase.x, staircase.y + y + 3, staircase.z))
                    digTasks.push(minePosition.offset(staircase.x, staircase.y + y + 2, staircase.z))
                    digTasks.push(minePosition.offset(staircase.x, staircase.y + y + 1, staircase.z))
                    digTasks.push(minePosition.offset(staircase.x, staircase.y + y, staircase.z))
                    digTasks.push(minePosition.offset(0, y, 0))
                } else {
                    const v = stripIterator.next()
                    if (v.done === true) break
                    if (v.value) {
                        digTasks.push(v.value)
                    }
                }

                let segmentFailStreak = 0
                while (digTasks.length > 0) {
                    if (args.interrupt.isCancelled) { break }

                    const digTask = digTasks[0]

                    let block = bot.bot.blocks.at(digTask)
                    if (!block) {
                        yield* goto.task(bot, {
                            point: digTask,
                            distance: 16,
                            options: {
                                movements: movements,
                            },
                            ...runtimeArgs(args),
                        })
                    }
                    block = bot.bot.blocks.at(digTask)
                    if (!block) { throw new GameError(`The chunk where I want to dig aint loaded`) }

                    if (block.name === 'air' ||
                        block.name === 'cave_air') {
                        digTasks.shift()
                        continue
                    }

                    let ohMyGod = false
                    for (const neighborPos of directBlockNeighbors(digTask)) {
                        const neighbor = bot.bot.blocks.at(neighborPos)
                        if (!neighbor) continue
                        if (neighbor.name === 'water' ||
                            neighbor.name === 'lava') {
                            ohMyGod = true
                            break
                        }
                    }

                    if (ohMyGod) {
                        digTasks.shift()
                        console.warn(`[Bot \"${bot.username}\"] Skipping block ${digTask} because oh my god`)
                        continue
                    }

                    let infinityDumpGuard = 0
                    while (true) {
                        let hasFreeSlot = true
                        const drops = bot.mc.registry.blockLoot[block.name]?.drops ?? []
                        for (const drop of drops) {
                            if (bot.inventory.firstFreeInventorySlot(null, drop.item) === null) {
                                hasFreeSlot = false
                                break
                            }
                        }
                        if (hasFreeSlot) break
                        yield* goto.task(bot, {
                            point: originalMinePosition,
                            distance: 5,
                            options: {
                                movements: movements,
                            },
                            ...runtimeArgs(args),
                        })
                        yield* dumpToChest.task(bot, {
                            items: bot.inventory.getTrashItems(),
                            ...runtimeArgs(args),
                        })
                        infinityDumpGuard++
                        if (infinityDumpGuard > 7) { throw new GameError(`My inventory is full`) }
                    }

                    yield
                    try {
                        while (!bot.bot.entity.onGround) { yield* sleepTicks() }
                        const above = bot.bot.blocks.at(digTask.offset(0, 1, 0))
                        if (above.name === 'gravel') {
                            while (bot.bot.blocks.at(digTask)?.name !== 'air') {
                                yield* dig.task(bot, {
                                    block: digTask,
                                    alsoTheNeighbors: false,
                                    pickUpItems: false,
                                    skipIfAllocated: false,
                                    gotoOptions: { movements: movements },
                                    ...runtimeArgs(args),
                                })
                                yield* sleepG(2000)
                            }
                        } else {
                            yield* dig.task(bot, {
                                block: digTask,
                                alsoTheNeighbors: false,
                                pickUpItems: false,
                                skipIfAllocated: false,
                                gotoOptions: { movements: movements },
                                ...runtimeArgs(args),
                            })
                        }
                        digTasks.shift()
                        segmentFailStreak = 0
                    } catch (error) {
                        if (segmentFailStreak++ > digTasks.length) {
                            throw error
                        }
                    }
                }

                if (staircase) {
                    const shouldBeSolid = minePosition.offset(staircase.x, staircase.y + y - 1, staircase.z)
                    if (bot.bot.blocks.at(shouldBeSolid).name === 'air') {
                        const scaffoldingBlock = bot.inventory.searchInventoryItem(null, ...scaffoldingBlocks)
                        if (!scaffoldingBlock) {
                            throw new GameError(`I dont have any scaffolding blocks`)
                        }

                        try {
                            yield* goto.task(bot, {
                                point: shouldBeSolid.clone(),
                                distance: 16,
                                options: {
                                    movements: movements,
                                },
                                ...runtimeArgs(args),
                            })
                        } catch (error) {
                            console.warn(error)
                        }

                        yield* placeBlock.task(bot, {
                            item: scaffoldingBlock,
                            position: shouldBeSolid,
                            gotoOptions: { movements: movements },
                            ...runtimeArgs(args),
                        })
                    }
                }

                didSomethingSinceLastError = true
            } catch (error) {
                if (!didSomethingSinceLastError) { throw error }

                failStreak++
                if (failStreak > 5) { throw error }

                yield* goto.task(bot, {
                    point: originalMinePosition,
                    distance: 2,
                    options: { movements: movements },
                    ...runtimeArgs(args),
                })
                didSomethingSinceLastError = false
                throw error
            }
        }
    },
    id: `mine`,
    humanReadableId: `Mine`,
    addMovementExclusions: function(movements, bot) {
        movements.exclusionAreasBreak.push(block => {
            const v = (() => {
                const staircase = block.position.y > -60 ? getStaircaseBlock(block.position.y) : null
                if (staircase) {
                    for (const _minePosition of bot.env.minePositions) {
                        if (_minePosition.dimension !== bot.dimension) continue
                        const minePosition = _minePosition.xyz(bot.dimension).multiply(new Vec3(1, 0, 1))
                        if (block.position.equals(minePosition.offset(staircase.x, staircase.y + block.position.y + 3, staircase.z))) return 0
                        if (block.position.equals(minePosition.offset(staircase.x, staircase.y + block.position.y + 2, staircase.z))) return 0
                        if (block.position.equals(minePosition.offset(staircase.x, staircase.y + block.position.y + 1, staircase.z))) return 0
                        if (block.position.equals(minePosition.offset(staircase.x, staircase.y + block.position.y, staircase.z))) return 0
                        if (block.position.equals(minePosition.offset(0, block.position.y, 0))) return 0
                    }
                }
                return Infinity
            })()
            if (v === 0) bot.debug.label(block.position, 'dig', 1000)
            return v
        })
        movements.exclusionAreasPlace.push(block => {
            const v = (() => {
                const staircase = block.position.y > -60 ? getStaircaseBlock(block.position.y + 1) : null
                if (staircase) {
                    for (const _minePosition of bot.env.minePositions) {
                        if (_minePosition.dimension !== bot.dimension) continue
                        const minePosition = _minePosition.xyz(bot.dimension).multiply(new Vec3(1, 0, 1))
                        if (block.position.equals(minePosition.offset(staircase.x, staircase.y + block.position.y, staircase.z))) return 0
                    }
                }
                return Infinity
            })()
            if (v === 0) bot.debug.label(block.position, 'place', 1000)
            return v
        })
    },
}
