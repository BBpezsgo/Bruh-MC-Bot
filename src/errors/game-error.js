module.exports = class GameError extends Error {
    /**
     * @param {string} message
     * @param {ErrorOptions} [options]
     */
    constructor(message, options) {
        super(message, options)
    }
}
