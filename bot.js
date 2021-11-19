import {ButtonInteraction, Client, Collection, CommandInteraction, DiscordAPIError, GuildMember, Intents, Message, MessageActionRow, MessageAttachment, MessageButton, MessageEmbed, MessageSelectMenu, SelectMenuInteraction} from "discord.js";
import Canvas from "canvas";
import {Core, Util, Color, Player, Pile, Card} from "./core.js";
const auth = await loadAuth();

// Load card games
import baseUno from "./uno.js";
import baseExkit from "./exkit.js";
import baseWiki from "./wiki.js";
import basePhase from "./phase.js";
//import baseMille from "./mille.js";
//import baseRamen from "./ramen.js";
//import baseFlux from "./flux.js";
//import baseMdeal from "./mdeal.js";

const welcomeMessages = ["$0 just joined the game - glhf!", "$0 just joined. Everyone, look busy!", "$0 just joined. Can I get a heal?", "$0 joined your party.", "$0 joined. You must construct additional pylons.",
	"Ermagherd. $0 is here.", "Welcome, $0. Stay a while and listen.", "Welcome, $0. We were expecting you ( ͡° ͜ʖ ͡°)", "Welcome, $0. We hope you brought pizza.", "Welcome $0. Leave your weapons by the door.",
	"A wild $0 appeared.", "Swoooosh. $0 just landed.", "Brace yourselves. $0 just joined the server.", "$0 just joined. Hide your bananas.", "$0 just arrived. Sees OP - please nerf.", "$0 just slid into the game.",
	"A $0 has spawned in the server.", "Big $0 showed up!", "Where's $0? In the game!", "$0 hopped into the game. Kangaroo!!", "$0 just showed up. Hold my beer.", "Challenger approaching - $0 has appeared!",
	"It's a bird! It's a plane! Nevermind, it's just $0.", "It's $0! Prase the sun! \\\\[T]/", "Never goona give $0 up. Never gonna let $0 down.", "Ha! $0 has joined! You activated my trap card!",
	"Cheers, love! $0's here!", "Hey! Listen! $0 has joined!", "We've been expecting you $0", "It's dangerous to go alone, take $0!", "$0 has joined the game! It's super effective!", "$0 is here, as the prophecy foretold",
	"$0 has arrived. Party's over.", "Ready player $0", "$0 is here to kick butt and chew bubblegum. And $0 is all out of gum.", "Hello, Is it $0 you're looking for?", "Roses are red, violets are blue, $0 joined this game with you"];

const bot = new Client({intents: [Intents.FLAGS.GUILDS], failIfNotExists: false});
let mem; // Persistent variable for /log
/**@type {Map<string, Core>} */
const global = new Map();
global._delete = global.delete;
global.delete = (key) => {
	const game = global.get(key);
	if (!game) return;
	global._delete(key);
	game.meta.thread.setName(`${game.meta.title} - Finished`)
		.then(thread => thread.setLocked(true))
		.then(thread => thread.setArchived(true));
}

bot.on("warn", console.warn);
bot.on("error", console.error);
process.on("uncaughtException", err => {
	if (err instanceof DiscordAPIError) {
		console.error(err);
		console.error(err.requestData.json.data);
	}
	else throw err;
});
bot.once("ready", () => {
	console.log(`Logged in as ${bot.user.tag}`);
	bot.user.setActivity("Card Games・/help", {type: "PLAYING"});
});

bot.on("interactionCreate", async (/**@type {import("discord.js").MessageComponentInteraction} */action) => {
	if (action.guildId === "563223150012268567" && auth === process.env) return;
	try {
		if (action.isCommand()) return handleCommand(action);
		if (action.isButton()) return handleButton(action);
		if (action.isSelectMenu()) return handleSelection(action);
		Util.UnknownInteraction(action);
	} catch(err) {
		console.error(err);
		action.reply(`Oops. (Report this to https://github.com/Bedrockbreaker/unobot/issues)\n\`\`\`js\n${err.stack}\`\`\``);
	}
});

// Avoid memory leaks
bot.on("threadUpdate", async (_, thread) => {
	if (thread.archived || thread.locked) global._delete(thread.guildId + thread.id);
});
bot.on("threadDelete", async thread => global._delete(thread.guildId + thread.id));

