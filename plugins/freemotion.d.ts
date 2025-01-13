import { Plugin } from 'mineflayer'

declare module 'mineflayer' {
    interface Bot {
        readonly freemotion: {
            moveTowards(yaw: number): void
        }
    }
}

const plugin: Plugin
export default plugin
