const { Entity } = require('prismarine-entity')
const { error, sleep } = require('../utils')
const AsyncGoal = require('./async-base')
const { Goal } = require('./base')
const GotoGoal = require('./goto')
const Wait = require('./wait')

module.exports = class FishGoal extends AsyncGoal {
    /**
     * @private
     * @type {number}
     */
    splashHeard

    /**
     * @private
     * @type {Entity | null}
     */
    bobber

    /**
     * @param {Goal<any>} parent
     */
    constructor(parent) {
        super(parent)

        this.splashHeard = 0
        this.bobber = null
    }

    /**
     * @override
     * @returns {import('./base').AsyncGoalReturn<true>}
     * @param {import('../context')} context
     */
    async run(context) {
        super.run(context)

        let didSomething = false

        while (true) {
            context.refreshTime()

            const fishingRod = context.searchItem('fishing_rod')
            if (!fishingRod) {
                if (didSomething) { return { result: true } }
                return error(`${this.indent} I have no fishing rod`)
            }

            const water = context.bot.findBlock({
                matching: context.mc.data.blocksByName['water'].id,
                maxDistance: 32,
                useExtraInfo: (water) => {
                    if (context.bot.blockAt(water.position.offset(0, 1, 0)).type !== context.mc.data.blocksByName['air'].id) {
                        return false
                    }
                    return true
                }
            })

            if (!water) {
                if (didSomething) { return { result: true } }
                return error(`${this.indent} There is no water`)
            }

            await (new GotoGoal(this, water.position.clone(), 1, context.restrictedMovements)).wait()

            await context.bot.equip(fishingRod, 'hand')
            await context.bot.lookAt(water.position.offset(0, 0, 0), true)
            await sleep(500)
            context.bot.activateItem(false)
            this.splashHeard = 0
            didSomething = true

            await sleep(100)

            this.bobber = context.bot.nearestEntity((entity) => {
                return entity.name === 'fishing_bobber'
            })

            context.onHeard = async (soundName) => {
                if (soundName !== 'entity.bobber.splash' &&
                    soundName !== 459) { return }
                if (!this.bobber || !this.bobber.isValid) { return }
                this.splashHeard = context.time
                context.onHeard = null
            }

            while ((!this.splashHeard || context.time - this.splashHeard < 500) &&
                   this.bobber && this.bobber.isValid) {
                context.refreshTime()
                await (new Wait(this, 500)).wait()
            }

            if (!context.holds('fishing_rod')) {
                return error(`${this.indent} I have no fishing rod`)
            }

            context.bot.activateItem(false)
        }

        return { result: true }
    }

    /**
     * @override
     * @param {import('../context')} context
     */
    async cancel(context) {
        context.onHeard = null

        if (context.holds('fishing_rod') &&
            this.bobber && this.bobber.isValid) {
            context.bot.activateItem(false)
        }

        super.cancel(context)
    }

    /**
     * @override
     * @param {import('../context')} context
     * @returns {string}
     */
    toReadable(context) {
        return `Fishing`
    }
}
