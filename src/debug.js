const { Vec3 } = require('vec3')

const lineMinDistance = 0.8

module.exports = class Debug {
    /**
     * @readonly
     */
    static enabled = true

    /**
     * @typedef {[number, number, number]} Color
     */

    /**
     * @private @readonly
     * @type {import('./bruh-bot')}
     */
    _bot

    /**
     * @private @readonly
     * @type {Array<{ position: Vec3; color: Color; }>}
     */
    _pointQueue

    /**
     * @param {import('./bruh-bot')} bot
     */
    constructor(bot) {
        this._bot = bot
        this._pointQueue = []
    }

    /**
     * @param {Vec3} position
     * @param {Color} color
     */
    drawPoint(position, color) {
        if (!Debug.enabled) { return }
        this._pointQueue.push({
            position: position,
            color: color,
        })
        if (this._pointQueue.length > 80) {
            this._pointQueue.shift()
        }
    }

    /**
     * @param {Vec3} position
     * @param {Vec3} size
     * @param {Color} color
     */
    drawBox(position, size, color) {
        if (!Debug.enabled) { return }
        const step = 0.5
        for (let x = 0; x <= size.x; x += step) {
            this.drawPoint(position.offset(x, 0, 0), color)
            this.drawPoint(position.offset(x, size.y, 0), color)
            this.drawPoint(position.offset(x, 0, size.y), color)
            this.drawPoint(position.offset(x, size.y, size.y), color)
        }
        for (let y = step; y < size.y; y += step) {
            this.drawPoint(position.offset(0, y, 0), color)
            this.drawPoint(position.offset(size.x, y, 0), color)
            this.drawPoint(position.offset(0, y, size.z), color)
            this.drawPoint(position.offset(size.x, y, size.z), color)
        }
        for (let z = step; z < size.z; z += step) {
            this.drawPoint(position.offset(0, 0, z), color)
            this.drawPoint(position.offset(size.x, 0, z), color)
            this.drawPoint(position.offset(0, size.y, z), color)
            this.drawPoint(position.offset(size.x, size.y, z), color)
        }
    }

    /**
     * @param {Vec3} a
     * @param {Vec3} b
     * @param {Color} color
     */
    drawLine(a, b, color) {
        if (!Debug.enabled) { return }
        const offset = new Vec3(b.x - a.x, b.y - a.y, b.z - a.z)
        const length = Math.sqrt((offset.x * offset.x) + (offset.y * offset.y) + (offset.z * offset.z))
        offset.normalize()
        for (let i = 0; i <= length; i += lineMinDistance) {
            this.drawPoint(a.offset(offset.x * i, offset.y * i, offset.z * i), color)
        }
    }

    /**
     * @param {ReadonlyArray<Vec3>} points
     * @param {Color} color
     */
    drawLines(points, color) {
        if (!Debug.enabled) { return }
        for (let i = 1; i < points.length; i++) {
            this.drawLine(points[i - 1], points[i], color)
        }
    }

    tick() {
        if (!Debug.enabled) { return }
        const n = Math.min(10, this._pointQueue.length)
        for (let i = 0; i < n; i++) {
            const point = this._pointQueue.shift()
            this._bot.bot.chat(`/particle dust ${point.color[0]} ${point.color[1]} ${point.color[2]} 1 ${point.position.x} ${point.position.y} ${point.position.z} 0 0 0 0 1`)
        }
    }
}
