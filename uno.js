import {Collection, GuildMember, MessageActionRow, MessageAttachment, MessageButton, MessageComponentInteraction, MessageEmbed, MessageSelectMenu, ThreadChannel} from "discord.js";
import {Core, Util, Color, Player, Pile, Card, Setting} from "./core.js";

/**
 * The base implementation of uno
 */
export default class baseUno extends Core {
	/**
	 * @param {ThreadChannel} thread - The thread the game is in
	 */
	constructor(thread) {
		const settings = new Collection([
			["points", new Setting(0,
				"Play for Points - :100: ・ $0",
				"- The game is played in a series of rounds, where the winning player receives a number of points based on the other players' cards and wins once it's over $1.\n- Alternate Rule: Instead, loosing players get points from their own cards, and are eliminated when it reaches $1.\n- Use `/g settings score <num>` to change the threshold",
				Util.Selection("points", [["Points - Off", "Points will be disabled"], ["Points - On", "Points are good"], ["Points - Alt", "Points are bad"]]),
				() => [this.displayVote("points", ["Off", "On", "Alt"]), this.getSetting("scoreThreshold")])],
			["scoreThreshold", new Setting(500)],
			["startingCards", new Setting(7,
				"Number of Starting Cards: $0",
				"- Use `/g settings StartingCards <num>` to change",
				undefined,
				() => [this.getSetting("startingCards")])],
			["contDraw", new Setting(0,
				"Draw Until You Discard - :arrow_up: ・ $0",
				"- If you can't play a card, you keep drawing until you can",
				Util.Selection("contDraw", [["Draw until Discard - Off", "Only draw 1 card if you have no moves"], ["Draw until Discard - On", "Keep drawing cards until you can discard one of them"]]),
				() => [this.displayVote("contDraw", ["Off", "On"])])],
			["stacking", new Setting(0,
				"Stacking - :books: ・ $0",
				"- Draw 2s and Draw 4s can be stacked, moving play on to the next player, who can either stack again or draw for all stacked cards.\n- Alternate Rules: Draw 2s cannot stack on Draw 4s, or Draw 2s and Draw 4s cannot mix",
				Util.Selection("stacking", [["Stacking - Off", "Draw cards do not stack"], ["Stacking - On", "All draw cards stack"], ["Stacking - D2-x>D4", "Draw cards can stack, except Draw 2s onto Draw 4s"], ["Stacking - D2<-x->D4", "Draw cards can stack, but cannot mix types"]]),
				() => [this.displayVote("stacking", ["Off", "On", "D2-x>D4", "D2<-x->D4"])])],
			["zSCards", new Setting(0,
				"0-7 Special Cards - :arrows_counterclockwise: ・ $0",
				"- 0 cards rotate all hands in the direction of play, and 7s swap hands with a specific player of your choosing\n- Alternate rules: Only 0s are special, or only 7s are special",
				Util.Selection("zSCards", [["0-7 Special - Off", "0s and 7s cards behave normally"], ["0-7 Special - On", "0s and 7s have funky effects"], ["0 Special - On", "Only 0s have funky effects"], ["7 Special - On", "Only 7s have funky effects"]]),
				() => [this.displayVote("zSCards", ["Off", "On", "7s Only", "0s Only"])])],
			["jumpIn", new Setting(0,
				"Jumping-in - :zap: ・ $0",
				"- If you have a card that exactly matches the current discarded card, you can play it immediately (no matter whose turn it is), and play continues as if you just took your turn\n- Alternate rule: Jumping in cancels any stacked Draw cards",
				Util.Selection("jumpIn", [["Jump In - Off", "You must wait for your turn to play a card"], ["Jump In - On", "You can play a card immediately if it's an exact match"], ["Jump In - Alt", "Jumping in resets any stacked Draw cards"]]),
				() => [this.displayVote("jumpIn", ["Off", "On", "On (Resets Stack)"])])]
		]);

		super("Uno", thread, settings);

		/**@type {Collection<string, UnoPile>} */
		this.piles;
		/**@type {UnoPlayer} */
		this.currentPlayer;
		/**@type {Collection<string, UnoPlayer>} */
		this.players;

		/** Whether the play-direction is clockwise or not */
		this.clockwise = true;

		/** List of tips displayed in the footer */
		this.tips = ["Tip #1: Pay attention to your opponents", "Tip #2: Keep Draw 2s and Draw 4s for emergencies", "Tip #3: Change colors often", "Tip #4: Co-operate with other players", "Tip #5: Maximize your playable cards", "Tip #6: Count cards", "Tip #7: Discard similar numbers before similar colors",
			"Tip #8: Keep wilds until the end", "Tip #9: Don't play the reverse card at the wrong time", "Tip #10: Try to keep at least 1 Draw card in your hand", "Tip #11: Always change the color with a Draw 4", "Tip #12: Don't lose"];
	}