// Prevent stupid crashes from deleting important messages
bot.on("messageDelete", async message => {
	const game = global.get(message.guildId + message.channelId);
	if (!game) return;
	switch (message.id) {
		case game.meta.settingsMessage.id:
			return game.meta.settingsMessage = null;
		case game.meta.gameMessage.id:
			return game.meta.gameMessage = null;
	}
});

/**
 * @param {CommandInteraction} action 
 * @returns {void}
 */
function handleCommand(action) {
	const command = action.commandName;
	/**@type {GuildMember} */
	const member = action.member;
	const game = global.get(action.guildId + action.channelId);
	const player = game?.players.get(member.id);
	const isLeader = player?.isLeader;

	if (game?.meta.ended) global.delete(action.guildId + action.channelId);
	// TODO: add a command which saves the current rule settings as the default for next games. (Only available for discord admin.)
	switch(command) {
		case "help":
			help(action, action.options.getString("command")?.toLowerCase().split(" ") || ["help"]);
			break;
		case "play": {
			if (action.channel.isThread()) return action.reply({content: "You can't start a game in an already existing thread!", ephemeral: true});			
			play(action, action.options.getString("game"));
			break;
		}
		case "join":
			if (!action.channel.isThread()) return action.reply({content: "This isn't a thread with an active game. Start one with `/play`", ephemeral: true});
			if (!game) return action.reply({content: "There is no game to join here! Start one with `/play`", ephemeral: true});
			if (player) return action.reply({content: "You're already in that game!", ephemeral: true});
			if (game.meta.phase >= 2) return action.reply({content: "This game currently isn't accepting players", ephemeral: true});
			join(action, game, member);
			break;
		case "start":
			if (!action.channel.isThread()) return action.reply({content: "This isn't a thread with an active game. Start one with `/play`", ephemeral: true});
			if (!game) return action.reply({content: "There is no game to start here! Start one with `/play`", ephemeral: true});
			if (!isLeader) return action.reply({content: "Only the Leader can start the game!", ephemeral: true});
			if (game.meta.phase >= 2) return action.reply({content: "The game has already started.", ephemeral: true});
			start(action, game);
			break;
//		case "tl":
//		case "timelimit":
//			return channel.send("Unimplemented!");
//			/*
//			if (!serverGame) return channel.send("Usage: `!(tl|timelimit) 𝘯𝘶𝘮`. Changes the turn time limit to *num* seconds. If set to 0, the time limit is disabled. Start a game with `!play`");
//			if (!isLeader) return channel.send("Only the leader can change that!");
//			if (isNaN(Number(args[1]))) return channel.send(args[1] === undefined ? "Please specify a number!" : `\`${args[1]}\` is not a valid number!`);
//			serverGame.meta.timeLimit = Math.abs(Math.floor(Number(args[1])));
//			serverGame.resetTimeLimit();
//			channel.send(`Changed the turn time limit to ${serverGame.meta.timeLimit} seconds`);
//			break;
		case "vote": {
			if (!action.channel.isThread()) return action.reply({content: "This isn't a thread with an active game. Start one with `/play`", ephemeral: true});
			if (!game) return action.reply({content: "There aren't any politics here -- we're in the pre-*game*brian age! Start one with `/play`", ephemeral: true});
			const state = action.options.getString("state");
			if (!state) return action.reply({content: `Voting is ${game.meta.voting ? "enabled" : "disabled"}.`, ephemeral: true});
			if (!isLeader) return action.reply({content: "Only the Leader can change government policies!", ephemeral: true});
			game.meta.voting = state === "Enabled";
			if (game.meta.settingsMessage) game.meta.settingsMessage.edit(game.displaySettings());
			action.reply(`Voting is now ${game.meta.voting ? "enabled" : "disabled"}.`);
			break;
		}
		case "quit":
			if (!action.channel.isThread()) return action.reply({content: "This isn't a thread with an active game. Start one with `/play`", ephemeral: true});
			if (!game) return action.reply({content: "There is no game to quit here! Start one with `/play`", ephemeral: true});
			if (!player) return action.reply({content: "You aren't a part of the game to begin with.", ephemeral: true});
			game.removePlayer(player);
			if (game.players.size > 1) return action.reply(`Bye, ${member.displayName}!`);
			action.reply("Stopping game...");
			global.delete(action.guildId + action.channelId);
			break;
		case "kick": {
			if (!action.channel.isThread()) return action.reply({content: "This isn't a thread with an active game. Start one with `/play`", ephemeral: true});
			if (!game) return action.reply({content: "There is no game here to kick players from! Start one with `/play`", ephemeral: true});
			if (!isLeader) return action.reply({content: "Only the Leader can kick players", ephemeral: true});
			const player2 = action.options.getUser("player");
			if (!game.players.has(player2.id)) return action.reply({content: "That player isn't in the game!", ephemeral: true});
			game.removePlayer(game.players.get(player2.id));
			if (game.players.size > 1) return action.reply(`Kicked ${player2.username} from the game`);
			action.reply("Stopping game...");
			global.delete(action.guildId + action.channelId);
			break;
		}
		case "endgame":
			if (!action.channel.isThread()) return action.reply({content: "This isn't a thread with an active game. Start one with `/play`", ephemeral: true});
			if (!game) return action.reply({content: "There is no game to end here! Start one with `/play`", ephemeral: true});
			if (!isLeader) return action.reply({content: "Only the Leader can abruptly end games", ephemeral: true});
			action.reply("Stopping game...");
			global.delete(action.guildId + action.channelId);
			break;
		case "hand":
			if (!action.channel.isThread()) return action.reply({content: "This isn't a thread with an active game. Start one with `/play`", ephemeral: true});
			if (!game) return action.reply({content: "There is no game here! Start one with `/play`", ephemeral: true});
			if (!player) return action.reply({content: "You aren't a part of this game!", ephemeral: true});
			hand(action, game, player, action.options.getInteger("page"));
			break;
		case "g":
			if (!action.channel.isThread()) return action.reply({content: "This isn't a thread with an active game. Start one with `/play`", ephemeral: true});
			if (!game) return action.reply({content: "There is no game here! Start one with `/play`", ephemeral: true});
			game.handleCommand(action, action.options.getString("command").split(" "));
			if (game.meta.ended) global.delete(game.id);
			break;
		case "log":
			if (member.id !== "224285881383518208") return action.reply({content: "You can't use that command", ephemeral: true});
			// "Console" through discord
			const me = game?.players.get(member.id);
			const debugDisplay = () => {
				const embed = new MessageEmbed()
					.setTitle("Debug")
					.setDescription("Display")
					.setImage("attachment://game.png");
				action.editReply({embeds: [embed], files: [new MessageAttachment(game.render.canvas.toBuffer(), "game.png")]});
			}
			action.deferReply({ephemeral: true})
				.then(() => new Promise(res => res(eval(action.options.getString("code")))))
				.then(ans => {
					console.log(ans);
					action.editReply({content: `\`\`\`js\n${`${ans}`.substring(0,1991)}\`\`\``});
				}).catch(ans => {
					console.error(ans);
					action.editReply({content: `\`\`\`js\n${`${ans}`.substring(0,1991)}\`\`\``});
				});
			break;
		default:
			Util.UnknownInteraction(action);
			break;
	}
}

