'use strict'

module.exports = class Commands {
    /**
     * @private @readonly
     * @type {import('mineflayer').Bot}
     */
    _bot

    /**
     * @private @readonly
     * @type {Array<{ command: string; resolve: (result: string | null) => void; reject: (reason: any) => void; }>}
     */
    _queue

    /**
     * @private
     * @type {number}
     */
    _isWaiting

    /**
     * @private
     * @type {boolean}
     */
    _waitForResponse

    /**
     * @param {import('mineflayer').Bot} bot
     */
    constructor(bot) {
        this._bot = bot
        this._queue = []
        this._isWaiting = 0
        this._waitForResponse = false
        this._bot.on('message', (message, location) => this.onMessage(message, location))
    }

    /**
     * @private
     * @param {import('prismarine-chat').ChatMessage} message
     * @param {string} location
     */
    onMessage(message, location) {
        if (!this._isWaiting) { return }
        if (this._queue.length === 0) { return }

        if ('translate' in message.json) {
            switch (message.json.translate) {
                case 'commands.kill.success.single':
                case 'commands.summon.success':
                case 'commands.data.entity.modified':
                case 'commands.particle.success':
                    this._queue.shift().resolve(message.json.translate)
                    this._isWaiting = 0
                    return
                default:
                    console.log(message.json.translate)    
                    break
            }
            return
        }

        if (!('extra' in message.json)) { return }
        const extra = message.json.extra
        if (!(Array.isArray(extra))) { return }
        if (extra.length !== 1) { return }
        if (!('translate' in extra[0])) { return }
        const msg = extra[0].translate
        switch (msg) {
            case 'argument.entity.notfound.entity':
            case 'commands.data.merge.failed':
                this._queue.shift().reject(msg)
                this._isWaiting = 0
                break
            default:
                console.log(msg)
                break
        }
    }

    /**
     * @param {string} command
     */
    sendAsync(command) {
        if (this._waitForResponse) {
            return new Promise((resolve, reject) => {
                this._queue.push({
                    command: command,
                    resolve: resolve,
                    reject: reject,
                })
            })
        } else {
            this._bot.chat(command)
            return Promise.resolve(null)
        }
    }

    tick() {
        if (this._isWaiting) {
            if (this._queue.length === 0) {
                this._isWaiting = 0
                return
            } else {
                const t = performance.now() - this._isWaiting
                if (t > 100) {
                    this._queue.shift().resolve(null)
                    this._isWaiting = 0
                }
                return
            }
        }
        if (this._queue.length === 0) { return }
        this._isWaiting = performance.now()
        const command = this._queue[0]
        this._bot.chat(command.command)
    }
}
