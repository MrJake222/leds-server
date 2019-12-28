import { hslToRgb } from "../helpers"
import ModbusRequest from "./ModbusRequest";
import { ModbusWriteMultipleRegisters, ModbusWriteSingleCoil, ModbusWriteSingleRegister, ModbusFunctionInterface } from "./ModbusFunctions";

/**
 * Interface to be implemented by all Modules.
 * Defines functions to properly apply modValues
 * to Module that implements it.
 */
export interface ModbusModuleInterface {
    
    /**
     * Generates ModbusRequest to be sent over serial line.
     * You need to provide module's address, modValues object
     * and options(see specific implementation).
     * 
     * @param modAddress Module's address.
     * @param modValues Module's values.
     * @param options Options(see implementation)
     */
    apply(modAddress: number, modValues: { [key: string]: number }, options: { [key: string]: any }): ModbusRequest

    /**
     * Gets off values to be saved into the database when applying off preset
     */
    offValues(): {[key: string]: any}
}

export class LEDRGB implements ModbusModuleInterface {
    // Starting address for writes
    static REGISTER_RED = 0x0000

    // Dims on undims the leds
    static REGISTER_DIM = 0x0003

    // Latches (ie. updates the PWM values) the color registers
    static COIL_LATCH = 0x1000

    /**
     * @param options Object with keys ["time", "dim", "latch"]
     * If time is defined, then the transition is smooth, latch latches the color immediately,
     * dim if true dimmes the color to black.
     */
    apply(modAddress: number, modValues: { [key: string]: number; }, options: { [key: string]: any }): ModbusRequest {
        const { hue, saturation, lightness } = modValues
        const values: number[] = hslToRgb(hue / 360, saturation / 100, lightness / 100)

        if (options.time) {
            values.push((options.dim ? 0x0000 : 0xF000) | options.time)
        }

        const functions: ModbusFunctionInterface[] = []

        if (options.time && options.dim)
            functions.push(new ModbusWriteSingleRegister(LEDRGB.REGISTER_DIM, values.pop()!))
        else
            functions.push(new ModbusWriteMultipleRegisters(LEDRGB.REGISTER_RED, Object.values(values)))
        

        if (options.latch)
            functions.push(new ModbusWriteSingleCoil(LEDRGB.COIL_LATCH, true))
        
        return new ModbusRequest(modAddress, functions)
    }

    offValues() {
        return {
            hue: 0,
            saturation: 0,
            lightness: 0
        }
    }
}

export const REGISTER_MODULE_TYPE = 0xFFD2