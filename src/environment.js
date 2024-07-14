const { Vec3 } = require("vec3")
const path = require('path')
const fs = require('fs')
const { replacer, reviver } = require("./serializing")
const { filterHostiles } = require("./utils")
const { Block } = require("prismarine-block")
const { Item } = require("prismarine-item")

// @ts-ignore
module.exports = class Environment {
    /**
     * @private @readonly
     * @type {import('./bruh-bot')}
     */
    bot

    /**
     * @private @readonly
     * @type {{ [username: string]: { time: number; position: Vec3; } }}
     */
    playerPositions

    /**
     * @readonly
     * @type {{ [entityId: number]: number }}
     */
    entitySpawnTimes

    /**
     * @readonly
     * @type {Array<{ position: Vec3; item: string; }>}
     */
    harvestedCrops

    /**
     * @readonly
     * @type {{ [entityId: number]: number }}
     */
    entityHurtTimes

    /**
     * @param {import('./bruh-bot')} bot
     */
    constructor(bot) {
        this.bot = bot

        this.playerPositions = { }
        this.harvestedCrops = [ ]
        this.entityHurtTimes = { }
        this.entitySpawnTimes = { }

        const environmentPath = path.join(__dirname, '..', 'temp', 'environment.json')
        if (!fs.existsSync(environmentPath)) {
            console.log(`[Environment]: File not found at "${environmentPath}"`)
            return
        }
        const data = JSON.parse(fs.readFileSync(environmentPath, 'utf8'), reviver)
        this.playerPositions = data.playerPositions
        this.harvestedCrops = data.harvestedCrops
        console.log(`[Environment]: Loaded`)
    }

    save() {
        const environmentPath = path.join(__dirname, '..', 'temp', 'environment.json')
        if (!fs.existsSync(path.dirname(environmentPath))) {
            fs.mkdirSync(path.dirname(environmentPath), { recursive: true })
        }
        fs.writeFileSync(environmentPath, JSON.stringify({
            playerPositions: this.playerPositions,
            harvestedCrops: this.harvestedCrops,
        }, replacer, ' '))
    }

    /**
     * @param {Vec3} point
     * @returns {Block | null}
     */
    getPlantableBlock(point) {
        return this.bot.bot.findBlock({
            matching: [
                this.bot.mc.data.blocksByName['grass_block'].id,
                this.bot.mc.data.blocksByName['dirt'].id,
            ],
            point: point,
            maxDistance: 5,
            useExtraInfo: (/** @type {Block} */ block) => {
                const above = this.bot.bot.blockAt(block.position.offset(0, 1, 0))?.name
                return (
                    above === 'air' ||
                    above === 'short_grass' ||
                    above === 'tall_grass'
                )
            },
        })
    }

    /**
     * @param {Vec3} point
     * @returns {Block | null}
     */
    getFreeFarmland(point) {
        return this.bot.bot.findBlock({
            matching: [
                this.bot.mc.data.blocksByName['farmland'].id,
            ],
            point: point,
            maxDistance: 10,
            useExtraInfo: (/** @type {Block} */ block) => {
                const above = this.bot.bot.blockAt(block.position.offset(0, 1, 0)).name
                return (
                    above === 'air'
                )
            },
        })
    }
        
    /**
     * @param {Vec3} farmPosition
     * @param {boolean} grown
     * @returns {Array<Vec3>}
     */
    getCrops(farmPosition, grown) {
        return this.bot.bot.findBlocks({
            matching: [
                this.bot.mc.data.blocksByName['wheat'].id,
                this.bot.mc.data.blocksByName['carrots'].id,
                this.bot.mc.data.blocksByName['beetroots'].id,
                this.bot.mc.data.blocksByName['potatoes'].id,
                this.bot.mc.data.blocksByName['melon'].id,
                this.bot.mc.data.blocksByName['pumpkin'].id,
            ],
            useExtraInfo: (/** @type {Block} */ block) => {
                /** @type {number | null | undefined} */
                let goodAge = undefined
                switch (block.name) {
                    case 'wheat':
                    case 'carrots':
                    case 'potatoes':
                        goodAge = 7
                        break

                    case 'beetroots':
                        goodAge = 3
                        break

                    case 'melon':
                    case 'pumpkin':
                        goodAge = null
                        break

                    default:
                        return false
                }

                if (goodAge) {
                    const age = block.getProperties()['age']
                    if (!age) { return false }
                    if (typeof age !== 'number') { return false }

                    if (grown) {
                        return age >= goodAge
                    } else {
                        return age < goodAge
                    }
                } else {
                    if (grown) {
                        return true
                    } else {
                        return false
                    }
                }
            },
            point: farmPosition,
        })
    }

    /**
     * @param {((item: Item) => boolean) | null} filter
     * @param {{
    *   inAir?: boolean;
    *   maxDistance?: number;
    *   point?: Vec3;
    *   evenIfFull?: boolean;
    *   minLifetime?: number;
    * }} args
    * @returns {import('./result').Result<import("prismarine-entity").Entity>}
    */
    getClosestItem(filter, args = { }) {
        if (!args) { args = { } }
        if (!args.inAir) { args.inAir = false }
        if (!args.maxDistance) { args.maxDistance = 10 }
        if (!args.point) { args.point = this.bot.bot.entity.position.clone() }
        if (!args.evenIfFull) { args.evenIfFull = false }

        const nearestEntity = this.bot.bot.nearestEntity((/** @type {import("prismarine-entity").Entity} */ entity) => {
            if (entity.name !== 'item') { return false }
            if (!args.inAir && entity.velocity.distanceTo(new Vec3(0, 0, 0)) > 0.01) { return false }
            const droppedItem = entity.getDroppedItem()
            if (!droppedItem) { return false }
            if (filter && !filter(droppedItem)) { return false }
            if (!args.evenIfFull && this.bot.isInventoryFull(droppedItem.type)) { return false }
            if (args.minLifetime && this.entitySpawnTimes[entity.id]) {
                const entityLifetime = performance.now() - this.entitySpawnTimes[entity.id]
                if (entityLifetime < args.minLifetime) {
                    return false
                }
            }
            return true
        })
        if (!nearestEntity) { return { error: `No items found` } }

        const distance = nearestEntity.position.distanceTo(args.point)
        if (distance > args.maxDistance) { return { error: `No items nearby` } }
        
        return { result: nearestEntity }
    }

    /**
    * @param {{
    *   maxDistance?: number;
    *   point?: Vec3;
    * }} args
    * @returns {import('./result').Result<import('prismarine-entity').Entity>}
    */
    getClosestArrow(args = { }) {
        const nearestEntity = this.bot.bot.nearestEntity((/** @type {import('prismarine-entity').Entity} */ entity) => (
            entity.displayName === 'Arrow' &&
            (entity.velocity.distanceTo(new Vec3(0, 0, 0)) < 1)
            ))
        if (!nearestEntity) { return { error: `No arrows found` } }

        const distance = nearestEntity.position.distanceTo(args.point ?? this.bot.bot.entity.position)
        if (distance > (args.maxDistance || 10)) { return { error: `No arrows nearby` } }
            
        return { result: nearestEntity }
    }

    /**
    * @param {{
    *   maxDistance?: number;
    *   point?: Vec3;
    * }} args
    * @returns {import('./result').Result<import('prismarine-entity').Entity>}
    */
    getClosestXp(args = { }) {
        const nearestEntity = this.bot.bot.nearestEntity((/** @type {import('prismarine-entity').Entity} */ entity) => (
            entity.name === 'experience_orb')
        )
        if (!nearestEntity) { return { error: `No xps found` } }

        const distance = nearestEntity.position.distanceTo(args.point ?? this.bot.bot.entity.position)
        if (distance > (args.maxDistance || 10)) { return { error: `No xps nearby` } }
            
        return { result: nearestEntity }
    }

    /**
     * Source: https://github.com/PrismarineJS/mineflayer-pvp/blob/master/src/PVP.ts
     * @returns {import('prismarine-entity').Entity | null}
     */
    getExplodingCreeper() {
        return this.bot.bot.nearestEntity((/** @type {import('prismarine-entity').Entity} */ entity) => {
            return (
                entity.name === 'creeper' &&
                // @ts-ignore
                entity.metadata[16] === 1
            )
        })
    }

    /**
     * @returns {import('prismarine-entity').Entity | null}
     */
    possibleDirectHostileAttack() {
        return this.bot.bot.nearestEntity((/** @type {import('prismarine-entity').Entity} */ entity) => {
            if (!filterHostiles(entity)) { return false }

            if (!entity.name) {
                return false
            }

            const distance = this.bot.bot.entity.position.distanceTo(entity.position)

            if (entity.name === 'skeleton' ||
                entity.name === 'stray') {
                return distance <= 20
            }

            return distance < 10
        })
    }

    /**
     * @param {string} username
     * @param {number} [maxAge]
     * @returns {Vec3 | null}
     */
    getPlayerPosition(username, maxAge) {
        const player = this.bot.bot.players[username]
        if (player && player.entity && player.entity.position) {
            return player.entity.position
        }
        const saved = this.playerPositions[username]
        if (saved) {
            if (maxAge) {
                const age = Date.now() - saved.time
                if (maxAge < age) {
                    return null
                }
            }
            return saved.position
        }
        return null
    }

    /**
     * @param {string} username
     * @param {Vec3} position
     */
    setPlayerPosition(username, position) {
        if (!position) {
            return
        }

        if (!this.playerPositions[username]) {
            this.playerPositions[username] = {
                time: Date.now(),
                position: position.clone(),
            }
        } else {
            const pos = this.playerPositions[username]
            pos.time = Date.now()
            pos.position.x = position.x
            pos.position.y = position.y
            pos.position.z = position.z
        }
    }
}
