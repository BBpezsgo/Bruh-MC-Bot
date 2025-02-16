import { OptionsMasterGrade, Projectil } from 'minecrafthawkeye'
import { Pathfinder } from 'mineflayer-pathfinder'
import { Block } from 'prismarine-block'
import { Entity } from 'prismarine-entity'
import { Vec3 } from 'vec3'

declare module 'mineflayer' {
	interface Bot {
		readonly movement: import('mineflayer-movement').Movement
		readonly debug: import('./debug/debug')
		// readonly viewer: viewer.ViewerAPI
		readonly hawkEye: import('minecrafthawkeye').HawkEye
		readonly pathfinder: Pathfinder
		// readonly webInventory: {
		//     options: Options
		//     isRunning: boolean
		//     start?: () => Promise<void>
		//     stop?: () => Promise<void>
		// }
		jumpQueued: boolean

		_placeBlockWithOptions(referenceBlock: any, faceVector: any, options: any): Promise<void>
		parseBedMetadata(bedBlock: Block): {
			part: boolean;
			occupied: number;
			facing: number;
			headOffset: Vec3;
		}
		_playerFromUUID(uuid: string): any
		readonly uuidToUsername: any
		_genericPlace(referenceBlock: import("prismarine-block").Block, faceVector: import("vec3").Vec3, options: {
			half?: "top" | "bottom";
			delta?: import("vec3").Vec3;
			forceLook?: boolean | "ignore";
			offhand?: boolean;
			swingArm?: "right" | "left";
			showHand?: boolean;
		}): Promise<Vec3>
		jumpTicks: number
		jumpQueued: boolean
		placeEntityWithOptions(referenceBlock: import("prismarine-block").Block, faceVector: import("vec3").Vec3, options: {
			forceLook?: boolean | "ignore";
			offhand?: boolean;
			swingArm?: "right" | "left";
			showHand?: boolean;
		}): Promise<Entity>
		readonly QUICK_BAR_START: number
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

declare module 'prismarine-world' {
	export type RaycastResult = Block | (Block & {
		face: number
		intersect: Vec3
	})
}

declare module 'prismarine-item' {
	export type ItemComponents = {
		'attribute_modifiers': unknown
		'banner_patterns': unknown
		'base_color': unknown
		'bees': unknown
		'block_entity_data': unknown
		'block_state': unknown
		'blocks_attacks': unknown
		'break_sound': unknown
		'bucket_entity_data': unknown
		'bundle_contents': unknown
		'can_break': unknown
		'can_place_on': unknown
		'charged_projectiles': {
			projectiles: ReadonlyArray<{
				itemCount: number
				itemId: number02
				addedComponentCount: number
				removedComponentCount: number
				components: Array<any>
				removeComponents: Array<any>
			}>
		}
		'consumable': unknown
		'container': unknown
		'container_loot': unknown
		'custom_data': unknown
		'custom_model_data': unknown
		'custom_name': unknown
		'damage': number
		'damage_resistant': unknown
		'debug_stick_state': unknown
		'death_protection': unknown
		'dyed_color': unknown
		'enchantable': unknown
		'enchantment_glint_override': unknown
		'enchantments': {
			enchantments: [
				{
					id: number
					level: number
				}
			],
			showTooltip: true
		}
		'entity_data': unknown
		'equippable': unknown
		'firework_explosion': unknown
		'fireworks': unknown
		'food': unknown
		'glider': unknown
		'hide_additional_tooltip': unknown
		'hide_tooltip': unknown
		'instrument': unknown
		'intangible_projectile': unknown
		'item_model': unknown
		'item_name': unknown
		'jukebox_playable': unknown
		'lock': unknown
		'lodestone_tracker': unknown
		'lore': unknown
		'map_color': unknown
		'map_decorations': unknown
		'map_id': unknown
		'max_damage': unknown
		'max_stack_size': unknown
		'note_block_sound': unknown
		'ominous_bottle_amplifier': unknown
		'pot_decorations': unknown
		'potion_contents': {
			hasPotionId: boolean
			potionId: number
			hasCustomColor: boolean
			customColor: number
			customEffects: ReadonlyArray<{
				effect: number
				details: {
					amplifier: number
					duration: number
					ambient: boolean
					showParticles: boolean
					showIcon: boolean
					hiddenEffect: unknown
				}
			}>
		}
		'potion_duration_scale': unknown
		'profile': unknown
		'provides_banner_patterns': unknown
		'provides_trim_material': unknown
		'rarity': unknown
		'recipes': unknown
		'repairable': unknown
		'repair_cost': unknown
		'stored_enchantments': unknown
		'suspicious_stew_effects': {
			effects: ReadonlyArray<{
				effect: number
				duration: number
			}>
		}
		'tool': unknown
		'tooltip_display': unknown
		'tooltip_style': unknown
		'trim': unknown
		'unbreakable': unknown
		'use_cooldown': unknown
		'use_remainder': unknown
		'weapon': unknown
		'writable_book_content': unknown
		'written_book_content': unknown
	}

