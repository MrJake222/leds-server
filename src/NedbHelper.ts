import fs from "fs"
import Datastore from "nedb"
import databaseTemplateGlobal from "./databaseTemplate"

export type KeyValueAny = {[key: string]: any}

export default class NedbHelper {
    datastores: { [name: string]: Datastore } = {}

    getDatastoreFile(datastoreName: string): string {
        return "db/" + datastoreName + ".db"
    }

    init() {
        console.info("Initializing the database...")

        const databaseTemplate: { [key: string]: any } = databaseTemplateGlobal

        Object.keys(databaseTemplate).forEach((key) => {
            if (!fs.existsSync(this.getDatastoreFile(key))) {
                console.info("Creating datastore " + key)

                if (key == "lastModified") {
                    const jsonDate = new Date().toJSON()

                    databaseTemplate[key].forEach((field: { fieldName: string, lastModified: string }) => field.lastModified = jsonDate)
                }

                this.insert(key, databaseTemplate[key])
            }
        })
    }

    /**
     * Creates new Datastore and loads file named {"db/" + datastoreName + ".db"}.
     * If already loaded, then only returns the stored Datastore
     * 
     * @param datastoreName 
     */
    getDatastore(datastoreName: string): Datastore {
        if (!this.datastores[datastoreName]) {
            // Not loaded
            this.datastores[datastoreName] = new Datastore({
                filename: this.getDatastoreFile(datastoreName),
                autoload: true
            })
        }

        return this.datastores[datastoreName]
    }

    find(datastoreName: string, query = {}): Promise<any[]> {
        var ds = this.getDatastore(datastoreName)

        return new Promise((resolve, reject) => {
            ds.find(query, {}, (err, docs) => {
                if (err)
                    reject(err)

                resolve(docs)
            })
        })
    }

    update(datastoreName: string, query: object, set: object, multi: boolean = false): Promise<number> {
        var ds = this.getDatastore(datastoreName)

        return new Promise((resolve, reject) => {
            ds.update(query, { $set: set }, { multi: multi }, (err, numberOfUpdated) => {
                if (err)
                    reject(err)

                resolve(numberOfUpdated)
            })
        })
    }

    updateLastModified(fieldName: string): Promise<number> {
        return this.update(
            "lastModified",
            { fieldName: fieldName },
            { lastModified: new Date().toJSON() }
        )
    }

    insert(datastoreName: string, docs: KeyValueAny | KeyValueAny[]): Promise<KeyValueAny | KeyValueAny[]> {
        var ds = this.getDatastore(datastoreName)

        return new Promise((resolve, reject) => {
            ds.insert(docs, (err, docs) => {
                if (err)
                    reject(err)

                resolve(docs)
            })
        })
    }

    delete(datastoreName: string, query: object, multi: boolean = false): Promise<number> {
        var ds = this.getDatastore(datastoreName)

        return new Promise((resolve, reject) => {
            ds.remove(query, { multi: multi }, (err, number) => {
                if (err)
                    reject(err)

                resolve(number)
            })
        })
    }
}