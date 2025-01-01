const { Vec3 } = require('vec3')
const Commands = require('../commands')

/**
 * @template {import('./debug').DisplayEntityData} T
 * @typedef {{
 *   readonly uuid?: string;
 *   readonly position?: Point3;
 *   readonly maxIdleTime?: number;
 *   readonly tags?: ReadonlyArray<string>;
 *   readonly data: T;
 * }} DisplayEntityOptions
 */

/**
 * @abstract
 */
module.exports = class DisplayEntity {
    /** @protected @readonly @type {Commands} */ _commands
    /** @protected @readonly @type {string} */ _nonce
    /** @protected @type {number} */ _lastEvent
    /** @protected @readonly @type {number} */ _maxIdleTime
    /** @protected @readonly @type {string} */ _selector
    /** @protected @type {boolean} */ _disposed
    /** @protected @type {Vec3} */ _position
    /** @private @type {number | null} */ _lockOn

    /**
     * @param {Commands} commands
     * @param {string} entityName
     * @param {DisplayEntityOptions<import('./debug').DisplayEntityData>} [options]
     */
    constructor(commands, entityName, options = { data: { } }) {
        this._commands = commands
        this._position = options.position ? new Vec3(options.position.x, options.position.y, options.position.z) : new Vec3(0, 0, 0)
        this._nonce = options.uuid ?? Math.nonce(8)
        this._lastEvent = performance.now()
        const tags = ['debug', this._nonce]
        if (options.tags) { tags.push(...options.tags) }
        this._maxIdleTime = options.maxIdleTime ?? 2000
        this._selector = `@e[type=minecraft:${entityName},limit=1,nbt={Tags:["debug","${this._nonce}"]}]`

        let command = `/summon minecraft:text_display`
        command += ' '
        command += `${this._position.x.toFixed(2)} ${this._position.y.toFixed(2)} ${this._position.z.toFixed(2)}`
        command += ' '
        command += JSON.stringify({
            Tags: tags,
            ...options.data,
        })
        this._commands.sendAsync(command).catch(() => { })
    }

    /**
     * @param {import('../bruh-bot')} bot
     */
    tick(bot) {
        if (this._lockOn) {
            const entity = bot.bot.entities[this._lockOn]
            if (!entity || !entity.isValid) {
                this.dispose()
                return
            }
            this.setPosition(entity.position.offset(0, entity.height + 0.8, 0))
        }
    }

    dispose() {
        if (this._disposed) { return }
        this._commands.sendAsync(`/kill ${this._selector}`).catch(() => { })
        this._disposed = true
    }

    /**
     * @param {Readonly<Point3>} position
     * @returns {this}
     */
    setPosition(position) {
        this._lastEvent = performance.now()

        const precision = 10
        const rounded = new Vec3(
            Math.round(position.x * precision) / precision,
            Math.round(position.y * precision) / precision,
            Math.round(position.z * precision) / precision,
        )
        if (this._position && this._position.equals(rounded)) { return this }
        this._position = rounded
        // this._commands.sendAsync(`/data modify entity ${this._selector} Pos set value [${rounded.x}d,${rounded.y}d,${rounded.z}d]`).catch(() => {})
        this._commands.sendAsync(`/tp ${this._selector} ${rounded.x} ${rounded.y} ${rounded.z}`)
        return this
    }

    /**
     * @param {number | null} entityId
     */
    lockOn(entityId) {
        this._lastEvent = performance.now()
        this._lockOn = entityId
    }
}