	/**
	 * @param {GuildMember} member 
	 * @param {boolean} isLeader 
	 */
	genDefaultPlayer(member, isLeader = false) {
		return new UnoPlayer(member, [], isLeader);
	}

	/**
	 * @param {MessageComponentInteraction} action - The Interaction to reply to
	 * @returns {void}
	 */
	start(action) {
		if (this.players.size < 2) return action.reply({content: "There aren't enough players!", ephemeral: true});
		if (this.meta.phase < 2) { // Because start() can be called multiple times
			this.getSettings();
			if (this.getSetting("zSCards")) this.tips.push("Tip #13: Whenever you swap hands, click 'Show Hand' again");
		}
		this.meta.phase = 2;
		this.clockwise = true;
		this.randomizePlayerOrder();

		const drawPile = new UnoPile(this.deckCreate());
		const discardPile = new UnoPile();
		this.piles.set("draw", drawPile);
		this.piles.set("discard", discardPile);

		discardPile.cards.unshift(drawPile.cards.shift());
		this.players.forEach(player => {
			player.cards = drawPile.cards.splice(0, this.getSetting("startingCards"));
			player.renegeCard = null;
			player.saidUno = false;
			if (player !== this.players.get(action.member.id)) player.ping = true;
		});
		if (discardPile.cards[0].id === "ww") discardPile.cards[0].color = "w";

		this.currentPlayer = this.players.find(player => !player.index);
		this.meta.actionHistory.push("The game has just started!");

		switch (discardPile.cards[0].id.substring(1)) {
			case "d":
				if (this.getSetting("stacking")) {
					drawPile.drawNum += 2;
				} else {
					const cards = this.draw(2);
					this.currentPlayer.cards.push(...cards);
					this.meta.actionHistory.push(`${this.currentPlayer.member.displayName} drew ${cards.length} card${Util.plural(cards.length)} due to the starting card`);
					this.nextPlayer();
				}
				break;
			case "s":
				this.meta.actionHistory.push(`${this.currentPlayer.member.displayName} was skipped due to the starting card`);
				this.nextPlayer();
				break;
			case "r":
				this.clockwise = !this.clockwise;
				this.meta.actionHistory.push(`${this.currentPlayer.member.displayName} was skipped and play is reversed due to the starting card`);
				this.nextPlayer();
				break;
		}

		if (this.players.every(player => !player.points)) super.start(action);
		this.updateUI(action);
	}

	deckCreate() {
		/** @type {UnoCard[]} */
		const cards = [];
		const c = ["r","g","b","y"];
		const colors = ["Red", "Green", "Blue", "Yellow"];
		for (let k = 0; k < Math.ceil(this.players.size * this.getSetting("startingCards") / 28); k++) {
			for (let i = 0; i < 4; i++) {
				cards.push(new UnoCard("ww", "Wild", `uno/ww.png`), new UnoCard("w4", "Wild Draw 4", `uno/w4.png`), new UnoCard(`${c[i]}0`, `${colors[i]} 0`, `uno/${c[i]}0.png`),
					new UnoCard(`${c[i]}d`, `${colors[i]} Draw 2`, `uno/${c[i]}d.png`), new UnoCard(`${c[i]}d`, `${colors[i]} Draw 2`, `uno/${c[i]}d.png`),
					new UnoCard(`${c[i]}s`, `${colors[i]} Skip`, `uno/${c[i]}s.png`), new UnoCard(`${c[i]}s`, `${colors[i]} Skip`, `uno/${c[i]}s.png`),
					new UnoCard(`${c[i]}r`, `${colors[i]} Reverse`, `uno/${c[i]}r.png`), new UnoCard(`${c[i]}r`, `${colors[i]} Reverse`, `uno/${c[i]}r.png`));
				for (let j = 1; j < 10; j++) {
					cards.push(new UnoCard(`${c[i]}${j}`, `${colors[i]} ${j}`, `uno/${c[i]}${j}.png`), new UnoCard(`${c[i]}${j}`, `${colors[i]} ${j}`, `uno/${c[i]}${j}.png`));
				}
			}
		}

		do {
			Util.shuffle(cards);
		} while (cards[0].id === "w4");
		return cards;
	}

