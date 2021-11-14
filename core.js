import {Base, Collection, GuildMember, Message, MessageActionRow, MessageButton, MessageComponentInteraction, MessageEmbed, MessageSelectMenu, ThreadChannel} from "discord.js";
import Canvas from "canvas";

/**
 * Provides basic functionality for all games
 */
class Core {
	/**
	 * @param {string} title - The display name of the game
	 * @param {string} id - The combined guildId + threadId reference to this game
	 * @param {ThreadChannel} thread - The thread the game is in
	 * @param {Collection<string, Setting>} [settings] - An object containing the game settings
	 * @param {Collection<string, Pile>} [piles] - An object containing all of the card piles in the game
	 * @param {Collection<string, Player>} [players] - An object which holds all the players in a game
	 * @param {Number} [dy] - Height in pixels that rendering per player takes up
	 * @param {Number} [timeLimit] - The time limit, in seconds, for each player on their turn. 0 means no limit
	 * @param {Number} [phase] - The current phase of the game. <1 is joining, [1,2) is setup, >=2 is playing
	 * @param {Player} [currentPlayer] - The current player, according to whose turn it is
	 * @param {string[]} [actionHistory] - A history of players' actions
	*/
	constructor(title, thread, settings = new Collection(), piles = new Collection(), players = new Collection(), dy = 80, timeLimit = 0, phase = 0, currentPlayer, actionHistory = []) {
		
		this.meta = {
			/** The display name of the game */
			title: title,
			/** The thread the game is in */
			thread: thread,
			/** List of settings */
			settings: settings,
			/** The time limit, in seconds, for each player on their turn. 0 means no limit */
			timeLimit: timeLimit,
			/** The current phase of the game. `<1` is joining, `[1,2)` is setup, `>=2` is playing */
			phase: phase,
			/** A history of players' actions */
			actionHistory: actionHistory,
			/** Whether voting is allowed to determine which rules are active */
			voting: false,
			/** Whether the game has ended or not */
			ended: false,
			/**
			 * Reference to the last displayed settings message
			 * @type {Message}
			 */
			settingsMessage: null,
			/**
			 * Reference to the last displayed game message (card table)
			 * @type {Message}
			 */
			gameMessage: null,
			/**
			 * List of global messages to display to all players
			 * @type {string[]}
			 */
			messages: []
		}
		/** The current player, according to whose turn it is */
		this.currentPlayer = currentPlayer;
		/** Piles of cards the game contains */
		this.piles = piles;
		/** Players who are in the game */
		this.players = players;
		/** Render Pipeline */
		this.render = new Render(Canvas.createCanvas(850, 500), new Collection(), dy);
		/** A counter which continually ticks up, counting every card ever displayed (used to avoid value collisions in menu select options) */
		this._cardCounter = 0;
	}

	/**
	 * Attempts to find the cards specified from an array of cards. Basically a fancy filter function
	 * @template CardT
	 * @param {CardT[]} cards - The list of cards to search in
	 * @param {string} cardID - The card id of the card
	 * @param {string} [properties] - The object properties a card must have, in "card selection syntax". Any booleans of the card must be false if a value is not specified.
	 * If an array or string is passed, any property keys which aren't set to a specific value, i.e. "marked" default to true.
	 * ```
	 * getCards(player.cards, "r2");
	 * getCards(player.cards, "*", "r,marked,score:>=7/<3,!stolenfrom:bob");
	 * ```
	 * @returns {CardT[]} The list of cards which match
	 */
	static getCards(cards, cardID, properties) {
		// TODO: allow "or-ing" between properties (Needs grouping symbols)
		const props = properties?.split(",").map(key => key.split(":")) || [];
		const rIndex = props.findIndex(pair => ["r", "rand", "random", "randomize", "shuffle"].includes(pair[0]));
		if (rIndex > -1) props.splice(rIndex, 1);
		cards = cards.filter(card => [card.id, "*", "any"].includes(cardID) && props.every(pair => {
			const invert = pair[0].startsWith("!");
			const traitName = pair[0].replace("!","");
			const values = pair[1]?.split("/") || ["true"];
			for (let i = 0; i < values.length; i++) {
				if ((values[i].startsWith(">=") && card[traitName] >= Number(values[i].substring(2))) ||
					(values[i].startsWith(">") && card[traitName] > Number(values[i].substring(1))) ||
					(values[i].startsWith("<=") && card[traitName] <= Number(values[i].substring(2))) ||
					(values[i].startsWith("<") && card[traitName] < Number(values[i].substring(1))) ||
					((!card[traitName] && card[traitName] !== 0 ? "false" : card[traitName].toString()) === values[i])) return !invert;
			}
			return invert;
		}));
		return rIndex > -1 ? Util.shuffle(cards) : cards;
	}

	/**
	 * Returns all players which match the mention, username, or nickname
	 * @param {Collection<string, Player} players - The list of players to search
	 * @param {string} input - The string to match for each player
	 * @returns {Collection<string, Player>} The matching players
	 */
	static getPlayers(players, input) {
		const id = input.replace(/<@!?(\d*)>/, "$1");
		if (input !== id) return players.filter(player => player.member.id === id);
		input = input.replace("#", "").toLowerCase();
		return players.filter(player => (player.member.displayName + player.member.user.discriminator).toLowerCase().includes(input) || (player.member.user.username + player.member.user.discriminator).toLowerCase().includes(input));
	}

	/**
	 * Removes and returns the specified card from the provided array of cards.
	 * @template Card
	 * @param {Card[]} cards 
	 * @param {Card} card 
	 * @returns {Card}
	 */
	static grabCard(cards, card) {
		const i = cards.findIndex(card2 => card2 === card);
		return i === -1 ? undefined : cards.splice(i, 1)[0];
	}

	/**
	 * Responds with a generic "Can't do that right now" ephemeral message
	 * @param {MessageComponentInteraction} action
	 */
	static notYet(action) {
		action.reply({content: Util.weighted("I'm sorry Dave, I'm afraid I can't do that", ["Can't do that right now!", 999]), ephemeral: true});
	}

