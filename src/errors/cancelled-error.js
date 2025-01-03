module.exports = class CancelledError extends Error {
    constructor() {
        super('task cancelled')
    }
}
