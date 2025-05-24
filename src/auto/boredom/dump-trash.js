const priorities = require('../../priorities')
const tasks = require('../../tasks')
const { stringifyItem, Interval } = require('../../utils/other')

/**
 * @param {import('../../bruh-bot')} bot
 */
module.exports = (bot) => {
    const dumpTrashInterval = new Interval(5000)
    const forceDumpTrashInterval = new Interval(120000)

    return () => {
        if (bot.tasks.isIdle && bot.tasks.timeSinceImportantTask > 10000 && dumpTrashInterval.done()) {
            const freeSlots = bot.inventory.inventorySlots().filter(v => !bot.bot.inventory.slots[v]).toArray()
            if (freeSlots.length < 10 || forceDumpTrashInterval?.done()) {
                const trashItems = bot.inventory.getTrashItems()
                bot.tasks.push(bot, {
                    task: tasks.dumpToChest.task,
                    id: 'dump-trash',
                    humanReadableId: 'Dump trash',
                }, {
                    items: trashItems,
                }, priorities.unnecessary, false, null, false)
                    ?.wait()
                    .then(dumped => {
                        if (dumped.isEmpty) return
                        console.log(`Dumped ${dumped.keys.map(v => `${dumped.get(v)} ${stringifyItem(v)}`).join(', ')}`)
                    })
                    .catch(() => { })
            }
        }
        
        return false
    }
}