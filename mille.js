import Discord from "discord.js";
import Canvas from "canvas";
import {Core, Util, Player, Pile, Card} from "./core.js";

/**
 * Mille Bornes
 * @class
 */
export default class baseMille extends Core {
	/**@param {Discord.GuildChannel} channel - The channel to send updates to*/
	constructor(channel) {
		const rules = {
			"teams": ["Team Selection (Default Random)", "(Only applicable for games of 4 or 6 players)\nType `!team 𝘯𝘢𝘮𝘦` to be on a team with that player.\nAccepts an @, or any portion of their username or nickname.\nLeave 𝘯𝘢𝘮𝘦 blank for a random team"],
			"cutthroat": ["Cutthroat Mode", "Changes a large number of game mechanics to be more cutthroat.\nSee [the github](https://github.com/Bedrockbreaker/unobot/wiki/Mille-Bornes) for details", "🔪"]
		}
		super("Mille Bornes", channel, rules, {}, {}, {}, 125);

		/**@type {Object<string, MillePlayer>} */
		this.players = {};

		/** Game Properties */
		this.props = {
			/** Total distance required to travel for the current round */
			totalDist: 1000,
			/** 
			 * The last hazard card played which is allowed to be coup fourre'd.
			 * @type {Card}
			 */
			lastHazard: null
		}
	}

	/**
	 * Generates a default player
	 * @param {Discord.GuildMember} member - The member to generate a player for
	 * @param {Boolean} isLeader - Whether the new player is a leader
	 */
	genDefaultPlayer(member, isLeader) {
		return new MillePlayer(member, isLeader);
	}

	start() {
		const players = Object.values(this.players);
		if (players.length < 2) return this.meta.channel.send("Not enough players!");
		if (players.length === 5) return this.meta.channel.send("Sorry, but you've got to lose a friend to play. (Or grab another, not like you've got one)");
		if (players.length > 6) return this.meta.channel.send("Too many friends! (((( ;°Д°))))");
		this.meta.phase = 2;
		this.props.totalDist = players.length === 4 ? 1000 : 700;
		
		this.assignTeams(); // Because it returns if a player already has a team, this is fine being called every time a round starts
		this.randomizePlayerOrder();
		this.piles.draw = new Pile();
		this.piles.discard = new Pile();
		this.deckCreate();
		players.forEach(player => player.cards = this.piles.draw.cards.splice(0, 6));

		this.meta.currentPlayer = players.find(player => !player.index);
		this.meta.actionHistory.push("The game has just started!");

		this.dealCards(players);
		this.render.ctx.fillStyle = "#FFFFFF";
		super.start();
		this.updateUI();
		this.resetTimeLimit();
	}

	randomizePlayerOrder() {
		let players = Util.shuffle(Object.values(this.players));
		players.forEach(player => player.pile = null);
		const teams = players.length > 3;
		for (let i = 0; i < players.length; i++) {
			if (players[i].pile) continue;
			players[i].pile = new MillePile();
			players[i].index = i;
			if (teams) {
				players[i].partner.pile = players[i].pile;
				players[i].partner.index = (i + players.length / 2) % players.length;
			}
		}
	}

	/**
	 * Assigns random teams to players who aren't on one yet
	 * @returns {void}
	 */
	assignTeams() {
		const players = Object.values(this.players);
		if (players.length < 4) return;
		for (let i = 0; i < players.length; i++) {
			if (players[i].partner) continue;
			const partner = Util.shuffle(players.filter(player => !player.partner && player !== players[i]))[0];
			players[i].partner = partner;
			partner.partner = players[i];
		}
	}