	/**
	 * A counter which continually ticks up, counting every card ever displayed (used to avoid value collisions in menu select options)
	 */
	get cardCounter() {
		return this._cardCounter++;
	}

	/**
	 * Shortcut for 
	 * ```
	 * this.meta.settings.get(key).value;
	 * ```
	 * @param {string} key 
	 */
	getSetting(key) {
		return this.meta.settings.get(key).value;
	}

	/**
	 * Shortcut for
	 * ```
	 * this.meta.settings.get(key).value = value;
	 * ```
	 * @param {string} key 
	 * @param {*} value 
	 */
	setSetting(key, value) {
		this.meta.settings.get(key).value = value;
	}

	/**
	 * Toggles the member's vote for the provided setting
	 * @param {string} key - The setting to vote for
	 * @param {number} state - The setting's state to vote for
	 * @param {string} memberId - The Id of the member voting
	 */
	voteSetting(key, state, memberId) {
		const setting = this.meta.settings.get(key)?.votes;
		if (!setting?.length) return;
		state = Util.clamp(Util.parseInt(state), 0, setting.length - 1); // Settings are normally applied through the select menu, but some wise guy could use slash commands
		if (isNaN(state)) return;
		const vote = setting[state];
		if (Util.grab(vote, memberId)) return;
		vote.push(memberId);
	}

	/**
	 * Turns the options into a string depending on the setting's votes
	 * 
	 * `[0,0,0...]` => `options[0]`
	 * 
	 * `[0,2,4,1...]` => `options[2]`
	 * 
	 * `[0,2,2,1...]` => `options[1]/options[2] (random)`
	 * @param {string} key - The key of the setting
	 * @param {string[]} options - The string states of the setting
	 */
	displayVote(key, options) {
		const votes = this.meta.settings.get(key).votes;
		const leaderId = this.players.find(player => player.isLeader).member.id;
		let maxVote = 0;
		/**@type {number[]} */
		let votedfor = [];
		for (let i = 0; i < options.length; i++) {
			const num = this.meta.voting ? votes[i].length : (votes[i].includes(leaderId) ? 1 : 0);
			if (num === maxVote) {
				votedfor.push(options[i]);
			} else if (num > maxVote) {
				maxVote = num;
				votedfor = [options[i]];
			}
		}
		if (!maxVote) return options[0];
		if (votedfor.length === 1) return votedfor[0];
		return `${votedfor.join("/")} (random)`;
	}

	/**
	 * Returns the MessageOptions for the settings message
	 * @param {number} page - The page of settings to display
	 * @returns {import("discord.js").MessageOptions?}
	 */
	displaySettings() {
		if (!this.meta.settings.size) return null;
		const leaderId = this.players.find(player => player.isLeader).member.id;
		const embed = new MessageEmbed()
			.setTitle("Game Settings")
			.setDescription(`\`/help ${this.meta.title}\` or [Browse Commands](https://github.com/Bedrockbreaker/unobot/wiki/${this.meta.title.replace(/ /g, "-")})`)
			.setColor(Color.randomColor())
			.addFields(this.meta.settings.filter(rule => rule.name).map(rule => {
				const options = rule.fillOptions();
				return {
					name: Util.parseString(rule.name, ...options),
					value: Util.parseString(rule.description, ...options)
				};
			}))
			.setFooter("To allow voting, use /vote Enable");
		const data = this.meta.settings.map(rule => rule.components).filter(comp => comp).flat();
		const rows = [];
		// TODO: split data into multiple select menus if there's over 25 states for settings
		rows.push(
			new MessageActionRow().addComponents(
				new MessageSelectMenu()
				.setCustomId("game vote")
				.addOptions(data)
				.setMaxValues(data.length)
				.setPlaceholder("Select all Desired Settings")
			),
			new MessageActionRow().addComponents(new MessageButton().setCustomId("start").setLabel("Start").setStyle("PRIMARY"))
		);

		return {embeds: [embed], components: rows};
	}

	/**
	 * Retrieves the votes on the SettingsMessage, and sets the settings accordingly
	 */
	getSettings() {
		const leaderId = this.players.find(player => player.isLeader).member.id;
		for (const [_, setting] of this.meta.settings) {
			if (!setting.votes.length) continue;
			const votes = setting.votes;
			let maxVote = 0;
			/**@type {number[]} */
			let states = [];
			for (let i = 0; i < votes.length; i++) {
				const num = this.meta.voting ? votes[i].length : (votes[i].includes(leaderId) ? 1 : 0);
				if (num === maxVote) {
					states.push(i);
				} else if (num > maxVote) {
					maxVote = num;
					states = [i];
				}
			}
			if (!maxVote) continue; // No need to change the setting's value from its default
			setting.value = Util.shuffle(states)[0]; // Randomly break ties
		}
		this.meta.settingsMessage.edit({components: []});
	}

	/**
	 * Registers mods and caches images
	 */
	setup() {
		this.render.queue(
			() => Canvas.loadImage("images/halo.png").then(image => this.render.images.set("halo", image)),
			() => Canvas.loadImage("images/ping.png").then(image => this.render.images.set("ping", image))
		);
	}

	/**
	 * Generates a default player
	 * @param {GuildMember} member - The member to generate a player for
	 * @param {Boolean} isLeader - Whether the new player is a leader
	 */
	genDefaultPlayer(member, isLeader) {
		return new Player(member, [], isLeader);
	}

	/**
	 * Starts the game
	 * @param {MessageComponentInteraction} action - The Interaction to reply to
	 */
	start(action) {
		this.meta.thread.setName(`${this.meta.title} - Playing`);
		this.render.ctx.fillStyle = Color.toHexString(Color.White);
		this.render.ctx.font = "40px Arial";
		this.drawStatic();
	}

	/**
	 * The catch-all method for any unknown commands.
	 * @virtual
	 * @param {MessageComponentInteraction} action - The Interaction to reply to
	 * @param {string[]} args - The arguments to the command 
	 */
	handleCommand(action, args) {}

