//import events from "events";
import Discord from "discord.js";
import Canvas from "canvas";

/**
 * Provides basic functionality for all games
 * @class Core
 */
class Core {
	/**
	 * @param {string} title - The display name of the game
	 * @param {Discord.GuildChannel} channel - The channel to send updates to
	 * @param {number} phase - The current phase of the game. <1 is joining, [1,2) is setup, >=2 is playing
	 * @param {Player} currentPlayer - The current player, according to whose turn it is
	 * @param {number} timeLimit - The time limit, in seconds, for each player on their turn. 0 means no limit
	 * @param {string[]} actionHistory - A history of players' actions
	 * @param {Object<string, (string[]|boolean)>} rules - An object containing the customizable rules for the game
	 * @param {Object<string, *>} traits - An object used to define any custom traits of the game
	 * @param {Object<string, Pile>} piles - An object containing all of the card piles in the game
	 * @param {Object<string, Player>} players - An object which holds all the players in a game
	*/
	constructor(title, channel, rules = {}, traits = {}, piles = {}, players = {}, timeLimit = 0, phase = 0, currentPlayer, actionHistory = []) {
		// If for whatever reason I need to get the class of a game: game#constructor.name
		this.meta = {
			/** The display name of the game */
			title: title,
			/** The channel to send updates to */
			channel: channel,
			/** The current phase of the game. <1 is joining, [1,2) is setup, >=2 is playing */
			phase: phase,
			/** The current player, according to whose turn it is */
			currentPlayer: currentPlayer,
			/** The time limit, in seconds, for each player on their turn. 0 means no limit */
			timeLimit: timeLimit,
			/** A history of players' actions */
			actionHistory: actionHistory,
			/** List of optional rules. Initialize with a string array, is later replaced with whether those rules are active or not */
			rules: rules,
			/** Whether voting is allowed to determine which rules are active*/
			voting: false,
			/** An object used to define any custom traits of the game */
			traits: traits,
			/** The member id of the player to remove from the game */
			deletePlayer: "0",
			/** Used to mark when the game has ended */
			ended: false
		}
		/** Piles of cards the game contains */
		this.piles = piles;
		/** Players who are playing in the game */
		this.players = players;

		this.render = new Render(Canvas.createCanvas(850, 500), {});
		/** The events emitter used for mods */
		//this.events = new events.EventEmitter();
	}

	// TODO: move the util commands into their own class
	// TODO: make a function which returns an "empty promise" (useful for rendering)

	// credit to trincot on stackoverflow https://stackoverflow.com/questions/40291987/javascript-deep-clone-object-with-circular-references
	/**
	 * Deep clones the provided object
	 * @param {Object} obj - The object to clone
	 * @param {WeakMap} hash - hash which stores which objects have already been cloned, allowing circular references.
	 * @returns {Object} The cloned object
	 */
	static deepClone(obj, hash = new WeakMap()) {
		if (Object(obj) !== obj || obj instanceof Function || obj instanceof Render || obj instanceof Discord.Base) return obj; // Don't copy items which don't copy nicely :)
		if (hash.has(obj)) return hash.get(obj); // Cyclic reference
		
		let res;
		try {
        	res = new obj.constructor();
		} catch(e) {
			res = Object.create(Object.getPrototypeOf(obj));
		}
		hash.set(obj, res);
		return Object.assign(res, ...Object.keys(obj).map(key => ({[key]: Core.deepClone(obj[key], hash)})));
	}

	/** 
	 * Enum for event phases fired for mods.
	 * @enum {number}
	*/
	/*
	static phases = Object.freeze({
		START: 0,
		MIDDLE: 1,
		END: 2
	});
	*/

	/**
	 * Mutates the array and returns the shuffled version.
	 * @param {Array} array 
	 * @returns {Array} The mutated array
	 */
	static shuffle(array) {
		let i, j;
		for (i = array.length - 1; i > 0; i--) {
			j = Math.floor(Math.random() * (i + 1));
			[array[i], array[j]] = [array[j], array[i]];
		}
		return array;
	}

	/**
	 * Given a proper array, each with a weighted chance, it will return one item from the list, weighted accordingly.
	 * @param {[*, ?Number][]} array - the list of items and their weighted chances
	 * @returns {*} The chosen item
	 */
	static weighted(array) {
		let n = Math.random()*array.reduce((acc, item) => acc + (item[1] || 1), 0);
		for (let i = 0; i < array.length; i++) {
			n -= (array[i][1] || 1);
			if (n <= 0) return array[i][0];
		}
	}

