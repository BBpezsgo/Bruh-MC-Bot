const fs = require('fs')
const { exit } = require('process')
const StreamZip = require('node-stream-zip')
const minecraftData = require('minecraft-data')
const McData = require('./src/mc-data')
const MC = require('./src/mc')
const { filterHostiles } = require('./src/utils')

for (const entity of minecraftData('1.20.4').entitiesArray) {
    const hostileAttackDistance = {
        'creeper': 15,
        'zombie': 35,
        'skeleton': 16,
        'cave_spider': null,
        'endermite': null,
        'evoker': null,
        'hoglin': null,
        'magma_cube': null,
        'husk': null,
        'piglin': null,
        'piglin_brute': null,
        'pillager': null,
        'slime': null,
        'silverfish': null,
        'ravager': null,
        'spider': null,
        'stray': null,
        'zoglin': null,
        'wither_skeleton': null,
        'witch': null,
        'vindicator': null,
        'zombie_villager': null,
        'blaze': null,
        'drowned': null,
        'zombified_piglin': null,
    }[entity.name]
    if (hostileAttackDistance === undefined) {
        console.warn(entity.name)
    }
}

// new MC('1.20.4')

// new McData('D:/Program Files/LegacyLauncher/game/versions/Fabric 1.20.4/Fabric 1.20.4.jar')

/*
const csv = fs.readFileSync('C:/Users/bazsi/Desktop/BruhBot/table.csv', 'utf8')

let res = [

]

const link = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g
const note = /\[note [0-9]+\]/g

for (const line of csv.split('\n')) {
    let record = { }
    const cells = line.trim().split(',')
    for (let i = 0; i < cells.length; i++) {
        const cell = cells[i].trim()
        switch (i) {
            case 0:
                record['item'] = cell.replace(/"/g, '').replace(link, '').replace(note, '').trim()
                break
            case 1:
                record['burningTime'] = cell.replace(/"/g, '').replace(note, '').trim()
                break
            default:
                break
        }
    }
    if (record && record['item']) {
        res.push(record)
    }
}

fs.writeFileSync('table.json', JSON.stringify(res, null, '  '), 'utf8')
*/
