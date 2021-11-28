import {Collection, GuildMember, MessageActionRow, MessageAttachment, MessageButton, MessageComponentInteraction, MessageEmbed, MessageSelectMenu, ThreadChannel} from "discord.js";
import Canvas from "canvas";
import {Core, Util, Render, Color, Player, Pile, Card, Setting} from "./core.js";

/**
 * Mille Bornes
 */
export default class baseMille extends Core {
	/**
	 * @param {ThreadChannel} thread - The thread the game is in
	 */
	constructor(thread) {
		const settings = new Collection([
			["scoreThreshold", new Setting(5000,
				"Score Threshold: $0",
				"- The winning score for entire game, over multiple rounds. Use `/g score <num>` to change",
				undefined,
				() => [this.getSetting("scoreThreshold")])],
			["cutthroat", new Setting(0,
				"Cutthroat mode :dagger: ・ $0",
				"- Changes a number of game mechanics to make the game as miserable as possible.\n- See `/help mille cutthroat` for details",
				Util.Selection("cutthroat", [["Cutthroat Mode - Disabled", "Normal gameplay"], ["Cutthroat Mode - Enabled", "A terrible gamemode my friends played for years"]]),
				() => [this.displayVote("cutthroat", ["Disabled", "Enabled"])])]
		]);

		super("Mille Bornes", thread, settings);

		/**@type {Collection<string, MillePile>} */
		this.piles;
		/**@type {MillePlayer} */
		this.currentPlayer;
		/**@type {Collection<string, MillePlayer>} */
		this.players;

		/** List of colors for player/team rendered border */
		this.colors = [Color.randomColor(), Color.randomColor(), Color.randomColor()];
		while (Color.distance(this.colors[0], this.colors[1]) < 380) {
			this.colors[1] = Color.randomColor();
		}
		while (Color.distance(this.colors[0], this.colors[2]) < 380 || Color.distance(this.colors[1], this.colors[2]) < 380) {
			this.colors[2] = Color.randomColor();
		}

		/** The total distance required to win a round */
		this.totalDistance = 1000;

		/**
		 * The last hazard card played, which can be coup fourre'd
		 * @type {MilleCard}
		 */
		this.lastHazard = null;

		/**
		 * List of players who wish to end the round early
		 * @type {Collection<string, MillePlayer>}
		 */
		this.quitters = new Collection();

		/**
		 * The player who called an extension, if applicable
		 * @type {MillePlayer}
		 */
		this.extender = null;

		/** List of tips displayed in the footer */
		this.tips = ["Tip #1: In the beginning, it's usually better to play a Roll than to attack", "Tip #2: Keep safety cards for Coup Fourres", "Tip #3: Don't hold on to safety cards for too long",
			"Tip #4: Discard cards of no value to you", "Tip #5: Only two 200 mile cards can be played on your pile", "Tip #6: Count cards", "Tip #7: Each Coup Fourre gives an additional 300 points",
			"Tip #8: You can play speed limits even if your opponent has a hazard card showing", "Tip #9: Winning a round is less important than winning the game", "Tip #10: Don't lose"];
	}

	/**
	 * @param {GuildMember} member 
	 * @param {boolean} isLeader 
	 */
	genDefaultPlayer(member, isLeader = false) {
		return new MillePlayer(member, [], isLeader);
	}

	/**
	 * @returns {import("discord.js").MessageOptions?}
	 */
	displaySettings() {
		const display = super.displaySettings();
		/**@type {MessageEmbed} */
		const embed = display.embeds[0];
		embed.setDescription("\`/help mille\` or [Browse Commands](https://github.com/Bedrockbreaker/unobot/wiki/Mille-Bornes)");

		if (this.players.size > 3) {
			/**@type {Collection<string, MillePlayer>} */
			const teams = new Collection();
			for (const [id, player] of this.players) {
				if (teams.has(player.partner?.member.id)) continue;
				teams.set(id, player);
			}

			embed.spliceFields(0, 0, {name: "Teams", value: teams.reduce((acc, player) => `${acc}・${player.member.displayName} :handshake: ${player.partner ? player.partner.member.displayName : Util.weighted(["Random", 9], "¯\\\\_(ツ)_/¯")}\n`, "")});
			display.components.splice(1, 0, new MessageActionRow().addComponents(new MessageSelectMenu().setCustomId("game team").setPlaceholder("(Optional) Choose a partner").addOptions({label: "Random", description: "Default", value: "random"}).addOptions(this.players.filter(player => !player.partner).map(player => ({label: player.member.displayName, value: `<@${player.member.id}>`})))));
		}
		
		return display;
	}

	/**
	 * @param {MessageComponentInteraction} action - The Interaction to reply to
	 * @returns {void}
	 */
	start(action) {
		if (this.players.size < 2) return action.reply({content: "There aren't enough players!", ephemeral: true});
		if (this.players.size === 5) return action.reply({content: "Sorry, but this game can't support exactly 5 players. You gotta lose one or grab another, (but it's not like you've got more friends)", ephemeral: true});
		if (this.players.size > 6) return action.reply({content: "Too many friends! (((( ;°Д°))))"});

		this.totalDistance = !this.getSetting("cutthroat") && this.players.size !== 4 ? 700 : 1000;
		this.quitters.clear();
		this.extender = null;
		this.lastHazard = null;
		this.randomizePlayerOrder();
		this.currentPlayer = this.players.find(player => !player.index);
		
		const drawPile = new MillePile(this.deckCreate());
		this.piles.set("draw", drawPile);
		this.piles.set("discard", new MillePile());
		
		this.players.forEach(player => {
			player.cards = drawPile.cards.splice(0, 6);
			player.ping = this.meta.phase >= 2 || player !== this.players.get(action.member.id);
			player.drew = null;

			player.battlePile = new MillePile();
			player.speedPile = new MillePile();
			player.safetyPile = new MillePile();
			player.distancePile = new MillePile();
			player.gasPile = new MillePile();
			player.accidentPile = new MillePile();
			player.tirePile = new MillePile();
			if (this.players.size > 3) {
				player.partner.battlePile = player.battlePile;
				player.partner.speedPile = player.speedPile;
				player.partner.safetyPile = player.safetyPile;
				player.partner.distancePile = player.distancePile;
				player.partner.gasPile = player.gasPile;
				player.partner.accidentPile = player.accidentPile;
				player.partner.tirePile = player.tirePile;
			}
		});

		this.meta.actionHistory.push("The game has just started!");

		if (this.meta.phase < 2) { // In case multiple calls to `start()`
			if (this.players.size > 3) this.tips.push("Tip #11: Communicate with your partner");
			super.start(action);
		}
		this.updateUI(action);

		this.meta.phase = 2;
	}

