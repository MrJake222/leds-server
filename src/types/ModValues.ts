export default class ModTypes {
    modId: string
    values: {codename: string, defaultValue: any}[] = []

    constructor(modId: string) {
        this.modId = modId
    }

    addValue(codename: string, defaultValue: any) {
        this.values.push({
            codename: codename,
            defaultValue: defaultValue
        })
    }

    getObject(): {[key: string]: string} {
        var obj: {[key: string]: string} = { modId: this.modId }

        for (let {codename, defaultValue} of this.values)
            obj[codename] = defaultValue

        return obj
    }
}