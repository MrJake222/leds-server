import express from "express"
import { Server } from "http"
import socketio from "socket.io"
import config from "./config.json"

import {modbus} from "./modbus/ModbusHelper"
import { nedb } from "./NedbHelper"
import { net } from "./network/Network"

const app = express()
const server = new Server(app)

server.listen(3000, function () {
    console.log("Listening on port 3000...")
})

modbus.init(config.port, config.baud)
nedb.init()

net.init(server, nedb, modbus)
net.addSocketIOHooks()