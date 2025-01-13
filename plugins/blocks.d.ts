import { Plugin } from 'mineflayer'
import { Vec3 } from 'vec3'
import Minecraft from 'minecraft-data'

export interface BlocksModule {
    at(pos: Vec3): Minecraft.IndexedBlock
    lightAt(pos: Vec3): number
    stateIdAt(pos: Vec3): number
    skyLightAt(pos: Vec3): number
    biomeAt(pos: Vec3): number
}

declare module 'mineflayer' {
    interface Bot {
        readonly blocks: BlocksModule
    }
}

const plugin: Plugin
export default plugin
