const express = require("express")
const http = require("http")
const socketio = require("socket.io")
const { ObjectID } = require("mongodb")

const app = express()
const server = http.Server(app);
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

const MongoHelper = require("./MongoHelper")
const mongo = new MongoHelper(url, database)

mongo.getDatabase()

// --------------------------------------------------------------------------------
const static = require("./databaseTemplate")

app.get("/api/status", (req, res) => {
    res.send({
        status: "ok"
    })
})

app.get("/api/lastModified", (req, res) => {
    res.send({
        lastModified: static[req.query.fieldName].lastModified
    })
})

app.get("/api/getField", (req, res) => {
    res.send(static[req.query.fieldName][req.query.fieldName])
})

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
        var doc = await mongo.insertOne("modules", { ...data })
        doc = doc.ops[0]
        // doc.modId = doc._id
        // doc._id = undefined

        var values = { modId: doc._id }
        var modType = await mongo.find("modTypes", { codename: data.modType })

        var fields = modType[0].fields

        for (let i=0; i<fields.length; i++) {
            var modField = await mongo.find("modFields", { codename: fields[i] })            
            var { codename, defaultValue } = modField[0]
            
            values[codename] = defaultValue
        }

        mongo.insertOne("modValues", values)

        mongo.updateLastModified("modValues")
        mongo.updateLastModified("modules")

        io.emit("added", { fieldName: "modValues", docs: [values] })
        io.emit("added", { fieldName: "modules", docs: [doc] })
    })

    socket.on("deleteModule", ({modId}) => {
        mongo.deleteOne("modules", { _id: ObjectID(modId) })
        mongo.deleteOne("modValues", { modId: ObjectID(modId) })

        mongo.updateLastModified("modValues")
        mongo.updateLastModified("modules")

        socket.broadcast.emit("removed", { fieldName: "modules", _id: modId })
    })

    socket.on("updateModule", (data) => {
        const {modId, modAddress, modName} = data

        mongo.updateOne("modules", { _id: ObjectID(modId) }, {
            modAddress: modAddress,
            modName: modName 
        })

        mongo.updateLastModified("modules")

        socket.broadcast.emit("updateModule", data)
    })

    socket.on("updateModField", (data) => {
        const {modId, codename, value} = data

        mongo.updateOne("modValues", { modId: ObjectID(modId) }, {
            [codename]: value
        })

        mongo.updateLastModified("modValues")

        socket.broadcast.emit("updateModField", data)
    })

    socket.on("addPreset", async (data) => {
        const output = await mongo.insertOne("presets", {...data})
        const docs = output.ops

        mongo.updateLastModified("presets")

        io.emit("added", { fieldName: "presets", docs: docs })
    })

    socket.on("deletePreset", ({_id}) => {
        console.log("delete Preset")

        mongo.deleteOne("presets", { _id: ObjectID(_id) })
        mongo.updateLastModified("presets")

        socket.broadcast.emit("removed", { fieldName: "presets", _id: _id })
    })
})