	/**
	 * @param {MessageComponentInteraction} action 
	 * @param {string[]} args 
	 * @returns {void}
	 */
	handleCommand(action, args) {
		/**@type {GuildMember} */
		const member = action.member;
		const player = this.players.get(member.id);
		if (!player) return action.reply({content: "You aren't a part of this game!", ephemeral: true});
		switch(args[0].toLowerCase()) {
			case "settings":
				switch(args[1].toLowerCase()) {
					case "score": {
						if (!args[2]) return action.reply({content: this.getSetting("points") || this.meta.phase < 2 ? `The current threshold is ${this.getSetting("scoreThreshold")} points` : "Points are disabled", ephemeral: true});
						// Yes, this is allowed to change, even after the game has started (only has an effect on multi-round games)
						if (!player.isLeader) return action.reply({content: "Only the leader can change that", ephemeral: true});
						const num = Util.clamp(Util.parseInt(args[2]), 0, 5000);
						if (isNaN(num)) return action.reply({content: `Invalid number: ${args[2]}`, ephemeral: true});
						this.setSetting("scoreThreshold", num);
						if (this.meta.settingsMessage) this.meta.settingsMessage.edit(this.displaySettings());
						action.reply(`Set new score threshold to ${num}`);
						break;
					}
					case "sc":
					case "startingcards": {
						if (!args[2]) return action.reply({content: `Each player is dealt ${this.getSetting("startingCards")} cards at the start`, ephemeral: true});
						// Yes, this is allowed to change, even after tha game has started (only has an effect on multi-round games)
						if (!player.isLeader) return action.reply({content: "Only the leader can change that", ephemeral: true});
						const num = Util.clamp(Util.parseInt(args[2]), 1, 15);
						if (isNaN(num)) return action.reply({content: `Invalid number: ${args[2]}`, ephemeral: true});
						this.setSetting("startingCards", num);
						if (this.meta.settingsMessage) this.meta.settingsMessage.edit(this.displaySettings());
						action.reply(`Changed the starting number of cards to ${num}`);
						break;
					}
					default:
						action.reply({content: "Unknown setting. Did you spell it correctly?", ephemeral: true});
						break;
				}
				break;
			case "vote":
				if (!this.meta.voting && !player.isLeader) return action.reply({content: `Voting isn't enabled! Either accept your plight, or ask <@!${this.players.find(p => p.isLeader).member.id}> to enable Democracy (\`/vote Enable\`)`, ephemeral: true});
				// Silently ignore errors (can only error if malformed slash command)
				for (let i = 1; i < args.length; i += 2) {
					this.voteSetting(args[i], args[i+1], member.id);
				}
				if (this.meta.settingsMessage) this.meta.settingsMessage.edit(this.displaySettings());
				action.reply({content: "Settings updated", ephemeral: true});
				break;
			case "d":
			case "draw": {
				if (this.meta.phase < 2 || this.currentPlayer !== player || player.renegeCard) return Core.notYet(action);
				const drawPile = this.piles.get("draw");
				const topDiscard = this.piles.get("discard").cards[0];
				const drew = this.draw(drawPile.drawNum ? drawPile.drawNum : (topDiscard.owner ? 4 : (this.getSetting("contDraw") ? 0 : 1)));
				player.cards.push(...drew);
				player.saidUno = false;
				player.renegeCard = drew[drew.length-1];
				if (drawPile.drawNum) this.nextPlayer(); // Only does something if stacking was enabled
				drawPile.drawNum = 0;
				topDiscard.owner = null; // Only does something if the topDiscard was a Draw 4
				this.meta.actionHistory.push(`${member.displayName} drew ${drew.length} card${Util.plural(drew.length)}`);
				this.checkPlayersOneCardNoUno();
				this.updateUI(action);
				break;
			}
			case "n":
			case "next":
			case "endturn": {
				if (this.meta.phase < 2 || this.currentPlayer !== player || !player.renegeCard) return Core.notYet(action);
				this.nextPlayer();
				this.updateUI(action);
				break;
			}
			case "uno": {
				if (this.meta.phase < 2) return Core.notYet(action);
				if (player.cards.length === 1 && !player.saidUno) {
					player.saidUno = true;
					this.meta.actionHistory.push(`${member.displayName} said uno!`);
				} else {
					const slowpoke = this.players.find(player2 => player2.cards.length === 1 && !player2.saidUno);
					const drew = this.draw(2);
					if (slowpoke) {
						slowpoke.saidUno = true;
						slowpoke.ping = true;
						slowpoke.cards.push(...drew);
						this.meta.actionHistory.push(`${slowpoke.member.displayName} drew 2 cards from not saying Uno fast enough`);
					} else {
						player.cards.push(...drew);
						player.saidUno = false;
						this.meta.actionHistory.push(`${member.displayName} drew 2 cards from falsely calling uno`);
					}
				}
				this.updateUI(action);
				break;
			}
			case "c":
			case "challenge": {
				const discardPile = this.piles.get("discard");
				if (this.meta.phase < 2 || this.currentPlayer !== player || !discardPile.cards[0].owner) return Core.notYet(action);
				const drawPile = this.piles.get("draw");
				const owner = discardPile.cards[0].owner;
				if (owner.cards.some(card => card.id === "w4" ? false : this.match(card, discardPile.cards[1]))) {
					const drew = this.draw(this.getSetting("stacking") ? drawPile.drawNum : 4);
					owner.cards.push(...drew);
					owner.saidUno = false;
					this.meta.actionHistory.push(`${owner.member.displayName} drew ${drew.length} card${Util.plural(drew.length)} from failing to sneak a draw 4`);
				} else {
					const drew = this.draw(this.getSetting("stacking") ? drawPile.drawNum + 2 : 6);
					player.cards.push(...drew);
					player.saidUno = false;
					this.meta.actionHistory.push(`${member.displayName} drew ${drew.length} cards from unsuccessfully challenging a draw 4`);
					this.nextPlayer();
				}
				drawPile.drawNum = 0; // Only does something if stacking is enabled
				this.checkPlayersOneCardNoUno();
				discardPile.cards[0].owner = null;
				this.updateUI(action);
				break;
			}
			default: {
				if (this.meta.phase < 2) return Core.notYet(action);
				const card = player.getCards(args[0])[0];
				const discardPile = this.piles.get("discard");
				if (this.currentPlayer !== player && (!this.getSetting("jumpIn") || card?.id !== discardPile.cards[0].id)) return Core.notYet(action);
				if (!card) return action.reply({content: `Cannot find card \`${args[0]}\` in your hand`, ephemeral: true});
				if (!this.match(card, discardPile.cards[0])) return action.reply({content: "The cards don't match!", ephemeral: true});
				const drawPile = this.piles.get("draw");
				/**@type {number} */
				const stacking = this.getSetting("stacking");

				if (drawPile.drawNum && (
					(stacking === 1 && !card.id.endsWith("d") && card.id !== "w4") ||
					(stacking === 2 && card.id !== "w4" && (!card.id.endsWith("d") || discardPile.cards[0].id === "w4")) || 
					(stacking === 3 && (card.id !== "w4" || discardPile.cards[0].id.endsWith("d")) && (!card.id.endsWith("d") || discardPile.cards[0].id === "w4")))) return action.reply({content: "You have to draw cards", ephemeral: true});
				if (player.renegeCard && card !== player.renegeCard) return action.reply({content: "You need to discard the last card you drew", ephemeral: true});

				let move = ""; // The move the player made
				let discardStyle = player === this.currentPlayer ? "discarded" : "jumped in with";
				const zSCards = this.getSetting("zSCards");
				if (player.cards.length !== 1) {
					switch(card.id.substring(1)) {
						case "r":
							this.setToCurrentPlayer(player);
							this.clockwise = !this.clockwise;
							if (this.players.size === 2) {
								this.nextPlayer();
								move = ` and skipped ${this.currentPlayer.member.displayName}'s turn`;
							} else {
								move = " and reversed the play direction";
							}
							break;
						case "s":
							this.setToCurrentPlayer(player);
							this.nextPlayer();
							move += ` and skipped ${this.currentPlayer.member.displayName}'s turn`;
							break;
						case "d":
							if (player !== this.currentPlayer && this.getSetting("jumpIn") === 2) drawPile.drawNum = 0;
							this.setToCurrentPlayer(player);
							if (stacking) {
								drawPile.drawNum += 2;
							} else {
								this.nextPlayer();
								this.currentPlayer.cards.push(...this.draw(2));
								move = ` and forced ${this.currentPlayer.member.displayName} to draw 2 cards`;
							}
							break;
						case "4":
						case "w": {
							if (!card.id.startsWith("w")) {this.setToCurrentPlayer(player); break;}
							if (!args[1]) {
								const rows = [new MessageActionRow().addComponents(
									new MessageButton()
										.setCustomId(`game ${args[0]} red`)
										.setLabel("Red")
										.setStyle("DANGER"),
									new MessageButton()
										.setCustomId(`game ${args[0]} green`)
										.setLabel("Green")
										.setStyle("SUCCESS"),
									new MessageButton()
										.setCustomId(`game ${args[0]} blue`)
										.setLabel("Blue")
										.setStyle("PRIMARY"),
									new MessageButton()
										.setCustomId(`game ${args[0]} yellow`)
										.setLabel("Yellow")
										.setStyle("SECONDARY"),
									new MessageButton()
										.setCustomId("hand 0 true")
										.setLabel("Cancel")
										.setStyle("SECONDARY")
								)];
								if (action.component) rows.unshift(new MessageActionRow().addComponents(action.component));
								return Util.update(action, {content: "Specify a color!", components: rows, ephemeral: true});
							}
							this.setToCurrentPlayer(player);
							const color = args[1].substring(0,1);
							if (!["r", "g", "b", "y"].includes(color)) return action.reply({content: "Invalid color", ephemeral: true});
							card.color = color;
							if (card.id === "w4") {
								card.owner = player;
								if (this.getSetting("jumpIn") === 2) drawPile.drawNum = 0;
								if (stacking) drawPile.drawNum += 4;
							}
							break;
						}
						case "7": {
							if (zSCards !== 1 && zSCards !== 3) {this.setToCurrentPlayer(player); break;}
							if (this.players.size === 2) args[1] = `<@${this.players.find(player2 => player2 !== player).member.id}>`;
							if (!args[1]) {
								const rows = [
									new MessageActionRow().addComponents(new MessageSelectMenu()
										.setCustomId(`game ${card.id}`)
										.setPlaceholder("Choose who to swap hands with")
										.addOptions(this.players.filter(player2 => player2 !== player).map(player2 => ({label: player2.member.displayName, description: `${player2.cards.length} Card${Util.plural(player2.cards.length)}`, value: `<@${player2.member.id}>`})))),
									new MessageActionRow().addComponents(new MessageButton().setCustomId("hand 0 true").setLabel("Cancel").setStyle("SECONDARY"))
								];
								if (action.component) rows.unshift(new MessageActionRow().addComponents(action.component));
								return Util.update(action, {content: "Specify a player to swap hands with!", components: rows, ephemeral: true});
							}
							const players = this.getPlayers(args[1]);
							if (players.size > 1) return action.reply({content: `Be more specific! \`${args[1]}\` matched multiple players`, ephemeral: true});
							if (!players.size) return action.reply({content: "Could not find that player", ephemeral: true});
							this.checkPlayersOneCardNoUno();
							discardPile.cards.unshift(player.grabCard(card));
							const player2 = players.first();
							[player.cards, player2.cards] = [player2.cards, player.cards];
							player2.saidUno = player.saidUno = false;
							player2.ping = true;
							move = ` and swapped hands with ${player2.member.displayName}`;
							break;
						}
						case "0": {
							if (zSCards !== 1 && zSCards !== 2) {this.setToCurrentPlayer(player); break;}
							this.checkPlayersOneCardNoUno();
							discardPile.cards.unshift(player.grabCard(card));
							const temp = this.players.find(player => player.index === (this.clockwise ? this.players.size - 1 : 0)).cards;
							for (let i = this.clockwise ? this.players.size - 1 : 0; this.clockwise ? i > 0 : i < this.players.size - 1; i += this.clockwise ? -1 : 1) {
								const player2 = this.players.find(player3 => player3.index === i);
								player2.cards = this.players.find(player3 => player3.index === i + (this.clockwise ? -1 : 1)).cards;
								player2.saidUno = false;
							}
							this.players.find(player => player.index === (this.clockwise ? 0 : this.players.size - 1)).cards = temp;
							this.players.forEach(player2 => {
								if (player2 !== player) player2.ping = true;
							});
							move = " and rotated everyone's hands around";
							break;
						}
						default:
							this.setToCurrentPlayer(player);
							break;
					}
					if ((zSCards !== 1 || (!card.id.endsWith("0") && !card.id.endsWith("7"))) && 
						(zSCards !== 2 || !card.id.endsWith("0")) &&
						(zSCards !== 3 || !card.id.endsWith("7"))) this.checkPlayersOneCardNoUno();
					this.nextPlayer();
				} else {
					let won = true;
					const points = this.getSetting("points");
					const scoreThreshold = this.getSetting("scoreThreshold");
					if (points === 1) {
						won = false;
						player.points += this.players.reduce((acc, player2) => acc + player2.cards.reduce((total, card2) => total + Util.NaNfallback(Number(card2.id.slice(1)), card2.id.startsWith("w") ? 50 : 20), 0), 0);
						if (player.points >= scoreThreshold) won = true;
					} else if (points === 2) {
						won = false;
						let lowestScore = Infinity;
						this.players.forEach(player2 => {
							player2.points += player2.cards.reduce((total, card2) => total + Util.NaNfallback(Number(card2.id.slice(1)), card2.id.startsWith("w") ? 50 : 20), 0);
							lowestScore = Math.min(lowestScore, player2.points);
						});
						/**@type {string[]} */
						let removedPlayers = [];
						this.players.forEach(player2 => {
							if (player2.points >= scoreThreshold && player2.points !== lowestScore) {
								removedPlayers.push(player2.member.displayName);
								this.removePlayer(player2);
							}
						});
						this.currentPlayer = this.players.first();
						this.meta.thread.send(`Removed Players: ${removedPlayers.join(", ") || "None ~~yet~~"}`);
						if (this.players.size === 1) won = true;
					}
					if (won) {
						move = `, winning the game${points ? ` with ${player.points} points` : ""}!`;
						this.meta.ended = true;
						this.drawStatic();
					} else {
						move = `, winning the round with ${player.points} points!`;
						if (this.meta.ended || 
							(zSCards !== 1 || (!card.id.endsWith("0") && !card.id.endsWith("7"))) && 
							(zSCards !== 2 || !card.id.endsWith("0")) &&
							(zSCards !== 3 || !card.id.endsWith("7"))) discardPile.cards.unshift(player.grabCard(card));
						this.meta.actionHistory.push(`${member.displayName} ${discardStyle} a ${card.name}` + move);
						this.updateUI(action);
						this.render.queue(() => { // Flushed with the updateUI above
							this.meta.gameMessage = null;
							this.drawStatic();
							this.start(action);
							return Util.emptyPromise();
						});
						return;
					}
				}
				if (this.meta.ended || 
					(zSCards !== 1 || (!card.id.endsWith("0") && !card.id.endsWith("7"))) && 
					(zSCards !== 2 || !card.id.endsWith("0")) &&
					(zSCards !== 3 || !card.id.endsWith("7"))) discardPile.cards.unshift(player.grabCard(card));
				this.meta.actionHistory.push(`${member.displayName} ${discardStyle} a ${card.name}` + move);
				this.updateUI(action);
			}
		}
	}

