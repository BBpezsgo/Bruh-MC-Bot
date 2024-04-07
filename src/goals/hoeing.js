const { error, sleep, backNForthSort } = require('../utils')
const AsyncGoal = require('./async-base')
const { Goal } = require('./base')
const { Vec3 } = require('vec3')
const GatherItemGoal = require('./gather-item')
const MC = require('../mc')
const GotoBlockGoal = require('./goto-block')
const { Block } = require('prismarine-block')
const GotoGoal = require('./goto')

module.exports = class HoeingGoal extends AsyncGoal {
    /**
     * @readonly
     * @type {Vec3}
     */
    water

    /**
     * @readonly
     * @type {boolean}
     */
    gatherTool

    /**
     * @param {Goal<any>} parent
     * @param {Vec3} water
     * @param {boolean} gatherTool
     */
    constructor(parent, water, gatherTool) {
        super(parent)

        this.water = water
        this.gatherTool = gatherTool
    }

    /**
     * @override
     * @returns {import('./base').AsyncGoalReturn<true>}
     * @param {import('../context')} context
     */
    async run(context) {
        super.run(context)

        while (true) {
            if (context.bot.inventory.slots[context.bot.getEquipmentDestSlot('hand')]?.type !== context.mc.data.itemsByName['wooden_hoe'].id) {
                const hoe = context.searchItem('wooden_hoe')
                if (!hoe) {
                    if (!this.gatherTool) {
                        return error(`${this.indent} I don't have a hoe`)
                    }
                    const gatherResult = await (new GatherItemGoal(this, context.mc.data.itemsByName['wooden_hoe'].id, 1, false, false, false)).wait()
                    if ('error' in gatherResult) {
                        return gatherResult
                    }
                    await context.bot.equip(context.mc.data.itemsByName['wooden_hoe'].id, 'hand')
                } else {
                    await context.bot.equip(hoe, 'hand')
                }
            }

            const filterBlock = (/** @type {Block} */ block) => {
                const above = context.bot.blockAt(block.position.offset(0, 1, 0))
                if (above && !MC.replaceableBlocks[above.name]) { return false }
                // if (block.skyLight < 7) { return false }
                return true
            }

            const filterPosition = (/** @type {Vec3} */ block) => {
                const dx = Math.abs(block.x - this.water.x)
                const dy = Math.abs(block.y - this.water.y)
                const dz = Math.abs(block.z - this.water.z)
                if (dx > 4 || dz > 4) { return false }
                if (dy > 2) { return false }
                return true
            }

            let dirts = context.bot.findBlocks({
                matching: (block) => {
                    if (![ 'grass_block', 'dirt' ].includes(block.name)) { return false }
                    return true
                },
                useExtraInfo: (block) => {
                    if (!filterBlock(block)) { return false }
                    if (!filterPosition(block.position)) { return false }
                    return true
                },
                point: this.water.clone(),
                maxDistance: 6,
                count: 80,
            })

            dirts = dirts.filter(filterPosition)
            dirts = backNForthSort(dirts)

            let shouldContinue = false
            for (const dirt of dirts) {
                const above = context.bot.blockAt(dirt.offset(0, 1, 0))
                if (!MC.replaceableBlocks[above?.name ?? '']) {
                    continue
                }

                await (new GotoGoal(this, dirt.clone(), 3, context.gentleMovements)).wait()

                if (MC.replaceableBlocks[above.name] === 'break') {
                    await context.bot.dig(above, true)
                }

                const hoe = context.searchItem('wooden_hoe')
                if (!hoe) {
                    shouldContinue = true
                    break
                }

                if (context.bot.inventory.slots[context.bot.getEquipmentDestSlot('hand')]?.type !== context.mc.data.itemsByName['wooden_hoe'].id) {
                    await context.bot.equip(hoe, 'hand')
                }

                await sleep(100)
                await context.bot.activateBlock(context.bot.blockAt(dirt))
                await sleep(100)
                shouldContinue = true
            }

            if (!shouldContinue) {
                break
            }
        }

        return { result: true }
    }

    /**
     * @override
     * @param {import('../context')} context
     * @returns {string}
     */
    toReadable(context) {
        return `Hoeing`
    }
}
