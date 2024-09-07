/**
 * @typedef {Exclude<keyof typeof this, 'prototype' | 'preloadAll'>} TaskId
 */

module.exports = class {
    /** @readonly */ static get attack() { return require('./tasks/attack') }
    /** @readonly */ static get bonemealing() { return require('./tasks/bonemealing') }
    /** @readonly */ static get build() { return require('./tasks/build') }
    /** @readonly */ static get breed() { return require('./tasks/breed') }
    /** @readonly */ static get clearMlgJunk() { return require('./tasks/clear-mlg-junk') }
    /** @readonly */ static get compost() { return require('./tasks/compost') }
    /** @readonly */ static get dig() { return require('./tasks/dig') }
    /** @readonly */ static get dumpToChest() { return require('./tasks/dump-to-chest') }
    /** @readonly */ static get eat() { return require('./tasks/eat') }
    /** @readonly */ static get enderpearlTo() { return require('./tasks/enderpearl-to') }
    /** @readonly */ static get fish() { return require('./tasks/fish') }
    /** @readonly */ static get followPlayer() { return require('./tasks/follow-player') }
    /** @readonly */ static get gatherItem() { return require('./tasks/gather-item') }
    /** @readonly */ static get giveAll() { return require('./tasks/give-all') }
    /** @readonly */ static get giveTo() { return require('./tasks/give-to') }
    /** @readonly */ static get goto() { return require('./tasks/goto') }
    /** @readonly */ static get harvest() { return require('./tasks/harvest') }
    /** @readonly */ static get kill() { return require('./tasks/kill') }
    /** @readonly */ static get mlg() { return require('./tasks/mlg') }
    /** @readonly */ static get pickupItem() { return require('./tasks/pickup-item') }
    /** @readonly */ static get pickupXp() { return require('./tasks/pickup-xp') }
    /** @readonly */ static get placeBlock() { return require('./tasks/place-block') }
    /** @readonly */ static get plantSeed() { return require('./tasks/plant-seed') }
    /** @readonly */ static get sleep() { return require('./tasks/sleep') }
    /** @readonly */ static get smelt() { return require('./tasks/smelt') }
    /** @readonly */ static get trade() { return require('./tasks/trade') }

    static preloadAll() {
        const properties = Object.getOwnPropertyDescriptors(this)
        for (const property in properties) {
            properties[property].get?.()
        }
    }
}
