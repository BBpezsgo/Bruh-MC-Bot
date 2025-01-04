// Source: https://github.com/milankarman/FastStronghold

/**
 * @typedef {{
 * x: number;
 * y: number;
 * z: number;
 * angle: number;
 * slope: number;
 * }} EnderPearlThrow
 */

/**
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} angle
 */
function makeThrow(x, y, z, angle) {
    return {
        x: x,
        y: y,
        z: z,
        angle: angle % 360,
        slope: Math.tan(-angle * Math.PI / 180),
    }
}

/**
 * Calculate the location of the stronghold using two points with angles
 * @param {EnderPearlThrow} a
 * @param {EnderPearlThrow} b
 * @returns {[number, number]}
 */
function getThrowIntersection(a, b) {
    /**
     * @param {EnderPearlThrow} point
     */
    const getLine = (point) => { return point.x - point.slope * point.z }

    const z = (getLine(b) - getLine(a)) / (a.slope - b.slope)
    const x = a.slope * z + getLine(a)

    return [x, z]
}

/**
 * Gets the angle from one point to the next
 * @param {Point3} a
 * @param {Point3} b
 */
function getAngleAToB(a, b) {
    let angle = (Math.atan2(a.x - b.x, a.z - b.z))
    angle = (-(angle / Math.PI) * 360.0) / 2.0 + 180.0

    if (angle > 180) {
        angle = -180 + (angle - 180)
    }

    return angle
}

/**
 * Gets the distance from one point to another
 * @param {Point3} a
 * @param {Point3} b
 */
function getDistanceBetweenPoints(a, b) {
    const xDistance = a.x - b.x
    const yDistance = a.y - b.y
    const zDistance = a.z - b.z
    return Math.sqrt(Math.pow(xDistance, 2) + Math.pow(yDistance, 2) + Math.pow(zDistance, 2))
}

/**
 * Takes a point and angle and returns the coordinates of where it intersects with a circle of the given radius
 * This formula is thanks to Sharpieman20 (https://github.com/Sharpieman20/Sharpies-Speedrunning-Tools)
 * @param {EnderPearlThrow} point
 * @param {number} radius
 * @returns {[number, number]}
 */
function getLineIntersectionOnCircle(point, radius) {
    const x = point.x
    const z = point.z
    let angle = point.angle

    if (angle < 0) {
        angle += 360
    }

    angle -= 180

    const d = 90 - angle

    const x1 = x / 8
    const z1 = z / 8
    const r = d * (Math.PI / 180)

    const m1 = -1 * Math.tan(r)
    const a = 1 + (m1 * m1)
    const b1 = -1 * m1 * x1 + z1
    const b = 2 * m1 * b1
    const co = b1 * b1 - radius * radius

    const xp = (-b + (Math.sign(angle) * Math.sqrt(b * b - 4 * a * co))) / (2 * a)
    const zp = m1 * xp + b1

    return [xp, zp]
}

/**
 * @param {Point3} point
 * @param {number} radius
 * @returns {[number, number]}
 */
function findClosestPointInCircle(point, radius) {
    const magnitude = Math.sqrt(point.x * point.x + point.z * point.z)
    const x = point.x / magnitude * radius
    const z = point.z / magnitude * radius

    return [x, z]
}

/**
 * @type {ReadonlyArray<[number, number]>}
 */
const STRONGHOLD_RINGS = [
    [1408, 2688],
    [4480, 5760],
    [7552, 8832],
    [10624, 11904],
    [13696, 14976],
    [16768, 18048],
    [19840, 21120],
    [22912, 24192],
]

/**
 * @param {Array<EnderPearlThrow>} throws
 * @param {{
 *  x: number;
 *  y: number;
 *  z: number;
 *  angle: number;
 * }} _throw
 * @param {import("./bruh-bot").ChatResponseHandler} response
 */
function handleThrow(throws, _throw, response) {
    // Parse command into a point object with coordinates
    throws.push(makeThrow(_throw.x, _throw.y, _throw.z, _throw.angle));

    // If we have only done a single throw and no more, suggest nether travel coordinates
    if (throws.length == 1) {
        // Calculate where our current angle hits the average stronghold distance for nether travel
        const [x, z] = getLineIntersectionOnCircle(throws[0], 216);
        response.respond(`Suggested nether travel location: X:${Math.round(x)} Z:${Math.round(z)}`)
        return
    }

    // If we have done two throws, write out the second throw and triangulate using the two throws
    if (throws.length >= 2) {
        // Find the stronghold coordinates and print them
        let [x, z] = getThrowIntersection(throws[throws.length - 2], throws[throws.length - 1]);

        x = Math.round(x);
        z = Math.round(z);

        // Get the distance from 0, 0 to the stronghold to see if it falls in a stronghold ring
        const zeroDistance = getDistanceBetweenPoints({ x: 0, y: 0, z: 0 }, { x: x, y: 0, z: z });

        let inRing = false;

        // Check if the calculated stronghold location falls into a stronghold ring
        for (const range of STRONGHOLD_RINGS) {
            if (zeroDistance > range[0] && zeroDistance < range[1]) {
                inRing = true;
            }
        }

        if (!inRing) {
            response.respond(`Calculated coordinates are not in a stronghold ring.`)
        }

        // Check if the angle has changed more than 5 degrees or give a warning of potential innacuracy
        if ((throws[0].angle + 180) - (throws[1].angle + 180) < 5 && (throws[0].angle + 180) - (throws[1].angle + 180) > -5) {
            response.respond(`The angle changed very little, innacuracy likely.`)
        }

        // Changes to coordinates to be x4 z4 in its chunk, which is where the stronghold staircase generates
        {
            const xOffset = x % 16;
            const zOffset = z % 16;

            x = x - xOffset + (xOffset >= 0 ? 4 : -12);
            z = z - zOffset + (zOffset >= 0 ? 4 : -12);
        }

        response.respond(`Stronghold: X: ${Math.round(x)} Z: ${Math.round(z)}`)
    }
}

module.exports = handleThrow
