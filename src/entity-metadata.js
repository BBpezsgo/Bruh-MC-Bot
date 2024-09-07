/**
 * @enum {number}
 */
const EntityMetadataBitmask = Object.freeze({
    /** @readonly */ IsOnFire: 0x01,
    /** @readonly */ IsCrouching: 0x02,
    /** @readonly */ IsSprinting: 0x08,
    /** @readonly */ IsSwimming: 0x10,
    /** @readonly */ IsInvisible: 0x20,
    /** @readonly */ HasGlowingEffect: 0x40,
    /** @readonly */ IsFlyingWithElytra: 0x80,
})

/**
 * @enum {number}
 */
const EntityPose = Object.freeze({
    /** @readonly */ STANDING: 0,
    /** @readonly */ FALL_FLYING: 1,
    /** @readonly */ SLEEPING: 2,
    /** @readonly */ SWIMMING: 3,
    /** @readonly */ SPIN_ATTACK: 4,
    /** @readonly */ SNEAKING: 5,
    /** @readonly */ LONG_JUMPING: 6,
    /** @readonly */ DYING: 7,
    /** @readonly */ CROAKING: 8,
    /** @readonly */ USING_TONGUE: 9,
    /** @readonly */ SITTING: 10,
    /** @readonly */ ROARING: 11,
    /** @readonly */ SNIFFING: 12,
    /** @readonly */ EMERGING: 13,
    /** @readonly */ DIGGING: 14,
})

module.exports = {
    EntityMetadataBitmask,
    EntityPose,
}
