const { Block } = require('prismarine-block')
const { sleepG, wrap } = require('../utils/tasks')
const goto = require('./goto')
const Vec3Dimension = require('../vec3-dimension')

/**
 * @param {import('../bruh-bot')} bot
 * @returns {boolean}
 */
function can(bot) {
    const thunderstorm = bot.bot.isRaining && (bot.bot.thunderState > 0)

    if (!thunderstorm && !(bot.bot.time.timeOfDay >= 12541 && bot.bot.time.timeOfDay <= 23458)) {
        return false
    }

    if (bot.bot.isSleeping) {
        return false
    }

    return true
}

/**
 * @type {import('../task').TaskDef<void, { }> & { can: can }}
 */
module.exports = {
    task: function*(bot) {
        /**
         * @type {Block}
         */
        let bed = null
        
        if (bot.memory.myBed) {
            yield* goto.task(bot, { dimension: bot.memory.myBed.dimension })
            bed = bot.bot.blockAt(bot.memory.myBed.xyz(bot.dimension))
        }

        if (!bed ||
            !bot.bot.isABed(bed) ||
            bot.bot.parseBedMetadata(bed)?.occupied) {
            bed = bot.bot.findBlock({
                maxDistance: 32,
                matching: (/** @type {Block} */ block) => {
                    if (!bot.bot.isABed(block)) {
                        return false
                    }
        
                    const _bed = bot.bot.parseBedMetadata(block)
        
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

        if (!bed) {
            throw `No beds found`
        }

        yield* goto.task(bot, {
            block: bed.position,
            timeout: 30000,
        })

        yield* wrap(bot.bot.sleep(bed))

        bot.memory.myBed = new Vec3Dimension(bed.position, bot.dimension)

        while (bot.bot.isSleeping) {
            yield* sleepG(500)
        }
    },
    id: function() {
        return 'sleep'
    },
    humanReadableId: function() {
        return `Sleeping`
    },
    can: can,
}
