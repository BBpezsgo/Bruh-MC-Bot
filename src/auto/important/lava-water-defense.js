const { Vec3 } = require('vec3')
const tasks = require('../../tasks')
const priorities = require('../../priorities')
const taskUtils = require('../../utils/tasks')

/**
 * @param {import('../../bruh-bot')} bot
 */
module.exports = (bot) => {
    return () => {

        if (!bot.bot.pathfinder.path?.length) {
            if (bot.bot.blocks.at(bot.bot.entity.position.offset(0, 1, 0))?.name === 'lava' ||
                bot.bot.blocks.at(bot.bot.entity.position.offset(0, 0, 0))?.name === 'lava') {
                bot.tasks.push(bot, {
                    task: function(bot, args) {
                        return tasks.goto.task(bot, {
                            goal: {
                                isEnd: (node) => {
                                    const blockGround = bot.bot.blocks.at(node.offset(0, -1, 0))
                                    const blockFoot = bot.bot.blocks.at(node)
                                    const blockHead = bot.bot.blocks.at(node.offset(0, 1, 0))
                                    if (blockFoot.name !== 'lava' &&
                                        blockHead.name !== 'lava' &&
                                        blockGround.name !== 'air' &&
                                        blockGround.name !== 'lava') {
                                        return true
                                    }
                                    return false
                                },
                                heuristic: (node) => {
                                    const dx = bot.bot.entity.position.x - node.x
                                    const dy = bot.bot.entity.position.y - node.y
                                    const dz = bot.bot.entity.position.z - node.z
                                    return Math.sqrt(dx * dx + dz * dz) + Math.abs(dy)
                                },
                            },
                            options: {
                                searchRadius: 20,
                                timeout: 1000,
                            },
                            ...taskUtils.runtimeArgs(args),
                        })
                    },
                    id: `get-out-lava`,
                    humanReadableId: `Getting out of lava`,
                }, {}, priorities.surviving + ((priorities.critical - priorities.surviving) / 2) + 2, false, null, false)
            } else if (bot.bot.oxygenLevel < 20 &&
                (bot.bot.blocks.at(bot.bot.entity.position.offset(0, 1, 0))?.name === 'water' ||
                    bot.bot.blocks.at(bot.bot.entity.position.offset(0, 0, 0))?.name === 'water')) {
                bot.tasks.push(bot, {
                    task: function(bot, args) {
                        return tasks.goto.task(bot, {
                            goal: {
                                isEnd: (node) => {
                                    const blockGround = bot.bot.blocks.at(node.offset(0, -1, 0))
                                    const blockFoot = bot.bot.blocks.at(node)
                                    const blockHead = bot.bot.blocks.at(node.offset(0, 1, 0))
                                    if (blockFoot.name !== 'water' &&
                                        blockHead.name !== 'water' &&
                                        blockGround.name !== 'air' &&
                                        blockGround.name !== 'water') {
                                        return true
                                    }
                                    return false
                                },
                                heuristic: (node) => {
                                    const dx = bot.bot.entity.position.x - node.x
                                    const dy = bot.bot.entity.position.y - node.y
                                    const dz = bot.bot.entity.position.z - node.z
                                    return Math.sqrt(dx * dx + dz * dz) + Math.abs(dy)
                                },
                            },
                            options: {
                                searchRadius: 20,
                            },
                            ...taskUtils.runtimeArgs(args),
                        })
                    },
                    id: `get-out-water`,
                    humanReadableId: `Getting out of water`,
                }, {}, bot.bot.oxygenLevel < 20 ? priorities.surviving + 1 : priorities.low, false, null, false)

                if (bot.bot.pathfinder.path.length === 0) {
                    if (bot.bot.blocks.at(bot.bot.entity.position.offset(0, 0.5, 0))?.name === 'water') {
                        bot.bot.setControlState('jump', true)
                    } else if (bot.bot.controlState['jump']) {
                        bot.bot.setControlState('jump', false)
                    }
                }
            } else {
                /**
                 * @param {Vec3} point
                 */
                const danger = (point) => {
                    let res = 0
                    if (bot.bot.blocks.at(point.offset(0, 0, 0))?.name === 'lava') res++
                    if (bot.bot.blocks.at(point.offset(1, 0, 0))?.name === 'lava') res++
                    if (bot.bot.blocks.at(point.offset(0, 0, 1))?.name === 'lava') res++
                    if (bot.bot.blocks.at(point.offset(0, 0, -1))?.name === 'lava') res++
                    if (bot.bot.blocks.at(point.offset(-1, 0, 0))?.name === 'lava') res++
                    if (bot.bot.blocks.at(point.offset(0, 1, 0))?.name === 'lava') res++
                    if (bot.bot.blocks.at(point.offset(1, 1, 0))?.name === 'lava') res++
                    if (bot.bot.blocks.at(point.offset(0, 1, 1))?.name === 'lava') res++
                    if (bot.bot.blocks.at(point.offset(0, 1, -1))?.name === 'lava') res++
                    if (bot.bot.blocks.at(point.offset(-1, 1, 0))?.name === 'lava') res++
                    if (bot.bot.blocks.at(point.offset(0, -1, 0))?.name === 'lava') res++
                    if (bot.bot.blocks.at(point.offset(1, -1, 0))?.name === 'lava') res++
                    if (bot.bot.blocks.at(point.offset(0, -1, 1))?.name === 'lava') res++
                    if (bot.bot.blocks.at(point.offset(0, -1, -1))?.name === 'lava') res++
                    if (bot.bot.blocks.at(point.offset(-1, -1, 0))?.name === 'lava') res++
                    return res
                }
                if (danger(bot.bot.entity.position.floored())) {
                    bot.tasks.push(bot, {
                        task: tasks.goto.task,
                        id: 'get-away-from-lava',
                        humanReadableId: 'Getting away from lava',
                    }, {
                        goal: {
                            heuristic: (node) => {
                                return 16 - danger(node)
                            },
                            isEnd: (node) => {
                                return danger(node) === 0
                            },
                        },
                        options: {
                            searchRadius: 20,
                            timeout: 1000,
                        },
                    }, priorities.surviving - 50, false, null, false)
                }
            }
        }


        return false
    }
}