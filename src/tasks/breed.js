const { basicRouteSearch } = require('../utils/other')
const { wrap } = require('../utils/tasks')
const goto = require('./goto')
/**
 * @type {Readonly<Record<string, ReadonlyArray<string>>>}
 */
const animalFoods = {
    'cow': ['wheat'],
    'sheep': ['wheat'],
    'moshroom': ['wheat'],
    'goat': ['wheat'],
    'pig': ['carrot', 'potato', 'beetroot'],
    'chicken': ['wheat_seeds', 'pumpkin_seeds', 'melon_seeds', 'beetroot_seeds', 'torchflower_seeds', 'pitcher_pod'],
    'llama': ['hay_bale'],
    'rabbit': ['dandelion', 'carrot'],
    'turtle': ['seagrass'],
    'panda': ['bamboo'],
}

/**
 * @type {import('../task').TaskDef<number, {
 *   animals: ReadonlyArray<import('prismarine-entity').Entity>;
 * }>}
 */
module.exports = {
    task: function*(bot, args) {
        if (args.animals.length === 0) {
            return 0
        }

        /**
         * @type {Record<string, Array<import('prismarine-entity').Entity>>}
         */
        const grouped = {

        }

        for (const animal of args.animals) {
            if (animal.metadata[16]) {
                continue
            }
            const breedTime = (bot.env.animalBreedTimes[animal.id] ?? 0)
            // 5 minutes
            if ((Date.now() - breedTime) < (1000 * 60 * 5)) {
                continue
            }
            grouped[animal.name] ??= []
            grouped[animal.name].push(animal)
        }

        let feeded = 0

        for (const animalType in grouped) {
            const groupedAnimals = grouped[animalType]

            if (groupedAnimals.length < 2) {
                console.warn(`[Bot "${bot.username}"] Too few animals to breed (${groupedAnimals.length}), skipping ...`)
                continue
            }

            if (groupedAnimals.length % 2) {
                console.warn(`[Bot "${bot.username}"] Odd number of animals to breed (${groupedAnimals.length}), will skip one ...`)
                groupedAnimals.splice(0, 1)
            }

            const animals = basicRouteSearch(bot.bot.entity.position, groupedAnimals, v => v.position).toArray()

            const foods = animalFoods[animalType]
            if (!foods) {
                throw `I don't know what to feed to ${animalType}`
            }

            let food
            let foodCount = 0

            for (const _food of foods) {
                let _foodCount = bot.inventoryItemCount(null, { name: _food })

                if (_foodCount >= animals.length) {
                    foodCount = _foodCount
                    food = _food
                    break
                }

                yield* bot.ensureItem(_food, animals.length)

                _foodCount = bot.inventoryItemCount(null, { name: _food })

                if (_foodCount >= animals.length) {
                    foodCount = _foodCount
                    food = _food
                    break
                }

                if (_foodCount > foodCount) {
                    foodCount = _foodCount
                    food = _food
                }
            }

            if (!food) {
                throw `I don't have enough food`
            }

            if (foodCount < 2) {
                throw `I don't have enough ${food} (${foodCount})`
            }

            if (foodCount < animals.length) {
                console.warn(`[Bot "${bot.username}"] I have too few ${food} (${foodCount} and need ${animals.length})`)
            }

            for (const animal of animals) {
                yield* goto.task(bot, {
                    entity: animal,
                    distance: 4,
                })
                yield* wrap(bot.bot.equip(bot.mc.registry.itemsByName[food].id, 'hand'))
                yield* wrap(bot.bot.activateEntity(animal))
                const distance = Math.entityDistance(bot.bot.entity.position, animal)
                if (distance < 4) {
                    bot.env.animalBreedTimes[animal.id] = Date.now()
                    feeded++
                }
            }
        }

        return feeded
    },
    id: function(args) {
        if (args.animals.length > 5) {
            return `breed-${args.animals.slice(0, 5).map(v => v.name).join('-')}-${args.animals.length - 5}...`
        } else {
            return `breed-${args.animals.map(v => v.name).join('-')}`
        }
    },
    humanReadableId: function(args) { return `Breed` },
    definition: 'breed',
}