	nextPlayer() {
		this.currentPlayer.renegeCard = null;
		this.currentPlayer = this.players.find(player => player.index === ((this.currentPlayer.index + (this.clockwise ? 1 : -1)) + this.players.size) % this.players.size);
	}

	/**
	 * @param {MessageComponentInteraction} action - The Interaction to reply to
	 */
	updateUI(action) {
		this.renderTable();

		const discardPile = this.piles.get("discard");
		const drawPile = this.piles.get("draw");
		const topDiscard = discardPile.cards[0];
		const minCards = this.players.reduce((acc, player) => Math.min(acc, player.cards.length), Infinity);

		this.meta.messages = [];
		if (topDiscard.id.startsWith("w") && discardPile.cards.length > 1) this.meta.messages.push(`Current Color: ${{r: "Red", g: "Green", b: "Blue", y: "Yellow"}[topDiscard.color]}`);
		if (topDiscard.owner) this.meta.messages.push(`Challenge ${topDiscard.owner.member.displayName} or take the extra cards${this.getSetting("stacking") ? " (or stack another draw card)" : ""}`);
		if (drawPile.drawNum) this.meta.messages.push(`${drawPile.drawNum} Cards stacked to draw`);

		const displays = [new MessageEmbed()
			.setTitle(`Current Discarded Card: ${topDiscard.name}`)
			.setDescription(this.meta.ended ? `${this.currentPlayer.member.displayName} won the game!` : `\`/help Uno\` or [Browse Commands](https://github.com/Bedrockbreaker/unobot/wiki/Uno)\nIt is currently ${this.currentPlayer.member.displayName}'s turn`)
			.addField(this.meta.ended ? `${this.currentPlayer.member.displayName} won the game!` : `${this.players.find(player => player.index === (this.currentPlayer.index - 1 + this.players.size) % this.players.size).member.displayName} ${this.clockwise ? `:arrow_right: **${this.currentPlayer.member.displayName}** :arrow_right:` : `:arrow_left: **${this.currentPlayer.member.displayName}** :arrow_left:`} ${this.players.find(player => player.index === (this.currentPlayer.index + 1) % this.players.size).member.displayName}`, this.meta.actionHistory.slice(-3).reverse().join("\n"))
			.setColor(topDiscard.id.startsWith("w") ? {r: "#D40000", g: "#2CA05A", b: "#2A7FFF", y: "#FFCC00", w: Color.Purple}[topDiscard.color] : !minCards ? Color.Purple : Color.blend(Math.min(minCards - 1, this.getSetting("startingCards") - 1)/Math.max(this.getSetting("startingCards") - 1, 1), Color.Carmine, Color.Green))
			.setImage("attachment://game.png")
			.setFooter(!this.meta.gameMessage && this.getSetting("zSCards") ? "Whenever you swap hands, click 'Show Hand' again" : Util.weighted(...this.tips))];
		if (this.meta.messages.length) {
			displays.push(new MessageEmbed()
				.setTitle("Notice")
				.setDescription(this.meta.messages.reduce((acc, msg) => `${acc}・${msg}\n`, ""))
				.setColor(topDiscard.id.startsWith("w") ? {r: "#D40000", g: "#2CA05A", b: "#2A7FFF", y: "#FFCC00", w: Color.Purple}[topDiscard.color] : (topDiscard.owner || drawPile.drawNum ? Color.Carmine : Color.randomColor())));
		}

		const row = new MessageActionRow().addComponents(new MessageButton().setCustomId("hand").setLabel(`Show Hand${this.players.some(player => player.ping) ? " (!)" : ""}`).setStyle("PRIMARY"));
		if (this.players.some(player => player.cards.length === 1 && !player.saidUno)) row.addComponents(new MessageButton().setCustomId("game uno").setLabel("Call Uno").setStyle("DANGER"));
		if (topDiscard.owner) row.addComponents(new MessageButton().setCustomId("game challenge").setLabel("Challenge").setStyle("DANGER"));

		this.render.queue(() => {
			/**@type {import("discord.js").MessageOptions} */
			const message = {embeds: displays, components: [row], files: [new MessageAttachment(this.render.canvas.toBuffer(), "game.png")]};
			if (this.meta.gameMessage) return this.meta.gameMessage.removeAttachments().then(msg => msg.edit(message));
			return this.meta.thread.send(message).then(msg => this.meta.gameMessage = msg);
		}, () => {
			const hand = this.displayHand(this.players.get(action.member.id));
			return action.customId === "start" ? action.reply(hand) : Util.update(action, hand);
		});
		this.render.flush();
	}

