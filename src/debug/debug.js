'use strict'

const { Vec3 } = require('vec3')
const TextDisplay = require('./text-display')
const BlockDisplay = require('./block-display')
const ItemDisplay = require('./item-display')

/**
 * @typedef {[number, number, number, number]} Quaternion
 */

/**
 * @typedef {[number, number, number]} SimpleVector3
 */

/**
 * @typedef {[
 *   number, number, number, number,
 *   number, number, number, number,
 *   number, number, number, number,
 *   number, number, number, number,
 * ]} Matrix4x4
 */

/**
 * @typedef {{
 *   billboard?: 'fixed' | 'vertical' | 'horizontal' | 'center';
 *   brightness?: {
 *     block: number;
 *     sky: number;
 *   };
 *   glow_color_override?: number;
 *   height?: number;
 *   width?: number;
 *   interpolation_duration?: number;
 *   teleport_duration?: number;
 *   start_interpolation?: number;
 *   shadow_radius?: number;
 *   shadow_strength?: number;
 *   view_range?: number;
 *   transformation?: Matrix4x4 | {
 *     right_rotation: Quaternion | { angle: number; axis: SimpleVector3; };
 *     scale: SimpleVector3;
 *     left_rotation: Quaternion | { angle: number; axis: SimpleVector3; };
 *     translation: SimpleVector3;
 *   }
 * }} DisplayEntityData
 */

/**
 * @typedef {DisplayEntityData & {
 *   block_state: {
 *     Name: string;
 *     Properties?: Record<string, any>;
 *   };
 * }} BlockDisplayEntityData
 */

/**
 * @typedef {DisplayEntityData & {
 *   item: {
 *     id: string;
 *     count?: number;
 *     components?: any;
 *   };
 *   item_display?: 'none' | 'thirdperson_lefthand' | 'thirdperson_righthand' | 'firstperson_lefthand' | 'firstperson_righthand' | 'head' | 'gui' | 'ground';
 * }} ItemDisplayEntityData
 */

/**
 * @typedef {'black' |
 *   'dark_blue' |
 *   'dark_green' |
 *   'dark_aqua' |
 *   'dark_red' |
 *   'dark_purple' |
 *   'gold' |
 *   'gray' |
 *   'dark_gray' |
 *   'blue' |
 *   'green' |
 *   'aqua' |
 *   'red' |
 *   'light_purple' |
 *   'yellow' |
 *   'white'
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

/**
 * @typedef {DisplayEntityData & {
 *   alignment?: 'center' | 'left' | 'right';
 *   background?: number | boolean;
 *   default_background?: boolean;
 *   line_width?: number;
 *   see_through?: boolean;
 *   shadow?: boolean;
 *   text: string;
 *   text_opacity?: number;
 * }} TextDisplayEntityData
 */

const lineMinDistance = 0.8

