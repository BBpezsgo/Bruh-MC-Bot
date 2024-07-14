const { sleepG, wrap } = require('../utils')

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
}
