const mineflayer = require('mineflayer');
const watchdog = require('mineflayer-simple-watchdog');
const inventory = require('./utils/inventory');
const Vec3 = require('vec3');
const { pathfinder, Movements, goals: { GoalNear } } = require('mineflayer-pathfinder');
let mcData;

function makeCrafter(host, port, username, password, config) {
    const bot = mineflayer.createBot({
        host: host,
        port: port,
        username: username,
        password: password,
        version: config.version,
        defaultChatPatterns: false,
        watchdogConfig: {
            timeout: 60000,
            resetAction: onTimeout,
            checkInterval: 1000
        }
    });
    function onTimeout() {
        bot.quit();
    }
    bot.loadPlugin(watchdog);
    bot.loadPlugin(pathfinder);
    // bot.loadPlugin(require("./craft2"));
    bot.once('spawn', async () => {
        console.log("Logging in...");
        mcData = require("minecraft-data")(bot.version);
        bot.mcData = mcData;

        const defaultMove = new Movements(bot, mcData);
        defaultMove.allow1by1towers = false;
        defaultMove.canDig = false;
        defaultMove.allowParkour = true;
        defaultMove.allowSprinting = false;
        bot.pathfinder.setMovements(defaultMove);

        await bot.waitForTicks(config.login.gapTicks);
        for (let i in config.login.sequence) {
            bot.chat(config.login.sequence[i]);
            await bot.waitForTicks(config.login.gapTicks);
        }
        bot.watchdog.start();
        await botGoto(bot, bot.crafter.workingPosition, 0.0);
        bot.watchdog.kick();
        botWorkloop(bot);
    });

    bot.smartOpenContainer = async (block) => {
        let container = null;
        function reopen() {
            if (!container) {
                bot.activateBlock(block);
                setTimeout(reopen, 3000);
            }
        }
        setTimeout(reopen, 5000);
        container = await bot.openContainer(block);
        return container;
    }

    
    let crafter = {};
    crafter.workingPosition = Vec3(config.workingPosition);
    crafter.craftingTablePosition = Vec3(config.craftingTablePosition);
    crafter.outputPosition = Vec3(config.outputPosition);
    crafter.config = config;

    crafter.working = true;
    bot.crafter = crafter;

    bot.on("whisper", async (username, message) => {
        let config = bot.crafter.config.chatControl;
        function isOwner(username) {
            for (let i in config.owners) {
                if (config.owners[i] === username) return true;
            }
            return false;
        }
        if (!isOwner(username)) return;
        switch (true) {
            case /^start/.test(message):
                if (bot.crafter.working) return;
                bot.crafter.working = true;
                botWorkloop(bot);
                await sleep(1000);
                break;
            case /^stop/.test(message):
                bot.crafter.working = false;
                await sleep(1000);
                break;
            case /^(say|chat) /.test(message):
                let relayedMessage = message.replace(/^(say|chat) /, "");
                bot.chat(relayedMessage);
                break;
            case /^set /.test(message):
                let itemName = message.replace(/^set /, "");
                bot.crafter.crafting.product = itemName;
                bot.chat(`Roger, making ${itemName} now.`);
                break;
        }
    })

    return bot;
}

function itemsById (items, type) {
    let item
    for (let i in items) {
        item = items[i]
        if (item && item.type === type) return item
    }
    return null
}

async function botGoto(bot, pos, range) {
    let goal = new GoalNear(pos.x, pos.y, pos.z, range);
    try {
        await bot.pathfinder.goto(goal);
        bot.watchdog.kick();
        return true;
    } catch (err) {
        if (err.name === 'GoalChanged') {
            return false;
        }
        // ignore false-positive NoPath results
        if (err.name === 'NoPath') {
            console.log("Warning: NoPath");
            console.log(bot.entity.position);
            console.log(pos);
            return false;
        }
        console.log(err);
        bot.pathfinder.stop();
    }
    return false;
}

async function botWorkloop(bot) {
    console.log("Entering workloop...")
    while (bot.crafter.working) {
        await botGoto(bot, bot.crafter.workingPosition, 0.5);
        await botCraftOnce(bot, bot.crafter.config);
    }
}

async function botCraftOnce(bot, config) {
    const mcData = bot.mcData || require("minecraft-data")(bot.version);

    let itemId = mcData.itemsByName[config.crafting.product].id;
    let craftingTable = null;
    if (config.crafting.useCraftingTable) {
        craftingTable = bot.blockAt(bot.crafter.craftingTablePosition);
    }

    let recipes = bot.recipesAll(itemId, null, craftingTable);
    console.log(config.crafting.product, itemId, recipes);
    let recipe = recipes[0];
    for (let i in recipe.delta) {
        let recipeItem = recipe.delta[i];
        if (recipeItem.count >= 0) {
            continue;
        }
        let amountInInventory = inventory.countItemById(bot, recipeItem.id);
        let withdrawAmount = ( -(recipeItem.count) ) - amountInInventory;
        if (withdrawAmount > 0) {
            console.log(withdrawAmount)
            let itemName = mcData.items[recipeItem.id].name;
            let chestPosition = new Vec3(config.crafting.materials[itemName]);
            let success = await botTakeItem(bot,
                recipeItem.id,
                withdrawAmount,
                chestPosition
            );
            if (!success) {
                await sleep(1000);
                return false;
            }
        }
    }


    console.log("Crafting...")
    let complete = false;
    if (craftingTable) {
        await bot.lookAt(craftingTable.position);
    }
    function reopen() {
        if (complete) return;
        bot.activateBlock(bot.blockAt(bot.crafter.craftingTablePosition));
        setTimeout(reopen, 10000);
    }
    setTimeout(reopen, 10000);
    await bot.craft(recipe, 1, craftingTable);
    complete = true;
    await sleep(200);
    console.log("Craft complete, storing...");
    await botStoreItem(bot, itemId, bot.crafter.outputPosition);

    return true;
}

async function botTakeItem(bot, itemId, amount, chestPosition) {
    bot.watchdog.kick();
    await bot.lookAt(chestPosition);
    await bot.unequip("hand");
    bot.watchdog.kick();
    const chestBlock = bot.blockAt(chestPosition);
    const chest = await bot.smartOpenContainer(chestBlock);
    // Copy-pasted from https://github.com/PrismarineJS/mineflayer/blob/master/examples/chest.js
    async function withdrawItem (type, amount) {
        const item = itemsById(chest.containerItems(), type)
        if (item) {
            try {
                await chest.withdraw(type, null, amount)
                console.log(`withdrew ${amount} ${item.name}`)
                return true
            } catch (err) {
                console.log(`unable to withdraw ${amount} ${item.name}`)
                return false
            }
        } else {
            console.log(`unknown item id ${type}`)
            return false
        }
    }
    let ret = await withdrawItem(itemId, amount);
    // End of copy-pasted part
    bot.watchdog.kick();
    return ret;
}

async function botStoreItem(bot, itemType, chestPosition) {
    bot.watchdog.kick();
    await sleep(100);
    try {
        let count = inventory.countItemById(bot, itemType);
        await bot.lookAt(chestPosition);
        const chest = await bot.smartOpenContainer(bot.blockAt(chestPosition));
        console.log(`Depositing ${count} blocks of ${itemType} ...`);
        await chest.deposit(itemType, null, count);
        chest.close();
        await sleep(200);
    } catch (err) {
        console.log(err);
    }
    bot.watchdog.kick();
}

function sleep(ms) {
    return new Promise((resolve, reject) => setTimeout(resolve, ms));
}

module.exports = { makeCrafter };