	/** Creates a deck of cards for the draw pile */
	deckCreate() {
		/** @type {Card[]} */
		const url = "images/mille/";
		const cards = [
			new Card("hg", "Out of Gas", `${url}hg.png`), new Card("hg", "Out of Gas", `${url}hg.png`),
			new Card("ht", "Flat Tire", `${url}ft.png`), new Card("ht", "Flat Tire", `${url}ft.png`),
			new Card("ha", "Accident", `${url}ha.png`), new Card("ha", "Accident", `${url}ha.png`),
			new Card("hl", "Speed Limit", `${url}hl.png`), new Card("hl", "Speed Limit", `${url}hl.png`), new Card("hl", "Speed Limit", `${url}hl.png`),
			new Card("sp", "Stop", `${url}sp.png`), new Card("sp", "Stop", `${url}sp.png`), new Card("sp", "Stop", `${url}sp.png`), new Card("sp", "Stop", `${url}sp.png`),
			
			new Card("rg", "Gasoline", `${url}rg.png`), new Card("rg", "Gasoline", `${url}rg.png`), new Card("rg", "Gasoline", `${url}rg.png`), new Card("rg", "Gasoline", `${url}rg.png`), new Card("rg", "Gasoline", `${url}rg.png`), new Card("rg", "Gasoline", `${url}rg.png`),
			new Card("rt", "Spare Tire", `${url}rt.png`), new Card("rt", "Spare Tire", `${url}rt.png`), new Card("rt", "Spare Tire", `${url}rt.png`), new Card("rt", "Spare Tire", `${url}rt.png`), new Card("rt", "Spare Tire", `${url}rt.png`), new Card("rt", "Spare Tire", `${url}rt.png`),
			new Card("ra", "Repairs", `${url}ra.png`), new Card("ra", "Repairs", `${url}ra.png`), new Card("ra", "Repairs", `${url}ra.png`), new Card("ra", "Repairs", `${url}ra.png`), new Card("ra", "Repairs", `${url}ra.png`), new Card("ra", "Repairs", `${url}ra.png`),
			new Card("rl", "End of Limit", `${url}rl.png`), new Card("rl", "End of Limit", `${url}rl.png`), new Card("rl", "End of Limit", `${url}rl.png`), new Card("rl", "End of Limit", `${url}rl.png`), new Card("rl", "End of Limit", `${url}rl.png`), new Card("rl", "End of Limit", `${url}rl.png`),
			new Card("go", "Roll", `${url}go.png`), new Card("go", "Roll", `${url}go.png`), new Card("go", "Roll", `${url}go.png`), new Card("go", "Roll", `${url}go.png`), new Card("go", "Roll", `${url}go.png`), new Card("go", "Roll", `${url}go.png`), new Card("go", "Roll", `${url}go.png`),
			new Card("go", "Roll", `${url}go.png`), new Card("go", "Roll", `${url}go.png`), new Card("go", "Roll", `${url}go.png`), new Card("go", "Roll", `${url}go.png`), new Card("go", "Roll", `${url}go.png`), new Card("go", "Roll", `${url}go.png`), new Card("go", "Roll", `${url}go.png`),

			new MilleCard("sg", "Extra Tank", `${url}sg.png`), new MilleCard("st", "Puncture-Proof Tires", `${url}st.png`), new MilleCard("sa", "Ace Driver", `${url}sa.png`), new MilleCard("sr", "Right of Way", `${url}sr.png`),

			new Card("200", "200", `${url}200.png`), new Card("200", "200", `${url}200.png`), new Card("200", "200", `${url}200.png`), new Card("200", "200", `${url}200.png`),
			new Card("100", "100", `${url}100.png`), new Card("100", "100", `${url}100.png`), new Card("100", "100", `${url}100.png`), new Card("100", "100", `${url}100.png`), new Card("100", "100", `${url}100.png`), new Card("100", "100", `${url}100.png`),
			new Card("100", "100", `${url}100.png`), new Card("100", "100", `${url}100.png`), new Card("100", "100", `${url}100.png`), new Card("100", "100", `${url}100.png`), new Card("100", "100", `${url}100.png`), new Card("100", "100", `${url}100.png`),
			new Card("75", "75", `${url}75.png`), new Card("75", "75", `${url}75.png`), new Card("75", "75", `${url}75.png`), new Card("75", "75", `${url}75.png`), new Card("75", "75", `${url}75.png`),
			new Card("75", "75", `${url}75.png`), new Card("75", "75", `${url}75.png`), new Card("75", "75", `${url}75.png`), new Card("75", "75", `${url}75.png`), new Card("75", "75", `${url}75.png`),
			new Card("50", "50", `${url}50.png`), new Card("50", "50", `${url}50.png`), new Card("50", "50", `${url}50.png`), new Card("50", "50", `${url}50.png`), new Card("50", "50", `${url}50.png`),
			new Card("50", "50", `${url}50.png`), new Card("50", "50", `${url}50.png`), new Card("50", "50", `${url}50.png`), new Card("50", "50", `${url}50.png`), new Card("50", "50", `${url}50.png`),
			new Card("25", "25", `${url}25.png`), new Card("25", "25", `${url}25.png`), new Card("25", "25", `${url}25.png`), new Card("25", "25", `${url}25.png`), new Card("25", "25", `${url}25.png`),
			new Card("25", "25", `${url}25.png`), new Card("25", "25", `${url}25.png`), new Card("25", "25", `${url}25.png`), new Card("25", "25", `${url}25.png`), new Card("25", "25", `${url}25.png`)
		];
		if (Object.keys(this.players).length > 3) cards.push(new Card("hg", "Out of Gas", `${url}hg.png`), new Card("ht", "Flat Tire", `${url}ht.png`), new Card("ha", "Accident", `${url}ha.png`), new Card("hl", "Speed Limit", `${url}hl.png`), new Card("sp", "Stop", `${url}sp.png`));
		Util.shuffle(cards);
		this.piles.draw.cards = this.piles.draw.cards.concat(cards);
		return cards;
	}

