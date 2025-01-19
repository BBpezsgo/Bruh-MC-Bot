'use strict'

const { Vec3 } = require('vec3')
const { isItemEquals } = require('../utils/other')
const goto = require('./goto')
const { sleepTicks, runtimeArgs } = require('../utils/tasks')
const move = require('./move')

/**
 * @typedef {({
 *   maxDistance: number;
 *   point?: import('vec3').Vec3;
 *   items?: ReadonlyArray<import('../utils/other').ItemId>;
 *   inAir?: boolean;
 *   minLifetime?: number;
 * } | {
 *   item: import('prismarine-entity').Entity;
 *   inAir?: boolean;
 *   minLifetime?: number;
 * }) & {
 *   pathfinderOptions?: import('./goto').GeneralArgs;
 * }} Args
 */

/**
 * @param {import('../bruh-bot')} bot
 * @param {((item: import('prismarine-item').Item) => boolean) | null} filter
 * @param {{
 *   inAir?: boolean;
 *   maxDistance: number;
 *   point?: Vec3;
 *   evenIfFull?: boolean;
 *   minLifetime?: number;
 *   alsoLocked?: boolean;
 * }} args
 * @returns {import('prismarine-entity').Entity | null}
 */
function getClosestItem(bot, filter, args) {
    if (!args.inAir) { args.inAir = false }
    if (!args.maxDistance) { args.maxDistance = 64 }
    if (!args.point) { args.point = bot.bot.entity.position.clone() }
    if (!args.evenIfFull) { args.evenIfFull = false }

    const nearestEntity = bot.bot.nearestEntity((/** @type {import('prismarine-entity').Entity} */ entity) => {
        if (entity.name !== 'item') { return false }
        if (!args.alsoLocked && bot.env.isEntityLocked(entity)) { return false }
        if (!args.inAir && (entity.velocity.distanceTo(new Vec3(0, 0, 0)) > 0.1 && !entity.onGround)) { return false }
        const droppedItem = entity.getDroppedItem()
        if (!droppedItem) { return false }
        if (filter && !filter(droppedItem)) { return false }
        if (!args.evenIfFull && bot.isInventoryFull(droppedItem.name)) { return false }
        if (args.minLifetime && bot.env.entitySpawnTimes[entity.id]) {
            const entityLifetime = performance.now() - bot.env.entitySpawnTimes[entity.id]
            if (entityLifetime < args.minLifetime) {
                return false
            }
        }
        return true
    })
    if (!nearestEntity) { return null }

    const distance = nearestEntity.position.distanceTo(args.point)
    if (distance > args.maxDistance) { return null }

    return nearestEntity
}

/**
 * @type {import('../task').TaskDef<void, Args> & {
 *   can: (bot: import('../bruh-bot'), args: Args) => boolean;
 *   getGoal: (item: import('prismarine-entity').Entity) => import('mineflayer-pathfinder/lib/goals').GoalBase;
 *   getClosestItem: getClosestItem;
 * }}
 */
module.exports = {
    task: function*(bot, args) {
        if (args.interrupt.isCancelled) { return }

        const nearest = (() => {
            if ('item' in args) { return args.item }
            return getClosestItem(bot, args.items ? (item) => args.items.some(v => isItemEquals(v, item)) : null, args)
        })()
        if (!nearest) {
            if ('item' in args) {
                throw `Item entity not found`
            } else {
                return
            }
        }

        const item = nearest.getDroppedItem()
        if (!item) { throw `This aint an item` }

        if (bot.isInventoryFull(item.name)) { throw `Inventory is full` }

        const entityLock = bot.env.tryLockEntity(bot.username, nearest)
        if (!entityLock) { throw `Entity is locked` }

        if (args.minLifetime) {
            while (true) {
                if (!bot.env.entitySpawnTimes[nearest.id]) break
                const entityLifetime = performance.now() - bot.env.entitySpawnTimes[nearest.id]
                if (entityLifetime >= args.minLifetime) break
                yield* sleepTicks()
            }
        }

        if (!args.inAir) {
            while (true) {
                if (nearest.onGround) break
                if (nearest.velocity.distanceTo(new Vec3(0, 0, 0)) <= 0.1) break
                yield* sleepTicks()
            }

        }

        let isCollected = false
        /**
         * @param {import('prismarine-entity').Entity} collector
         * @param {import('prismarine-entity').Entity} collected
         */
        const listener = (collector, collected) => {
            if (collector.id !== bot.bot.entity.id) { return }
            if (collected.id !== nearest.id) { return }
            isCollected = true
            bot.bot.off('playerCollect', listener)
        }
        bot.bot.on('playerCollect', listener)

        try {
            yield* goto.task(bot, {
                goal: this.getGoal(nearest),
                options: args.pathfinderOptions,
                ...runtimeArgs(args),
            })

            const goal = {
                'danger': bot.bot.movement.heuristic.new('danger'),
                'distance': bot.bot.movement.heuristic.new('distance'),
                'proximity': bot.bot.movement.heuristic.new('proximity'),
            }

            const stopMovement = () => {
                bot.bot.clearControlStates()
                bot.bot.jumpQueued = false
            }

            args.interrupt.on(stopMovement)
            try {
                const startWaitAt = performance.now()
                while (true) {
                    yield* sleepTicks()
                    if (isCollected) { break }
                    if (!nearest.isValid) { throw `The item disappeared` }
                    const waitTime = performance.now() - startWaitAt
                    if (waitTime > 5000) { throw `Couldn't pick up the item after ${waitTime.toFixed(2)} sec` }

                    goal.proximity.target(nearest.position)
                    if (bot.bot.entity.position.distanceTo(nearest.position) > 0.5) {
                        move.setControlState(bot, {
                            goal: goal,
                            freemotion: true,
                        })
                    } else {
                        stopMovement()
                    }
                }
            } finally {
                args.interrupt.off(stopMovement)
                stopMovement()
            }
        } catch (error) {
            if (isCollected) { return }
            throw error
        } finally {
            bot.bot.off('playerCollect', listener)
            entityLock.unlock()
        }

        if (!isCollected) { throw `Couldn't pick up the item` }
    },
    id: function(args) {
        if ('item' in args) {
            return `pickup-item-${args.item.id}`
        } else {
            return `pickup-items-${(args.point ? `${Math.round(args.point.x)}-${Math.round(args.point.y)}-${Math.round(args.point.z)}` : 'null')}-${args.inAir}-${args.maxDistance}-${args.minLifetime}`
        }
    },
    humanReadableId: function(args) {
        if ('item' in args) {
            return `Picking up an item`
        } else {
            return `Picking up items`
        }
    },
    definition: 'pickupItem',
    can: function(bot, args) {
        const nearest = (() => {
            if ('item' in args) { return args.item }
            return getClosestItem(bot, args.items ? (item) => args.items.some(v => isItemEquals(v, item)) : null, args)
        })()

        if (!nearest) return false

        const item = nearest.getDroppedItem()
        if (!item) return false

        if (bot.isInventoryFull(item.name)) return false

        const goal = this.getGoal(nearest)
        if (bot.memory.isGoalUnreachable(goal)) return false

        if (bot.env.isEntityLocked(nearest)) return false

        return true
    },
    getGoal: function(item) {
        let lastEntityPosition = item.position.floored()
        return {
            isValid: () => true,
            hasChanged: () => !lastEntityPosition.equals(item.position.floored()),
            refresh: () => lastEntityPosition = item.position.floored(),
            isEnd: node => !item.isValid || node.distanceTo(item.position) <= 2,
            heuristic: node => node.distanceTo(item.position),
        }
    },
    getClosestItem: getClosestItem,
}