	/**
	 * If `num` is equal to 1, returns the singular suffix. Else, return the plural suffix
	 * @param {number} num 
	 * @param {string} [plural="s"] 
	 * @param {string} [singular=""] 
	 * @returns {string} Either the plural of singular suffix of a word.
	 */
	static plural(num, plural, singular) {
		if (num === 1) return singular || "";
		return plural || "s";
	}

	/**
	 * Attempts to find the cards specified from an array of cards. Basically a fancy filter function
	 * @param {Card[]} cards - The list of cards to search in
	 * @param {string} cardID - The card id of the card
	 * @param {?(Object<string, *>|string|string[][])} traits - The special traits a card must have. Any boolean traits of the card must be false if a value is not specified.
	 * If an array or string is passed, any traits which aren't set to a specific value, i.e. "marked" default to true.
	 * @example getCards(player.cards, "r2", "")
	 * @example getCards(player.cards, "*", "r,marked,score:>=7/<3,!stolenfrom:bob")
	 * @example getCards(player.cards, "*", {r: true, marked: true, score: ">=7/<3", "!stolenfrom": "bob"})
	 * @example getCards(player.cards, "any", [["r"],["marked"],["score",">=7/<3"],["!stolenfrom","bob"]])
	 * @returns {Card[]} The list of cards which match
	 */
	static getCards(cards, cardID, traits) {
		// TODO: allow "or-ing" between traits (Needs grouping symbols)
		traits = traits || [];
		if (typeof traits === "object" && typeof traits.length === "undefined") traits = Object.keys(traits).map(key => [key, traits[key].toString()]);
		if (typeof traits === "string") traits = traits.split(",").map(trait => trait.split(":"));
		const rIndex = traits.findIndex(trait => ["r", "rand", "random", "randomize", "shuffle"].includes(trait[0]));
		if (rIndex > -1) traits.splice(rIndex, 1);
		cards = cards.filter(card => [card.id, "*", "any"].includes(cardID) && traits.every(trait => {
			const invert = trait[0].startsWith("!");
			const traitName = trait[0].replace("!","");
			const values = trait[1]?.split("/") || ["true"];
			for (let i = 0; i < values.length; i++) {
				if ((values[i].startsWith(">=") && card.traits[traitName] >= Number(values[i].substring(2))) ||
					(values[i].startsWith(">") && card.traits[traitName] > Number(values[i].substring(1))) ||
					(values[i].startsWith("<=") && card.traits[traitName] <= Number(values[i].substring(2))) ||
					(values[i].startsWith("<") && card.traits[traitName] < Number(values[i].substring(1))) ||
					(card.traits[traitName]?.toString() == values[i])) return !invert; // Only == so "undefined" can match "false" (!id.nonexistanttrait:false)
			}
			return invert;
		}));
		return rIndex > -1 ? Core.shuffle(cards) : cards;
	}

	/**
	 * Returns all players which match the mention, username, or nickname
	 * @param {Player[]} players 
	 * @param {string} input 
	 * @returns {Player[]} The matching players
	 */
	static getPlayers(players, input) {
		const mention = /<@!?(\d*)>/;
		if (mention.test(input)) return [players.find(player => player.member.id === input.replace(mention, "$1"))];
		const matches = [];
		input = input.replace("#", "").toLowerCase();
		players.forEach(player => {
			if ((player.member.displayName + player.member.user.discriminator).toLowerCase().includes(input) || (player.member.user.username + player.member.user.discriminator).toLowerCase().includes(input)) matches.push(player);
		});
		return matches;
	}

	/**
	 * Displays the rules, if any.
	 * @returns {boolean} Whether the game had any rules which were displayed
	 */
	displayRules() {
		const rules = Object.keys(this.meta.rules);
		if (!rules.length) return false;
		const rulesEmbed = new Discord.MessageEmbed()
			.setTitle("What rules is this game being played by?\n(respond by submitting reaction emojis)")
			.setDescription(`**When you are done changing the rules, type \`!start\`\n**[Commands for Playing](https://github.com/Bedrockbreaker/unobot/wiki/${this.meta.title.replace(/ /g, "-")})`)
			.setColor(Math.floor(Math.random() * 16777215) + 1);
		for (let i = 0; i < rules.length; i++) {
			rulesEmbed.addField(this.meta.rules[rules[i]][0], this.meta.rules[rules[i]][1]);
		}
		rulesEmbed.addField("Vote below by reacting with emojis!", "↓");
		this.meta.channel.send(rulesEmbed).then(message => {
			this.meta.rulesEmbed = message;
			addReaction(message, this.meta.rules, 0);
		});
		return true;
	}

