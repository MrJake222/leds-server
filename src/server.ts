import express from "express"
import { Server } from "http"
import socketio from "socket.io"
// import { ObjectID } from "mongodb"

import ModValues from "./types/ModValues"
import Module from "./types/Module"

const app = express()
const server = new Server(app)
const io = socketio(server, {
    pingTimeout: 30000,
    pingInterval: 30000
})

server.listen(3000, function () {
    console.log("Listening...")
})

// --------------------------------------------------------------------------------
// MongoDB
const url = "mongodb://localhost:27017"
const database = "leds"

import NedbHelper from "./NedbHelper"
const nedb = new NedbHelper()

nedb.init()
// nedb.getDatabase()

// --------------------------------------------------------------------------------
// ModbusRTU
import ModbusHelper from "./modbus/ModbusHelper"
const modbus = new ModbusHelper("/dev/ttyUSB0", 57600)

// --------------------------------------------------------------------------------
io.on("connection", async (socket) => {
    socket.emit("init", {        
        lastModified: await nedb.find("lastModified")
    })

    socket.on("getAll", async ({ fieldName }) => {
        var docs = await nedb.find(fieldName)

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

    socket.on("addModule", async (data) => {
        const doc = await nedb.insert("modules", { ...data })
        const moduleObj: Module = doc as Module

        var values: ModValues = new ModValues(moduleObj._id)
        var modType = await nedb.find("modTypes", { codename: data.modType })

        var fields = modType[0].fields

        for (let i=0; i<fields.length; i++) {
            var modField = await nedb.find("modFields", { codename: fields[i] })            
            var { codename, defaultValue } = modField[0]
            
            values.addValue(codename, defaultValue)
        }

        values.addValue("preset", null)

        nedb.insert("modValues", values.getObject())

        nedb.updateLastModified("modValues")
        nedb.updateLastModified("modules")

        io.emit("added", { fieldName: "modValues", docs: [values] })
        io.emit("added", { fieldName: "modules", docs: [moduleObj] })
    })

    socket.on("deleteModule", ({modId}) => {
        nedb.delete("modules", { _id: modId })
        nedb.delete("modValues", { modId: modId })

        nedb.updateLastModified("modValues")
        nedb.updateLastModified("modules")

        socket.broadcast.emit("removed", { fieldName: "modules", _id: modId })
    })

    socket.on("updateModule", (data) => {
        const {modId, modAddress, modName} = data

        nedb.update("modules", { _id: modId }, {
            modAddress: modAddress,
            modName: modName 
        })

        nedb.updateLastModified("modules")

        socket.broadcast.emit("updateModule", data)
    })

    socket.on("updateModField", async (data) => {
        const {modId, modAddress, modType, codename, value} = data

        await nedb.update("modValues", { modId: modId }, {
            [codename]: value,
            preset: null
        })

        nedb.updateLastModified("modValues")

        var modValuess = await nedb.find("modValues", { modId: modId })
        const modValues = modValuess[0]

        delete modValues._id
        delete modValues.modId

        modbus.queue(modbus.getModule(modType).apply(modAddress, modValues, {
            latch: true
        }))

        socket.broadcast.emit("updateModField", data)
    })

    socket.on("addPreset", async (data) => {
        const doc = await nedb.insert("presets", {...data, builtin: false})

        nedb.updateLastModified("presets")

        nedb.update("modValues", { modId: data.modId }, { preset: data.presetName })
        nedb.updateLastModified("modValues")

        io.emit("added", { fieldName: "presets", docs: [doc] })
    })

    socket.on("deletePreset", ({_id}) => {
        nedb.delete("presets", { _id: _id })
        nedb.updateLastModified("presets")

        socket.broadcast.emit("removed", { fieldName: "presets", _id: _id })
    })

    socket.on("applyPreset", async ({presetId, modules}) => {
        const preset = await nedb.find("presets", {_id: presetId})
        var { presetName, values } = preset[0]

        values.preset = presetName

        modules.forEach(async (modId: string) => {
            const modbusModule = await nedb.find("modules", {_id: modId})
            const { modAddress, modType } = modbusModule[0]

            const modbusModValues = await nedb.find("modValues", {modId: modId})
            const { preset } = modbusModValues[0]

            // If the preset is off, fetch appropriate values from ModbusModule
            if (presetName == "Off") {
                values = {
                    ...modbus.getModule(modType).offValues(),
                    preset: "Off"
                }
            }

            nedb.update("modValues", { modId: modId }, values)            

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

            io.emit("updateMultipleModFields", {
                modId: modId,
                values: values,
            })
        })
    })
})