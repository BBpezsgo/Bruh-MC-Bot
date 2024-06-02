const { Goal } = require('./base')
const AsyncGoal = require('./async-base')
const DigGoal = require('./dig')
const { error } = require('../utils')
const { Vec3 } = require('vec3')

/**
 * @extends {AsyncGoal<boolean>}
 */
module.exports = class DigAreaGoal extends AsyncGoal {
    /**
     * @readonly
     * @type {boolean}
     */
    gatherTool

    /**
     * @readonly
     * @type {Vec3}
     */
    a
    
    /**
     * @readonly
     * @type {Vec3}
     */
    b

    /**
     * @param {Goal<any>} parent
     * @param {Vec3} a
     * @param {Vec3} b
     * @param {boolean} gatherTool
     */
    constructor(parent, a, b, gatherTool) {
        super(parent)

        this.a = a
        this.b = b
        this.gatherTool = gatherTool
    }

    /**
     * @override
     * @returns {import('./base').AsyncGoalReturn<boolean>}
     * @param {import('../context')} context
     */
    async run(context) {
        super.run(context)

        if (context.quietMode) {
            return error(`${this.indent} Can't dig in quiet mode`)
        }

        const min = new Vec3(
            Math.min(this.a.x, this.b.x),
            Math.min(this.a.y, this.b.y),
            Math.min(this.a.z, this.b.z)
        )

        const max = new Vec3(
            Math.max(this.a.x, this.b.x),
            Math.max(this.a.y, this.b.y),
            Math.max(this.a.z, this.b.z)
        )

        const skip = [
            context.mc.data.blocksByName['air'].id,
            context.mc.data.blocksByName['cave_air'].id,
        ]

        for (let y = max.y; y >= min.y; y--) {
            for (let x = min.x; x <= max.x; x++) {
                for (let z = min.z; z <= max.z; z++) {
                    context.refreshTime()
                    context.bot.viewer.drawBoxGrid(this.GUID, this.a, this.b)
                    const block = context.bot.blockAt(new Vec3(x, y, z))
                    if (!block || skip.includes(block.type)) { continue }
                    const result = await new DigGoal(context, this, block, this.gatherTool)
                }
            }
        }

        context.bot.viewer.erase(this.GUID)

        return { result: true }
    }

    /**
     * @override
     * @param {import('../context')} context
     * @returns {string}
     */
    toReadable(context) {
        return `Dig area`
    }
}
