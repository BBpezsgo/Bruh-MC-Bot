'use strict'

const { Vec3 } = require('vec3')
const Commands = require('./commands')
const { sleepG } = require('./utils/tasks')

/**
 * @typedef {{
 *   data: import('./debug').BlockDisplayEntityData;
 *   uuid?: string;
 *   position?: Point3;
 *   maxIdleTime?: number;
 *   tags?: ReadonlyArray<string>;
 * }} Options
 */

module.exports = class BlockDisplay {
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
     * @private @readonly
     * @type {number}
     */
    _maxIdleTime

    /**
     * @param {Commands} commands
     * @param {Options & { uuid: string; }} options
     */
    static ensure(commands, options) {
        if (!this._registry[options.uuid]) {
            return new BlockDisplay(commands, options)
        }
        return this._registry[options.uuid]
    }

    /**
     * @param {Commands} commands
     * @param {Options} options
     */
    constructor(commands, options) {
        this._commands = commands
        this._nonce = options.uuid ?? Math.nonce(8)
        this._lastEvent = performance.now()

        BlockDisplay._registry[this._nonce] = this

        const tags = ['debug', this._nonce]
        if (options.tags) { tags.push(...options.tags) }

        this._position = options.position ? new Vec3(options.position.x, options.position.y, options.position.z) : new Vec3(0, 0, 0)

        let command = `/summon minecraft:block_display`
        command += ' '
        command += `${this._position.x.toFixed(2)} ${this._position.y.toFixed(2)} ${this._position.z.toFixed(2)}`
        command += ' '
        command += JSON.stringify({
            Tags: tags,
            ...options.data,
        })
        this._commands.sendAsync(command).catch(() => { })

        this._selector = `@e[type=minecraft:block_display,limit=1,nbt={Tags:${JSON.stringify(tags)}}]`
        this._maxIdleTime = options.maxIdleTime ?? 5000
    }

    /**
     * @private @readonly
     * @type {string}
     */
    _selector

    /**
     * @type {Vec3}
     */
    _position

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
        this._commands.sendAsync(`/tp ${this._selector} ${rounded.x.toFixed(1)} ${rounded.y.toFixed(1)} ${rounded.z.toFixed(1)}`)
        return this
    }

    /**
     * @param {Vec3} scale
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
     *   scale?: Vec3;
     *   translation?: Vec3;
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

    /**
     * @private
     * @type {boolean | undefined}
     */
    _disposed
    dispose() {
        if (this._disposed) { return }
        this._commands.sendAsync(`/kill ${this._selector}`).catch(() => { })
        this._disposed = true
    }
}
