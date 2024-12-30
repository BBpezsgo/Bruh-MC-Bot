'use strict'

const { wrap } = require('../utils/tasks')
const attack = require('./attack')

/**
 * @type {import('../task').TaskDef<void, {
 *   entity: import('prismarine-entity').Entity;
 *   requestedBy?: string;
 * }>}
 */
module.exports = {
    task: function*(bot, args) {
        const targetPlayer = Object.values(bot.bot.players).find(v => v.entity?.id === args.entity.id)

        if (targetPlayer) {
            if (!args.requestedBy) {
                throw `I can only kill players on command`
            }

            if (targetPlayer.username !== args.requestedBy &&
                targetPlayer.username === 'BB_vagyok') {
                if (!args.response) { throw `I can't ask questions` }
                const confirmation = yield* wrap(args.response.askYesNo(`Do you allow me to kill you? Requested by ${args.requestedBy}`, 10000, targetPlayer.username))
                if (confirmation && !confirmation.message) {
                    throw `${targetPlayer.username} didn't allow this`
                }
            }
        }

        const result = yield* attack.task(bot, {
            target: args.entity,
            useBow: true,
            useMelee: true,
            useMeleeWeapon: true,
        })

        if (!result) {
            throw `I couldn't kill ${targetPlayer ? targetPlayer.username : args.entity.username ?? args.entity.displayName ?? args.entity.name ?? 'someone/something'}`
        }
    },
    id: function(args) {
        return `kill-${args.entity.id}`
    },
    humanReadableId: function(args) {
        return `Kill ${args.entity.username ?? args.entity.displayName ?? args.entity.name ?? 'someone/something'}`
    },
}
