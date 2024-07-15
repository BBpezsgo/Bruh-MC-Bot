const { Vec3 } = require('vec3')
const { sleepG, wrap } = require('../utils/tasks')
const { backNForthSort } = require('../utils/other')
const { Block } = require('prismarine-block')
const MC = require('../mc')
const goto = require('./goto')

/**
 * @type {import('../task').TaskDef<number, {
 *   gatherTool: boolean;
 * } & ({
 *   water: Vec3;
 * } | {
 *   nearPlayer: string;
 * } | {
 *   block: Vec3;
 * })>}
 */
module.exports = {
    task: function*(bot, args) {
        if (bot.quietMode) {
            throw `Can't hoe in quiet mode`
        }

        const hoes = [
            bot.mc.data.itemsByName['wooden_hoe'].id,
            bot.mc.data.itemsByName['stone_hoe'].id,
            bot.mc.data.itemsByName['iron_hoe'].id,
            bot.mc.data.itemsByName['golden_hoe'].id,
            bot.mc.data.itemsByName['diamond_hoe'].id,
            bot.mc.data.itemsByName['netherite_hoe'].id,
        ]
        let n = 0

        const equipHoe = function*() {
            for (const hoe of hoes) {
                const hoeItem = bot.searchItem(hoe)
                if (hoeItem) {
                    if (bot.bot.inventory.slots[bot.bot.getEquipmentDestSlot('hand')]?.type !== hoe) {
                        yield* wrap(bot.bot.equip(hoe, 'hand'))
                    }
                    return
                } else if (bot.bot.inventory.slots[bot.bot.getEquipmentDestSlot('hand')]?.type === hoe) {
                    return
                }
            }

            if (!args.gatherTool || true) {
                throw `I don't have a hoe`
            }

            // const gatherResult = await (new GatherItemGoal(this, context.mc.data.itemsByName['wooden_hoe'].id, 1, false, false, false, true)).wait()
            // if ('error' in gatherResult) {
            //     return gatherResult
            // }
            // 
            // await context.bot.equip(context.mc.data.itemsByName['wooden_hoe'].id, 'hand')
            // return { result: true }
        }

        /** @type {Vec3 | null} */
        let water = null

        if ('water' in args) {
            water = args.water
        } else if ('nearPlayer' in args) {
            const target = bot.env.getPlayerPosition(args.nearPlayer)
            if (!target) {
                throw `I can't find you`
            }
        
            water = bot.bot.findBlock({
                matching: [ bot.mc.data.blocksByName['water'].id ],
                point: target.clone(),
                maxDistance: 4,
            })?.position.clone()
            if (!water) {
                throw `There is no water`
            }
        } else if ('block' in args) {
            const dirt = bot.bot.blockAt(args.block)

            const above = bot.bot.blockAt(args.block.offset(0, 1, 0))
            if (above &&
                !MC.replaceableBlocks[above.name ?? '']) {
                throw `Can't break ${above.name ?? 'null'}`
            }

            yield* goto.task(bot, {
                destination: args.block.clone(),
                range: 3,
            })

            if (above &&
                MC.replaceableBlocks[above.name] === 'break') {
                yield* wrap(bot.bot.dig(above, true))
            }

            yield* equipHoe()
            yield
            yield* wrap(bot.bot.activateBlock(dirt))
            n++

            return n
        }

        while (true) {
            yield* equipHoe()

            const filterBlock = (/** @type {Block} */ block) => {
                const above = bot.bot.blockAt(block.position.offset(0, 1, 0))
                if (above && !MC.replaceableBlocks[above.name]) { return false }
                // if (block.skyLight < 7) { return false }
                return true
            }

            const filterPosition = (/** @type {Vec3} */ block) => {
                const dx = Math.abs(block.x - water.x)
                const dy = Math.abs(block.y - water.y)
                const dz = Math.abs(block.z - water.z)
                if (dx > 4 || dz > 4) { return false }
                if (dy > 0) { return false }
                return true
            }

            let dirts = bot.bot.findBlocks({
                matching: (/** @type {Block} */ block) => {
                    if (![ 'grass_block', 'dirt' ].includes(block.name)) { return false }
                    return true
                },
                useExtraInfo: (/** @type {Block} */ block) => {
                    if (!filterBlock(block)) { return false }
                    if (!filterPosition(block.position)) { return false }
                    return true
                },
                point: water.clone(),
                maxDistance: 6,
                count: 80,
            })

            dirts = dirts.filter(filterPosition)
            dirts = backNForthSort(dirts)

            let shouldContinue = false
            for (const dirt of dirts) {
                const above = bot.bot.blockAt(dirt.offset(0, 1, 0))
                if (!MC.replaceableBlocks[above?.name ?? '']) {
                    continue
                }

                yield* goto.task(bot, {
                    destination: dirt.clone(),
                    range: 3,
                })

                if (MC.replaceableBlocks[above.name] === 'break') {
                    yield* wrap(bot.bot.dig(above, true))
                }

                yield* equipHoe()

                yield* sleepG(100)
                yield* wrap(bot.bot.activateBlock(bot.bot.blockAt(dirt)))
                n++
                yield* sleepG(100)
                shouldContinue = true
            }

            if (!shouldContinue) {
                break
            }
        }

        return n
    },
    id: function(args) {
        return `hoe`
    },
    humanReadableId: function(args) {
        if ('nearPlayer' in args) {
            return `Hoeing near ${args.nearPlayer}`
        } else if ('water' in args) {
            return `Hoeing near ${args.water}`
        } else {
            return `Hoeing ${args.block}`
        }
    },
}
