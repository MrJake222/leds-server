import { MongoClient } from "mongodb"
import databaseTemplateGlobal from "./databaseTemplate"

export default class MongoHelper {
    databaseName: string

    connected: boolean = false
    initialized: boolean = false

    dbClient: MongoClient

    /**
     * Constructs MongoDB connection.
     * 
     * @param url Address of the database.
     * @param databaseName Database name.
     */
    constructor(url: string, databaseName: string) {
        this.databaseName = databaseName
        this.connected = false
        this.initialized = false

        this.dbClient = new MongoClient(url, {
            useUnifiedTopology: true,
            useNewUrlParser: true
        })
    }

    init() {
        console.info("Initializing the database...")  
        
        const databaseTemplate: {[key: string]: any} = databaseTemplateGlobal
        
        Object.keys(databaseTemplate).forEach((key) => {
            if (key == "lastModified") {
                const jsonDate = new Date().toJSON()
    
                databaseTemplate[key].forEach((field: { fieldName: string, lastModified: string }) => field.lastModified = jsonDate)
            }
    
            this.insertMany(key, databaseTemplate[key])
        })
    }

    async getDatabase() {
        if (!this.connected) {
            await this.dbClient.connect()
            this.connected = true

            if (!this.initialized) {
                var {databases} = await this.dbClient.db(this.databaseName).admin().listDatabases()                

                if (!databases.map((db: any) => db.name).includes(this.databaseName)) {
                    this.init()
                }

                this.initialized = true
            }
        }
        
        return this.dbClient.db(this.databaseName)
    }

    async find(collection: string, query = {}) {
        var db = await this.getDatabase()

        return db.collection(collection).find(query).toArray()
    }

    async updateLastModified(fieldName: string) {
        var db = await this.getDatabase()

        return db.collection("lastModified").updateOne(
            { fieldName: fieldName },
            { $set: { lastModified: new Date().toJSON() } }
        )
    }

    async updateOne(collection: string, query: object, set: object) {
        var db = await this.getDatabase()

        return db.collection(collection).updateOne(
            query,
            { $set: set }
        )
    }

    async insertOne(collection: string, doc: object) {
        var db = await this.getDatabase()

        return db.collection(collection).insertOne(doc)
    }

    async insertMany(collection: string, docs: object[]) {
        var db = await this.getDatabase()

        return db.collection(collection).insertMany(docs)
    }

    async deleteOne(collection: string, query: object) {
        var db = await this.getDatabase()

        return db.collection(collection).deleteOne(query)
    }
}