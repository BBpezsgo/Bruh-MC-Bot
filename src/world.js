const fs = require('fs')
const path = require('path')

/**
 * @hideconstructor
 */
module.exports = class World {
    /**
     * @param {string} name
     */
    static backup(name) {
        const worldsFolder = path.join(__dirname, '..', 'worlds')
        const backupName = `backup__${name}`

        if (!fs.existsSync(path.join(worldsFolder, name))) {
            console.warn(`World "${name}" does not exists`)
            return
        }

        if (!fs.existsSync(path.join(worldsFolder, backupName))) {
            fs.mkdirSync(path.join(worldsFolder, backupName), { recursive: true })
        }

        const files = fs.readdirSync(path.join(worldsFolder, name), { encoding: 'utf8', recursive: false })
        for (const file of files) {
            fs.copyFileSync(path.join(worldsFolder, name, file), path.join(worldsFolder, backupName, file))
        }

        console.log(`World backup "${name}" done`)
    }

    /**
     * @param {string} name
     * @param {{ [filename: string]: any }} data
     */
    static save(name, data) {
        const folder = path.join(__dirname, '..', 'worlds', name)

        if (!fs.existsSync(folder)) {
            fs.mkdirSync(folder, { recursive: true })
        }

        for (const key in data) {
            fs.writeFileSync(path.join(folder, `${key}.json`), JSON.stringify(data[key], null, '  '), 'utf8')
        }

        console.log(`World "${name}" saved`)
    }

    /**
     * @param {string} name
     * @returns {{ [filename: string]: any } | null}
     */
    static load(name) {
        const folder = path.join(__dirname, '..', 'worlds', name)

        if (!fs.existsSync(folder)) {
            console.log(`World "${name}" doesn not exists`)
            return null
        }

        const files = fs.readdirSync(folder, { encoding: 'utf8', recursive: false })

        /**
         * @type {{ [filename: string]: any }}
         */
        const result = { }

        for (const file of files) {
            const name = file.replace('.json', '')
            result[name] = JSON.parse(fs.readFileSync(path.join(folder, file), 'utf8'))
        }

        console.log(`World "${name}" loaded`)
        return result
    }
}
