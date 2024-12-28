'use strict'

const path = require('path')
const fs = require('fs')
const { replacer, reviver } = require('./serializing')
const Vec3Dimension = require('./vec3-dimension')
const Dict = require('./utils/dict')
const { isItemEquals } = require('./utils/other')

module.exports = class Memory {
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
     * @type {Dict<import('./utils/other').ItemId, { lastTime: number; successCount: number; }>}
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
        this.filePath = filePath

        this.myBed = null
        this.myChests = []
        this.mlgJunkBlocks = []
        this.myArrows = []
        this.hurtBy = {}
        this.successfulGatherings = new Dict(isItemEquals)
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
        this.successfulGatherings = data.successfulGatherings ? Dict.fromJSON(data.successfulGatherings, isItemEquals) : this.successfulGatherings
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
            successfulGatherings: this.successfulGatherings.toJSON(),
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
        goal = { ...goal }

        for (let i = this._unreachableGoals.length - 1; i > 0; i--) {
            if ((performance.now() - this._unreachableGoals[i].time) > 30000) {
                this._unreachableGoals.splice(i, 1)
            }
        }

        if ('bot' in goal) { delete goal.bot }

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
