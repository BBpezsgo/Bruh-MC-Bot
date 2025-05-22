const config = require('../../config')

/**
 * @param {import('../../bruh-bot')} bot
 */
module.exports = (bot) => {
    return () => {
        const now = performance.now()
        for (const _by of Object.keys(bot.memory.hurtBy)) {
            const entityId = Number(_by)
            const by = bot.memory.hurtBy[entityId]

            for (let i = by.times.length - 1; i >= 0; i--) {
                if (now - by.times[i] > config.hurtByMemory) {
                    by.times.splice(i, 1)
                }
            }

            if (by.times.length === 0 || !by.entity || !by.entity.isValid) {
                delete bot.memory.hurtBy[entityId]
                continue
            }

            const player = by.entity.type === 'player'
                ? Object.values(bot.bot.players).find(v => v && v.entity && Number(v.entity.id) === Number(by.entity.id))
                : null

            if (player && (
                player.gamemode === 1 ||
                player.gamemode === 3 ||
                bots[player.username]
            )) {
                console.warn(`[Bot "${bot.username}"] Can't attack ${by.entity.name}`)
                delete bot.memory.hurtBy[entityId]
                continue
            }

            if (by.entity.type === 'hostile' || by.entity.type === 'mob') {
                bot.defendAgainst(by.entity)
                continue
            }

            if (player && Math.entityDistance(bot.bot.entity.position.offset(0, 1.6, 0), by.entity) < 4) {
                console.log(`[Bot "${bot.bot.username}"] Attacking ${by.entity.name ?? by.entity.uuid ?? by.entity.id}`)
                bot.bot.attack(by.entity)
                delete bot.memory.hurtBy[entityId]
            }
        }

        return false
    }
}