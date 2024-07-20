const BruhBot = require('./bruh-bot')
const config = require('../config.js')
const path = require('path')
const Environment = require('./environment')

const environment = new Environment(path.join(config.worldPath, 'environment.json'))

new BruhBot({
    ...config,
    environment: environment,
    bot: {
        username: 'Bruh'
    }
})
