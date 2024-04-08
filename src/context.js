const hawkeye = require('minecrafthawkeye')
const MC = require('./mc')
const { Vec3 } = require('vec3')
const { Movements } = require('mineflayer-pathfinder')
const { Item } = require('prismarine-item')
const MeleeWeapons = require('./melee-weapons')
const { Block } = require('prismarine-block')
const { Chest } = require('mineflayer')
const { filterHostiles } = require('./utils')

module.exports = class Context {
    /**
     * @readonly
     * @type {import('mineflayer').Bot}
     */
    bot
    
    /**
     * @readonly
     * @type {MC}
     */
    mc
    
    /**
     * @readonly
     * @type {Array<{ callback: (username: string, message: string) => boolean; timeout: number; time: number; timedout: () => any; }>}
     */
    chatAwaits

    /**
     * @type {Vec3 | null}
     */
    myBed

    /**
     * @readonly
     * @type {Movements}
     */
    permissiveMovements

    /**
     * @readonly
     * @type {Movements}
     */
    restrictedMovements

    /**
     * @readonly
     * @type {Movements}
     */
    gentleMovements

    /**
     * @param {import('mineflayer').Bot} bot
     */
    constructor(bot) {
        this.bot = bot
        this.mc = new MC(bot.version)
        this.chatAwaits = [ ]
        this.myBed = null

        this.permissiveMovements = new Movements(bot)
        this.restrictedMovements = new Movements(bot)
        this.gentleMovements = new Movements(bot)

        Context.setPermissiveMovements(this.permissiveMovements, this.mc)
        Context.setRestrictedMovements(this.restrictedMovements, this.mc)
        Context.setGentleMovements(this.gentleMovements, this.mc)
    }

    /**
     * @param {Movements} movements
     * @param {MC} mc
     */
    static setPermissiveMovements(movements, mc) {
        movements.canDig = true
        movements.digCost = 40
        movements.placeCost = 30
        movements.entityCost = 10
        movements.allowParkour = true
        movements.allowSprinting = true
        movements.allowEntityDetection = true

        for (const entityId in mc.data.entities) {
            if (mc.data.entities[entityId].type === 'hostile') {
                movements.entitiesToAvoid.add(mc.data.entities[entityId].name)
            }
        }

        /** @type {Array<string>} */
        const blocksCantBreak = [
            'furnace',
            'blast_furnace',
            'smoker',
            'campfire',
            'soul_campfire',
            'brewing_stand',
            'beacon',
            'conduit',
            'bee_nest',
            'beehive',
            'suspicious_sand',
            'suspicious_gravel',
            'decorated_pot',
            'bookshelf',
            'barrel',
            'ender_chest',
            'respawn_anchor',
            'infested_stone',
            'infested_cobblestone',
            'infested_stone_bricks',
            'infested_mossy_stone_bricks',
            'infested_cracked_stone_bricks',
            'infested_chiseled_stone_bricks',
            'infested_deepslate',
            'end_portal_frame',
            'spawner',
            'composter',
        ]

        for (const blockCantBreak of blocksCantBreak) {
            if (mc.data.blocksByName[blockCantBreak]) {
                movements.blocksCantBreak.add(mc.data.blocksByName[blockCantBreak].id)
            } else {
                console.warn(`Unknown block \"${blockCantBreak}\"`)
            }
        }
    
        /** @type {Array<string>} */
        const blocksToAvoid = [
            'campfire',
            'composter',
        ]

        for (const blockToAvoid of blocksToAvoid) {
            if (mc.data.blocksByName[blockToAvoid]) {
                movements.blocksToAvoid.add(mc.data.blocksByName[blockToAvoid].id)
            } else {
                console.warn(`Unknown block \"${blockToAvoid}\"`)
            }
        }

        movements.climbables.add(mc.data.blocksByName['vine'].id)
        // movements.replaceables.add(mc.data.blocksByName['short_grass'].id)
        movements.replaceables.add(mc.data.blocksByName['tall_grass'].id)
        movements.canOpenDoors = false
    }

    /**
     * @param {Movements} movements
     * @param {MC} mc
     */
    static setRestrictedMovements(movements, mc) {
        Context.setPermissiveMovements(movements, mc)
        movements.canDig = false
        movements.allow1by1towers = false
        movements.scafoldingBlocks = [ ]
        movements.placeCost = 500
    }

    /**
     * @param {Movements} movements
     * @param {MC} mc
     */
    static setGentleMovements(movements, mc) {
        Context.setPermissiveMovements(movements, mc)
        movements.canDig = false
        movements.allow1by1towers = false
        movements.scafoldingBlocks = [ ]
        movements.placeCost = 500
        movements.allowParkour = false
        
        /** @type {Array<string>} */
        const blocksToAvoid = [
            'water',
        ]

        for (const blockToAvoid of blocksToAvoid) {
            if (mc.data.blocksByName[blockToAvoid]) {
                movements.blocksToAvoid.add(mc.data.blocksByName[blockToAvoid].id)
            } else {
                console.warn(`Unknown block \"${blockToAvoid}\"`)
            }
        }
    }

    /**
     * @param {string | number} cookingResult
     * @returns {Array<import('./mc-data').CookingRecipe>}
     */
    getCookingRecipesFromResult(cookingResult) {
        if (typeof cookingResult === 'number') {
            cookingResult = this.mc.data.items[cookingResult]?.name
        }
        /** @type {Array<import('./mc-data').SmeltingRecipe | import('./mc-data').SmokingRecipe | import('./mc-data').BlastingRecipe | import('./mc-data').CampfireRecipe>} */
        const recipes = [ ]
        if (!cookingResult) {
            return [ ]
        }
        
        for (const recipe of Object.values(this.mc.data2.recipes.smelting)) {
            if (recipe.result === cookingResult) {
                recipes.push(recipe)
            }
        }

        for (const recipe of Object.values(this.mc.data2.recipes.smoking)) {
            if (recipe.result === cookingResult) {
                recipes.push(recipe)
            }
        }

        for (const recipe of Object.values(this.mc.data2.recipes.blasting)) {
            if (recipe.result === cookingResult) {
                recipes.push(recipe)
            }
        }

        for (const recipe of Object.values(this.mc.data2.recipes.campfire)) {
            if (recipe.result === cookingResult) {
                recipes.push(recipe)
            }
        }

        recipes.sort((a, b) => a.time - b.time)

        return recipes
    }

    /**
     * @param {string | number} raw
     * @returns {Array<import('./mc-data').CookingRecipe>}
     */
    getCookingRecipesFromRaw(raw) {
        if (typeof raw === 'number') {
            raw = this.mc.data.items[raw]?.name
        }
        /** @type {Array<import('./mc-data').SmeltingRecipe | import('./mc-data').SmokingRecipe | import('./mc-data').BlastingRecipe | import('./mc-data').CampfireRecipe>} */
        const recipes = [ ]
        if (!raw) {
            return [ ]
        }
        
        for (const recipe of Object.values(this.mc.data2.recipes.smelting)) {
            for (const ingredient of recipe.ingredient) {
                if (ingredient === raw) {
                    recipes.push(recipe)
                }
            }
        }

        for (const recipe of Object.values(this.mc.data2.recipes.smoking)) {
            for (const ingredient of recipe.ingredient) {
                if (ingredient === raw) {
                    recipes.push(recipe)
                }
            }
        }

        for (const recipe of Object.values(this.mc.data2.recipes.blasting)) {
            for (const ingredient of recipe.ingredient) {
                if (ingredient === raw) {
                    recipes.push(recipe)
                }
            }
        }

        for (const recipe of Object.values(this.mc.data2.recipes.campfire)) {
            for (const ingredient of recipe.ingredient) {
                if (ingredient === raw) {
                    recipes.push(recipe)
                }
            }
        }

        recipes.sort((a, b) => a.time - b.time)

        return recipes
    }

    /**
     * @param {RegExp} response
     * @returns {Promise<{ username: string, message: string } | null>}
     */
    awaitChat(response, timeout = 0) {
        return new Promise((resolve, reject) => {
            this.chatAwaits.push({
                callback: (username, message) => {
                    if (response.test(message.toLowerCase().trim())) {
                        resolve({ username, message })
                        return true
                    }
                    return false
                },
                timeout: timeout,
                time: Date.now(),
                timedout: () => resolve(null),
            })
        })
    }

    /**
     * @returns {Promise<{ username: string, message: boolean } | null>}
     */
    awaitYesNoResponse(timeout = 0) {
        return new Promise((resolve, reject) => {
            this.chatAwaits.push({
                callback: (username, message) => {
                    const resp = message.toLowerCase().trim()

                    if (resp === 'yes' ||
                        resp === 'y') {
                        resolve({ username, message: true })
                        return true
                    }

                    if (resp === 'no' ||
                        resp === 'n' ||
                        resp === 'nuh') {
                        resolve({ username, message: false })
                        return true
                    }

                    return false
                },
                timeout: timeout,
                time: Date.now(),
                timedout: () => resolve(null),
            })
        })
    }

    /**
     * @param {(string | number)[]} items
     */
    searchItem(...items) {
        const specialSlotIds = [
            this.bot.getEquipmentDestSlot('head'),
            this.bot.getEquipmentDestSlot('torso'),
            this.bot.getEquipmentDestSlot('legs'),
            this.bot.getEquipmentDestSlot('feet'),
            this.bot.getEquipmentDestSlot('hand'),
            this.bot.getEquipmentDestSlot('off-hand'),
        ]

        for (const _searchFor of items) {
            if (!_searchFor) { continue }

            const searchFor = (
                (typeof _searchFor === 'string')
                ? this.mc.data.itemsByName[_searchFor]?.id
                : _searchFor
            )
            
            if (!_searchFor) { continue }

            const found = this.bot.inventory.findInventoryItem(searchFor, null, false)
            if (found) { return found }

            for (const specialSlotId of specialSlotIds) {
                const found = this.bot.inventory.slots[specialSlotId]
                if (!found) { continue }
                if (found.type === searchFor) {
                    return found
                }
            }
        }
        return null
    }

    /**
     * @param {(string | number)} item
     */
    itemCount(item) {
        const specialSlotIds = [
            this.bot.getEquipmentDestSlot('head'),
            this.bot.getEquipmentDestSlot('torso'),
            this.bot.getEquipmentDestSlot('legs'),
            this.bot.getEquipmentDestSlot('feet'),
            this.bot.getEquipmentDestSlot('hand'),
            this.bot.getEquipmentDestSlot('off-hand'),
        ]

        const searchFor = (
            (typeof item === 'string')
            ? this.mc.data.itemsByName[item]?.id
            : item
        )
        
        if (!item) { return 0 }

        let count = this.bot.inventory.count(searchFor, null)

        for (const specialSlotId of specialSlotIds) {
            const found = this.bot.inventory.slots[specialSlotId]
            if (!found) { continue }
            if (found.type === searchFor) {
                count++
            }
        }

        return count
    }

    /**
     * @param {(string | number)[]} items
     */
    hasAll(...items) {
        const specialSlotIds = [
            this.bot.getEquipmentDestSlot('head'),
            this.bot.getEquipmentDestSlot('torso'),
            this.bot.getEquipmentDestSlot('legs'),
            this.bot.getEquipmentDestSlot('feet'),
            this.bot.getEquipmentDestSlot('hand'),
            this.bot.getEquipmentDestSlot('off-hand'),
        ]

        for (const _searchFor of items) {
            if (!_searchFor) { continue }

            const searchFor = (
                (typeof _searchFor === 'string')
                ? this.mc.data.itemsByName[_searchFor]?.id
                : _searchFor
            )
            
            if (!_searchFor) { continue }

            let found = this.bot.inventory.findInventoryItem(searchFor, null, false) ? true : false
            if (found) { continue }

            for (const specialSlotId of specialSlotIds) {
                const _found = this.bot.inventory.slots[specialSlotId]
                if (!_found) { continue }
                if (_found.type === searchFor) {
                    found = _found ? true : false
                }
            }
            if (found) { continue }

            return false 
        }

        return true
    }

    /**
     * @returns {{
     *   item: import('prismarine-item').Item;
     *   weapon: hawkeye.Weapons;
     *   ammo: number;
     * }}
     */
    searchRangeWeapon() {
        const keys = Object.values(hawkeye.Weapons)
        
        for (const weapon of keys) {
            const searchFor = this.mc.data.itemsByName[weapon]?.id
            
            if (!searchFor) { continue }

            const found = this.bot.inventory.findInventoryItem(searchFor, null, false)
            if (!found) { continue }

            let ammo

            switch (weapon) {
                case hawkeye.Weapons.bow:
                case hawkeye.Weapons.crossbow:
                    ammo = this.bot.inventory.count(this.mc.data.itemsByName['arrow'].id, null)
                    break
            
                // case hawkeye.Weapons.egg:
                case hawkeye.Weapons.snowball:
                // case hawkeye.Weapons.trident:
                    ammo = this.bot.inventory.count(found.type, null)
                    break
                
                default: continue
            }

            if (ammo === 0) {
                continue
            }

            return {
                item: found,
                weapon: weapon,
                ammo: ammo,
            }
        }

        return null
    }

    async clearMainHand() {
        const emptySlot = this.bot.inventory.firstEmptyInventorySlot(true)
        if (!emptySlot) {
            return false
        }
        await this.bot.unequip('hand')
        return true
    }
    
    /**
     * @param {number} drop
     * @param {number} maxDistance
     */
    findBlockWithDrop(drop, maxDistance) {
        return this.bot.findBlock({
            matching: (block) => {
                if (!block.drops) { return false }
                for (const _drop of block.drops) {
                    if (typeof _drop === 'number') {
                        if (_drop === drop) {
                            return true
                        }
                        continue
                    }
                    if (typeof _drop.drop === 'number') {
                        if (_drop.drop === drop) {
                            return true
                        }
                        continue
                    }

                    if (_drop.drop.id === drop) {
                        return true
                    }
                }

                return false
            },
            maxDistance: maxDistance,
        })
    }
    
    /**
     * @param {number} drop
     */
    findEntityWithDrop(drop) {
        const dropItem = this.mc.data.items[drop]
        if (!dropItem) return null
        return this.bot.nearestEntity((entity) => {
            const entityDrops = this.mc.data.entityLoot[entity.name]
            if (!entityDrops) { return false }

            let drops = entityDrops.drops
            drops = drops.filter((_drop) => (dropItem.name === _drop.item))
            if (drops.length === 0) { return false }

            return true
        })
    }

    /**
     * Source: https://github.com/PrismarineJS/mineflayer-pvp/blob/master/src/PVP.ts
     */
    holdsShield() {
        if (this.bot.supportFeature('doesntHaveOffHandSlot')) {
            return false
        }

        const slot = this.bot.inventory.slots[this.bot.getEquipmentDestSlot('off-hand')]
        if (!slot) {
            return false
        }

        return slot.name == 'shield'
    }

    /**
     * @param {string | number} item
     */
    holds(item) {
        const slot = this.bot.inventory.slots[this.bot.getEquipmentDestSlot('hand')]

        if (!slot) {
            return false
        }

        if (typeof item === 'string') {
            return slot.name === item
        } else {
            return slot.type === item
        }
    }

    /**
     * Source: https://github.com/PrismarineJS/mineflayer-pvp/blob/master/src/PVP.ts
     */
    explodingCreeper() {
        return this.bot.nearestEntity(entity => {
            return (
                entity.name &&
                entity.name === 'creeper' &&
                entity.metadata[16] &&
                // @ts-ignore
                entity.metadata[16] === 1
            )
        })
    }

    possibleDirectHostileAttack() {
        return this.bot.nearestEntity((entity) => {
            if (!filterHostiles(entity)) { return false }

            if (!entity.name) {
                return false
            }

            const distance = this.bot.entity.position.distanceTo(entity.position)

            if (entity.name === 'skeleton' ||
                entity.name === 'stray') {
                return distance <= 20
            }

            return distance < 10
        })
    }

    /**
     * @returns {boolean}
     */
    shouldEquipShield() {
        const shield = this.searchItem('shield')
        if (!shield) {
            return false
        }

        const needShield = this.possibleDirectHostileAttack()
        if (!needShield) {
            return false
        }

        return true
    }

    /**
     * @param {number | string} item
     * @returns {number}
     */
    getChargeTime(item) {
        if (typeof item === 'number') {
            item = this.mc.data.items[item]?.name
        }
        if (!item) return 0

        switch (item) {
            case 'bow':
                return 1200
            case 'crossbow':
                return 1300 // 1250
            default:
                return 0
        }
    }

    /**
     * @param {Item} item
     * @returns {boolean}
     */
    static isCrossbowCharged(item) {
        return (
            item.nbt &&
            item.nbt.type === 'compound' &&
            item.nbt.value['ChargedProjectiles'] &&
            item.nbt.value['ChargedProjectiles'].type === 'list' &&
            item.nbt.value['ChargedProjectiles'].value.value.length > 0
        )
    }

    /**
     * @returns {(MeleeWeapons.MeleeWeapon & { item: Item }) | null}
     */
    bestMeleeWeapon() {
        const weapons = MeleeWeapons.weapons
        for (const weapon of weapons) {
            const item = this.searchItem(weapon.name)
            if (item) {
                return {
                    ...weapon,
                    item: item,
                }
            }
        }
        return null
    }

    /**
     * @param {Block} crop
     * @returns {number | null}
     */
    getCropSeed(crop) {
        if (!crop.drops) { return null }

        for (const _drop of crop.drops) {
            if (typeof _drop === 'number') {
                if (this.mc.simpleSeeds.includes(_drop)) {
                    return _drop
                }
                continue
            }

            if (typeof _drop.drop === 'number') {
                if (this.mc.simpleSeeds.includes(_drop.drop)) {
                    return _drop.drop
                }
                continue
            }

            if (this.mc.simpleSeeds.includes(_drop.drop.id)) {
                return _drop.drop.id
            }
        }
        
        return null
    }

    /**
     * @param {number | null} item
     */
    isInventoryFull(item = null) {
        const slotIds = [
            this.bot.getEquipmentDestSlot('hand'),
            this.bot.getEquipmentDestSlot('off-hand'),
        ]

        for (let i = this.bot.inventory.inventoryStart; i <= this.bot.inventory.inventoryEnd; i++) {
            slotIds.push(i)
        }

        for (const slotId of slotIds) {
            const slot = this.bot.inventory.slots[slotId]
            if (!slot) { return false }
            if (slot.count >= slot.stackSize) { continue }
            if (item && item === slot.type) { return false }
        }

        return true
    }

    /**
     * @param {import('prismarine-windows').Window<any>} chest
     * @param {number | null} item
     * @returns {number | null}
     */
    static firstFreeSlot(chest, item = null) {
        let empty = chest.firstEmptyContainerSlot()
        if (empty !== null && empty !== undefined) {
            return empty
        }

        if (item) {
            const items = chest.containerItems()
            for (const _item of items) {
                if (_item.count >= _item.stackSize) { continue }
                if (_item.type !== item) { continue }
                return _item.slot
            }
        }
        
        return null
    }
}
