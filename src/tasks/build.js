const { Block } = require('prismarine-block')
const { wrap } = require('../utils/tasks')
const placeBlock = require('./place-block')
const { Vec3 } = require('vec3')

/**
 * @type {import('../task').TaskDef<void, {
 *   blocks: ReadonlyArray<{
 *     position: Vec3;
 *     name: string;
 *     properties: Record<string, any>;
 *     nbt: object;
 *   }>
 * }>}
 */
module.exports = {
    task: function*(bot, args) {
        const blocks = args.blocks.filter(v => {
            if (v.name === 'air') { return false }
            if (v.properties &&
                (v.name === 'white_bed' ||
                v.name === 'light_gray_bed' ||
                v.name === 'gray_bed' ||
                v.name === 'black_bed' ||
                v.name === 'brown_bed' ||
                v.name === 'red_bed' ||
                v.name === 'orange_bed' ||
                v.name === 'yellow_bed' ||
                v.name === 'lime_bed' ||
                v.name === 'green_bed' ||
                v.name === 'cyan_bed' ||
                v.name === 'light_blue_bed' ||
                v.name === 'blue_bed' ||
                v.name === 'purple_bed' ||
                v.name === 'magenta_bed' ||
                v.name === 'pink_bed')) {
                if (v.properties['part'] === 'head') { return false }
            }
            return true
        })

        /*
        const blockDisplays = []
        for (const block of structure.blocks) {
            yield
            const state = structure.palette[block.state]
            const position = new Vec3(block.pos[0], block.pos[1], block.pos[2])
            position.add(origin)
            blockDisplays.push(new BlockDisplay(bot.commands, {
                block: {
                    name: state.Name,
                    properties: state.Properties,
                },
                position: position,
                maxAge: 60000,
                tags: ['house'],
            }))
        }
        */

        /** @type {Record<string, number>} */
        const itemsToGive = {}
        for (const block of blocks) {
            const itemToGive = placeBlock.getCorrectItem(block.name)
            itemsToGive[itemToGive] ??= 0
            itemsToGive[itemToGive]++
        }

        yield* wrap(bot.commands.sendAsync(`/clear @p`))
        for (const itemName in itemsToGive) {
            yield* wrap(bot.commands.sendAsync(`/give @p ${itemName} ${itemsToGive[itemName]}`))
        }

        for (const block of blocks) {
            if (bot.bot.blockAt(block.position)?.name !== 'air') {
                yield* wrap(bot.commands.sendAsync(`/setblock ${block.position.x} ${block.position.y} ${block.position.z} minecraft:air`))
            }
        }

        /**
         * @param {Block | { name: string; properties: any; }} a
         * @param {Block | { name: string; properties: any; }} b
         */
        const areBlockEqual = (a, b) => {
            if (a.name !== b.name) { return false }
            const propA = (('properties' in a) ? a.properties : a.getProperties()) ?? {}
            const propB = (('properties' in b) ? b.properties : b.getProperties()) ?? {}

            if (Object.keys(propA).length !== Object.keys(propB).length) {
                return false
            }

            for (const key of Object.keys(propB)) {
                if ((propB[key] + '') !== (propA[key] + '')) {
                    return false
                }
            }

            return true
        }

        const remainingBlocks = [...blocks]

        remainingBlocks.reverse()

        while (remainingBlocks.length > 0) {
            yield
            const blockCountBefore = remainingBlocks.length
            let lastError = null
            for (let i = remainingBlocks.length - 1; i >= 0; i--) {
                const block = remainingBlocks[i]
                const alreadyHere = bot.bot.blockAt(block.position)

                if (areBlockEqual(block, alreadyHere)) {
                    remainingBlocks.splice(i, 1)
                    continue
                }

                try {
                    yield* placeBlock.task(bot, {
                        block: block.name,
                        position: block.position,
                        properties: block.properties,
                    })
                    remainingBlocks.splice(i, 1)
                } catch (error) {
                    lastError = error
                }
            }
            if (blockCountBefore === remainingBlocks.length) {
                throw lastError ?? `Failed`
            }
        }

        for (const block of blocks) {
            const alreadyHere = bot.bot.blockAt(block.position)
            if (!alreadyHere) { continue }
            if (areBlockEqual(alreadyHere, block)) { continue }
            debugger
            throw `Failed`
        }
    },
    id: function(args) {
        return `build`
    },
    humanReadableId: function(args) {
        return 'Build something'
    },
    definition: 'build',
}
