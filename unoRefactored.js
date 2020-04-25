import events from "events";
import Discord from "discord.js";
import core from "./coreGame.js";
import unoMod from "./unoModRefactored.js";
import links from "./card_images/uno/links.json";

/** 
 * The base implementation of uno
 * @class baseUno
*/
export default class baseUno extends core {
	/**
	 * @param {Discord.GuildChannel} channel - The channel to send updates to
	 * @param {Discord.GuildMember} member - The provided member to make a player out of
	 * @param {object} firstPlayer  - The initial default player
	 * @param {Discord.GuildMember} firstPlayer.member - The member of the default player
	 * @param {object[]} firstPlayer.cards - The list of cards for the default player
	 * @param {boolean} firstPlayer.isLeader - Whether the default player is the leader of the game
	 * @param {number} firstPlayer.index - The numerical index of the default player in the play order of the game. Starts at 0
	 * @param {object} firstPlayer.traits - Customizable object for extra traits about the default player
	 */
	constructor(channel, member, firstPlayer) {
		// TODO: add a command which changes the number points requried to win/lose.
		let rules = {
			points: ["Play for Points - :100:", "The game is played in a series of rounds, where the winning player recieves a number of points based on the other players' cards and wins once it's over 500", "💯"],
			altPoints: ["Alternate Points Rule - :1234:", "Instead, loosing players get points from their own cards, and are eliminated when it reaches 500", "🔢"],
			startingCards: [`Number of Starting Cards: 7`, `type \`!startingcards 𝘯𝘶𝘮\` or \`!sc 𝘯𝘶𝘮\` to change`]
		}

		let players = {
			[member.id]: firstPlayer
		}
		players[member.id].traits = {
			// TODO: remove canRenege. (replace with null checkes for renegeCard)
			canRenege: false,
			renegeCard: null,
			oneCardNoUno: false,
			points: 0
		}

		super("Uno", channel, rules, { startingCards: 7, clockwise: true}, {}, players);
		/**The event emitter used for mods */
		this.events = new events.EventEmitter();
	}

	genDefaultPlayer(member) {
		const player = super.genDefaultPlayer(member);
		this.events.emit("genDefaultPlayer", core.phases.START, player);
		if (!this.genDefaultPlayer.cancelled) player.traits = {canRenege: false, renegeCard: null, oneCardNoUno: false, points: 0};
		this.events.emit("genDefaultPlayer", core.phases.END, player);
		this.genDefaultPlayer.cancelled = false;
		return player;
	}

	setup() {
		new unoMod(this);
		// Register server mods here...
		this.events.emit("setup", core.phases.START);
		// if (!this.setup.cancelled) {}
		this.events.emit("setup", core.phases.END);
		this.setup.cancelled = false;
	}

