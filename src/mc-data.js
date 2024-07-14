const StreamZip = require('node-stream-zip')
const Path = require('path')
const fs = require('fs')
const config = require('./config')

/**
 * @exports
 * @typedef {{
 * type: 'minecraft:crafting_shapeless'
 * result: {
 *   item: string
 *   count?: number
 * } | string
 * ingredients: Array<{ item: string } | { tag: string }>
 * }} ShapelessRecipe
 */

/**
 * @exports
 * @typedef {{
 * type: 'crafting_shaped'
 * key: {
 *   [key: string]: {
 *     item: string
 *   }
 * }
 * pattern: Array<string>
 * result: {
 *   item: string
 *   count?: number
 * } | string
 * }} ShapedRecipe
 */

/**
 * @typedef {{
 * time: number
 * experience: number
 * ingredient: Array<string>
 * result: string
 * }} CookingRecipeBase
 */

/**
 * @typedef {{
 *   hurtTime: number
 *   fallDamageVelocity: number
 * }} GeneralData
 */

/**
 * @typedef {{
 *   boats: Array<string>
 *   mlgBlocks: Array<string>
 *   vehicles: Array<string>
 * }} MlgData
 */

/**
 * @exports
 * @typedef {{ type: 'smelting' } & CookingRecipeBase} SmeltingRecipe
 */

/**
 * @exports
 * @typedef {{ type: 'blasting' } & CookingRecipeBase} BlastingRecipe
 */

/**
 * @exports
 * @typedef {{ type: 'smoking' } & CookingRecipeBase} SmokingRecipe
 */

/**
 * @exports
 * @typedef {{ type: 'campfire' } & CookingRecipeBase} CampfireRecipe
 */

/**
 * @exports
 * @typedef {ShapelessRecipe | ShapedRecipe | CookingRecipe} Recipe
 */

/**
 * @exports
 * @typedef {SmeltingRecipe | BlastingRecipe | SmokingRecipe | CampfireRecipe} CookingRecipe
 */

/**
 * @exports
 * @typedef { 'crafting_shaped' |
 *  'crafting_shapeless' |
 *  'stonecutting' |
 *  'crafting_special_armordye' |
 *  'smelting' |
 *  'campfire' |
 *  'smoking' |
 *  'crafting_special_bannerduplicate' |
 *  'crafting_special_bookcloning' |
 *  'blasting' |
 *  'smithing_trim' |
 *  'crafting_decorated_pot' |
 *  'crafting_special_firework_rocket' |
 *  'crafting_special_firework_star' |
 *  'crafting_special_firework_star_fade' |
 *  'crafting_special_mapcloning' |
 *  'crafting_special_mapextending' |
 *  'smithing_transform' |
 *  'crafting_special_repairitem' |
 *  'crafting_special_shielddecoration' |
 *  'crafting_special_shulkerboxcoloring' |
 *  'crafting_special_suspiciousstew' |
 *  'crafting_special_tippedarrow'
 * } RecipeType
 */