	/**
	 * Advances to the next player
	 * @virtual
	 */
	nextPlayer() {}

	/**
	 * Called when the current player has taken too long on their turn
	 * @virtual
	 */
	timeLimit() {}

	/**
	 * Updates the UI displayed in the server
	 * @virtual
	 * @param {MessageComponentInteraction} action - The Interaction to reply to
	 */
	updateUI(action) {}

	/**
	 * Adds a player to the game
	 * @param {GuildMember} member - The member to generate a Player for
	 * @param {Boolean} isLeader - Whether the newly added player is a leader
	 */
	addPlayer(member, isLeader = false) {
		this.players.set(member.id, this.genDefaultPlayer(member, isLeader));
	}

	/**
	 * Removes a player from the game
	 * @param {Player} player - The Player to remove from the game
	 */
	removePlayer(player) {
		if (player === this.currentPlayer) this.nextPlayer();
		this.players.forEach(player2 => {
			if (player2.index > player.index) player2.index--;
		});
		this.players.delete(player.member.id);
		this.drawStatic();
		//this.updateUI(action);
	}

	/**
	 * Randomizes the player order within a game
	 */
	randomizePlayerOrder() {
		let indexes = Util.shuffle([...Array(this.players.size).keys()]);
		this.players.forEach(player => player.index = indexes.pop());
	}

	/**
	 * Resets the time limit for the game
	 */
	/*
	resetTimeLimit() {
		// TODO: end the game if everyone hasn't gone once in row, or 10 min have passed.
		clearTimeout(this.timeLimit);
		if (!this.meta.timeLimit) return;
		this.meta.timeLimit = setTimeout(() => {
			this.timeLimit();
			this.updateUI();
		}, this.meta.timeLimit * 1000);
	}
	*/

	/**
	 * Renders everything which can visually change during the game
	 */
	renderTable() {
		this.render.queue(() => this.render.drawImage(this.render._canvas, 0, 0));
		this.render.queue(() => this.render.drawImage(this.render.images.get("halo"), this.currentPlayer.x - 10, this.currentPlayer.y - 10));
		this.players.forEach(player => {
			if (player.ping) this.render.queue(() => this.render.drawImage(this.render.images.get("ping"), player.x + 66, player.y - 7));
		});
	}

	/** Render static images which don't change during the game onto the table */
	drawStatic() {
		this.render.queue(() => Canvas.loadImage("images/background.png").then(image => this.render.drawImageNow(image, 0, 0)));
		const pLength = this.players.size;
		this.players.sort((player1, player2) => player1.index - player2.index).forEach(player => {
			const i = player.index || pLength; // Moves index 0 to index pLength
			const p = i > Math.ceil(pLength / 2) ? Math.floor(pLength / 2) : Math.ceil(pLength / 2); // Number of players on a specific side of the screen
			const empty = Math.max(0, (450 - this.render.dy * p) / (p + 1)); // Empty space between players, in pixels
			player.x = i > Math.ceil(pLength / 2) ? 40 : 640;
			player.y = 25 + empty + Math.min(empty + this.render.dy, (450 - this.render.dy) / (p - 1)) * (i > Math.ceil(pLength / 2) ? 2 * p + pLength % 2 - i : i - 1);
			this.render.queue(() => Canvas.loadImage(player.member.displayAvatarURL({format: "png", size: 64})).then(image => this.render.drawImageNow(image, player.x, player.y, 80, 80)));
		});
	}

	/** Saves a copy of the canvas with static-only elements */
	saveCanvas() {
		this.render._canvas = Canvas.createCanvas(this.render.canvas.width, this.render.canvas.height);
		this.render._ctx = this.render._canvas.getContext("2d");
		this.render._ctx.drawImage(this.render.canvas, 0, 0);
		return Util.emptyPromise();
	}

	/**
	 * Generates InteractionReplyOptions of the player's hand, at a specified page (25 card increments)
	 * @param {Player} player - the player to display their cards to.
	 * @param {number} page - The page of cards to display (0-indexed)
	 * @returns {import("discord.js").InteractionReplyOptions}
	 */
	displayHand(player, page = 0) {
		if (this.meta.ended) return {content: "Game Ended!", components: [], ephemeral: true};
		if (!player.cards.length) return {content: "You don't have any cards!", components: [], ephemeral: true};
		page = Util.clamp(Math.floor(page), 0, Math.ceil(player.cards.length / 25)); 
		/**@type {MessageActionRow[]} */
		const rows = [];
		rows.push(new MessageActionRow().addComponents(new MessageSelectMenu()
			.setCustomId("game")
			.setPlaceholder(`Your Hand${player.cards.length > 25 ? ` (page ${page + 1} of ${Math.ceil(player.cards.length / 25) + 1})` : ""}`)
			.addOptions(player.cards.sort((card1, card2) => card1.name - card2.name).slice(page * 25, page * 25 + 25).map(card => ({label: card.name, value: `${card.id}  ${this.cardCounter}`})))));
		if (player.cards.length > 25) {
			rows.push(new MessageActionRow().addComponents(
				new MessageButton()
					.setCustomId(`hand ${page - 1} true`)
					.setLabel("🡄 Page")
					.setStyle("PRIMARY")
					.setDisabled(page === 0),
				new MessageButton()
					.setCustomId(`hand ${page + 1} true`)
					.setLabel("🡆 Page")
					.setStyle("PRIMARY")
					.setDisabled(page === Math.ceil(player.cards.length / 25))
			));
		}
		return {content: Util.getQuote(), components: rows, ephemeral: true};
	}

	/**
	 * Draws a number of cards from a pile, and inserts them into a Player's cards
	 * @param {Player} player - The Player which gets the cards
	 * @param {Pile} pile - The Pile to draw cards from
	 * @param {number} numCards - The number of Cards to draw
	 * @returns {Card[]} The newly drawn Cards
	 */
	draw(player, pile, numCards) {
		let newCards = [];
		for (let i = 0; i < numCards; i++) {
			newCards.push(pile.cards.shift());
			if (pile.cards.length === 0) pile.cards = this.deckCreate();
		}
		player.cards.push(...newCards);
		this.dealCards(player);
		return newCards;
	}

