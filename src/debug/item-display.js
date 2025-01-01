'use strict'

const Commands = require('../commands')
const DisplayEntity = require('./display-entity')

module.exports = class ItemDisplay extends DisplayEntity {
    /**
     * @private @readonly
     * @type {Record<string, ItemDisplay>}
     */
    static _registry = {}

    /**
     * @readonly
     * @type {Readonly<Record<string, ItemDisplay>>}
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
        commands.sendAsync(`/kill @e[type=item_display,limit=1,nbt={Tags:["debug"]}]`).catch(() => { })
        for (const uuid in this._registry) {
            const element = this._registry[uuid]
            element._disposed = true
            delete this._registry[uuid]
        }
    }

    /**
     * @param {Commands} commands
     * @param {import('./display-entity').DisplayEntityOptions<import('./debug').ItemDisplayEntityData>} options
     */
    constructor(commands, options) {
        super(commands, 'item_display', options)
        ItemDisplay._registry[this._nonce] = this
    }
}
