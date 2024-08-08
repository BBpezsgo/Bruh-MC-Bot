const { Vec3 } = require("vec3")

module.exports = class Vec3Dimension {
    /**
     * @type {number}
     */
    x
    /**
     * @type {number}
     */
    y
    /**
     * @type {number}
     */
    z
    /**
     * @type {import("mineflayer").Dimension}
     */
    dimension

    /**
     * @param {Readonly<{ x: number; y: number; z: number; }>} point
     * @param {import("mineflayer").Dimension} dimension
     */
    constructor(point, dimension) {
        this.x = point.x
        this.y = point.y
        this.z = point.z
        this.dimension = dimension
    }

    /**
     * @param {Readonly<{ x: number; y: number; z: number; dimension?: string; }>} other
     */
    equals(other) {
        if (this.x !== other.x) { return false }
        if (this.y !== other.y) { return false }
        if (this.z !== other.z) { return false }
        if (other.dimension) {
            if (this.dimension !== other.dimension) { return false }
        }
        return true
    }

    clone() { return new Vec3Dimension({ x: this.x, y: this.y, z: this.z }, this.dimension) }

    /**
     * @param {import("mineflayer").Dimension} expectedDimension
     */
    xyz(expectedDimension) {
        if (expectedDimension !== this.dimension) {
            throw new Error(`Point is in an unexpected dimension`)
        }
        return new Vec3(this.x, this.y, this.z)
    }

    /**
     * @param {number} x
     * @param {number} y
     * @param {number} z
     */
    offset(x, y, z) { return new Vec3Dimension({ x: this.x + x, y: this.y + y, z: this.z + z }, this.dimension) }

    toString() {
        return `(${this.x} ${this.y} ${this.z})`
    }
}