	deckCreate() {
		/** @type {MilleCard[]} */
		const cards = [
			new MilleCard("hg", "Out of Gas", `mille/hg.png`), new MilleCard("hg", "Out of Gas", `mille/hg.png`),
			new MilleCard("ht", "Flat Tire", `mille/ht.png`), new MilleCard("ht", "Flat Tire", `mille/ht.png`),
			new MilleCard("ha", "Accident", `mille/ha.png`), new MilleCard("ha", "Accident", `mille/ha.png`),
			new MilleCard("hl", "Speed Limit", `mille/hl.png`), new MilleCard("hl", "Speed Limit", `mille/hl.png`), new MilleCard("hl", "Speed Limit", `mille/hl.png`),
			new MilleCard("hs", "Stop", `mille/hs.png`), new MilleCard("hs", "Stop", `mille/hs.png`), new MilleCard("hs", "Stop", `mille/hs.png`), new MilleCard("hs", "Stop", `mille/hs.png`),
			
			new MilleCard("rg", "Gasoline", `mille/rg.png`), new MilleCard("rg", "Gasoline", `mille/rg.png`), new MilleCard("rg", "Gasoline", `mille/rg.png`), new MilleCard("rg", "Gasoline", `mille/rg.png`), new MilleCard("rg", "Gasoline", `mille/rg.png`), new MilleCard("rg", "Gasoline", `mille/rg.png`),
			new MilleCard("rt", "Spare Tire", `mille/rt.png`), new MilleCard("rt", "Spare Tire", `mille/rt.png`), new MilleCard("rt", "Spare Tire", `mille/rt.png`), new MilleCard("rt", "Spare Tire", `mille/rt.png`), new MilleCard("rt", "Spare Tire", `mille/rt.png`), new MilleCard("rt", "Spare Tire", `mille/rt.png`),
			new MilleCard("ra", "Repairs", `mille/ra.png`), new MilleCard("ra", "Repairs", `mille/ra.png`), new MilleCard("ra", "Repairs", `mille/ra.png`), new MilleCard("ra", "Repairs", `mille/ra.png`), new MilleCard("ra", "Repairs", `mille/ra.png`), new MilleCard("ra", "Repairs", `mille/ra.png`),
			new MilleCard("rl", "End of Limit", `mille/rl.png`), new MilleCard("rl", "End of Limit", `mille/rl.png`), new MilleCard("rl", "End of Limit", `mille/rl.png`), new MilleCard("rl", "End of Limit", `mille/rl.png`), new MilleCard("rl", "End of Limit", `mille/rl.png`), new MilleCard("rl", "End of Limit", `mille/rl.png`),
			new MilleCard("ro", "Roll", `mille/ro.png`), new MilleCard("ro", "Roll", `mille/ro.png`), new MilleCard("ro", "Roll", `mille/ro.png`), new MilleCard("ro", "Roll", `mille/ro.png`), new MilleCard("ro", "Roll", `mille/ro.png`), new MilleCard("ro", "Roll", `mille/ro.png`), new MilleCard("ro", "Roll", `mille/ro.png`),
			new MilleCard("ro", "Roll", `mille/ro.png`), new MilleCard("ro", "Roll", `mille/ro.png`), new MilleCard("ro", "Roll", `mille/ro.png`), new MilleCard("ro", "Roll", `mille/ro.png`), new MilleCard("ro", "Roll", `mille/ro.png`), new MilleCard("ro", "Roll", `mille/ro.png`), new MilleCard("ro", "Roll", `mille/ro.png`),

			new MilleCard("sg", "Extra Tank", `mille/sg.png`), new MilleCard("st", "Puncture-Proof Tires", `mille/st.png`), new MilleCard("sa", "Ace Driver", `mille/sa.png`), new MilleCard("sr", "Right of Way", `mille/sr.png`),

			new MilleCard("200", "200", `mille/200.png`), new MilleCard("200", "200", `mille/200.png`), new MilleCard("200", "200", `mille/200.png`), new MilleCard("200", "200", `mille/200.png`),
			new MilleCard("100", "100", `mille/100.png`), new MilleCard("100", "100", `mille/100.png`), new MilleCard("100", "100", `mille/100.png`), new MilleCard("100", "100", `mille/100.png`), new MilleCard("100", "100", `mille/100.png`), new MilleCard("100", "100", `mille/100.png`),
			new MilleCard("100", "100", `mille/100.png`), new MilleCard("100", "100", `mille/100.png`), new MilleCard("100", "100", `mille/100.png`), new MilleCard("100", "100", `mille/100.png`), new MilleCard("100", "100", `mille/100.png`), new MilleCard("100", "100", `mille/100.png`),
			new MilleCard("75", "75", `mille/75.png`), new MilleCard("75", "75", `mille/75.png`), new MilleCard("75", "75", `mille/75.png`), new MilleCard("75", "75", `mille/75.png`), new MilleCard("75", "75", `mille/75.png`),
			new MilleCard("75", "75", `mille/75.png`), new MilleCard("75", "75", `mille/75.png`), new MilleCard("75", "75", `mille/75.png`), new MilleCard("75", "75", `mille/75.png`), new MilleCard("75", "75", `mille/75.png`),
			new MilleCard("50", "50", `mille/50.png`), new MilleCard("50", "50", `mille/50.png`), new MilleCard("50", "50", `mille/50.png`), new MilleCard("50", "50", `mille/50.png`), new MilleCard("50", "50", `mille/50.png`),
			new MilleCard("50", "50", `mille/50.png`), new MilleCard("50", "50", `mille/50.png`), new MilleCard("50", "50", `mille/50.png`), new MilleCard("50", "50", `mille/50.png`), new MilleCard("50", "50", `mille/50.png`),
			new MilleCard("25", "25", `mille/25.png`), new MilleCard("25", "25", `mille/25.png`), new MilleCard("25", "25", `mille/25.png`), new MilleCard("25", "25", `mille/25.png`), new MilleCard("25", "25", `mille/25.png`),
			new MilleCard("25", "25", `mille/25.png`), new MilleCard("25", "25", `mille/25.png`), new MilleCard("25", "25", `mille/25.png`), new MilleCard("25", "25", `mille/25.png`), new MilleCard("25", "25", `mille/25.png`)
		];

		if (this.players.size > 3) cards.push(new MilleCard("hg", "Out of Gas", `mille/hg.png`), new MilleCard("ht", "Flat Tire", `mille/ht.png`), new MilleCard("ha", "Accident", `mille/ha.png`), new MilleCard("hl", "Speed Limit", `mille/hl.png`), new MilleCard("hs", "Stop", `mille/hs.png`));
		Util.shuffle(cards);
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
			case "vote":
				if (!this.meta.voting && !player.isLeader) return action.reply({content: `Voting isn't enabled! Either accept your plight, or ask <@!${this.players.find(p => p.isLeader).member.id}> to enable Democracy (\`/vote Enable\`)`, ephemeral: true});
				// Silently ignore errors (can only error if malformed slash command)
				for (let i = 1; i < args.length; i += 2) {
					this.voteSetting(args[i], args[i+1], member.id);
				}
				if (this.meta.settingsMessage) this.meta.settingsMessage.edit(this.displaySettings());
				action.reply({content: "Settings updated", ephemeral: true});
				break;
			case "score": {
				if (!player.isLeader) return action.reply({content: "Only the leader can change that!", ephemeral: true});
				const num = Util.clamp(Util.parseInt(args[1]), 0, 50000);
				if (isNaN(num)) return action.reply({content: `\`${args[1]}\` is not a valid number`});
				this.setSetting("scoreThreshold", num);
				if (this.meta.settingsMessage) this.meta.settingsMessage.edit(this.displaySettings());
				action.reply({content: `Set the new score threshold to ${num} point${Util.plural(num)}`});
				break;
			}
			case "team": {
				if (this.players.size < 4) return action.reply({content: "Not enough players in the game to form a team", ephemeral: true});
				if (this.meta.phase >= 2) return action.reply({content: Util.weighted(["Can't change your team once the game has started", 9], "What, hate your partner already?"), ephemeral: true});
				if (!args[1]) return action.reply({content: "Specify a player to team up with (or use `/g team random`)", ephemeral: true});

				if (args[1] === "random") {
					action.reply({content: player.partner ? Util.weighted(["No longer partners!", 9], "Yeah, you were too good for them anyway") : "Y-you didn't need to do that.. you know?", ephemeral: true});
					if (player.partner) player.partner.partner = null;
					player.partner = null;
					if (this.meta.settingsMessage) this.meta.settingsMessage.edit(this.displaySettings());
					return;
				}

				const players = this.getPlayers(args[1]);
				if (players.size > 1) return action.reply({content: `Be more specific! \`${args[1]}\` matched multiple players`, ephemeral: true});
				const player2 = players.first();
				if (!player2) return action.reply({content: "Could not find that player", ephemeral: true});
				if (player2 === player) return action.reply({content: "You can't team up with yourself, you sad, lonely being.", ephemeral: true});
				if (player2.partner) return action.reply({content: "They already have a partner!", ephemeral: true});

				if (player.partner) player.partner.partner = null;
				player.partner = player2;
				player2.partner = player;
				if (this.meta.settingsMessage) this.meta.settingsMessage.edit(this.displaySettings());
				action.reply({content: `Partnered with ${player.member.displayName}`, ephemeral: true});
				break;
			}
			case "end": {
				if (this.meta.phase < 2) return action.reply({content: Util.weighted("You could just `/quit` you know?", "What, want to quit already?"), ephemeral: true});
				if (this.quitters.delete(member.id)) {
					action.reply({content: Util.weighted(["Retracted vote to end the game early", 49], "yesss... prolong the game and make everyone hate you."), ephemeral: true});
					this.updateUI(action);
					return;
				}
				this.quitters.set(member.id, player);
				if (this.quitters.size === this.players.size) return this.win(action);
				this.meta.messages = ["Votes to End the Round Early", this.quitters.reduce((acc, player) => `${acc}・${player.member.displayName}\n`, "")];
				action.reply({content: Util.weighted(["Voted to end the round early", 9], "smh, you're no fun"), ephemeral: true});
				this.updateUI(action);
				break;
			}
			case "extend": {
				if (this.meta.phase < 2) return action.reply({content: "Extend what? Your braincells?", ephemeral: true});
				if (this.totalDistance === 1000) return action.reply({content: "No, you cannot extend the game to the size of your mom", ephemeral: true});
				if (player.distancePile.distance !== 700) return action.reply({content: "Begone! Ye are not the chosen one!", ephemeral: true});
				if (args[1]) {
					this.totalDistance = 1000;
					this.extender = this.players.find(player2 => player2 === player || player2 === player.partner); // In case their partner decided to interact
					this.meta.actionHistory.push(`${player.member.displayName} has extended the game! Scramble to reach 1000 miles for extra bonus points now!`);
					this.nextPlayer();
					this.updateUI(action);
					return;
				}
				this.win(action);
				break;
			}
			case "draw": {
				if (this.meta.phase < 2 || player !== this.currentPlayer) return Core.notYet(action);
				if (player.drew) return action.reply({content: "You've already drawn", ephemeral: true});

				this.lastHazard = null;
				const drawPile = this.piles.get("draw");
				player.cards.push(drawPile.cards.pop());
				if (this.getSetting("cutthroat") && !drawPile.cards.length) {
					const discardPile = this.piles.get("discard");
					drawPile.cards = Util.shuffle(discardPile.cards);
					discardPile.cards = [];
				}
				player.drew = player.cards[player.cards.length-1];
				this.meta.actionHistory.push(`${member.displayName} drew a card`);
				if (!drawPile.cards.length) this.meta.actionHistory.push("The draw pile has been exhausted! Delayed action is now possible");
				this.updateUI(action);
				break;
			}
			default: {
				if (this.meta.phase < 2) return Core.notYet(action);
				const card = player.getCards(args[0])[0];
				if (!card) return action.reply({content: "Can't find the specified card in your hand", ephemeral: true});
				if (player !== this.currentPlayer && (!card.id.startsWith("s") || this.lastHazard === null)) return Core.notYet(action);
				if (!player.drew && !card.id.startsWith("s")) return action.reply({content: "Draw a card first!", ephemeral: true});

				const discardPile = this.piles.get("discard");
				if (args[1] === "discard") {
					player.drew = null;
					discardPile.cards.unshift(player.grabCard(card));
					this.meta.actionHistory.push(`${member.displayName} discarded a ${card.name}`);
					this.nextPlayer();
					if (!this.players.reduce((acc, player) => acc + player.cards.length, 0)) return this.win(action);
					else return this.updateUI(action);
				}

				const discardbtn = new MessageActionRow().addComponents(new MessageButton().setCustomId(`game ${args[0]} discard`).setLabel("Discard Instead").setStyle("SECONDARY"));
				const cutthroat = this.getSetting("cutthroat");
				const drawPile = this.piles.get("draw");
				switch(card.id) {
					case "200":
					case "100":
					case "75":
					case "50":
					case "25": {
						if (player.battlePile.cards[0]?.id !== "ro"
							// Not main statement -- currently within predicate
							&& (!player.safetyPile.cards.some(card2 => card2.id === "sr")
								|| player.battlePile.cards[0]?.id.startsWith("h"))
								|| player.gasPile.cards[0]?.id.startsWith("h")
								|| player.accidentPile.cards[0]?.id.startsWith("h")
								|| player.tirePile.cards[0]?.id.startsWith("h")
							) return action.reply({content: "You can't drive right now!", components: [discardbtn], ephemeral: true});
						if (Number(card.id) > 50 && player.speedPile.cards[0]?.id === "hl") return action.reply({content: "Can't play a card above 50 miles (Speed limit)", components: [discardbtn], ephemeral: true});
						if (player.distancePile.distance + Number(card.id) > this.totalDistance) return action.reply({content: `You can't drive past the finish line! (${this.totalDistance} miles)`, components: [discardbtn], ephemeral: true});
						if (card.id === "200" && player.distancePile.cards.reduce((acc, card2) => acc + (card2.id === "200" ? 1 : 0), 0) === 2) return action.reply({content: "Can't play more than two 200 cards in a round", components: [discardbtn], ephemeral: true});
						player.distancePile.cards.push(card);
						player.distancePile.distance += Number(card.id);
						if (player.distancePile.distance === 1000 || cutthroat) this.win(action);
						this.meta.actionHistory.push(`${member.displayName}${player.partner ? `and ${player.partner.member.displayName}` : ""} drove ${card.name} miles! (${player.distancePile.distance} total)`);
						break;
					}
					case "hs": // stop
					case "hl": // speed limit
					case "hg": // out of gas
					case "ha": // accident
					case "ht": { // flat tire
						/**@type {MillePlayer} */
						let player2;
						const attackable = this.players.filter(player2 => {
							if (player2 === player) return false;
							if (this.players.size === 4 ? player2.index > 1 : player2.index > 2) return false; // Only grab 1 player from each team
							const canGo = player2.battlePile.cards[0]?.id === "ro" || (player2.safetyPile.cards.some(card2 => card2.id === "sr") && !player2.battlePile.cards[0]?.id.startsWith("h"));
							switch(card.id) {
								case "hs":
									return (cutthroat || canGo) && !player2.safetyPile.cards.some(card2 => card2.id === "sr");
								case "hl":
									return (cutthroat || player2.speedPile.cards[0]?.id !== "hl") && !player2.safetyPile.cards.some(card2 => card2.id === "sr");
								case "hg":
									return (cutthroat || canGo) && !player2.safetyPile.cards.some(card2 => card2.id === "sg");
								case "ha":
									return (cutthroat || canGo) && !player2.safetyPile.cards.some(card2 => card2.id === "sa");
								case "ht":
									return (cutthroat || canGo) && !player2.safetyPile.cards.some(card2 => card2.id === "st");
							}
						});
						if (!attackable.size) return action.reply({content: "You can't attack anyone with that card", components: [discardbtn], ephemeral: true});
						else if (attackable.size === 1) args[1] = `<@${attackable.first().member.id}>`;
						if (!args[1]) {
							const rows = [
								new MessageActionRow().addComponents(new MessageSelectMenu()
									.setCustomId(`game ${args[0]}`)
									.setPlaceholder("Choose someone to attack")
									.addOptions(attackable.map(player3 => ({label: `${player3.member.displayName}${player3.partner ? `・${player3.partner.member.displayName}` : ""}`, description: `${player3.distancePile.distance} points・${player3.score} total`, value: `<@${player3.member.id}>`})))),
								new MessageActionRow().addComponents(new MessageButton().setCustomId("hand 0 true").setLabel("Cancel").setStyle("SECONDARY"))
							];
							if (action.component) rows.unshift(new MessageActionRow().addComponents(action.component));
							return Util.update(action, {content: "Specify a player to attack", components: rows, ephemeral: true});
						}
						const players = this.getPlayers(args[1]);
						if (players.size > 1) return action.reply({content: `Be more specific! \`${args[1]}\` matched multiple players`, ephemeral: true});
						player2 = players.first();
						if (!player2 || player2 === player) return action.reply({content: "Could not find that player", ephemeral: true});
						if (!attackable.has(player2.member.id)) return action.reply({content: "You can't kick people while they're down", ephemeral: true});

						if (card.id === "hl") player2.speedPile.cards.unshift(card);
						else if (cutthroat && card.id !== "hs") {
							switch(card.id) {
								case "hg":
									player2.gasPile.cards.unshift(card);
									break;
								case "ha":
									player2.accidentPile.cards.unshift(card);
									break;
								case "ht":
									player2.tirePile.cards.unshift(card);
									break;
							}
						} else player2.battlePile.cards.unshift(card);
						this.lastHazard = card;
						this.meta.actionHistory.push(`${member.displayName} played a ${card.name} on ${player2.member.displayName}${player2.partner ? `and ${player2.partner.member.displayName}` : ""}'s pile`);
						break;
					}
					case "ro": // go
						if (player.battlePile.cards[0]?.id === "ro") return action.reply({content: "Your light is already green", components: [discardbtn], ephemeral: true});
						if (player.battlePile.cards[0]?.id.startsWith("h") && player.battlePile.cards[0]?.id !== "hs") return action.reply({content: `You need to fix your car first (${player.battlePile.cards[0].name})`, components: [discardbtn], ephemeral: true});
						if (cutthroat && player.battlePile.cards[0]?.id === "hs") {
							discardPile.cards.push(player.battlePile.cards.shift());
							// If there were multiple stops stacked, discard the go card
							if (player.battlePile.cards[0]?.id === "hs") {
								discardPile.cards.push(card);
								this.meta.actionHistory.push(Util.parseString(Util.weighted(["$0's light only flickered green", 9], "$0 rewired the stop light, but it self-corrected"), member.displayName));
								break;
							}
						}
						player.battlePile.cards.unshift(card);
						this.meta.actionHistory.push(Util.parseString(Util.weighted(["$0's light turned green", 9], "$0 rewired the stop light to green"), member.displayName));
						break;
					case "rl": // end of limit
						if (player.speedPile.cards[0]?.id !== "hl") return action.reply({content: "You can't end a speed limit which doesn't exist", components: [discardbtn], ephemeral: true});
						if (cutthroat) {
							discardPile.cards.push(player.speedPile.cards.shift());
							// If there were multiple speed limits stacked, discard the end limit card
							if (player.speedPile.cards[0]?.id === "hl") {
								discardPile.cards.push(card);
								this.meta.actionHistory.push(Util.parseString(Util.weighted(["$0 exited the speed limited region, only to enter another one", 9], "$0 removed one of the speed limit signs taped to their car"), member.displayName));
								break;
							}
						}
						player.speedPile.cards.unshift(card);
						this.meta.actionHistory.push(Util.parseString(Util.weighted(["$0 exited the speed limited region", 9], "$0 removed the speed limit sign taped to their car"), member.displayName));
						break;
					case "rg": // gas
						if (cutthroat ? player.gasPile.cards[0]?.id !== "hg" : player.battlePile.cards[0]?.id !== "hg") return action.reply({content: "Your gas tank is full", components: [discardbtn], ephemeral: true});
						if (cutthroat) {
							discardPile.cards.push(player.gasPile.cards.shift());
							if (player.gasPile.cards[0]?.id === "hg") {
								discardPile.cards.push(card);
								this.meta.actionHistory.push(Util.parseString(Util.weighted(["$0 refilled their gas tank, but found out it has a hole", 9], "$0 tried to steal gas from someone else's already empty car"), member.displayName));
								break;
							}
							player.gasPile.cards.unshift(card);
						} else player.battlePile.cards.unshift(card);
						this.meta.actionHistory.push(Util.parseString(Util.weighted(["$0 refilled their gas tank", 9], "$0 stole gas from someone else's car"), member.displayName));
						break;
					case "ra": // repairs
						if (cutthroat ? player.accidentPile.cards[0]?.id !== "ha" : player.battlePile.cards[0]?.id !== "ha") return action.reply({content: "Your car is already in good condition", components: [discardbtn], ephemeral: true});
						if (cutthroat) {
							discardPile.cards.push(player.accidentPile.cards.shift());
							if (player.accidentPile.cards[0]?.id === "ha") {
								discardPile.cards.push(card);
								this.meta.actionHistory.push(Util.parseString(Util.weighted(["$0 repaired their car, only to get into another accident", 9], "$0 commit grand theft auto, only to crash again"), member.displayName));
								break;
							}
							player.accidentPile.cards.unshift(card);
						} else player.battlePile.cards.unshift(card);
						this.meta.actionHistory.push(Util.parseString(Util.weighted(["$0 repaired their car", 9], "$0 don't have insurance and decide to drive illegally"), member.displayName));
						break;
					case "rt": // spare tire
						if (cutthroat ? player.tirePile.cards[0]?.id !== "ht" : player.battlePile.cards[0]?.id !== "ht") return action.reply({content: "Your tires are already in perfect condition", components: [discardbtn], ephemeral: true});
						if (cutthroat) {
							discardPile.cards.push(player.tirePile.cards.shift());
							if (player.tirePile.cards[0]?.id === "ht") {
								discardPile.cards.push(card);
								this.meta.actionHistory.push(Util.parseString(Util.weighted(["$0 replaced their tires, only to pop them again", 9], "$0 stole somebody's flat tires"), member.displayName));
								break;
							}
							player.tirePile.cards.unshift(card);
						} else player.battlePile.cards.unshift(card);
						this.meta.actionHistory.push(Util.parseString(Util.weighted(["$0 replaced their tires", 9], "$0 stole someone else's tires"), member.displayName));
						break;
					case "sg": // extra tank
					case "st": // puncture-proof tires
					case "sa": // ace driver
					case "sr": { // right of way
						if (this.lastHazard) {
							switch(card.id) {
								case "sr":
									if (player.battlePile.cards[0] !== this.lastHazard && player.speedPile.cards[0] !== this.lastHazard && this.lastHazard.id !== "hs" && this.lastHazard.id !== "hl") return action.reply({content: "Can't coup fourre that card!", ephemeral: true});
									discardPile.cards.unshift(player.battlePile.grabCard(this.lastHazard) || player.speedPile.grabCard(this.lastHazard));
									this.meta.actionHistory.push(Util.parseString(Util.weighted(["$0 was an undercover cop!", 9], "$0 just ignores red lights and speed limits"), member.displayName));
									break;
								case "sg":
									if (player.battlePile.cards[0] !== this.lastHazard && player.gasPile.cards[0] !== this.lastHazard && this.lastHazard.id !== "hg") return action.reply({content: "Can't coup fourre that card!", ephemeral: true});
									discardPile.cards.unshift(player.battlePile.grabCard(this.lastHazard) || player.gasPile.grabCard(this.lastHazard));
									this.meta.actionHistory.push(Util.parseString(Util.weighted(["$0 whipped out their secret massive gas-hauling semi-truck", 9], "$0 has infinite gas, nerds"), member.displayName));
									break;
								case "sa":
									if (player.battlePile.cards[0] !== this.lastHazard && player.accidentPile.cards[0] !== this.lastHazard && this.lastHazard.id !== "ha") return action.reply({content: "Can't coup fourre that card!", ephemeral: true});
									discardPile.cards.unshift(player.battlePile.grabCard(this.lastHazard) || player.accidentPile.grabCard(this.lastHazard));
									this.meta.actionHistory.push(Util.parseString(Util.weighted(["$0 has a self-driving car and is immune to car accidents", 9], "$0 is tokyo drifting!"), member.displayName));
									break;
								case "st":
									if (player.battlePile.cards[0] !== this.lastHazard && player.tirePile.cards[0] !== this.lastHazard && this.lastHazard.id !== "ht") return action.reply({content: "Can't coup fourre that card!", ephemeral: true});
									discardPile.cards.unshift(player.battlePile.grabCard(this.lastHazard) || player.tirePile.grabCard(this.lastHazard));
									this.meta.actionHistory.push(Util.parseString(Util.weighted(["$0's car doesn't have tires -- it floats", 9], "$0 actually has *tyres*, not \"tires,\" which don't follow the normal laws of physics"), member.displayName));
									break;
							}
							card.coup = true;
							this.lastHazard = null;
							this.currentPlayer = player;
						} else this.meta.actionHistory.push(Util.parseString(Util.weighted(["$0 used their $1!", 9], "$0 used their $1. Seems OP -- please nerf."), member.displayName, card.name));
						
						this.lastHazard = null;
						player.cards.push(...drawPile.cards.splice(0, 8 - player.cards.length)); // (8 - player.cards.length) because the safety hasn't been removed from their hand yet
						if (this.getSetting("cutthroat") && !drawPile.cards.length) {
							const discardPile = this.piles.get("discard");
							drawPile.cards = Util.shuffle(discardPile.cards);
							discardPile.cards = [];
							player.cards.push(...drawPile.cards.splice(0, 8 - player.cards.length));
						}
						player.drew = player.cards[player.cards.length-1];
						if (!drawPile.cards.length) this.meta.actionHistory.push("The draw pile has been exhausted! Delayed action is now possible");

						player.safetyPile.cards.push(card);
						break;
					}
				}

				player.grabCard(card);
				if (!this.players.reduce((acc, player) => acc + player.cards.length, 0)) return this.win(action);
				if (!card.id.startsWith("s")) {
					if (drawPile.cards.length - 1 > this.players.size) player.drew = null;
					if (player.distancePile.distance !== 700 || this.totalDistance !== 700) this.nextPlayer();
				}
				this.updateUI(action);
				break;
			}
		}
	}

	nextPlayer() {
		this.currentPlayer = this.players.find(player => player.index === (this.currentPlayer.index + 1 + this.players.size) % this.players.size);
	}
	
	/**
	 * @param {MessageComponentInteraction} action - The Interaction to reply to
	 */
	updateUI(action) {
		this.renderTable();

		const drawPile = this.piles.get("draw");
		const maxScore = this.players.reduce((acc, player) => Math.max(acc, player.score), 0);
		const scoreThreshold = this.getSetting("scoreThreshold");

		const embeds = [new MessageEmbed()
			.setTitle(`Current Discarded Card: ${this.piles.get("discard").cards[0]?.name || "Nothing!"}`)
			.setDescription(this.meta.ended ? `${this.currentPlayer.member.displayName}${this.currentPlayer.partner ? `and ${this.currentPlayer.partner.member.displayName}` : ""} won the game!` : `\`/help mille\` or [Browse Commands](https://github.com/Bedrockbreaker/unobot/wiki/Mille-Bornes)\nIt is currently ${this.currentPlayer.member.displayName}'s turn`)
			.addField(this.meta.ended ? `${this.currentPlayer.member.displayName}${this.currentPlayer.partner ? `and ${this.currentPlayer.partner.member.displayName}` : ""} won the game!` : `${this.players.find(player => player.index === (this.currentPlayer.index - 1 + this.players.size) % this.players.size).member.displayName} :arrow_right: **${this.currentPlayer.member.displayName}** :arrow_right: ${this.players.find(player => player.index === (this.currentPlayer.index + 1) % this.players.size).member.displayName}`, this.meta.actionHistory.slice(-3).reverse().join("\n"))
			.setColor(this.meta.ended ? Color.Purple : (drawPile.cards.length ? Color.blend(this.players.reduce((acc, player) => Math.max(acc, player.distancePile.distance), 0)/this.totalDistance, Color.Green, Color.Carmine) : Color.Black))
			.setImage("attachment://game.png")
			.setFooter(Util.weighted(...this.tips))];
		if (this.meta.messages.length) {
			embeds.push(new MessageEmbed()
				.setTitle(this.meta.messages[0])
				.setDescription(this.meta.messages[1])
				.setColor(maxScore >= scoreThreshold ? Color.Purple : Color.blend(maxScore/scoreThreshold, Color.Green, Color.Carmine))
			);
			this.meta.messages = [];
		}
		const row = new MessageActionRow().addComponents(new MessageButton().setCustomId("hand").setLabel(`Show Hand${this.players.some(player => player.ping) ? " (!)" : ""}`).setStyle("PRIMARY"));
		if (!drawPile.cards.length) row.addComponents(new MessageButton().setCustomId("game end").setLabel("End Round Early").setStyle("DANGER"));

		this.render.queue(() => {
			/**@type {import("discord.js").MessageOptions} */
			const message = {embeds: embeds, components: [row], files: [new MessageAttachment(this.render.canvas.toBuffer(), "game.png")]};
			if (this.meta.gameMessage) return this.meta.gameMessage.removeAttachments().then(msg => msg.edit(message));
			return this.meta.thread.send(message).then(msg => this.meta.gameMessage = msg);
		}, () => {
			const hand = this.displayHand(this.players.get(action.member.id));
			if (action.replied || action.deferred) return Util.emptyPromise();
			return action.customId === "start" ? action.reply(hand) : Util.update(action, hand);
		});
		this.render.flush();
	}

	renderTable() {
		const cutthroat = this.getSetting("cutthroat");
		super.renderTable();
		this.render.queue(
			() => this.render.drawImage(this.piles.get("discard").cards[0]?.image || "common/discardpileghost.png", 285, 50, 280, 400),
			() => {
				this.players.forEach(player => {
					this.render.drawText(player.cards.length, player.x + 135, player.y + 35);
					this.render.drawText(`${player.distancePile.distance} mi`, player.x + 90, player.y + 80, "24px Arial");
					if (this.players.size < 4 || (this.players.size === 4 && player.index < 3) || (this.players.size === 6 && player.index % 2 === 0)) {
						if (player.battlePile.cards.length) this.render.drawImage(player.battlePile.cards[0].image, player.x, player.y + 90, 28, 40);
						if (cutthroat && player.battlePile.cards.length > 1) this.render.drawText(player.battlePile.cards.length, player.x, player.y + 125);
						if (player.speedPile.cards.length) this.render.drawImage(player.speedPile.cards[0].image, player.x + 33, player.y + 90, 28, 40);
						if (cutthroat && player.speedPile.cards.length > 1) this.render.drawText(player.speedPile.cards.length, player.x + 33, player.y + 135);
						const scards = player.safetyPile.cards;
						for (let i = 0; i < scards.length; i++) {
							const card = scards[i];
							// Center the transform to the upper-left corner of the card
							this.render.ctx.setTransform(1, 0, 0, 1, player.x + 66 + (card.coup ? 40 : 0) + (scards[0].coup ? 20 : 14) - (scards[scards.length-1].coup ? 20 : 14) + i * Math.min(94 - (scards[0].coup ? 20 : 14) - (scards[scards.length-1].coup ? 20 : 14), 28*(scards.length-1)) / Math.max(scards.length - 1, 1), player.y + (card.coup ? (scards.reduce((acc, card2) => acc + (card2.coup ? 1 : 0), 0) === 1 ? 96 : (scards.reduce((acc, card2, j) => acc + (card2.coup && j < i ? 1 : 0), 0) % 2 === 1 ? 102 : 90)) : 90));
							this.render.ctx.rotate(card.coup ? Math.PI / 2 : 0); // Rotate card by pi/2 clockwise if it's a coup fouree
							this.render.drawImage(card.image, 0, 0, 28, 40);
						}
						this.render.ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
						this.render.ctx.rotate(0); // Reset rotation
						player.distancePile.cards.sort((card1, card2) => Number(card2.id) - Number(card1.id));
						for (let i = 0; i < player.distancePile.cards.length; i++) {
							this.render.drawImage(player.distancePile.cards[i].image, player.x + (cutthroat ? 99 : 0) + i*Math.min(Math.min((cutthroat ? 33 : 132)/Math.max(player.distancePile.cards.length - 1, 1)), 28), player.y + 135, 28, 40);
						}
						if (player.gasPile.cards.length) {
							this.render.drawImage(player.gasPile.cards[0].image, player.x, player.y + 135, 28, 40);
							if (player.gasPile.cards.length > 1) this.render.drawText(player.gasPile.cards.length, player.x, player.y + 170);
						}
						if (player.accidentPile.cards.length) {
							this.render.drawImage(player.accidentPile.cards[0].image, player.x, player.y + 135, 28, 40);
							if (player.accidentPile.cards.length > 1) this.render.drawText(player.accidentPile.cards.length, player.x, player.y + 170);
						}
						if (player.tirePile.cards.length) {
							this.render.drawImage(player.tirePile.cards[0].image, player.x, player.y + 135, 28, 40);
							if (player.tirePile.cards.length > 1) this.render.drawText(player.tirePile.cards.length, player.x, player.y + 170);
						}
					}
				});
				return Util.emptyPromise();
			}
		);
	}

	drawStatic() {
		this.render.queue(() => this.render.drawImage("common/background.png", 0, 0));
		this.players.forEach(player => {
			// Pre-computed magic numbers for the player's avatar/piles render location, since players can have differing heights for their render space
			[player.x, player.y] = {2: [[40, 162.5], [640, 162.5]], 3: [[40, 162.5], [640, 58.333], [640, 266.666]], 4: [[40, 90], [640, 90], [640, 330], [40, 330]], 6: [[40, 30], [640, 53.75], [640, 162.5], [640, 266.25], [40, 295], [40, 210]]}[this.players.size][player.index];
			this.render.queue(
				() => Canvas.loadImage(player.member.displayAvatarURL({format: "png", size: 64})).then(image => this.render.drawImage(image, player.x, player.y, 80, 80)),
				() => this.render.drawText(`${player.score} pts`, player.x + 90, player.y + 59, "24px Arial")
			);
		});
		this.render.queue(
			() => {
				this.players.forEach(player => {
					this.render.drawImage("mille/icon.png", player.x + 90, player.y);
					if (this.players.size > 3) {
						const tempCanvas = Canvas.createCanvas(80, 80);
						const ctx = tempCanvas.getContext("2d");
						ctx.drawImage(Render.images.get("common/mask.png"), 0, 0);
						ctx.globalCompositeOperation = "source-in";
						ctx.fillStyle = Color.toHexString(this.colors[this.players.size > 3 ? player.index % (this.players.size / 2) : player.index]);
						ctx.fillRect(0, 0, 80, 80);
						this.render.drawImage(tempCanvas, player.x, player.y);
					}
				});
				return Util.emptyPromise();
			},
			() => this.saveCanvas()
		);
	}

	/**
	 * @param {MillePlayer} player - the player to display their cards to.
	 * @param {number} page - If truthy, displays the discard menu. Otherwise, displays the normal card menu
	 */
	displayHand(player, page) {
		player.ping = false;
		if (this.meta.ended) return {content: "Game Ended!", components: [], ephemeral: true};
		if (!player.cards.length) return {content: "You don't have any cards!", ephemeral: true};
		const display = super.displayHand(player);

		/**@type {MessageSelectMenu} */
		const cardMenu = display.components[0].components[0];
		cardMenu.setOptions(player.cards.slice().sort((card1, card2) => {
			if (card1.id.startsWith("s") || card2.id.startsWith("s")) return card1.id.startsWith("s") ? -1 : 1;
			if (Number(card1.id) && Number(card2.id)) return Number(card2.id) - Number(card1.id);
			else if (Number(card1.id)) return -1;
			else if (Number(card2.id)) return 1;
			if (card1.id.startsWith("r") || card2.id.startsWith("r")) return card1.id.startsWith("r") ? -1 : 1;
			return card1.id >= card2.id ? (card1.id === card2.id ? 0 : 1) : -1;
		}).map(card => ({label: card.name, description: card === player.drew ? "Newest Card" : "", value: `${card.id} ${page ? "discard" : ""} ${this.cardCounter}`})));

		const row = new MessageActionRow().addComponents(player.drew ? (page ? new MessageButton().setCustomId("hand 0 true").setLabel("Use Card").setStyle("DANGER"): new MessageButton().setCustomId("hand 1 true").setLabel("Discard").setStyle("SUCCESS")) : new MessageButton().setCustomId("game draw").setLabel("Draw").setStyle("PRIMARY"));
		if (player.distancePile.distance === this.totalDistance && this.totalDistance === 700) {
			display.content = "Would you like to extend the game to 1000 miles? (If you win, you get 200 bonus points. But if you lose, everyone else gets 200 bonus points)"
			row.addComponents(new MessageButton().setCustomId("game extend true").setLabel("Extend Game").setStyle("SUCCESS"), new MessageButton().setCustomId("game extend").setLabel("End Round").setStyle("DANGER"));
		}
		display.components.push(row);

		return display;
	}

	/**
	 * @param {GuildMember} member - The member to generate a Player for
	 * @param {Boolean} isLeader - Whether the newly added player is a leader
	 */
	addPlayer(member, isLeader = false) {
		super.addPlayer(member, isLeader);
		if (this.meta.settingsMessage) this.meta.settingsMessage.edit(this.displaySettings());
	}

	/**
	 * @param {MillePlayer} player - The Player to remove from the game
	 */
	removePlayer(player) {
		if (this.meta.phase >= 2) {
			this.meta.thread.send(`You can blame ${player.member.displayName} for stopping the game >:(`);
			this.meta.ended = true;
			return;
		}

		if (player.partner) player.partner.partner = null;
		if (this.meta.settingsMessage) this.meta.settingsMessage.edit(this.displaySettings());
		super.removePlayer(player);
	}

	randomizePlayerOrder() {
		let indexes = Util.shuffle([...Array(this.players.size > 3 ? this.players.size/2 : this.players.size).keys()]);
		const teams = this.players.size > 3;
		for (const [id, player] of this.players) {
			if (!indexes.length) continue;
			player.index = indexes.pop();
			if (teams) {
				player.index += Math.floor(Math.random()*2)*this.players.size/2;
				player.partner ||= this.players.filter(player2 => !player2.partner && player2 !== player).random();
				player.partner.partner ||= player;
				player.partner.index = (player.index + this.players.size/2) % this.players.size;
			}
		}
	}

	/**
	 * Ends a round, tabulates the score, and starts a new round if necessary.
	 * @param {MessageComponentInteraction} action - The interaction to respond to
	 */
	win(action) {
		/**@type {MillePlayer[]} */
		const teams = [];
		for (const [id, player] of this.players) {
			if (teams.includes(player.partner)) continue;
			teams.push(player);
		}
		const team3 = teams.length === 3;
		const roundWinner = teams.find(team => team.distancePile.distance === this.totalDistance);
		
		const scores = [];
		for (let i = 0; i < teams.length; i++) {
			const team = teams[i];
			scores.push([team.score, team.distancePile.distance, 100*team.safetyPile.cards.length, team.safetyPile.cards.length === 4 ? 300 : 0, 300*team.safetyPile.cards.filter(card => card.coup).length, roundWinner === team ? 400 : 0, roundWinner === team && !this.piles.get("draw").cards.length ? 300 : 0, roundWinner === team && !team.distancePile.cards.some(card => card.id === "200") ? 300 : 0, roundWinner === team && teams.filter((_, j) => j !== i).every(team2 => !team2.distancePile.distance) ? 500 : 0, this.extender ? ((this.extender.distancePile.distance === this.totalDistance && this.extender === team) || (this.extender.distancePile.distance !== this.totalDistance && this.extender !== team) ? 200 : 0) : 0]);
			team.score = scores[i].reduce((acc, n) => acc + n);
			if (team.partner) team.partner.score = team.score;
			scores[i] = scores[i].map(n => `${n}`.padStart(6));
			scores[i].push(`${team.score}`.padStart(6));
		}

		let display = teams.reduce((acc, player, i) => `${acc}Team ${["A", "B", "C"][i]} = ${player.member.displayName}${player.partner ? ` :handshake: ${player.partner.member.displayName}` : ""}\n`, "")
			+ "```prolog\n"
			+ `                ╥ Team A ╥ Team B ${team3 ? "╥ Team C " : ""}╥\n`
			+ `╞═══════════════╬════════╬════════${team3 ? "╬════════" : ""}╣\n`
			+ (scores.some(score => score[0] !== "     0") ? ` Previous Total ║ ${scores[0][0]} ║ ${scores[1][0]} ${team3 ? `║ ${scores[2][0]} `: ""}║\n` : "")
			+ `          Miles ║ ${scores[0][1]} ║ ${scores[1][1]} ${team3 ? `║ ${scores[2][1]} `: ""}║\n`
			+ `       Safeties ║ ${scores[0][2]} ║ ${scores[1][2]} ${team3 ? `║ ${scores[2][2]} `: ""}║\n`
			+ `    4x Safeties ║ ${scores[0][3]} ║ ${scores[1][3]} ${team3 ? `║ ${scores[2][3]} `: ""}║\n`
			+ `   Coup Fourres ║ ${scores[0][4]} ║ ${scores[1][4]} ${team3 ? `║ ${scores[2][4]} `: ""}║\n`
			+ ` Trip Completed ║ ${scores[0][5]} ║ ${scores[1][5]} ${team3 ? `║ ${scores[2][5]} `: ""}║\n`
			+ ` Delayed Action ║ ${scores[0][6]} ║ ${scores[1][6]} ${team3 ? `║ ${scores[2][6]} `: ""}║\n`
			+ `      Safe Trip ║ ${scores[0][7]} ║ ${scores[1][7]} ${team3 ? `║ ${scores[2][7]} `: ""}║\n`
			+ `       Shut Out ║ ${scores[0][8]} ║ ${scores[1][8]} ${team3 ? `║ ${scores[2][8]} `: ""}║\n`
			+ (!this.getSetting("cutthroat") && this.players.size !== 4 ? `      Extension ║ ${scores[0][9]} ║ ${scores[1][9]} ${team3 ? `║ ${scores[2][9]} `: ""}║\n` : "")
			+ `╞═══════════════╬════════╬════════${team3 ? "╬════════" : ""}╣\n`
			+ `    Total Score ╨ ${scores[0][10]} ║ ${scores[1][10]} ${team3 ? `║ ${scores[2][10]} `: ""}╨\`\`\``;
		
		// The player who joined first breaks any ties ¯\_(ツ)_/¯
		const gameWinner = teams.filter(team => team.score >= this.getSetting("scoreThreshold")).reduce((acc, player) => player.score > (acc?.score  || 0) ? player : acc, null);
		const winner = gameWinner || roundWinner;

		this.meta.messages = ["Score Breakdown", display];
		this.meta.actionHistory.push(winner ? `${winner.member.displayName}${winner.partner ? ` and ${winner.partner.member.displayName}` : ""} won the ${gameWinner ? "game" : "round"}!` : "No one won the round :'(");
		this.updateUI(action);
		
		if (gameWinner) {
			this.meta.thread.send(`${gameWinner.member.displayName}${gameWinner.partner ? ` and ${gameWinner.partner.member.displayName}` : ""} won the game!`);
			this.meta.ended = true;
		} else {
			// Automatically flushed by the above updateUI
			this.render.queue(() => {
				this.meta.gameMessage = null;
				this.drawStatic();
				this.start(action);
				return Util.emptyPromise();
			});
		}
	}

	/**
	 * @param {string} input 
	 * @returns {Collection<string, MillePlayer>}
	 */
	getPlayers(input) {
		return super.getPlayers(input);
	}

	/**
	 * @param {MessageEmbed} embed
	 * @param {string[]} command
	 */
	static help(embed, command) {
		embed.setTitle(`Help for \`/g ${command.join(" ")}\` in Mille Bornes`).setDescription("[Browse Commands](https://github.com/Bedrockbreaker/unobot/wiki/Mille-Bornes)");
		switch(command[0]) {
			case "":
			case undefined:
				embed.setTitle("Help for Mille Bornes").addField("/help mille <command>", "General help command for Mille Bornes. Use this to receive information on using other commands.\nEx: \`/help mille score\`")
					.addFields(
						{name: "Available Commands", value: "(To discard, use `/g <cardId>`)"},
						{name: "Score", value: "/help mille score", inline: true},
						{name: "Team", value: "/help mille team", inline: true},
						{name: "Draw", value: "/help mille draw", inline: true},
						{name: "Extend", value: "/help mille extend", inline: true},
						{name: "End", value: "/help mille end", inline: true})
					.setColor(Color.White);
				break;
			case "score":
				embed.addField("/g score <num>", "Changes the winning score for the overall game. This does *not* affect the score requires to win a singular round.\nEx: `/g score 2500`").setColor(Color.randomColor());
				break;
			case "team":
				embed.addField("/g team <player>", "Teams up with the specified player during the settings phase.\nEx: `/g team Bobby`").setColor(Color.Green);
				break;
			case "draw":
				embed.addField("/g draw", "Draws a card.\nEx: `/g draw`").setColor(Color.Green);
				break;
			case "extend":
				embed.addField("/g extend [true]", "If given the option, extends the game from a 700 mile race to 1000 miles. Use with no arguments to end the round instead.\nEx: `/g extend` or `/g extend true`").setColor(Color.randomColor());
				break;
			case "end":
				embed.addField("/g end", "Toggles your vote for ending a round early.\nEx: `/g end`").setColor(Color.Carmine);
				break;
			default:
				embed.addField("Unknown command", "Did you spell it correctly?").setColor(Color.Carmine);
				break;
		}
	}
}

