'use strict'

const Commands = require('../commands')
const DisplayEntity = require('./display-entity')

module.exports = class TextDisplay extends DisplayEntity {
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
     * @param {import('../bruh-bot')} bot
     */
    static tick(bot) {
        for (const uuid in this._registry) {
            const element = this._registry[uuid]
            if (!element || (performance.now() - element._lastEvent) > element._maxIdleTime) {
                element.dispose()
                delete this._registry[uuid]
                continue
            }
            element.tick(bot)
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
     * @param {Commands} commands
     * @param {import('./display-entity').DisplayEntityOptions<import('./debug').TextDisplayEntityData>} options
     */
    constructor(commands, options) {
        super(commands, 'text_display', {
            ...options,
            data: options.data,
        })
        this._text = options.data.text

        TextDisplay._registry[this._nonce] = this
    }

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
        return this._text ? JSON.parse(this._text) : { text: '' }
    }
    set text(value) {
        this._lastEvent = performance.now()
        const json = JSON.stringify(value)
        if (this._text && this._text === json) { return }
        this._text = json
        this._commands.sendAsync(`/data modify entity ${this._selector} text set value '${json}'`).catch(() => { })
    }
}
