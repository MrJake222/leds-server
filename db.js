const MongoClient = require("mongodb").MongoClient

const url = "mongodb://localhost:27017"
const database = "leds"

const dbClient = new MongoClient(url, {
    useUnifiedTopology: true
})

var connected = false

/**
 * Either Resolves with database or rejects with error
 */
async function getDb() {
    if (connected)
        return Promise.resolve(dbClient.db(database))

    return new Promise((resolve, reject) => {
        dbClient.connect((err) => {
            if (err)
                reject(err)

            else {
                console.log("Connected to Mongo")
                connected = true

                resolve(dbClient.db(database))
            }
        })
    })
}

async function getDocs(collectionName, query = {}) {
    try {
        const database = await getDb()

        return new Promise((resolve, reject) => {
            database.collection(collectionName).find(query).toArray((err, docs) => {
                if (err)
                    reject({ err: err })

                else
                    resolve(docs)
            })
        })
    }

    catch (e) {
        console.log("Error in getDocs: " + e.name)
    }
}

async function updateLastModified(fieldName) {
    try {
        const database = await getDb()

        return new Promise((resolve, reject) => {
            database.collection("lastModified").updateOne(
                { fieldName: fieldName },
                { $set: { lastModified: new Date().toJSON() } },
                (err, docs) => {
                    if (err)
                        reject({ err: err })

                    else
                        resolve(docs)
                }
            )
        })
    }

    catch (e) {
        console.log("Error in updateLastModified: " + e.name)
    }
}

async function insertInto(collection, doc) {
    try {
        const database = await getDb()

        return new Promise((resolve, reject) => {
            database.collection(collection).insertOne(doc, (err, doc) => {
                if (err)
                    reject({ err: err })

                else
                    resolve(doc)
                }
            )
        })
    }

    catch (e) {
        console.log("Error in insertInto: " + e.name)
    }
}

async function deleteFrom(collection, query) {
    try {
        const database = await getDb()

        console.log("deleteFrom", query);
        

        return new Promise((resolve, reject) => {
            database.collection(collection).removeOne(query, (err, doc) => {
                if (err)
                    reject({ err: err })

                else
                    resolve(doc)
                }
            )
        })
    }

    catch (e) {
        console.log("Error in deleteFrom: " + e.name)
    }
}

module.exports = {
    getDb: getDb,
    getDocs: getDocs,
    updateLastModified: updateLastModified,
    insertInto: insertInto,
    deleteFrom: deleteFrom
}