import { bot } from 'mineflayer'
import * as viewer from 'prismarine-viewer'

declare module 'mineflayer' {
    interface Bot {
        collectBlock: collectblock.CollectBlock
        viewer: viewer.ViewerAPI
    }
}
