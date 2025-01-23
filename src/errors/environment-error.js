const GameError = require("./game-error")

module.exports = class EnvironmentError extends GameError {
    /**
     * @param {string} message
     * @param {ErrorOptions} [options]
     */
    constructor(message, options) {
        super(message, options)
    }
}
