'use strict'

const { goals, Movements } = require('mineflayer-pathfinder')
const { wrap, sleepG, runtimeArgs } = require('../utils/tasks')
const { Vec3 } = require('vec3')
const { Timeout } = require('../utils/other')
const Vec3Dimension = require('../utils/vec3-dimension')
const config = require('../config')
const { GoalPlaceBlock, GoalInvert, GoalNear } = require('mineflayer-pathfinder/lib/goals')
const BruhBot = require('../bruh-bot')

class GoalBlockSimple extends goals.Goal {
    /**
     * @param {Vec3} pos
     * @param {{ reach?: number; entityHeight?: number; raycast?: boolean; bot: BruhBot; }} [options={}]
     */
    constructor(pos, options) {
        super()
        this.pos = pos
        this.reach = options.reach || 3.5
        this.entityHeight = options.entityHeight || 1.6
        this.raycast = options.raycast || false
        this.bot = options.bot
    }

    /**
     * @override
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
     * @override
     * @param {Vec3} node
     */
    isEnd(node) {
        if (node.offset(0, this.entityHeight, 0).distanceTo(this.pos.offset(0.5, 0.5, 0.5)) > this.reach) return false
        if (this.raycast && !this.bot.blockInView(this.bot.bot.blockAt(this.pos), node.offset(0, 1.6, 0))) return false
        return true
    }
}

class GoalHawkeye extends goals.Goal {
    /**
     * @param {Vec3} target
     * @param {import('minecrafthawkeye').Weapons} weapon
     * @param {(from: Vec3, to: Vec3, weapon: import('minecrafthawkeye').Weapons) => import('minecrafthawkeye').GetMasterGrade | undefined} calculator
     */
    constructor(target, weapon, calculator) {
        super()
        this.target = target
        this.weapon = weapon
        this.calculator = calculator
    }

    /**
     * @override
     * @param {Vec3} node
     */
    heuristic(node) {
        const masterGrade = this.calculator(node, this.target, this.weapon)
        if (!masterGrade) {
            return node.distanceTo(this.target)
        }
        if (masterGrade.blockInTrayect) {
            return 10
        }
        return 0
    }

    /**
     * @override
     * @param {Vec3} node
     */
    isEnd(node) {
        const masterGrade = this.calculator(node.offset(0.5, 0, 0.5), this.target, this.weapon)
        if (!masterGrade) {
            return false
        }
        if (masterGrade.blockInTrayect) {
            return false
        }
        return true
    }
}

class GoalEntity extends goals.Goal {
    /** @private @type {import('prismarine-entity').Entity} */ entity
    /** @private @type {number} */ rangeSq
    /** @private @type {boolean} */ isFlee
    /** @private @type {Vec3} */ lastPosition


    /**
     * @param {import('prismarine-entity').Entity} entity
     * @param {number} range
     */
    constructor(entity, range) {
        super()
        this.entity = entity
        this.lastPosition = entity.position.clone()
        this.rangeSq = range * range
        this.isFlee = range < 0
    }

    /**
     * @override
     * @param {Vec3} node
     */
    heuristic(node) {
        const dx = this.entity.position.x - node.x
        const dy = this.entity.position.y - node.y
        const dz = this.entity.position.z - node.z
        return (Math.sqrt(dx * dx + dz * dz) + Math.abs(dy)) * (this.isFlee ? -1 : 1)
    }

    /**
     * @override
     * @param {Vec3} node
     */
    isEnd(node) {
        const d = Math.entityDistanceSquared(node.offset(0, 1.6, 0), this.entity)
        if (this.isFlee) {
            return d > this.rangeSq
        } else {
            return d <= this.rangeSq
        }
    }

    /** @override */
    hasChanged() {
        return this.entity.position.distanceTo(this.lastPosition) > 2
    }

    /** @override */
    isValid() { return this.entity && this.entity.isValid }

    refresh() {
        this.lastPosition = this.entity.position.clone()
    }
}

/**
 * @exports @typedef {{
 *   goal: {
 *     heuristic: (node: Vec3) => number;
 *     isEnd: (node: Vec3) => boolean;
 *     hasChanged?: () => boolean;
 *     isValid?: () => boolean;
 *   };
 * }} GoalArgs
 */

