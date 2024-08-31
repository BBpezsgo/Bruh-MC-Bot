interface Math {
    lerp(a: number, b: number, t: number): number
    lerpDeg(a: number, b: number, t: number): number
    lerpRad(a: number, b: number, t: number): number
    lerpColor(a: readonly [number, number, number], b: readonly [number, number, number], t: number): [number, number, number]
    readonly rad2deg: number
    readonly deg2rad: number

    rotationToVector: (pitchDeg: number, yawDeg: number) => Vec3
    rotationToVectorRad: (pitchRad: number, yawRad: number) => Vec3

}