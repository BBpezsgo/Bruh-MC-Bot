const { Vec3 } = require('vec3')
const { wrap } = require('../utils/tasks')
const MC = require('../mc')
const goto = require('./goto')
const Vec3Dimension = require('../vec3-dimension')

/**
 * @type {import('../task').TaskDef<void, { item: number; clearGrass: boolean; }>}
 */
module.exports = {
    task: function*(bot, args) {
        if (bot.quietMode) {
            throw `Can't place block in quiet mode`
        }

        const searchRadius = 5
        const searchHeight = 1
        const faceVector = new Vec3(0, 1, 0)

        /** @type {Vec3 | null} */
        let target = null
        for (let x = -searchRadius; x <= searchRadius; x++) {
            for (let y = -searchHeight; y <= searchHeight; y++) {
                for (let z = -searchRadius; z <= searchRadius; z++) {
                    if (x === 0 &&
                        z === 0) {
                        continue
                    }

                    const current = bot.bot.entity.position.offset(x, y, z)

                    const above = bot.bot.blockAt(current.offset(faceVector.x, faceVector.y, faceVector.z))
                    if (MC.replaceableBlocks[above.name]) {
                        if (!target) {
                            target = current
                        } else {
                            const d1 = target.distanceSquared(bot.bot.entity.position)
                            const d2 = current.distanceSquared(bot.bot.entity.position)
                            if (d2 < d1) {
                                target = current
                            }
                        }
                    }
                }
            }
        }

        if (!target) {
            throw `Couldn't find a place to place the block`
        }

        let above = bot.bot.blockAt(target.offset(faceVector.x, faceVector.y, faceVector.z))
        while (above && MC.replaceableBlocks[above.name] === 'break') {
            if (!bot.env.allocateBlock(bot.bot.username, new Vec3Dimension(above.position, bot.dimension), 'dig')) {
                console.log(`[Bot "${bot.bot.username}"] Block will be digged by someone else, waiting ...`)
                yield* bot.env.waitUntilBlockIs(new Vec3Dimension(above.position, bot.dimension), 'dig')
                above = bot.bot.blockAt(target.offset(faceVector.x, faceVector.y, faceVector.z))
                continue
            }

            if (!args.clearGrass) {
                throw `Can't replant this: block above is "${above.name}" and I'm not allowed to clear grass`
            }

            yield* goto.task(bot, {
                block: above.position,
            })

            yield* wrap(bot.bot.dig(above))
        }

        yield* goto.task(bot, {
            point: target,
            distance: 2,
        })

        yield* wrap(bot.bot.equip(args.item, 'hand'))
        const placeOn = bot.bot.blockAt(target)
        yield* wrap(bot.bot.placeBlock(placeOn, faceVector))
    },
    id: function(args) {
        return `place-block-${args.item}-${args.clearGrass}`
    },
    humanReadableId: function(args) {
        return `Placing ${args.item}`
    },
}