/**
 * @exports @typedef {{
 *   timeout?: number;
 *   searchRadius?: number;
 *   movements?: Readonly<import('mineflayer-pathfinder').Movements>;
 *   savePathError?: boolean;
 *   sprint?: boolean;
 *   excludeStep?: ReadonlyArray<Vec3>;
 *   lookAtTarget?: boolean;
 *   retryCount?: number;
 * }} GeneralArgs
 */

/**
 * @exports @typedef {{
 *   point: Readonly<Vec3Dimension> | Readonly<Vec3>;
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
 *   block: Readonly<Vec3Dimension> | Readonly<Vec3>;
 *   reach?: number;
 *   raycast?: boolean;
 * }} LookAtArgs
 */

/**
 * @exports @typedef {{
 *   place: Readonly<Vec3Dimension> | Readonly<Vec3>;
 *   LOS?: boolean;
 *   facing?: 'north' | 'east' | 'south' | 'west' | 'up' | 'down';
 *   faces?: Readonly<[Vec3, Vec3, Vec3, Vec3, Vec3, Vec3]>;
 *   half?: 'top' | 'bottom';
 * }} PlaceArgs
 */

/**
 * @exports @typedef {{
 *   flee: Readonly<Vec3> | import('prismarine-entity').Entity;
 *   distance: number;
 * }} FleeArgs
 */

/**
 * @exports @typedef {{
 *   hawkeye: Vec3;
 *   weapon: import('minecrafthawkeye').Weapons;
 * }} HawkeyeArgs
 */

/**
 * @exports @typedef {{
 *   entity: import('prismarine-entity').Entity;
 *   distance?: number;
 * }} GotoEntityArgs
 */

/**
 * @param {import('../bruh-bot')} bot
 * @param {(GotoArgs | LookAtArgs | PlaceArgs | FleeArgs | GotoDimensionArgs | HawkeyeArgs | GotoEntityArgs) & GeneralArgs} args
 * @returns {Generator<GoalHawkeye | GoalPlaceBlock | GoalInvert | GoalNear | GoalEntity | GoalBlockSimple | GotoDimensionArgs, void, void>}
 */
function* getGoal(bot, args) {
    if ('hawkeye' in args) {
        if (!bot.bot.hawkEye) {
            new Promise(resolve => {
                // @ts-ignore
                bot.bot.loadPlugin(require('minecrafthawkeye').default)
                resolve()
            })
        }

        yield new GoalHawkeye(args.hawkeye, args.weapon, (from, to, weapon) => {
            const savedBotPosition = bot.bot.entity.position
            bot.bot.entity.position = from
            const masterGrade = bot.bot.hawkEye.getMasterGrade({
                position: to,
                isValid: false,
            }, new Vec3(0, 0, 0), weapon)
            bot.bot.entity.position = savedBotPosition
            return masterGrade
        })
    } else if ('dimension' in args) {
        throw new Error(`There is not a concrete goal for traveling between dimensions`)
    } else if ('path' in args) {
        throw new Error(`There is not a concrete goal for replicating movements`)
    } else if ('point' in args) {
        if ('dimension' in args.point) {
            yield { dimension: args.point.dimension }
        }

        if (!args.ignoreOthers &&
            bot.env.isDestinationOccupied(bot.username, new Vec3(args.point.x, args.point.y, args.point.z))) {
            let found = false
            for (let d = 1; d < 3; d++) {
                if (found) { break }
                for (let x = -1; x < 1; x++) {
                    if (found) { break }
                    for (let z = -1; z < 1; z++) {
                        if (found) { break }
                        const currentDestination = (new Vec3(args.point.x, args.point.y, args.point.z)).translate(x * d, 0, z * d)
                        if (bot.env.isDestinationOccupied(bot.username, currentDestination)) {
                            continue
                        }
                        if ('dimension' in args.point) {
                            args.point = new Vec3Dimension(currentDestination, args.point.dimension)
                        } else {
                            args.point = currentDestination
                        }
                        found = true
                        break
                    }
                }
            }
        }

        yield new goals.GoalNear(args.point.x, args.point.y, args.point.z, args.distance ?? 2)
    } else if ('block' in args) {
        if ('dimension' in args.block) {
            yield { dimension: args.block.dimension }
        }

        // yield new goals.GoalNear(args.block.x, args.block.y, args.block.z, 2)
        yield new GoalBlockSimple(new Vec3(args.block.x, args.block.y, args.block.z), {
            reach: args.reach,
            raycast: args.raycast,
            bot: bot,
        })
        // yield new goals.GoalLookAtBlock(args.block.clone(), bot.bot.world, {
        //     reach: args.reach ? args.reach : 3,
        // })
    } else if ('place' in args) {
        if ('dimension' in args.place) {
            yield { dimension: args.place.dimension }
        }

        yield new goals.GoalPlaceBlock(new Vec3(args.place.x, args.place.y, args.place.z), bot.bot.world, {
            range: 5,
            LOS: args.LOS ?? false,
            facing: args.facing,
            faces: args.faces,
            half: args.half,
        })
    } else if ('flee' in args) {
        if ('isValid' in args.flee) {
            yield new goals.GoalInvert(new GoalEntity(args.flee, args.distance))
        } else {
            yield new goals.GoalInvert(new goals.GoalNear(args.flee.x, args.flee.y, args.flee.z, args.distance))
        }
    } else if ('entity' in args) {
        yield new GoalEntity(args.entity, args.distance)
    } else {
        throw `What?`
    }
}

