const { Item } = require('prismarine-item')
const { error } = require('../utils')
const AsyncGoal = require('./async-base')
const { Goal } = require('./base')
const GotoBlockGoal = require('./goto-block')
const Wait = require('./wait')
const PickupItemGoal = require('./pickup-item')
const Timeout = require('../timeout')
const { Block } = require('prismarine-block')

module.exports = class CompostGoal extends AsyncGoal {
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

        if (context.quietMode) {
            return error(`${this.indent} Can't compost in quiet mode`)
        }

        while (true) {
            let item = CompostGoal.getItem(context, false)
            if (!item) {
                break
            }

            let composter = context.bot.findBlock({
                matching: context.mc.data.blocksByName['composter'].id,
                maxDistance: 32,
            })

            if (!composter) {
                return error(`There is no composter`)
            }

            const goto = await (new GotoBlockGoal(this, composter.position.clone(), context.restrictedMovements)).wait()
            if ('error' in goto) {
                return error(goto.error)
            }

            composter = context.bot.blockAt(composter.position)
            if (composter.type !== context.mc.data.blocksByName['composter'].id) {
                return error(`Composter destroyed while I was trying to get there`)
            }

            await this.waitCompost(context, composter)

            await context.bot.equip(item, 'hand')
            if (!context.bot.heldItem) {
                continue
            }

            await context.bot.activateBlock(composter)

            await this.waitCompost(context, composter)
        }

        await (new PickupItemGoal(this, { inAir: false, maxDistance: 4 }, null)).wait()

        return { result: true }
    }

    /**
     * @override
     * @param {import('../context')} context
     * @returns {string}
     */
    toReadable(context) {
        return `Compost`
    }

    /**
     * @param {import('../context')} context
     * @param {Block} composter
     */
    async waitCompost(context, composter) {
        if (composter.getProperties()['level'] === 7) {
            const timeout = new Timeout(2000)
            while (!timeout.is() && composter.getProperties()['level'] !== 8) {
                await (new Wait(this, 500)).wait()
            }

            await context.bot.unequip('hand')
            await context.bot.activateBlock(composter)
            return true
        }
        
        if (composter.getProperties()['level'] === 8) {
            await context.bot.unequip('hand')
            await context.bot.activateBlock(composter)
            return true
        }

        return false
    }

    /**
     * @param {import('../context')} context
     * @param {boolean} includeNono
     * @returns {Item | null}
     */
    static getItem(context, includeNono) {
        for (const compostable in context.mc.data2.compost) {
            if (context.mc.data2.compost[compostable].no &&
                !includeNono) {
                continue
            }
            const compostableId = context.mc.data.itemsByName[compostable]?.id
            if (!compostableId) { continue }
            const item = context.searchItem(compostableId)
            if (item) {
                return item
            }
        }
        return null
    }
}