	start() {
		this.events.emit("start", core.phases.START);
		if (!this.start.cancelled) {
			if (Object.keys(this.players).length < 2) return this.meta.channel.send("Not enough players!");
			if (Object.keys(this.meta.rules).length) this.meta.ruleReactor.stop();
			this.meta.phase = 2;

			this.randomizePlayerOrder();
			this.piles.draw = {cards: [], traits: {}};
			this.piles.discard = {cards: [], traits: {}};
			this.deckCreate();
			this.piles.discard.cards.unshift(this.piles.draw.cards.shift());
			for (let playerID in this.players) {
				this.players[playerID].cards = this.piles.draw.cards.splice(0, this.meta.traits.startingCards);
			}
			if (this.piles.discard.cards[0].id === "ww") this.piles.discard.cards[0].traits.color = "w";
			this.meta.currentPlayerID = Object.keys(this.players).find(playerID => !this.players[playerID].index);
			this.meta.actionHistory.push("The game has just started!");
			switch (this.piles.discard.cards[0].id.substring(1)) {
				case "d":
					const drew = this.draw(this.players[this.meta.currentPlayerID], 2).length;
					this.meta.actionHistory.push(`${this.players[this.meta.currentPlayerID].member.displayName} drew ${drew} card${core.plural(drew)} due to the starting card`);
					this.nextPlayer();
					break;
				case "s":
					this.meta.actionHistory.push(`${this.players[this.meta.currentPlayerID].member.displayName} was skipped due to the starting card`);
					this.nextPlayer();
					break;
				case "r":
					this.meta.traits.clockwise = !this.meta.traits.clockwise;
					this.meta.actionHistory.push(`${this.players[this.meta.currentPlayerID].member.displayName} was skipped and play is reversed due to the starting card`);
					this.nextPlayer();
					break;
			}
			this.dealCards(); // Deal to all players
			if (!Object.values(this.players).reduce((acc, player) => {return acc+player.traits.points},0)) this.updateUI();
			this.meta.channel.send(`Play order: ${Object.values(this.players).sort((player1, player2) => player1.index - player2.index).reduce((acc, player) => {return `${acc}${player.member.displayName}, `}, "").slice(0,-2)}\nGo to <https://github.com/Bedrockbreaker/unobot/wiki/Uno> to learn how to play.`);
			this.resetTimeLimit();
		} 
		this.events.emit("start", core.phases.END);
		this.start.cancelled = false;
	}

	deckCreate() {
		this.events.emit("deckCreate", core.phases.START);
		if (!this.deckCreate.cancelled) {
			const c = ["r","g","b","y"];
			const colors = ["Red", "Green", "Blue", "Yellow"];
			for (let k = 0; k < Math.ceil(Object.keys(this.players).length * this.meta.traits.startingCards / 28); k++) {
				for (let i = 0; i < 4; i++) {
					this.piles.draw.cards.push({ id: "ww", name: "Wild", image: links.ww, traits: {} }, { id: "w4", name: "Wild Draw 4", image: links.w4, traits: {} },
						{ id: `${c[i]}0`, name: `${colors[i]} 0`, image: links[`${c[i]}0`], traits: {} },
						{ id: `${c[i]}d`, name: `${colors[i]} Draw 2`, image: links[`${c[i]}d`], traits: {} }, { id: `${c[i]}d`, name: `${colors[i]} Draw 2`, image: links[`${c[i]}d`], traits: {} },
						{ id: `${c[i]}s`, name: `${colors[i]} Skip`, image: links[`${c[i]}s`], traits: {} }, { id: `${c[i]}s`, name: `${colors[i]} Skip`, image: links[`${c[i]}s`], traits: {} },
						{ id: `${c[i]}r`, name: `${colors[i]} Reverse`, image: links[`${c[i]}r`], traits: {} }, { id: `${c[i]}r`, name: `${colors[i]} Reverse`, image: links[`${c[i]}r`], traits: {} });
					for (let j = 1; j < 10; j++) {
						this.piles.draw.cards.push({ id: `${c[i]}${j}`, name: `${colors[i]} ${j}`, image: links[`${c[i]}${j}`], traits: {} }, { id: `${c[i]}${j}`, name: `${colors[i]} ${j}`, image: links[`${c[i]}${j}`], traits: {} });
					}
				}
			}
			// List of cards that shouldn't ever be drawn first.
			this.piles.draw.traits.badFirstCards = ["w4"];
		}
		this.events.emit("deckCreate", core.phases.END);
		if (!this.deckCreate.cancelled) {
			do {
				core.shuffle(this.piles.draw.cards);
			} while (this.piles.draw.traits.badFirstCards.includes(this.piles.draw.cards[0].id));
		}
		console.log(this.piles.draw.cards[0].id);
		this.deckCreate.cancelled = false;
	}

