declare var bots: Record<string, import('./bruh-bot')>

//#region https://stackoverflow.com/a/66939843/26883957

/**
 * Credits goes to https://stackoverflow.com/questions/50374908/transform-union-type-to-intersection-type/50375286#50375286
 */
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never

/**
 * Credits goes to https://github.com/microsoft/TypeScript/issues/13298#issuecomment-468114901
 */
type UnionToOvlds<U> = UnionToIntersection<U extends any ? (f: U) => void : never>

type PopUnion<U> = UnionToOvlds<U> extends (a: infer A) => void ? A : never

/**
 * Credits goes to https://stackoverflow.com/questions/53953814/typescript-check-if-a-type-is-a-union#comment-94748994
 */
type IsUnion<T> = [T] extends [UnionToIntersection<T>] ? false : true

type UnionToArray<T, A extends Array<unknown> = []> = IsUnion<T> extends true ? UnionToArray<Exclude<T, PopUnion<T>>, [PopUnion<T>, ...A]> : [T, ...A]

//#endregion

// interface ObjectConstructor {
//     keys<T extends { [key: string]: any }>(o: T): UnionToArray<keyof T>
//     entries<O extends { [s: string]: T; }, T>(o: O): Array<[keyof O, T]>
// }

class TypedPromise<TResult, TError = any> extends Promise<TResult> {
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = TResult, TResult2 = never>(onfulfilled?: ((value: TResult) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: TError) => TResult2 | PromiseLike<TResult2>) | undefined | null): TypedPromise<TResult1 | TResult2, TError>;

    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: TError) => TResult | PromiseLike<TResult>) | undefined | null): TypedPromise<TResult, TError>;
}

