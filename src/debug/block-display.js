'use strict'

const Commands = require('../commands')
const { sleepG } = require('../utils/tasks')
const DisplayEntity = require('./display-entity')

module.exports = class BlockDisplay extends DisplayEntity {
    /**
     * @private @readonly
     * @type {Record<string, BlockDisplay>}
     */
    static _registry = {}

    /**
     * @readonly
     * @type {Readonly<Record<string, BlockDisplay>>}
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
        commands.sendAsync(`/kill @e[type=block_display,nbt={Tags:["debug"]}]`).catch(() => { })
        for (const uuid in this._registry) {
            const element = this._registry[uuid]
            element._disposed = true
            delete this._registry[uuid]
        }
    }

    /**
     * @param {Commands} commands
     * @param {import('./display-entity').DisplayEntityOptions<import('./debug').BlockDisplayEntityData>} options
     */
    constructor(commands, options) {
        super(commands, 'block_display', options)
        BlockDisplay._registry[this._nonce] = this
    }

    /**
     * @param {Point3} scale
     * @param {number} time
     */
    *transformScale(scale, time) {
        this._commands.sendAsync(`/data merge entity ${this._selector} ${JSON.stringify({
            start_interpolation: 0,
            interpolation_duration: (time / 1000) * 50,
            transformation: {
                left_rotation: [0, 0, 0, 1],
                right_rotation: [0, 0, 0, 1],
                translation: [0, 0, 0],
                scale: [scale.x, scale.y, scale.z],
            },
        })}`)
        yield* sleepG(time)
    }

    /**
     * @param {Commands} commands
     * @param {string} tag
     * @param {{
     *   scale?: Point3;
     *   translation?: Point3;
     * }} transformation
     * @param {number} time
     */
    static *transform(commands, tag, transformation, time) {
        const selector = `@e[type=minecraft:block_display,nbt={Tags:["${tag}"]}]`
        if (transformation.scale) {
            commands.sendAsync(`/execute as ${selector} run data merge entity @s {start_interpolation:0,interpolation_duration:20,transformation:{scale:[${transformation.scale.x}F,${transformation.scale.y}F,${transformation.scale.z}F]}}`)
        }
        if (transformation.translation) {
            commands.sendAsync(`/execute as ${selector} run data merge entity @s {start_interpolation:0,interpolation_duration:20,transformation:{translation:[${transformation.translation.x}F,${transformation.translation.y}F,${transformation.translation.z}F]}}`)
        }
        yield* sleepG(time)
    }
}
