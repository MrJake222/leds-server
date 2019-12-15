import express from "express"
import { Server } from "http"
import socketio from "socket.io"
import { ObjectID } from "mongodb"

import ModValues from "./types/ModValues"

const app = express()
const server = new Server(app)
const io = socketio(server, {
    pingTimeout: 30000,
    pingInterval: 30000
})

// app.use(express.static("static"))

server.listen(3000, function () {
    console.log("Listening...")
})

// --------------------------------------------------------------------------------
// MongoDB
const url = "mongodb://localhost:27017"
const database = "leds"

import MongoHelper from "./MongoHelper"
const mongo = new MongoHelper(url, database)

mongo.getDatabase()

// --------------------------------------------------------------------------------
// ModbusRTU
import ModbusHelper from "./modbus/ModbusHelper"
import ModbusRequest from "./modbus/ModbusRequest"
const modbus = new ModbusHelper("/dev/ttyUSB0", 57600)

// --------------------------------------------------------------------------------
// import databaseTemplate from "./databaseTemplate"

// app.get("/api/status", (req, res) => {
//     res.send({
//         status: "ok"
//     })
// })

// app.get("/api/lastModified", (req, res) => {
//     res.send({
//         lastModified: databaseTemplate[req.query.fieldName].lastModified
//     })
// })

// app.get("/api/getField", (req, res) => {
//     res.send(databaseTemplate[req.query.fieldName][req.query.fieldName])
// })

// --------------------------------------------------------------------------------
io.on("connection", async (socket) => {
    socket.emit("init", {
        lastModified: await mongo.find("lastModified")
    })

    socket.on("getAll", async ({ fieldName }) => {
        var docs = await mongo.find(fieldName)

        socket.emit("added", {
            getAll: true,

            fieldName: fieldName,
            docs: docs
        })
    })

    socket.on("forceReload", async () => {
        socket.emit("init", {
            force: true,

            lastModified: await mongo.find("lastModified")
        })
    })

    socket.on("addModule", async (data) => {
        var docs = await mongo.insertOne("modules", { ...data })
        const doc = docs.ops[0]
        // doc.modId = doc._id
        // doc._id = undefined

        var values: ModValues = new ModValues(doc._id as ObjectID)
        var modType = await mongo.find("modTypes", { codename: data.modType })

        var fields = modType[0].fields

        for (let i=0; i<fields.length; i++) {
            var modField = await mongo.find("modFields", { codename: fields[i] })            
            var { codename, defaultValue } = modField[0]
            
            values.addValue(codename, defaultValue)
        }

        values.addValue("preset", null)

        mongo.insertOne("modValues", values.getObject())

        mongo.updateLastModified("modValues")
        mongo.updateLastModified("modules")

        io.emit("added", { fieldName: "modValues", docs: [values] })
        io.emit("added", { fieldName: "modules", docs: [doc] })
    })

    socket.on("deleteModule", ({modId}) => {
        mongo.deleteOne("modules", { _id: new ObjectID(modId) })
        mongo.deleteOne("modValues", { modId: new ObjectID(modId) })

        mongo.updateLastModified("modValues")
        mongo.updateLastModified("modules")

        socket.broadcast.emit("removed", { fieldName: "modules", _id: modId })
    })

    socket.on("updateModule", (data) => {
        const {modId, modAddress, modName} = data

        mongo.updateOne("modules", { _id: new ObjectID(modId) }, {
            modAddress: modAddress,
            modName: modName 
        })

        mongo.updateLastModified("modules")

        socket.broadcast.emit("updateModule", data)
    })

    socket.on("updateModField", async (data) => {
        const {modId, modAddress, modType, codename, value} = data

        await mongo.updateOne("modValues", { modId: new ObjectID(modId) }, {
            [codename]: value,
            preset: null
        })

        mongo.updateLastModified("modValues")

        var modValuess = await mongo.find("modValues", { modId: new ObjectID(modId) })
        // console.log("modType", modType)
        // console.log("modAddress", modAddress)
        // console.log("modId", modId)
        // console.log("modValuess", modValuess)
        const modValues = modValuess[0]

        delete modValues._id
        delete modValues.modId

        // modbus.applyValues(modType, modAddress, modValues, false)
        modbus.queue(modbus.getModule(modType).apply(modAddress, modValues, {
            latch: true
        }))

        socket.broadcast.emit("updateModField", data)
    })

    socket.on("addPreset", async (data) => {
        const output = await mongo.insertOne("presets", {...data})
        const docs = output.ops

        mongo.updateLastModified("presets")

        io.emit("added", { fieldName: "presets", docs: docs })
    })

    socket.on("deletePreset", ({_id}) => {
        mongo.deleteOne("presets", { _id: new ObjectID(_id) })
        mongo.updateLastModified("presets")

        socket.broadcast.emit("removed", { fieldName: "presets", _id: _id })
    })

    socket.on("applyPreset", async ({presetId, modules}) => {
        const preset = await mongo.find("presets", {_id: new ObjectID(presetId)})
        const { values } = preset[0]

        modules.forEach(async (modId: string) => {
            mongo.updateOne("modValues", { modId: new ObjectID(modId) }, values)
            
            const modbusModule = await mongo.find("modules", {_id: new ObjectID(modId)})
            const { modAddress, modType } = modbusModule[0]

            modbus.queue(modbus.getModule(modType).apply(modAddress, values, {
                time: 500,
                dim: true
            }))

            modbus.queue(modbus.getModule(modType).apply(modAddress, values, {
                time: 500,
                // dim: true
            }), 550)

            io.emit("updateMultipleModFields", {
                modId: modId,
                values: values
            })
        })
    })
})