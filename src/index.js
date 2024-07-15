const BruhBot = require('./bruh-bot')
const config = require('../config')
const path = require('path')

const worldsPath = path.join(__dirname, '..', 'worlds')
const worldName = 'flat'

new BruhBot({
    ...config,
    worldPath: path.join(worldsPath, worldName),
    bot: {
        username: 'Bruh'
    }
})
