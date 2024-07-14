const BruhBot = require('./bruh-bot')
const config = require('./config')

new BruhBot({
    ...config,
    autoHarvest: true,
    pickupItemDistance: 10,
    autoSmeltItems: true,
    idleLooking: true,
}, 'Bruh', 'Bruh')
