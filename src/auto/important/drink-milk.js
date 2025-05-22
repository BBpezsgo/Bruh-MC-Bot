const GameError = require('../../errors/game-error')
const priorities = require('../../priorities')
const taskUtils = require('../../utils/tasks')

/**
 * @param {import('../../bruh-bot')} bot
 */
module.exports = (bot) => {
    return () => {

        const badEffects = bot.mc.registry.effectsArray.filter(v => v.type === 'bad').map(v => v.id)

        if (Object.keys(bot.bot.entity.effects).length > 0) {
            for (const badEffect of badEffects) {
                if (bot.bot.entity.effects[badEffect]) {
                    const milk = bot.inventory.searchInventoryItem(null, 'milk_bucket')
                    if (milk) {
                        bot.tasks.push(bot, {
                            task: function*(bot, args) {
                                const milk = bot.inventory.searchInventoryItem(null, 'milk_bucket')
                                if (!milk) { throw new GameError(`I have no milk`) }
                                yield* taskUtils.wrap(bot.bot.equip(milk, 'hand'), args.interrupt)
                                yield* taskUtils.wrap(bot.bot.consume(), args.interrupt)
                            },
                            id: 'consume-milk',
                        }, {}, priorities.critical - 5, false, null, false)
                    }
                }
            }
        }


        return false
    }
}