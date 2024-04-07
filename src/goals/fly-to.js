const { Goal } = require('./base')
const { Vec3 } = require('vec3')
const AsyncGoal = require('./async-base')
const { error, sleep } = require('../utils')
const GotoGoal = require('./goto')

/**
 * @extends {AsyncGoal<'here' | 'done'>}
 */
module.exports = class FlyToGoal extends AsyncGoal {
    /**
     * @type {Vec3}
     */
    destination

    /**
     * @private
     * @type {boolean}
     */
    done

    /**
     * @private
     * @type {NodeJS.Timeout}
     */
    timeout

    /**
     * @private
     * @type {boolean}
     */
    isTimeout

    /**
     * @param {Goal<any>} parent
     * @param {Vec3} destination
     */
    constructor(parent, destination) {
        super(parent)

        this.destination = destination
        this.done = false
        this.timeout = null
        this.isTimeout = false
    }

    /**
     * @override
     * @returns {import('./base').AsyncGoalReturn<'here' | 'done'>}
     * @param {import('../context')} context
     */
    async run(context) {
        super.run(context)
        
        const distance = context.bot.entity.position.distanceTo(this.destination)

        if (distance <= 5) {
            return { result: 'here' }
        }

        const elytraItem = context.bot.inventory.findInventoryItem(context.mc.data.itemsByName['elytra'].id, null, false)
        const torsoGear = context.bot.inventory.slots[context.bot.getEquipmentDestSlot('torso')]
        
        if (!elytraItem && !torsoGear || torsoGear.name !== 'elytra') {
            return error(`I have no elytra`)
        }

        if (elytraItem) {
            await context.bot.equip(elytraItem, 'torso')
        }

        const flyStarted = performance.now()

        context.bot.addListener('elytraFlyGoalReached', this.goalReached)

        this.timeout = setTimeout(() => {
            const newDistance = context.bot.entity.position.distanceTo(this.destination)
            const distanceDelta = Math.abs(newDistance - distance)
            if (distanceDelta < 1) {
                this.isTimeout = true
            }
        }, 1000)

        try {
            while (!this.done) {
                context.bot.elytrafly.elytraFlyTo(this.destination.clone())
                if (this.isTimeout) {
                    context.bot.removeListener('elytraFlyGoalReached', this.goalReached)
                    clearTimeout(this.timeout)
                    return error(`Bruh`)
                }

                const now = performance.now()
                if (now - flyStarted > 10) {
                    context.bot.elytrafly.stop()
                    await (new GotoGoal(this, this.destination.clone(), 5, context.restrictedMovements)).wait()
                    return { result: `done` }
                }
                
                await sleep(200)
            }
        } catch (error) {
            context.bot.removeListener('elytraFlyGoalReached', this.goalReached)
            clearTimeout(this.timeout)
            return { error: error }
        }
        
        context.bot.removeListener('elytraFlyGoalReached', this.goalReached)
        clearTimeout(this.timeout)
        return { result: 'done' }
    }
    
    /**
     * @private
     */
    goalReached() {
        this.done = true
    }
}
