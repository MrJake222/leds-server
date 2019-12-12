
import { ModbusFunctionInterface } from "./ModbusFunctions"
import ModbusRTU from "modbus-serial"

/**
 * Contains a single Modbus request. Request consists of
 * a slave address, and an array of @see ModbusFunctionInterface.
 * One @see ModbusRequest can be scheduled multple times.
 */
export default class ModbusRequest {
    modAddress: number
    functions: ModbusFunctionInterface[]

    constructor(modAddress: number, functions: ModbusFunctionInterface[]) {
        this.modAddress = modAddress
        this.functions = functions
    }

    /**
     * Schedules the modbus request, i.e. writes all
     * Functions to the given client instance
     * 
     * @param client @see ModbusRTU instance
     */
    async schedule(client: ModbusRTU): Promise<any> {
        var functions = [...this.functions]

        client.setID(this.modAddress)

        while (functions.length > 0) {
            const modbusFunction = functions.shift()

            await modbusFunction!.write(client)
        }
    }
}