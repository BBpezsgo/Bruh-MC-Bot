const { wrap } = require('../utils/tasks')
const goto = require('./goto')
const attack = require('./attack')
const dig = require('./dig')

/**
 * @type {import('../task').TaskDef<void, null>}
 */
module.exports = {
    task: function*(bot, args) {
        console.log(`[Bot "${bot.bot.username}"]: Clearing MLG junk ...`, bot.memory.mlgJunkBlocks)
        for (let i = bot.memory.mlgJunkBlocks.length - 1; i >= 0; i--) {
            yield

            const junk = bot.memory.mlgJunkBlocks.pop()

            switch (junk.type) {
                case 'water': {
                    let junkBlock = null
                    let notFirst = false
                    while (junkBlock = bot.bot.findBlock({
                        matching: [
                            bot.mc.data.blocksByName['water'].id
                        ],
                        maxDistance: 2,
                        point: junk.position,
                    })) {
                        notFirst = true
                        if (junkBlock.name !== 'water') {
                            console.warn(`[Bot "${bot.bot.username}"]: Unknown MLG junk block: "${junkBlock.name}"`)
                            break
                        }
    
                        console.log(`[Bot "${bot.bot.username}"]: Clearing MLG junk: water ...`)
                        yield* goto.task(bot, {
                            destination: junkBlock.position.clone(),
                            range: 1,
                        })
    
                        console.log(`[Bot "${bot.bot.username}"]: Equip bucket ...`)
                        const bucket = bot.searchItem('bucket')
                        if (!bucket) {
                            console.warn(`[Bot "${bot.bot.username}"]: No bucket found`)
                            break
                        }
                        yield* wrap(bot.bot.equip(bucket, 'hand'))
                        yield* wrap(bot.bot.lookAt(junkBlock.position, true))
                        bot.bot.activateItem(false)
                    }

                    if (!notFirst) {
                        console.warn(`[Bot "${bot.bot.username}"]: No water at ${junk.position.x} ${junk.position.y} ${junk.position.z}`)
                    }

                    break
                }
                case 'block': {
                    const junkBlock = bot.bot.findBlock({
                        matching: [
                            bot.mc.data.blocksByName[junk.blockName].id
                        ],
                        maxDistance: 2,
                        point: junk.position,
                    })

                    if (!junkBlock) {
                        console.warn(`[Bot "${bot.bot.username}"]: No "${junk.blockName}" found at ${junk.position.x} ${junk.position.y} ${junk.position.z}`)
                        continue
                    }

                    yield* dig.task(bot, {
                        block: junkBlock
                    })
                    break
                }
                case 'boat': {
                    const junkBoat = bot.bot.nearestEntity((/** @type {import('prismarine-entity').Entity} */ v) => v.id === junk.id)
                    if (!junkBoat) {
                        console.warn(`[Bot "${bot.bot.username}"]: Junk boat not found`)
                        continue
                    }

                    yield* attack.task(bot, {
                        target: junkBoat,
                        useBow: false,
                        useMelee: true,
                        useMeleeWeapon: false
                    })
                    break
                }
                default:
                    console.warn(`[Bot "${bot.bot.username}"]: Unknown MLG junk`)
                    break
            }
        }

        return 'ok'
    },
    id: function(args) {
        return `clear-mlg-junk`
    },
    humanReadableId: function() {
        return `Clearing MLG junk`
    },
}