/**
 * @param {ButtonInteraction} action
 * @returns {void}
 */
function handleButton(action) {
	const btnid = action.customId.split(" ");
	/**@type {GuildMember} */
	const member = action.member;
	const game = global.get(action.guildId + action.channelId);
	const player = game?.players.get(member.id);

	if (game?.meta.ended) global.delete(action.guildId + action.channelId);
	switch (btnid[0]) {
		case "join": {
			const game2 = game || global.get(btnid[1]);
			if (!game2) return action.reply({content: "That game no longer exists", ephemeral: true});
			const player2 = player || game2.players.get(member.id);
			if (player2) return action.reply({content: "You're already in that game!", ephemeral: true});
			if (game2.meta.phase >= 2) return action.reply({content: "This game currently isn't accepting players", ephemeral: true}); // Shouldn't ever be called, but there just in case
			join(action, game2, member);
			break;
		}
		case "start": {
			const game2 = game || global.get(btnid[1]);
			if (!game2) return action.reply({content: "That game no longer exists", ephemeral: true});
			if (!game2.players.get(member.id)?.isLeader) return action.reply({content: "Only the Leader can start the game!", ephemeral: true}); // Shouldn't ever be called, but there just in case
			if (game2.meta.phase >= 2) return action.reply({content: "The game has already started.", ephemeral: true}); // ^^
			start(action, game2);
			break;
		}
		case "hand":
			if (!game) return action.reply({content: "That game no longer exists", ephemeral: true});
			if (!player) return action.reply({content: "You're aren't a part of this game!", ephemeral: true});
			hand(action, game, player, btnid[1], btnid[2]);
			break;
		case "game":
			if (!game) return action.reply({content: "That game no longer exists", ephemeral: true});
			game.handleCommand(action, btnid.slice(1));
			if (game.meta.ended) global.delete(game.id);
			break;
		default:
			Util.UnknownInteraction(action);
			break;
	}
}

