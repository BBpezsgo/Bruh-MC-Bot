export type GoalError = string | { inner: GoalError }

export type Result<TResult> = SuccessfulResult<TResult> | ErroredResult

export type SuccessfulResult<TResult> = { result: TResult }

export type ErroredResult = { error: GoalError }

