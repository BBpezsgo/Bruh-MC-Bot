const Minecraft = require('../minecraft')

/**
 * @param {ReadonlyArray<Readonly<{ name: string; count: number; nbt?: import('../bruh-bot').NBT; }>>} items
 * @param {import('../minecraft')['registry']} registry
 * @returns {Array<{ name: string; count: number; nbt: import('../bruh-bot').NBT; }>}
 */
function filterOutEquipment(items, registry) {
    const equipment = require('../equipment')

    const result = items.map(v => ({ name: v.name, count: v.count, nbt: v.nbt, originalCount: v.count }))
    /**
     * @type {ReadonlyArray<import('../equipment').SatisfiedEquipmentItem>}
     */
    const _equipment = equipment.map(v => ({
        ...v,
        satisfied: false,
    }))
    for (const _equipmentItem of _equipment) {
        if (_equipmentItem.satisfied) { continue }
        switch (_equipmentItem.type) {
            case 'single': {
                const goodItem = result.find(v =>
                    (v.name === _equipmentItem.item) &&
                    (v.count > 0)
                )
                if (goodItem) {
                    goodItem.count--
                    _equipmentItem.satisfied = true
                    break
                }
                break
            }
            case 'any': {
                const preferredItem = result.find(v =>
                    (v.name === _equipmentItem.prefer) &&
                    (v.count > 0)
                )
                if (preferredItem) {
                    preferredItem.count--
                    _equipmentItem.satisfied = true
                    break
                }

                const goodItem = result.find(v =>
                    (_equipmentItem.item.includes(v.name)) &&
                    (v.count > 0)
                )
                if (goodItem) {
                    goodItem.count--
                    _equipmentItem.satisfied = true
                    break
                }
                break
            }
            case 'food': {
                const foods = result
                    .map(v => ({ food: registry.foods[registry.itemsByName[v.name].id], item: v }))
                    .filter(v =>
                        v.food &&
                        !Minecraft.badFoods.includes(v.item.name) &&
                        (v.item.count > 0)
                    )
                let soFar = 0
                for (const food of foods) {
                    while (food.item.count > 0 && soFar < _equipmentItem.food) {
                        food.item.count--
                        soFar += food.food.foodPoints
                    }
                }
                _equipmentItem.satisfied = (soFar >= _equipmentItem.food)
                break
            }
            default: {
                break
            }
        }
    }

    return result
        .filter(v => (v.count > 0))
}


/**
 * @param {ReadonlyArray<Readonly<{ name: string; count: number; nbt?: import('../bruh-bot').NBT; }>>} items
 * @param {ReadonlyArray<Readonly<{ name: string; count: number; nbt?: import('../bruh-bot').NBT; }>>} exclude
 * @returns {Array<{ name: string; count: number; nbt: import('../bruh-bot').NBT; }>}
 */
function filterOutItems(items, exclude) {
    const result = items.map(v => ({ name: v.name, count: v.count, nbt: v.nbt }))
   
    for (const _exclude of exclude.map(v => ({ ...v }))) {
        if (_exclude.count <= 0) { continue }
        const goodItem = result.find(v =>
            (v.name === _exclude.name) &&
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