	/**
	 * @param {string[]} args 
	 * @param {Discord.GuildMember|Discord.User} member 
	 * @param {Discord.Channel} channel 
	 */
	 discard(args, member, channel) {
		if (this.players[member.id]) {
			const player = this.players[member.id];
			member = player.member; // If the player sends a command through their DMs, the original "member" is actually a User.
			switch(args[0]) {
				case "team":
				case "t": {
					if (this.meta.phase >= 2) return channel.send("Can't change your team once the game has started!");
					if (Object.keys(this.players).length < 4) return channel.send("Not enough players in the game to form a team!");
					if (!args[1]) {
						if (player.partner) {
							this.meta.channel.send(`${member.displayName} and ${player.partner.member.displayName} are no longer on a team`);
							player.partner.partner = null;
							player.partner = null;
							return;
						} else return channel.send(`Specify a player to team up with! (\`!${args[0]} 𝘯𝘢𝘮𝘦\`. Accepts an @, or any portion of a username or nickname)`);
					}
					const plist = this.getPlayers(args[1]);
					if (plist.length > 1) return channel.send(`Be more specific! \`${args[1]}\` matched multiple players`);
					const player2 = plist[0];
					if (!player2 || player2 === player) return channel.send("Could not find that player");
					if (player2.partner) return channel.send("They already have a partner!");
					player.partner = player2;
					player2.partner = player;
					this.meta.channel.send(`${member.displayName} and ${player2.member.displayName} are now on a team`);
					break;
				}
				case "draw":
				case "d":
					if (this.meta.phase < 2 || player !== this.meta.currentPlayer) break;
					if (player.drew) return channel.send("You've already drawn!");
					this.props.lastHazard = null;
					player.drew = true;
					while (player.cards.length < 7 && this.piles.draw.cards.length) {
						player.cards.push(this.piles.draw.cards.shift());
					}
					this.meta.actionHistory.push(`${member.displayName} drew a card`);
					if (!this.piles.draw.cards.length) this.meta.actionHistory.push("The draw pile has been exhausted! Delayed action is now possible!");
					this.dealCards([player]);
					this.updateUI();
					break;
				default: {
					// TODO: if player !== currentPlayer && !coupfourre
					if (this.meta.phase < 2 || (player !== this.meta.currentPlayer)) break;
					if (!player.drew) return channel.send("Draw a card first, using `!d`!");
					let card = player.getCards(args[0])[0];
					if (!card) return channel.send("Can't find the specified card in your hand!");
					if (["d", "dis", "discard"].includes(args[1])) {
						this.piles.discard.cards.unshift(card);
						this.meta.actionHistory.push(`${member.displayName} discarded a ${card.name}`);
						player.grabCard(card);
						card = null;
					}
					const pile = player.pile;
					const players = Object.values(this.players);
					switch (card?.id) {
						case "200":
						case "100":
						case "75":
						case "50":
						case "25":
							if (pile.battleCards.length > 1 || (pile.battleCards[0].id !== "go" && (!pile.battleCards[0].id.startsWith("r") || !pile.safeties.some(card2 => card2.id === "sr")))) return channel.send("You can't drive yet!");
							if (pile.distance + Number(card.id) > this.props.totalDist) return channel.send(`You can't drive past the finish line! (${this.props.totalDist} miles)`);
							if (Number(card.id) > 50 && (pile.speedCard.id === "hl" || pile.battleCards.some(card2 => card2.id === "hl"))) return channel.send("Can't play a card above 50 miles! (Speed limit)");
							if (card.id === "200" && pile.cards.reduce((acc, card2) => acc + (card2.id === "200" ? 1 : 0), 0) === 2) return channel.send("Can't play more than two 200 cards in a round!");
							pile.cards.push(card);
							this.meta.actionHistory.push(`${member.displayName}${player.partner ? `and ${player.partner.member.displayName}` : ""} drove ${card.name} miles!`);
							// TODO: win detection
							break;
						case "hg":
						case "ht":
						case "ha":
						case "sp": {
							const plist = players.length === 4 || players.length === 2 ? [players.find(player2 => player2 !== player && player2 !== player.partner)] : this.getPlayers(args[1]);
							if (plist.length > 2) return channel.send(`Be more specific! \`${args[1]}\` matched multiple players`);
							const player2 = plist[0];
							if (!player2) return channel.send(`Could not find that player. (If you want to discard it instead, type \`!${args[0]} d\`)`);
							if (player2.pile.safeties.some(card2 => card2.id.substring(1) === card.id.substring(1)) || (player2.pile.safeties.some(card2 => card2.id === "sr") && card.id === "sp") || (!this.meta.rules.cutthroat && (player2.pile.battleCards[0].id !== "go" && (!player2.pile.battleCards[0].id.startsWith("r") || !player2.pile.safeties.some(card2 => card2.id === "sr"))))) return channel.send("Can't play that card on them!");
							this.meta.rules.cutthroat ? player2.pile.battleCards.push(card) : player2.pile.battleCards[0] = card;
							this.props.lastHazard = card;
							this.meta.actionHistory.push(`${member.displayName} played a ${card.name} on ${player2.member.displayName}${player2.partner ? `and ${player2.partner.member.displayName}` : ""}'s pile!`);
							break;
						}
						case "hl": {
							const plist = players.length === 4 || players.length === 2 ? [players.find(player2 => player2 !== player && player2 !== player.partner)] : this.getPlayers(args[1]);
							if (plist.length > 2) return channel.send(`Be more specific! \`${args[1]}\` matched multiple players`);
							const player2 = plist[0];
							if (!player2) return channel.send(`Could not find that player. (If you want to discard it instead, type \`!${args[0]} d\`)`);
							if (player2.pile.safeties.some(card2 => card2.id === "sr") || (!this.meta.rules.cutthroat && player2.pile.speedCard.id === "hl")) return channel.send("Can't play that card on them!");
							this.meta.rules.cutthroat ? player2.pile.battleCards.push(card) : player2.pile.speedCard = card;
							this.props.lastHazard = card;
							this.meta.actionHistory.push(`${member.displayName} played a ${card.name} on ${player2.member.displayName}${player2.partner ? `and ${player2.partner.member.displayName}` : ""}'s pile`);
							break;
						}
						case "rg":
						case "rt":
						case "ra": {
							const hIndex = player.pile.battleCards.findIndex(card2 => card2.id.substring(1) === card.id.substring(1));
							if (hIndex === -1) return channel.send(`You have nothing to fix! (If you wanted to discard instead, type \`!${args[0]} d\`)`);
							this.meta.actionHistory.push(`${member.displayName} fixed their ${player.pile.battleCards[hIndex].name}`);
							player.pile.battleCards.splice(hIndex, 1);
							break;
						}
						case "go": {
							if (player.pile.battleCards.some(card2 => card2.id === "go")) return channel.send(`Your light is already green! (If you want to discard it instead, type\`!${args[0]} d\`)`);
							const spIndex = player.pile.battleCards.findIndex(card2 => card2.id === "sp");
							if (spIndex > -1) player.pile.battleCards.splice(spIndex, 1);
							if (!this.meta.rules.cutthroat && player.pile.battleCards[0].id.startsWith("h")) return channel.send(`You need to fix the ${player.pile.battleCards[0].name} first!`);
							if (player.pile.battleCards.every(card2 => card2.id !== "sp")) player.pile.battleCards.push(card);
							this.meta.actionHistory.push(`${member.displayName} forced their light to turn green`);
							break;
						}
						case "rl":
							if (player.pile.speedCard.id !== "hl" || (this.meta.rules.cutthroat && !player.pile.battleCards.some(card2 => card2.id === "hl"))) return channel.send(`You're not currently speed limited! (If you want to discard it instead, type \`!${args[0]} d\`)`);
							this.meta.rules.cutthroat ? player.pile.battleCards.splice(player.pile.battleCards.findIndex(card2 => card2.id === "hl"), 1) : player.pile.speedCard = card;
							this.meta.actionHistory.push(`${member.displayName} removed the speed limit sign taped to their car`);
							break;
						case "sg":
						case "st":
						case "sa":
						case "sr":
							if (this.props.lastHazard) {
								players.forEach(player2 => {
									if (this.props.lastHazard.id === "hl" && !this.meta.rules.cutthroat) {
										if (player2.pile.speedCard === this.props.lastHazard) player2.pile.speedCard = null;
									} else {
										const hIndex = player.pile.battleCards.findIndex(card2 => card2 === this.props.lastHazard);
										if (hIndex > -1) player.pile.battleCards.splice(hIndex, 1);
									}
								});
								card.coup = true;
								this.meta.actionHistory.push(`${member.displayName} played a coup fouree!`);
							} else this.meta.actionHistory.push(`${member.displayName} played a ${card.name}!`);
							player.pile.safeties.push(card);
							player.drew = false;
							break;
					}
					if (card) player.grabCard(card);
					// TODO: detect if no playable cards left
					this.dealCards([player]);
					if (!card.id.startsWith("s") || card.id === "sp") this.nextPlayer();
					this.updateUI();
					break;
				}
			}
		}
	 }

