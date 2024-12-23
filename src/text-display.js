'use strict'

/**
 * @typedef {"black" |
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

const { Vec3 } = require('vec3')
const Commands = require('./commands')

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

module.exports = class TextDisplay {
    /**
     * @private @readonly
     * @type {Record<string, TextDisplay>}
     */
    static _registry = {}
    /**
     * @private
     * @type {boolean}
     */
    static _isFirstTick = true

    /**
     * @readonly
     * @type {Readonly<Record<string, TextDisplay>>}
     */
    static get registry() { return this._registry }

    /**
     * @param {import('./bruh-bot')} bot
     */
    static tick(bot) {
        if (this._isFirstTick) {
            this._isFirstTick = false
            this.disposeAll(bot.commands)
        }

        for (const uuid in this._registry) {
            const element = this._registry[uuid]
            if (!element || element.isDead) {
                element.dispose()
                delete this._registry[uuid]
                continue
            }
            if (element._lockOn) {
                const entity = bot.bot.entities[element._lockOn]
                if (!entity || !entity.isValid) {
                    element.dispose()
                    delete this._registry[uuid]
                    continue
                }
                element.setPosition(entity.position.offset(0, entity.height + 0.8, 0))
            }
        }
    }

    /**
     * @param {Commands} commands
     */
    static disposeAll(commands) {
        commands.sendAsync(`/kill @e[type=text_display,limit=1,nbt={Tags:["debug"]}]`).catch(() => { })
        for (const uuid in this._registry) {
            const element = this._registry[uuid]
            element._disposed = true
            delete this._registry[uuid]
        }
    }

    /**
     * @private @readonly
     * @type {Commands}
     */
    _commands
    /**
     * @private @readonly
     * @type {string}
     */
    _nonce
    /**
     * @private
     * @type {number}
     */
    _lastEvent

    get isDead() { return (performance.now() - this._lastEvent) > 2000 }

    /**
     * @param {Commands} commands
     * @param {string} uuid
     */
    static ensure(commands, uuid) {
        if (!this.registry[uuid]) {
            return new TextDisplay(commands, uuid)
        }
        return this.registry[uuid]
    }

    /**
     * @param {Commands} commands
     * @param {string} [uuid = null]
     */
    constructor(commands, uuid = null) {
        this._commands = commands
        this._nonce = uuid ?? Math.nonce(8)
        this._lastEvent = performance.now()
        this._lockOn = null

        TextDisplay._registry[this._nonce] = this

        this._commands.sendAsync(`/summon minecraft:text_display ~ ~2 ~ {billboard:"center",Tags:["debug","${this._nonce}"],text:'{"text":""}'}`).catch(() => { })
        this._selector = `@e[type=minecraft:text_display,limit=1,nbt={Tags:["debug","${this._nonce}"]}]`
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
        this._lastEvent = performance.now()
        return this._text ? JSON.parse(this._text.replace(/\\\'/g, '\'')) : ''
    }
    set text(value) {
        this._lastEvent = performance.now()
        const json = JSON.stringify(value).replace(/\'/g, '\\\'')
        if (this._text && this._text === json) { return }
        this._text = json
        this._commands.sendAsync(`/data modify entity ${this._selector} text set value '${json}'`).catch(() => { })
    }

    /**
     * @private
     * @type {Vec3}
     */
    _position

    /**
     * @private
     * @type {number | null}
     */
    _lockOn

    /**
     * @param {number | null} entityId
     */
    lockOn(entityId) {
        this._lastEvent = performance.now()
        this._lockOn = entityId
    }

    /**
     * @param {Readonly<{ x: number; y: number; z: number; }>} position
     * @returns {this}
     */
    setPosition(position) {
        this._lastEvent = performance.now()

        const precision = 10
        const rounded = new Vec3(
            Math.round(position.x * precision) / precision,
            Math.round(position.y * precision) / precision,
            Math.round(position.z * precision) / precision
        )
        if (this._position && this._position.equals(rounded)) { return this }
        this._position = rounded
        // this._commands.sendAsync(`/data modify entity ${this._selector} Pos set value [${rounded.x}d,${rounded.y}d,${rounded.z}d]`).catch(() => {})
        this._commands.sendAsync(`/tp ${this._selector} ${rounded.x} ${rounded.y} ${rounded.z}`)
        return this
    }

    /**
     * @private
     * @type {boolean}
     */
    _disposed
    dispose() {
        if (this._disposed) { return }
        this._commands.sendAsync(`/kill ${this._selector}`).catch(() => { })
        this._disposed = true
    }
}
