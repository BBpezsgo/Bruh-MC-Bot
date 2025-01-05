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
    /** @protected @readonly @type {import('./debug').DisplayEntityData} */ _options

    /**
     * @param {number} data
     */
    static stringifyNumber(data) {
        let result = ''
        result += data.toFixed(2)
        while (result.endsWith('0')) {
            result = result.substring(0, result.length - 1)
        }
        if (result.endsWith('.')) {
            result = result.substring(0, result.length - 1)
        }
        return result
    }

    /**
     * @param {unknown} data
     */
    static stringifyJsonData(data) {
        let result = ''
        switch (typeof data) {
            case 'boolean':
                return data ? '1b' : '0b'
            case 'number':
                return DisplayEntity.stringifyNumber(data) + 'f'
            case 'string':
                return JSON.stringify(data)
            case 'object':
                if (Array.isArray(data)) {
                    result += '['
                    let addComma = false
                    for (const item of data) {
                        // @ts-ignore
                        const dataString = this.stringifyJsonData(item)
                        if (dataString) {
                            if (addComma) result += ','
                            result += dataString
                            addComma = true
                        }
                    }
                    result += ']'
                } else {
                    result += '{'
                    let addComma = false
                    for (const key in data) {
                        // @ts-ignore
                        const dataString = this.stringifyJsonData(data[key])
                        if (dataString) {
                            if (addComma) result += ','
                            result += key
                            result += ':'
                            result += dataString
                            addComma = true
                        }
                    }
                    result += '}'
                }
                return result
            default:
                return null
        }
    }

    /**
     * @param {Commands} commands
     * @param {string} entityName
     * @param {DisplayEntityOptions<import('./debug').DisplayEntityData>} [options]
     */
    constructor(commands, entityName, options = { data: {} }) {
        this._commands = commands
        this._position = options.position ? new Vec3(options.position.x, options.position.y, options.position.z) : new Vec3(0, 0, 0)
        this._nonce = options.uuid ?? Math.nonce(8)
        this._lastEvent = performance.now()
        const tags = ['debug', this._nonce]
        if (options.tags) { tags.push(...options.tags) }
        this._maxIdleTime = options.maxIdleTime ?? 2000
        this._options = options.data
        this._selector = `@e[type=${entityName},limit=1,nbt={Tags:["debug","${this._nonce}"]}]`

        let command = `/summon ${entityName}`
        command += ' '
        command += `${DisplayEntity.stringifyNumber(this._position.x)} ${DisplayEntity.stringifyNumber(this._position.y)} ${DisplayEntity.stringifyNumber(this._position.z)}`
        command += ' '
        command += DisplayEntity.stringifyJsonData({
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

    /**
     * @param {{
     *   _position: Point3;
     *   _options: import('./debug').DisplayEntityData;
     * }} other
     */
    equals(other) {
        return this._position.equals(new Vec3(other._position.x, other._position.y, other._position.z)) && JSON.stringify(this._options) === JSON.stringify(other._options)
    }

    touch() {
        this._lastEvent = performance.now()
    }
}
