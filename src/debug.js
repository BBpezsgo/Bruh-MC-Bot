const { Vec3 } = require('vec3')
const { nonce } = require('./utils/math')

const lineMinDistance = 0.8
const enabled = true

/**
 * @typedef {"black" |
 *   "dark_blue" |
 *   "dark_green" |
 *   "dark_aqua" |
 *   "dark_red" |
 *   "dark_purple" |
 *   "gold" |
 *   "gray" |
 *   "dark_gray" |
 *   "blue" |
 *   "green" |
 *   "aqua" |
 *   "red" |
 *   "light_purple" |
 *   "yellow" |
 *   "white"
 * } NamedColor
 */

/**
 * @typedef {`#${string}`} HexColor
 */

/**
 * @typedef {{
*   color?: NamedColor | HexColor;
*   font?: string;
*   bold?: boolean;
*   italic?: boolean;
*   underlined?: boolean;
*   strikethrough?: boolean;
*   obfuscated?: boolean;
* }} JsonTextFormat
 */

/**
 * @typedef {{ extra?: unknown } & JsonTextFormat & ({
 *   text: string;
 * } | {
 *   translate: string;
 *   fallback?: string;
 *   with?: Array<JsonTextComponent>;
 * } | {
 *   score: {
 *     name: string;
 *     objective: string;
 *     value?: string;
 *   }
 * } | {
 *   selector: string;
 *   separator: JsonTextComponent;
 * } | {
 *   keybind: string;
 * })} JsonTextComponent
 */

class TextDisplay {
    /**
     * @private @readonly
     * @type {import('mineflayer').Bot}
     */
    _bot
    /**
     * @private @readonly
     * @type {string}
     */
    _nonce

    /**
     * @param {import('mineflayer').Bot} bot
     */
    constructor(bot) {
        this._bot = bot
        this._entity = null
        this._nonce = nonce(8)

        this._bot.chat(`/summon minecraft:text_display ~ ~2 ~ {billboard:"center",Tags:["${this._nonce}"],text:'{"text":"NICKNAME"}'}`)
        this._selector = `@e[type=minecraft:text_display,limit=1,nbt={Tags:["${this._nonce}"]}]`
    }

    /**
     * @private @readonly
     * @type {string}
     */
    _selector

    /**
     * @private
     * @type {string}
     */
    _text
    /**
     * @type {Readonly<JsonTextComponent>}
     */
    get text() {
        return this._text ? JSON.parse(this._text.replace(/\\\'/g, '\'')) : ''
    }
    set text(value) {
        const json = JSON.stringify(value).replace(/\'/g, '\\\'')
        if (this._text && this._text === json) { return }
        this._text = json
        this._bot.chat(`/data modify entity ${this._selector} text set value '${json}'`)
    }

    /**
     * @type {Vec3}
     */
    _position
    /**
     * @param {Readonly<{ x: number; y: number; z: number; }>} position
     */
    setPosition(position) {
        const precision = 100
        const rounded = new Vec3(
            Math.round(position.x * precision) / precision,
            Math.round(position.y * precision) / precision,
            Math.round(position.z * precision) / precision
        )
        if (this._position && this._position.equals(rounded)) { return }
        this._position = rounded
        this._bot.chat(`/data modify entity ${this._selector} Pos set value [${rounded.x}d,${rounded.y}d,${rounded.z}d]`)
    }

    /**
     * @private
     * @type {boolean}
     */
    _disposed
    dispose() {
        if (this._disposed) { return }
        this._bot.chat(`/kill ${this._selector}`)
        this._disposed = true
    }
}

module.exports = class Debug {
    static TextDisplay = TextDisplay

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
        if (!enabled) { return }
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
        if (!enabled) { return }
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
        if (!enabled) { return }
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
        if (!enabled) { return }
        for (let i = 1; i < points.length; i++) {
            this.drawLine(points[i - 1], points[i], color)
        }
    }

    tick() {
        if (!enabled) { return }
        const n = Math.min(10, this._pointQueue.length)
        for (let i = 0; i < n; i++) {
            const point = this._pointQueue.shift()
            this._bot.bot.chat(`/particle dust ${point.color[0]} ${point.color[1]} ${point.color[2]} 1 ${point.position.x} ${point.position.y} ${point.position.z} 0 0 0 0 1`)
        }
    }
}
