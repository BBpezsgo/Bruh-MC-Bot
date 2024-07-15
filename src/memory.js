const { Vec3 } = require('vec3')
const path = require('path')
const fs = require('fs')
const { replacer, reviver } = require('./serializing')

// @ts-ignore
module.exports = class Memory {
    /**
     * @private @readonly
     * @type {import('./bruh-bot')}
     */
    bot

    /**
     * @private @readonly
     * @type {string}
     */
    filePath

    /**
     * @type {Vec3 | null}
     */
    myBed

    /**
     * @readonly
     * @type {Array<Vec3>}
     */
    myChests

    /**
     * @readonly
     * @type {Array<import('./tasks/mlg').MlgJunkBlock>}
     */
    mlgJunkBlocks

    /**
     * @readonly
     * @type {Array<number>}
     */
    myArrows

    /**
     * @param {import('./bruh-bot')} bot
     * @param {string} filePath
     */
    constructor(bot, filePath) {
        this.bot = bot
        this.filePath = filePath

        this.myBed = null
        this.myChests = [ ]
        this.mlgJunkBlocks = [ ]
        this.myArrows = [ ]
        
        if (!fs.existsSync(this.filePath)) {
            console.log(`[Memory]: File not found at "${this.filePath}"`)
            return
        }
        const data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'), reviver)
        
        this.myBed = data.myBed ?? this.myBed
        this.myChests = data.myChests ?? this.myChests
        this.mlgJunkBlocks = data.mlgJunkBlocks ?? this.mlgJunkBlocks
        this.myArrows = data.myArrows ?? this.myArrows
        console.log(`[Memory]: Loaded`)
    }

    save() {
        if (!fs.existsSync(path.dirname(this.filePath))) {
            fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
        }
        fs.writeFileSync(this.filePath, JSON.stringify({
            myBed: this.myBed,
            myChests: this.myChests,
            mlgJunkBlocks: this.mlgJunkBlocks,
            myArrows: this.myArrows,
        }, replacer, ' '))
    }
}
