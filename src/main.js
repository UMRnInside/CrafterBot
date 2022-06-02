const fs = require('fs')
const crafter = require('./crafter');
//console.log(process.argv);

if (process.argv.length < 5 || process.argv.length > 7) {
    console.log('Usage : node main.js <config.json> <host> <port> <name> [<password>]');
    process.exit(1);
}
let host = process.argv[3];
let port = parseInt(process.argv[4]);
let name = process.argv[5];
let password = process.argv[6];
let config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

let bot = crafter.makeCrafter(host, port, name, password, config);
if (!bot) {
    process.exit(1);
}
bot.on('kicked', (reason, loggedIn) => {
    console.log("Kicked:", reason);
    process.exit(0);
});
bot.on("end", (reason) => {
    console.log("Disconnected:", reason);
    process.exit(0);
});

if (config.logChats) {
    bot.on('message', (msg) => {
        const ChatMessage = require('prismarine-chat')(bot.version)
        console.log(new ChatMessage(msg).toString())
    });
}
