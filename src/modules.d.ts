import { bot } from 'mineflayer'
import { Pathfinder } from 'mineflayer-pathfinder'
import { Block } from 'prismarine-block'
import * as viewer from 'prismarine-viewer'

declare module 'mineflayer' {
    interface Bot {
        readonly collectBlock: collectblock.CollectBlock
        readonly viewer: viewer.ViewerAPI
		readonly pathfinder: Pathfinder
        readonly webInventory: {
            options: Options
            isRunning: boolean
            start?: () => Promise<void>
            stop?: () => Promise<void>
        }
		
		parseBedMetadata(block: Block): {
		    part: boolean;
		    occupied: number;
		    facing: number;
		    headOffset: Vec3;
		}
    }
    
	interface BotEvents {
		goal_reached: (goal: Goal) => void;
		path_update: (path: PartiallyComputedPath) => void;
		goal_updated: (goal: Goal, dynamic: boolean) => void;
		path_reset: (
			reason: 'goal_updated' | 'movements_updated' |
				'block_updated' | 'chunk_loaded' | 'goal_moved' | 'dig_error' |
				'no_scaffolding_blocks' | 'place_error' | 'stuck'
		) => void;
		path_stop: () => void;
	}
}
