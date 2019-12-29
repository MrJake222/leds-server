import socketio from "socket.io"
import { Server } from "http";

import NedbHelper from "../NedbHelper"
import { DatastoreField, Module, Preset, ModValues, ModType, ModField } from "../types/Fields";
import ModbusHelper from "../modbus/ModbusHelper"
import ModbusRequest from "../modbus/ModbusRequest";
import { ModbusWriteSingleRegister, ModbusReadHoldingRegisters } from "../modbus/ModbusFunctions";
import { REGISTER_ADDRESS, REGISTER_MODULE_TYPE } from "../modbus/ModbusModules";
import { ReadRegisterResult } from "modbus-serial/ModbusRTU";

/**
 * This class is responsible for all communications with clients over either SocketIO
 */
class Network {
    server: Server
    io: socketio.Server
    nedb: NedbHelper
    modbus: ModbusHelper

    init(server: Server, nedb: NedbHelper, modbus: ModbusHelper) {
        this.server = server
        this.nedb = nedb
        this.modbus = modbus

        this.io = socketio(this.server, {
            pingTimeout: 30000,
            pingInterval: 30000
        })
    }

    addSocketIOHooks() {
        this.io.on("connection", async (socket) => {
            socket.emit("init", {
                force: false,
                lastModified: await this.nedb.find("lastModified")
            })
        
            socket.on("getAll", async ({ fieldName }) => {
                var docs = await this.nedb.find<DatastoreField>(fieldName)
        
                // Sorting
                switch (fieldName) {
                    case "modules":
                        docs = (docs as Module[]).sort((a, b) => a.modAddress - b.modAddress)
                        break
        
                    case "presets":
                        docs = (docs as Preset[]).sort((a, b) => a.timestamp - b.timestamp)
                        break
                }
        
                socket.emit("added", {
                    getAll: true,
        
                    fieldName: fieldName,
                    docs: docs
                })
            })
        
            socket.on("forceReload", async () => {
                socket.emit("init", {
                    force: true,
        
                    lastModified: await this.nedb.find("lastModified")
                })
            })
        
            socket.on("addModule", async (data) => {
                const { modAddress } = data
        
                try {
                    // Send ReadHoldingRegisters command to given address
                    const result = await this.modbus.queue(new ModbusRequest(modAddress, [new ModbusReadHoldingRegisters(REGISTER_MODULE_TYPE)]))
                    const moduleType = (result[0] as ReadRegisterResult).data[0]
        
                    // Try to read the modType from the database
                    const modType = await this.nedb.findFirst<ModType>("modTypes", { moduleType: moduleType })
        
                    // Add module to database
                    const moduleObj = await this.nedb.insertOne<Module>("modules", { ...data, modType: modType.codename })
                    const values: { [key: string]: any } = {}
        
                    // Add required modValues here. Do not use forEach, as it
                    // creates another level of async functions
                    for (let i = 0; i < modType.fields.length; i++) {
                        var { codename, defaultValue } = await this.nedb.findFirst<ModField>("modFields", { codename: modType.fields[i] })
        
                        values[codename] = defaultValue
                    }
        
                    const modValues: ModValues = {
                        modId: moduleObj._id,
                        preset: null,
                        ...values
                    }
        
                    this.nedb.insert("modValues", modValues)
        
                    this.nedb.updateLastModified("modValues")
                    this.nedb.updateLastModified("modules")
        
                    this.io.emit("added", { fieldName: "modValues", docs: [modValues] })
                    this.io.emit("added", { fieldName: "modules", docs: [moduleObj] })
                }
        
                catch (reason) {
                    if (reason == "timeout") {
                        this.io.emit("addModuleFailed", {
                            reason: "timeout"
                        })
                    }
                }
            })
        
            socket.on("deleteModule", ({ modId }) => {
                this.nedb.delete("modules", { _id: modId })
                this.nedb.delete("modValues", { modId: modId })
        
                this.nedb.updateLastModified("modValues")
                this.nedb.updateLastModified("modules")
        
                socket.broadcast.emit("removed", { fieldName: "modules", _id: modId })
            })
        
            socket.on("updateModuleName", (data) => {
                const { modId, modName } = data
        
                this.nedb.update("modules", { _id: modId }, {
                    modName: modName
                })
        
                this.nedb.updateLastModified("modules")
        
                socket.broadcast.emit("updateModuleName", data)
            })
        
            socket.on("updateModuleAddress", async (data) => {
                const { modId, newModAddress } = data
                const { modAddress } = await this.nedb.findFirst<Module>("modules", { _id: modId })
        
                try {
                    await this.modbus.queue(new ModbusRequest(modAddress, [new ModbusWriteSingleRegister(REGISTER_ADDRESS, newModAddress)]))
        
                    this.nedb.update("modules", { _id: modId }, {
                        modAddress: newModAddress
                    })
        
                    this.nedb.updateLastModified("modules")
        
                    this.io.emit("updateModuleAddress", data)
                }
        
                catch (reason) {
                    if (reason == "timeout") {
                        this.io.emit("updateModuleAddressFailed", {
                            reason: "timeout"
                        })
                    }
        
                    else {
                        this.io.emit("updateModuleAddressFailed", {
                            reason: "other"
                        })
                    }
                }
            })
        
            socket.on("updateModField", async (data) => {
                const { modId, modAddress, modType, codename, value } = data
        
                await this.nedb.update("modValues", { modId: modId }, {
                    [codename]: value,
                    preset: null
                })
        
                this.nedb.updateLastModified("modValues")
        
                var modValues = await this.nedb.findFirst<ModValues>("modValues", { modId: modId })
        
                delete modValues._id
                delete modValues.modId
        
                this.modbus.queue(this.modbus.getModule(modType).apply(modAddress, modValues, {
                    latch: true
                }))
        
                socket.broadcast.emit("updateModField", data)
            })
        
            socket.on("addPreset", async (data) => {
                const doc = await this.nedb.insert("presets", { ...data, builtin: false, timestamp: Date.now() })
        
                this.nedb.updateLastModified("presets")
        
                this.nedb.update("modValues", { modId: data.modId }, { preset: data.presetName })
                this.nedb.updateLastModified("modValues")
        
                this.io.emit("added", { fieldName: "presets", docs: [doc] })
            })
        
            socket.on("deletePreset", ({ _id }) => {
                this.nedb.delete("presets", { _id: _id })
                this.nedb.updateLastModified("presets")
        
                socket.broadcast.emit("removed", { fieldName: "presets", _id: _id })
            })
        
            socket.on("applyPreset", async ({ presetId, modules }) => {
                let { presetName, values } = await this.nedb.findFirst<Preset>("presets", { _id: presetId })
                values.preset = presetName
        
                modules.forEach(async (modId: string) => {
                    const { modAddress, modType } = await this.nedb.findFirst<Module>("modules", { _id: modId })
        
                    const { preset } = await this.nedb.findFirst<ModValues>("modValues", { modId: modId })
        
                    // If the preset is off, fetch appropriate values from ModbusModule
                    if (presetName == "Off") {
                        values = {
                            ...this.modbus.getModule(modType).offValues(),
                            preset: "Off"
                        }
                    }
        
                    this.nedb.update("modValues", { modId: modId }, values)
                    this.nedb.updateLastModified("modValues")
        
                    // If the module wasn't off, turn it off first
                    if (preset != "Off") {
                        this.modbus.queue(this.modbus.getModule(modType).apply(modAddress, values, {
                            time: 500,
                            dim: true
                        }))
                    }
        
                    // If not applying off preset, set the preset on the target device
                    if (presetName != "Off") {
        
                        // If current preset was Off, don't wait for the device to turn off
                        const wait = preset == "Off" ? 0 : 550
        
                        this.modbus.queue(this.modbus.getModule(modType).apply(modAddress, values, {
                            time: 500,
                        }), wait)
                    }
        
                    this.io.emit("updateMultipleModFields", {
                        modId: modId,
                        values: values,
                    })
                })
            })
        })
    }
}

export const net = new Network()