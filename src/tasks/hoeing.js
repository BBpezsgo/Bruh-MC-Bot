const { Vec3 } = require('vec3')
const { sleepG, wrap } = require('../utils/tasks')
const { backNForthSort } = require('../utils/other')
const { Block } = require('prismarine-block')
const Minecraft = require('../minecraft')
const goto = require('./goto')
const Vec3Dimension = require('../vec3-dimension')

/**
 * @type {import('../task').TaskDef<number, {
 *   gatherTool: boolean;
 * } & ({
 *   water: Vec3Dimension;
 * } | {
 *   nearPlayer: string;
 * } | {
 *   block: Vec3Dimension;
 * }), {
 *   hoes: ReadonlyArray<string>;
 *   ensureHoe: (bot: import('../bruh-bot')) => import('../task').Task<boolean>;
 * }>}
 */
module.exports = {
    task: function*(bot, args) {
        if (bot.quietMode) {
            throw `Can't hoe in quiet mode`
        }

        const hoes = this.hoes

        let n = 0

        {
            let hasHoe = false
            for (const hoe of hoes) {
                const hoeItem = bot.searchInventoryItem(null, hoe)
                if (hoeItem) {
                    hasHoe = true
                    break
                } else if (bot.bot.inventory.slots[bot.bot.getEquipmentDestSlot('hand')]?.name === hoe) {
                    hasHoe = true
                    break
                }
            }
            if (!hasHoe) {
                throw `I don't have a hoe`
            }
        }

        const equipHoe = function*() {
            const hoeItem = yield* bot.ensureItems(...hoes)
            if (hoeItem) {
                if (bot.bot.inventory.slots[bot.bot.getEquipmentDestSlot('hand')]?.name !== hoeItem.name) {
                    yield* wrap(bot.bot.equip(bot.mc.registry.itemsByName[hoeItem.name].id, 'hand'))
                }
                return
            } else if (bot.bot.inventory.slots[bot.bot.getEquipmentDestSlot('hand')]?.name === hoeItem.name) {
                return
            }

            throw `I don't have a hoe`
        }

        /** @type {Vec3 | null} */
        let water = null

        if ('water' in args) {
            yield* goto.task(bot, { dimension: args.water.dimension })
            water = args.water.xyz(bot.dimension)
        } else if ('nearPlayer' in args) {
            const target = bot.env.getPlayerPosition(args.nearPlayer)
            if (!target) {
                throw `I can't find you`
            }

            water = bot.bot.findBlock({
                matching: [bot.mc.registry.blocksByName['water'].id],
                point: target.xyz(bot.dimension),
                maxDistance: 4,
            })?.position.clone()
            if (!water) {
                throw `There is no water`
            }
        } else if ('block' in args) {
            yield* goto.task(bot, { dimension: args.block.dimension })

            const dirt = bot.bot.blockAt(args.block.xyz(bot.dimension))

            let above = bot.bot.blockAt(args.block.offset(0, 1, 0).xyz(bot.dimension))

            while (above && Minecraft.replaceableBlocks[above.name] === 'break') {
                if (!bot.env.allocateBlock(bot.username, new Vec3Dimension(above.position, bot.dimension), 'dig')) {
                    console.log(`[Bot "${bot.username}"] Block will be digged by someone else, waiting ...`)
                    yield* bot.env.waitUntilBlockIs(new Vec3Dimension(above.position, bot.dimension), 'dig')
                    above = bot.bot.blockAt(args.block.offset(0, 1, 0).xyz(bot.dimension))
                    continue
                }
            }

            if (above && !Minecraft.replaceableBlocks[above.name]) {
                throw `Can't break ${above.name ?? 'null'}`
            }

            yield* goto.task(bot, {
                block: args.block,
            })

            if (above && Minecraft.replaceableBlocks[above.name] === 'break') {
                yield* wrap(bot.bot.dig(above, true))
            }

            yield* equipHoe()
            yield
            yield* wrap(bot.bot.activateBlock(dirt, null, null, true))
            n++
            yield* sleepG(100)

            return n
        }

        while (true) {
            yield* equipHoe()

            const filterBlock = (/** @type {Block} */ block) => {
                const above = bot.bot.blockAt(block.position.offset(0, 1, 0))
                if (above && !Minecraft.replaceableBlocks[above.name]) { return false }
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
                    if (!['grass_block', 'dirt'].includes(block.name)) { return false }
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
            }).filter(filterPosition).map(v => new Vec3Dimension(v, bot.dimension))
            dirts = backNForthSort(dirts)

            let shouldContinue = false
            for (const dirt of dirts) {
                const above = bot.bot.blockAt(dirt.xyz(bot.dimension).offset(0, 1, 0))
                if (!Minecraft.replaceableBlocks[above?.name ?? '']) {
                    continue
                }

                yield* goto.task(bot, {
                    block: dirt.clone(),
                })

                if (Minecraft.replaceableBlocks[above.name] === 'break') {
                    yield* wrap(bot.bot.dig(above, true))
                }

                yield* equipHoe()

                yield* sleepG(100)
                yield* wrap(bot.bot.activateBlock(bot.bot.blockAt(dirt.xyz(bot.dimension)), null, null, true))
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
    id: function() {
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
    hoes: Object.freeze([
        'wooden_hoe',
        'stone_hoe',
        'iron_hoe',
        'golden_hoe',
        'diamond_hoe',
        'netherite_hoe',
    ]),
}
