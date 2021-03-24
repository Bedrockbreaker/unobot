import Discord from "discord.js";
import Canvas from "canvas";
import {Core, Player, Pile, Card} from "./core.js"; // Pile and Card are imported for console use. They are not directly used in this file.

// Load card games
import baseUno from "./uno.js";
import baseExkit from "./exkit.js";
import baseWiki from "./wiki.js";
import basePhase from "./phase.js";

const bot = new Discord.Client();
const {createCanvas, loadImg} = Canvas;
let exited = false;

const globalGames = new Map();
globalGames.set("players", {});

bot.on("warn", console.warn);
bot.on("error", console.error);
bot.on("ready", () => {
	console.log(`Logged in as ${bot.user.tag}`);
	bot.user.setActivity("Card Games - !help", {type: "PLAYING"});
});

bot.on("message", async msg => {
	if (exited && (!msg.content.startsWith("log exit()") || msg.member.id !== "224285881383518208")) return;
	const args = msg.content.split(" ");
	const channel = msg.channel;
	const member = msg.member || msg.author;
	const globalPlayers = globalGames.get("players");
	/**@type {?Discord.Guild} */
	const guild = msg.guild || globalPlayers[member.id];
	/**@type {Core} */
	const serverGame = guild ? globalGames.get(guild.id) : null;
	if (msg.content.startsWith("!")) {
		const isLeader = serverGame?.players[member.id]?.isLeader || (member instanceof Discord.GuildMember ? member.hasPermission("MANAGE_CHANNELS") : false);
		if (serverGame && serverGame.meta.timeLimit > 0 && serverGame.meta.phase > 2) serverGame.resetTimeLimit();
		switch (args[0].substr(1).toLowerCase()) {
			// TODO: add a command which saves the current rule settings as the default for next games. (Only available for discord admin.)
			case "help":
				channel.send("https://github.com/Bedrockbreaker/unobot/wiki");
				break;
			case "p":
			case "play":
				if (!guild) return;
				if (serverGame) return channel.send("A game is already in progress!");
				if (globalPlayers[member.id]) return channel.send("You're already in a game in a different server!");
				if (args.length === 1) return channel.send("Usage: `!(p|play) 𝘨𝘢𝘮𝘦`. Playable games: `uno`, `explodingKittens`");
				let newGame;
				switch (args.slice(1).join(" ").toLowerCase()) {
					case "exploding":
					case "kittens":
					case "explodingkittens":
					case "exploding kittens":
					case "exkit":
					case "ek":
						newGame = new baseExkit(channel);
						break;
					case "phase":
					case "phase10":
					case "phase 10":
					case "phaseten":
					case "phase ten":
					case "p10":
						newGame = new basePhase(channel);
						break;
					case "uno":
						newGame = new baseUno(channel);
						break;
					case "wiki":
					case "wikipedia":
					case "wikigame":
					case "wiki game":
					case "wikipediagame":
					case "wikipedia game":
						newGame = new baseWiki(channel);
						break;
					default:
						return channel.send(`\`${args.slice(1).join(" ")}\` isn't a recognized game!`);
				}
				newGame.addPlayer(member, true);
				globalGames.set(guild.id, newGame);
				globalPlayers[member.id] = guild;
				channel.send(`Who's joining \`${newGame.meta.title}\`? (Type \`!join\` to join. When finished, type \`!start\`)\nPlayers: ${member.displayName}`);
				break;
			case "j":
			case "join":
				if (!serverGame) return channel.send("Usage: `!(j|join)`. Joins a game currently accepting players. Type `!play` to start a game!");
				if (serverGame.players.hasOwnProperty(member.id)) return channel.send("You're already in that game!");
				if (serverGame.meta.phase >= 2) return channel.send("This game currently isn't accepting players!");
				if (globalPlayers[member.id]) return channel.send("You're already in a different game in a different server!");
				serverGame.addPlayer(member, false);
				globalPlayers[member.id] = guild;
				channel.send(`Who's joining \`${serverGame.meta.title}\`? (Type \`!join\` to join. When finished, type \`!start\`)\nPlayers: ${Object.values(serverGame.players).map(player => player.member.displayName).join(", ")}`);
				break;
			case "s":
			case "start":
				if (!serverGame) return channel.send("Usage: `!(s|start)`. Starts an existing game. Type `!play` to begin playing a game.");
				if (!isLeader) return channel.send("Only the leader can start the game!");
				if (serverGame.meta.phase >= 2) return channel.send("The game has already started!");
				if (serverGame.meta.phase < 1) {
					serverGame.meta.phase = 1;
					serverGame.setup();
					if (serverGame.displayRules()) return;
				}
				serverGame.start();
				break;
			case "v":
			case "vote":
				if (!serverGame) return channel.send("Usage: `!(v|vote)`. Toggles voting on deciding active game rules. Type `!play` to begin playing a game.");
				if (!isLeader) return channel.send("Only the leader can start the game!");
				if (serverGame.meta.phase >= 2) return channel.send("The game has already started!");
				serverGame.meta.voting = !serverGame.meta.voting;
				channel.send(`Voting ${serverGame.meta.voting ? "enabled!" : "disabled!"}`);
				break;
			case "quit":
				if (!serverGame) return channel.send("Usage: `!quit`. Quit from a game you have currently joined. Start a game with `!play`");
				if (!serverGame.players.hasOwnProperty(member.id)) return channel.send("You can't quit from a game you haven't joined!");
				serverGame.removePlayer(serverGame.players[member.id]);
				delete globalPlayers[member.id];
				if (Object.keys(serverGame.players).length !== 0) return channel.send(`Bye <@${member.id}>!`);
				globalGames.delete(guild.id);
				channel.send("Stopping game..");
				break;
			case "kick":
				if (!serverGame) return channel.send("Usage: `!kick 𝘯𝘢𝘮𝘦`. Kicks the mentioned player from the current game (accepts @, name, or nickname). Start a game with `!play`");
				if (!isLeader) return channel.send("Only the leader can kick people!");
				const player2 = serverGame.getPlayers(args[1]);
				if (player2.length > 1) return channel.send(`Be more specific! \`${args[1]}\` matched multiple players`);
				if (!player2.length) return channel.send("Could not find that player");
				player2 = player2[0];
				serverGame.removePlayer(player2);
				delete globalPlayers[player2.member.id];
				if (Object.keys(serverGame.players).length !== 0) return channel.send(`Kicked <@${player2.member.id}>`);
				globalGames.delete(guild.id);
				channel.send("Stopping game..");
				break;
			case "tl":
			case "timelimit":
				return channel.send("Unimplemented!");
				if (!serverGame) return channel.send("Usage: `!(tl|timelimit) 𝘯𝘶𝘮`. Changes the turn time limit to *num* seconds. If set to 0, the time limit is disabled. Start a game with `!play`");
				if (!isLeader) return channel.send("Only the leader can change that!");
				if (isNaN(Number(args[1]))) return channel.send(args[1] === undefined ? "Please specify a number!" : `\`${args[1]}\` is not a valid number!`);
				serverGame.meta.timeLimit = Math.abs(Math.floor(Number(args[1])));
				serverGame.resetTimeLimit();
				channel.send(`Changed the turn time limit to ${serverGame.meta.timeLimit} seconds`);
				break;
			case "endgame":
				if (!serverGame) return channel.send("Usage: `!endgame`. Abruptly ends the game. Start a game with `!play`");
				if (!isLeader) return channel.send("Only the leader can abruptly end the game!");
				Object.keys(serverGame.players).forEach(playerID => delete globalPlayers[playerID]);
				globalGames.delete(guild.id);
				channel.send("Stopping game..");
				break;
			default:
				if (!serverGame) return;
				serverGame.discard([args[0].substring(1), ...args.slice(1)], member, channel);
				delete globalPlayers[serverGame.meta.deletePlayer]; // Since most of the time deletePlayer is 0, this won't do anything. It just continues silently.
				serverGame.meta.deletePlayer = 0;
				if (serverGame.meta.ended) {
					Object.keys(serverGame.players).forEach(playerID => delete globalPlayers[playerID]);
					globalGames.delete(guild.id);
				}
				break;
		}
	}
	if (member.id === "224285881383518208") {

		const me = serverGame?.players[member.id]; // For console use
		const it = serverGame?.players[bot.user.id];
		const debugDisplay = () => {
			const embed = new Discord.MessageEmbed()
				.setTitle("Debug")
				.setDescription("Display")
				.attachFiles(new Discord.MessageAttachment(serverGame.render.canvas.toBuffer(), "game.png"))
				.setImage("attachment://game.png");
			channel.send(embed);
		}

		switch(args[0]) {
			case "log":
				try {
					const ans = eval(args.splice(1).join(" "));
					console.log(ans);
				} catch(err) {
					console.error(err);
				}
				break;
			case "msg":
				try {
					const ans = eval(args.splice(1).join(" "));
					if (typeof ans === "undefined") ans = "undefined";
					if (ans === null) ans = "null";
					if (!ans && ans !== 0) ans = ans.toString();
					channel.send(ans);
				} catch(err) {
					channel.send(err);
				}
				break;
			case "del":
				if (isNaN(Number(args[1]))) return;
				channel.messages.fetch({ limit: Number(args[1])+1 }).then(msgColl => channel.bulkDelete(msgColl).then(delMsgs => console.log(`deleted ${delMsgs.size-1} messages`)));
				break;
		}
	}
});

// Used when I use discord as a console. Allows me to disable the hosted bot temporarily, and use the dev bot instead.
function exit() {
	if (typeof auth === "undefined") {
		exited = !exited;
		return exited ? "Manually exiting..." : "Coming back online!";
	}
	return "Don't worry, I'm still alive!";
}
bot.login(process.env.token);