	/**
	 * Helper method for resolving a player from a string
	 * @param {string} input 
	 */
	getPlayers(input) {
		return Core.getPlayers(this.players, input);
	}

	/**
	 * Used for /help
	 * @virtual
	 * @param {MessageEmbed} embed 
	 * @param {string[]} command 
	 */
	static help(embed, command) {}
}

/**
 * Utility class
 */
class Util {
	/**
	 * Deep clones the provided object.
	 * Credit to trincot on stackoverflow https://stackoverflow.com/questions/40291987/javascript-deep-clone-object-with-circular-references
	 * @template T
	 * @param {T} obj - The object to clone
	 * @param {WeakMap} hash - hash which stores objects which have already been cloned, allowing circular references.
	 * @returns {T} The cloned object
	 */
	 static deepClone(obj, hash = new WeakMap()) {
		if (Object(obj) !== obj || obj instanceof Function || obj instanceof Render || obj instanceof Base) return obj; // Don't copy items which don't copy nicely :)
		if (hash.has(obj)) return hash.get(obj); // Cyclic reference

		let res;
		try {
        	res = new obj.constructor();
		} catch {
			res = Object.create(Object.getPrototypeOf(obj));
		}
		hash.set(obj, res);
		if (obj instanceof Map) obj.forEach((value, key) => res.set(Util.deepClone(key, hash), Util.deepClone(value, hash)));
		else Object.assign(res, ...Object.keys(obj).map(key => ({[key]: Util.deepClone(obj[key], hash)})));
		return res;
	}

	/**
	 * Returns a MessageSelectOptionData with the options provided
	 * @param {string} id - Each option will have a value of `id optionIndex`
	 * @param {[string, string?][]} options - `[label, description]`
	 * @returns {import("discord.js").MessageSelectOptionData}
	 */
	static Selection(id, options) {
		return options.map((option, i) => ({label: option[0], description: option[1] || "", value: `${id} ${i}`}));
	}

	/**
	 * Replies to the interaction if it was a CommandInteraction.
	 * Otherwise, sends a message to the thread and replies to the Interaction ephemerally with a provided garbage response.
	 * @param {MessageComponentInteraction} action - The action to respond to
	 * @param {string | import("discord.js").InteractionReplyOptions} msgOptions - The reply or message to send
	 * @param {string} [response] - The garbage message to reply with, if the Interaction was not a Command
	 * @param {ThreadChannel} [thread] - The thread to send the message to if the interaction was not a Command
	 */
	static reply(action, msgOptions, response, thread) {
		if (action.isCommand() || !response) return action.reply(msgOptions);
		action.reply({content: response, ephemeral: true});
		if (!msgOptions.ephemeral) return thread.send(msgOptions);
		return Util.emptyPromise();
	}

	/**
	 * Replies to the interaction if it was a CommandInteraction.
	 * Otherwise, updates the message the Interaction was attached to, and sends the reply to the provided Thread
	 * @param {MessageComponentInteraction} action - The action to respond to
	 * @param {string | import("discord.js").InteractionReplyOptions} replyOptions - The reply or message to send
	 * @param {string | import("discord.js").InteractionUpdateOptions} [updateOptions] - The update to the message the Interaction was attached to
	 * @param {ThreadChannel} [thread] - The thread to send the message to if the Interaction was not a Command
	 */
	static update(action, replyOptions, updateOptions, thread) {
		if (action.isCommand()) return action.reply(replyOptions);
		action.update(updateOptions || replyOptions);
		if (!replyOptions.ephemeral) return thread.send(replyOptions);
		return Util.emptyPromise();
	}

	/**
	 * Follows up to the interaction if it was a CommandInteraction.
	 * Otherwise, replies to the Interaction.
	 * @param {MessageComponentInteraction} action - The action to follow up to
	 * @param {string | import("discord.js").InteractionReplyOptions} msgOptions - The follow up to send
	 * @param {string} response - The garbage message to reply with, if the Interaction was not a Command
	 * @param {ThreadChannel} thread - The thread to send the message to if the interaction was not a Command
	 */
	static followUp(action, msgOptions, response = "\u200b", thread) {
		if (action.isCommand()) return action.followUp(msgOptions);
		action.reply({content: response, ephemeral: true});
		if (!msgOptions.ephemeral) return thread.send(msgOptions);
		return Util.emptyPromise();
	}

	/**
	 * Oopsy Woopsy :3
	 * @param {MessageComponentInteraction} action 
	 */
	static UnknownInteraction(action) {
		action.reply({content: "Oopsy woopsy :3\nIt seems I've made a mistakey-wakey rawr xd.\nSeems like yr'uoe nyot suwuposed to do that, boku no little pogchamp～ <3", ephemeral: true});
	}

	/**
	 * Mutates the array and returns the shuffled version.
	 * @template T
	 * @param {T[]} array - The input array to be shuffled
	 * @returns {T[]} The mutated array
	 */
	static shuffle(array) {
		let i, j;
		for (i = array.length - 1; i > 0; i--) {
			j = Math.floor(Math.random() * (i + 1));
			[array[i], array[j]] = [array[j], array[i]];
		}
		return array;
	}

	/** Returns the last item in the array for which the predicate is true, and -1 otherwise.
	 * @template T
	 * @param {T[]} array 
	 * @param {(value:T, index:number, array:T[]) => boolean} predicate 
	 * @returns {number}
	 */
	static findLastIndexOf(array, predicate) {
		for (let l = array.length - 1; l >= 0; l--) {
			if (predicate(array[l], l, array)) return l;
		}
		return -1;
	}