	 nextPlayer() {
		const players = Object.values(this.players);
		this.meta.currentPlayer = players.find(player2 => player2.index === (this.meta.currentPlayer.index + 1 + players.length) % players.length);
		this.resetTimeLimit();
	}

	updateUI() {
		this.renderTable();
		this.render.queue(() => {
			const display = new Discord.MessageEmbed();
			const players = Object.values(this.players);
			const highDistance = players.reduce((acc, player) => Math.max(acc, player.pile.distance || 0), 0);
			display.setTitle(`It is currently ${this.meta.currentPlayer.member.displayName}'s turn`)
				.attachFiles(new Discord.MessageAttachment(this.render.canvas.toBuffer(), "game.png"))
				.setDescription(this.meta.actionHistory.slice(-3).reverse().join("\n"))
				.setColor(!this.piles.draw.cards.length ? [0, 0, 0] : [Math.max(0, Math.min(255, 510*highDistance/this.props.totalDist)), Math.max(0, Math.min(255, -510*highDistance/this.props.totalDist + 510)), 0])
				.setImage("attachment://game.png")
				// TODO: score footer
				.setFooter(`${players.map(player => `${player.member.displayName}'s score: ${player.score}`).join(" · ")} · !phases`);
			return this.meta.channel.send(display);
		});
		this.render.flush();
	}

	// TODO: remove player
	// TODO: fix teams (during setup phase)
	/** @param {Player} player - The Player to remove from the game */
	removePlayer(player) {}

	renderTable() {
		this.render.queue(() => this.render.drawImage(this.render._canvas, 0, 0));
		const players = Object.values(this.players);

		players.forEach(player => {
			this.render.drawText(player.cards.length, player.x + 140, player.y + 35);
		});

		this.render.queue(() => this.render.drawImage(this.render.images.halo, this.meta.currentPlayer.x - 10, this.meta.currentPlayer.y - 10),
			() => Canvas.loadImage(this.piles.discard.cards[0]?.image || "images/discardpileghost.png").then(image => this.render.ctx.drawImage(image, 437, 125, 175, 250)));
	}

	drawStatic() {
		super.drawStatic();
		this.render.queue(() => Canvas.loadImage("images/mille/back.png").then(image => this.render.ctx.drawImage(image, 237, 125, 175, 250)),
			() => Canvas.loadImage("images/mille/icon.png").then(image => Object.values(this.players).forEach(player => this.render.ctx.drawImage(image, player.x + 95, player.y))),
			() => this.saveCanvas());
		this.render.flush();
	}

	// Type mapping

	/**
	 * @param {string} input
	 * @returns {MillePlayer[]}
	*/
	getPlayers(input) {
		return super.getPlayers(input);
	}
}

/**
 * Custom Mille Bornes Player
 */
class MillePlayer extends Player {
	/**
	 * @param {Discord.GuildMember} member 
	 * @param {boolean} isLeader 
	 * @param {MillePlayer} partner - Their partner for the game, if applicable
	 * @param {MillePile} pile 
	 * @param {boolean} drew 
	 */
	constructor(member, isLeader, partner = null, pile = null, drew = false) {
		super(member, [], isLeader);

		/**@type {?MillePlayer} - Their partner for the game, if applicable */
		this.partner = partner;
		/**@type {MillePile} - Their pile, including mile cards, battle cards, speed cards, and safeties */
		this.pile = pile;
		/**@type {boolean} - Whether they've drawn for their turn or not */
		this.drew = drew;
		/**@type {number} - Their running score for the game*/
		this.score = 0;
	}