	getRules() {
		const ruleEmojis = Object.values(this.meta.rules).map(rule => rule[2]);
		const rules = Object.keys(this.meta.rules).filter(key => this.meta.rules[key][2]);
		const pLength = Object.keys(this.players).length;
		this.meta.rulesEmbed.reactions.cache.filter(reaction => ruleEmojis.includes(reaction.emoji.name)).map(reaction => reaction.users.cache.reduce((acc, user) => acc + ((this.meta.voting ? this.players[user.id] : this.players[user.id]?.isLeader) ? 1 : 0), 0) >= (this.meta.voting ? pLength / 2 : 1)).forEach((bool, i) => this.meta.rules[rules[i]] = bool);
	}

	/**
	 * Registers mods and caches images
	 */
	setup() {
		this.render.queue(() => Canvas.loadImage("images/halo.png").then(image => this.render.images.halo = image));
	}

	/**
	 * Generates a default player
	 * @param {Discord.GuildMember} member - The member to generate a player for
	 * @param {Boolean} isLeader - Whether the new player is a leader
	 */
	genDefaultPlayer(member, isLeader) {
		return new Player(member, [], isLeader);
	}

	/**
	 * Starts the game
	 */
	start() {
		this.render.ctx.font = "40px Arial";
		this.drawStatic();
	}

	/**
	 * The catch-all method for any unknown commands.
	 * Usually to handle discarding
	 * @virtual
	 * @param {string[]} args - The exact string the user typed, sans the server prefix, separated by spaces
	 * @param {Discord.GuildMember|Discord.User} member - The member who typed the message
	 * @param {Discord.Channel} channel - The channel the command was posted in
	 */
	discard(args, member, channel) {}

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
	 */
	updateUI() {}

	/**
	 * Adds a player to the game
	 * @param {Discord.GuildMember} member - The member to generate a Player for
	 * @param {Boolean} isLeader - Whether the newly added player is a leader
	 */
	addPlayer(member, isLeader) {
		this.players[member.id] = this.genDefaultPlayer(member, isLeader);
	}

	/**
	 * Removes a player from the game
	 * @param {Player} player - The Player to remove from the game
	 */
	removePlayer(player) {
		delete this.players[player.member.id];
	}

	/**
	 * Randomizes the player order within a game
	 */
	randomizePlayerOrder() {
		let indexes = Core.shuffle([...Array(Object.keys(this.players).length).keys()]);
		Object.values(this.players).forEach(player => player.index = indexes.pop());
	}

	/**
	 * Resets the time limit for the game
	 */
	resetTimeLimit() {
		// TODO: end the game if everyone hasn't gone once in row, or 10 min have passed.
		clearTimeout(this.timeLimit);
		if (!this.meta.timeLimit) return;
		this.timeLimit = setTimeout(() => {
			this.timeLimit();
			this.updateUI();
		}, this.meta.timeLimit * 1000);
	}

	/**
	 * Renders everything which can visually change during the game
	 * @virtual
	 */
	renderTable() {}

	/** Render static images which don't change during the game onto the table */
	drawStatic() {
		this.render.queue(() => Canvas.loadImage("images/background.png").then(image => this.render.ctx.drawImage(image, 0, 0)));
		const pLength = Object.keys(this.players).length;
		Object.values(this.players).sort((player1, player2) => player1.index - player2.index).forEach(player => {
			const url = player.member.user.displayAvatarURL({format: "png", size: 64});
			const loc = player.index/pLength;
			this.render.queue(() => {
				return Canvas.loadImage(url).then(image => {
					this.render.ctx.drawImage(image, 340-300*Math.cos(2*Math.PI*loc), 210-200*Math.sin(2*Math.PI*loc), 80, 80);
				});
			});
		});
	}

	/**
	 * Helper method for drawStatic()
	 * @param {Player[]} players - The list of players' avatars to render
	 */
	//drawAvatars(players) {
	//	if (!players.length) return;
	//	const pLength = Object.keys(this.players).length;
	//	return Canvas.loadImage(players[0].member.user.displayAvatarURL({format: "png", size: 64})).then(image => {
	//		this.render.ctx.drawImage(image, , , 80, 80);
	//		return this.drawAvatars(players.slice(1));
	//	});
	//}