	renderTable() {
		super.renderTable();
		this.render.queue(
			() => this.render.drawImage(this.piles.get("discard").cards[0].image, 285, 50, 280, 400),
			() => {
				this.players.forEach(player => this.render.drawText(player.cards.length, player.x + 135, player.y + 35));
				return Util.emptyPromise();
			}
		);
	}

	drawStatic() {
		super.drawStatic();
		this.render.queue(
			() => {
				this.players.forEach(player => {
					this.render.drawImage("uno/icon.png", player.x + 90, player.y);
					if (this.getSetting("points")) this.render.drawText(`${player.points} Pts`, player.x + 90, player.y + 75, "24px Arial");
				});
				return Util.emptyPromise();
			},
			() => this.saveCanvas()
		);
	}

	/**
	 * @param {UnoPlayer} player - the player to display their cards to.
	 * @param {number} page - The page of cards to display (0-indexed)
	 */
	displayHand(player, page = 0) {
		player.ping = false;
		if (this.meta.ended) return {content: "Game Ended!", components: [], ephemeral: true};
		if (!player.cards.length) return {content: "You don't have any cards!", ephemeral: true};
		page = Util.clamp(Math.floor(page), 0, Math.ceil(player.cards.length / 25)); 
		const display = super.displayHand(player, page);

		/**@type {MessageSelectMenu} */
		const cardMenu = display.components[0].components[0];
		cardMenu.setOptions(player.cards.sort((card1, card2) => {
			if (player.renegeCard === card1 || player.renegeCard === card2) return player.renegeCard === card1 ? -1 : 1;
			if (card1.id === "w4" || card2.id === "w4") return card1.id === "w4" ? -1 : 1;
			if (card1.id === "ww" || card2.id === "ww") return card1.id === "ww" ? -1 : 1;
			return card1.id >= card2.id ? (card1.id === card2.id ? 0 : 1) : -1;
		}).slice(page * 25, page * 25 + 25).map(card => ({label: card.name, value: `${card.id}  ${this.cardCounter}`})));

		display.components.push(new MessageActionRow().addComponents(player.renegeCard ? new MessageButton().setCustomId("game endturn").setLabel(this.match(player.renegeCard, this.piles.get("discard").cards[0]) ? "Renege" : "End Turn").setStyle("SECONDARY") : new MessageButton().setCustomId("game draw").setLabel("Draw").setStyle("SECONDARY")));

		return display;
	}

