'use strict'

const { Item } = require('prismarine-item')
const { NBT2JSON } = require('./other')

const INVALID_ITEMS = [
    'shulker_box',
    'white_shulker_box',
    'light_gray_shulker_box',
    'gray_shulker_box',
    'black_shulker_box',
    'brown_shulker_box',
    'red_shulker_box',
    'orange_shulker_box',
    'yellow_shulker_box',
    'lime_shulker_box',
    'green_shulker_box',
    'cyan_shulker_box',
    'light_blue_shulker_box',
    'blue_shulker_box',
    'purple_shulker_box',
    'magenta_shulker_box',
    'pink_shulker_box',
]

module.exports = {
    /**
     * @param {import('mineflayer').Bot} bot
     * @param {import('minecraft-data').IndexedData} registry 
     * @param {number} bundleSlot
     * @param {number} itemSlot
     */
    putIn: async function(bot, registry, bundleSlot, itemSlot) {
        let bundleItem = bot.inventory.slots[bundleSlot]
        if (!bundleItem) { throw new Error(`There is no bundle at slot ${bundleSlot}`) }
        if (bundleItem.name !== 'bundle') { throw new Error(`There isn't a bundle at ${bundleSlot} but a ${bundleItem.name}`) }

        const bundleItemsBefore = this.content(bundleItem.nbt)

        let item = bot.inventory.slots[itemSlot]
        if (!item) { throw new Error(`There is nothing at slot ${itemSlot}`) }
        if (INVALID_ITEMS.includes(item.name)) { throw new Error(`Can't put ${item.name} into a bundle`) }

        const emptySpace = 64 - this.size(registry, bundleItem)
        if (emptySpace === 0) { throw new Error(`The bundle is full`) }

        const itemSize = 64 / item.stackSize
        const canPutIn = Math.floor(Math.min(emptySpace, item.count * itemSize) / itemSize)

        if (canPutIn === 0) { throw new Error(`Not enough space in the bundle`) }

        await bot.clickWindow(bundleSlot, 0, 0)
        await bot.waitForTicks(1)
        await bot.clickWindow(itemSlot, 1, 0)
        await bot.waitForTicks(1)
        await bot.clickWindow(bundleSlot, 0, 0)
        await bot.waitForTicks(1)

        bundleItem = bot.inventory.slots[bundleSlot]
        if (!bundleItem) { throw new Error(`There is no bundle at slot ${bundleSlot} after the operation`) }
        if (bundleItem.name !== 'bundle') { throw new Error(`There isn't a bundle at ${bundleSlot} but a ${bundleItem.name} after the operation`) }

        const bundleItemsAfter = this.content(bundleItem.nbt)

        /**
         * @type {Record<string, number>}
         */
        const delta = {}

        for (const _item of bundleItemsAfter) {
            delta[_item.name] = (bundleItemsBefore.find(v => v.name === _item.name)?.count ?? 0) - _item.count
        }

        for (const key of Object.keys(delta)) {
            if (!delta[key]) { delete delta[key] }
        }

        if (Object.keys(delta).length === 1 &&
            Object.keys(delta)[0] === item.name) {
            if (delta[item.name] !== -canPutIn) {
                throw new Error(`Couldn't put ${canPutIn} ${item.name} into the bundle, only ${-delta[item.name]}`)
            }
            return
        }

        throw new Error(`Messed up the bundle operation. Items delta: ${JSON.stringify(delta, null, ' ')}`)
    },
    /**
     * @param {import('mineflayer').Bot} bot
     * @param {import('minecraft-data').IndexedData} registry 
     * @param {number} bundleSlot
     * @param {string} item
     * @returns {Promise<Item | null>}
     */
    takeOutItem: async function(bot, registry, bundleSlot, item) {
        if (INVALID_ITEMS.includes(item)) { throw new Error(`Can't put ${item} into a bundle`) }

        let bundleItem = bot.inventory.slots[bundleSlot]
        if (!bundleItem) { throw new Error(`There is no bundle at slot ${bundleSlot}`) }
        if (bundleItem.name !== 'bundle') { throw new Error(`There isn't a bundle at ${bundleSlot} but a ${bundleItem.name}`) }

        const bundleItemsBefore = this.content(bundleItem.nbt)

        if (bundleItemsBefore.length === 0) { throw new Error(`The bundle is empty`) }
        if (!bundleItemsBefore.find(v => v.name === item)) { throw new Error(`There is not ${item} in the bundle`) }

        const takenOut = []
        let result = null

        while (item) {
            const _takenOut = await this.takeOut(bot, bundleSlot)
            if (_takenOut.name === item) {
                result = _takenOut
                break
            }
            takenOut.push(_takenOut)
        }

        for (const item of takenOut) {
            await bot.waitForTicks(2)
            this.putIn(bot, registry, bundleSlot, item.slot)
        }

        return result
    },
    /**
     * @param {import('mineflayer').Bot} bot
     * @param {number} bundleSlot
     */
    takeOut: async function(bot, bundleSlot) {
        const bundleItem = bot.inventory.slots[bundleSlot]
        if (!bundleItem) { throw new Error(`There is no bundle at slot ${bundleSlot}`) }
        if (bundleItem.name !== 'bundle') { throw new Error(`There isn't a bundle at ${bundleSlot} but a ${bundleItem.name}`) }

        const bundleItemsBefore = this.content(bundleItem.nbt)

        if (bundleItemsBefore.length === 0) { throw new Error(`The bundle is empty`) }

        const emptySlot = bot.inventory.firstEmptyInventorySlot(false)
        if (emptySlot === null) { throw new Error(`No empty slot found`) }

        const expected = bundleItemsBefore[0]

        await bot.clickWindow(bundleSlot, 0, 0)
        await bot.waitForTicks(1)

        await bot.clickWindow(emptySlot, 1, 0)
        await bot.waitForTicks(1)

        await bot.clickWindow(bundleSlot, 0, 0)
        await bot.waitForTicks(1)

        if (bot.inventory.slots[bundleSlot]?.name !== 'bundle') { throw new Error(`Failed to put back the bundle`) }

        const takenOut = bot.inventory.slots[emptySlot]
        if (!takenOut) { throw new Error(`There is nothing at the destination slot after the operation`) }
        if (takenOut.name !== expected.name) { throw new Error(`Unexpected item ${takenOut.name} at the destination slot after the operation, expected ${expected.name}`) }
        if (takenOut.count !== expected.count) { throw new Error(`Couldn't take out all the ${expected.name} from the bundle: taken ${takenOut.count}, expected ${expected.count}.`) }

        return takenOut
    },
    /**
     * @param {import('mineflayer').Bot} bot
     * @param {number} bundleSlot
     */
    empty: async function(bot, bundleSlot) {
        while (true) {
            const bundleItem = bot.inventory.slots[bundleSlot]
            if (!bundleItem) { throw new Error(`There is no bundle at slot ${bundleSlot}`) }
            if (bundleItem.name !== 'bundle') { throw new Error(`There isn't a bundle at ${bundleSlot} but a ${bundleItem.name}`) }

            const bundleItems = this.content(bundleItem.nbt)
            if (bundleItems.length === 0) { return }

            const emptySlot = bot.inventory.firstEmptyInventorySlot(false)

            if (emptySlot === null) { throw new Error(`No empty slot found in the inventory`) }

            await bot.clickWindow(bundleSlot, 0, 0)
            await bot.waitForTicks(1)
            await bot.clickWindow(emptySlot, 1, 0)
            await bot.waitForTicks(1)
            await bot.clickWindow(bundleSlot, 0, 0)
            await bot.waitForTicks(1)
        }
    },
    /**
     * @param {import('minecraft-data').IndexedData} registry
     * @param {Item} bundle
     * @returns 0 - 64
     */
    size: function(registry, bundle) {
        if (bundle.name !== 'bundle') { throw new Error(`This isn't a bundle but a ${bundle.name}`) }
        const bundleItems = this.content(bundle.nbt)
        let size = 0
        for (const bundleItem of bundleItems) {
            const itemInfo = registry.itemsByName[bundleItem.name]
            const itemSize = 64 / itemInfo.stackSize
            size += itemSize * bundleItem.count
        }
        return size
    },
    /**
     * @param {import('prismarine-nbt').Tags[import('prismarine-nbt').TagType] | null} nbt
     */
    content: function(nbt) {
        if (!nbt) { return [] }
        const data = NBT2JSON(nbt)
        if (!data) { return null }
        if (typeof data !== 'object') { return null }
        if (!('Items' in data)) { return null }
        if (!Array.isArray(data['Items'])) { return null }
        let bundleItems = []
        for (const bundleItem of data.Items) {
            if (!bundleItem || typeof bundleItem !== 'object') { return null }
            if (!('id' in bundleItem) || typeof bundleItem['id'] !== 'string') { return null }
            if (!('Count' in bundleItem) || typeof bundleItem['Count'] !== 'number') { return null }
            if (!bundleItem['id'].startsWith('minecraft:')) { return null }
            const itemId = bundleItem['id'].replace('minecraft:', '')
            bundleItems.push({
                name: itemId,
                count: bundleItem['Count'],
            })
        }
        return bundleItems
    },
    /**
     * @param {import('mineflayer').Bot} bot
     * @param {string} item
     */
    bestBundleWithItem: function(bot, item) {
        const bundleItems = bot.inventory.slots.filter(v => v?.name === 'bundle')
        let bestBundle = null
        let bestBundleDepth = Infinity
        for (const bundleItem of bundleItems) {
            if (bundleItem.count !== 1) { continue }
            const bundleContent = this.content(bundleItem.nbt)
            const filteredContent = bundleContent.filter(v => v?.name === item)
            if (filteredContent.length === 0) { continue }
            if (filteredContent.length !== 1) { throw `What?` }
            const itemDepth = bundleContent.length - bundleContent.findIndex(v => v.name === item)
            if (itemDepth < bestBundleDepth) {
                bestBundle = bundleItem
                bestBundleDepth = itemDepth
            }
        }
        return bestBundle
    },
    /**
     * @param {import('mineflayer').Bot} bot
     * @param {string} item
     */
    bestBundlesWithItem: function(bot, item) {
        const bundleItems = bot.inventory.slots.filter(v => v?.name === 'bundle')
        /**
         * @type {Array<{ bundle: import('prismarine-item').Item; depth: number; }>}
         */
        const bundles = []
        for (const bundleItem of bundleItems) {
            if (bundleItem.count !== 1) { continue }
            const bundleContent = this.content(bundleItem.nbt)
            const filteredContent = bundleContent.filter(v => v?.name === item)
            if (filteredContent.length === 0) { continue }
            if (filteredContent.length !== 1) { throw `What?` }
            const itemDepth = bundleContent.length - bundleContent.findIndex(v => v.name === item)
            bundles.push({
                bundle: bundleItem,
                depth: itemDepth,
            })
        }
        bundles.sort((a, b) => a.depth - b.depth)
        return bundles
    },
}
