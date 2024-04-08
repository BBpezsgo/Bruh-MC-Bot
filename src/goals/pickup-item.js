const Context = require("../context")
const { Goal } = require("./base")
const { Entity } = require("prismarine-entity")
const { Item } = require("prismarine-item")
const { Vec3 } = require("vec3")
const GotoGoal = require("./goto")
const Wait = require("./wait")
const AsyncGoal = require("./async-base")
const { error } = require('../utils')

module.exports = class PickupItemGoal extends AsyncGoal {
    /**
     * @readonly
     * @type {{
     *   inAir?: boolean;
     *   maxDistance?: number;
     *   point?: Vec3;
     * }}
     */
    options

    /**
     * @readonly
     * @type {Array<{ position: Vec3, item: string }> | null}
     */
    harvestedSaplings = []

    /**
     * @param {Goal<any>} parent
     * @param {{
     *   inAir?: boolean;
     *   maxDistance?: number;
     *   point?: Vec3;
     * }} options
     * @param {Array<{ position: Vec3, item: string }> | null} harvestedSaplings
     */
    constructor(parent, options, harvestedSaplings) {
        super(parent)

        this.options = options
        this.harvestedSaplings = harvestedSaplings
    }

    /**
     * @override
     * @param {Context} context
     * @returns {import('./base').AsyncGoalReturn<true>}
     */
    async run(context) {
        super.run(context)

        let nearest = PickupItemGoal.getClosestItem(context, null, this.options ?? { })

        /*
        if ('error' in nearest) {
            const nearestArrow = PickupItemGoal.getClosestArrow(context)
            if ('result' in nearestArrow) {
                nearest = nearestArrow
            }
        }
        */

        if ('error' in nearest) {
            const nearestXp = PickupItemGoal.getClosestXp(context, this.options ?? { })
            if ('result' in nearestXp) {
                nearest = nearestXp
            }
        }

        if ('error' in nearest) {
            return error(`${this.indent} ${nearest.error}`)
        }

        const item = nearest.result.getDroppedItem()
        
        if (item) {
            if (context.isInventoryFull(item.type)) {
                return error(`${this.indent} Inventory is full`)
            }
        }

        {
            const subresult = await (new GotoGoal(this, nearest.result.position.clone(), 0, context.restrictedMovements)).wait()
            if ('error' in subresult) return error(subresult.error)
        }
    
        {
            const subresult = await (this, new Wait(this, 200)).wait()
            if ('error' in subresult) return error(subresult.error)
        }
        
        if (item &&
            this.harvestedSaplings && (
                item.name === 'oak_sapling' ||
                item.name === 'spruce_sapling' ||
                item.name === 'birch_sapling' ||
                item.name === 'jungle_sapling' ||
                item.name === 'acacia_sapling' ||
                // item.name === 'dark_oak_sapling' ||
                item.name === 'mangrove_propagule' ||
                item.name === 'cherry_sapling' ||
                item.name === 'azalea' ||
                item.name === 'flowering_azalea')
            ) {
            this.harvestedSaplings.push({
                position: nearest.result.position.clone(),
                item: item.name,
            })
        }

        return { result: true }
    }

    /**
     * @param {Context} context
     * @param {((item: Item) => boolean) | null} filter
     * @param {{
     *   inAir?: boolean;
     *   maxDistance?: number;
     *   point?: Vec3;
     *   evenIfFull?: boolean;
     * }} options
     * @returns {import('../result').Result<Entity>}
     */
    static getClosestItem(context, filter, options = { }) {
        if (!options) { options = { } }
        if (!options.inAir) { options.inAir = false }
        if (!options.maxDistance) { options.maxDistance = 10 }
        if (!options.point) { options.point = context.bot.entity.position.clone() }
        if (!options.evenIfFull) { options.evenIfFull = false }

        const nearestEntity = context.bot.nearestEntity(entity => {
            if (entity.name !== 'item') { return false }
            if (!options.inAir && entity.velocity.distanceTo(new Vec3(0, 0, 0)) > 0.01) { return false }
            if (filter && !filter(entity.getDroppedItem())) { return false }
            if (!options.evenIfFull && context.isInventoryFull(entity.getDroppedItem().type)) { return false }
            return true
        })
        if (!nearestEntity) { return { error: `No items found` } }

        const distance = nearestEntity.position.distanceTo(options.point)
        if (distance > options.maxDistance) { return { error: `No items nearby` } }
        
        return { result: nearestEntity }
    }

    /**
     * @param {Context} context
     * @param {{
    *   maxDistance?: number;
    *   point?: Vec3;
    * }} options
    * @returns {import('../result').Result<Entity>}
    */
    static getClosestArrow(context, options = { }) {
        const nearestEntity = context.bot.nearestEntity(entity => (
            entity.displayName === 'Arrow' &&
            (entity.velocity.distanceTo(new Vec3(0, 0, 0)) < 1)
            ))
        if (!nearestEntity) { return { error: `No arrows found` } }

        const distance = nearestEntity.position.distanceTo(options.point ?? context.bot.entity.position)
        if (distance > (options.maxDistance || 10)) { return { error: `No arrows nearby` } }
            
        return { result: nearestEntity }
    }

    /**
     * @param {Context} context
     * @param {{
    *   maxDistance?: number;
    *   point?: Vec3;
    * }} options
    * @returns {import('../result').Result<Entity>}
    */
    static getClosestXp(context, options = { }) {
        const nearestEntity = context.bot.nearestEntity(entity => (
            entity.name === 'experience_orb')
        )
        if (!nearestEntity) { return { error: `No xps found` } }

        const distance = nearestEntity.position.distanceTo(options.point ?? context.bot.entity.position)
        if (distance > (options.maxDistance || 10)) { return { error: `No xps nearby` } }
            
        return { result: nearestEntity }
    }

    /**
     * @override
     * @param {import('../context')} context
     * @returns {string}
     */
    toReadable(context) {
        return `Pick up items`
    }
}