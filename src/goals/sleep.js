const { error, sleep } = require("../utils")
const AsyncGoal = require("./async-base")
const { Goal } = require("./base")
const { Vec3 } = require("vec3")
const { Block } = require('prismarine-block')
const GotoBlockGoal = require("./goto-block")

module.exports = class SleepGoal extends AsyncGoal {
    /**
     * @param {Goal<any>} parent
     */
    constructor(parent) {
        super(parent)
    }

    /**
     * @override
     * @returns {import('./base').AsyncGoalReturn<true>}
     * @param {import('../context')} context
     */
    async run(context) {
        super.run(context)

        let bed = SleepGoal.findMyBed(context)

        if (!bed) {
            bed = SleepGoal.findNewBed(context, 32)
        }

        if (!bed) {
            if (this.quiet) {
                return { error: `No beds found` }
            } else {
                return error(`${this.indent} No beds found`)
            }
        }

        await (new GotoBlockGoal(this, bed.position.clone(), context.restrictedMovements)).wait()

        try {
            await context.bot.sleep(bed)
        } catch (_error) {
            return error(_error.toString())
        }

        context.myBed = bed.position.clone()

        while (context.bot.isSleeping) {
            await sleep(500)
        }

        return { result: true }
    }

    /**
     * @param {import('../context')} context
     * @returns {boolean}
     */
    static can(context) {
        const thunderstorm = context.bot.isRaining && (context.bot.thunderState > 0)

        if (!thunderstorm && !(context.bot.time.timeOfDay >= 12541 && context.bot.time.timeOfDay <= 23458)) {
            return false
        }

        if (context.bot.isSleeping) {
            return false
        }

        return true
    }

    /**
     * @param {import('../context')} context
     * @returns {Block | null}
     */
    static findMyBed(context) {
        if (!context.myBed) {
            return null
        }

        const block = context.bot.blockAt(context.myBed)

        if (!block) {
            return null
        }

        if (!context.bot.isABed(block)) {
            return null
        }

        return block
    }

    /**
     * @param {import('../context')} context
     * @param {number} maxDistance
     * @returns {Block | null}
     */
    static findNewBed(context, maxDistance) {
        return context.bot.findBlock({
            maxDistance: maxDistance,
            matching: (block) => {
                if (!context.bot.isABed(block)) {
                    return false
                }

                /**
                 * @type {{
                 *      part: boolean;
                 *      occupied: number;
                 *      facing: number;
                 *      headOffset: Vec3;
                 *  }}
                 */ // @ts-ignore
                const _bed = context.bot.parseBedMetadata(block)

                if (_bed.occupied) {
                    return false
                }

                if (block.getProperties()['part'] !== 'head') {
                    return false
                }

                return true
            },
        })
    }

    /**
     * @override
     * @param {import('../context')} context
     * @returns {string}
     */
    toReadable(context) {
        return `Sleep`
    }
}
