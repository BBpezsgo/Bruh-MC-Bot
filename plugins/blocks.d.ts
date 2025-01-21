import { Plugin } from 'mineflayer'
import { Vec3 } from 'vec3'
import Minecraft from 'minecraft-data'

export interface BlocksModule {
    at(pos: Point3): Minecraft.IndexedBlock
    lightAt(pos: Point3): number
    stateIdAt(pos: Point3): number
    skyLightAt(pos: Point3): number
    biomeAt(pos: Point3): number
    shapes(block: Minecraft.IndexedBlock): ReadonlyArray<import('prismarine-block').Shape>
}

declare module 'mineflayer' {
    interface Bot {
        readonly blocks: BlocksModule
    }
}

const plugin: Plugin
export default plugin
