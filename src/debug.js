const { Vec3 } = require('vec3')

module.exports = class Debug {
    /**
     * @typedef {[number, number, number]} Color
     */

    /**
     * @private @readonly
     * @type {import('./bruh-bot')}
     */
    bot

    /**
     * @private @readonly
     * @type {Array<import('./task').Task<void>>}
     */
    drawers

    /**
     * @private
     * @type {number}
     */
    counter

    /**
     * @param {import('./bruh-bot')} bot
     */
    constructor(bot) {
        this.bot = bot
        this.drawers = []
        this.counter = 0
    }

    /**
     * @param {Vec3} position
     * @param {Color} color
     */
    drawPoint(position, color) {
        this.bot.bot.chat(`/particle dust ${color[0]} ${color[1]} ${color[2]} 1 ${position.x} ${position.y} ${position.z} 0 0 0 0 1`)
        this.counter++
    }

    /**
     * @param {Vec3} a
     * @param {Vec3} b
     * @param {Color} color
     */
    drawLine(a, b, color) {
        const offset = new Vec3(b.x - a.x, b.y - a.y, b.z - a.z)
        const length = Math.sqrt((offset.x * offset.x) + (offset.y * offset.y) + (offset.z * offset.z))
        offset.normalize()
        for (let i = 0; i <= length; i += 0.5) {
            this.drawPoint(a.offset(offset.x * i, offset.y * i, offset.z * i), color)
        }
    }

    // tick() {
    //     for (let i = 0; i < 5; i++) {
    //         if (this.drawers.length === 0) { break }
    //         const first = this.drawers[0]
    //         const isDone = first.next().done
    //         if (!isDone) { continue }
    //         this.drawers.shift()
    //     }
    // }
    // 
    // /**
    //  * @param {import("./task").Task<void>} drawer
    //  */
    // push(drawer) {
    //     this.drawers.push(drawer)
    // }
}