const tasks = require('../../tasks')
const priorities = require('../../priorities')
const taskUtils = require('../../utils/tasks')
const config = require('../../config')

/**
 * @param {import('../../bruh-bot')} bot
 */
module.exports = (bot) => {
    return () => {
        for (const blockAt of bot.touchingBlocks()) {
            if (bot.bot.entity.metadata[0] & 0x01 &&
                blockAt.name !== 'lava') {
                bot.tasks.push(bot, {
                    task: function*(bot, args) {
                        const waterBucketItem = bot.inventory.searchInventoryItem(null, 'water_bucket')
                        if (waterBucketItem) {
                            let refBlock = bot.bot.blockAt(bot.bot.entity.position)
                            if (refBlock.name === 'fire') {
                                yield* bot.blocks.dig(refBlock, 'ignore', false, args.interrupt)
                                yield
                            }
                            refBlock = bot.bot.blockAt(bot.bot.entity.position)
                            if (refBlock.name === 'air') {
                                yield* taskUtils.wrap(bot.bot.lookAt(refBlock.position.offset(0.5, 0.1, 0.5), bot.instantLook), args.interrupt)
                                yield* taskUtils.wrap(bot.bot.equip(waterBucketItem, 'hand'), args.interrupt)
                                bot.bot.activateItem(false)
                                while (bot.bot.entity.metadata[0] & 0x01) {
                                    yield
                                }
                                const bucketItem = bot.inventory.searchInventoryItem(null, 'bucket')
                                if (bucketItem) {
                                    const water = bot.blocks.find({
                                        matching: 'water',
                                        count: 1,
                                        force: true,
                                        maxDistance: 2,
                                    }).filter(Boolean).first()
                                    if (water) {
                                        yield* taskUtils.wrap(bot.bot.equip(bucketItem, 'hand'), args.interrupt)
                                        yield* taskUtils.wrap(bot.bot.lookAt(water.position.offset(0.5, 0.1, 0.5), bot.instantLook), args.interrupt)
                                        bot.bot.activateItem(false)
                                    }
                                }
                                return
                            }
                        }

                        const water = bot.bot.findBlock({
                            matching: bot.mc.registry.blocksByName['water'].id,
                            count: 1,
                            maxDistance: config.criticalSurviving.waterSearchRadius,
                        })
                        if (water) {
                            yield* tasks.goto.task(bot, {
                                point: water.position,
                                distance: 0,
                                options: {
                                    sprint: true,
                                },
                                ...taskUtils.runtimeArgs(args),
                            })
                        }
                    },
                    id: `extinguish-myself`,
                    humanReadableId: `Extinguish myself`,
                }, {}, priorities.critical - 4, false, null, false)
                break
            }

            if (blockAt.name === 'fire') {
                bot.tasks.push(bot, {
                    task: function*(bot, args) {
                        yield* bot.blocks.dig(blockAt, 'ignore', false, args.interrupt)
                    },
                    id: `extinguish-myself`,
                    humanReadableId: `Extinguish myself`,
                }, {}, priorities.critical - 3, false, null, false)
                break
            }

            if (blockAt.name === 'campfire') {
                bot.tasks.push(bot, {
                    task: tasks.goto.task,
                    id: `get-out-campfire`,
                    humanReadableId: `Extinguish myself`,
                }, {
                    flee: blockAt.position,
                    distance: 2,
                }, priorities.critical - 3, false, null, false)
                break
            }
        }

        return false
    }
}