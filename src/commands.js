'use strict'

/**
 * @param {string} message
 */
function makeCommandError(message) {
    const error = new Error(message)
    error.name = 'CommandError'
    return error
}

module.exports = class Commands {
    /**
     * @private @readonly
     * @type {import('mineflayer').Bot}
     */
    _bot

    /**
     * @private @readonly
     * @type {Array<{
     *   command: string;
     *   resolve: (result: any) => void;
     *   reject: (reason: any) => void;
     *   sentAt: number;
     *   responses: Array<import('prismarine-chat').ChatMessage>;
     * }>}
     */
    _queue

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
        this._waitForResponse = false
        this._bot.on('message', (message) => this.onMessage(message))
    }

    /**
     * @private
     * @param {import('prismarine-chat').ChatMessage} message
     */
    onMessage(message) {
        if (this._queue.length === 0) { return }
        if (!this._queue[0].sentAt) { return }

        /** @type {string | null} */
        let simple = (() => {
            if ('translate' in message.json) { return message.json.translate }

            if (!('extra' in message.json)) { return null }
            const extra = message.json.extra
            if (!(Array.isArray(extra))) { return null }
            if (extra.length !== 1) { return null }
            if (!('translate' in extra[0])) { return null }
            return extra[0].translate
        })()

        const commandName = this._queue[0].command.replace('/', '').split(' ')[0]
        switch (commandName) {
            case 'help':
                if (message.json?.['text']?.startsWith('/')) {
                    this._queue[0].responses.push(message)
                    return
                }
                break
            case 'kill':
                switch (simple) {
                    case 'commands.kill.success.single':
                        this._queue.shift().resolve('single')
                        return
                    case 'argument.entity.notfound.entity':
                        this._queue.shift().reject(makeCommandError(simple))
                        return
                }
                break
            case 'summon':
                switch (simple) {
                    case 'commands.summon.success':
                        this._queue.shift().resolve()
                        return
                }
                break
            case 'data':
                switch (simple) {
                    case 'commands.data.entity.modified':
                        this._queue.shift().resolve('modified')
                        return
                    case 'commands.data.merge.failed':
                        this._queue.shift().reject(makeCommandError('commands.data.merge.failed'))
                        return
                }
                break
            case 'tp':
                break
            default:
                console.error(`[Commands]: Unknown command "${commandName}"`)
                return
        }

        console.error(`[Commands]: Unknown response`, simple ?? message)
    }

    /**
     * @param {string} command
     * @returns {Promise<Array<import('prismarine-chat').ChatMessage>>}
     */
    sendAsync(command) {
        return new Promise((resolve, reject) => {
            this._queue.push({
                command: command,
                resolve: resolve,
                reject: reject,
                sentAt: 0,
                responses: [],
            })
        })
    }

    /**
     * @returns {Promise<Array<string>>}
     */
    async getCommands() {
        const res = await this.sendAsync('/help')
        if (!res) { return [] }
        return res.filter(v => v.json?.['text']).map(v => v.json['text'])
    }

    tick() {
        if (this._queue.length === 0) { return }

        if (this._queue[0].sentAt) {
            const t = performance.now() - this._queue[0].sentAt
            if (t > 100) {
                const done = this._queue.shift()
                done.resolve(done.responses)
            }
            return
        }

        if (this._waitForResponse) {
            const command = this._queue[0]
            command.sentAt = performance.now()
            this._bot.chat(command.command)
        } else {
            const command = this._queue.shift()
            command.sentAt = performance.now()
            command.resolve()
            this._bot.chat(command.command)
        }
    }
}
