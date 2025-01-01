import { OptionsMasterGrade, Projectil } from 'minecrafthawkeye'
import { BotOptions, Plugin } from 'mineflayer'
import { Pathfinder } from 'mineflayer-pathfinder'
import { Block } from 'prismarine-block'
import { Entity } from 'prismarine-entity'
import { Vec3 } from 'vec3'

declare module 'mineflayer' {
    interface Bot {
        readonly freemotion: {
            moveTowards(yaw: number): void
        }
    }
}

const plugin: Plugin
export default plugin
