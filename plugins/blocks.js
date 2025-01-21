'use strict'

/** @type {import('mineflayer').Plugin} */
const plugin = function(bot) {
    // @ts-ignore
    bot.blocks = /** @type {import('./blocks').BlocksModule} */ ({
        // @ts-ignore
        stateIdAt(pos) { return bot.world.getBlockStateId(pos) },
        at(pos) { return bot.registry.blocksByStateId[this.stateIdAt(pos)] },
        // @ts-ignore
        lightAt(pos) { return bot.world.getBlockLight(pos) },
        // @ts-ignore
        skyLightAt(pos) { return bot.world.getSkyLight(pos) },
        // @ts-ignore
        biomeAt(pos) { return bot.world.getBiome(pos) },
        shapes(block) {
            // @ts-ignore
            let shapes = block.shapes
            // @ts-ignore
            if (block.stateShapes) {
                // @ts-ignore
                if (block.stateShapes[block.metadata]) {
                    // @ts-ignore
                    return block.stateShapes[block.metadata]
                } else {
                    // @ts-ignore
                    return block.stateShapes[0]
                }
            } else if (block.variations) {
                const variations = block.variations
                for (const i in variations) {
                    // @ts-ignore
                    if (variations[i].metadata === block.metadata) {
                        // @ts-ignore
                        shapes = variations[i].shapes
                    }
                }
            }
            return shapes
        }
    })
}

module.exports = plugin
