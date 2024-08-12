const BruhBot = require('./bruh-bot')
const config = require('../config.js')
const path = require('path')
const Environment = require('./environment')

const environment = new Environment(path.join(config.worldPath, 'environment.json'))

const usernames = [
    'Bruh',
    'mr',
    'silly',
    'hi',
    'uwu',
]

const botCount = 1

for (let i = 0; i < Math.min(botCount, usernames.length); i++) {
    new BruhBot({
        ...config,
        environment: environment,
        bot: {
            username: usernames[i]
        },
    })
}