	discard(args, member) {
		this.events.emit("discard", core.phases.START, args, member);
		if (!this.discard.cancelled && this.players.hasOwnProperty(member.id)) {
			const player = this.players[member.id];
			member = player.member; // If the player sends a command through their DMs, the original "member" is actually the author of the message.
			switch(args[0]) {
				case "sc":
				case "startingcards":
					if (!player.isLeader) {this.meta.channel.send("Only the leader can change that!"); break;}
					if (isNaN(Number(args[1]))) {this.meta.channel.send(`${typeof args[1] === "undefined" ? "That" : `\`${args[1]}\``} is not a valid number!`); break;}
					this.meta.traits.startingCards = Math.abs(Math.floor(Number(args[1])));
					// TODO: edit the rules message to reflect this?
					this.meta.channel.send(`:white_check_mark: Successfully changed the starting number of cards to ${this.meta.traits.startingCards}`);
					break;
				case "d":
				case "draw":
					if (this.meta.phase < 2 || this.meta.currentPlayerID !== member.id || player.traits.canRenege) break; // also checks to make sure the player isn't drawing multiple times
					const drew = this.draw(player, 1);
					this.meta.actionHistory.push(`${member.displayName} drew ${drew.length} card${core.plural(drew.length)}`);
					player.traits.renegeCard = drew[drew.length-1];
					player.traits.canRenege = true;
					this.updateUI();
					break;
				case "n":
				case "next":
				case "endturn":
					if (this.meta.phase < 2 || this.meta.currentPlayerID !== member.id || (!player.traits.canRenege && !this.piles.discard.cards[0].traits.owner)) break;
					if (this.piles.discard.cards[0].traits.owner) {
						this.piles.discard.cards[0].traits.owner = null;
						console.log(this.piles.discard.cards[0].traits.owner);
						const drew = this.draw(player, 4).length;
						this.meta.actionHistory.push(`${member.displayName} was forced to draw ${drew} card${core.plural(drew)}`);
					}
					this.nextPlayer();
					this.updateUI();
					break;
				case "uno":
					if (this.meta.phase < 2) break;
					// Rip mobile users ;)
					if (player.cards.length === 1 && player.traits.oneCardNoUno) {
						player.traits.oneCardNoUno = false;
						this.meta.actionHistory.push(`${member.displayName} said uno!`);
					} else {
						const slowpoke = Object.values(this.players).find(player => player.traits.oneCardNoUno);
						if (slowpoke) {
							const drew = this.draw(slowpoke, 2).length;
							this.meta.actionHistory.push(`${slowpoke.member.displayName} drew ${drew} card${core.plural(drew)} from not saying \`!uno\` fast enough`);
						} else {
							const drew = this.draw(player, 2).length;
							this.meta.actionHistory.push(`${member.displayName} drew ${drew} card${core.plural(drew)} from falsely calling uno`);
						}
					}
					this.updateUI();
					break;
				case "c":
				case "challenge":
					if (this.meta.phase < 2 || this.meta.currentPlayerID !== member.id || !this.piles.discard.cards[0].traits.owner) break;
					const owner = this.piles.discard.cards[0].traits.owner;
					this.piles.discard.cards[0].traits.owner = null;
					console.log(this.piles.discard.cards[0].traits.owner);
					if (owner.cards.some(card => card.id === "w4" ? false : this.match(card, this.piles.discard.cards[1]))) {
						const drew = this.draw(owner, 4).length;
						this.meta.actionHistory.push(`${owner.member.displayName} drew ${drew} card${core.plural(drew)} from failing to sneak a draw 4`);
					} else {
						const drew = this.draw(player, 6).length;
						this.meta.actionHistory.push(`${member.displayName} drew ${drew} card${core.plural(drew)} from unsuccessfully challenging a draw 4`);
						this.nextPlayer();
					}
					this.updateUI();
					break;
				default:
					if (this.meta.phase < 2 || this.meta.currentPlayerID !== member.id) break;
					// !id.bool,num:2,string:yeet ...args
					const card = this.getCards(player, args[0].split(".")[0], args[0].split(".")[1])[0];
					if (!card || !this.match(card, this.piles.discard.cards[0], args, player)) break;
					this.piles.discard.cards.unshift(player.cards.splice(player.cards.findIndex(card2 => card === card2),1)[0]);
					let action = `${member.displayName} discarded a ${card.name}`;
					if (card.id.startsWith("w")) card.traits.color = args[1].substring(0,1);
					if (card.id === "w4") card.traits.owner = player;
					this.nextPlayer();
					if (player.cards.length !== 0) {
						this.dealCards(member.id);
						if (player.cards.length === 1 && !player.traits.oneCardNoUno) player.traits.oneCardNoUno = true;
						switch(card.id.substring(1)) {
							case "r":
								this.meta.traits.clockwise = !this.meta.traits.clockwise;
								if (Object.keys(this.players).length === 2) {
									action += ` and skipped ${this.players[this.meta.currentPlayerID].member.displayName}'s turn`;
								} else {
									this.nextPlayer();
									action += " and reversed the play direction";
								}
								this.nextPlayer();
								break;
							case "s":
								action += ` and skipped ${this.players[this.meta.currentPlayerID].member.displayName}'s turn`;
								this.nextPlayer();
								break;
							case "d":
								const drew = this.draw(this.players[this.meta.currentPlayerID], 2).length;
								action += ` and forced ${this.players[this.meta.currentPlayerID].member.displayName} to draw ${drew} card${core.plural(drew)}`;
								this.nextPlayer();
								break;
						}
					} else {
						let won = true;
						console.log("winning...");
						if (this.meta.rules.points) {
							won = false;
							player.traits.points += Object.values(this.players).reduce(player2 => player2.cards.reduce((total, card2) => {return total+(Number(card2.id.substring(1)) || (card2.id.startsWith("w") ? 50 : 20))},0));
							if (player.traits.points >= 500) won = true;
						} else if (this.meta.rules.altPoints) {
							won = false;
							let lowestScore = Number.MAX_SAFE_INTEGER;
							Object.values(this.players).forEach(player2 => {
								player2.traits.points += player2.cards.reduce((total, card2) => {return total+(Number(card2.id.substring(1)) || (card2.id.startsWith("w") ? 50 : 20))},0);
								lowestScore = Math.min(lowestScore, player2.traits.points);
							});
							let removedPlayers = [];
							Object.values(this.players).forEach(player2 => {
								if (player2.traits.points >= 500 && player2.traits.points !== lowestScore) {
									removedPlayers.push(player2.member.displayName);
									this.removePlayer(player2);
								}
							});
							this.meta.currentPlayerID = Object.keys(this.players)[0]; // Ensures, when the game is won, the ui is updated one last time
							this.meta.channel.send(`Removed Players: ${removedPlayers.join(", ") || "None ~~yet~~"}`);
							if (Object.keys(this.players).length === 1) won = true;
						}
						if (won) {
							this.meta.channel.send(`${member.displayName} has won the game${this.meta.rules.points || this.meta.rules.altPoints ? ` with ${player.traits.points} points` : ""}!`);
							action += `, winning the game${this.meta.rules.points || this.meta.rules.altPoints ? ` with ${player.traits.points} points` : ""}!`;
							this.meta.ended = true;
						} else {
							this.meta.channel.send(`${member.displayName} has won the round with ${player.traits.points} points!`);
							action += `, winning the round with ${player.traits.points} points!`;
							player.traits.oneCardNoUno = false;
							this.start();
						}
					}
					this.meta.actionHistory.push(action);
					this.updateUI();
			}
		}
		this.events.emit("discard", core.phases.END, args, member);
		this.discard.cancelled = false;
	}

	nextPlayer() {
		this.events.emit("nextPlayer", core.phases.START);
		if (!this.nextPlayer.cancelled) {
			this.meta.traits.prevPlayerID = this.meta.currentPlayerID;
			const player = this.players[this.meta.currentPlayerID];
			if (this.players[this.meta.traits.prevPlayerID].traits.oneCardNoUno) this.meta.actionHistory.push(`${player.member.displayName} got away without saying uno!`);
			player.traits.renegeCard = null;
			player.traits.oneCardNoUno = false;
			player.traits.canRenege = false;
			const index = ((Object.values(this.players).find(player1 => player1.member.id === this.meta.currentPlayerID).index + (this.meta.traits.clockwise ? 1 : -1)) + Object.keys(this.players).length) % Object.keys(this.players).length;
			this.meta.currentPlayerID = Object.values(this.players).find(player2 => player2.index === index).member.id;
			this.resetTimeLimit();
		}
		this.events.emit("nextPlayer", core.phases.END);
		this.nextPlayer.cancelled = false;
	}

	timeLimit() {
		this.events.emit("timeLimit", core.phases.START);
		if (!this.timeLimit.cancelled) {
			const drew = this.draw(this.players[this.meta.currentPlayerID], 1).length;
			this.meta.actionHistory.push(`${this.players[this.meta.currentPlayerID].member.displayName} drew ${drew} card${core.plural(drew)} for taking too long`);
			this.nextPlayer();
		}
		this.events.emit("timeLimit", core.phases.END);
	}

	updateUI() {
		const display = new Discord.RichEmbed();
		this.events.emit("updateUI", core.phases.START, display);
		if (!this.updateUI.cancelled) {
			const rightPlayer = Object.values(this.players).find(player => player.index === (this.players[this.meta.currentPlayerID].index+1)%Object.keys(this.players).length);
			const leftPlayer = Object.values(this.players).find(player => player.index === (this.players[this.meta.currentPlayerID].index-1+Object.keys(this.players).length)%Object.keys(this.players).length);
			display.setTitle(`Current Discarded Card: ${this.piles.discard.cards[0].name}`)
			.setThumbnail(this.players[this.meta.currentPlayerID].member.user.avatarURL)
			.setDescription(`It is currently ${this.players[this.meta.currentPlayerID].member.displayName}'s turn${this.piles.discard.cards[0].id.startsWith("w") && this.piles.discard.cards.length > 1 ? `\n**Current Color: ${{r: "Red", g: "Green", b: "Blue", y: "Yellow"}[this.piles.discard.cards[0].traits.color]}**` : ""}${this.piles.discard.cards[0].traits.owner ? "\n**Type `!challenge` to challenge or `!next` to take the extra cards**" : ""}`)
			.addField(`${leftPlayer.member.displayName} ${this.meta.traits.clockwise ? `-> **${this.players[this.meta.currentPlayerID].member.displayName}** ->` : `<- **${this.players[this.meta.currentPlayerID].member.displayName}** <-`} ${rightPlayer.member.displayName}`, this.meta.actionHistory.slice(-2).reverse().join("\n"))
			.setColor(this.piles.discard.cards[0].id.startsWith("w") ? {r: "#D40000", g: "#2CA05A", b: "#2A7FFF", y: "#FFCC00", w: "#A100FF"}[this.piles.discard.cards[0].traits.color] : {6: "#71FF00", 5: "#BDFF00", 4: "#F1DF00", 3: "#FF9800", 2: "#FF4C00", 1: "#FF1400", 0: "#A100FF"}[Object.values(this.players).reduce((acc, player) => {return Math.min(acc, player.cards.length)}, 7).toString()] || "#26FF00")
			.setImage(this.piles.discard.cards[0].image || "https://i.ibb.co/BwSXYnV/unknown.png")
			.setFooter(Object.values(this.players).reduce((acc, player) => {return acc += `${player.member.displayName}: ${player.cards.length} card${core.plural(player.cards.length)}${(this.meta.rules.points || this.meta.rules.altPoints) ? ` + ${player.traits.points} point${core.plural(player.traits.points)}, ` : ", "}`}, "").slice(0, -2));
		}
		this.events.emit("updateUI", core.phases.END, display);
		if (!this.updateUI.cancelled) this.meta.channel.send(display);
		this.updateUI.cancelled = false;
	}

	addPlayer(member) {
		const player = this.genDefaultPlayer(member);
		this.events.emit("addPlayer", core.phases.START, player);
		if (!this.addPlayer.cancelled) {
			this.players[member.id] = player;
			if (this.meta.phase >= 2) player.cards = this.piles.draw.cards.splice(0, this.meta.traits.startingCards);
		}
		this.events.emit("addPlayer", core.phases.END, player);
		this.addPlayer.cancelled = false;
	}

	removePlayer(player) {
		this.events.emit("removePlayer", core.phases.START, player);
		if (!this.removePlayer.cancelled) {
			console.log("removing...");
			this.piles.draw.cards = this.piles.draw.cards.concat(player.cards);
			core.shuffle(this.piles.draw.cards);
			this.meta.deletePlayer = player.member.id;
			if (player.member.id === this.meta.currentPlayerID) this.nextPlayer();
			console.log(delete this.players[player.member.id]);
		}
		this.events.emit("removePlayer", core.phases.END, player);
		this.removePlayer.cancelled = false;
	}

	/*
	The methods below are Uno-specific methods.
	They usually don't appear outside of uno
	*/

	// Considering moving this to coreGame and overriding here.
	// It's most likely common enough to warrant a default implementation.
	draw(player, numCards) {
		let newCards = [];
		this.events.emit("draw", core.phases.START, player, numCards, newCards);
		if (!this.draw.cancelled) {
			for (let i = 0; i < numCards; i++) {
				newCards.push(this.piles.draw.cards.shift());
				if (this.piles.draw.cards.length === 0) this.deckCreate(); // Instead of reshuffling the old deck, we create a new one to preserve card history. Doesn't break mods which rely on previously discarded cards.
			}
		}
		this.events.emit("draw", core.phases.END, player, numCards, newCards);
		if (!this.draw.cancelled) {
			player.traits.oneCardNoUno = false;
			player.cards = player.cards.concat(newCards);
			this.dealCards(player.member.id);
		}
		this.draw.cancelled = false;
		return newCards;
	}

	// If args or player isn't provided, it's testing to see if the cards could match
	// If they are provided, it's testing to see if the card was played correctly
	/**
	 * Tests if two cards match.
	 * If args and player are not provided, the function will return if the cards could match.
	 * If they are provided, it will return if the card matches and was played correctly (i.e. providing a color for a wild)
	 * @param {object} card1 - The first card, generally the one in the player's hand
	 * @param {object} card2 - The second card, generally the one on the discard pile
	 * @param {string[]} [args] - Any arguments the player typed for the card (i.e. colors for wilds)
	 * @param {object} [player] - The player who is playing the card.
	 * @returns {boolean} If the cards matched
	 */
	match(card1, card2, args, player) {
		/**
		 * Your match function should return [boolean, boolean]
		 * 
		 * [can card match, could card still match even if your function returns false for the first value]
		 * @type {Array.<Boolean[]>}
		 */
		let canMatch = [];
		this.events.emit("match", core.phases.START, card1, card2, args, player, canMatch);
		if (!this.match.cancelled) canMatch.push([card1.id.startsWith(card2.id.substring(0,1)) || card1.id.substring(1) === card2.id.substring(1) || card1.id.startsWith("w") || card1.id.startsWith(this.piles.discard.cards[0].traits.color) || this.piles.discard.cards[0].traits.color === "w",
		(!player || !player.traits.canRenege || player.traits.renegeCard === card1) && (!args || !card1.id.startsWith("w") || ["red", "r", "green", "g", "blue", "b", "yellow", "y"].includes(args[1]))]);
		this.events.emit("match", core.phases.END, card1, card2, args, player, canMatch);
		this.match.cancelled = false;
		// TODO: fix this. Doesn't properly reduce the result when there are multiple submissions.
		return canMatch.reduce((acc, match1) => {return (acc || match1[0]) && match1[1]}, false);
	}
}