import socketio from "socket.io"
import { Server } from "http";

import { modbus } from "../modbus/ModbusHelper"
import { nedb } from "../NedbHelper"
import NedbHelper from "../NedbHelper"
import { DatastoreField, Module, Preset, ModValues, ModType, ModField } from "../types/Fields";
import ModbusHelper from "../modbus/ModbusHelper"
import ModbusRequest from "../modbus/ModbusRequest";
import { ModbusWriteSingleRegister, ModbusReadHoldingRegisters } from "../modbus/ModbusFunctions";
import { REGISTER_ADDRESS, REGISTER_MODULE_TYPE } from "../modbus/ModbusModules";
import { ReadRegisterResult } from "modbus-serial/ModbusRTU";
import { Express } from "express-serve-static-core"

/**
 * This class is responsible for all communications with clients over either SocketIO
 */
class Network {
    app: Express
    server: Server
    io: socketio.Server

    init(app: Express, server: Server) {
        this.app = app
        this.server = server

        this.io = socketio(this.server, {
            pingTimeout: 30000,
            pingInterval: 30000
        })
    }

    addSocketIOHooks() {
        this.io.on("connection", async (socket) => {
            socket.emit("init", {
                force: false,
                lastModified: await nedb.find("lastModified")
            })

            socket.on("getAll", async ({ fieldName }) => {
                var docs = await nedb.find<DatastoreField>(fieldName)

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

                    lastModified: await nedb.find("lastModified")
                })
            })

            socket.on("deleteModule", ({ modId }) => {
                nedb.delete("modules", { _id: modId })
                nedb.delete("modValues", { modId: modId })

                nedb.updateLastModified("modValues")
                nedb.updateLastModified("modules")

                socket.broadcast.emit("removed", { fieldName: "modules", _id: modId })
            })

            socket.on("updateModuleName", (data) => {
                const { modId, modName } = data

                nedb.update("modules", { _id: modId }, {
                    modName: modName
                })

                nedb.updateLastModified("modules")

                socket.broadcast.emit("updateModuleName", data)
            })

            socket.on("updateModField", async (data) => {
                const { modId, modAddress, modType, codename, value } = data

                await nedb.update("modValues", { modId: modId }, {
                    [codename]: value,
                    preset: null
                })

                nedb.updateLastModified("modValues")

                var modValues = await nedb.findFirst<ModValues>("modValues", { modId: modId })

                delete modValues._id
                delete modValues.modId

                modbus.queue(modbus.getModule(modType).apply(modAddress, modValues, {
                    latch: true
                }))

                socket.broadcast.emit("updateModField", data)
            })

            socket.on("addPreset", async (data) => {
                const doc = await nedb.insert("presets", { ...data, builtin: false, timestamp: Date.now() })

                nedb.updateLastModified("presets")

                nedb.update("modValues", { modId: data.modId }, { preset: data.presetName })
                nedb.updateLastModified("modValues")

                this.io.emit("added", { fieldName: "presets", docs: [doc] })
            })

            socket.on("deletePreset", ({ _id }) => {
                nedb.delete("presets", { _id: _id })
                nedb.updateLastModified("presets")

                socket.broadcast.emit("removed", { fieldName: "presets", _id: _id })
            })

            socket.on("applyPreset", async ({ presetId, modules }) => {
                let { presetName, values } = await nedb.findFirst<Preset>("presets", { _id: presetId })
                values.preset = presetName

                modules.forEach(async (modId: string) => {
                    const { modAddress, modType } = await nedb.findFirst<Module>("modules", { _id: modId })

                    const { preset } = await nedb.findFirst<ModValues>("modValues", { modId: modId })

                    // If the preset is off, fetch appropriate values from ModbusModule
                    if (presetName == "Off") {
                        values = {
                            ...modbus.getModule(modType).offValues(),
                            preset: "Off"
                        }
                    }

                    nedb.update("modValues", { modId: modId }, values)
                    nedb.updateLastModified("modValues")

                    // If the module wasn't off, turn it off first
                    if (preset != "Off") {
                        modbus.queue(modbus.getModule(modType).apply(modAddress, values, {
                            time: 500,
                            dim: true
                        }))
                    }

                    // If not applying off preset, set the preset on the target device
                    if (presetName != "Off") {

                        // If current preset was Off, don't wait for the device to turn off
                        const wait = preset == "Off" ? 0 : 550

                        modbus.queue(modbus.getModule(modType).apply(modAddress, values, {
                            time: 500,
                        }), wait)
                    }

                    socket.broadcast.emit("updateMultipleModFields", {
                        modId: modId,
                        values: values,
                    })
                })
            })
        })
    }

    addAjaxHooks() {
        this.app.post("/api/addModule", async (req, res) => {
            const data = {
                modAddress: req.body.modAddress,
                modName: req.body.modName,
            }

            try {
                // Send ReadHoldingRegisters command to given address
                const result = await modbus.queue(new ModbusRequest(data.modAddress, [new ModbusReadHoldingRegisters(REGISTER_MODULE_TYPE)]))
                const moduleType = (result[0] as ReadRegisterResult).data[0]

                // Try to read the modType from the database
                const modType = await nedb.findFirst<ModType>("modTypes", { moduleType: moduleType })

                // Add module to database
                const moduleObj = await nedb.insertOne<Module>("modules", { ...data, modType: modType.codename })
                const values: { [key: string]: any } = {}

                // Add required modValues here. Do not use forEach, as it
                // creates another level of async functions
                for (let i = 0; i < modType.fields.length; i++) {
                    var { codename, defaultValue } = await nedb.findFirst<ModField>("modFields", { codename: modType.fields[i] })

                    values[codename] = defaultValue
                }

                const modValues: ModValues = {
                    modId: moduleObj._id!,
                    preset: null,
                    ...values
                }

                nedb.insert("modValues", modValues)

                nedb.updateLastModified("modValues")
                nedb.updateLastModified("modules")

                this.io.emit("added", { fieldName: "modValues", docs: [modValues] })
                this.io.emit("added", { fieldName: "modules", docs: [moduleObj] })

                res.send({ status: "ok", modType: modType.codename })
            }

            catch (reason) {
                res.send({ status: reason })
            }
        })

        this.app.post("/api/updateModuleAddress", async (req, res) => {
            const { modId, newModAddress } = req.body
            const { modAddress } = await nedb.findFirst<Module>("modules", { _id: modId })

            try {
                await modbus.queue(new ModbusRequest(modAddress, [new ModbusWriteSingleRegister(REGISTER_ADDRESS, newModAddress)]))

                nedb.update("modules", { _id: modId }, {
                    modAddress: newModAddress
                })

                nedb.updateLastModified("modules")

                res.send({ status: "ok" })
            }

            catch (reason) {
                res.send({ status: reason })
            }
        })

    }
}

export const net = new Network()