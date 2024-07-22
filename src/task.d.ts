import { Vec3 } from 'vec3'
import BruhBot from './bruh-bot'

export type Task<TResult> = Generator<string | void, TResult, void>

export type SimpleTaskDef<TResult, TArgs, TError = any> = (bot: BruhBot, args: TArgs) => Task<TResult>

export type TaskDef<TResult, TArgs, TError = any> = {
    task: (bot: BruhBot, args: CommonArgs<TArgs>) => Task<TResult>;
    id: (args: TArgs) => string;
    humanReadableId: (args: TArgs) => string;
}

export type CommonArgs<TArgs> = TArgs extends object ? (TArgs & {
    onStatusMessage?: (message: string) => void
}) : TArgs