/**
 * @param {SelectMenuInteraction} action
 * @returns {void}
 */
function handleSelection(action) {
	const selectid = action.customId.split(" ");
	const game = global.get(action.guildId + action.channelId);

	if (game?.meta.ended) global.delete(action.guildId + action.channelId);
	// TODO: slight refactor to all games: select menu and button ids don't need "game" exactly anymore:
	if (!game) return action.reply({content: "That game no longer exists", ephemeral: true});
	game.handleCommand(action, [...selectid.slice(1), ...action.values.flatMap(value => value.split(" "))]);
	if (game.meta.ended) global.delete(game.id);
}

/**
 * @param {CommandInteraction | ButtonInteraction} action
 * @param {string[]} command
 */
function help(action, command) {
	const embed = new MessageEmbed();
	embed.setTitle(`Help for \`/${command.join(" ")}\``).setDescription("[Browse Commands](https://github.com/Bedrockbreaker/unobot/wiki)");
	switch(command[0]) {
		case "help":
			embed.addField("/help <command>", "General help command. Use this to receive information on using other commands.\nEx: `/help play`").setColor(Color.White);
			break;
		case "play":
			embed.addField("/play <game>", "Creates a new game in a new thread, and designates you as the Leader.\nUse `/help games` for a list of playable games. \nEx: `/play uno`").setColor(Color.Forest);
			break;
		case "games":
			embed.setTitle("List of Playable Games")
				.addFields(
					{name: "With more to come!", value: "Use `/help <game>` for help with that game's commands"},
					{name: "Uno", value: "`/help uno`", inline: true},
					{name: "Exploding Kittens", value: "`/help kittens`", inline: true},
					{name: "The Wikipedia Game", value: "`/help wikigame`", inline: true},
					{name: "Phase 10", value: "`/help phase10`", inline: true},
					{name: "Mille Bornes", value: "`/help millebornes`", inline: true},
					{name: "Ramen Fury", value: "`/help ramenfury`", inline: true},
					{name: "Flux", value: "`/help flux`", inline: true},
					{name: "Monopoly Deal", value: "`/help monopoly`", inline: true})
				.setColor(Color.randomColor());
			break;
		case "join":
			embed.addField("/join", "Joins the game active within this thread.\nEx: `/join`").setColor(Color.Forest);
			break;
		case "start":
			embed.addField("/start", "Starts an existing game. Leader-Only.\nEx: `/start`").setColor(Color.Forest);
			break;
		case "vote":
			embed.addField("/vote [Enable|Disable]", "Controls whether majority-rules voting is the deciding factor on game settings.\nOtherwise, only the Leader controls the settings. Use `/vote` by itself to check the current setting.\nLeader-Only. Default: `disabled`\nEx: `/vote disable`").setColor(Color.randomColor());
			break;
		case "quit":
			embed.addField("/quit", "Quits from the game you're a part of.\nEx: `/quit`").setColor(Color.Carmine);
			break;
		case "kick":
			embed.addField("/kick <player>", `Kicks a player from the game in this thread. Leader-Only.\nEx: \`/kick @${Util.weighted([action.member.displayName, 99], "your mom")}\``).setColor(Color.Carmine);
			break;
		case "timelimit":
			embed.addField("/timelimit <int>", "Changes the time limit per turn, in seconds. 0 means no limit.\nLeader-Only. Default: `0`\nEx: `/timelimit 300`").setColor(Color.randomColor());
			break;
		case "endgame":
			embed.addField("/endgame", "Abruptly ends the game. Leader-only.\nEx: `/endgame`").setColor(Color.Carmine);
			break;
		case "uno":
			baseUno.help(embed, command.slice(1));
			break;
		case "wikigame":
			baseWiki.help(embed, command.slice(1));
			break;
		case "phase10":
			basePhase.help(embed, command.slice(1));
			break;
		case "kittens":
			baseExkit.help(embed, command.slice(1));
			break;
		default:
			embed.addField("Unknown command", "Did you spell it correctly?").setColor(Color.Carmine);
			break;
	}
	return action.reply({embeds: [embed], ephemeral: true});
}

