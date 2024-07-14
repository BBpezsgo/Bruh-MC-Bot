export type Result<T> = SuccessfulResult<T> | FailedResult

export type SuccessfulResult<T> = {
    result: T
}

export type FailedResult = {
    error: string
}
