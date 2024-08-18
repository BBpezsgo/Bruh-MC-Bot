const path = require('path')
const fs = require('fs')
const { replacer, reviver } = require('./serializing')
const Vec3Dimension = require('./vec3-dimension')
const { Vec3 } = require('vec3')

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
     * @type {Vec3Dimension | null}
     */
    myBed

    /**
     * @type {Record<number, Array<number>>}
     */
    hurtBy

    /**
     * @readonly
     * @type {Array<Vec3Dimension>}
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
     * @private @readonly
     * @type {Array<{
     *   goal: import('mineflayer-pathfinder/lib/goals').GoalBase;
     *   time: number;
     * }>}
     */
    _unreachableGoals

    /**
     * @readonly
     * @type {Record<string, { lastTime: number; successCount: number; }>}
     */
    successfulGatherings

    /**
     * @type {Vec3Dimension | null}
     */
    idlePosition

    /**
     * @param {import('./bruh-bot')} bot
     * @param {string} filePath
     */
    constructor(bot, filePath) {
        this.bot = bot
        this.filePath = filePath

        this.myBed = null
        this.myChests = []
        this.mlgJunkBlocks = []
        this.myArrows = []
        this.hurtBy = {}
        this.successfulGatherings = {}
        this._unreachableGoals = []
        this.idlePosition = null

        if (!fs.existsSync(this.filePath)) {
            console.log(`[Memory] File not found at "${this.filePath}"`)
            return
        }
        const data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'), reviver)

        this.myBed = data.myBed ?? this.myBed
        this.myChests = data.myChests ?? this.myChests
        this.mlgJunkBlocks = data.mlgJunkBlocks ?? this.mlgJunkBlocks
        this.myArrows = data.myArrows ?? this.myArrows
        this.successfulGatherings = data.successfulGatherings ?? this.successfulGatherings
        this.idlePosition = data.idlePosition ?? this.idlePosition

        console.log(`[Memory] Loaded`)
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
            successfulGatherings: this.successfulGatherings,
            idlePosition: this.idlePosition,
        }, replacer, ' '))
    }

    /**
     * @param {import('mineflayer-pathfinder/lib/goals').GoalBase} goal
     */
    theGoalIsUnreachable(goal) {
        this._unreachableGoals.push({
            goal: goal,
            time: performance.now(),
        })
    }

    /**
     * @param {import('mineflayer-pathfinder/lib/goals').GoalBase} goal
     */
    isGoalUnreachable(goal) {
        for (let i = this._unreachableGoals.length - 1; i > 0; i--) {
            if ((performance.now() - this._unreachableGoals[i].time) > 30000) {
                this._unreachableGoals.splice(i, 1)
            }
        }

        const jsonA = JSON.stringify(goal)
        for (const unreachableGoal of this._unreachableGoals) {
            const jsonB = JSON.stringify(unreachableGoal.goal)
            if (jsonA === jsonB) {
                return true
            }
        }
        return false
    }
}