	/** Saves a copy of the canvas with static-only elements */
	saveCanvas() {
		this.render._canvas = Canvas.createCanvas(this.render.canvas.width, this.render.canvas.height);
		this.render._ctx = this.render._canvas.getContext("2d");
		this.render._ctx.drawImage(this.render.canvas, 0, 0);
		return new Promise((resolve, reject) => resolve());
	}

	/**
	 * Display the specified players' cards to them
	 * @param {Player[]} players - the player(s) to display their cards to.
	 * @returns {void}
	 */
	dealCards(players) {
		if (players.length === 0) return;
		const player = players.pop();
		if (player.member.user.bot) return this.dealCards(players); // I use the bot to test things. Makes sure that this doesn't error
		const hand = new Discord.MessageEmbed()
			.setTitle("Your Hand:")
			.setDescription(Object.values(player.cards).map(card => `${card.id}: ${card.name}`).sort().join("\n"))
			.setColor(Math.floor(Math.random() * 16777215));
		player.member.send(hand).then(this.dealCards(players));
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
		//this.events.emit("draw", Core.phases.START, player, pile, numCards, newCards);
		//if (!this.draw.cancelled) {
		for (let i = 0; i < numCards; i++) {
			newCards.push(pile.cards.shift());
			if (pile.cards.length === 0) this.deckCreate(pile); // Instead of reshuffling the old pile, we create a new one to preserve card history. Doesn't break mods which rely on previously discarded cards.
		}
		//}
		//this.events.emit("draw", Core.phases.MIDDLE, player, pile, numCards, newCards);
		//if (!this.draw.cancelled) {
		player.cards = player.cards.concat(newCards);
		Core.dealCards([player]);
		//}
		//this.events.emit("draw", Core.phases.END, player, pile, numCards, newCards);
		//this.draw.cancelled = false;
		return newCards;
	}

	/**
	 * Helper method for resolving a player from a string
	 * @param {string} input 
	 */
	getPlayers(input) {
		return Core.getPlayers(Object.values(this.players), input);
	}

	// TODO: grabCard()
}

/**
 * Private method for adding reactions to the rules message
 * @param {Discord.Message} message - The Message to add the reaction to
 * @param {Object} rules - The rules to pull reactions from
 * @param {number} index - Internal use only.
 */
function addReaction(message, rules, index) {
	if (index >= Object.keys(rules).length) return;
	if (!Object.values(rules)[index][2]) return addReaction(message, rules, index + 1);
	message.react(Object.values(rules)[index][2]).then(() => addReaction(message, rules, index + 1));
}

/**
 * A Player object
 * @class Player
 */
class Player {
	/**
	 * @param {Discord.GuildMember} member - The member associated with the player
	 * @param {?Card[]} cards - The list of cards in the player's posession
	 * @param {?boolean} isLeader - If the player is a leader/host over a game
	 * @param {?number} index - The index of the player in turn-order. 0 is first player
	 * @param {?Object<Player, string>} knowledge - What specific knowledge this player knows, that others might not.
	 * @param {?Object<string, *>} traits - Any special traits the player may have
	 */
	constructor(member, cards = [], isLeader = false, index = 0, knowledge = {}, traits = {}) {
		this.member = member;
		this.cards = cards;
		this.isLeader = isLeader;
		this.index = index;
		this.knowledge = knowledge;
		this.traits = traits;
	}

	/**
	 * Attempts to find the cards specified from the player's hand.
	 * @param {string} cardID - The card id of the card
	 * @param {?(Object<string, *>|string|string[][])} traits - The special traits a card must have. Any boolean traits of the card must be false if a value is not specified.
	 * If an array or string is passed, any traits which aren't set to a specific value, i.e. "marked" default to true.
	 * @returns {Card[]}
	 */
	getCards(cardID, traits) {
		// TODO: accept the arg string instead
		return Core.getCards(this.cards, cardID, traits);
	}

	// TODO: grabCard()
	// player.cards.splice(player.cards.findIndex(card2 => card2 === card), 1)[0]
}

/**
 * A Pile object. Basically a stack of cards that don't belong to a specific player
 * @class Pile
 */
class Pile {
	/**
	 * @param {?Card[]} cards - The cards in the pile
	 * @param {?Object<string, *>} traits - Any special traits the pile might have
	 */
	constructor(cards = [], traits = {}) {
		this.cards = cards;
		this.traits = traits;
	}
	
