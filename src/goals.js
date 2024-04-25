const Context = require('./context')
const AsyncGoal = require('./goals/async-base')
const { Goal } = require('./goals/base')
const { error } = require('./utils')

module.exports = class Goals {
    /**
     * @readonly
     * @type {Array<Goal<any>>}
     */
    normal

    /**
     * @readonly
     * @type {Array<Goal<any>>}
     */
    survival

    /**
     * @readonly
     * @type {Array<Goal<any>>}
     */
    critical

    /**
     * @type {number}
     */
    idlingStarted

    /**
     * @private
     * @type {{
     *   callback: (() => any)?;
     *   normal: boolean;
     *   survival: boolean;
     *   critical: boolean;
     * }?}
     */
    shouldCancel

    constructor() {
        this.normal = []
        this.survival = []
        this.critical = []

        this.idlingStarted = 0
        this.shouldCancel = null
    }

    /**
     * @param {number} time
     * @returns {boolean}
     */
    isIdle(time) {
        return (this.idlingStarted > 0) && ((performance.now() - this.idlingStarted) > time)
    }

    /**
     * @param {boolean} includeQuiets
     * @returns {boolean}
     */
    has(includeQuiets) {
        if (this.critical.length > 0) {
            return true
        }

        if (this.survival.length > 0) {
            return true
        }

        if (this.normal.length === 0) {
            return false
        }

        if (this.normal[0].quiet) {
            return includeQuiets
        }

        return true
    }

    /**
     * @param {Context} context
     * @param {Array<Goal<any>>} goals
     * @param {number} depth
     * @param {'normal' | 'survival' | 'critical'} type
     */
    runGoals(context, goals, depth, type) {
        if (goals.length === 0) {
            return
        }

        const isDone = this.runGoal(context, goals[0], depth, type)

        if (isDone) {
            goals.shift()?.cleanup(context)
        }
    }

    /**
     * @param {Context} context
     * @param {Goal<any>} goal
     * @param {number} depth
     * @param {'normal' | 'survival' | 'critical'} type
     */
    runGoal(context, goal, depth, type) {
        const indent = (''.padStart(depth * 2, ' '))

        if (this.shouldCancel &&
            this.shouldCancel[type]) {
            goal.finish(error(`${indent} Cancelled`))
            if ('cancel' in goal && typeof goal.cancel === 'function') {
                goal.cancel(context)
            }
            return true
        }

        if (goal.goals.length > 0) {
            this.runGoals(context, goal.goals, depth + 1, type)
            return false
        }

        if (goal instanceof AsyncGoal &&
            goal.started) {
            if (!goal.resolvedValue) {
                return false
            }

            try {
                goal.finish(goal.resolvedValue)
            } catch (error) {
                console.error(error)
            }
            if ('error' in goal.resolvedValue) {
                if (typeof goal.resolvedValue.error === 'string') {
                    if (!goal.quiet) console.error(`${indent} Goal ${goal.constructor.name} errored: ${goal.resolvedValue.error}`)
                    if (depth === 0 &&
                        !goal.quiet) {
                        context.bot.chat(goal.resolvedValue.error)
                    }
                }
            } else {
                if (!goal.quiet) console.log(`${indent} Goal ${goal.constructor.name} finished: ${goal.resolvedValue.result}`)
            }
            return true
        }

        const alreadyStarted = goal.started

        if (!alreadyStarted && !goal.quiet) console.log(`${indent} Running goal ${goal.constructor.name} ...`)

        /**
         * @type {import('./goals/base').AsyncGoalReturn<any> | import('./goals/base').GoalReturn<any>}
         */
        let goalResult

        if (depth > 10) {
            goal.finish(error(`Too deep task`))
            return true
        }

        try {
            goalResult = goal.run(context)
        } catch (error) {
            console.error(error)
            goalResult = { error: error.toString() }
        }

        if (!goalResult) {
            return false
        }

        if (goalResult instanceof Promise) {
            goalResult.then((value) => {
                goal.resolvedValue = value
            })
            goalResult.catch((reason) => {
                goal.resolvedValue = { error: reason }
            })

            // if (!goal.quiet) console.log(`${indent} Goal ${goal.constructor.name} promised to finish ...`)
            return false
        }

        if ('error' in goalResult) {
            if (!goal.quiet) console.error(`${indent} Goal ${goal.constructor.name} errored: ${goalResult.error}`)
        } else {
            if (!goal.quiet) console.log(`${indent} Goal ${goal.constructor.name} finished: ${goalResult.result}`)
        }
        // if (!goal.quiet) console.log(`${indent} Finishing goal ${goal.constructor.name} ...`)
        goal.finish(goalResult)
        return true
    }

    /**
     * @param {boolean} normal
     * @param {boolean} survival
     * @param {boolean} critical
     * @param {(() => any)?} callback
     */
    cancel(normal, survival, critical, callback = null) {
        this.shouldCancel = {
            normal: normal,
            survival: survival,
            critical: critical,
            callback: callback,
        }
    }

    /**
     * @param {Context} context
     */
    tick(context) {
        if (this.shouldCancel) {
            let cancelDone = true

            if (this.shouldCancel.normal) {
                for (const goal of this.normal) {
                    if (goal.quiet) { continue }
                    cancelDone = false
                    break
                }
            }

            if (this.shouldCancel.survival) {
                for (const goal of this.survival) {
                    if (goal.quiet) { continue }
                    cancelDone = false
                    break
                }
            }

            if (this.shouldCancel.critical) {
                for (const goal of this.critical) {
                    if (goal.quiet) { continue }
                    cancelDone = false
                    break
                }
            }

            if (cancelDone) {
                if (this.shouldCancel.callback) {
                    this.shouldCancel.callback()
                }

                this.shouldCancel = null
                console.log(`Cancelled`)
            }
        }

        try {
            if (this.critical.length > 0) {
                this.runGoals(context, this.critical, 0, 'critical')
            } else if (this.survival.length > 0) {
                this.runGoals(context, this.survival, 0, 'survival')
            } else {
                this.runGoals(context, this.normal, 0, 'normal')
            }
        } catch (error) {
            console.error(error)
        }

        if (this.has(false)) {
            this.idlingStarted = 0
        } else if (this.idlingStarted === 0) {
            this.idlingStarted = performance.now()
        }
    }
}
