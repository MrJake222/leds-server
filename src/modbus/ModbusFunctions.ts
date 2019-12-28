import ModbusRTU from "modbus-serial"
import { WriteMultipleResult, WriteRegisterResult, WriteCoilResult, ReadRegisterResult } from "modbus-serial/ModbusRTU";

export type ModbusResult = ReadRegisterResult | WriteCoilResult | WriteRegisterResult | WriteMultipleResult

export interface ModbusFunctionInterface {
    write(client: ModbusRTU): Promise<ModbusResult>
}

export class ModbusReadHoldingRegisters implements ModbusFunctionInterface {
    address: number
    length: number

    constructor(address: number, length: number=1) {
        this.address = address
        this.length = length
    }

    write(client: ModbusRTU): Promise<ReadRegisterResult> {
        return client.readHoldingRegisters(this.address, this.length)
    }
}

export class ModbusWriteSingleCoil implements ModbusFunctionInterface {
    address: number
    value: boolean

    constructor(address: number, value: boolean) {
        this.address = address
        this.value = value
    }

    write(client: ModbusRTU): Promise<WriteCoilResult> {
        return client.writeCoil(this.address, this.value)
    }
}

export class ModbusWriteSingleRegister implements ModbusFunctionInterface {
    address: number
    value: number

    constructor(address: number, value: number) {
        this.address = address
        this.value = value
    }

    write(client: ModbusRTU): Promise<WriteRegisterResult> {
        return client.writeRegister(this.address, this.value)
    }
}

export class ModbusWriteMultipleRegisters implements ModbusFunctionInterface {
    startingAddress: number
    values: number[]

    constructor(startingAddress: number, values: number[]) {
        this.startingAddress = startingAddress
        this.values = values

        // console.log(this.startingAddress, this.values)
    }

    write(client: ModbusRTU): Promise<WriteMultipleResult> {
        return client.writeRegisters(this.startingAddress, this.values)
    }
}