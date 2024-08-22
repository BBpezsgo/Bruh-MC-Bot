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
     * @type {Array<{ position: Vec3; color: Color; endColor: Color | undefined; scale: number; }>}
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
     * @param {Color | undefined} [endColor]
     * @param {number} [scale]
     */
    drawPoint(position, color, endColor = undefined, scale = 1) {
        if (!Debug.enabled) { return }
        this._pointQueue.push({
            position: position,
            color: color,
            endColor: endColor,
            scale: scale,
        })
        if (this._pointQueue.length > 80) {
            this._pointQueue.shift()
        }
    }

    /**
     * @param {Vec3} position
     * @param {Vec3} size
     * @param {Color} color
     * @param {Color | undefined} [endColor]
     * @param {number} [scale]
     */
    drawBox(position, size, color, endColor = undefined, scale = 1) {
        if (!Debug.enabled) { return }
        const step = 0.5
        for (let x = 0; x <= size.x; x += step) {
            this.drawPoint(position.offset(x, 0, 0), color, endColor, scale)
            this.drawPoint(position.offset(x, size.y, 0), color, endColor, scale)
            this.drawPoint(position.offset(x, 0, size.y), color, endColor, scale)
            this.drawPoint(position.offset(x, size.y, size.y), color, endColor, scale)
        }
        for (let y = step; y < size.y; y += step) {
            this.drawPoint(position.offset(0, y, 0), color, endColor, scale)
            this.drawPoint(position.offset(size.x, y, 0), color, endColor, scale)
            this.drawPoint(position.offset(0, y, size.z), color, endColor, scale)
            this.drawPoint(position.offset(size.x, y, size.z), color, endColor, scale)
        }
        for (let z = step; z < size.z; z += step) {
            this.drawPoint(position.offset(0, 0, z), color, endColor, scale)
            this.drawPoint(position.offset(size.x, 0, z), color, endColor, scale)
            this.drawPoint(position.offset(0, size.y, z), color, endColor, scale)
            this.drawPoint(position.offset(size.x, size.y, z), color, endColor, scale)
        }
    }

    /**
     * @param {Vec3} a
     * @param {Vec3} b
     * @param {Color | ((t: number) => Color)} color
     * @param {Color | undefined} [endColor]
     * @param {number} [scale]
     */
    drawLine(a, b, color, endColor = undefined, scale = 1) {
        if (!Debug.enabled) { return }
        const offset = new Vec3(b.x - a.x, b.y - a.y, b.z - a.z)
        const length = Math.sqrt((offset.x * offset.x) + (offset.y * offset.y) + (offset.z * offset.z))
        offset.normalize()
        if (typeof color === 'function') {
            for (let i = 0; i <= length; i += lineMinDistance) {
                this.drawPoint(a.offset(offset.x * i, offset.y * i, offset.z * i), color(length ? (i / length) : 1), endColor, scale)
            }
        } else {
            for (let i = 0; i <= length; i += lineMinDistance) {
                this.drawPoint(a.offset(offset.x * i, offset.y * i, offset.z * i), color, endColor, scale)
            }
        }
    }

    /**
     * @param {ReadonlyArray<Vec3>} points
     * @param {Color | ((t: number) => Color)} color
     * @param {Color | undefined} [endColor]
     * @param {number} [scale]
     */
    drawLines(points, color, endColor = undefined, scale = 1) {
        if (!Debug.enabled) { return }
        if (typeof color === 'function') {
            let l = 0
            for (let i = 1; i < points.length; i++) {
                l += points[i - 1].distanceTo(points[i])
            }
            let t = 0
            for (let i = 1; i < points.length; i++) {
                const a = points[i - 1]
                const b = points[i]
                const offset = new Vec3(b.x - a.x, b.y - a.y, b.z - a.z)
                const length = Math.sqrt((offset.x * offset.x) + (offset.y * offset.y) + (offset.z * offset.z))
                offset.normalize()
                for (let i = 0; i <= length; i += lineMinDistance) {
                    const _t = (t + i) / l
                    this.drawPoint(a.offset(offset.x * i, offset.y * i, offset.z * i), color(_t), endColor, scale)
                }
                t += length
            }
        } else {
            for (let i = 1; i < points.length; i++) {
                this.drawLine(points[i - 1], points[i], color, endColor, scale)
            }
        }
    }

    tick() {
        if (!Debug.enabled) { return }
        const n = Math.min(10, this._pointQueue.length)
        for (let i = 0; i < n; i++) {
            const point = this._pointQueue.shift()
            if (point.endColor) {
                this._bot.bot.chat(`/particle dust_color_transition ${point.color[0].toFixed(2)} ${point.color[1].toFixed(2)} ${point.color[2].toFixed(2)} ${point.scale.toFixed(2)} ${point.color[0].toFixed(2)} ${point.color[1].toFixed(2)} ${point.color[2].toFixed(2)} ${point.position.x.toFixed(2)} ${point.position.y.toFixed(2)} ${point.position.z.toFixed(2)} 0 0 0 0 1`)
            } else {
                this._bot.bot.chat(`/particle dust ${point.color[0].toFixed(2)} ${point.color[1].toFixed(2)} ${point.color[2].toFixed(2)} ${point.scale.toFixed(2)} ${point.position.x.toFixed(2)} ${point.position.y.toFixed(2)} ${point.position.z.toFixed(2)} 0 0 0 0 1`)
            }
        }
    }
}
