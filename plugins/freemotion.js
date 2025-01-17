'use strict'

/** @type {import('mineflayer').Plugin} */
const plugin = function(bot) {
    // @ts-ignore
    bot.freemotion = /** @type {import('mineflayer').Bot['freemotion']} */ ({
        moveTowards(yaw) {
            let forward = false
            let back = false
            let left = false
            let right = false

            let diff = Math.round((yaw - bot.entity.yaw) * (180 / Math.PI))
            if (diff < -180) { diff += 360 }
            // +x   left
            // -x   right
            //  0   forward
            // -180 back

            if (Math.abs(diff) < 22.5) {
                forward = true
            } else if (Math.abs(diff) > 157.5) {
                back = true
            } else if (diff > 22.5 && diff < 67.5) {
                forward = true
                left = true
            } else if (diff > 67.5 && diff < 112.5) {
                left = true
            } else if (diff > 112.5 && diff < 157.5) {
                back = true
                left = true
            } else if (diff < -22.5 && diff > -67.5) {
                forward = true
                right = true
            } else if (diff < -67.5 && diff > -112.5) {
                right = true
            } else if (diff < -112.5 && diff > -157.5) {
                back = true
                right = true
            }

            bot.setControlState('forward', forward)
            bot.setControlState('back', back)
            bot.setControlState('left', left)
            bot.setControlState('right', right)
        }
    })
}

module.exports = plugin