	/**
	 * @param {string} argument - The string formatted in "card selection syntax"
	 * @returns {MilleCard[]}
	 */
	getCards(argument) {
		return super.getCards(argument);
	}
}

/**
 * Custom Pile for mile, hazard, speed, and safety cards
 */
class MillePile extends Pile {
	/**
	 * @param {Card[]} [cards] - The mile cards in this pile
	 * @param {Object<string, *>} [traits] - Any dynamically generated traits the pile has
	 * @param {number} distance - The current distance this pile has in miles
	 * @param {Card[]} battleCards - The battle card(s) (if cutthroat) the pile has
	 * @param {Card} speedCard - The top card on the speed pile
	 * @param {MilleCard[]} safeties - The safety cards the pile has
	 */
	constructor(cards, traits, distance = 0, battleCards = [], speedCard = null, safeties = []) {
		super(cards, traits);
		this.distance = distance;
		this.battleCards = battleCards;
		this.speedCard = speedCard;
		this.safeties = safeties;
	}
}

/**
 * Custom Card for storing coup fouree information
 */
class MilleCard extends Card {
	/**
	 * @param {string} id - The id of the card
	 * @param {string} [name] - The Human-Readable name of the card, defaults to the id
	 * @param {string|""} [image] - The URL to the image of the card
	 * @param {Object<string, *>} [traits] - Any special traits the card might have
	 * @param {Object<string, *>} [hidden] - Exactly like traits, but never shown to the player
	 */
	constructor(id, name, image, traits, hidden) {
		super(id, name, image, traits, hidden);
		/** Represents if this card was played as a coup fouree. */
		this.coup = false;
	}
}