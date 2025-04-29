// @ts-nocheck
'use strict'

/** @type {import('mineflayer').Plugin} */
const plugin = function(bot) {
    bot.blocks = /** @type {import('./blocks').BlocksModule} */ ({
        stateIdAt(pos) { return bot.world.getBlockStateId(pos) },
        at(pos) { return bot.registry.blocksByStateId[this.stateIdAt(pos)] },
        lightAt(pos) { return bot.world.getBlockLight(pos) },
        skyLightAt(pos) { return bot.world.getSkyLight(pos) },
        biomeAt(pos) { return bot.world.getBiome(pos) },
        shapes(block) {
            let shapes = block.shapes
            if (block.stateShapes) {
                if (block.stateShapes[block.metadata]) {
                    return block.stateShapes[block.metadata]
                } else {
                    return block.stateShapes[0]
                }
            } else if (block.variations) {
                const variations = block.variations
                for (const i in variations) {
                    if (variations[i].metadata === block.metadata) {
                        shapes = variations[i].shapes
                    }
                }
            }
            return shapes
        }
    })
}

module.exports = plugin
