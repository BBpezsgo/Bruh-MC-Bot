import { bot } from 'mineflayer'
import * as collectblock from 'mineflayer-collectblock'

declare module 'mineflayer' {
    interface Bot {
        collectBlock: collectblock.CollectBlock
    }
}
