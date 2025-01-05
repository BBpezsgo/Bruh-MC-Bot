'use strict'

const Minecraft = require('../minecraft')
const { isItemEquals } = require('./other')

/**
 * @typedef {import('prismarine-nbt').Tags[import('prismarine-nbt').TagType]} NBT
 */

/**
 * @param {ReadonlyArray<Readonly<{ item: import('./other').ItemId; count: number; }>>} items
 * @param {import('../minecraft')['registry']} registry
 * @returns {Array<{ item: import('./other').ItemId; count: number; }>}
 */
function filterOutEquipment(items, registry) {
    const equipment = require('../equipment')

    const result = items.map(v => ({ item: v.item, count: v.count, originalCount: v.count }))
    const _equipment = equipment.map(v => ({
        ...v,
        satisfied: false,
    }))

    /**
     * @param {{ count: number; }} item
     * @param {'any' | number} count
     */
    function consumeItem(item, count) {
        if (count === 'any') {
            item.count = 0
            count = 0
        } else {
            const remove = Math.min(item.count, count)
            item.count -= remove
            count -= remove
        }
        return count
    }

    for (const _equipmentItem of _equipment) {
        if (_equipmentItem.satisfied) { continue }
        switch (_equipmentItem.type) {
            case 'single': {
                let goodItem = null
                while ((goodItem = result.find(v => isItemEquals(v.item, _equipmentItem.item) && v.count > 0)) && consumeItem(goodItem, _equipmentItem.count)) {

                }
                _equipmentItem.satisfied = _equipmentItem.count === 'any' ? true : _equipmentItem.count <= 0
                break
            }
            case 'any': {
                let goodItem = null
                while ((goodItem = result.find(v => isItemEquals(v.item, _equipmentItem.prefer) && v.count > 0)) && consumeItem(goodItem, _equipmentItem.count)) {

                }
                _equipmentItem.satisfied = _equipmentItem.count === 'any' ? true : _equipmentItem.count <= 0
                if (_equipmentItem.satisfied) break

                while ((goodItem = result.find(v => _equipmentItem.item.some(v2 => isItemEquals(v2, v.item)) && v.count > 0)) && consumeItem(goodItem, _equipmentItem.count)) {

                }
                _equipmentItem.satisfied = _equipmentItem.count === 'any' ? true : _equipmentItem.count <= 0
                break
            }
            case 'food': {
                const foods = result
                    .map(v => ({
                        food: registry.foods[registry.itemsByName[typeof v.item === 'string' ? v.item : v.item.name].id],
                        item: v,
                    }))
                    .filter(v =>
                        v.food &&
                        !Minecraft.badFoods.some(v2 => isItemEquals(v2, v.item.item)) &&
                        (v.item.count > 0)
                    )
                let soFar = 0
                for (const food of foods) {
                    while (food.item.count > 0 && !_equipmentItem.satisfied) {
                        food.item.count--
                        soFar += food.food.foodPoints
                        _equipmentItem.satisfied = (soFar >= _equipmentItem.food)
                    }
                }
                break
            }
            default: break
        }
    }

    return result
        .filter(v => (v.count > 0))
}


/**
 * @param {ReadonlyArray<Readonly<{ item: import('./other').ItemId; count: number; }>>} items
 * @param {ReadonlyArray<Readonly<{ item: import('./other').ItemId; count: number; }>>} exclude
 * @returns {Array<{ item: import('./other').ItemId; count: number; }>}
 */
function filterOutItems(items, exclude) {
    const result = items.map(v => ({ ...v }))

    for (const _exclude of exclude.map(v => ({ ...v }))) {
        if (_exclude.count <= 0) { continue }
        const goodItem = result.find(v =>
            (isItemEquals(v.item, _exclude.item)) &&
            (v.count > 0)
        )
        if (!goodItem) { continue }
        const has = Math.min(_exclude.count, goodItem.count)
        _exclude.count -= has
        goodItem.count -= has
    }

    return result.filter(v => (v.count > 0))
}

module.exports = {
    filterOutEquipment,
    filterOutItems,
}
