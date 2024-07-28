const { goals, Movements } = require('mineflayer-pathfinder')
const { wrap } = require('../utils/tasks')
const { Vec3 } = require('vec3')
const { Timeout } = require('../utils/other')
const Vec3Dimension = require('../vec3-dimension')

class GoalBlockSimple extends goals.Goal {
    /**
     * @param {Vec3} pos
     * @param {{ reach?: number; entityHeight?: number; }} [options={}]
     */
    constructor(pos, options = {}) {
        super()
        this.pos = pos
        this.reach = options.reach || 4.5
        this.entityHeight = options.entityHeight || 1.6
    }

    /**
     * @param {Vec3} node
     */
    heuristic(node) {
        const dx = node.x - this.pos.x
        const dy = node.y - this.pos.y
        const dz = node.z - this.pos.z
        const distanceXZ = Math.sqrt(Math.pow(dx, 2) + Math.pow(dz, 2))
        return distanceXZ + Math.abs(dy < 0 ? dy + 1 : dy)
    }

    /**
     * @param {Vec3} node
     */
    isEnd(node) {
        if (node.distanceTo(this.pos.offset(0, this.entityHeight, 0)) > this.reach) return false
        return true
    }
}

/**
 * @exports @typedef {{
 *   timeout?: number;
 *   searchRadius?: number;
 *   movements?: Readonly<Movements>;
 * }} GeneralArgs
 */

/**
 * @exports @typedef {{
 *   point: Readonly<Vec3Dimension>;
 *   distance?: number;
 *   ignoreOthers?: boolean;
 * }} GotoArgs
 */

/**
 * @exports @typedef {{
 *   dimension: import('mineflayer').Dimension;
 * }} GotoDimensionArgs
 */

/**
 * @exports @typedef {{
 *   block: Readonly<Vec3Dimension>;
 *   reach?: number;
 * }} LookAtArgs
 */

/**
 * @exports @typedef {{
 *   place: Readonly<Vec3Dimension>;
 *   LOS?: boolean;
 *   facing?: 'north' | 'east' | 'south' | 'west' | 'up' | 'down';
 *   faces?: Readonly<[Vec3, Vec3, Vec3, Vec3, Vec3, Vec3]>;
 *   half?: 'top' | 'bottom';
 * }} PlaceArgs
 */

/**
 * @exports @typedef {{
 *   flee: Readonly<Vec3>;
 *   distance: number;
 * }} FleeArgs
 */

/**
 * @type {import('../task').TaskDef<void | 'here', (GotoArgs | LookAtArgs | PlaceArgs | FleeArgs | GotoDimensionArgs) & GeneralArgs, Error>}
 */
