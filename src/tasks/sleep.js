const { Block } = require('prismarine-block')
const { sleepG, wrap } = require('../utils/tasks')
const goto = require('./goto')

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
 * @param {import('../bruh-bot')} bot
 * @returns {Block | null}
 */
function findMyBed(bot) {
    if (!bot.memory.myBed) {
        return null
    }

    const block = bot.bot.blockAt(bot.memory.myBed)

    if (!block) {
        return null
    }

    if (!bot.bot.isABed(block)) {
        return null
    }

    if (bot.bot.parseBedMetadata(block)?.occupied) {
        return null
    }

    return block
}

/**
 * @param {import('../bruh-bot')} bot
 * @param {number} maxDistance
 * @returns {Block | null}
 */
function findNewBed(bot, maxDistance) {
    return bot.bot.findBlock({
        maxDistance: maxDistance,
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

/**
 * @type {import('../task').TaskDef<void, { }> & { can: can }}
 */
module.exports = {
    task: function*(bot, args) {
        let bed = findMyBed(bot)

        if (!bed) {
            bed = findNewBed(bot, 32)
        }

        if (!bed) {
            throw `No beds found`
        }

        yield* goto.task(bot, {
            destination: bed.position.clone(),
            range: 3,
            avoidOccupiedDestinations: true,
        })

        yield* wrap(bot.bot.sleep(bed))

        bot.memory.myBed = bed.position.clone()

        while (bot.bot.isSleeping) {
            yield* sleepG(500)
        }
    },
    id: function(args) {
        return 'sleep'
    },
    humanReadableId: function(args) {
        return `Sleeping`
    },
    can: can,
}
