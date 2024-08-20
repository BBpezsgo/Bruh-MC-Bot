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
        if (node.floored().offset(0, this.entityHeight, 0).distanceTo(this.pos) > this.reach) return false
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
    /**
     * @private
     * @type {import('prismarine-entity').Entity}
     */
    entity
    /**
     * @private
     * @type {number}
     */
    rangeSq
    /**
     * @private
     * @type {boolean}
     */
    isFlee
    /**
     * @private
     * @type {number}
     */
    x
    /**
     * @private
     * @type {number}
     */
    y
    /**
     * @private
     * @type {number}
     */
    z


    /**
     * @param {import('prismarine-entity').Entity} entity
     * @param {number} range
     */
    constructor(entity, range) {
        super()
        this.entity = entity
        this.x = Math.floor(entity.position.x)
        this.y = Math.floor(entity.position.y)
        this.z = Math.floor(entity.position.z)
        this.rangeSq = range * range
        this.isFlee = range < 0
    }

    /**
     * @override
     * @param {Vec3} node
     */
    heuristic(node) {
        const dx = this.x - node.x
        const dy = this.y - node.y
        const dz = this.z - node.z
        return (Math.sqrt(dx * dx + dz * dz) + Math.abs(dy)) * (this.isFlee ? -1 : 1)
    }

    /**
     * @override
     * @param {Vec3} node
     */
    isEnd(node) {
        const p = this.entity.position
        const dx = p.x - node.x
        const dy = p.y - node.y
        const dz = p.z - node.z
        if (this.isFlee) {
            return (dx * dx + dy * dy + dz * dz) > this.rangeSq
        } else {
            return (dx * dx + dy * dy + dz * dz) <= this.rangeSq
        }
    }

    /** @override */
    hasChanged() {
        const d = this.entity.position.distanceTo(new Vec3(this.x, this.y, this.z))
        return d > 1
    }

    /** @override */
    isValid() { return this.entity && this.entity.isValid }
}

/**
 * @exports @typedef {{
 *   goal: import('mineflayer-pathfinder/lib/goals').GoalBase;
 *   options: GeneralArgs;
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
 * @returns {Generator<import('mineflayer-pathfinder/lib/goals').GoalBase | GotoDimensionArgs, void, void>}
 */
