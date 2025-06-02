const { Item } = require('prismarine-item')
const GameError = require('../errors/game-error')
const ItemLock = require('../locks/item-lock')
const { filterOutEquipment, filterOutItems } = require('./items')
const { stringifyItemH, isItemEquals } = require('./other')
const taskUtils = require('./tasks')
const Iterable = require('./iterable')
const Vec3Dimension = require('./vec3-dimension')
const { Vec3 } = require('vec3')
const tasks = require('../tasks')

/**
 * @param {import('../bruh-bot')} bot
 */
module.exports = (bot) => {

    const tryUnequip = async function() {
        const QUICK_BAR_COUNT = 9
        const QUICK_BAR_START = 36

        for (let i = 0; i < QUICK_BAR_COUNT; ++i) {
            if (!bot.bot.inventory.slots[QUICK_BAR_START + i]) {
                bot.bot.setQuickBarSlot(i)
                return true
            }
        }

        const slot = bot.bot.inventory.firstEmptyInventorySlot()
        if (!slot) {
            return false
        }

        const equipSlot = QUICK_BAR_START + bot.bot.quickBarSlot
        await bot.bot.clickWindow(equipSlot, 0, 0)
        await bot.bot.clickWindow(slot, 0, 0)
        if (bot.bot.inventory.selectedItem) {
            await bot.bot.clickWindow(equipSlot, 0, 0)
            return false
        }
        return true
    }

    /**
     * @param {import('./other').ItemId} item
     * @param {import('mineflayer').EquipmentDestination} destination
     */
    const equip = function*(item, destination = 'hand') {
        const _item = (typeof item === 'object' && 'slot' in item) ? item : searchInventoryItem(null, item)
        if (!_item) { throw new GameError(`Item ${stringifyItemH(item)} not found to equip`) }

        const sourceSlot = _item.slot
        const destSlot = bot.bot.getEquipmentDestSlot(destination)

        if (sourceSlot === destSlot) {
            return bot.bot.inventory.slots[destSlot]
        }

        yield* taskUtils.wrap(bot.bot.equip(_item, destination))
        yield* taskUtils.sleepTicks()
        return bot.bot.inventory.slots[destSlot]
    }

    /**
     * @returns {Array<{ item: import('./other').ItemId; count: number; }>}
     */
    const getTrashItems = function() {
        const locked = bot.lockedItems
            .filter(v => !v.isUnlocked)
            .map(v => ({ ...v }))

        let result = inventoryItems()
            .toArray()
            .map(v => /** @type {{item: import('./other').ItemId; count: number;}} */({ item: v, count: v.count }))
        result = filterOutEquipment(result, bot.mc.registry)
        result = filterOutItems(result, locked)
        return result
    }

    /**
     * @param {string} by
     * @param {import('./other').ItemId} item
     * @param {number} count
     * @returns {import('../locks/item-lock')}
     */
    const forceLockItem = function(by, item, count) {
        if (!count) { return null }
        const lock = new ItemLock(by, item, Math.min(count, count))
        bot.lockedItems.push(lock)
        // console.log(`[Bot "${bot.username}"] Item forcefully ${stringifyItem(item)} locked by ${by}`)
        return lock
    }

    /**
     * @param {string} by
     * @param {import('./other').ItemId} item
     * @param {number} count
     * @returns {import('../locks/item-lock') | null}
     */
    const tryLockItem = function(by, item, count) {
        if (!count) { return null }
        const trash = getTrashItems().filter(v => isItemEquals(v.item, item))
        if (trash.length === 0) { return null }
        let have = 0
        for (const trashItem of trash) { have += trashItem.count }
        const lock = new ItemLock(by, item, Math.min(count, have))
        bot.lockedItems.push(lock)
        // console.log(`[Bot "${bot.username}"] Item ${stringifyItem(item)} locked by ${by}`)
        return lock
    }

    /**
     * @param {import('prismarine-windows').Window | null} window
     * @param {ReadonlyArray<import('./other').ItemId>} items
     * @returns {Item | null}
     */
    const searchInventoryItem = function(window, ...items) {
        return inventoryItems(window).filter(v => {
            for (const searchFor of items) {
                if (!isItemEquals(v, searchFor)) continue
                return true
            }
            return false
        }).first() ?? null
    }

    /**
     * @param {import('./other').ItemId} item
     * @param {ReadonlyArray<import('../locks/item-lock')> | undefined} [expectThese]
     */
    const isItemLocked = function(item, expectThese) {
        expectThese ??= []
        let n = 0
        for (const lock of bot.lockedItems.filter(v1 => !expectThese.some(v2 => v1 === v2))) {
            if (!isItemEquals(lock.item, item)) continue
            if (lock.isUnlocked) continue
            n += lock.count
        }
        return n
    }

    /**
     * @param {import('prismarine-windows').Window} [window]
     * @returns {Iterable<Item>}
     */
    const inventoryItems = function(window) {
        if (!bot.bot.inventory) { return new Iterable(function*() { }) }
        window = bot.bot.currentWindow
        const hasWindow = !!window
        window ??= bot.bot.inventory

        const specialSlotIds = hasWindow ? [] : [
            bot.bot.getEquipmentDestSlot('head'),
            bot.bot.getEquipmentDestSlot('torso'),
            bot.bot.getEquipmentDestSlot('legs'),
            bot.bot.getEquipmentDestSlot('feet'),
            bot.bot.getEquipmentDestSlot('off-hand'),
        ]

        /** @type {Set<number>} */
        const set = new Set()

        return new Iterable(function*() {
            const hotbarEnd = window.hotbarStart + 9

            for (let i = window.inventoryStart; i < window.inventoryEnd; i++) {
                const item = window.slots[i]
                if (!item) { continue }
                if (set.has(i)) { continue }
                set.add(i)
                yield item
            }

            for (let i = window.hotbarStart; i < hotbarEnd; i++) {
                const item = window.slots[i]
                if (!item) { continue }
                if (set.has(i)) { continue }
                set.add(i)
                yield item
            }

            for (const specialSlotId of specialSlotIds) {
                if (specialSlotId >= window.inventoryStart && specialSlotId < window.inventoryEnd) { continue }
                if (specialSlotId >= window.hotbarStart && specialSlotId < hotbarEnd) { continue }
                const item = window.slots[specialSlotId]
                if (!item) { continue }
                if (set.has(specialSlotId)) { continue }
                set.add(specialSlotId)
                yield item
            }
        })
    }

    /**
     * @param {import('prismarine-windows').Window} [window]
     * @returns {Iterable<number>}
     */
    const inventorySlots = function(window) {
        const hasWindow = !!window
        window ??= bot.bot.inventory

        const specialSlotIds = hasWindow ? [] : [
            bot.bot.getEquipmentDestSlot('head'),
            bot.bot.getEquipmentDestSlot('torso'),
            bot.bot.getEquipmentDestSlot('legs'),
            bot.bot.getEquipmentDestSlot('feet'),
            bot.bot.getEquipmentDestSlot('hand'),
            bot.bot.getEquipmentDestSlot('off-hand'),
        ]

        /** @type {Set<number>} */
        const set = new Set()

        return new Iterable(function*() {
            const hotbarEnd = window.hotbarStart + 9

            for (let i = window.inventoryStart; i < window.inventoryEnd; i++) {
                if (set.has(i)) { continue }
                set.add(i)
                yield i
            }

            for (let i = window.hotbarStart; i < hotbarEnd; i++) {
                if (set.has(i)) { continue }
                set.add(i)
                yield i
            }

            for (const specialSlotId of specialSlotIds) {
                if (specialSlotId >= window.inventoryStart && specialSlotId < window.inventoryEnd) { continue }
                if (specialSlotId >= window.hotbarStart && specialSlotId < hotbarEnd) { continue }
                if (set.has(specialSlotId)) { continue }
                set.add(specialSlotId)
                yield specialSlotId
            }
        })
    }

    /**
     * @param {import('prismarine-windows').Window} window
     * @returns {Iterable<Item>}
     */
    const containerItems = function(window) {
        return new Iterable(function*() {
            for (let i = 0; i < window.inventoryStart; ++i) {
                const item = window.slots[i]
                if (!item) { continue }
                yield item
            }
        })
    }

    /**
     * @param {import('prismarine-windows').Window} window
     */
    const containerSlots = function(window) {
        /**
         * @type {Record<number, Item>}
         */
        const slots = {}

        for (let i = 0; i < window.inventoryStart; i++) {
            const item = window.slots[i]
            if (!item) { continue }
            console.assert(item.slot === i)
            slots[i] = item
        }

        return slots
    }

    /**
     * @param {import('prismarine-windows').Window} window
     * @param {Readonly<import('./other').ItemId>} item
     * @returns {number}
     */
    const inventoryItemCount = function(window, item) {
        let count = 0

        for (const matchedItem of inventoryItems(window).filter(v => isItemEquals(v, item))) {
            count += matchedItem.count
        }

        return count
    }

    /**
     * @param {import('prismarine-windows').Window} window
     * @param {Readonly<import('./other').ItemId>} item
     * @returns {number}
     */
    const containerItemCount = function(window, item) {
        let count = 0

        for (const matchedItem of containerItems(window).filter(v => isItemEquals(v, item))) {
            count += matchedItem.count
        }

        return count
    }

    /**
     * @param {import('prismarine-windows').Window | null} [window]
     * @param {Readonly<import('./other').ItemId> | null} [item]
     * @returns {number | null}
     */
    const firstFreeInventorySlot = function(window = null, item = null) {
        const hasWindow = !!window
        window ??= bot.bot.inventory

        const specialSlotIds = hasWindow ? [] : [
            // bot.bot.getEquipmentDestSlot('head'),
            // bot.bot.getEquipmentDestSlot('torso'),
            // bot.bot.getEquipmentDestSlot('legs'),
            // bot.bot.getEquipmentDestSlot('feet'),
            bot.bot.getEquipmentDestSlot('hand'),
            // bot.bot.getEquipmentDestSlot('off-hand'),
        ]

        if (item) {
            for (let i = window.inventoryStart; i < window.inventoryEnd; i++) {
                const _item = window.slots[i]
                if (!_item) { continue }
                if (!isItemEquals(_item, item)) { continue }
                if (_item.count >= _item.stackSize) { continue }
                return i
            }

            for (const i of specialSlotIds) {
                const _item = window.slots[i]
                if (!_item) { continue }
                if (!isItemEquals(_item, item)) { continue }
                if (_item.count >= _item.stackSize) { continue }
                return i
            }
        }

        for (let i = window.inventoryStart; i < window.inventoryEnd; i++) {
            if (!window.slots[i]) { return i }
        }

        for (const i of specialSlotIds) {
            if (!window.slots[i]) { return i }
        }

        return null
    }

    /**
     * @param {import('prismarine-windows').Window} window
     * @param {Readonly<import('./other').ItemId> | null} [item]
     * @returns {number | null}
     */
    const firstFreeContainerSlot = function(window, item = null) {
        if (item) {
            for (let i = 0; i < window.inventoryStart; i++) {
                const _item = window.slots[i]
                if (!_item) { continue }
                if (!isItemEquals(_item, item)) { continue }
                if (_item.count >= _item.stackSize) { continue }
                return i
            }
        }

        for (let i = 0; i < window.inventoryStart; i++) {
            if (window.slots[i] === null) {
                return i
            }
        }

        return null
    }

    const clearMainHand = function*() {
        const emptySlot = bot.bot.inventory.firstEmptyInventorySlot(true)
        if (!emptySlot) {
            return false
        }
        yield* taskUtils.wrap(bot.bot.unequip('hand'))
        return true
    }

    /**
     * @param {import('./other').ItemId} item
     */
    const holds = function(item, offhand = false) {
        if (offhand) {
            if (bot.bot.supportFeature('doesntHaveOffHandSlot')) { return false }

            const holdingItem = bot.bot.inventory.slots[bot.bot.getEquipmentDestSlot('off-hand')]
            if (!holdingItem) { return false }

            return isItemEquals(holdingItem, item)
        } else {
            const holdingItem = bot.bot.inventory.slots[bot.bot.getEquipmentDestSlot('hand')]
            if (!holdingItem) { return false }

            return isItemEquals(holdingItem, item)
        }
    }

    /**
     * @param {import('./other').ItemId | null} item
     */
    const isInventoryFull = function(item = null) {
        const slotIds = [
            bot.bot.getEquipmentDestSlot('hand'),
            bot.bot.getEquipmentDestSlot('off-hand'),
        ]

        for (let i = bot.bot.inventory.inventoryStart; i <= bot.bot.inventory.inventoryEnd; i++) {
            slotIds.push(i)
        }

        for (const slotId of slotIds) {
            const slot = bot.bot.inventory.slots[slotId]
            if (!slot) { return false }
            if (slot.count >= slot.stackSize) { continue }
            if (item && isItemEquals(item, slot)) { return false }
        }

        return true
    }

    /**
     * @param {import('mineflayer').Chest | null} chest
     * @param {Vec3} chestBlock
     * @param {Readonly<import('./other').ItemId>} item
     * @param {number} count
     * @returns {import('../task').Task<number>}
     */
    const chestDeposit = function*(chest, chestBlock, item, count) {
        let depositCount = (count === Infinity) ? inventoryItemCount(chest, item) : count

        if (depositCount === 0) {
            chest.close()
            try {
                yield* taskUtils.sleepTicks()
                depositCount = (count === Infinity) ? inventoryItemCount(chest, item) : count
            } finally {
                chest = yield* taskUtils.wrap(bot.bot.openChest(bot.bot.blockAt(chestBlock)))
            }
        }

        if (depositCount === 0) return 0

        const stackSize = bot.mc.registry.itemsByName[typeof item === 'string' ? item : item.name].stackSize

        let botItems = inventoryItems(chest)
            .filter(v => isItemEquals(v, item) && v.count > 0)
            .toArray()

        if (botItems.length === 0) {
            chest.close()
            try {
                yield* taskUtils.sleepTicks()
                const botItemsWithoutChest = inventoryItems(null)
                    .filter(v => isItemEquals(v, item) && v.count > 0)
                    .toArray()
                if (botItemsWithoutChest.length > 0) {
                    const firstItem = botItemsWithoutChest[0]
                    const specialSlotNames = (/** @type {Array<import('mineflayer').EquipmentDestination>} */ ([
                        'head',
                        'torso',
                        'legs',
                        'feet',
                        'off-hand',
                    ])).map(v => ({ name: v, slot: bot.bot.getEquipmentDestSlot(v) }))
                    const slot = specialSlotNames.find(v => v.slot === firstItem.slot)
                    if (slot) {
                        yield* taskUtils.wrap(bot.bot.unequip(slot.name))
                    }
                }
            } finally {
                chest = yield* taskUtils.wrap(bot.bot.openChest(bot.bot.blockAt(chestBlock)))
                botItems = inventoryItems(chest)
                    .filter(v => isItemEquals(v, item) && v.count > 0)
                    .toArray()
            }
        }

        let error = null
        for (let i = 0; i < 5; i++) {
            try {
                if (botItems.length === 0) return 0
                if (!botItems[0]) return 0

                const destinationSlot = firstFreeContainerSlot(chest, item)
                if (destinationSlot === null) return 0

                const actualCount = Math.min(
                    depositCount,
                    botItems[0].count,
                    stackSize,
                    stackSize - (chest.slots[destinationSlot] ? chest.slots[destinationSlot].count : 0)
                )

                const sourceSlot = botItems[0].slot

                yield* taskUtils.wrap(bot.bot.transfer({
                    window: chest,
                    itemType: bot.mc.registry.itemsByName[typeof item === 'string' ? item : item.name].id,
                    metadata: null,
                    count: actualCount,
                    sourceStart: (sourceSlot !== null) ? sourceSlot : chest.inventoryStart,
                    sourceEnd: (sourceSlot !== null) ? sourceSlot + 1 : chest.inventoryEnd,
                    destStart: (destinationSlot !== null) ? destinationSlot : 0,
                    destEnd: (destinationSlot !== null) ? destinationSlot + 1 : chest.inventoryStart,
                }))

                bot.env.recordChestTransfer(
                    bot,
                    chest,
                    new Vec3Dimension(chestBlock, bot.dimension),
                    typeof item === 'string' ? item : item.name,
                    actualCount)

                return actualCount
            } catch (_error) {
                error = _error
            }
        }

        throw error
    }

    /**
     * @param {import('mineflayer').Chest} chest
     * @param {Vec3} chestBlock
     * @param {Readonly<import('./other').ItemId>} item
     * @param {number} count
     * @returns {import('../task').Task<number>}
     */
    const chestWithdraw = function*(chest, chestBlock, item, count) {
        const withdrawCount = Math.min(containerItemCount(chest, item), count)
        if (withdrawCount === 0) {
            console.warn(`No ${typeof item === 'string' ? item : item.name} in the chest`)
            return 0
        }

        const stackSize = bot.mc.registry.itemsByName[typeof item === 'string' ? item : item.name].stackSize

        const _containerSlots = containerSlots(chest)
        const containerItems = Object.keys(_containerSlots)
            .map(i => Number.parseInt(i))
            .map(i => ({ slot: i, item: _containerSlots[i] }))
            .filter(v => v.item && isItemEquals(v.item, item) && (v.item.count))

        if (containerItems.length === 0) {
            console.warn(`No ${typeof item === 'string' ? item : item.name} in the chest (what?)`)
            return 0
        }

        if (!containerItems[0]?.item) {
            console.warn(`No ${typeof item === 'string' ? item : item.name} in the chest (what???)`)
            return 0
        }

        const actualCount = Math.min(
            withdrawCount,
            containerItems[0].item.count,
            stackSize
        )

        const destinationSlot = firstFreeInventorySlot(chest, item)
        if (destinationSlot === null) {
            console.warn(`Inventory is full`)
            return 0
        }

        const sourceSlot = containerItems[0].slot

        yield* taskUtils.wrap(bot.bot.transfer({
            window: chest,
            itemType: bot.mc.registry.itemsByName[typeof item === 'string' ? item : item.name].id,
            metadata: null,
            count: actualCount,
            sourceStart: (sourceSlot !== null) ? sourceSlot : 0,
            sourceEnd: (sourceSlot !== null) ? sourceSlot + 1 : chest.inventoryStart,
            destStart: (destinationSlot !== null) ? destinationSlot : chest.inventoryStart,
            destEnd: (destinationSlot !== null) ? destinationSlot + 1 : chest.inventoryEnd,
        }))

        bot.env.recordChestTransfer(
            bot,
            chest,
            new Vec3Dimension(chestBlock, bot.dimension),
            typeof item === 'string' ? item : item.name,
            -actualCount)

        return actualCount
    }

    /**
     * @param {import('../task').RuntimeArgs<{
        item: import('./other').ItemId;
        count: number;
    } | {
        item: ReadonlyArray<import('./other').ItemId>;
    }>} args
     * @returns {import('../task').Task<Item | null>}
     */
    const ensureItem = function*(args) {
        if ('count' in args) {
            const has = inventoryItemCount(null, args.item)

            if (has >= args.count) {
                const result = searchInventoryItem(null, args.item)
                if (result) { return result }
            }

            try {
                yield* tasks.gatherItem.task(bot, {
                    ...taskUtils.runtimeArgs(args),
                    item: args.item,
                    count: args.count,
                    canUseInventory: true,
                    canUseChests: true,
                })
                const result = searchInventoryItem(null, args.item)
                if (result) { return result }
            } catch (error) {
                console.warn(`[Bot "${bot.username}"]`, error)
            }

            return null
        } else {
            let result = searchInventoryItem(null, ...args.item)
            if (result) { return result }

            try {
                yield* tasks.gatherItem.task(bot, {
                    item: args.item,
                    count: 1,
                    canUseInventory: true,
                    canUseChests: true,
                    ...taskUtils.runtimeArgs(args),
                })
                result = searchInventoryItem(null, ...args.item)
                if (result) { return result }
            } catch (error) {

            }

            return null
        }
    }

    /**
     * @param {import('./other').ItemId} item
     * @param {number} [count = 1]
     */
    const toss = function*(item, count = 1) {
        /**
         * @type {ReadonlyArray<import('mineflayer').EquipmentDestination>}
         */
        const specialSlotNames = [
            'head',
            'torso',
            'legs',
            'feet',
            'off-hand',
        ]

        /** @type {Array<import('prismarine-entity').Entity>} */
        const droppedItems = []

        let tossed = 0
        for (const have of bot.inventory.inventoryItems()) {
            if (!isItemEquals(have, item)) { continue }
            for (const specialSlotName of specialSlotNames) {
                if (bot.bot.getEquipmentDestSlot(specialSlotName) !== have.slot) { continue }
                yield* taskUtils.wrap(bot.bot.unequip(specialSlotName))
            }
            const tossCount = Math.min(count - tossed, have.count)
            if (tossCount <= 0) { continue }

            let droppedItemEntity = null
            const droppedAt = performance.now()
            /**
             * @param {import('prismarine-entity').Entity} entity
             */
            const onSpawn = (entity) => {
                if (entity.name !== 'item') return
                setTimeout(() => {
                    const _item = entity.getDroppedItem()
                    if (!_item) return
                    if (_item.name !== have.name) return
                    droppedItemEntity = entity
                }, 100)
            }
            bot.bot.on('entitySpawn', onSpawn)

            try {
                yield* taskUtils.wrap(bot.bot.toss(have.type, null, tossCount))
                const waitTime = performance.now() - droppedAt
                while (!droppedItemEntity && waitTime < 1000) {
                    yield* taskUtils.sleepTicks()
                }
                if (droppedItemEntity) droppedItems.push(droppedItemEntity)
            } finally {
                bot.bot.off('entitySpawn', onSpawn)
            }

            tossed += tossCount
        }

        return {
            tossed: tossed,
            droppedItems: droppedItems,
        }
    }

    return {
        tryUnequip,
        equip,
        getTrashItems,
        forceLockItem,
        tryLockItem,
        searchInventoryItem,
        isItemLocked,
        inventoryItems,
        inventorySlots,
        containerItems,
        containerSlots,
        inventoryItemCount,
        containerItemCount,
        firstFreeInventorySlot,
        firstFreeContainerSlot,
        clearMainHand,
        isInventoryFull,
        chestDeposit,
        chestWithdraw,
        ensureItem,
        holds,
        toss,
    }
}
