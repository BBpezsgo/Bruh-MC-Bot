const tasks = require('../../tasks')
const priorities = require('../../priorities')
const { stringifyItem } = require('../../utils/other')

/**
 * @param {import('../../bruh-bot')} bot
 */
module.exports = (bot) => {
    return () => {

        for (const request of bot.env.itemRequests) {
            if (request.lock.by === bot.username) { continue }
            if (request.status) { continue }
            if (!bot.lockedItems.some(v => v === request.lock)) { continue }
            if (!bot.inventory.inventoryItemCount(null, request.lock.item)) { continue }
            bot.tasks.push(bot, {
                task: function*(bot, args) {
                    if (request.status) {
                        console.log(`[Bot "${bot.username}"] Someone else already serving \"${request.lock.by}\" ...`)
                        return
                    }
                    console.log(`[Bot "${bot.username}"] Serving \"${request.lock.by}\" with ${stringifyItem(request.lock.item)} ...`)
                    yield* tasks.giveTo.task(bot, args)
                    console.log(`[Bot "${bot.username}"] \"${request.lock.by}\" served with ${stringifyItem(request.lock.item)}`)
                },
                id: `serve-${request.lock.by}-${stringifyItem(request.lock.item)}-${request.lock.count}`,
                humanReadableId: `Serving ${request.lock.by}`,
            }, {
                request: request,
                waitUntilTargetPickedUp: true,
            }, request.priority ?? priorities.otherBots, false, null, false)
                ?.wait()
                .catch(reason => {
                    console.error(`[Bot "${bot.username}"] Failed to serve \"${request.lock.by}\" with ${stringifyItem(request.lock.item)}:`, reason)
                    request.status = 'failed'
                    request.lock.unlock()
                })
        }

        return false
    }
}