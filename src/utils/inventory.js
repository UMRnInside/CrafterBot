// almost copy-pasted from https://github.com/PrismarineJS/mineflayer/blob/master/examples/inventory.js

function sayItems (bot, items = null) {
    if (!items) {
        items = bot.inventory.items()
        if (require('minecraft-data')(bot.version).isNewerOrEqualTo('1.9') && bot.inventory.slots[45]) items.push(bot.inventory.slots[45])
    }
    const output = items.map(itemToString).join(', ')
    if (output) {
        console.log(output)
    } else {
        console.log('empty')
    }
}

function tossItem (bot, name, amount) {
    amount = parseInt(amount, 10)
    const item = itemByName(name)
    if (!item) {
        console.log(`I have no ${name}`)
    } else if (amount) {
        bot.toss(item.type, null, amount, checkIfTossed)
    } else {
        bot.tossStack(item, checkIfTossed)
    }

    function checkIfTossed (err) {
        if (err) {
            console.log(`unable to toss: ${err.message}`)
        } else if (amount) {
            console.log(`tossed ${amount} x ${name}`)
        } else {
            console.log(`tossed ${name}`)
        }
    }
}

async function equipItem (bot, name, destination) {
    const item = itemByName(bot, name)
    if (item) {
        try {
            await bot.equip(item, destination)
            // console.log(`equipped ${name}`)
        } catch (err) {
            console.log(`cannot equip ${name}: ${err.message}`)
        }
    } else {
        console.log(`I have no ${name}`)
    }
}

async function unequipItem (bot, destination) {
    try {
        await bot.unequip(destination)
        console.log('unequipped')
    } catch (err) {
        console.log(`cannot unequip: ${err.message}`)
    }
}

function useEquippedItem (bot) {
    console.log('activating item')
    bot.activateItem()
}

async function craftItem (bot, name, amount) {
    amount = parseInt(amount, 10)
    const mcData = require('minecraft-data')(bot.version)

    const item = mcData.findItemOrBlockByName(name)
    const craftingTableID = mcData.blocksByName.crafting_table.id

    //const craftingTable = bot.findBlock({
    //    matching: craftingTableID
    //})
    const craftingTable = null;

    if (item) {
        const recipe = bot.recipesFor(item.id, null, 1, craftingTable)[0]
        if (recipe) {
            console.log(`I can make ${name}`)
            try {
                await bot.craft(recipe, amount, craftingTable)
                console.log(`did the recipe for ${name} ${amount} times`)
            } catch (err) {
                console.log(`error making ${name}`)
            }
        } else {
            console.log(`I cannot make ${name}`)
        }
    } else {
        console.log(`unknown item: ${name}`)
    }
}

function itemToString (item) {
    if (item) {
        return `${item.name} x ${item.count}`
    } else {
        return '(nothing)'
    }
}

function itemByName (bot, name) {
    const items = bot.inventory.items()
    if (require('minecraft-data')(bot.version).isNewerOrEqualTo('1.9') && bot.inventory.slots[45]) items.push(bot.inventory.slots[45])
    return items.filter(item => item.name === name)[0]
}

function countItemById(bot, minId, maxId = null) {
    if (maxId === null) maxId = minId;
    let count = 0
    for (let i in bot.inventory.items()) {
        let item = bot.inventory.items()[i];
        if (item && (minId <= item.type && item.type <= maxId))
            count += item.count;
    }
    return count;

}

module.exports = {
    sayItems,
    tossItem,
    equipItem,
    unequipItem,
    useEquippedItem,
    craftItem,
    itemToString,
    itemByName,
    countItemById
}
