const { Block } = require('prismarine-block')
const { Item } = require('prismarine-item')
const { Recipe, RecipeItem } = require('prismarine-recipe')
const getMcData = require('minecraft-data')
const MinecraftData = require('./mc-data')

/**
 * @typedef { 'sword' | 'shovel' | 'pickaxe' | 'axe' | 'hoe' } Tool
 */

/**
 * @typedef { 'wooden' | 'stone' | 'iron' | 'golden' | 'diamond' | 'netherite' } ToolLevel
 */

module.exports = class MC {
    /**
     * @readonly
     * @type {getMcData.IndexedData}
     */
    data

    /**
     * @readonly
     * @type {MinecraftData}
     */
    data2

    /**
     * @readonly
     * @type {{ [block: string]: undefined | 'yes' | 'break' }}
     */
    static replaceableBlocks = {
        'air': 'yes',
        'cave_air': 'yes',
        'short_grass': 'break',
        'tall_grass': 'break',
    }

    /**
     * @readonly
     */
    static tools = {
        sword: {
            wooden: 'wooden_sword',
            stone: 'stone_sword',
            iron: 'iron_sword',
            golden: 'golden_sword',
            diamond: 'diamond_sword',
            netherite: 'netherite_sword',
        },
        shovel: {
            wooden: 'wooden_shovel',
            stone: 'stone_shovel',
            iron: 'iron_shovel',
            golden: 'golden_shovel',
            diamond: 'diamond_shovel',
            netherite: 'netherite_shovel',
        },
        pickaxe: {
            wooden: 'wooden_pickaxe',
            stone: 'stone_pickaxe',
            iron: 'iron_pickaxe',
            golden: 'golden_pickaxe',
            diamond: 'diamond_pickaxe',
            netherite: 'netherite_pickaxe',
        },
        axe: {
            wooden: 'wooden_axe',
            stone: 'stone_axe',
            iron: 'iron_axe',
            golden: 'golden_axe',
            diamond: 'diamond_axe',
            netherite: 'netherite_axe',
        },
        hoe: {
            wooden: 'wooden_hoe',
            stone: 'stone_hoe',
            iron: 'iron_hoe',
            golden: 'golden_hoe',
            diamond: 'diamond_hoe',
            netherite: 'netherite_hoe',
        },
    }

    /**
     * @readonly
     * @type {[ 'wooden', 'stone', 'iron', 'golden', 'diamond', 'netherite']}
     */
    static toolLevels = [
        'wooden',
        'stone',
        'iron',
        'golden',
        'diamond',
        'netherite',
    ]

    /**
     * @readonly
     * @type {ReadonlyArray<string>}
     */
    static cropBlocks = [
        'potatoes',
        'beetroots',
        'wheat',
        'carrots',
        'melon_stem',
        'pumpkin_stem',
    ]

    /**
     * @readonly
     * @type {ReadonlyArray<number>}
     */
    get simpleSeeds() {
        return [
            this.data.itemsByName['wheat_seeds'].id,
            this.data.itemsByName['beetroot_seeds'].id,
            this.data.itemsByName['carrot'].id,
            this.data.itemsByName['potato'].id,
        ]
    }

    /**
     * @param {string} version
     * @param {string} jarPath
     */
    constructor(version, jarPath) {
        this.data = getMcData(version)
        this.data2 = new MinecraftData(jarPath)
    
        for (const key in this.data2.compost) {
            if (!this.data.itemsByName[key]) {
                console.warn(`Unknown item "${key}"`)
            }
        }
    }

    /**
     * @param {string} name
     * @returns {Array<getMcData.Block>}
     */
    getCorrectBlocks(name) {
        if (name === 'dirt') {
            return [
                this.data.blocksByName['grass_block'],
                this.data.blocksByName['dirt'],
            ]
        }

        if (name === 'wood') {
            return [
                this.data.blocksByName['oak_log'],
                this.data.blocksByName['spruce_log'],
                this.data.blocksByName['birch_log'],
                this.data.blocksByName['jungle_log'],
                this.data.blocksByName['acacia_log'],
                this.data.blocksByName['dark_oak_log'],
                this.data.blocksByName['mangrove_log'],
                this.data.blocksByName['cherry_log'],
                this.data.blocksByName['crimson_stem'],
                this.data.blocksByName['warped_stem'],
            ]
        }

        if (name === 'stone') {
            return [
                this.data.blocksByName['stone'],
                this.data.blocksByName['cobblestone'],
                this.data.blocksByName['deepslate'],
                this.data.blocksByName['cobbled_deepslate'],
            ]
        }

        if (this.data.blocksByName[name]) {
            return [this.data.blocksByName[name]]
        }

        if (this.data.blocksByName[name.replace(/ /g, '_')]) {
            return [this.data.blocksByName[name.replace(/ /g, '_')]]
        }

        return []
    }

    /**
     * @param {string} name
     * @returns {getMcData.Item | null}
     */
    getCorrectItems(name) {
        if (this.data.itemsByName[name]) {
            return this.data.itemsByName[name]
        }

        if (this.data.itemsByName[name.replace(/ /g, '_')]) {
            return this.data.itemsByName[name.replace(/ /g, '_')]
        }

        return null
    }

    /**
     * @param {Block} blockToBreak
     * @param {import('mineflayer').Bot | null} bot
     * @returns {{ has: boolean, item: getMcData.Item | null } | null}
     */
    getCorrectTool(blockToBreak, bot) {
        /** @ts-ignore @type {[ keyof MC.tools ]} */
        const toolNames = Object.keys(MC.tools)

        /** @type {Array<{ time: number, item: getMcData.Item }>} */
        let bestTools = []

        for (const category_ of toolNames) {
            const subtools = MC.tools[category_]
            for (const level of MC.toolLevels) {
                const subtool = subtools[level]
                const item = this.data.itemsByName[subtool]

                if (blockToBreak.canHarvest(item.id)) {
                    const time = blockToBreak.digTime(item.id, false, false, false, [], [])
                    bestTools.push({ time: time, item: item })
                }
            }
        }

        if (bestTools.length === 0) { return null }

        bestTools.sort((a, b) => a.time - b.time)

        /** @ts-ignore @type {keyof MC.tools} */
        let bestToolCategory = bestTools[0].item.name.split('_')[1]
        if (!toolNames.includes(bestToolCategory)) {
            console.warn(`Invalid tool "${bestTools[0].item.name}" ("${bestToolCategory}")`)
            return null
        }

        bestTools.sort((a, b) => {
            /** @ts-ignore @type {MC.toolLevels[0 | 1 | 2 | 3 | 4 | 5]} */
            const levelA = a.item.name.split('_')[0]
            if (!MC.toolLevels.includes(levelA)) {
                console.warn(`Invalid tool level ${levelA}`)
                return 0
            }

            /** @ts-ignore @type {MC.toolLevels[0 | 1 | 2 | 3 | 4 | 5]} */
            const levelB = b.item.name.split('_')[0]
            if (!MC.toolLevels.includes(levelB)) {
                console.warn(`Invalid tool level ${levelB}`)
                return 0
            }

            const indexofA = MC.toolLevels.indexOf(levelA)
            const indexofB = MC.toolLevels.indexOf(levelB)

            return indexofB - indexofA
        })

        // console.log(`Best tool for block "${blockToBreak.displayName}" is "${bestToolCategory}"`)

        bestTools = bestTools.filter(tool =>
            tool.item.name.endsWith(bestToolCategory))

        if (bestTools.length === 0) { return null }

        if (bot) {
            for (const tool of bestTools) {
                const found = bot.inventory.findInventoryItem(tool.item.id, null, false)
                if (found) {
                    return { has: true, item: tool.item }
                }
            }
        }

        return { has: false, item: bestTools[bestTools.length - 1].item }
    }

    /**
     * @param {Recipe} recipe
     */
    getIngredients(recipe) {
        /** @type {Array<RecipeItem>} */
        const res = []

        if (recipe.delta) {
            for (const item of recipe.delta) {
                if (item.count < 0) {
                    res.push({
                        id: item.id,
                        metadata: item.metadata,
                        count: -item.count,
                    })
                }
            }
        } else if (recipe.ingredients) {
            res.push(...recipe.ingredients)
        } else if (recipe.inShape) {
            for (const item of recipe.inShape) {
                res.push(...item)
            }
        } else if (recipe.outShape) {
            for (const item of recipe.outShape) {
                res.push(...item)
            }
        }

        return res
    }

    /**
     * @readonly
     */
    static get badFoods() {
        return [
            // puffer fish - only gives negative effects
            'pufferfish',
            // spider eye - gives poison effect
            'spider_eye',
            // poisonous potato - gives poison effect
            'poisonous_potato',
            // rotten flesh - gives hunger effect
            'rotten_flesh',
            // chorus fruit - randomly teleports you
            'chorus_fruit',
            // raw chicken - 30% chance of getting hunger effect
            'chicken',
            // suspicious stew - gives random effects (including hunger)
            'suspicious_stew',
            // golden apple - shouldn't be eaten unless the user wants to
            'golden_apple',
            'cake',
            'honey_bottle',
            'golden_carrot',
        ]
    }

    /**
     * @readonly
     */
    static get cookedFoods() {
        return [
            'baked_potato',
            'cooked_beef',
            'cooked_porkchop',
            'cooked_mutton',
            'cooked_chicken',
            'cooked_rabbit',
            'cooked_cod',
            'cooked_salmon',
            'dried_kelp',
        ]
    }

    /**
     * @readonly
     */
    static get rawFoods() {
        return [
            'potato',
            'beef',
            'porkchop',
            'mutton',
            'chicken',
            'rabbit',
            'cod',
            'salmon',
        ]
    }

    /**
     * @param {ReadonlyArray<Item>} foods
     * @param {'foodPoints' | 'saturation' | undefined} [sort]
     * @returns {Array<Item>}
     */
    filterFoods(foods, sort) {
        const bad = MC.badFoods
        const allFoods = this.data.foodsByName

        const _foods = foods
            .filter((item) => item.name in allFoods)
            .filter((item) => !bad.includes(item.name))
        if (sort) {
            return _foods.sort((a, b) => allFoods[b.name][sort] - allFoods[a.name][sort])
        } else {
            return _foods
        }
    }

    /**
     * @returns {Array<getMcData.Food>}
     * @param {boolean} includeRaws
     */
    getGoodFoods(includeRaws) {
        return this.data.foodsArray.filter((item) => {
            if (MC.badFoods.includes(item.name)) { return false }
            if (MC.rawFoods.includes(item.name) && !includeRaws) { return false }
            return true
        })
    }

    /**
     * @param {boolean} includeFoods
     */
    nontrashItems(includeFoods) {
        const result = [
            this.data.itemsByName['wooden_hoe']?.id,
            this.data.itemsByName['stone_hoe']?.id,
            this.data.itemsByName['iron_hoe']?.id,
            this.data.itemsByName['golden_hoe']?.id,
            this.data.itemsByName['diamond_hoe']?.id,
            this.data.itemsByName['netherite_hoe']?.id,

            this.data.itemsByName['wooden_axe']?.id,
            this.data.itemsByName['stone_axe']?.id,
            this.data.itemsByName['iron_axe']?.id,
            this.data.itemsByName['golden_axe']?.id,
            this.data.itemsByName['diamond_axe']?.id,
            this.data.itemsByName['netherite_axe']?.id,

            this.data.itemsByName['wooden_pickaxe']?.id,
            this.data.itemsByName['stone_pickaxe']?.id,
            this.data.itemsByName['iron_pickaxe']?.id,
            this.data.itemsByName['golden_pickaxe']?.id,
            this.data.itemsByName['diamond_pickaxe']?.id,
            this.data.itemsByName['netherite_pickaxe']?.id,

            this.data.itemsByName['wooden_shovel']?.id,
            this.data.itemsByName['stone_shovel']?.id,
            this.data.itemsByName['iron_shovel']?.id,
            this.data.itemsByName['golden_shovel']?.id,
            this.data.itemsByName['diamond_shovel']?.id,
            this.data.itemsByName['netherite_shovel']?.id,

            this.data.itemsByName['wooden_sword']?.id,
            this.data.itemsByName['stone_sword']?.id,
            this.data.itemsByName['iron_sword']?.id,
            this.data.itemsByName['golden_sword']?.id,
            this.data.itemsByName['diamond_sword']?.id,
            this.data.itemsByName['netherite_sword']?.id,

            this.data.itemsByName['shield']?.id,
            this.data.itemsByName['bow']?.id,
            this.data.itemsByName['crossbow']?.id,
            this.data.itemsByName['fishing_rod']?.id,
            this.data.itemsByName['arrow']?.id,
            this.data.itemsByName['ender_pearl']?.id,
            this.data.itemsByName['bucket']?.id,
            this.data.itemsByName['water_bucket']?.id,
        ]
        if (includeFoods) {
            result.push(...[
                this.data.itemsByName['apple']?.id,
                this.data.itemsByName['melon_slice']?.id,
                this.data.itemsByName['beef']?.id,
                this.data.itemsByName['cooked_beef']?.id,
                this.data.itemsByName['porkchop']?.id,
                this.data.itemsByName['cooked_porkchop']?.id,
                this.data.itemsByName['mutton']?.id,
                this.data.itemsByName['cooked_mutton']?.id,
                this.data.itemsByName['chicken']?.id,
                this.data.itemsByName['cooked_chicken']?.id,
                this.data.itemsByName['rabbit']?.id,
                this.data.itemsByName['cooked_rabbit']?.id,
                this.data.itemsByName['cooke']?.id,
                this.data.itemsByName['pumpkin_pie']?.id,
                this.data.itemsByName['mushroom_stew']?.id,
                this.data.itemsByName['beetroot_soup']?.id,
                this.data.itemsByName['rabbit_stew']?.id,
                this.data.itemsByName['dried_kelp']?.id,
                this.data.itemsByName['bread']?.id,
                this.data.itemsByName['potato']?.id,
                this.data.itemsByName['baked_potato']?.id,
                this.data.itemsByName['carrot']?.id,
                this.data.itemsByName['beetroot']?.id,
                this.data.itemsByName['raw_cod']?.id,
                this.data.itemsByName['cooked_cod']?.id,
                this.data.itemsByName['raw_salmon']?.id,
                this.data.itemsByName['cooked_salmon']?.id,
            ])
        }
        return result
    }

    /**
     * @param {Recipe} recipe
     * @returns {boolean}
     */
    isCompacting(recipe) {
        let gain
        let req
        for (const d of recipe.delta) {
            if (d.count > 0) {
                if (gain) {
                    return false
                }
                gain = d.id
            } else if (d.count < 0) {
                if (req) {
                    return false
                }
                req = d.id
            }
        }
        
        for (const from in this.data2.compacting) {
            const to = this.data2.compacting[from]
            const fromId = this.data.itemsByName[from].id
            const toId = this.data.itemsByName[to].id

            if (gain === toId &&
                req === fromId) {
                return true
            }
        }

        return false
    }
}
