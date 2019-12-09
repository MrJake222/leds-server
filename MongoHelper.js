const { MongoClient } = require("mongodb")

module.exports = class MongoHelper {
    constructor(url, database) {
        this.database = database
        this.connected = false
        this.initialized = false

        this.dbClient = new MongoClient(url, {
            useUnifiedTopology: true,
            useNewUrlParser: true
        })
    }

    async getDatabase() {
        if (!this.connected) {
            await this.dbClient.connect()
            this.connected = true

            if (!this.initialized) {
                var {databases} = await this.dbClient.db(this.database).admin().listDatabases()                

                if (!databases.map((db) => db.name).includes(this.database)) {
                    await init(this)
                }

                this.initialized = true
            }
        }
        
        return this.dbClient.db(this.database)
    }

    async find(collection, query = {}) {
        var db = await this.getDatabase()

        return db.collection(collection).find(query).toArray()
    }

    async updateLastModified(fieldName) {
        var db = await this.getDatabase()

        return db.collection("lastModified").updateOne(
            { fieldName: fieldName },
            { $set: { lastModified: new Date().toJSON() } }
        )
    }

    async updateOne(collection, query, set) {
        var db = await this.getDatabase()

        return db.collection(collection).updateOne(
            query,
            { $set: set }
        )
    }

    async insertOne(collection, doc) {
        var db = await this.getDatabase()

        return db.collection(collection).insertOne(doc)
    }

    async insertMany(collection, docs) {
        var db = await this.getDatabase()

        return db.collection(collection).insertMany(docs)
    }

    async deleteOne(collection, query) {
        var db = await this.getDatabase()

        return db.collection(collection).removeOne(query)
    }
}

function init(mongo) {
    console.log("Initializing the database...")    

    var template = require("./databaseTemplate")

    Object.keys(template).forEach((key) => {
        if (key == "lastModified") {
            const jsonDate = new Date().toJSON()

            template[key].forEach((field) => field.lastModified = jsonDate)
        }

        mongo.insertMany(key, template[key])
    })
}