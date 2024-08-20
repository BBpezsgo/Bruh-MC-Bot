import { Vec3 } from 'vec3'
import BruhBot from './bruh-bot'

export type Task<TResult> = Generator<string | void, TResult, void>

export type SimpleTaskDef<TResult, TArgs> = (bot: BruhBot, args: TArgs) => Task<TResult>

export type TaskDef<TResult = void, TArgs extends {} = {}, TUtilities extends {} = {}> = {
    readonly task: (bot: BruhBot, args: CommonArgs<TArgs>) => Task<TResult>;
    readonly id: (args: TArgs) => string;
    readonly humanReadableId: (args: TArgs) => string;
    readonly definition?: import('./tasks').TaskId;
} & TUtilities

export type CommonArgs<TArgs extends {}> = TArgs & {
    onStatusMessage?: (message: string) => void;
    cancel?: () => Task<void>;
}