	/**
	 * Tests if two cards match.
	 * @param {UnoCard} card1 - The first card, generally the one in the player's hand
	 * @param {UnoCard} card2 - The second card, generally the one on the discard pile
	 * @returns {boolean} If the cards matched
	 */
	match(card1, card2) {
		return card1.id.startsWith(card2.id.substring(0,1))
			|| card1.id.substring(1) === card2.id.substring(1)
			|| card1.id.startsWith("w")
			|| card1.id.startsWith(card2.color)
			|| card2.color === "w";
	}

	/**
	 * Checks if a player got away without saying uno.
	 */
	checkPlayersOneCardNoUno() {
		const sneaky = this.players.filter(player => player.cards.length === 1 && !player.saidUno);
		if (sneaky.size) {
			sneaky.forEach(player => player.saidUno = true);
			this.meta.actionHistory.push(`${sneaky.map(player => player.member.displayName).join(" and ")} got away without saying uno!`);
		}
	}

	/**
	 * Sets the currentPlayer to the player who is discarding (really only necessary if jumpIn is true)
	 * @param {UnoPlayer} player - The player who is discarding
	 */
	setToCurrentPlayer(player) {
		if (player === this.currentPlayer) return;
		// Only possible if jumpIn is true, and they had a matching card
		this.currentPlayer.renegeCard = null;
		this.currentPlayer = player;
	}

