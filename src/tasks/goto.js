const { goals, Movements } = require('mineflayer-pathfinder')
const { wrap } = require('../utils/tasks')
const { Vec3 } = require('vec3')

/**
 * @exports @typedef {{
 *   timeout?: number;
 *   searchRadius?: number;
 *   movements?: Movements;
 * }} GeneralArgs
 */

/**
 * @exports @typedef {GeneralArgs & {
 *   destination: Vec3;
 *   range: number;
 *   avoidOccupiedDestinations: boolean;
 * }} GotoArgs
 */

/**
 * @exports @typedef {GeneralArgs & {
 *   block: Vec3;
 *   reach?: number;
 * }} LookAtArgs
 */

/**
 * @exports @typedef {GeneralArgs & {
 *   place: Vec3;
 *   LOS?: boolean;
 *   facing?: 'north' | 'east' | 'south' | 'west' | 'up' | 'down';
 *   faces?: [Vec3, Vec3, Vec3, Vec3, Vec3, Vec3];
 *   half?: 'top' | 'bottom';
 * }} PlaceArgs
 */

/**
 * @exports @typedef {GeneralArgs & {
 *   flee: Vec3;
 *   distance: number;
 * }} FleeArgs
 */

/**
 * @type {import('../task').TaskDef<void, GotoArgs | LookAtArgs | PlaceArgs | FleeArgs, Error>}
 */
module.exports = {
    /**
     * @throws {Error} `NoPath`, `Timeout`, `GoalChanged`, `PathStopped`
     */
    task: function(bot, args) {
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
        if ('destination' in args) {
            if (args.avoidOccupiedDestinations &&
                bot.env.isDestinationOccupied(bot.bot.username, args.destination)) {
                let found = false
                for (let d = 1; d < 3; d++) {
                    if (found) { break }
                    for (let x = -1; x < 1; x++) {
                        if (found) { break }
                        for (let z = -1; z < 1; z++) {
                            if (found) { break }
                            const currentDestination = args.destination.offset(x * d, 0, z * d)
                            if (bot.env.isDestinationOccupied(bot.bot.username, currentDestination)) {
                                continue
                            }
                            args.destination = currentDestination
                            found = true
                            break
                        }
                    }
                }
            }
            return wrap(bot.bot.pathfinder.goto(new goals.GoalNear(args.destination.x, args.destination.y, args.destination.z, args.range ?? 2)))
        } else if ('block' in args) {
            return wrap(bot.bot.pathfinder.goto(new goals.GoalLookAtBlock(args.block.clone(), bot.bot.world, {
                reach: args.reach ? args.reach : 4.5,
            })))
        } else if ('place' in args) {
            // @ts-ignore
            return wrap(bot.bot.pathfinder.goto(new goals.GoalPlaceBlock(args.place.clone(), bot.bot.world, {
                range: 5,
                LOS: args.LOS ?? false,
                // @ts-ignore
                facing: args.facing,
                // @ts-ignore
                faces: args.faces,
                // @ts-ignore
                half: args.half,
            })))
        } else if ('flee' in args) {
            return wrap(bot.bot.pathfinder.goto(new goals.GoalInvert(new goals.GoalNear(args.flee.x, args.flee.y, args.flee.z, args.distance))))
        } else  {
            throw `What?`
        }
    },
    id: function(args) {
        if ('destination' in args) {
            return `goto-point-${Math.round(args.destination.x)}-${Math.round(args.destination.y)}-${Math.round(args.destination.z)}-${Math.round(args.range)}`
        } else if ('block' in args) {
            return `goto-block-${Math.round(args.block.x)}-${Math.round(args.block.y)}-${Math.round(args.block.z)}`
        } else if ('place' in args) {
            return `goto-place-${Math.round(args.place.x)}-${Math.round(args.place.y)}-${Math.round(args.place.z)}`
        } else if ('flee' in args) {
            return `flee-${Math.round(args.flee.x)}-${Math.round(args.flee.y)}-${Math.round(args.flee.z)}`
        } else {
            throw `What?`
        }
    },
    humanReadableId: function(args) {
        if ('destination' in args) {
            return `Goto point ${Math.round(args.destination.x)} ${Math.round(args.destination.y)} ${Math.round(args.destination.z)} ${Math.round(args.range)}`
        } else if ('block' in args) {
            return `Goto block ${Math.round(args.block.x)} ${Math.round(args.block.y)} ${Math.round(args.block.z)}`
        } else if ('place' in args) {
            return `Goto block ${Math.round(args.place.x)} ${Math.round(args.place.y)} ${Math.round(args.place.z)}`
        } else if ('flee' in args) {
            return `Flee from ${Math.round(args.flee.x)} ${Math.round(args.flee.y)} ${Math.round(args.flee.z)}`
        } else {
            return `Goto somewhere`
        }
    },
}