module.exports = class Debug {
    // TODO: better handling of on/off
    static enabled = false

    /**
     * @typedef {[number, number, number]} Color
     */

    /**
     * @private @readonly
     * @type {import('../bruh-bot')}
     */
    _bot

    /**
     * @private @readonly
     * @type {Array<{ position: Point3; color: Color; endColor: Color | undefined; scale: number; }>}
     */
    _pointQueue

    /**
     * @private
     * @type {boolean}
     */
    _isFirstTick = true

    /**
     * @param {import('../bruh-bot')} bot
     * @param {boolean} enabled
     */
    constructor(bot, enabled) {
        this._bot = bot
        // @ts-ignore
        this._bot.bot.debug = this
        this._pointQueue = []
        Debug.enabled = enabled
    }

    /**
     * @param {Point3} position
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
     * @param {Point3} size
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
     * @template {Point3} TPoint
     * @param {TPoint} a
     * @param {TPoint} b
     * @param {Color | ((t: number, from: TPoint, to: TPoint) => Color)} color
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
                this.drawPoint(new Vec3(a.x + offset.x * i, a.y + offset.y * i, a.z + offset.z * i), color(length ? (i / length) : 1, a, b), endColor, scale)
            }
        } else {
            for (let i = 0; i <= length; i += lineMinDistance) {
                this.drawPoint(new Vec3(a.x + offset.x * i, a.y + offset.y * i, a.z + offset.z * i), color, endColor, scale)
            }
        }
    }

    /**
     * @template {Point3} TPoint
     * @param {ReadonlyArray<TPoint>} points
     * @param {Color | ((t: number, from: TPoint, to: TPoint) => Color)} color
     * @param {Color | undefined} [endColor]
     * @param {number} [scale]
     */
    drawLines(points, color, endColor = undefined, scale = 1) {
        if (!Debug.enabled) { return }
        if (typeof color === 'function') {
            let l = 0
            for (let i = 1; i < points.length; i++) {
                l += Math.sqrt(
                    Math.pow(points[i - 1].x - points[i].x, 2) +
                    Math.pow(points[i - 1].y - points[i].y, 2) +
                    Math.pow(points[i - 1].z - points[i].z, 2)
                )
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
                    this.drawPoint(new Vec3(a.x + offset.x * i, a.y + offset.y * i, a.z + offset.z * i), color(_t, a, b), endColor, scale)
                }
                t += length
            }
        } else {
            for (let i = 1; i < points.length; i++) {
                this.drawLine(points[i - 1], points[i], color, endColor, scale)
            }
        }
    }

    /**
     * @template {Point3} TPoint
     * @param {ReadonlyArray<TPoint>} points
     * @param {'white' | 'light_gray' | 'gray' | 'black' | 'brown' | 'red' | 'orange' | 'yellow' | 'lime' | 'green' | 'cyan' | 'light_blue' | 'blue' | 'purple' | 'magenta' | 'pink'} color
     * @param {number} time
     * @param {number} [thickness]
     */
    drawSolidLines(points, color, time, thickness = 0.05) {
        if (!Debug.enabled) { return }
        for (let i = 1; i < points.length; i++) {
            this.drawSolidLine(points[i - 1], points[i], color, time, thickness)
        }
    }

    /**
     * @param {Point3} a
     * @param {Point3} b
     * @param {'white' | 'light_gray' | 'gray' | 'black' | 'brown' | 'red' | 'orange' | 'yellow' | 'lime' | 'green' | 'cyan' | 'light_blue' | 'blue' | 'purple' | 'magenta' | 'pink'} color
     * @param {number} time
     * @param {number} [thickness]
     */
    drawSolidLine(a, b, color, time, thickness = 0.05) {
        if (!Debug.enabled) { return }
        const target = new Vec3(b.x - a.x, b.y - a.y, b.z - a.z).normalize()
        const forward = new Vec3(0, 0, 1)
        const distance = Math.distance(a, b)

        /** @type {BlockDisplayEntityData} */
        const data = {
            block_state: { Name: color + '_wool' },
        }

        if (forward.equals(target)) {
            data.transformation = {
                right_rotation: [0, 0, 0, 1],
                left_rotation: [0, 0, 0, 1],
                scale: [thickness, thickness, distance],
                translation: [thickness / 2, thickness / 2, thickness / 2],
            }
        } else {
            if (target.equals(new Vec3(0, 0, -1))) {
                forward.z = -1
                const axis = forward.cross(target).normalize()
                const theta = Math.acos(forward.dot(target))
                data.transformation = {
                    right_rotation: [0, 0, 0, 1],
                    left_rotation: { angle: theta, axis: [axis.x, axis.y, axis.z] },
                    scale: [thickness, thickness, distance],
                    translation: [thickness / 2, thickness / 2, -(distance + thickness / 2)],
                }
            } else {
                const axis = forward.cross(target).normalize()
                const theta = Math.acos(forward.dot(target))
                data.transformation = {
                    right_rotation: [0, 0, 0, 1],
                    left_rotation: { angle: theta, axis: [axis.x, axis.y, axis.z] },
                    scale: [thickness, thickness, distance],
                    translation: [thickness / 2, thickness / 2, thickness / 2],
                }
            }
        }

        for (const other of Object.values(BlockDisplay.registry)) {
            if (other.equals({ _options: data, _position: new Vec3(a.x, a.y, a.z) })) {
                other.touch()
                return
            }
        }

        new BlockDisplay(this._bot.commands, {
            data: data,
            position: a,
            maxIdleTime: time,
        })
    }

    /**
     * @template {Point3} TPoint
     * @param {ReadonlyArray<TPoint>} points
     * @param {Color} color
     */
    drawPoints(points, color) {
        if (!Debug.enabled) { return }
        for (let i = 0; i < points.length; i++) {
            this.drawPoint(points[i], color)
        }
    }

    /**
     * @param {Point3} point
     * @param {string | JsonTextComponent} text
     * @param {number} [time]
     * @param {Array<string>} [tags]
     * @returns {(typeof Debug)['enabled'] extends true ? TextDisplay : null}
     */
    label(point, text, time = 30000, tags = []) {
        if (!Debug.enabled) { return null }

        /** @type {TextDisplayEntityData} */
        const data = {
            billboard: 'center',
            text: JSON.stringify((typeof text === 'string') ? { text: text } : text),
            see_through: true,
        }

        for (const other of Object.values(TextDisplay.registry)) {
            if (other.equals({ _options: data, _position: point })) {
                other.touch()
                // @ts-ignore
                return other
            }
        }

        // @ts-ignore
        return new TextDisplay(this._bot.commands, {
            data: data,
            maxIdleTime: time,
            position: point,
            tags: tags,
        })
    }

    /**
     * @param {Point3} point
     * @param {string | BlockDisplayEntityData['block_state']} block
     * @param {number} [time]
     * @param {Array<string>} [tags]
     * @param {DisplayEntityData['transformation']} [transformation]
     * @returns {(typeof Debug)['enabled'] extends true ? BlockDisplay : null}
     */
    block(point, block, time = 30000, tags = [], transformation = undefined) {
        if (!Debug.enabled) { return null }

        const data = {
            block_state: (typeof block === 'string') ? { Name: block } : block,
            transformation: transformation,
        }

        for (const other of Object.values(BlockDisplay.registry)) {
            if (other.equals({ _options: data, _position: new Vec3(point.x, point.y, point.z) })) {
                other.touch()
                // @ts-ignore
                return other
            }
        }

        // @ts-ignore
        return new BlockDisplay(this._bot.commands, {
            data: data,
            position: point,
            maxIdleTime: time,
            tags: tags,
        })
    }

    /**
     * @param {Point3} point
     * @param {string} item
     * @param {number} [time]
     * @param {Array<string>} [tags]
     * @returns {(typeof Debug)['enabled'] extends true ? ItemDisplay : null}
     */
    item(point, item, time = 30000, tags = []) {
        if (!Debug.enabled) { return null }

        // @ts-ignore
        return new ItemDisplay(this._bot.commands, {
            data: {
                item: {
                    id: item,
                },
            },
            position: point,
            maxIdleTime: time,
            tags: tags,
        })
    }

    tick() {
        if (!Debug.enabled) { return }

        if (this._isFirstTick) {
            this._isFirstTick = false
            this.disposeAll()
        }

        TextDisplay.tick(this._bot)
        BlockDisplay.tick(this._bot)
        ItemDisplay.tick(this._bot)

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

    disposeAll() {
        TextDisplay.disposeAll(this._bot.commands)
        BlockDisplay.disposeAll(this._bot.commands)
    }
}
