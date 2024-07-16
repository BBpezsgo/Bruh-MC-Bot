const BruhBot = require('./bruh-bot')
const config = require('../config.js')
const path = require('path')
const Environment = require('./environment')

const worldsPath = path.join(__dirname, '..', 'worlds')
const worldName = 'flat'

const environment = new Environment(path.join(worldsPath, worldName, 'environment.json'))

new BruhBot({
    ...config,
    worldPath: path.join(worldsPath, worldName),
    environment: environment,
    bot: {
        username: 'Bruh'
    }
})
