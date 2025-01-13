'use strict'

/** @type {import('mineflayer').Plugin} */
const plugin = function(bot) {
    // @ts-ignore
    bot.blocks = /** @type {import('./blocks').BlocksModule} */ ({
        stateIdAt(pos) { return bot.world.getBlockStateId(pos) },
        at(pos) { return bot.registry.blocksByStateId[this.stateIdAt(pos)] },

        lightAt(pos) { return bot.world.getBlockLight(pos) },
        skyLightAt(pos) { return bot.world.getSkyLight(pos) },
        biomeAt(pos) { return bot.world.getBiome(pos) },
    })
}

// @ts-ignore
plugin.pluginName = 'blocks-fast'

module.exports = plugin
