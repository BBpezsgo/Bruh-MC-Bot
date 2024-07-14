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
     */
    constructor(bot) {
        this.bot = bot

        this.myBed = null
        this.myChests = [ ]
        this.mlgJunkBlocks = [ ]
        this.myArrows = [ ]
        
        const memoryPath = path.join(__dirname, '..', 'temp', 'memory.json')
        if (!fs.existsSync(memoryPath)) {
            console.log(`[Memory]: File not found at "${memoryPath}"`)
            return
        }
        const data = JSON.parse(fs.readFileSync(memoryPath, 'utf8'), reviver)
        
        this.myBed = data.myBed
        this.myChests = data.myChests
        this.mlgJunkBlocks = data.mlgJunkBlocks
        this.myArrows = data.myArrows
        console.log(`[Memory]: Loaded`)
    }

    save() {
        const memoryPath = path.join(__dirname, '..', 'temp', 'memory.json')
        if (!fs.existsSync(path.dirname(memoryPath))) {
            fs.mkdirSync(path.dirname(memoryPath), { recursive: true })
        }
        fs.writeFileSync(memoryPath, JSON.stringify({
            myBed: this.myBed,
            myChests: this.myChests,
            mlgJunkBlocks: this.mlgJunkBlocks,
            myArrows: this.myArrows,
        }, replacer, ' '))
    }
}
