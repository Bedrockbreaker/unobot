import Discord from "discord.js";

/**
 * Provides basic functionality for all games
 * @class coreGame
 */
export default class coreGame {
	/**
	 * @param {string} title - The display name of the game
	 * @param {Discord.GuildChannel} channel - The channel to send updates to
	 * @param {number} [phase=0] - The current phase of the game. <1 is joining, [1,2) is setup, >=2 is playing
	 * @param {string} [currentPlayerID="0"] - The member id of the current player
	 * @param {number} [timeLimit=0] - The time limit, in seconds, for each player on their turn. 0 means no limit
	 * @param {string[]} [actionHistory=[]] - A history of players' actions
	 * @param {boolean} [allowsMidGameJoin=true] - If the current game allows players to join after it has already started
	 * @param {object.<string, (string[]|boolean)>} [rules={}] - An object containing the customizable rules for the game
	 * @param {object} traits - An object used to define any custom traits of the game
	 * @param {object} piles - An object containing all of the card piles in the game
	 * @param {object} players - An object while holds all the players in a game
	*/
	constructor(title, channel, rules = {}, traits = {}, piles, players, timeLimit = 0, allowsMidGameJoin = true, phase = 0, currentPlayerID = "0", actionHistory = []) {
		// If for whatever reason I need to get the class of a game: game#constructor.name
		this.meta = {
			title: title,
			channel: channel,
			phase: phase,
			currentPlayerID: currentPlayerID,
			timeLimit: timeLimit,
			actionHistory: actionHistory,
			allowsMidGameJoin: allowsMidGameJoin,
			rules: rules,
			traits: traits, // Additional object for more properties, if needed.
			deletePlayer: "0", // The player id of the player to remove the game. Since mods aren't allowed to touch globalPlayers, this is a work around.
			ended: false // Used to mark when the game has ended, so it gets removed from the globalGames map.
		}
		this.piles = piles;
		this.players = players;
	}

	/** 
	 * Enum for event phases fired for mods.
	 * @enum {number}
	*/
	static phases = Object.freeze({
		START: 0,
		END: 1
	});

	/**
	 * Mutates the array and returns the shuffled version.
	 * @param {Array} array 
	 * @returns {Array} The mutated array
	 */
	static shuffle(array) {
		let i, j, k;
		for (i = array.length - 1; i > 0; i--) {
			j = Math.floor(Math.random() * (i + 1));
			k = array[i];
			array[i] = array[j];
			array[j] = k;
		}
		return array;
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
	 * Generates a template player
	 * @param {Discord.GuildMember} member
	 * @returns {object} The template player object 
	 */
	genDefaultPlayer(member) {
		return {
			member: member,
			cards: [],
			isLeader: false,
			index: 0,
			traits: {}
		}
	}

	/**
	 * Registers the mods for a game
	 * @virtual
	 */
	setup() {}

	/**
	 * Randomizes the player order within a game.
	 */
	randomizePlayerOrder() {
		let indexes = coreGame.shuffle(Array.from(Array(Object.keys(this.players).length).keys()));
		Object.values(this.players).forEach(player => player.index = indexes.pop());
	}

	/**
	 * Display the specified players' cards to them, optionally sorted and a unique color for each one.
	 * If a falsey value is passed, deal all players. If a player's member id is passed, only deal to that player.
	 * @param {(Number|String)} playerIDex - the player(s) to display their cards to. For a singular player, pass their discord member id. 
	 * @param {function(object)} [sortFunction] - The function to sort a specific player's cards by
	 * @param {Discord.ColorResolvable} [color=Math.floor(Math.random()*16777215)] - The color of the embed sidebar displayed to each player
	 * @returns {void}
	 */
	dealCards(playerIDex, sortFunction, color) {
		// TODO: if an array of player IDs is passed, deal to those players
		// TODO: implement passing in a sort function. Ex: phase 10, where the cards should be sorted to suit the players' phases.
		// TODO: implement the color. Ex: you have 1 card in uno.
		if (typeof (playerIDex) === "string") {
			if (this.players[playerIDex].member.user.bot) return; // I use the bot itself to test things. Prevents error spam. I guess you could program a bot to perfectly play games now.
			const hand = new Discord.RichEmbed()
				.setTitle("Your Hand:")
				.setDescription(Object.values(this.players[playerIDex].cards).map(card => `${card.id}: ${card.name}`).sort().join("\n"))
				.setColor(Math.floor(Math.random() * 16777215));
			return this.players[playerIDex].member.send(hand);
		}
		if (!playerIDex) playerIDex = 0;
		if (playerIDex >= Object.keys(this.players).length) return;
		if (Object.values(this.players)[playerIDex].member.user.bot) return this.dealCards(playerIDex + 1, sortFunction, color); // Same deal with the bot here.
		const hand = new Discord.RichEmbed()
			.setTitle("Your Hand:")
			.setDescription(Object.values(Object.values(this.players)[playerIDex].cards).map(card => `${card.id}: ${card.name}`).sort().join("\n"))
			.setColor(Math.floor(Math.random() * 16777215));
		Object.values(this.players)[playerIDex].member.send(hand)
			.then(this.dealCards(playerIDex + 1, sortFunction, color));
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

	// player, r7, "marked:true,haha:1"
	// player, r7, {marked: "true", haha: "1"}
	// player, r7, [["marked", "true"], ["haha", "1"]]
	/**
	 * Attempts to find the cards specified from a player's hand.
	 * @param {object} player - The player to test cards for
	 * @param {string} cardID - The card id of the card
	 * @param {(object|string|Array[])} traits - The special traits a card must have. Any boolean traits of the card must be false if not specified.
	 * If a string is passed, any traits which aren't set to a specific value, i.e. "marked" default to true. 
	 * @example getCards(player, "r2", "marked,score:2,stolenfrom:bob")
	 * @example getCards(player, "r2", {marked: true, score: 2, stolenfrom: "bob"})
	 * @example getCards(player, "r2", [["marked"],["score","2"],["stolenfrom","bob"]])
	 */
	getCards(player, cardID, traits) {
		traits = traits || [];
		if (typeof traits === "object" && typeof traits.length === "undefined") traits = Object.keys(traits).map(key => [key, traits[key].toString()]);
		if (typeof traits === "string") traits = traits.split(",").map(trait => trait.split(":"));
		// TODO: update node.js
		// const tempFilter = player.cards.filter(card => card.id === cardID && traits.every(trait => card.traits[trait[0]]?.toString() === (trait[1] || "true")));
		const tempFilter = player.cards.filter(card => card.id === cardID && traits.every(trait => card.traits.hasOwnProperty(trait[0]) && card.traits[trait[0]].toString() === (trait[1] || "true")));
		return tempFilter.filter(card => {
			return Object.keys(card.traits).every(trait => {
				const mentionedTrait = traits.find(trait2 => trait2[0] === trait);
				return typeof card.traits[trait] === "boolean" ? (card.traits[trait].toString() === (mentionedTrait ? (mentionedTrait[1] || "true") : "false")) : true;
			});
		});
	}
}

/*
class card {
	constructor(id, name, image, traits) {
		this.id = id;
		this.name = name;
		this.image = image;
		this.traits = traits;
	}

	isEmpty() {
		return typeof this.id !== "undefined";
	}
}
*/