module.exports = class MinecraftData {
    /**
     * @readonly
     * @type {{
     * other: { [item: string]: ShapelessRecipe | ShapedRecipe }
     * smelting: { [item: string]: SmeltingRecipe }
     * smoking: { [item: string]: SmokingRecipe }
     * blasting: { [item: string]: BlastingRecipe }
     * campfire: { [item: string]: CampfireRecipe }
     * }}
     */
    recipes

    /**
     * @readonly
     * @type {{ [item: string]: { time: number; no: boolean; } }}
     */
    fuels

    /**
     * @readonly
     * @type {Array<{ item: string; time: number; no: boolean; }>}
     */
    sortedFuels

    /**
     * @readonly
     * @type {{ [item: string]: { chance: number; no: boolean; } }}
     */
    compost

    /**
     * @readonly
     * @type {{ [item: string]: string }}
     */
    compacting

    /**
     * @readonly
     * @type {any}
     */
    tags

    /**
     * @readonly
     * @type {GeneralData}
     */
    general

    /**
     * @readonly
     * @type {MlgData}
     */
    mlg

    /**
     * @param {string} path
     */
    constructor(path) {
        this.recipes = {
            other: { },
            blasting: { },
            campfire: { },
            smelting: { },
            smoking: { },
        }

        this.fuels = JSON.parse(fs.readFileSync(Path.join(config.dataPath, 'fuels.json'), 'utf8'))
        this.compost = JSON.parse(fs.readFileSync(Path.join(config.dataPath, 'compost.json'), 'utf8'))
        this.general = JSON.parse(fs.readFileSync(Path.join(config.dataPath, 'general.json'), 'utf8'))
        this.mlg = JSON.parse(fs.readFileSync(Path.join(config.dataPath, 'mlg.json'), 'utf8'))
        this.compacting = JSON.parse(fs.readFileSync(Path.join(config.dataPath, 'compacting.json'), 'utf8'))

        this.sortedFuels = [ ]
        this.tags = { }

        for (const item in this.fuels) {
            this.sortedFuels.push({
                item: item,
                time: this.fuels[item].time,
                no: this.fuels[item].no,
            })
        }
        this.sortedFuels.sort((a, b) => b.time - a.time)

        const zip = new StreamZip.async({
            file: path,
            storeEntries: true,
        })

        zip.entries()
            .then(async entries => {
                await this.readTags(zip, entries)
                await this.readRecipes(zip, entries)
            })
            .catch(console.error)
    }

    /**
     * @private
     * @param {StreamZip.StreamZipAsync} zip
     * @param {{ [name: string]: StreamZip.ZipEntry; }} zipEntries
     */
    async readTags(zip, zipEntries) {
        for (const entry in zipEntries) {
            if (!entry.endsWith('.json')) { continue }
            if (!entry.startsWith('data/minecraft/tags/items/')) { continue }

            const data = await zip.entryData(entry)
            const rawTag = JSON.parse(data.toString('utf8'))
            const tag = Path.basename(entry).replace('.json', '')
            if (rawTag['replace']) {
                console.warn(`No supported`)
                return
            }
            const values = rawTag['values']
            const newValues = [ ]
            for (const value of values) {
                if (typeof value === 'string') {
                    newValues.push(value.replace('minecraft:', ''))
                } else {
                    console.warn(`No supported`)
                    return
                }
            }
            this.tags[tag] = newValues
        }
    }

    /**
     * @private
     * @param {any} ingredient
     * @returns {Array<string>}
     */
    parseIngredients(ingredient) {
        if (Array.isArray(ingredient)) {
            const result = [ ]
            for (const _ingredient of ingredient) {
                if ('item' in _ingredient) {
                    result.push(_ingredient.item.replace('minecraft:', ''))
                } else {
                    result.push(...this.resolveItemTag(_ingredient.tag.replace('minecraft:', '')))
                }
            }
            return result
        } else {
            if ('item' in ingredient) {
                return [ingredient.item.replace('minecraft:', '')]
            } else {
                return this.resolveItemTag(ingredient.tag.replace('minecraft:', ''))
            }
        }
    }

    /**
     * @private
     * @param {StreamZip.StreamZipAsync} zip
     * @param {{ [name: string]: StreamZip.ZipEntry; }} zipEntries
     */
    async readRecipes(zip, zipEntries) {
        for (const entry in zipEntries) {
            if (!entry.endsWith('.json')) { continue }
            if (!entry.startsWith('data/minecraft/recipes/')) { continue }

            const data = await zip.entryData(entry)
            const id = Path.basename(entry).replace('.json', '')
            const rawRecipe = JSON.parse(data.toString('utf8'))
            switch (rawRecipe['type']) {
                case 'minecraft:campfire_cooking': {
                    /** @type {CampfireRecipe} */
                    const recipe = {
                        type: 'campfire',
                        experience: rawRecipe.experience,
                        time: rawRecipe.cookingtime / 20,
                        result: rawRecipe.result.replace('minecraft:', ''),
                        ingredient: this.parseIngredients(rawRecipe.ingredient),
                    }
                    this.recipes.campfire[id] = recipe
                    break
                }

                case 'minecraft:smelting': {
                    /** @type {SmeltingRecipe} */
                    const recipe = {
                        type: 'smelting',
                        experience: rawRecipe.experience,
                        time: rawRecipe.cookingtime / 20,
                        result: rawRecipe.result.replace('minecraft:', ''),
                        ingredient: this.parseIngredients(rawRecipe.ingredient),
                    }
                    this.recipes.smelting[id] = recipe
                    break
                }

                case 'minecraft:blasting': {
                    /** @type {BlastingRecipe} */
                    const recipe = {
                        type: 'blasting',
                        experience: rawRecipe.experience,
                        time: rawRecipe.cookingtime / 20,
                        result: rawRecipe.result.replace('minecraft:', ''),
                        ingredient: this.parseIngredients(rawRecipe.ingredient),
                    }
                    this.recipes.blasting[id] = recipe
                    break
                }

                case 'minecraft:smoking': {
                    /** @type {SmokingRecipe} */
                    const recipe = {
                        type: 'smoking',
                        experience: rawRecipe.experience,
                        time: rawRecipe.cookingtime / 20,
                        result: rawRecipe.result.replace('minecraft:', ''),
                        ingredient: this.parseIngredients(rawRecipe.ingredient),
                    }
                    this.recipes.smoking[id] = recipe
                    break
                }

                case 'minecraft:crafting_shapeless':
                case 'minecraft:crafting_shaped':
                case 'minecraft:stonecutting':
                case 'minecraft:smithing_trim':
                case 'minecraft:crafting_special_suspiciousstew':
                case 'minecraft:crafting_special_tippedarrow':
                case 'minecraft:smithing_transform':
                case 'minecraft:crafting_special_repairitem':
                case 'minecraft:crafting_special_shielddecoration':
                case 'minecraft:crafting_special_shulkerboxcoloring':
                case 'minecraft:crafting_decorated_pot':
                case 'minecraft:crafting_special_mapcloning':
                case 'minecraft:crafting_special_mapextending':
                case 'minecraft:crafting_special_firework_rocket':
                case 'minecraft:crafting_special_firework_star':
                case 'minecraft:crafting_special_firework_star_fade':
                case 'minecraft:crafting_special_armordye':
                case 'minecraft:crafting_special_bannerduplicate':
                case 'minecraft:crafting_special_bookcloning':
                    break

                default:
                    console.warn(`Unknown recipe type \"${rawRecipe['type']}\"`)
                    break
            }
        }
    }

    /**
     * @param {string} tag
     * @returns {Array<string>}
     */
    resolveItemTag(tag) {
        tag = tag.replace('minecraft:', '')
        if (this.tags[tag]) {
            return this.tags[tag]
        }
        console.warn(`Unknown tag "${tag}"`)
        return [ ]
    }

    /**
     * @param {boolean} includeNono
     */
    getFuel(includeNono) {
        for (let i = 0; i < this.sortedFuels.length; i++) {
            const fuel = this.sortedFuels[i]
            if (!includeNono && fuel.no) {
                continue
            }
            return fuel
        }
        return null
    }
}
