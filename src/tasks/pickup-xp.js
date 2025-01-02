'use strict'

const { Vec3 } = require('vec3')
const { sleepG, runtimeArgs } = require('../utils/tasks')
const goto = require('./goto')

/**
 * @param {import('../bruh-bot')} bot
 * @param {{
 *   maxDistance: number;
 *   alsoUnlocked?: boolean;
 *   point?: Vec3;
 * }} args
 * @returns {import('prismarine-entity').Entity | null}
 */
function getClosestXp(bot, args) {
    const nearestEntity = bot.bot.nearestEntity(entity => (entity.name === 'experience_orb' && (args.alsoUnlocked || !bot.env.isEntityLocked(entity))))
    if (!nearestEntity) { return null }

    const distance = nearestEntity.position.distanceTo(args.point ?? bot.bot.entity.position)
    if (distance > args.maxDistance) { return null }

    return nearestEntity
}

/**
 * @type {import('../task').TaskDef<void, {
 *   maxDistance: number;
 *   alsoUnlocked?: boolean;
 *   point?: Vec3;
 * }> & {
 *   getClosestXp: getClosestXp;
 * }}
 */
module.exports = {
    task: function*(bot, args) {
        if (args.interrupt.isCancelled) { return }

        const nearest = getClosestXp(bot, args)
        if (!nearest) { throw `No xps nearby` }

        const entityLock = bot.env.tryLockEntity(bot.username, nearest)
        if (!entityLock) { throw `Entity is locked` }

        try {
            yield* goto.task(bot, {
                entity: nearest,
                distance: 2, // max: 7.25
                ...runtimeArgs(args),
            })

            while (nearest && nearest.isValid) {
                if (args.interrupt.isCancelled) { break }

                yield* sleepG(100)
            }
        } finally {
            entityLock.isUnlocked = true
        }
    },
    id: function(args) {
        return `pickup-xp-${(args.point ? `${Math.round(args.point.x)}-${Math.round(args.point.y)}-${Math.round(args.point.z)}` : 'null')}-${args.maxDistance}`
    },
    humanReadableId: `Picking up XP orbs`,
    definition: 'pickupXp',
    getClosestXp: getClosestXp,
}
