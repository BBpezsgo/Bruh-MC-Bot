// @ts-ignore
const { sleepG, wrap } = require('../utils/tasks')

/**
 * @type {import('../task').TaskDef<'ok', null>}
 */
module.exports = {
    // @ts-ignore
    task: function*(bot, args) {
        return 'ok'
    },
    // @ts-ignore
    id: function(args) {
        return null
    },
    // @ts-ignore
    humanReadableId: function(args) {
        return 'idk'
    },
}
