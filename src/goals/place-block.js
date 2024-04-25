const { Goal } = require('./base')
const { Vec3 } = require('vec3')
const MC = require('../mc')
const GotoBlockGoal = require('./goto-block')
const AsyncGoal = require('./async-base')
const { error } = require('../utils')

module.exports = class PlaceBlockAnywhereGoal extends AsyncGoal {
    /**
     * @type {number}
     */
    item

    /**
     * @readonly
     * @type {boolean}
     */
    clearGrass

    /**
     * @param {Goal<any>} parent
     * @param {number} item
     * @param {boolean} clearGrass
     */
    constructor(parent, item, clearGrass) {
        super(parent)

        this.item = item
        this.clearGrass = clearGrass
    }

    /**
     * @override
     * @returns {import('./base').AsyncGoalReturn<true>}
     * @param {import('../context')} context
     */
    async run(context) {
        super.run(context)

        if (context.quietMode) {
            return error(`${this.indent} Can't place block in quiet mode`)
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
    
                    const current = context.bot.entity.position.offset(x, y, z)
    
                    const above = context.bot.blockAt(current.offset(faceVector.x, faceVector.y, faceVector.z))
                    if (MC.replaceableBlocks[above.name]) {
                        if (!target) {
                            target = current
                        } else {
                            const d1 = target.distanceSquared(context.bot.entity.position)
                            const d2 = current.distanceSquared(context.bot.entity.position)
                            if (d2 < d1) {
                                target = current
                            }
                        }
                    }
                }
            }
        }
    
        if (!target) {
            return error(`${this.indent} Couldn't find a place to place the block`)
        }
    
        const above = context.bot.blockAt(target.offset(faceVector.x, faceVector.y, faceVector.z))
        if (MC.replaceableBlocks[above.name] === 'break') {
            if (!this.clearGrass) {
                return error(`${this.indent} Can't replant this: block above it is "${above.name}" and I'm not allowed to clear grass`)
            }

            const subresult = await (new GotoBlockGoal(this, above.position.clone(), context.restrictedMovements)).wait()
            if ('error' in subresult) return error(subresult.error)
            await context.bot.dig(above)
        }
    
        {
            const subresult = await (new GotoBlockGoal(this, target.clone(), context.restrictedMovements)).wait()
            if ('error' in subresult) return error(subresult.error)
        }

        await context.bot.equip(this.item, 'hand')
        const placeOn = context.bot.blockAt(target)
        await context.bot.placeBlock(placeOn, faceVector)

        return { result: true }
    }

    /**
     * @override
     * @param {import('../context')} context
     * @returns {string}
     */
    toReadable(context) {
        return `Place this ${context.mc.data.items[this.item]?.displayName ?? 'something'} somewhere`
    }
}
