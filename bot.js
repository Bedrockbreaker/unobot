const Discord = require("discord.js");
//const Keyv = require("keyv");
const EH = require("./eventHandler");
const uno = require("./uno.js");
const unoMod = require("./unoMod.js");
const exKit = require("./explodingKittens.js");
const exKitEx = require("./explodingKittensExpansionPacks.js");
const bot = new Discord.Client();
//const event = EH.event;
const game = EH.emitter;
const resetTimeLimit = EH.timeLimit;
/*
const db = eventHandler.db;
let dbGet = eventHandler.dbGet;
let dbSet = eventHandler.dbSet;
*/
let ans = null;
let exited = false;
// Load base card games
uno.load();
unoMod.load();
exKit.load();

const globalGames = new Map();

bot.on("warn", console.warn);
bot.on("error", console.error);
bot.on("ready", () => {
    console.log(`Logged in as ${bot.user.tag}`);
    bot.user.setPresence({ game: { name: "!help" } });
});
//keyv.on("error", console.error);

bot.on("message", async msg => {
    if (exited || msg.guild === null) return;
	const args = msg.content.split(" ");
	const channel = msg.channel;
	const member = msg.member;
	const guild = msg.guild;
    const serverGame = globalGames.get(guild.id);
    const isLeader = serverGame ? member.id === Object.keys(serverGame.players).find(player => serverGame.players[player].isLeader) : false;
	
    if (msg.content[0] === "!") {
        if (serverGame && serverGame.meta.timeLimit > 0 && serverGame.meta.gamePhase > 2) resetTimeLimit(serverGame);
        switch (args[0].substr(1)) {
            case "help":
                channel.send("https://github.com/Bedrockbreaker/unobot/wiki");
                break;
            case "p":
            case "play":
                if (serverGame) return channel.send("A game is already in progress!");
                if (args.length === 1) return channel.send("Usage: `!(p|play) 𝘨𝘢𝘮𝘦`. Playable games: `uno`, `explodingKittens`");
                const games = ["uno", "exploding", "explodingkittens"];
                if (!games.includes(args[1].toLowerCase())) return channel.send(`\`${args[1]}\` isn't a recognized game!`);
                const gameConstruct = {
                    meta: {
                        game: args[1],
                        title: "",
                        channel: channel,
                        msgs: [],
                        actions: [], // String list of players' actions. (discarding, drawing, pretty much doing anything, etc.)
                        gamePhase: 1, // Phase 1 is joining, 2 is rule deciding, 3+ is playing
                        timeLimit: 0,
                        accepting: true,
                        update: true,
                        ended: false, // Just a flag representing if the game has ended
                        currentPlayer: "",
                        rules: {},
                        cardNames: {},
                        cardImgs: {},
                        traits: {}
                    },
                    piles: {}, // For every new pile, a traits object should be associated with it.
                    players: {}
                }
                gameConstruct.players[member.id] = {
                    member: member,
                    cards: [],
                    isLeader: true,
                    index: 0, // index indicates the player order when playing a game, eg. player index 0 plays first.
                    traits: {}
                }
                switch (args[1]) {
                    case "uno":
                        gameConstruct.meta.title = "Uno";
                        break;
                    case "exploding":
                    case "explodingkittens":
                        gameConstruct.meta.title = "Exploding Kittens";
                        gameConstruct.meta.game = "exKit";
                        break;
                }
                globalGames.set(guild.id, gameConstruct);
                channel.send(`Who's joining \`${gameConstruct.meta.title}\`? (Type \`!join\` to join. When finished, type \`!start\`)\nPlayers: <@${member.id}>`)
                    .then(message => gameConstruct.meta.msgs[0] = message);
                break;
            case "j":
            case "join":
                if (!serverGame) return channel.send("Usage: `!(j|join)`. Joins a game currently accepting players. Type `!play` to start a game!");
                if (serverGame.players.hasOwnProperty(member.id)) return channel.send("You're already in that game!");
                if (!serverGame.meta.accepting) return channel.send("This game currently isn't accepting players!");
                if (serverGame.meta.gamePhase > 2) return game.emit("join", serverGame, member); // Let the player join on a game-per-game basis
                serverGame.players[member.id] = {
                    member: member,
                    cards: [],
                    isLeader: false,
                    index: Object.keys(serverGame.players).length,
                    traits: {}
                }
                let formattedNames = `<@${Object.keys(serverGame.players).map(player => guild.members.get(player).id).join(">, <@")}>`
                serverGame.meta.msgs[0].edit(`Who's joining \`${serverGame.meta.title}\`? (Type \`!join\` to join. When finished, type \`!start\`)\nPlayers: ${formattedNames}`);
                break;
            case "s":
            case "start":
                if (!serverGame) return channel.send("Usage: `!(s|start)`. Starts a game. Type `!play` to begin playing a game.");
                if (!isLeader) return channel.send("Only the leader can start the game!");
                if (serverGame.meta.gamePhase > 2) return channel.send("The game has already started!");
                if (serverGame.meta.gamePhase === 1) {
                    serverGame.meta.gamePhase = 2;
                    serverGame.meta.rules = {};
                    game.emit("setup", serverGame);
                    if (Object.keys(serverGame.meta.rules).length) { // If there are custom rules...
                        const rulesEmbed = new Discord.RichEmbed()
                            .setTitle("What rules is this game being played by? (respond by submitting reaction emojis)")
                            .setDescription(`When you are done changing the rules, type \`!start\`\nRule Descriptions: https://github.com/Bedrockbreaker/unobot/wiki/${serverGame.meta.title}#optional-house-rules`)
                            .setColor(Math.floor(Math.random() * 16777215) + 1);
                        for (rule in serverGame.meta.rules) {
                            rulesEmbed.addField(serverGame.meta.rules[rule][0], serverGame.meta.rules[rule][1]);
                        }
                        serverGame.meta.channel.send(rulesEmbed)
                            .then(message => {
                                serverGame.meta.msgs[1] = message;
                                addReaction(message, serverGame.meta.rules, 0);
                            })
                            .then(() => {
                                serverGame.meta.ruleReactor = serverGame.meta.msgs[1].createReactionCollector((reaction, member) => {
                                    return Object.values(serverGame.meta.rules).map(rule => rule[2]).includes(reaction.emoji.name) && member.id === Object.keys(serverGame.players)[0];
                                });
                                serverGame.meta.ruleReactor.on("end", collection => {
                                    const ruleBools = Object.values(serverGame.meta.rules).map(rule => collection.map(reaction => reaction.emoji.name).includes(rule[2]));
                                    for (i in ruleBools) {
                                        serverGame.meta.rules[Object.keys(serverGame.meta.rules)[i]] = ruleBools[i];
                                    }
                                });
                            });
                        return;
                    }
                }
                game.emit("start", serverGame);
                break;
            case "quit":
                if (!serverGame) return channel.send("Usage: `!quit`. Quit from a game you have currently joined. Start a game with `!play`");
                if (!serverGame.players.hasOwnProperty(member.id)) return channel.send("You can't quit from a game you haven't joined!");
                serverGame.meta.gamePhase < 3 ? delete serverGame.players[member.id] : game.emit("quit", serverGame, member, true);
                serverGame.meta.msgs[0].edit(`Who's joining \`${serverGame.meta.title}\`? (Type \`!join\` to join. When finished, type \`!start\`)\nPlayers: <@${Object.keys(serverGame.players).map(player => guild.members.get(player).id).join(">, <@")}>`);
                if (Object.keys(serverGame.players).length !== 0) return channel.send(`Bye <@${member.id}>!`);
                globalGames.delete(guild.id);
                channel.send("Stopping game..");
                break;
            case "kick":
                if (!serverGame) return channel.send("Usage: `!kick @𝘶𝘴𝘦𝘳`. Kicks the mentioned user from the current game. Start a game with `!play`");
                if (!isLeader) return channel.send("Only the leader can kick people!");
                const kickedUser = args[1].replace(/<@!?(\d*)>/, "$1");
                if (!serverGame.players.hasOwnProperty(kickedUser)) return channel.send(`Unable to find ${args[1]}!tAre they in the game? Did you @ them?`);
                serverGame.meta.gamePhase < 3 ? delete serverGame.players[kickedUser] : game.emit("quit", serverGame, member, true);
                serverGame.meta.msgs[0].edit(`Who's joining \`${serverGame.meta.title}\`? (Type \`!join\` to join. When finished, type \`!start\`)\nPlayers: <@${Object.keys(serverGame.players).map(player => guild.members.get(player).id).join(">, <@")}>`);
                if (Object.keys(serverGame.players).length !== 0) return channel.send(`Kicked <@${kickedUser}>`);
                globalGames.delete(guild.id);
                channel.send("Stopping game..");
                break;
            case "tl":
            case "timeLimit":
                if (!serverGame) return channel.send("Usage: `!(tl|timeLimit) 𝘯𝘶𝘮`. Changes the turn time limit to *num* seconds. If set to 0, the time limit is disabled. Start a game with `!play`");
                if (!isLeader) return channel.send("Only the leader can change that!");
                if (isNaN(Number(args[1]))) return channel.send(args[1] === undefined ? "Please specify a number!" : `\`${args[1]}\` is not a valid number!`);
                serverGame.meta.timeLimit = Math.abs(Math.floor(Number(args[1])));
                resetTimeLimit(serverGame);
                channel.send(`Changed the turn time limit to ${serverGame.meta.timeLimit} seconds`);
                break;
            case "mgj":
            case "midgameJoin":
                if (!serverGame) return channel.send("Usage: `!midgameJoin`. Toggles the option to allow people to join in the middle of a game. Defaults to true. Start a game with `!play`");
                if (!isLeader) return channel.send("Only the leader can change that!");
                serverGame.meta.accepting = !serverGame.meta.accepting;
                channel.send(`Currently ${serverGame.meta.accepting ? "A" : "Disa"}llowing people to join mid-game`);
                break;
            case "endGame":
                if (!serverGame) return channel.send("Usage: `!endGame`. Abruptly ends the game. Start a game with `!play`");
                if (!isLeader) return channel.send("Only the leader can abruptly end the game!");
                globalGames.delete(guild.id);
                channel.send("Stopping game..");
                break;
            default:
                if (!serverGame) return;
                 // Play the card/command, then after all mods/base are done with it, update the UI, if applicable.
                serverGame.meta.update = false;
                game.emit("discard", serverGame, args, member);
                setImmediate(() => {
                    if (serverGame.meta.update) { msg.delete(); game.emit("updateUI", serverGame); }
                    serverGame.meta.update = true;
                    setImmediate(() => { if (serverGame.meta.ended) globalGames.delete(guild.id) }); // Delayed further so that the UI can update one final time.
                });
                break;
		}
	}
	if (member && member.id === "224285881383518208") {
		switch(args[0]) {
			case "log":
				try {
					ans = eval(args.splice(1).join(" "));
					console.log(ans);
				} catch(err) {
					console.error(err);
				}
				break;
			case "msg":
				try {
					ans = eval(args.splice(1).join(" "));
					if (!ans) ans = ans.toString();
					channel.send(ans);
				} catch(err) {
					channel.send(err);
				}
                break;
            case "del":
                if (isNaN(Number(args[1]))) return;
                channel.fetchMessages({ limit: Number(args[1])+1 }).then(msgColl => channel.bulkDelete(msgColl).then(delMsgs => console.log(`deleted ${delMsgs.size-1} messages`)));
                break;
		}
	}
    if (["614241181341188159", "449762523353186315", "563223150012268567"].includes(guild.id) && msg.content.match(/([^a-z]|h|a|^)ha([^a-z]|h|a|$)/i)) {
		const ha = new Discord.RichEmbed()
			.setColor(Math.floor(Math.random()*16777215)+1)
			.setImage("https://cdn.discordapp.com/attachments/563223150569979909/612064679581450247/big_ha.png");
		channel.send(ha);
    }
});

bot.on("voiceStateUpdate", (oldMem, newMem) => {
    if (newMem.voiceChannel != undefined && newMem.voiceChannel.id === "614241699820208164") {
		newMem.guild.members.get(newMem.guild.members.map(member => [member.id, member.roles.get("615701598504747010")]).filter(memRole => memRole[1] != undefined)[0][0]).removeRole("615701598504747010", "There exists a new gay baby");
		newMem.addRole("615701598504747010", "Went AFK");
	}
});

function addReaction(message, rules, index) {
    if (index >= Object.keys(rules).length) return;
    if (!Object.values(rules)[index][2]) return addReaction(message, rules, index + 1);
    message.react(Object.values(rules)[index][2]).then(message2 => addReaction(message, rules, index + 1));
}

function exit() {
    if (auth) return;
    exited = true;
    console.log("Manually exiting...");
    //process.exit(0);
}

bot.login(process.env.token);