	export type ItemComponent<T extends keyof ItemComponents> = {
		type: T,
		data: ItemComponents[T],
	}

	export interface Item {
		components: ReadonlyArray<
			ItemComponent<'attribute_modifiers'> |
			ItemComponent<'banner_patterns'> |
			ItemComponent<'base_color'> |
			ItemComponent<'bees'> |
			ItemComponent<'block_entity_data'> |
			ItemComponent<'block_state'> |
			ItemComponent<'blocks_attacks'> |
			ItemComponent<'break_sound'> |
			ItemComponent<'bucket_entity_data'> |
			ItemComponent<'bundle_contents'> |
			ItemComponent<'can_break'> |
			ItemComponent<'can_place_on'> |
			ItemComponent<'charged_projectiles'> |
			ItemComponent<'consumable'> |
			ItemComponent<'container'> |
			ItemComponent<'container_loot'> |
			ItemComponent<'custom_data'> |
			ItemComponent<'custom_model_data'> |
			ItemComponent<'custom_name'> |
			ItemComponent<'damage'> |
			ItemComponent<'damage_resistant'> |
			ItemComponent<'debug_stick_state'> |
			ItemComponent<'death_protection'> |
			ItemComponent<'dyed_color'> |
			ItemComponent<'enchantable'> |
			ItemComponent<'enchantment_glint_override'> |
			ItemComponent<'enchantments'> |
			ItemComponent<'entity_data'> |
			ItemComponent<'equippable'> |
			ItemComponent<'firework_explosion'> |
			ItemComponent<'fireworks'> |
			ItemComponent<'food'> |
			ItemComponent<'glider'> |
			ItemComponent<'hide_additional_tooltip'> |
			ItemComponent<'hide_tooltip'> |
			ItemComponent<'instrument'> |
			ItemComponent<'intangible_projectile'> |
			ItemComponent<'item_model'> |
			ItemComponent<'item_name'> |
			ItemComponent<'jukebox_playable'> |
			ItemComponent<'lock'> |
			ItemComponent<'lodestone_tracker'> |
			ItemComponent<'lore'> |
			ItemComponent<'map_color'> |
			ItemComponent<'map_decorations'> |
			ItemComponent<'map_id'> |
			ItemComponent<'max_damage'> |
			ItemComponent<'max_stack_size'> |
			ItemComponent<'note_block_sound'> |
			ItemComponent<'ominous_bottle_amplifier'> |
			ItemComponent<'pot_decorations'> |
			ItemComponent<'potion_contents'> |
			ItemComponent<'potion_duration_scale'> |
			ItemComponent<'profile'> |
			ItemComponent<'provides_banner_patterns'> |
			ItemComponent<'provides_trim_material'> |
			ItemComponent<'rarity'> |
			ItemComponent<'recipes'> |
			ItemComponent<'repairable'> |
			ItemComponent<'repair_cost'> |
			ItemComponent<'stored_enchantments'> |
			ItemComponent<'suspicious_stew_effects'> |
			ItemComponent<'tool'> |
			ItemComponent<'tooltip_display'> |
			ItemComponent<'tooltip_style'> |
			ItemComponent<'trim'> |
			ItemComponent<'unbreakable'> |
			ItemComponent<'use_cooldown'> |
			ItemComponent<'use_remainder'> |
			ItemComponent<'weapon'> |
			ItemComponent<'writable_book_content'> |
			ItemComponent<'written_book_content'>
		>
	}
}
