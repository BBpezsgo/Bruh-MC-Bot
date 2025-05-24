import { Vec3 } from 'vec3'
import BruhBot from './bruh-bot'
import Interrupt from './utils/interrupt'
import ManagedTask from './managed-task'

interface IManagedTask {
    blur(): any
    focus(): any
    get priority(): number
}

export type Task<TResult> = Generator<void, TResult, void>

export type SimpleTaskDef<TResult = void, TArgs extends {} = {}> = (bot: BruhBot, args: RuntimeArgs<TArgs>) => Task<TResult>

export type TaskDef<TResult = void, TArgs extends {} = {}, TUtilities extends {} = {}> = {
    readonly task: (bot: BruhBot, args: RuntimeArgs<TArgs>) => Task<TResult>
    readonly id: string | ((args: TArgs) => string)
    readonly humanReadableId?: string | ((args: TArgs) => string)
    readonly definition?: import('./tasks').TaskId
} & TUtilities

export type CommonArgs<TArgs extends {}> = TArgs & {
    response?: import('./bruh-bot').ChatResponseHandler
    silent?: boolean
}

export type RuntimeArgs<TArgs extends {}> = TArgs & {
    response: import('./bruh-bot').ChatResponseHandler | null
    silent: boolean
    interrupt: Interrupt
    task: IManagedTask
    log: typeof console.log,
    warn: typeof console.warn,
    error: typeof console.error,
}