function* getGoal(bot, args) {
    if ('hawkeye' in args) {
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
        bot.bot.pathfinder.thinkTimeout = 5000
    }
    if (args.searchRadius !== null && args.searchRadius !== undefined) {
        bot.bot.pathfinder.searchRadius = args.searchRadius
    } else {
        bot.bot.pathfinder.searchRadius = -1
    }

    bot.bot.pathfinder.lookAtTarget = (!('lookAtTarget' in args) || args.lookAtTarget)

    const originalMovements = args.movements ?? bot.restrictedMovements
    const newMovements = new Movements(bot.bot)

    newMovements.blocksCanBreakAnyway = originalMovements.blocksCanBreakAnyway
    newMovements.blocksCantBreak = originalMovements.blocksCantBreak
    newMovements.blocksToAvoid = originalMovements.blocksToAvoid
    newMovements.entitiesToAvoid = originalMovements.entitiesToAvoid

    newMovements.carpets = originalMovements.carpets
    newMovements.climbables = originalMovements.climbables
    newMovements.emptyBlocks = originalMovements.emptyBlocks
    newMovements.fences = originalMovements.fences
    newMovements.gravityBlocks = originalMovements.gravityBlocks
    newMovements.interactableBlocks = originalMovements.interactableBlocks
    newMovements.liquids = originalMovements.liquids
    newMovements.openable = new Set([
        bot.mc.registry.blocksByName['oak_door'].id,
        bot.mc.registry.blocksByName['spruce_door'].id,
        bot.mc.registry.blocksByName['birch_door'].id,
        bot.mc.registry.blocksByName['jungle_door'].id,
        bot.mc.registry.blocksByName['acacia_door'].id,
        bot.mc.registry.blocksByName['dark_oak_door'].id,
        bot.mc.registry.blocksByName['mangrove_door'].id,
        bot.mc.registry.blocksByName['cherry_door'].id,
        bot.mc.registry.blocksByName['bamboo_door'].id,
        bot.mc.registry.blocksByName['crimson_door'].id,
        bot.mc.registry.blocksByName['warped_door'].id,

        bot.mc.registry.blocksByName['oak_fence_gate'].id,
        bot.mc.registry.blocksByName['spruce_fence_gate'].id,
        bot.mc.registry.blocksByName['birch_fence_gate'].id,
        bot.mc.registry.blocksByName['jungle_fence_gate'].id,
        bot.mc.registry.blocksByName['acacia_fence_gate'].id,
        bot.mc.registry.blocksByName['dark_oak_fence_gate'].id,
        bot.mc.registry.blocksByName['mangrove_fence_gate'].id,
        bot.mc.registry.blocksByName['cherry_fence_gate'].id,
        bot.mc.registry.blocksByName['bamboo_fence_gate'].id,
        bot.mc.registry.blocksByName['crimson_fence_gate'].id,
        bot.mc.registry.blocksByName['warped_fence_gate'].id,

        // bot.mc.registry.blocksByName['oak_trapdoor'].id,
        // bot.mc.registry.blocksByName['spruce_trapdoor'].id,
        // bot.mc.registry.blocksByName['birch_trapdoor'].id,
        // bot.mc.registry.blocksByName['jungle_trapdoor'].id,
        // bot.mc.registry.blocksByName['acacia_trapdoor'].id,
        // bot.mc.registry.blocksByName['dark_oak_trapdoor'].id,
        // bot.mc.registry.blocksByName['mangrove_trapdoor'].id,
        // bot.mc.registry.blocksByName['cherry_trapdoor'].id,
        // bot.mc.registry.blocksByName['bamboo_trapdoor'].id,
        // bot.mc.registry.blocksByName['crimson_trapdoor'].id,
        // bot.mc.registry.blocksByName['warped_trapdoor'].id,
    ])
    newMovements.passableEntities = originalMovements.passableEntities
    newMovements.replaceables = originalMovements.replaceables
    newMovements.scafoldingBlocks = originalMovements.scafoldingBlocks

    newMovements.digCost = originalMovements.digCost
    newMovements.entityCost = originalMovements.entityCost
    newMovements.liquidCost = 100
    newMovements.placeCost = originalMovements.placeCost

    newMovements.entityIntersections = originalMovements.entityIntersections
    newMovements.exclusionAreasBreak = originalMovements.exclusionAreasBreak
    newMovements.exclusionAreasPlace = originalMovements.exclusionAreasPlace
    newMovements.exclusionAreasStep = originalMovements.exclusionAreasStep

    newMovements.allow1by1towers = originalMovements.allow1by1towers && !bot.quietMode
    newMovements.allowEntityDetection = originalMovements.allowEntityDetection
    newMovements.allowFreeMotion = originalMovements.allowFreeMotion
    newMovements.allowParkour = originalMovements.allowParkour
    newMovements.allowSprinting = originalMovements.allowSprinting && !bot.quietMode && args.sprint
    newMovements.canDig = originalMovements.canDig && !bot.quietMode
    newMovements.canOpenDoors = true && !bot.quietMode
    newMovements.dontCreateFlow = originalMovements.dontCreateFlow
    newMovements.dontMineUnderFallingBlock = originalMovements.dontMineUnderFallingBlock
    newMovements.infiniteLiquidDropdownDistance = originalMovements.infiniteLiquidDropdownDistance && !bot.quietMode
    newMovements.maxDropDown = originalMovements.maxDropDown
    newMovements.sneak = originalMovements.sneak || bot.quietMode

    if (args.excludeStep && args.excludeStep.length > 0) {
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
    bot.bot.pathfinder.tickTimeout = 10
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
 *   (
 *     (
 *       GotoArgs | LookAtArgs | PlaceArgs | FleeArgs | GotoDimensionArgs | HawkeyeArgs | GotoEntityArgs
 *     ) & GeneralArgs
 *   ) | GoalArgs
 * ) & {
 *   onPathUpdated?: (path: import('mineflayer-pathfinder').PartiallyComputedPath) => void;
 *   onPathReset?: (reason: 'goal_updated' | 'movements_updated' | 'block_updated' | 'chunk_loaded' | 'goal_moved' | 'dig_error' | 'no_scaffolding_blocks' | 'place_error' | 'stuck') => void;
 * }> & {
 *   getGoal: getGoal;
 *   getTime: getTime;
 *   GoalBlockSimple: typeof GoalBlockSimple;
 *   GoalHawkeye: typeof GoalHawkeye;
 *   GoalEntity: typeof GoalEntity;
 * }}
 */