	/**
	 * Attempts to find the cards specified from the pile
	 * @param {string} cardID - The card id of the card
	 * @param {?(Object<string, *>|string|string[][])} traits - The special traits a card must have. Any boolean traits of the card must be false if a value is not specified.
	 * If an array or string is passed, any traits which aren't set to a specific value, i.e. "marked" default to true.
	 * @returns {Card[]}
	 */
	getCards(cardID, traits) {
		// TODO: accept the arg string instead
		return Core.getCards(this.cards, cardID, traits);
	}
}

/**
 * A Card object
 * @class Card
 */
class Card {
	/**
	 * @param {string} id - The id of the card
	 * @param {?string} [name=id] - The Human-Readable name of the card
	 * @param {?string} image - The URL to the image of the card
	 * @param {?Object<string, *>} traits - Any special traits the card might have
	 * @param {?Object<string, *>} hidden - Exactly like traits, but never shown to the player
	 */
	constructor(id, name, image = "", traits = {}, hidden = {}) {
		this.id = id;
		this.name = name || id;
		this.image = image;
		this.traits = traits;
		this.hidden = hidden;
	}

	/**
	 * Returns if the cards are effectively equivalent (everything matches, ignoring the hidden properties)
	 * @param {Card} card - The card to compare to
	 */
	isEqual(card) {
		// TODO: match hidden as well
		return Core.getCards([card], this.id, this.traits) && this.name === card.name && this.image === card.image;
	}
}

/**
 * Special class for storing objects related to rendering. Only exists because deepClone and node canvas don't like each other.
 * @class
 */
class Render {
	/**
	 * @param {HTMLCanvasElement} canvas 
	 * @param {Object<string, CanvasImageSource>} imagecache 
	 */
	constructor(canvas, imagecache) {
		/** The canvas used to render scenes */
		this.canvas = canvas;
		/** The rendering context of the canvas*/
		this.ctx = canvas.getContext("2d");
		/** Cache of images used for rendering */
		this.images = imagecache;

		/**
		 * Queue for rendering
		 * @type {Object<string, Function<Promise<>>>[]}
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
	 * @param {?string} font - Optional font
	 * @param {?string} fillStyle - Optional fill style
	 * @param {?string} strokeStyle - Optional stroke style
	 */
	drawText(text, x, y, font, fillStyle, strokeStyle) {
		this.queue(() => {
			return new Promise((resolve, reject) => {
				this.drawTextNow(text, x, y, font, fillStyle, strokeStyle);
				resolve();
			});
		});
	}

	/**
	 * Helper function for drawing text with a border. Does not queue the render
	 * @param {string} text - The text to draw
	 * @param {number} x - The x coordinate, in pixels
	 * @param {number} y - The y coordinate, in pixels
	 * @param {?string} font - Optional font
	 * @param {?string} fillStyle - Optional fill style
	 * @param {?string} strokeStyle - Optional stroke style
	 */
	drawTextNow(text, x, y, font = this.ctx.font, fillStyle = this.ctx.fillStyle, strokeStyle = this.ctx.strokeStyle) {
		[font, this.ctx.font] = [this.ctx.font, font];
		[fillStyle, this.ctx.fillStyle] = [this.ctx.fillStyle, fillStyle];
		[strokeStyle, this.ctx.strokeStyle] = [strokeStyle, this.ctx.strokeStyle];
		this.ctx.fillText(text, x, y);
		this.ctx.strokeText(text, x, y);
		[font, this.ctx.font] = [this.ctx.font, font];
		[fillStyle, this.ctx.fillStyle] = [this.ctx.fillStyle, fillStyle];
		[strokeStyle, this.ctx.strokeStyle] = [strokeStyle, this.ctx.strokeStyle];
	}

	/**
	 * Helper function for drawing an image
	 * @param {CanvasImageSource} image - The image to render
	 * @param {number} x - The x pos, in pixels
	 * @param {number} y - The y pos, in pixels
	 * @param {number} dx - The width, in pixels
	 * @param {number} dy - The height, in pixels
	 * @returns {Promise<void>}
	 */
	drawImage(image, x, y, dx, dy) {
		dx = dx || image.width;
		dy = dy || image.height;
		this.ctx.drawImage(image, x, y, dx, dy);
		return new Promise((resolve, reject) => resolve());
	}

	/**
	 * Enqueues a promise to be later rendered.
	 * @param {Function<Promise<>>[]} promises
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

export { Core, Player, Pile, Card };