/**
 * @param {import('../bruh-bot')} bot
 * @param {GeneralArgs} args
 */
function setOptions(bot, args) {
    if (args.timeout !== null && args.timeout !== undefined) {
        bot.bot.pathfinder.thinkTimeout = args.timeout
    } else {
        bot.bot.pathfinder.thinkTimeout = 60000
    }
    if (args.searchRadius !== null && args.searchRadius !== undefined) {
        bot.bot.pathfinder.searchRadius = args.searchRadius
    } else {
        bot.bot.pathfinder.searchRadius = Infinity
    }
    bot.bot.pathfinder.tickTimeout = 10
    bot.bot.pathfinder.enablePathShortcut = true
    bot.bot.pathfinder.lookAtTarget = (!('lookAtTarget' in args) || args.lookAtTarget)

    const originalMovements = args.movements ?? bot.restrictedMovements
    const newMovements = new Movements(bot.bot, originalMovements)

    newMovements.allow1by1towers &&= !bot.quietMode
    newMovements.canDig &&= !bot.quietMode
    newMovements.canOpenDoors = true && !bot.quietMode
    newMovements.infiniteLiquidDropdownDistance &&= !bot.quietMode
    newMovements.sneak ||= bot.quietMode

    newMovements.liquidCost = 100 // bot.bot.blockAt(bot.bot.entity.position)?.name === 'water' ? 100 : Infinity
    newMovements.allowSprinting = !bot.quietMode && Boolean(args.sprint)

    if (args.excludeStep?.length) {
        newMovements.exclusionAreasStep = [...newMovements.exclusionAreasStep]
        for (const excludeStep of args.excludeStep) {
            newMovements.exclusionAreasStep.push(block => {
                if (excludeStep.equals(block.position)) {
                    return Infinity
                }
                return 0
            })
        }
    }

    bot.bot.pathfinder.setMovements(newMovements)
}

/**
 * @param {import('mineflayer-pathfinder').Movements} movements
 * @param {import('mineflayer-pathfinder').PartiallyComputedPath} path
 */
function getTime(movements, path) {
    let time = 0
    for (let i = 1; i < path.path.length; i++) {
        const a = path.path[i - 1]
        const b = path.path[i]
        const distance = a.distanceTo(b)
        if (movements.allowSprinting) {
            time += (distance / 4.317) * 1000
        } else {
            time += (distance / 5.612) * 1000
        }
    }
    return time
}

