declare module 'prismarine-entity' {
    enum EntityMetadataBitmask {
        IsOnFire = 0x01,
        IsCrouching = 0x02,
        IsSprinting = 0x08,
        IsSwimming = 0x10,
        IsInvisible = 0x20,
        HasGlowingEffect = 0x40,
        IsFlyingWithElytra = 0x80,
    }

    enum EntityPose {
        STANDING = 0,
        FALL_FLYING = 1,
        SLEEPING = 2,
        SWIMMING = 3,
        SPIN_ATTACK = 4,
        SNEAKING = 5,
        LONG_JUMPING = 6,
        DYING = 7,
        CROAKING = 8,
        USING_TONGUE = 9,
        SITTING = 10,
        ROARING = 11,
        SNIFFING = 12,
        EMERGING = 13,
        DIGGING = 14,
    }

    interface EntityMetadata extends Array<object> {
        0?: bitmask
        /** Air ticks */
        1?: number
        /** Custom name */
        2?: string
        /** Custom name visible */
        3?: boolean
        /** Is silent */
        4?: boolean
        /** Has no gravity */
        5?: boolean
        /** Pose */
        6?: EntityPose
        /** Ticks frozen in powered snow */
        7?: number
    }

    interface Entity {
        readonly metadata: EntityMetadata
    }
}