	/**
	 * Given a proper array, with each item having a weighted chance, it will return one item from the list, weighted accordingly.
	 * @template T
	 * @param {(T | [item: T, weight: number])[]} items - the list of items and their weighted chances
	 * @returns {T} The chosen item
	 */
	static weighted(...items) {
		let n = Math.random()*items.reduce((acc, item) => acc + (typeof item[1] === "number" ? item[1] : 1), 0);
		for (let i = 0; i < items.length; i++) {
			n -= typeof items[i][1] === "number" ? items[i][1] : 1;
			if (n <= 0) return typeof items[i][1] === "number" ? items[i][0] : items[i];
		}
	}

	static quotes = ["first", "ALL YOUR BASE ARE BELONG TO US", "...", "Snake. Snake? SNAAAAKE!!", "Poggers", "It's dangerous to go alone! Take this.", "I'm in your walls", "wah", "Wanna have a bad time?", "Hey! Listen!", "Space. Space. I'm in space. SPAAAAAAACE",
		"Do a barrel roll!", "Perfectly Balanced", "Stop right there, criminal scum!", "Make life rue the day it thought it could give Cave Johnson lemons!", "Praise the sun!", "You have contracted dysentery.", "Watch what happens when I cast a spell I don't know!",
		"Kris... WHERE ARE WE?!?!", "Never gonna give you up", "お前は、もう死んでる", "Gotta go fast!", "It's-a me! Chris Pratt", "Club penguin is kil", "But it was me! Dio!", "It's ze spooky month!", "Click those circles", "[[hyperlink blocked]]", "uwu", "Change my mind",
		"Chips Ahoyeth", "#1 Best Dad: Bondrewd", "Linus Drop Tips", "Nyanpasu～", "Do you wanna be a [[BIG SHOT]]", "What the dog doin'?", "That's-a 'Mama Luigi' to you!", "Gamig", "Chaos, Chaos!", "Xnopyt", "W is for Wumbo", "Potassium", "Hello darkness my old friend",
		"The mitochondria is the powerhouse of the cell", "They're Groovin'", "An a press is an a press. You can't say it's only half", "based", "We get there when we get there!", "Bababooey", "~~.:|:;~~", "Hey y'all, Scott here", "We are number one", "But first, let me talk to you about our sponser",
		"JUST. DO IT", "Sorry, but the princess is in another castle", "AHHH! I NEED A MEDIC BAG!", "Skdoo Beep Bop", "Tight bars, little man", "Monkey - Balloon Genocide", "~~SUS~~", "Also try Minecraft!", "I am the milkman. My milk is delicious", "Free bobux",
		"Neat is a mod by Vazkii", "You. Pick up that can.", "Totally 'Accurate' Battle Simulator", "Jebediah Kerman - Ready to Launch", "I will become back my money.", "When you see it ~~727~~", "It's pronounced 'Rules'", "I have 70 alternative accounts!", "Good air!",
		"This pic goes hard. Feel free to screenshot.", "You, my son, will have all the figgy pudding", "amogus", "Haha, what if I put my bed next to yours?", "Updated autopsy report", "Objection!", "Reject humanity, return to monke", "**BONK**", "Oh, you're a villain alright. Just not a **SUPER** one!",
		"Keep talking, and nobody explodes", "Critial Failure: Natural 1", "Critical Success: Natural 20", "I roll to seduce the dragon", "It is Wednesday my dudes", "Engineer Gaming:tm:", "Hey VSauce, Michael here.", "Hello you wonderful people, welcome to the stream.",
		"*Where are your fingers?*", "But nobody came...", "They put mamster chief in da soda", "How 2 Basic", "3 SHOTS FROM KITCHEN GUN", "That's not very cash money of you", "Meowth, that's right!", "Rip and tear, until it is done.", "You just got coconut malled",
		"Get stick bugged", "You've been gnomed", "The floor here is made of floor", "But first, we need to talk about parrellel universes", "Hello World", "Your jordans are fake", "Is mayonaise an instrument?", "Top 10000 Cheese", "Horseradish is not an instrument either.",
		"The name's Jond. Bames Jond.", "Top 10 numbers 1-10", "Number 15: Burger King foot lettuce.", "change da world. my final message. Goodb ye", "Who the heck is Steve Jobs?", "Poyo poyo", "Curse you Perry the Platypus!", "IS THAT FISH JENGA?!?", "Nice throw!",
		":egg:", "Chaos, control!", "Are ya winning son?", "Tentaclar Aliens’ Epic Extraterretterrestrial Jungle Dance Party Inside Of A Super-Ultra-Mega-Gigantic U.F.O. (It Maybe U.U.F.O.) Silently Flying Over Illinois St.", "Welcome to the internet :)", "y'all ain't even ready for this",
		"U.N. Owen was Her?", "i’ll have two number 9s, a number 9 large, a number 6 with extra dip, a number 7, two number 45s, one with cheese, and a large soda.", "↑↑↓↓←→←→BA↵", "b-baka! :flushed:", "We've been trying to reach you about your car's extended warranty.",
		"Developers, Developers, Developers!", "( ͡° ͜ʖ ͡°)", "(∩｀-´)⊃━☆ﾟ.*･｡ﾟ *woosh*, you're now a frog :frog:", "WAS THAT THE BITE OF '87?!?", "oh no! our table! it's broken!", "You must construct additional pylons!", "♪ Big, Big Chungus ♫", "Don't mine at night",
		"Creeper? Aw man.", "Why do they call it an oven, when you of in cold food of out hot eat the food?", "Nooooo, I don't wanna be a sandwich", "bee shape. strong. effecient... connected. straight lines. OPTIMIZED", "I'll take a potato chip.. and EAT IT!"];

	/**
	 * Returns a random quote
	 */
	static getQuote() {
		return Util.weighted(...Util.quotes);
	}

	/**
	 * Add some quotes
	 * @param  {(string | [quote: string, weight: number?])[]} quotes 
	 */
	static addQuotes(...quotes) {
		Util.quotes.push(...quotes);
	}

	/**
	 * Removes and returns the specified item
	 * @template T
	 * @param {array} array - The array to modify
	 * @param {T} item - The item to grab
	 * @returns {T} - The returned item
	 */
	static grab(array, item) {
		const i = array.findIndex(i => i === item);
		return i > -1 ? array.splice(i, 1)[0] : undefined;
	}

