import ModbusRTU from "modbus-serial"

import { ModbusModuleInterface, LEDRGB } from "./ModbusModules"
import ModbusRequest from "./ModbusRequest";
import { sleep } from "../helpers";
import { ModbusWriteMultipleRegisters } from "./ModbusFunctions";

export default class ModbusHelper {
    client: ModbusRTU
    requests: ModbusRequest[] = []
    pendingRequest: boolean = false

    constructor(port: string, baud: number) {
        this.client = new ModbusRTU();

        this.client.connectRTUBuffered(port, {
            baudRate: baud
        })
    }

    getModule(modType: string): ModbusModuleInterface {
        return modules[modType]
    }

    async queue(request: ModbusRequest, wait: number=0): Promise<void> {
        if (wait > 0)
            await sleep(wait)

        this.requests.push(request)

        if (!this.pendingRequest)
            this.nextRequest()

        // console.log("New request, total: " + this.requests.length)
    }

    private async nextRequest(): Promise<void> {
        this.pendingRequest = true

        while (this.requests.length > 0) {
            const request = this.requests.pop()!

            try {
                await Promise.race([
                    request.schedule(this.client),
                    sleep(100, "timeout")
                ])
            }

            catch (reason) {
                if (reason == "timeout")
                    console.warn("\n" + request.modAddress + ": timeout in request: ", request.functions)

                else if (reason.modbusCode) {
                    switch (reason.modbusCode) {
                        // Device busy
                        case 6:
                            console.log("\n" + request.modAddress + ": Device busy, waiting 100ms...")
                            var mul = request.functions[0] as ModbusWriteMultipleRegisters
                            mul.values[3]++

                            this.queue(request, 100)
                        
                            break
    
                        default:
                            console.warn("\n" + request.modAddress + ": modbus exception "+reason.modbusCode+" in request: ", request.functions)
                    }
                }

                else
                    console.warn("\n" + request.modAddress + ": exception ", reason)
            }

            // console.log("Finished, total: " + this.requests.length, request.functions)
        }

        this.pendingRequest = false
    }
}

const modules: { [key: string]: ModbusModuleInterface } = {
    "LED-RGB": new LEDRGB()
}