const { hslToRgb } = require("../helpers")

// Starting address for writes
const REGISTER_RED = 0x0000

// Dims on undims the leds
const REGISTER_DIM = 0x0003

// Latches (ie. updates the PWM values) the color registers
const COIL_LATCH = 0x1000

async function writeValues(client, {hue, saturation, lightness}, preset) {
    const rgb = hslToRgb(hue/360, saturation/100, lightness/100)

    if (preset)
        rgb.push(0xF2FF)
    
    await client.writeRegisters(REGISTER_RED, rgb)

    if (!preset) {
        client.writeCoil(COIL_LATCH, 0xFF00)
    }
}

module.exports = {
    writeValues: writeValues
}