	/**
	 * Parses an int from a user-supplied string. Strips any decimal
	 * @param {string} num - The string to parse
	 * @param {boolean} abs - If true, returns the absolute value
	 */
	static parseInt(num, abs = false) {
		const num2 = Math.floor(Number(num));
		return abs ? Math.abs(num2) : num2;
	}

	/**
	 * Clamps a number into a range
	 * @param {number} num - The number to clamp
	 * @param {number} min - The minimum allowed value
	 * @param {number} max - The maximum allowed value
	 */
	static clamp(num, min, max) {
		return Math.min(Math.max(num, min), max);
	}

	/**
	 * Returns `num` if it's not NaN. Otherwise, returns `fallback`
	 * @param {number} num 
	 * @param {number} fallback 
	 */
	static NaNfallback(num, fallback) {
		return isNaN(num) ? fallback : num;
	}

	/**
	 * Replaces every `$N` in the first string with the Nth string in `replacements`
	 * @param {string} string 
	 * @param {string[]} replacements 
	 */
	static parseString(string, ...replacements) {
		return string.replaceAll(/\$(\d+)/g, (_, p1) => replacements[Number(p1)]);
	}

	/**
	 * If `num` is equal to 1, returns the singular suffix. Else, return the plural suffix
	 * @param {number} num - The number to compare
	 * @param {string} [plural="s"] - The string to return if num is not 1
	 * @param {string} [singular=""] - The string to return if num is 1
	 * @returns {string} Either the plural of singular suffix of a word.
	 */
	static plural(num, plural = "s", singular = "") {
		return num === 1 ? singular : plural;
	}

	/**
	 * Empty Promise. Useful for rendering.
	 * @returns {Promise<void>}
	 */
	static emptyPromise() {
		return new Promise((resolve, reject) => resolve());
	}
}

/**
 * A Player object
 */
class Player {
	/**
	 * @param {GuildMember} member - The member associated with the player
	 * @param {Card[]} [cards] - The list of cards in the player's posession
	 * @param {boolean} [isLeader] - If the player is a leader/host over a game
	 * @param {number} [index] - The index of the player in turn-order. 0 is first player
	 */
	constructor(member, cards = [], isLeader = false, index = 0) {
		this.member = member;
		this.cards = cards;
		this.isLeader = isLeader;
		this.index = index;

		/**
		 * The messages to display along side the player's hand.
		 * @type {string[]}
		 */
		this.messages = [];

		/** Whether or not this player has a red notifiaction dot on their avatar */
		this.ping = false;

		/**
		 * The x-coordinate for rendering the player's designated area on the board
		 * @type {number}
		*/
		this.x;
		/**
		 * The y-coordinate for rendering the player's designated area on the board
		 * @type {number}
		*/
		this.y;
	}

	/**
	 * Attempts to find the cards specified from the player's hand.
	 * @param {string} [argument] - The string formatted in "card selection syntax"
	 * @returns {Card[]} The cards which match the specified argument
	 */
	getCards(argument) {
		if (!argument) return [];
		return Core.getCards(this.cards, argument.split(".")[0], argument.split(".")[1]);
	}

	/**
	 * Removes and returns the specified card from the player's hand
	 * @template CardT
	 * @param {CardT} card - The card to remove
	 * @returns {CardT} The same card
	 */
	grabCard(card) {
		return Core.grabCard(this.cards, card);
	}
}

/**
 * A Pile object. Basically a stack of cards that don't belong to a specific player
 */
class Pile {
	/**
	 * @param {Card[]} cards - The cards in the pile
	 */
	constructor(cards = []) {
		this.cards = cards;
	}
	
	/**
	 * Attempts to find the cards specified from the pile.
	 * @param {string} argument - The string formatted in "card selection syntax"
	 * @returns {Card[]}
	 */
	getCards(argument) {
		return Core.getCards(this.cards, argument?.split(".")[0], argument?.split(".")[1]);
	}

	/**
	 * Removes and returns the specified card from the pile's cards
	 * @template Card
	 * @param {Card} card - The card to remove
	 * @returns {Card} The same card
	 */
	grabCard(card) {
		return Core.grabCard(this.cards, card);
	}
}

/**
 * A Card object
 */
class Card {
	/**
	 * @param {string} id - The id of the card
	 * @param {string} [name] - The Human-Readable name of the card, defaults to the id
	 * @param {string|""} [image] - The URL to the image of the card
	 */
	constructor(id, name, image = "") {
		this.id = id;
		this.name = name || id;
		this.image = image;
	}

	/**
	 * Whether the cards are effectively equivalent
	 * Should only be used if the card has been duplicated with a different memory address
	 * @param {Card} card - The card to compare to
	 */
	isEqual(card) {
		return card.id === this.id && this.name === card.name && this.image === card.image;
	}
}

/**
 * Special class for storing objects related to rendering. Only exists because deepClone and node canvas don't like each other.
 */
class Render {
	/**
	 * @param {HTMLCanvasElement} canvas - The canvas used to render scenes
	 * @param {Collection<string, CanvasImageSource>} imagecache - Cache of images used for rendering
	 * @param {number} dy - Height in pixels the player's render space takes up. Default space is 160x80 px
	 */
	constructor(canvas, imagecache, dy) {
		/** The canvas used to render scenes */
		this.canvas = canvas;
		/** The rendering context of the canvas */
		this.ctx = canvas.getContext("2d");
		/** Cache of images used for rendering */
		this.images = imagecache;
		// TODO: different dy for different players?
		/** Height in pixels the player's render space takes up. Default space is 160x80 px */
		this.dy = dy;

		/**
		 * Backup render of static images
		 * @type {HTMLCanvasElement}
		 */
		this._canvas;

		/**
		 * Backup of contex for {@link _canvas}
		 * @type {CanvasRenderingContext2D}
		 */
		this._ctx;

		/**
		 * Queue for rendering
		 * @template T
		 * @type {{promise: () => Promise<T>, resolve: (value: T) => void, reject: (reason: Error) => void}[]}
		 */
		this._queue = [];

		/**
		 * Whether a promise is currently pending in the render queue
		 */
		this._promisePending = false;
	}

