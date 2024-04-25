const BruhBot = require('./bruh-bot')
const config = require('./config')

/**
 * @type {{ [arg: string]: string }}
 */
let args = {
    world: 'Bruh',
    name: 'Bruh',
    ah: 'true',
    ap: 'true',
    as: 'true',
    il: 'true',
}

for (let i = 0; i < process.argv.length; i++) {
    const arg = process.argv[i]
    if (arg.includes('=')) {
        const a = arg.split('=')[0]
        const b = arg.split('=')[1]
        args[a] = b
    } else {
        args[arg] = ''
    }
}

new BruhBot({
    ...config,
    autoHarvest: args['ah'] ? true : false,
    autoPickUpItems: args['ap'] ? true : false,
    autoSmeltItems: args['as'] ? true : false,
    idleLooking: args['il'] ? true : false,
}, args['world'], args['name']);
