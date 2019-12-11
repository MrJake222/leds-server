import { ObjectID } from "mongodb";

export default class ModTypes {
    modId: ObjectID
    values: {codename: string, defaultValue: any}[] = []

    constructor(modId: ObjectID) {
        this.modId = modId
    }

    addValue(codename: string, defaultValue: any) {
        this.values.push({
            codename: codename,
            defaultValue: defaultValue
        })
    }

    getObject(): {[key: string]: string} {
        var obj: {[key: string]: string} = { modId: this.modId.toHexString() }

        for (let {codename, defaultValue} of this.values)
            obj[codename] = defaultValue

        return obj
    }
}