	/**
	 * Draws a number of cards from the draw pile.
	 * Overridden to allow for continuous draw rules, if numCards is 0
	 * @param {number} numCards - The number of cards to draw
	 */
	draw(numCards) {
		const pile = this.piles.get("draw");
		/**@type {UnoCard[]} */
		let newCards = [];
		if (numCards || !this.getSetting("contDraw")) {
			for (let i = 0; i < numCards; i++) {
				newCards.push(pile.cards.shift());
				if (!pile.cards.length) pile.cards = this.deckCreate(); // Instead of reshuffling the old pile, we create a new one to preserve card history. Doesn't break mods which rely on previously discarded cards.
			}
		} else {
			const discard = this.piles.get("discard");
			do {
				newCards.push(pile.cards.shift());
				if (!pile.cards.length) pile.cards = this.deckCreate();
			} while (!this.match(newCards[newCards.length - 1], discard.cards[0]));
		}
		return newCards;
	}

	/**
	 * @param {string} input 
	 * @returns {Collection<string, UnoPlayer>}
	 */
	 getPlayers(input) {
		return super.getPlayers(input);
	}

	/**
	 * @param {MessageEmbed} embed
	 * @param {string[]} command
	 */
	static help(embed, command) {
		embed.setTitle(`Help for \`/g ${command.join(" ")}\` in Uno`).setDescription("[Browse Commands](https://github.com/Bedrockbreaker/unobot/wiki/Uno)");
		switch(command[0]) {
			case "":
			case undefined:
				embed.setTitle("Help for Uno").addField("/help uno <command>", "General help command for Uno. Use this to receive information on using other commands.\nEx: \`/help uno settings\`")
					.addFields(
						{name: "Available Commands", value: "(To discard, use `/g <cardId>`)"},
						{name: "settings", value: "/help uno settings", inline: true},
						{name: "draw", value: "/help uno draw", inline: true},
						{name: "endTurn", value: "/help uno endTurn", inline: true},
						{name: "uno", value: "/help uno uno", inline: true},
						{name: "challenge", value: "/help uno challenge", inline: true})
					.setColor(Color.White);
				break;
			case "settings":
				switch (command[1]) {
					case "":
					case undefined:
						embed.addFields(
							{name: "/g settings", value: "Changes various settings related to the game.\nEx: `/g settings StartingCards 5`"},
							{name: "Available Settings", value: "\u200b"},
							{name: "/g settings StartingCards", value: "/help uno settings StartingCards", inline: true},
							{name: "/g settings score", value: "/help uno settings score", inline: true})
							.setColor(Color.White);
						break;
					case "sc":
					case "startingcards":
						embed.addField("/g settings StartingCards <num>", "Changes the number of cards dealt to each player at the start of a round.\nAliases: `/g settings sc`\nEx: `/g settings StartingCards 5`").setColor(Color.randomColor());
						break;
					case "score":
						embed.addField("/g settings score <num>", "Changes the number of points required to win or lose.\nEx: `/g settings score 250`").setColor(Color.randomColor());
						break;
					default:
						embed.addField("Unknown setting.", "Did you spell it correctly?").setColor(Color.Carmine);
						break;
				}
				break;
			case "d":
			case "draw":
				embed.addField("/g draw", "Draws a card\nAliases: `/g d`\nEx:`/g draw`").setColor(Color.Forest);
				break;
			case "n":
			case "next":
			case "endturn":
				embed.addField("/g endTurn", "Reneges on your turn, if applicable.\nAliases: `/g n`, `/g next`\nEx: `/g endTurn`").setColor(Color.randomColor());
				break;
			case "uno":
				embed.addField("/g uno", "Calls uno. Will attempt to make you safe first, if applicable. If not, calls uno on anyone who isn't safe.\nEx: `/g uno`").setColor(Color.Forest);
				break;
			case "c":
			case "challenge":
				embed.addField("/g challenge", "Challenges a Draw 4.\nAliases: `/g c`\nEx: `/g challenge`").setColor(Color.randomColor());
				break;
			default:
				embed.addField("Unknown command", "Did you spell it correctly?").setColor(Color.Carmine);
				break;
		}
	}
}

