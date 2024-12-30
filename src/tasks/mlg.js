'use strict'

const { wrap, sleepG, sleepTicks } = require('../utils/tasks')
const { Vec3 } = require('vec3')
const Vec3Dimension = require('../vec3-dimension')
const Minecraft = require('../minecraft')
const { stringifyItem, isItemEquals } = require('../utils/other')
const { Item } = require('prismarine-item')
const eat = require('./eat')
const CancellationToken = require('../utils/cancellationToken')

/**
 * @typedef {{
 *   type: 'water'
 *   position: Vec3Dimension
 * } | {
 *   type: 'block'
 *   blockName: string
 *   position: Vec3Dimension
 * } | {
 *   type: 'boat'
 *   id: number
 *   dimension: import('mineflayer').Dimension
 * }} MlgJunkBlock
 */

/**
 * @type {import('../task').TaskDef<'ok' | 'failed'>}
 */
module.exports = {
    task: function*(bot) {
        let didMLG = false

        /**
         * @returns {import('../task').Task<Item | null>}
         */
        const equipMlgItem = function*() {
            let haveMlgItem = 0
            let equipped = null
            for (const item of bot.inventoryItems()) {
                if (Minecraft.mlg.boats.includes(item.name) && haveMlgItem < 1) {
                    equipped = yield* bot.equip(item)
                    console.log(`[Bot "${bot.username}"] [MLG] Equipped ${stringifyItem(item)}`)
                    haveMlgItem = 1
                }

                if (Minecraft.mlg.mlgBlocks.includes(item.name) && haveMlgItem < 2) {
                    equipped = yield* bot.equip(item)
                    console.log(`[Bot "${bot.username}"] [MLG] Equipped ${stringifyItem(item)}`)
                    haveMlgItem = 2
                    return equipped
                }
            }

            return equipped
        }

        let equippedMlgItem = null
        if (!(equippedMlgItem = yield* equipMlgItem())) {
            const chorusFruit = bot.searchInventoryItem(null, 'chorus_fruit')
            if (chorusFruit) {
                const eatStarted = performance.now()

                const cancelEat = new CancellationToken()
                const eatTask = eat.task(bot, {
                    food: chorusFruit,
                    cancellationToken: cancelEat,
                })

                while (true) {
                    const v = eatTask.next()
                    if (v.done) return 'ok'
                    if (performance.now() - eatStarted < 1600 &&
                        bot.bot.entity.velocity.y >= Minecraft.general.fallDamageVelocity) {
                        yield* cancelEat.trigger()
                        console.warn(`[Bot "${bot.username}"] [MLG] There was not enough time to eat chorus fruit`)
                        return 'failed'
                    }
                    yield* sleepTicks()
                }
            }

            console.warn(`[Bot "${bot.username}"] [MLG] No suitable item found`)
            return 'failed'
        }

        console.log(`[Bot "${bot.username}"] [MLG] Will use ${bot.bot.heldItem?.name ?? 'null'} ...`)

        while (!didMLG) {
            yield

            try {
                const neighbor = bot.bot.nearestEntity()
                if (neighbor &&
                    Minecraft.mlg.vehicles.includes(neighbor.name) &&
                    bot.bot.entity.position.distanceTo(neighbor.position) < 6) {
                    console.log(`[Bot "${bot.username}"] [MLG] Mounting "${neighbor.name}" ...`)
                    bot.bot.mount(neighbor)
                    didMLG = true
                    yield* sleepG(100)
                    bot.bot.dismount()
                    return 'ok'
                }

                yield* wrap(bot.bot.look(bot.bot.entity.yaw, -Math.PI / 2, true))

                yield

                const reference = bot.bot.blockAtCursor()
                if (!reference) {
                    // console.warn(`[Bot "${bot.username}"] [MLG] No reference block`)
                    continue
                }

                while (reference.position.offset(0.5, 1, 0.5).distanceTo(bot.bot.entity.position.offset(0, 1.6, 0)) > 4) {
                    // console.warn(`[Bot "${bot.username}"] [MLG] Reference block too far away`)
                    yield
                }

                if (!isItemEquals(equippedMlgItem, bot.bot.heldItem)) {
                    if (!(yield* equipMlgItem())) {
                        console.warn(`[Bot "${bot.username}"] [MLG] No suitable item found`)
                        return 'failed'
                    }

                    if (!bot.bot.heldItem) {
                        console.warn(`[Bot "${bot.username}"] [MLG] Not holding anything`)
                        return 'failed'
                    }
                }

                console.log(`[Bot "${bot.username}"] [MLG] Using ${bot.bot.heldItem?.name ?? 'null'} ...`)

                if (bot.bot.heldItem.name === 'water_bucket') {
                    console.log(`[Bot "${bot.username}"] [MLG] Placing water ...`)
                    bot.bot.activateItem(false)
                    didMLG = true

                    yield* sleepTicks(2)

                    const junkBlock = bot.bot.blockAt(reference.position.offset(0, 1, 0))
                    if (junkBlock && junkBlock.name === 'water') {
                        console.log(`[Bot "${bot.username}"] Equip bucket ...`)
                        const bucket = bot.searchInventoryItem(null, 'bucket')
                        if (bucket) {
                            yield* bot.equip(bucket)
                            yield* wrap(bot.bot.lookAt(junkBlock.position, true))
                            bot.bot.activateItem(false)
                            console.log(`[Bot "${bot.username}"] Water cleared`)
                        } else {
                            console.warn(`[Bot "${bot.username}"] No bucket found`)
                            console.log(`[Bot "${bot.username}"] [MLG] Junk water saved`)
                            bot.memory.mlgJunkBlocks.push({
                                type: 'water',
                                position: new Vec3Dimension(junkBlock.position, bot.dimension),
                            })
                        }
                    } else {
                        console.error(`[Bot "${bot.username}"] [MLG] Water not saved`)
                        // bot.memory.mlgJunkBlocks.push({
                        //     type: 'water',
                        //     position: new Vec3Dimension(reference.position.offset(0, 1, 0), bot.dimension),
                        // })
                    }
                } else if (Minecraft.mlg.boats.includes(bot.bot.heldItem.name)) {
                    console.log(`[Bot "${bot.username}"] [MLG] Activating item ...`)
                    bot.bot.activateItem()

                    yield* sleepTicks(2)

                    const junkBoat = bot.bot.nearestEntity((/** @type {import('prismarine-entity').Entity} */ v) => v.name === 'boat')
                    if (junkBoat) {
                        console.log(`[Bot "${bot.username}"] [MLG] Junk boat saved`)
                        bot.memory.mlgJunkBlocks.push({
                            type: 'boat',
                            id: junkBoat.id,
                            dimension: bot.dimension,
                        })

                        console.log(`[Bot "${bot.username}"] [MLG] Mounting "${junkBoat.name}" ...`)
                        bot.bot.mount(junkBoat)
                        didMLG = true
                        yield* sleepG(100)
                        bot.bot.dismount()
                    }
                } else {
                    console.log(`[Bot "${bot.username}"] [MLG] Placing block ...`)
                    yield* wrap(bot.bot.placeBlock(reference, new Vec3(0, 1, 0)))
                    didMLG = true

                    yield* sleepTicks(2)

                    const junkBlock = bot.bot.blockAt(reference.position.offset(0, 1, 0))
                    if (junkBlock) {
                        console.log(`[Bot "${bot.username}"] [MLG] Junk block saved`)
                        bot.memory.mlgJunkBlocks.push({
                            type: 'block',
                            blockName: junkBlock.name,
                            position: new Vec3Dimension(junkBlock.position, bot.dimension),
                        })
                    } else {
                        console.warn(`[Bot "${bot.username}"] [MLG] No junk block saved`)
                    }
                }
            } catch (error) {
                console.error(error)
            }
        }

        if (bot.bot.entity.velocity.y < Minecraft.general.fallDamageVelocity) {
            console.log(`[Bot "${bot.username}"] Already did MLG, just falling ...`)
        }
        while (bot.bot.entity.velocity.y < Minecraft.general.fallDamageVelocity) {
            yield* sleepG(100)
        }

        return 'ok'
    },
    id: function() {
        return `mlg`
    },
    humanReadableId: function() {
        return `MLG`
    },
    definition: 'mlg',
}