module.exports = {
    /**
     * @throws {Error} `NoPath`, `Timeout`, `GoalChanged`, `PathStopped`
     */
    task: function*(bot, args) {
        /**
         * @type {goals.Goal | null}
         */
        let goal = null

        if ('dimension' in args) {
            let remainingTravels = 3
            while (true) {
                remainingTravels--
                if (remainingTravels <= 0) { throw `I lost :(` }

                try {
                    switch (args.dimension) {
                        case 'the_end':
                            switch (bot.bot.game.dimension) {
                                case 'the_nether': {
                                    const portal = bot.bot.findBlock({
                                        matching: bot.mc.data.blocksByName['nether_portal'].id,
                                        count: 1,
                                        maxDistance: 128,
                                    })
                                    if (!portal) { throw `I couldn't find the nether portal` }
                                    const movements = new Movements(bot.bot)
                                    bot.mc.setRestrictedMovements(movements)
                                    movements.blocksToAvoid.delete(bot.mc.data.blocksByName['nether_portal'].id)
                                    yield* this.task(bot, {
                                        point: new Vec3Dimension(portal.position, bot.bot.game.dimension),
                                        distance: 0,
                                        movements: movements,
                                    })
                                    const timeout = new Timeout(10000)
                                    // @ts-ignore
                                    while (bot.bot.game.dimension !== 'overworld' && !timeout.done()) { yield }
                                    break
                                }
                                case 'overworld': {
                                    const portal = bot.bot.findBlock({
                                        matching: bot.mc.data.blocksByName['end_portal'].id,
                                        count: 1,
                                        maxDistance: 128,
                                    })
                                    if (!portal) { throw `I couldn't find the end portal` }
                                    const movements = new Movements(bot.bot)
                                    bot.mc.setRestrictedMovements(movements)
                                    movements.blocksToAvoid.delete(bot.mc.data.blocksByName['end_portal'].id)
                                    yield* this.task(bot, {
                                        point: new Vec3Dimension(portal.position, bot.bot.game.dimension),
                                        distance: 0,
                                        movements: movements,
                                    })
                                    const timeout = new Timeout(10000)
                                    // @ts-ignore
                                    while (bot.bot.game.dimension !== 'the_end' && !timeout.done()) { yield }
                                    break
                                }
                                case 'the_end': {
                                    return 'here'
                                }
                            }
                            break
                        case 'the_nether':
                            switch (bot.bot.game.dimension) {
                                case 'the_nether': {
                                    return 'here'
                                }
                                case 'overworld': {
                                    const portal = bot.bot.findBlock({
                                        matching: bot.mc.data.blocksByName['nether_portal'].id,
                                        count: 1,
                                        maxDistance: 128,
                                    })
                                    if (!portal) { throw `I couldn't find the nether portal` }
                                    const movements = new Movements(bot.bot)
                                    bot.mc.setRestrictedMovements(movements)
                                    movements.blocksToAvoid.delete(bot.mc.data.blocksByName['nether_portal'].id)
                                    yield* this.task(bot, {
                                        point: new Vec3Dimension(portal.position, bot.bot.game.dimension),
                                        distance: 0,
                                        movements: movements,
                                    })
                                    const timeout = new Timeout(10000)
                                    // @ts-ignore
                                    while (bot.bot.game.dimension !== 'the_nether' && !timeout.done()) { yield }
                                    break
                                }
                                case 'the_end': {
                                    const portal = bot.bot.findBlock({
                                        matching: bot.mc.data.blocksByName['end_portal'].id,
                                        count: 1,
                                        maxDistance: 128,
                                    })
                                    if (!portal) { throw `I couldn't find the end portal` }
                                    const movements = new Movements(bot.bot)
                                    bot.mc.setRestrictedMovements(movements)
                                    movements.blocksToAvoid.delete(bot.mc.data.blocksByName['end_portal'].id)
                                    yield* this.task(bot, {
                                        point: new Vec3Dimension(portal.position, bot.bot.game.dimension),
                                        distance: 0,
                                        movements: movements,
                                    })
                                    const timeout = new Timeout(10000)
                                    // @ts-ignore
                                    while (bot.bot.game.dimension !== 'overworld' && !timeout.done()) { yield }
                                    break
                                }
                            }
                            break
                        case 'overworld':
                            switch (bot.bot.game.dimension) {
                                case 'the_nether': {
                                    const portal = bot.bot.findBlock({
                                        matching: bot.mc.data.blocksByName['nether_portal'].id,
                                        count: 1,
                                        maxDistance: 128,
                                    })
                                    if (!portal) { throw `I couldn't find the nether portal` }
                                    const movements = new Movements(bot.bot)
                                    bot.mc.setRestrictedMovements(movements)
                                    movements.blocksToAvoid.delete(bot.mc.data.blocksByName['nether_portal'].id)
                                    yield* this.task(bot, {
                                        point: new Vec3Dimension(portal.position, bot.bot.game.dimension),
                                        distance: 0,
                                        movements: movements,
                                    })
                                    const timeout = new Timeout(10000)
                                    // @ts-ignore
                                    while (bot.bot.game.dimension !== 'overworld' && !timeout.done()) { yield }
                                    break
                                }
                                case 'overworld': {
                                    return 'here'
                                }
                                case 'the_end': {
                                    const portal = bot.bot.findBlock({
                                        matching: bot.mc.data.blocksByName['end_portal'].id,
                                        count: 1,
                                        maxDistance: 128,
                                    })
                                    if (!portal) { throw `I couldn't find the end portal` }
                                    const movements = new Movements(bot.bot)
                                    bot.mc.setRestrictedMovements(movements)
                                    movements.blocksToAvoid.delete(bot.mc.data.blocksByName['end_portal'].id)
                                    yield* this.task(bot, {
                                        point: new Vec3Dimension(portal.position, bot.bot.game.dimension),
                                        distance: 0,
                                        movements: movements,
                                    })
                                    const timeout = new Timeout(10000)
                                    // @ts-ignore
                                    while (bot.bot.game.dimension !== 'overworld' && !timeout.done()) { yield }
                                    break
                                }
                            }
                            break
                    }
                } catch (error) {
                    console.warn(error)
                }
            }
        } else if ('point' in args) {
            if (args.point.dimension) {
                yield* this.task(bot, { dimension: args.point.dimension })
            }

            if (!args.ignoreOthers &&
                bot.env.isDestinationOccupied(bot.bot.username, new Vec3(args.point.x, args.point.y, args.point.z))) {
                let found = false
                for (let d = 1; d < 3; d++) {
                    if (found) { break }
                    for (let x = -1; x < 1; x++) {
                        if (found) { break }
                        for (let z = -1; z < 1; z++) {
                            if (found) { break }
                            const currentDestination = (new Vec3(args.point.x, args.point.y, args.point.z)).translate(x * d, 0, z * d)
                            if (bot.env.isDestinationOccupied(bot.bot.username, currentDestination)) {
                                continue
                            }
                            args.point = new Vec3Dimension(currentDestination, args.point.dimension)
                            found = true
                            break
                        }
                    }
                }
            }
            goal = new goals.GoalNear(args.point.x, args.point.y, args.point.z, args.distance ?? 2)
        } else if ('block' in args) {
            if (args.block.dimension) {
                yield* this.task(bot, { dimension: args.block.dimension })
            }

            // goal = new goals.GoalNear(args.block.x, args.block.y, args.block.z, 2)
            goal = new GoalBlockSimple(new Vec3(args.block.x, args.block.y, args.block.z), {
                reach: args.reach,
            })
            // goal = new goals.GoalLookAtBlock(args.block.clone(), bot.bot.world, {
            //     reach: args.reach ? args.reach : 3,
            // })
        } else if ('place' in args) {
            if (args.place.dimension) {
                yield* this.task(bot, { dimension: args.place.dimension })
            }

            goal = new goals.GoalPlaceBlock(new Vec3(args.place.x, args.place.y, args.place.z), bot.bot.world, {
                range: 5,
                LOS: args.LOS ?? false,
                facing: args.facing,
                faces: args.faces,
                // @ts-ignore
                half: args.half,
            })
        } else if ('flee' in args) {
            goal = new goals.GoalInvert(new goals.GoalNear(args.flee.x, args.flee.y, args.flee.z, args.distance))
        }

        if (!goal) {
            throw `What?`
        }

        if (goal.isEnd(bot.bot.entity.position.floored())) {
            return 'here'
        }

        if (args.timeout !== null && args.timeout !== undefined) {
            bot.bot.pathfinder.thinkTimeout = args.timeout
        } else {
            bot.bot.pathfinder.thinkTimeout = 5000
        }
        if (args.searchRadius !== null && args.searchRadius !== undefined) {
            bot.bot.pathfinder.searchRadius = args.searchRadius
        } else {
            bot.bot.pathfinder.searchRadius = -1
        }
        if (args.movements) {
            bot.bot.pathfinder.setMovements(args.movements)
        } else {
            bot.bot.pathfinder.setMovements(bot.restrictedMovements)
        }

        bot.bot.pathfinder.tickTimeout = 10

        yield* wrap(bot.bot.pathfinder.goto(goal))
        return 'ok'
    },
    id: function(args) {
        if ('point' in args) {
            return `goto-point-${Math.round(args.point.x)}-${Math.round(args.point.y)}-${Math.round(args.point.z)}-${Math.round(args.distance ?? 2)}`
        } else if ('block' in args) {
            return `goto-block-${Math.round(args.block.x)}-${Math.round(args.block.y)}-${Math.round(args.block.z)}`
        } else if ('place' in args) {
            return `goto-place-${Math.round(args.place.x)}-${Math.round(args.place.y)}-${Math.round(args.place.z)}`
        } else if ('flee' in args) {
            return `flee-${Math.round(args.flee.x)}-${Math.round(args.flee.y)}-${Math.round(args.flee.z)}`
        } else if ('dimension' in args) {
            return `dimension-${args.dimension}`
        } else {
            throw `What?`
        }
    },
    humanReadableId: function(args) {
        if ('point' in args) {
            return `Goto point ${Math.round(args.point.x)} ${Math.round(args.point.y)} ${Math.round(args.point.z)} ${Math.round(args.distance ?? 2)}`
        } else if ('block' in args) {
            return `Goto block ${Math.round(args.block.x)} ${Math.round(args.block.y)} ${Math.round(args.block.z)}`
        } else if ('place' in args) {
            return `Goto block ${Math.round(args.place.x)} ${Math.round(args.place.y)} ${Math.round(args.place.z)}`
        } else if ('flee' in args) {
            return `Flee from ${Math.round(args.flee.x)} ${Math.round(args.flee.y)} ${Math.round(args.flee.z)}`
        } else if ('dimension' in args) {
            return `Goto ${args.dimension}`
        } else {
            return `Goto somewhere`
        }
    },
}
