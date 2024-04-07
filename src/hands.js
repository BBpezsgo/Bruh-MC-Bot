module.exports = class Hands {
    /**
     * @private
     * @type {boolean}
     */
    static _isLeftActive
    
    /**
     * @private
     * @type {boolean}
     */
    static _isRightActive

    /**
     * @private
     * @type {import('mineflayer').Bot}
     */
    static _bot

    static get isLeftActive() { return this._isLeftActive }
    static get isRightActive() { return this._isRightActive }

    /**
     * @param {import('mineflayer').Bot} bot
     */
    static init(bot) {
        this._bot = bot
        this._isLeftActive = false
        this._isRightActive = false
    }

    /**
     * @param {'right' | 'left'} hand
     */
    static activate(hand) {
        if (hand === 'right') {
            this._isRightActive = true
            this._bot.activateItem(false)
            return
        }

        if (hand === 'left') {
            this._isLeftActive = true
            this._bot.activateItem(true)
            return
        }

        throw new Error(`Invalid hand "${hand}"`)
    }

    static deactivate() {
        this._isLeftActive = false
        this._isRightActive = false
        this._bot.deactivateItem()
    }
}
