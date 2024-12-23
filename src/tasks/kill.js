'use strict'

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

            if (targetPlayer.username === 'BB_vagyok') {
                const confirmation = yield* bot.askYesNo(`Do you allow me to kill you? Requested by ${args.requestedBy}`, m => bot.bot.whisper(targetPlayer.username, m), targetPlayer.username, 10000)
                if (!confirmation.message) {
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
