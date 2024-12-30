import { OptionsMasterGrade, Projectil } from 'minecrafthawkeye'
import { Pathfinder } from 'mineflayer-pathfinder'
import { Block } from 'prismarine-block'
import { Entity } from 'prismarine-entity'

declare module 'mineflayer' {
    interface Bot {
		readonly debug: import('./debug')
        // readonly viewer: viewer.ViewerAPI
		readonly hawkEye: import('minecrafthawkeye').HawkEye
		readonly pathfinder: Pathfinder
        // readonly webInventory: {
        //     options: Options
        //     isRunning: boolean
        //     start?: () => Promise<void>
        //     stop?: () => Promise<void>
        // }
		
		parseBedMetadata(block: Block): {
		    part: boolean;
		    occupied: number;
		    facing: number;
		    headOffset: Vec3;
		}

		jumpQueued: boolean
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

		auto_shot_stopped: (target: Entity | OptionsMasterGrade) => void;
		incoming_projectil: (projectile: Projectil, trajectory: Array<Vec3>) => void;
		target_aiming_at_you: (entity: Entity, trajectory: Array<Vec3>) => void;
	}
}
