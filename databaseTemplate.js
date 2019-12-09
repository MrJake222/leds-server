module.exports = {
    modFields: [
        {
            name: "Hue",
            codename: "hue",
            type: "smooth",
            maxValue: 360,
            defaultValue: 0
        },

        {
            name: "Saturation",
            codename: "saturation",
            type: "smooth",
            maxValue: 100,
            defaultValue: 0
        },

        {
            name: "Lightness",
            codename: "lightness",
            type: "smooth",
            maxValue: 100,
            defaultValue: 0
        }
    ],

    modTypes: [
        {
            codename: "LED-RGB",
            fields: ["hue", "saturation", "lightness"],
            indicatorType: "color"
        }
    ],

    lastModified: [
        { fieldName: "modules", lastModified: null },
        { fieldName: "modFields", lastModified: null },
        { fieldName: "modTypes", lastModified: null },
        { fieldName: "modValues", lastModified: null },
        { fieldName: "presets", lastModified: null }
    ]
}