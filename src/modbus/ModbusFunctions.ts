import ModbusRTU from "modbus-serial"

export interface ModbusFunctionInterface {
    write(client: ModbusRTU): Promise<any>
}

export class ModbusWriteSingleCoil implements ModbusFunctionInterface {
    address: number
    value: boolean

    constructor(address: number, value: boolean) {
        this.address = address
        this.value = value
    }

    async write(client: ModbusRTU): Promise<any> {
        await client.writeCoil(this.address, this.value)
    }
}

export class ModbusWriteSingleRegister implements ModbusFunctionInterface {
    address: number
    value: number

    constructor(address: number, value: number) {
        this.address = address
        this.value = value
    }

    async write(client: ModbusRTU): Promise<any> {
        await client.writeRegister(this.address, this.value)
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

    async write(client: ModbusRTU): Promise<any> {
        await client.writeRegisters(this.startingAddress, this.values)
    }
}