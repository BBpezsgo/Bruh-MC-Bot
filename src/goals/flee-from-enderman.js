const { Vec3 } = require('vec3')
const AsyncGoal = require('./async-base')
const { Goal } = require('./base')

module.exports = class FleeFromEndermanGoal extends AsyncGoal {
    /**
     * @param {Goal<any>} parent
     */
    constructor(parent,) {
        super(parent)
    }

    /**
     * @override
     * @returns {import('./base').AsyncGoalReturn<true>}
     * @param {import('../context')} context
     */
    async run(context) {
        super.run(context)
        
        return { result: true }
    }

    /**
     * @param {import('../context')} context
     * @returns {Vec3 | null}
     */
    static getShelter(context) {
        const block = context.bot.findBlock({
            matching: [
                context.mc.data.blocksByName['air'].id,
            ],
            maxDistance: 32,
            useExtraInfo: (block) => {
                if (context.bot.blockAt(block.position.offset(0, 1, 0)).type !== context.mc.data.blocksByName['air'].id) {
                    return false
                }
                if (context.bot.blockAt(block.position.offset(0, 2, 0)).type === context.mc.data.blocksByName['air'].id) {
                    return false
                }
                return true
            }
        })
        if (!block) {
            return null
        }
        return block.position
    }
}