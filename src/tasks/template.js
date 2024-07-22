const { sleepG, wrap } = require('../utils/tasks')

/**
 * @type {import('../task').TaskDef<'ok', null>}
 */
module.exports = {
    task: function*(bot, args) {
        return 'ok'
    },
    id: function(args) {
        return null
    },
    humanReadableId: function(args) {
        return 'idk'
    },
}
