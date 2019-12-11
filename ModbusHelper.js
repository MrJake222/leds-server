const ModbusRTU = require("modbus-serial");
const modules = require("./modules/modules")

module.exports = class ModbusHelper {
    constructor(port, baud) {
        this.client = new ModbusRTU();

        this.client.connectRTUBuffered(port, {
            baudRate: baud
        })
    }

    /**
     * This method decides which apply* to use
     * based on the codename given.
     * 
     * @param {*} modType Module's type (ex. LED-RGB).
     * @param {*} modAddress Mod address.
     * @param {*} values Values to be passed to modules/modType
     * @param {*} preset Applying preset or not
     */
    applyValues(modType, modAddress, values, preset) {
        const mod = modules[modType]

        this.client.setID(modAddress)
        mod.writeValues(this.client, values, preset)
    }
}