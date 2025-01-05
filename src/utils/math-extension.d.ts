interface Point3 {
    x: number
    y: number
    z: number
}

interface Point2 {
    x: number
    y: number
}

interface Box {
    min: Point3
    max: Point3
}

interface Math {
    randomInt(min: number, max: number): number
    nonce(length: number = 8): string

    clamp(v: number, min: number, max: number): number
    lerp(a: number, b: number, t: number): number
    lerpDeg(a: number, b: number, t: number): number
    lerpRad(a: number, b: number, t: number): number
    lerpColor(a: readonly [number, number, number], b: readonly [number, number, number], t: number): [number, number, number]
    readonly rad2deg: number
    readonly deg2rad: number

    rotationToVector(pitchDeg: number, yawDeg: number): import('vec3').Vec3
    rotationToVectorRad(pitchRad: number, yawRad: number): import('vec3').Vec3
    vectorAngle(a: readonly Point2, b: readonly Point2): number

    distance(a: readonly Point3, b: readonly Point3): number
    distanceSquared(a: readonly Point3, b: readonly Point3): number

    boxDistance(point: readonly Point3, box: readonly Box): number
    boxDistanceSquared(point: readonly Point3, box: readonly Box): number

    entityDistance(
        a: Point3 | import('prismarine-entity').Entity,
        b: Point3 | import('prismarine-entity').Entity): number
    entityDistance(
        a: Point3 | import('prismarine-entity').Entity,
        b: Point3): number
    entityDistance(
        a: Point3,
        b: Point3 | import('prismarine-entity').Entity): number

    entityDistanceSquared(
        a: Point3 | import('prismarine-entity').Entity,
        b: Point3 | import('prismarine-entity').Entity): number
    entityDistanceSquared(
        a: Point3 | import('prismarine-entity').Entity,
        b: Point3): number
    entityDistanceSquared(
        a: Point3,
        b: Point3 | import('prismarine-entity').Entity): number
    
    lineDistance(point: readonly Point3, a: readonly Point3, b: readonly Point3): number
    lineDistanceSquared(point: readonly Point3, a: readonly Point3, b: readonly Point3): number

    rgb2hex(r: number, g: number, b: number): `#${string}`
}
