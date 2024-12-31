'use strict'

const { Vec3 } = require('vec3')
const Commands = require('./commands')

module.exports = class TextDisplay {
    /**
     * @private @readonly
     * @type {Record<string, TextDisplay>}
     */
    static _registry = {}

    /**
     * @readonly
     * @type {Readonly<Record<string, TextDisplay>>}
     */
    static get registry() { return this._registry }

    /**
     * @param {import('./bruh-bot')} bot
     */
    static tick(bot) {
        for (const uuid in this._registry) {
            const element = this._registry[uuid]
            if (!element || (performance.now() - element._lastEvent) > element._maxIdleTime) {
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
    /**
     * @readonly @private
     * @type {number}
     */
    _maxIdleTime

    /**
     * @param {Commands} commands
     * @param {string} uuid
     */
    static ensure(commands, uuid) {
        if (!this._registry[uuid]) {
            return new TextDisplay(commands, {
                uuid: uuid,
                data: {

                },
            })
        }
        return this._registry[uuid]
    }

    /**
     * @param {Commands} commands
     * @param {{
     *   uuid?: string;
     *   position?: Point3;
     *   maxIdleTime?: number;
     *   tags?: Array<string>;
     *   data: import('./debug').TextDisplayEntityData;
     * }} [options]
     */
    constructor(commands, options = { data: { } }) {
        this._commands = commands
        this._nonce = options.uuid ?? Math.nonce(8)
        this._lastEvent = performance.now()
        this._lockOn = null

        TextDisplay._registry[this._nonce] = this

        const tags = ['debug', this._nonce]
        if (options.tags) { tags.push(...options.tags) }

        this._position = options.position ? new Vec3(options.position.x, options.position.y, options.position.z) : new Vec3(0, 0, 0)

        options.data.text ??= { text: '' }
        options.data.billboard ??= 'center'

        this._text = JSON.stringify(options.data.text)

        let command = `/summon minecraft:text_display`
        command += ' '
        command += `${this._position.x.toFixed(2)} ${this._position.y.toFixed(2)} ${this._position.z.toFixed(2)}`
        command += ' '
        command += JSON.stringify({
            Tags: tags,
            ...options.data,
            text: JSON.stringify(options.data.text),
        })

        this._commands.sendAsync(command).catch(() => { })

        this._selector = `@e[type=minecraft:text_display,limit=1,nbt={Tags:["debug","${this._nonce}"]}]`
        this._maxIdleTime = options.maxIdleTime ?? 2000
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
     * @type {Readonly<import('./debug').JsonTextComponent>}
     */
    get text() {
        this._lastEvent = performance.now()
        return this._text ? JSON.parse(this._text) : ''
    }
    set text(value) {
        this._lastEvent = performance.now()
        const json = JSON.stringify(value)
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
