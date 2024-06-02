const { Vec3 } = require('vec3')
const { error } = require('../utils')
const AsyncGoal = require('./async-base')
const { Goal } = require('./base')
const GotoBlockGoal = require('./goto-block')
const Context = require('../context')
const Wait = require('./wait')

module.exports = class DumpToChestGoal extends AsyncGoal {
    /**
     * @private
     * @readonly
     * @type {Array<Vec3>}
     */
    fullChests

    /**
     * @readonly
     * @type {number}
     */
    item

    /**
     * @readonly
     * @type {number}
     */
    count
    
    /**
     * @private
     * @type {number}
     */
    originalCount

    /**
     * @param {Goal<any>} parent
     * @param {number} item
     * @param {number} count
     */
    constructor(parent, item, count) {
        super(parent)

        this.fullChests = [ ]
        this.item = item
        this.count = count
    }

    /**
     * @override
     * @returns {import('./base').AsyncGoalReturn<true>}
     * @param {import('../context')} context
     */
    async run(context) {
        super.run(context)
        
        if (context.quietMode) {
            return error(`${this.indent} Can't open chest in quiet mode`)
        }

        this.originalCount = context.itemCount(this.item)
        
        if (context.itemCount(this.item) === 0) {
            return error(`${this.indent} I don't have any ${context.mc.data.items[this.item].displayName}`)
        }

        while (true) {
            context.refreshTime()

            const have = context.itemCount(this.item)
            if (have === 0) {
                return { result: true }
            }
            const count = Math.max((this.count === Infinity) ? (context.itemCount(this.item)) : (this.count - this.getDumpCount(context)), context.mc.data.items[this.item].stackSize, have)
            if (count === 0) {
                return { result: true }
            }

            const chestBlock = DumpToChestGoal.getChest(context, this.fullChests)

            if (!chestBlock) {
                return error(`${this.indent} There is no chest`)
            }
    
            {
                const r = await (new GotoBlockGoal(this, chestBlock.position.clone(), context.restrictedMovements)).wait()
                if ('error' in r) return r
            }
    
            const chest = await context.bot.openChest(chestBlock)

            {
                let isNewChest = true
                for (const myChest of context.myChests) {
                    if (myChest.equals(chestBlock.position)) {
                        isNewChest = false
                        break
                    }
                }
                
                if (isNewChest) {
                    context.myChests.push(chestBlock.position.clone())
                }
            }
    
            if (Context.firstFreeSlot(chest, this.item) === null) {
                this.fullChests.push(chestBlock.position.clone())
                chest.close()
                continue
            }

            try {
                await chest.deposit(this.item, null, count)
            } catch (_error) {
                chest.close()
                return error(_error)
            }
            
            chest.close()
            await (new Wait(this, 200)).wait()
        }
    }

    /**
     * @param {import('../context')} context
     * @param {Array<Vec3> | null} fullChests
     * @returns {import('prismarine-block').Block | null}
     */
    static getChest(context, fullChests = null) {
        for (const myChest of context.myChests) {
            const myChestBlock = context.bot.blockAt(myChest, true)
            if (myChestBlock && myChestBlock.type === context.mc.data.blocksByName['chest'].id) {
                return myChestBlock
            }
        }
        return context.bot.findBlock({
            matching: context.mc.data.blocksByName['chest'].id,
            useExtraInfo: (block) => {
                if (fullChests) {
                    for (const fullChest of fullChests) {
                        if (fullChest.equals(block.position)) {
                            return false
                        }
                    }
                }
                return true
            }
        })
    }

    /**
     * @param {import('../context')} context
     * @returns {number}
     */
    getDumpCount(context) {
        const have = context.itemCount(this.item)
        return this.originalCount - have
    }
}