/**
 * @type {import('../task').TaskDef<'ok' | 'here',
 * (
 *   (GotoArgs | LookAtArgs | PlaceArgs | FleeArgs | GotoDimensionArgs | HawkeyeArgs | GotoEntityArgs | GoalArgs) & {
 *     options?: GeneralArgs;
 *   }
 * ) & {
 *   onPathUpdated?: (path: import('mineflayer-pathfinder').PartiallyComputedPath) => void;
 *   onPathReset?: (reason: 'goal_updated' | 'movements_updated' | 'block_updated' | 'chunk_loaded' | 'goal_moved' | 'dig_error' | 'no_scaffolding_blocks' | 'place_error' | 'stuck') => void;
 * }> & {
 *   getGoal: getGoal;
 *   getTime: getTime;
 *   setOptions: setOptions;
 *   GoalBlockSimple: typeof GoalBlockSimple;
 *   GoalHawkeye: typeof GoalHawkeye;
 *   GoalEntity: typeof GoalEntity;
 * }}
 */
module.exports = {
    task: function*(bot, args) {
        if (args.onPathUpdated) { bot.bot.on('path_update', args.onPathUpdated) }
        if (args.onPathReset) { bot.bot.on('path_reset', args.onPathReset) }
        args.options ??= {}
        try {
            if ('dimension' in args) {
                let remainingTravels = 3
                while (true) {
                    remainingTravels--
                    if (remainingTravels <= 0) { throw `I lost :(` }

                    try {
                        switch (args.dimension) {
                            case 'the_end':
                                switch (bot.dimension) {
                                    case 'the_nether': {
                                        const portal = bot.bot.findBlock({
                                            matching: bot.mc.registry.blocksByName['nether_portal'].id,
                                            count: 1,
                                            maxDistance: config.goto.portalSearchRadius,
                                        })
                                        if (!portal) { throw `I couldn't find the nether portal` }
                                        const movements = new Movements(bot.bot)
                                        bot.mc.setRestrictedMovements(movements)
                                        movements.blocksToAvoid.delete(bot.mc.registry.blocksByName['nether_portal'].id)
                                        yield* this.task(bot, {
                                            point: portal.position,
                                            distance: 0,
                                            options: args.options,
                                            ...runtimeArgs(args),
                                        })
                                        const timeout = new Timeout(10000)
                                        // @ts-ignore
                                        while (bot.dimension !== 'overworld' && !timeout.done()) { yield }
                                        break
                                    }
                                    case 'overworld': {
                                        const portal = bot.bot.findBlock({
                                            matching: bot.mc.registry.blocksByName['end_portal'].id,
                                            count: 1,
                                            maxDistance: config.goto.portalSearchRadius,
                                        })
                                        if (!portal) { throw `I couldn't find the end portal` }
                                        const movements = new Movements(bot.bot)
                                        bot.mc.setRestrictedMovements(movements)
                                        movements.blocksToAvoid.delete(bot.mc.registry.blocksByName['end_portal'].id)
                                        yield* this.task(bot, {
                                            point: portal.position,
                                            distance: 0,
                                            options: args.options,
                                            ...runtimeArgs(args),
                                        })
                                        const timeout = new Timeout(10000)
                                        // @ts-ignore
                                        while (bot.dimension !== 'the_end' && !timeout.done()) { yield }
                                        break
                                    }
                                    case 'the_end': {
                                        return 'here'
                                    }
                                }
                                break
                            case 'the_nether':
                                switch (bot.dimension) {
                                    case 'the_nether': {
                                        return 'here'
                                    }
                                    case 'overworld': {
                                        const portal = bot.bot.findBlock({
                                            matching: bot.mc.registry.blocksByName['nether_portal'].id,
                                            count: 1,
                                            maxDistance: config.goto.portalSearchRadius,
                                        })
                                        if (!portal) { throw `I couldn't find the nether portal` }
                                        const movements = new Movements(bot.bot)
                                        bot.mc.setRestrictedMovements(movements)
                                        movements.blocksToAvoid.delete(bot.mc.registry.blocksByName['nether_portal'].id)
                                        yield* this.task(bot, {
                                            point: portal.position,
                                            distance: 0,
                                            options: args.options,
                                            ...runtimeArgs(args),
                                        })
                                        const timeout = new Timeout(10000)
                                        // @ts-ignore
                                        while (bot.dimension !== 'the_nether' && !timeout.done()) { yield }
                                        break
                                    }
                                    case 'the_end': {
                                        const portal = bot.bot.findBlock({
                                            matching: bot.mc.registry.blocksByName['end_portal'].id,
                                            count: 1,
                                            maxDistance: config.goto.portalSearchRadius,
                                        })
                                        if (!portal) { throw `I couldn't find the end portal` }
                                        const movements = new Movements(bot.bot)
                                        bot.mc.setRestrictedMovements(movements)
                                        movements.blocksToAvoid.delete(bot.mc.registry.blocksByName['end_portal'].id)
                                        yield* this.task(bot, {
                                            point: portal.position,
                                            distance: 0,
                                            options: args.options,
                                            ...runtimeArgs(args),
                                        })
                                        const timeout = new Timeout(10000)
                                        // @ts-ignore
                                        while (bot.dimension !== 'overworld' && !timeout.done()) { yield }
                                        break
                                    }
                                }
                                break
                            case 'overworld':
                                switch (bot.dimension) {
                                    case 'the_nether': {
                                        const portal = bot.bot.findBlock({
                                            matching: bot.mc.registry.blocksByName['nether_portal'].id,
                                            count: 1,
                                            maxDistance: config.goto.portalSearchRadius,
                                        })
                                        if (!portal) { throw `I couldn't find the nether portal` }
                                        const movements = new Movements(bot.bot)
                                        bot.mc.setRestrictedMovements(movements)
                                        movements.blocksToAvoid.delete(bot.mc.registry.blocksByName['nether_portal'].id)
                                        yield* this.task(bot, {
                                            point: portal.position,
                                            distance: 0,
                                            options: args.options,
                                            ...runtimeArgs(args),
                                        })
                                        const timeout = new Timeout(10000)
                                        // @ts-ignore
                                        while (bot.dimension !== 'overworld' && !timeout.done()) { yield }
                                        break
                                    }
                                    case 'overworld': {
                                        return 'here'
                                    }
                                    case 'the_end': {
                                        const portal = bot.bot.findBlock({
                                            matching: bot.mc.registry.blocksByName['end_portal'].id,
                                            count: 1,
                                            maxDistance: config.goto.portalSearchRadius,
                                        })
                                        if (!portal) { throw `I couldn't find the end portal` }
                                        const movements = new Movements(bot.bot)
                                        bot.mc.setRestrictedMovements(movements)
                                        movements.blocksToAvoid.delete(bot.mc.registry.blocksByName['end_portal'].id)
                                        yield* this.task(bot, {
                                            point: portal.position,
                                            distance: 0,
                                            options: args.options,
                                            ...runtimeArgs(args),
                                        })
                                        const timeout = new Timeout(10000)
                                        // @ts-ignore
                                        while (bot.dimension !== 'overworld' && !timeout.done()) { yield }
                                        break
                                    }
                                }
                                break
                        }
                    } catch (error) {
                        console.warn(error)
                    }
                }
            } else if ('goal' in args) {
                if (args.goal.isEnd(bot.bot.entity.position)) { return 'here' }
                /** @type {import("/home/BB/Projects/mineflayer-pathfinder/lib/goals").GoalBase} */ //@ts-ignore
                const _goal = args.goal
                _goal.hasChanged ??= () => false
                _goal.isValid ??= () => true

                if (args.options.savePathError && bot.memory.isGoalUnreachable(_goal)) { throw `If I remember correctly I can't get there` }

                let retryCount = ('retryCount' in args.options) ? args.options.retryCount : 3
                let lastError = null

                for (let i = 0; i <= retryCount; i++) {
                    setOptions(bot, args.options)

                    /**
                     * @param {'interrupt' | 'cancel'} type
                     */
                    const interrupt = (type) => {
                        if (type === 'cancel') {
                            bot.bot.pathfinder.stop()
                            bot.bot.pathfinder.setGoal(null)
                        }
                    }

                    args.interrupt.on(interrupt)
                    try {
                        yield* wrap(bot.bot.pathfinder.goto(_goal))
                    } catch (error) {
                        lastError = error
                        if (error.name === 'NoPath') {
                        } else if (error.name === 'GoalChanged') {
                            retryCount++
                            console.log(`[Bot "${bot.username}"] Goal changed, increasing retry count`)
                        } else if (error.name === 'PathStopped' && args.interrupt.isCancelled) {
                            console.log(`[Bot "${bot.username}"] Pathfinder stopped but that was expected`)
                        }
                    } finally {
                        args.interrupt.off(interrupt)
                    }

                    if (_goal.isEnd(bot.bot.entity.position) ||
                        _goal.isEnd(bot.bot.entity.position.floored())) {
                        return 'ok'
                    }

                    if (i === retryCount - 1) {
                        console.warn(`[Bot "${bot.username}"] Goal not reached`, lastError)
                        bot.bot.pathfinder.stop()
                        if (args.options.savePathError && lastError?.name === 'NoPath') bot.memory.theGoalIsUnreachable(_goal)
                        if (lastError?.name === 'NoPath') {
                            throw `I can't get there`
                        } else {
                            throw `Looks like I can't get there`
                        }
                    } else {
                        bot.bot.pathfinder.stop()
                        // console.log(`[Bot "${bot.username}"] Goal not reached, retrying (${i}/${retryCount}) ...`, lastError)
                        yield* sleepG(200)
                    }
                }

                bot.bot.pathfinder.stop()
                throw `bruh`
            } else {
                let result
                for (const _goal of getGoal(bot, args)) {
                    if ('dimension' in _goal) {
                        result = yield* this.task(bot, {
                            ..._goal,
                            options: args.options,
                            ...runtimeArgs(args),
                        })
                    } else {
                        result = yield* this.task(bot, {
                            goal: _goal,
                            options: args.options,
                            ...runtimeArgs(args),
                        })
                    }
                }

                return result
            }
        } finally {
            if (args.onPathUpdated) { bot.bot.off('path_update', args.onPathUpdated) }
            if (args.onPathReset) { bot.bot.off('path_reset', args.onPathReset) }
        }
    },
    id: function(args) {
        if ('point' in args) {
            return `goto-point-${Math.round(args.point.x)}-${Math.round(args.point.y)}-${Math.round(args.point.z)}-${Math.round(args.distance ?? 2)}`
        } else if ('block' in args) {
            return `goto-block-${Math.round(args.block.x)}-${Math.round(args.block.y)}-${Math.round(args.block.z)}`
        } else if ('place' in args) {
            return `goto-place-${Math.round(args.place.x)}-${Math.round(args.place.y)}-${Math.round(args.place.z)}`
        } else if ('flee' in args) {
            if ('isValid' in args.flee) {
                return `flee-${args.flee.id}`
            } else {
                return `flee-${Math.round(args.flee.x)}-${Math.round(args.flee.y)}-${Math.round(args.flee.z)}`
            }
        } else if ('dimension' in args) {
            return `dimension-${args.dimension}`
        } else if ('entity' in args) {
            return `goto-entity-${args.entity.id}`
        } else if ('hawkeye' in args) {
            return `goto-hawkeye-${args.hawkeye}-${args.weapon}`
        } else if ('goal' in args) {
            return `goto-goal`
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
            if ('isValid' in args.flee) {
                return `Flee from ${args.flee}`
            } else {
                return `Flee from ${Math.round(args.flee.x)} ${Math.round(args.flee.y)} ${Math.round(args.flee.z)}`
            }
        } else if ('dimension' in args) {
            return `Goto ${args.dimension}`
        } else if ('path' in args) {
            return `Replicating someone`
        } else if ('entity' in args) {
            return `Goto ${args.entity.name}`
        } else if ('hawkeye' in args) {
            return `Goto shoot`
        } else if ('goal' in args) {
            return `Goto somewhere`
        } else {
            return `Goto somewhere`
        }
    },
    definition: 'goto',
    getGoal: getGoal,
    getTime: getTime,
    setOptions: setOptions,
    GoalBlockSimple: GoalBlockSimple,
    GoalHawkeye: GoalHawkeye,
    GoalEntity: GoalEntity,
}
