const path = require('path')
const fs = require('fs')
const JSON5 = require('json5')
const { ensureSemantics } = require('./serializing')

/**
 * @returns {Readonly<{
 *   [key: string]: any;
 *   dataPath: string;
 * }>}
 */
function config() {
    const configPath = path.join(__dirname, '..', 'config.json')
    if (!fs.existsSync(configPath)) {
        throw new Error(`Config file does not exists`)
    }
    const configData = fs.readFileSync(configPath, 'utf8')
    const json = JSON5.parse(configData)
    ensureSemantics(json, {
        type: 'object',
        value: {
            bot: {
                type: 'object',
                value: {
                    host: 'string',
                    port: 'number',
                    username: 'string',
                },
            },
            minecraft: {
                type: 'object',
                value: {
                    path: 'string'
                },
            },
        },
    })
    return Object.freeze({
        ...json,
        dataPath: path.join(__dirname, '..', 'data'),
    })
}

module.exports = config()