	/** 
	 * Helper function for drawing text with a border. Automatically queues the render.
	 * @param {string} text - The text to draw
	 * @param {number} x - The x coordinate, in pixels
	 * @param {number} y - The y coordinate, in pixels
	 * @param {string} [font] - Optional font
	 * @param {string} [fillStyle] - Optional fill style
	 * @param {string} [strokeStyle] - Optional stroke style
	 */
	drawText(text, x, y, font, fillStyle, strokeStyle) {
		this.queue(() => {
			this.drawTextNow(text, x, y, font, fillStyle, strokeStyle);
			return Util.emptyPromise();
		});
	}

	/**
	 * Helper function for drawing text with a border. Does not queue the render
	 * @param {string} text - The text to draw
	 * @param {number} x - The x coordinate, in pixels
	 * @param {number} y - The y coordinate, in pixels
	 * @param {string} [font] - Optional font
	 * @param {string} [fillStyle] - Optional fill style
	 * @param {string} [strokeStyle] - Optional stroke style
	 */
	drawTextNow(text, x, y, font = this.ctx.font, fillStyle = this.ctx.fillStyle, strokeStyle = this.ctx.strokeStyle) {
		[font, this.ctx.font] = [this.ctx.font, font];
		[fillStyle, this.ctx.fillStyle] = [this.ctx.fillStyle, fillStyle];
		[strokeStyle, this.ctx.strokeStyle] = [this.ctx.strokeStyle, strokeStyle];
		this.ctx.fillText(text, x, y);
		this.ctx.strokeText(text, x, y);
		[font, this.ctx.font] = [this.ctx.font, font];
		[fillStyle, this.ctx.fillStyle] = [this.ctx.fillStyle, fillStyle];
		[strokeStyle, this.ctx.strokeStyle] = [this.ctx.strokeStyle, strokeStyle];
	}

	/** 
	 * Helper function for stroking text. Automatically queues the render.
	 * @param {string} text - The text to stroke
	 * @param {number} x - The x coordinate, in pixels
	 * @param {number} y - The y coordinate, in pixels
	 * @param {string} [font] - Optional font
	 * @param {string} [strokeStyle] - Optional stroke style
	 */
	strokeText(text, x, y, font, strokeStyle) {
		this.queue(() => {
			this.strokeTextNow(text, x, y, font, strokeStyle);
			return Util.emptyPromise();
		});
	}

	/**
	 * Helper function for stroking text. Does not queue the render
	 * @param {string} text - The text to stroke
	 * @param {number} x - The x coordinate, in pixels
	 * @param {number} y - The y coordinate, in pixels
	 * @param {string} [font] - Optional font
	 * @param {string} [strokeStyle] - Optional stroke style
	 */
	strokeTextNow(text, x, y, font = this.ctx.font, strokeStyle = this.ctx.strokeStyle) {
		[font, this.ctx.font] = [this.ctx.font, font];
		[strokeStyle, this.ctx.strokeStyle] = [this.ctx.strokeStyle, strokeStyle];
		this.ctx.strokeText(text, x, y);
		[font, this.ctx.font] = [this.ctx.font, font];
		[strokeStyle, this.ctx.strokeStyle] = [this.ctx.strokeStyle, strokeStyle];
	}

	/** 
	 * Helper function for filling text. Automatically queues the render.
	 * @param {string} text - The text to fill
	 * @param {number} x - The x coordinate, in pixels
	 * @param {number} y - The y coordinate, in pixels
	 * @param {string} [font] - Optional font
	 * @param {string} [fillStyle] - Optional fill style
	 */
	fillText(text, x, y, font, fillStyle) {
		this.queue(() => {
			this.fillTextNow(text, x, y, font, fillStyle);
			return Util.emptyPromise();
		});
	}

	/**
	 * Helper function for filling text. Does not queue the render
	 * @param {string} text - The text to fill
	 * @param {number} x - The x coordinate, in pixels
	 * @param {number} y - The y coordinate, in pixels
	 * @param {string} [font] - Optional font
	 * @param {string} [fillStyle] - Optional fill style
	 */
	fillTextNow(text, x, y, font = this.ctx.font, fillStyle = this.ctx.fillStyle) {
		[font, this.ctx.font] = [this.ctx.font, font];
		[fillStyle, this.ctx.fillStyle] = [this.ctx.fillStyle, fillStyle];
		this.ctx.fillText(text, x, y);
		[font, this.ctx.font] = [this.ctx.font, font];
		[fillStyle, this.ctx.fillStyle] = [this.ctx.fillStyle, fillStyle];
	}

	/**
	 * Helper function for drawing an image
	 * @param {CanvasImageSource} image - The image to render
	 * @param {number} x - The x pos, in pixels
	 * @param {number} y - The y pos, in pixels
	 * @param {number} [dx] - The width, in pixels
	 * @param {number} [dy] - The height, in pixels
	 * @returns {Promise<void>}
	 */
	drawImage(image, x, y, dx, dy) {
		dx ||= image.width;
		dy ||= image.height;
		this.ctx.drawImage(image, x, y, dx, dy);
		return Util.emptyPromise();
	}

	/**
	 * Helper function for drawing an image. Does not queue the render
	 * @param {CanvasImageSource} image - The image to render
	 * @param {number} x - The x pos, in pixels
	 * @param {number} y - The y pos, in pixels
	 * @param {number} dx - The width, in pixels
	 * @param {number} dy - The height, in pixels
	 */
	drawImageNow(image, x, y, dx, dy) {
		dx ||= image.width;
		dy ||= image.height;
		this.ctx.drawImage(image, x, y, dx, dy);
	}

	/**
	 * Enqueues a promise to be later rendered.
	 * @param {(() => Promise)[]} promises
	 */
	queue(...promises) {
		promises.forEach(promise => new Promise((resolve, reject) => this._queue.push({promise, resolve, reject})));
	}
	
