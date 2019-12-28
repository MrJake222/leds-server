export interface LastModified {
    fieldName: string
    lastModified: string
}

export interface Module {
    _id: string
    modAddress: number
    modName: string
    modType: string
}

export interface ModType {
    codename: string
    fields: string[]
    indicatorType: string
}

export interface ModField {
    name: string
    codename: string
    type: string
    maxValue: number
    defaultValue: number
}

export interface ModValues {
    _id?: string
    modId: string
    preset: string | null

    [key: string]: any
}

export interface Preset {
    _id: string
    presetName: string
    modType: string
    values: {[valueName: string]: any}
    builtin: boolean
    timestamp: number
}

export type DatastoreField = LastModified | Module | ModType | ModField | ModValues | Preset