class UnoPlayer extends Player {
	/**
	 * @param {GuildMember} member - The member associated with the player
	 * @param {UnoCard[]} [cards] - The list of cards in the player's posession
	 * @param {boolean} [isLeader] - If the player is a leader/host over a game
	 * @param {number} [index] - The index of the player in turn-order. 0 is first player
	 */
	constructor(member, cards = [], isLeader = false, index = 0) {
		super(member, cards, isLeader, index);

		/**@type {UnoCard[]} */
		this.cards;

		/**
		 * The number of points this player has, if that setting is enabled
		 * @type {number}
		 */
		this.points = 0;

		/**
		 * Keeps track of which card they're allowed to draw and discard on the same turn.
		 * @type {UnoCard}
		 */
		this.renegeCard;

		/**
		 * If the player has one card and has said uno
		 * @type {boolean}
		 */
		this.saidUno = false;
	}

	/**
	 * @param {string} [argument] - The string formatted in "card selection syntax"
	 * @returns {UnoCard[]} The cards which match the specified argument
	 */
	 getCards(argument) {
		return super.getCards(argument);
	}
}

class UnoPile extends Pile {
	/**
	 * @param {Card[]} [cards] - The cards in the pile
	 */
	 constructor(cards = []) {
		super(cards, {});
		/**
		 * The total number of cards to be drawn, if stacking is enabled
		 * @type {number}
		 */
		this.drawNum = 0;

		/**@type {UnoCard[]} */
		this.cards;
	}
}

class UnoCard extends Card {
	/**
	 * @param {string} id - The id of the card
	 * @param {string} [name] - The Human-Readable name of the card, defaults to the id
	 * @param {string} [image] - The URL to the image of the card
	 */
	constructor(id, name, image = "") {
		super(id, name, image);

		/**
		 * The color of this card, if it's a wild
		 * @type {string}
		 */
		this.color;
		/**
		 * The "owner" of this (discarded) card, if it's a Draw 4
		 * @type {UnoPlayer}
		 */
		this.owner;
	}
}