	/**
	 * Goes through the render queue, resolving or rejecting each promise until it's empty.
	 * @returns {boolean}
	 */
	flush() {
		if (this._promisePending) return false;
		const item = this._queue.shift();
		if (!item) return false;
		try {
			this._promisePending = true;
			item.promise().then(value => {
				this._promisePending = false;
				item.resolve(value);
				this.flush();
			}).catch(err => {
				this._promisePending = false;
				item.reject(err);
				this.flush();
			});
		} catch (err) {
			this._promisePending = false;
			item.reject(err);
			this.flush();
		}
		return true;
	}
}

/**
 * Describes a setting for a game
 */
class Setting {
	/**
	 * @param {number} value - The value of the setting
	 * @param {string} [name] - The name of the setting
	 * @param {string} [description] - The description of the setting
	 * @param {import("discord.js").MessageSelectOptionData[]} [components] - MessageSelectOpionData[] states of the setting
	 * @param {() => string[]} [fillOptions] - An array of strings to replace every occurence of `$N` in the name/description, where `N` is the index in the array
	 */
	constructor(value, name, description, components, fillOptions) {
		/** The value of the setting */
		this.value = value;
		/** The name of the setting */
		this.name = name;
		/** The description of the setting */
		this.description = description;
		/** The MessageSelectOpionData[] states of the setting */
		this.components = components;
		/**
		 * An array of strings to replace every occurence of `$N` in the name/description, where `N` is the index in the array
		 * @type {() => string[]}
		 */
		this.fillOptions = fillOptions || (() => []);
		/**
		 * For each state (determined by the length of `components`), stores the Member Id of each person who voted for that state
		 * @type {string[][]} 
		 */
		this.votes = new Array(components?.length || 0);
		for (let i = 0; i < this.votes.length; i++) {
			this.votes[i] = [];
		}
	}
}

/**
 * Colors and related Methods
 */
class Color {
	/**
	 * A random RGB color in the range [0,255]
	 * @returns {[number, number, number]}
	 */
	static randomColor() {
		return [Math.floor(Math.random()*256), Math.floor(Math.random()*256), Math.floor(Math.random()*256)];
	}

	/**
	 * Linearly blend between the two colors through HSV rotation along the shortest path
	 * @param {number} t - Blend modifier
	 * @param {[number, number, number]} color1 - Color 1
	 * @param {[number, number, number]} color2 - Color 2
	 */
	static blend(t, color1, color2) {
		const hsv1 = Color.toHSV(color1);
		const hsv2 = Color.toHSV(color2);
		const T = Math.sign(hsv2[0] - hsv1[0]) < 0 ? t : 1 - t;
		return Color.toRGB([(Math.min(hsv1[0], hsv2[0]) * T + Math.max(hsv1[0], hsv2[0]) * (1 - T) + 360) % 360, hsv1[1] * (1-t) + hsv2[1] * t, hsv1[2] * (1-t) + hsv2[2] * t]);
	}

	/**
	 * Takes an rgb color in the range [0,255] and converts it to HSV
	 * @param {[number, number, number]} color - The color to convert
	 * @returns {[number, number, number]}
	 */
	static toHSV(color) {
		const c = Color.scrunch(color);
		const max = Math.max(...c);
		const min = Math.min(...c);
		const d = max - min;
		let h = 0;
		switch(true) {
			case !d:
				break;
			case max === c[0]:
				h = 60 * (((c[1] - c[2]) / d) % 6);
				break;
			case max === c[1]:
				h = 60 * ((c[2] - c[0]) / d + 2);
				break;
			default: // max === c[2]
				h = 60 * ((c[0] - c[1]) / d + 4);
				break;
		}
		const s = !max ? 0 : d / max;
		return [h, s, max];
	}

	/**
	 * Converts an HSV color to an RGB in the range [0,255]
	 * @param {[number, number, number]} color - The color to convert
	 */
	static toRGB(color) {
		const C = color[1] * color[2];
		const X = C * (1 - Math.abs(((color[0] / 60) % 2) - 1));
		const m = color[2] - C;
		let c;
		const h = color[0] % 360;
		switch (true) {
			case 0 <= h && h < 60:
				c = [C, X, 0];
				break;
			case 60 <= h && h < 120:
				c = [X, C, 0];
				break;
			case 120 <= h && h < 180:
				c = [0, C, X];
				break;
			case 180 <= h && h < 240:
				c = [0, X, C];
				break;
			case 240 <= h && h < 300:
				c = [X, 0, C];
				break;
			default: // 300 <= h && h < 360
				c = [C, 0, X];
				break;
		}
		return Color.unscrunch([c[0] + m, c[1] + m, c[2] + m]);
	}

	/**
	 * Convers an RGB color in the range [0,255] to a hex string
	 * @param {[number, number, number]} color 
	 */
	static toHexString(color) {
		return `#${color[0].toString(16)}${color[1].toString(16)}${color[2].toString(16)}`;
	}

	/**
	 * Converts a color in the [0,255] range to [0,1]
	 * @param {[number, number, number]} color 
	 * @returns {[number, number, number]}
	 */
	static scrunch(color) {
		return [color[0]/255, color[1]/255, color[2]/255];
	}

	/**
	 * Converts a color in the [0,1] range to [0,255]
	 * @param {[number, number, number]} color 
	 * @returns {[number, number, number]}
	 */
	static unscrunch(color) {
		return [color[0]*255, color[1]*255, color[2]*255];
	}

	/**@type {[0, 0, 0]} */
	static Black = [0, 0, 0];
	/**@type {[127, 0, 0]} */
	static Carmine = [127, 0, 0];
	/**@type {[34, 129, 34]} */
	static Forest = [34, 139, 34];
	/**@type {[0, 255, 0]} */
	static Green = [0, 255, 0];
	/**@type {[161, 0, 255]} */
	static Purple = [161, 0, 255];
	/**@type {[255, 255, 255]} */
	static White = [255, 255, 255];
}

export { Core, Util, Color, Player, Pile, Card, Setting };