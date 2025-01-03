'use strict'

const { wrap, runtimeArgs } = require('../utils/tasks')
const goto = require('./goto')
const attack = require('./attack')
const dig = require('./dig')

/**
 * @type {import('../task').TaskDef}
 */
module.exports = {
    task: function*(bot, args) {
        console.log(`[Bot "${bot.username}"] Clearing MLG junk ...`, bot.memory.mlgJunkBlocks)
        for (let i = bot.memory.mlgJunkBlocks.length - 1; i >= 0; i--) {
            yield

            if (args.interrupt.isCancelled) { break }

            const junk = bot.memory.mlgJunkBlocks[i]

            switch (junk.type) {
                case 'water': {
                    if (junk.position.dimension !== bot.dimension) { break }

                    let junkBlock = null
                    let notFirst = false
                    while (junkBlock = bot.bot.findBlock({
                        matching: [
                            bot.mc.registry.blocksByName['water'].id
                        ],
                        maxDistance: 2,
                        point: junk.position.xyz(bot.dimension),
                    })) {
                        yield

                        notFirst = true
                        if (junkBlock.name !== 'water') {
                            console.warn(`[Bot "${bot.username}"] Unknown MLG junk block: "${junkBlock.name}"`)
                            break
                        }

                        console.log(`[Bot "${bot.username}"] Clearing MLG junk: water ...`)
                        yield* goto.task(bot, {
                            block: junkBlock.position,
                            reach: 2,
                            ...runtimeArgs(args),
                        })

                        if (args.interrupt.isCancelled) { break }

                        console.log(`[Bot "${bot.username}"] Equip bucket ...`)
                        const bucket = yield* bot.ensureItem({
                            ...runtimeArgs(args),
                            item: 'bucket',
                            count: 1,
                        })
                        if (!bucket) {
                            console.warn(`[Bot "${bot.username}"] I have no bucket`)
                            break
                        }

                        if (args.interrupt.isCancelled) { break }

                        yield* wrap(bot.bot.equip(bucket, 'hand'), args.interrupt)
                        yield* wrap(bot.bot.lookAt(junkBlock.position, bot.instantLook), args.interrupt)
                        bot.bot.activateItem(false)

                        bot.memory.mlgJunkBlocks.pop()
                    }

                    if (!notFirst) {
                        console.warn(`[Bot "${bot.username}"] No water at ${junk.position.x} ${junk.position.y} ${junk.position.z}`)
                    }

                    break
                }
                case 'block': {
                    if (junk.position.dimension !== bot.dimension) { break }

                    const junkBlock = bot.bot.findBlock({
                        matching: [
                            bot.mc.registry.blocksByName[junk.blockName].id
                        ],
                        maxDistance: 2,
                        point: junk.position.xyz(bot.dimension),
                    })

                    if (!junkBlock) {
                        console.warn(`[Bot "${bot.username}"] No "${junk.blockName}" found at ${junk.position.x} ${junk.position.y} ${junk.position.z}`)
                        continue
                    }

                    yield* dig.task(bot, {
                        block: junkBlock,
                        alsoTheNeighbors: false,
                        pickUpItems: true,
                        ...runtimeArgs(args),
                    })
                    bot.memory.mlgJunkBlocks.pop()
                    break
                }
                case 'boat': {
                    const junkBoat = bot.bot.nearestEntity((/** @type {import('prismarine-entity').Entity} */ v) => v.id === junk.id)
                    if (!junkBoat) {
                        console.warn(`[Bot "${bot.username}"] Junk boat not found`)
                        break
                    }

                    yield* attack.task(bot, {
                        target: junkBoat,
                        useBow: false,
                        useMelee: true,
                        useMeleeWeapon: false,
                        ...runtimeArgs(args),
                    })
                    bot.memory.mlgJunkBlocks.pop()
                    break
                }
                default:
                    console.warn(`[Bot "${bot.username}"] Unknown MLG junk`)
                    bot.memory.mlgJunkBlocks.pop()
                    break
            }
        }
    },
    id: `clear-mlg-junk`,
    humanReadableId: `Clearing MLG junk`,
    definition: 'clearMlgJunk',
}