/**
 * @param {CommandInteraction | ButtonInteraction} action
 * @param {string} name
 */
function play(action, name) {
	// TODO: private games with private threads
	return action.reply({content: `Everyone, press **Join** to play **${name}**!`, fetchReply: true})
		.then((/**@type {Message}*/message) => message.startThread({name: `${name} - Joinable`, autoArchiveDuration: 60, reason: `Starting a new game of ${name}`}))
		.then(thread => {
			thread.send(Util.parseString(Util.weighted(...welcomeMessages), `<@!${action.member.id}>`));
			action.editReply({components: [new MessageActionRow().addComponents(new MessageButton().setCustomId(`join ${thread.guildId}${thread.id}`).setLabel("Join").setStyle("PRIMARY"))]});
			action.followUp({content: "Press **Start** once everyone's in!", components: [new MessageActionRow().addComponents(new MessageButton().setCustomId(`start ${thread.guildId}${thread.id}`).setLabel("Start").setStyle("SECONDARY"))], ephemeral: true});

			/**@type {Core} */
			let newGame;
			switch(name) {
				case "Uno":
					newGame = new baseUno(thread);
					break;
				case "Exploding Kittens":
					newGame = new baseExkit(thread);
					break;
				case "The Wikipedia Game":
					newGame = new baseWiki(thread);
					break;
				case "Phase 10":
					newGame = new basePhase(thread);
					break;
				case "Mille Bornes":
					newGame = new baseMille(thread);
					break;
			}
			newGame.addPlayer(action.member, true);
			global.set(action.guildId + thread.id, newGame);
		});
}

/**
 * @param {CommandInteraction | ButtonInteraction} action
 * @param {Core} game 
 * @param {GuildMember} member 
 */
function join(action, game, member) {
	game.addPlayer(member);
	game.meta.thread.send(Util.parseString(Util.weighted(...welcomeMessages), `<@!${action.member.id}>`));
	action.reply({content: "Joined!", ephemeral: true});
}

/**
 * @param {CommandInteraction | ButtonInteraction} action
 * @param {Core} game 
 */
function start(action, game) {
	if (game.meta.phase < 1) {
		game.meta.phase = 1;
		game.setup();
		const display = game.displaySettings();
		if (display) {
			game.meta.thread.send(display).then(message => game.meta.settingsMessage = message);
			return Util.update(action, {content: "Started!", ephemeral: true}, {content: "Press **Start** again, once the settings are finished being changed", components: [], ephemeral: true});
		}
	}
	game.start(action);
}

/**
 * Displays an ephemeral embed of the player's hand
 * @param {ButtonInteraction | CommandInteraction} action 
 * @param {Core} game 
 * @param {Player} player 
 * @param {number} page
 * @param {boolean} update
 */
function hand(action, game, player, page, update = false) {
	if (update) return Util.update(action, game.displayHand(player, page));
	action.reply(game.displayHand(player, page));
}

async function loadAuth() {
	try {
		return (await import("./auth.json")).default;
	} catch {
		return process.env;
	}
}

bot.login(auth.token);