module.exports = {
    /**
     * @throws {Error} `NoPath`, `Timeout`, `GoalChanged`, `PathStopped`
     */
    task: function*(bot, args) {
        if (args.onPathUpdated) { bot.bot.on('path_update', args.onPathUpdated) }
        if (args.onPathReset) { bot.bot.on('path_reset', args.onPathReset) }
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
                                            maxDistance: 128,
                                        })
                                        if (!portal) { throw `I couldn't find the nether portal` }
                                        const movements = new Movements(bot.bot)
                                        bot.mc.setRestrictedMovements(movements)
                                        movements.blocksToAvoid.delete(bot.mc.registry.blocksByName['nether_portal'].id)
                                        yield* this.task(bot, {
                                            point: portal.position,
                                            distance: 0,
                                            movements: movements,
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
                                            maxDistance: 128,
                                        })
                                        if (!portal) { throw `I couldn't find the end portal` }
                                        const movements = new Movements(bot.bot)
                                        bot.mc.setRestrictedMovements(movements)
                                        movements.blocksToAvoid.delete(bot.mc.registry.blocksByName['end_portal'].id)
                                        yield* this.task(bot, {
                                            point: portal.position,
                                            distance: 0,
                                            movements: movements,
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
                                            maxDistance: 128,
                                        })
                                        if (!portal) { throw `I couldn't find the nether portal` }
                                        const movements = new Movements(bot.bot)
                                        bot.mc.setRestrictedMovements(movements)
                                        movements.blocksToAvoid.delete(bot.mc.registry.blocksByName['nether_portal'].id)
                                        yield* this.task(bot, {
                                            point: portal.position,
                                            distance: 0,
                                            movements: movements,
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
                                            maxDistance: 128,
                                        })
                                        if (!portal) { throw `I couldn't find the end portal` }
                                        const movements = new Movements(bot.bot)
                                        bot.mc.setRestrictedMovements(movements)
                                        movements.blocksToAvoid.delete(bot.mc.registry.blocksByName['end_portal'].id)
                                        yield* this.task(bot, {
                                            point: portal.position,
                                            distance: 0,
                                            movements: movements,
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
                                            maxDistance: 128,
                                        })
                                        if (!portal) { throw `I couldn't find the nether portal` }
                                        const movements = new Movements(bot.bot)
                                        bot.mc.setRestrictedMovements(movements)
                                        movements.blocksToAvoid.delete(bot.mc.registry.blocksByName['nether_portal'].id)
                                        yield* this.task(bot, {
                                            point: portal.position,
                                            distance: 0,
                                            movements: movements,
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
                                            maxDistance: 128,
                                        })
                                        if (!portal) { throw `I couldn't find the end portal` }
                                        const movements = new Movements(bot.bot)
                                        bot.mc.setRestrictedMovements(movements)
                                        movements.blocksToAvoid.delete(bot.mc.registry.blocksByName['end_portal'].id)
                                        yield* this.task(bot, {
                                            point: portal.position,
                                            distance: 0,
                                            movements: movements,
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

                if (args.goal instanceof goals.GoalNear) {
                    const distanceSq = bot.bot.entity.position.distanceSquared(new Vec3(args.goal.x, args.goal.y, args.goal.z))
                    if (distanceSq <= args.goal.rangeSq) {
                        return 'here'
                    }
                }

                if (bot.memory.isGoalUnreachable(args.goal)) { throw `If I remember correctly I can't get there` }

                setOptions(bot, args.options)

                if (args.options.savePathError) {
                    args.cancel = function*() { bot.bot.pathfinder.stop() }
                    try {
                        yield* wrap(bot.bot.pathfinder.goto(args.goal))
                    } catch (error) {
                        if (error.name === 'NoPath') {
                            bot.memory.theGoalIsUnreachable(args.goal)
                        }
                        throw error
                    } finally {
                        args.cancel = undefined
                    }
                } else {
                    args.cancel = function*() { bot.bot.pathfinder.stop() }
                    try {
                        yield* wrap(bot.bot.pathfinder.goto(args.goal))
                    } finally {
                        args.cancel = undefined
                    }
                }

                return 'ok'
            } else {
                let result
                const _goals = getGoal(bot, args)

                for (const _goal of _goals) {
                    if ('dimension' in _goal) {
                        result = yield* this.task(bot, _goal)
                    } else {
                        result = yield* this.task(bot, {
                            goal: _goal,
                            options: args,
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
    GoalBlockSimple: GoalBlockSimple,
    GoalHawkeye: GoalHawkeye,
    GoalEntity: GoalEntity,
}
