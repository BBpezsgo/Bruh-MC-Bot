declare module 'prismarine-entity' {
    interface EntityMetadata extends Array<any> {
        0?: import('./entity-metadata').EntityMetadataBitmask
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
        6?: import('./entity-metadata').EntityPose
        /** Ticks frozen in powered snow */
        7?: number
    }

    interface Entity {
        readonly metadata: EntityMetadata
        time?: number
        spawnPosition?: import('vec3').Vec3
    }
}
