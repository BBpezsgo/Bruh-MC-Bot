const { Block } = require('prismarine-block')
const { sleepG, wrap } = require('../utils/tasks')
const goto = require('./goto')

/**
 * @type {import('../task').TaskDef<boolean, { }>}
 */
module.exports = {
    task: function*(bot) {
        let n = 0
        let splashHeard = 0
        /**
         * @type {import('prismarine-entity').Entity | null}
         */
        let bobber = null
    
        while (true) {
            yield
    
            const fishingRod = bot.searchItem('fishing_rod')
            if (!fishingRod) {
                if (n) { return n }
                throw `I have no fishing rod`
            }
    
            const water = bot.bot.findBlock({
                matching: bot.mc.data.blocksByName['water'].id,
                maxDistance: 32,
                useExtraInfo: (/** @type {Block} */ water) => {
                    if (bot.bot.blockAt(water.position.offset(0, 1, 0)).type !== bot.mc.data.blocksByName['air'].id) {
                        return false
                    }
                    return true
                }
            })
    
            if (!water) {
                if (n) { return n }
                throw `There is no water`
            }
    
            yield* goto.task(bot, {
                point: water.position,
                distance: 1,
            })
    
            yield* wrap(bot.bot.equip(fishingRod, 'hand'))
            yield* wrap(bot.bot.lookAt(water.position, true))
            yield* sleepG(500)
            bot.bot.activateItem(false)
            splashHeard = 0
            n++
    
            yield* sleepG(100)
    
            bobber = bot.bot.nearestEntity((/** @type {import('prismarine-entity').Entity} */ entity) => {
                return entity.name === 'fishing_bobber'
            })
    
            bot.onHeard = async (/** @type {string | number} */ soundName) => {
                if (soundName !== 'entity.bobber.splash' &&
                    soundName !== 488) { return }
                if (!bobber || !bobber.isValid) { return }
                splashHeard = performance.now()
                bot.onHeard = null
            }
    
            while ((!splashHeard || performance.now() - splashHeard < 500) && bobber && bobber.isValid) {
                yield* sleepG(100)
            }
    
            if (!bot.holds('fishing_rod')) {
                throw `I have no fishing rod`
            }
    
            bot.bot.activateItem(false)
        }
    },
    id: function() {
        return 'fish'
    },
    humanReadableId: function() {
        return `Fishing`
    },
}