class MillePlayer extends Player {
	/**
	 * @param {GuildMember} member - The member associated with the player
	 * @param {boolean} [isLeader] - If the player is a leader/host over a game
	 */
	constructor(member, isLeader = false) {
		super(member, [], isLeader);

		/**@type {MilleCard[]} */
		this.cards;

		/** The player's battle pile. If cutthroat, only contains Green/Red lights */
		this.battlePile = new MillePile();
		/** The player's speed pile */
		this.speedPile = new MillePile();
		/** The player's safety pile */
		this.safetyPile = new MillePile();
		/** The player's distance pile */
		this.distancePile = new MillePile();
		/** Cutthroat only. The player's gas pile */
		this.gasPile = new MillePile();
		/** Cutthroat only. The player's accident pile */
		this.accidentPile = new MillePile();
		/** Cutthroat only. The player's tire pile */
		this.tirePile = new MillePile();

		/**
		 * The player's partner, if applicable
		 * @type {MillePlayer}
		 */
		this.partner = null;

		/**
		 * Whether the player has drawn for their turn or not
		 * @type {MilleCard}
		 */
		this.drew = null;

		/** The player's total running score */
		this.score = 0;
	}

	/**
	 * @param {string} [argument] - The string formatted in "card selection syntax"
	 * @returns {MilleCard[]} The cards which match the specified argument
	 */
	 getCards(argument) {
		return super.getCards(argument);
	}
}

class MillePile extends Pile {
	/**
	 * @param {MilleCard[]} [cards] - The cards in the pile
	 */
	constructor(cards = []) {
		super(cards, {});

		/**@type {MilleCard[]} */
		this.cards;

		/** If this pile is the distance pile, the current distance within it */
		this.distance = 0;
	}
}

class MilleCard extends Card {
	/**
	 * @param {string} id - The id of the card
	 * @param {string} [name] - The Human-Readable name of the card, defaults to the id
	 * @param {string} [image] - The URL to the image of the card
	 */
	constructor(id, name, image = "") {
		super(id, name, image);

		/** If this card is a safety, whether or not it was played as a coup fourre */
		this.coup = false;
	}
}