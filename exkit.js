import {Collection, GuildMember, MessageActionRow, MessageAttachment, MessageButton, MessageComponentInteraction, MessageEmbed, MessageSelectMenu, ThreadChannel} from "discord.js";
import Canvas from "canvas";
import {Core, Util, Color, Player, Pile, Card, Setting} from "./core.js";

/**
 * The base implementation of Exploding Kittens
 */
export default class baseExkit extends Core {
	/**@param {ThreadChannel} thread - The channel to send updates to */
	constructor(thread) {
		const settings = new Collection([
			["imploding", new Setting(0,
				"Imploding Kittens Expansion Pack - :exploding_head: ・ $0",
				"- [Rules](https://www.explodingkittens.com/pages/rules-imploding-kittens#field-guide)\n- 1x Imploding Kitten, 4x Reverses, 4x Draw from the Bottoms, 4x Feral Cats, 4x Alter the Futures, 3x Targeted Attacks",
				Util.Selection("imploding", [["Imploding Kittens - Off", "Expansion Disabled"], ["Imploding Kittens - On", "Expansion Enabled"]]),
				() => [this.displayVote("imploding", ["Disabled", "Enabled"])])],
			["streaking", new Setting(0,
				"Streaking Kittens Expansion Pack - :shorts: ・ $0",
				"- [Rules](https://www.explodingkittens.com/pages/rules-streaking-kittens#field-guide)\n- 1x Streaking Kitten, 1x Exploding Kitten, 1x Super Skip, 1x See the Future (x5), 1x Alter the Future (x5), 3x Swap Top and Bottoms, 1x Garbage Collection, 1x Catomic Bomb, 3x Marks, 2x Curses of the Catt Butt",
				Util.Selection("streaking", [["Streaking Kittens - Off", "Expansion Disabled"], ["Streaking Kittens - On", "Expansion Enabled"]]),
				() => [this.displayVote("streaking", ["Disabled", "Enabled"])])],
			["barking", new Setting(0,
				"Barking Kittens Expansion Pack - :dog: ・ $0",
				"- [Rules](https://www.explodingkittens.com/pages/rules-barking-kittens#field-guide)\n- 2x Barking Kittens, 2x Alter the Futures ⁿᵒʷ, 2x Buries, 4x Personal Attacks (x3), 1x Super Skip, 2x Potlucks, 1x Tower of Power, 4x I'll Take Thats, 2x Share the Futures (x3)",
				Util.Selection("barking", [["Barking Kittens - Off", "Expansion Disabled"], ["Barking Kittens - On", "Expansion Enabled"]]),
				() => [this.displayVote("barking", ["Disabled", "Enabled"])])],
			["removePercent", new Setting(0,
				"Percent of cards to remove: $0%",
				"- Use `/g remove <num>` to change. (33 recommended for quick games)",
				undefined,
				() => [this.getSetting("removePercent")])]
		]);

		super("Exploding Kittens", thread, settings);

		/**@type {Collection<string, ExkitPile>} */
		this.piles;
		/**@type {ExkitPlayer} */
		this.currentPlayer;
		/**@type {Collection<string, ExkitPlayer>} */
		this.players;

		/** The number of extra turns for the currentPlayer */
		this.extraTurns = 0;

		/** Whether the play-direction is clockwise or not */
		this.clockwise = true;

		/**
		 * An entire copy of the game's state, to fall back to if a Nope is played
		 * @type {baseExkit}
		 */
		this.copy = null;
	}

	/**
	 * @param {GuildMember} member - The member to generate a player for
	 * @param {Boolean} isLeader - Whether the new player is a leader
	 */
	genDefaultPlayer(member, isLeader = false) {
		return new ExkitPlayer(member, isLeader);
	}

	/**
	 * @returns {import("discord.js").MessageOptions?}
	 */
	displaySettings() {
		const display = super.displaySettings();
		display.embeds[0].setDescription("\`/help kittens\` or [Browse Commands](https://github.com/Bedrockbreaker/unobot/wiki/Exploding-Kittens)");
		return display;
	}

	/**
	 * @param {MessageComponentInteraction} action - The Interaction to reply to
	 */
	start(action) {
		if (this.players.size < 2) return action.reply({content: "Not enough players", ephemeral: true});
		this.getSettings();
		this.meta.phase = 2;
		if (this.getSetting("barking")) {
			this.render.queue(
				() => Canvas.loadImage("images/exkit/tower.png").then(image => this.render.images.set("tower", image)),
				() => Canvas.loadImage("images/exkit/mouse.png").then(image => this.render.images.set("mouse", image))
			);
		}
		if (this.getSetting("streaking")) {
			this.render.queue(
				() => Canvas.loadImage("images/exkit/marked.png").then(image => this.render.images.set("marked", image)),
				() => Canvas.loadImage("images/exkit/cursed.png").then(image => this.render.images.set("cursed", image))
			);
		}
		this.randomizePlayerOrder();

		this.piles.set("draw", new ExkitPile(this.deckCreate()));
		this.piles.set("discard", new ExkitPile());

		this.players.forEach(player => {if (player !== this.players.get(action.member.id)) player.ping = true});
		this.currentPlayer = this.players.find(player => !player.index);
		this.meta.actionHistory.push("The game has just started!");
		super.start();
		this.updateUI(action);
	}

	/**
	 * Sets up the cards for this game. (Deals to players, creats ToPs, etc.)
	 * @returns {ExkitCard[]} The newly created cards for the draw pile
	 */
	deckCreate() {
		/** @type {ExkitCard[]} */
		let cards = [];
		const url = "images/exkit/";
		const maxSet = 5 + (this.getSetting("imploding") ? 1 : 0);
		for (let i = 0; i < this.players.size; i += maxSet) {
			const set = Math.min(maxSet, this.players.size - i);
			cards.push(new ExkitCard("at", "Attack", `${url}at.png`), new ExkitCard("at", "Attack", `${url}at.png`), new ExkitCard("at", "Attack", `${url}at.png`), new ExkitCard("at", "Attack", `${url}at.png`),
				new ExkitCard("sp", "Skip", `${url}sp.png`), new ExkitCard("sp", "Skip", `${url}sp.png`), new ExkitCard("sp", "Skip", `${url}sp.png`), new ExkitCard("sp", "Skip", `${url}sp.png`),
				new ExkitCard("sf", "See the Future", `${url}sf.png`), new ExkitCard("sf", "See the Future", `${url}sf.png`), new ExkitCard("sf", "See the Future", `${url}sf.png`), new ExkitCard("sf", "See the Future", `${url}sf.png`), new ExkitCard("sf", "See the Future", `${url}sf.png`),
				new ExkitCard("sh", "Shuffle", `${url}sh.png`), new ExkitCard("sh", "Shuffle", `${url}sh.png`), new ExkitCard("sh", "Shuffle", `${url}sh.png`), new ExkitCard("sh", "Shuffle", `${url}sh.png`),
				new ExkitCard("fv", "Favor", `${url}fv.png`), new ExkitCard("fv", "Favor", `${url}fv.png`), new ExkitCard("fv", "Favor", `${url}fv.png`), new ExkitCard("fv", "Favor", `${url}fv.png`),
				new ExkitCard("no", "Nope", `${url}no.png`), new ExkitCard("no", "Nope", `${url}no.png`), new ExkitCard("no", "Nope", `${url}no.png`), new ExkitCard("no", "Nope", `${url}no.png`), new ExkitCard("no", "Nope", `${url}no.png`),
				new ExkitCard("tc", "Taco Cat", `${url}tc.png`),  new ExkitCard("tc", "Taco Cat", `${url}tc.png`), new ExkitCard("tc", "Taco Cat", `${url}tc.png`), new ExkitCard("tc", "Taco Cat", `${url}tc.png`),
				new ExkitCard("mc", "Melon Cat", `${url}mc.png`), new ExkitCard("mc", "Melon Cat", `${url}mc.png`), new ExkitCard("mc", "Melon Cat", `${url}mc.png`), new ExkitCard("mc", "Melon Cat", `${url}mc.png`),
				new ExkitCard("pc", "Hairy Potato Cat", `${url}pc.png`), new ExkitCard("pc", "Hairy Potato Cat", `${url}pc.png`), new ExkitCard("pc", "Hairy Potato Cat", `${url}pc.png`), new ExkitCard("pc", "Hairy Potato Cat", `${url}pc.png`),
				new ExkitCard("bc", "Beard Cat", `${url}bc.png`), new ExkitCard("bc", "Beard Cat", `${url}bc.png`), new ExkitCard("bc", "Beard Cat", `${url}bc.png`), new ExkitCard("bc", "Beard Cat", `${url}bc.png`),
				new ExkitCard("rc", "Rainbow Ralphing Cat", `${url}rc.png`), new ExkitCard("rc", "Rainbow Ralphing Cat", `${url}rc.png`), new ExkitCard("rc", "Rainbow Ralphing Cat", `${url}rc.png`), new ExkitCard("rc", "Rainbow Ralphing Cat", `${url}rc.png`));
			for (let j = 0; j < Math.max(2, 6 - set); j++) {
				cards.push(new ExkitCard("de", "Defuse", `${url}de.png`));
			}
			if (this.getSetting("imploding")) {
				cards.push(new ExkitCard("re", "Reverse", `${url}re.png`), new ExkitCard("re", "Reverse", `${url}re.png`), new ExkitCard("re", "Reverse", `${url}re.png`), new ExkitCard("re", "Reverse", `${url}re.png`),
					new ExkitCard("db", "Draw from the Bottom", `${url}db.png`), new ExkitCard("db", "Draw from the Bottom", `${url}db.png`), new ExkitCard("db", "Draw from the Bottom", `${url}db.png`), new ExkitCard("db", "Draw from the Bottom", `${url}db.png`),
					new ExkitCard("fc", "Feral Cat", `${url}fc.png`), new ExkitCard("fc", "Feral Cat", `${url}fc.png`), new ExkitCard("fc", "Feral Cat", `${url}fc.png`), new ExkitCard("fc", "Feral Cat", `${url}fc.png`),
					new ExkitCard("af", "Alter the Future", `${url}af.png`), new ExkitCard("af", "Alter the Future", `${url}af.png`), new ExkitCard("af", "Alter the Future", `${url}af.png`), new ExkitCard("af", "Alter the Future", `${url}af.png`),
					new ExkitCard("ta", "Targeted Attack", `${url}ta.png`), new ExkitCard("ta", "Targeted Attack", `${url}ta.png`), new ExkitCard("ta", "Targeted Attack", `${url}ta.png`));
			}
			if (this.getSetting("streaking")) {
				cards.push(new ExkitCard("sk", "Streaking Kitten", `${url}sk.png`),
					new ExkitCard("ss", "Super Skip", `${url}ss.png`),
					new ExkitCard("s5", "See the Future **x5**", `${url}s5.png`),
					new ExkitCard("a5", "Alter the Future **x5**", `${url}a5.png`),
					new ExkitCard("sw", "Swap Top and Bottom", `${url}sw.png`), new ExkitCard("sw", "Swap Top and Bottom", `${url}sw.png`), new ExkitCard("sw", "Swap Top and Bottom", `${url}sw.png`),
					new ExkitCard("gc", "Garbage Collection", `${url}gc.png`),
					new ExkitCard("cb", "Catomic Bomb", `${url}cb.png`),
					new ExkitCard("mk", "Mark", `${url}mk.png`), new ExkitCard("mk", "Mark", `${url}mk.png`), new ExkitCard("mk", "Mark", `${url}mk.png`),
					new ExkitCard("cc", "Curse of the Cat Butt", `${url}cc.png`), new ExkitCard("cc", "Curse of the Cat Butt", `${url}cc.png`));
			}
			if (this.getSetting("barking")) {
				cards.push(new ExkitCard("bk", "Barking Kitten", `${url}bk.png`, i/maxSet), new ExkitCard("bk", "Barking Kitten", `${url}bk.png`, i/maxSet),
					new ExkitCard("an", "Alter the Future **Now**", `${url}an.png`), new ExkitCard("an", "Alter the Future **Now**", `${url}an.png`),
					new ExkitCard("br", "Bury", `${url}br.png`), new ExkitCard("br", "Bury", `${url}br.png`),
					new ExkitCard("pa", "Personal Attack", `${url}pa.png`), new ExkitCard("pa", "Personal Attack", `${url}pa.png`), new ExkitCard("pa", "Personal Attack", `${url}pa.png`), new ExkitCard("pa", "Personal Attack", `${url}pa.png`),
					new ExkitCard("ss", "Super Skip", `${url}ss.png`),
					new ExkitCard("pl", "Potluck", `${url}pl.png`), new ExkitCard("pl", "Potluck", `${url}pl.png`),
					new ExkitCard("tt", "I'll Take That", `${url}tt.png`), new ExkitCard("tt", "I'll Take That", `${url}tt.png`), new ExkitCard("tt", "I'll Take That", `${url}tt.png`), new ExkitCard("tt", "I'll Take That", `${url}tt.png`),
					new ExkitCard("hf", "Share the Future", `${url}hf.png`), new ExkitCard("hf", "Share the Future", `${url}hf.png`));
			}
		}
		Util.shuffle(cards);
		for (let i = 0; i < cards.length * this.getSetting("removePercent") / 100; i++) {
			const card = cards.pop();
			if (card.id === "bk") { // Because we don't want a game with only 1 barking kitten
				cards.splice(cards.findIndex(card2 => card2.pair === card.pair), 1);
				i++;
			}
		}
		if (this.getSetting("barking")) {
			for (let i = 0; i < this.players.size; i += maxSet) {
				this.piles.set(`top${i/maxSet}`, new ExkitPile(cards.splice(0, 6), i/maxSet));
			}
			for (let i = 0; i < this.players.size; i += maxSet) {
				cards.push(new ExkitCard("tp", "Tower of Power", `${url}tp.png`, i/maxSet));
			}
			Util.shuffle(cards);
		}
		this.players.forEach(player => player.cards.push(...cards.splice(0, 7), new ExkitCard("de", "Defuse", `${url}de.png`)));

		for (let i = 0; i < this.players.size + (this.getSetting("streaking") ? 0 : -1); i++) {
			cards.push(new ExkitCard("ek", "Exploding Kitten", `${url}ek.png`));
		}
		for (let i = 0; i < this.players.size; i += maxSet) {
			if (this.getSetting("imploding")) {
				cards.push(new ExkitCard("ik", "Imploding Kitten", `${url}ik.png`));
				if (this.players.size > 2) cards.splice(cards.findIndex(card => card.id === "ek"), 1); // Removes an exploding kitten
			}
		}
		return Util.shuffle(cards);
	}

	/**
	 * @param {MessageComponentInteraction} action - The Interaction to reply to
	 * @param {string[]} args - The arguments to the command 
	 */
	handleCommand(action, args) {
		/**@type {GuildMember} */
		const member = action.member;
		const player = this.players.get(member.id);
		if (!player) return action.reply({content: "You aren't a part of this game!", ephemeral: true});
		switch(args[0]) {
			case "vote":
				if (!this.meta.voting && !player.isLeader) return action.reply({content: `Voting isn't enabled! Either accept your plight, or ask <@!${this.players.find(p => p.isLeader).member.id}> to enable Democracy (\`/vote Enable\`)`, ephemeral: true});
				// Silently ignore errors (only possible through a slash command)
				for (let i = 1; i < args.length; i += 2) {
					this.voteSetting(args[i], args[i+1], member.id);
				}
				this.meta.settingsMessage?.edit(this.displaySettings());
				action.reply({content: "Settings updated", ephemeral: true});
				break;
			case "remove": {
				if (this.meta.phase >= 2) return action.reply({content: "Imagine being such a smooth brain and trying that.", ephemeral: true});
				if (!player.isLeader) return action.reply({content: "Only the leader can change that", ephemeral: true});
				const num = Util.clamp(Number(args[1]), 0, 100); // Allow fractional inputs
				if (isNaN(num)) return action.reply({content: "That wasn't a valid number", ephemeral: true});
				this.setSetting("removePercent", num);
				this.meta.settingsMessage?.edit(this.displaySettings());
				action.reply(`Removed percentage of cards successfully changed to ${num}`);
				break;
			}
			case "buildfuture": {
				if (!action.isButton()) return action.reply({content: "No. Stop that.", ephemeral: true});
				const drawPile = this.piles.get("draw");
				const discardNeedsInput = this.piles.get("discard").cards.find(card2 => card2.needsInput);
				if (!discardNeedsInput) return Core.notYet(action);
				if ((discardNeedsInput.id === "an" && player !== discardNeedsInput.owner) || (discardNeedsInput.id !== "an" && player !== this.currentPlayer)) return Core.notYet(action);
				const max = Math.min(discardNeedsInput.id === "a5" ? 5 : 3, drawPile.cards.length);
				const nums = args.slice(1).map(n => Number(n));

				if (nums.length >= max-1) {
					const order = nums.slice(0, max-1);
					order.push([...new Array(max).keys()].filter(n => !order.includes(n))[0]); // Add the last number we're missing
					
					const topCards = drawPile.cards.slice(0, max);
					for (let i = 0; i < max; i++) {
						drawPile.cards[i] = topCards[order[i]];
					}
					const cardnames = drawPile.cards.slice(0, max).map(card => `${card.name}${card.pair !== null && this.players.size > 5 + this.getSetting("imploding") ? ` (Pair: ${card.pair})` : ""}`).join(", ");
					player.messages = [`Successfully set the new order: ${cardnames}`];
					if (discardNeedsInput.id === "hf") {
						const player2 = this.players.find(player2 => player2.index === (player.index + (this.clockwise ? 1 : -1) + this.players.size) % this.players.size);
						player2.messages = [`Next ${Util.plural(max, `${max} cards`, "card")}: ${cardnames}`];
						player2.ping = true;
					}
					discardNeedsInput.needsInput = false;
					this.copy = null;
					this.updateUI(action);
					break;
				}

				player.messages = [`**Next ${max} Cards**\n${drawPile.cards.slice(0, max).map((card, i) => [card, i]).sort((/**@type {[card: ExkitCard, index: number]}*/pair1, /**@type {[card: ExkitCard, index: number]}*/pair2) => {
					if (nums.includes(pair1[1]) && nums.includes(pair2[1])) return nums.findIndex(n => n === pair1[1]) - nums.findIndex(n => n === pair2[1]);
					else if (nums.includes(pair1[1])) return -1;
					else if (nums.includes(pair2[1])) return 1;
					return 0;
				}).map((/**@type {[card: ExkitCard, index: number]}*/pair, i) => `${i+1}. ${pair[0].name}`).join("\n")}`, `Choose a new **${["2nd", "3rd", "4th"][nums.length - 1]}** card`];

				const display = this.displayHand(player);
				/**@type {MessageActionRow} */
				const row = display.components[display.components.length-1]; // Button row for choosing the new order of cards
				row.setComponents();
				for (let i = 0; i < max; i++) {
					if (nums.includes(i)) continue;
					const card = drawPile.cards[i];
					row.addComponents(new MessageButton().setCustomId(`game buildfuture ${nums.join(" ")} ${i}`).setLabel(`${card.name}${card.pair !== null && this.players.size > 5 + this.getSetting("imploding") ? ` (Pair: ${card.pair})` : ""}`).setStyle("PRIMARY"));
				}
				Util.update(action, display);
				break;
			}
			case "combo": {
				if (this.meta.phase < 2 || player !== this.currentPlayer) return Core.notYet(action);
				const discardPile = this.piles.get("discard");
				const discardNeedsInput = discardPile.cards.find(card2 => card2.needsInput);
				const ekNeedsInput = this.players.some(player2 => player2.cards.some(card2 => card2.exploded));
				const ikNeedsInput = this.players.some(player2 => player2.cards.some(card2 => card2.id === "ik"));
				if (discardNeedsInput || ekNeedsInput || ikNeedsInput) return Core.notYet(action);
				if (player.cursed) return action.reply({content: "Can't play combos while you're cursed!", ephemeral: true});
				if (!["2", "3", "5"].includes(args[1])) return action.reply({content: `\`${args[1]}\` is not a valid combo type`, ephemeral: true});

				if (!args[2]) {
					const rows = [
						new MessageActionRow().addComponents(new MessageSelectMenu()
							.setCustomId(`game ${args.join(" ")}`)
							.setPlaceholder("Your hand")
							.setOptions(player.cards.slice().filter(card => !["ek", "ik", "sk"].includes(card.id)).sort((card1, card2) => {
								if (card1.id === "de" || card2.id === "de") return card1.id === "de" ? -1 : 1;
								return card1.name < card2.name ? -1 : (card1.name > card2.name);
							}).map(card => {
								const propValues = [];
								const propDescs = [];
								if (card.marked) {
									propValues.push("marked");
									propDescs.push("Marked");
								}
								if (card.pair !== null && this.players.size > 5 + this.getSetting("imploding")) {
									propValues.push(`pair:${card.pair}`);
									propDescs.push(`Pair: ${card.pair}`);
								}
								return {label: card.name, description: propDescs.join("・"), value: `${card.id}${propValues.length ? `.${propValues.join(",")}` : ""} ${this.cardCounter}`};
							}))
							.setMinValues(Number(args[1]))
							.setMaxValues(Number(args[1]))),
						new MessageActionRow().addComponents(new MessageButton().setCustomId("hand 0 true").setLabel("Cancel").setStyle("SECONDARY"))
					];
					return Util.update(action, {content: "Choose cards for the combo", components: rows, ephemeral: true});
				}

				/**@type {ExkitCard[]} */
				const cards = [];
				for (let i = 2; i < Number(args[1]) * 2 + 2; i += 2) { // Skip the value collision-avoidance args
					const card = player.grabCard(player.getCards(args[i])[0]);
					if (["ek", "ik", "sk"].includes(card?.id)) continue;
					if (card) cards.push(card); // Don't push undefined cards
				}
				player.cards.push(...cards);

				let copy = Util.deepClone(this);

				// TODO: move cards into discard pile here, allow noping

				switch(args[1]) {
					case "2": {
						// args: "combo 2 c1 n c2 n player c3 n"
						if (cards.length !== 2) return action.reply({content: "You didn't supply exactly 2 cards", ephemeral: true});
						if (new Set(cards.map(card => card.id).filter(id => id !== "fc")).size > 1) return action.reply({content: "Cards must match", ephemeral: true});
						
						/**@type {ExkitPlayer} */
						let player2;
						const comboable = this.players.filter(player3 => player3 !== player && (player3.cards.length || player3.ToP?.cards.length));
						if (!comboable.size) return action.reply({content: "There isn't anyone you can combo!", ephemeral: true});
						else if (comboable.size === 1) args[6] = `<@${comboable.first().member.id}>`;
						if (!args[6]) {
							const rows = [
								new MessageActionRow().addComponents(new MessageSelectMenu()
									.setCustomId(`game ${args.join(" ")}`)
									.setPlaceholder("Choose someone to combo")
									.addOptions(comboable.map(player3 => ({label: player3.member.displayName, description: `${player3.ToP ? "Tower of Power" : `${player3.cards.length} Card${Util.plural(player3.cards.length)}`}`, value: `<@${player3.member.id}>`})))),
								new MessageActionRow().addComponents(new MessageButton().setCustomId("hand 0 true").setLabel("Cancel").setStyle("SECONDARY"))
							];
							if (action.component) rows.unshift(new MessageActionRow().addComponents(action.component));
							return Util.update(action, {content: "Specify a player to steal a card from", components: rows, ephemeral: true});
						}
						const players = this.getPlayers(args[6]);
						if (players.size > 1) return action.reply({content: `Be more specific! \`${args[6]}\` matched multiple players`, ephemeral: true});
						player2 = players.first();
						if (!player2 || player2 === player) return action.reply({content: "Could not find that player", ephemeral: true});
						if (!player2.cards.length && (!player2.ToP || !player2.ToP.cards.length)) return action.reply({content: "They don't have any cards to steal", ephemeral: true});

						/**@type {ExkitCard} */
						let card2;
						if (player2.ToP?.cards.length) card2 = player2.ToP.cards.pop();
						else {
							const marked = player2.cards.filter(card => card.marked);
							if (!args[7] && marked.length && player2.cards.length > 1) {
								const rows = [
									new MessageActionRow().addComponents(new MessageSelectMenu()
										.setCustomId(`game ${args.join(" ")}`)
										.setPlaceholder("Choose a card to steal")),
									new MessageActionRow().addComponents(new MessageButton().setCustomId("hand 0 true").setLabel("Cancel").setStyle("SECONDARY"))
								];
								// If there's a mix of marked and non marked cards
								if (marked.length !== player2.cards.length) rows[0].components[0].addOptions({label: "Random", description: "Any card from their hand", value: "*"}, {label: "Random Non-Marked Card", description: "Any card from their hand which isn't marked", value: "*.marked:false"});
								if (marked.length > 2) rows[0].components[0].addOptions({label: "Random Marked Card", description: "Any card from their hand which is marked", value: "*.marked"});
								rows[0].components[0].addOptions(marked.map(card => ({label: card.name, description: card.pair !== null && this.players.size > 5 + this.getSetting("imploding") ? `Pair: ${card.pair}` : "", value: `${card.id}${card.pair !== null && this.players.size > 5 + this.getSetting("imploding") ? `.pair:${card.pair},marked` : ".marked"} ${this.cardCounter}`})));
								return Util.update(action, {content: `Specify a card to steal from ${player2.member.displayName}`, components: rows, ephemeral: true});
							} else card2 = player2.grabCard(player2.getCards(`${args[7]}${args[7]?.split(".")[1].length ? "," : "."}marked`)[0] || player2.cards[Math.floor(Math.random()*player2.cards.length)]);
							this.removeCard(player2, card2);
							player2.messages = [`${member.displayName} stole a ${card2.name}`];
							player2.ping = true;
						}

						player.cards.push(card2);
						this.receiveCard(player, card2);
						this.meta.actionHistory.push(Util.parseString(Util.weighted(["$0 used double team on $1! It's super effective!", 2], ["$0 cut $1's purse", 2], "$0 knows the magic of $1's friendship!", "$0 couldn't have used the triple combo instead on $1?", "$0 perfected the shadow ninja arts on $1"), member.displayName, player2.member.displayName));
						break;
					}
					case "3": {
						// args: "combo 3 c1 n c2 n c3 n player c4 n"
						if (cards.length !== 3) return action.reply({content: "You didn't supply exactly 3 cards", ephemeral: true});
						if (new Set(cards.map(card => card.id).filter(id => id !== "fc")).size > 1) return action.reply({content: "Cards must match", ephemeral: true});
						
						/**@type {ExkitPlayer} */
						let player2;
						const comboable = this.players.filter(player3 => player3 !== player && (player3.cards.length || player3.ToP?.cards.length));
						if (!comboable.size) return action.reply({content: "There isn't anyone you can combo!", ephemeral: true});
						else if (comboable.size === 1) args[8] = `<@${comboable.first().member.id}>`;
						if (!args[8]) {
							const rows = [
								new MessageActionRow().addComponents(new MessageSelectMenu()
									.setCustomId(`game ${args.join(" ")}`)
									.setPlaceholder("Choose someone to combo")
									.addOptions(comboable.map(player3 => ({label: player3.member.displayName, description: `${player3.ToP ? "Tower of Power" : `${player3.cards.length} Card${Util.plural(player3.cards.length)}`}`, value: `<@${player3.member.id}>`})))),
								new MessageActionRow().addComponents(new MessageButton().setCustomId("hand 0 true").setLabel("Cancel").setStyle("SECONDARY"))
							];
							if (action.component) rows.unshift(new MessageActionRow().addComponents(action.component));
							return Util.update(action, {content: "Specify a player to steal a card from", components: rows, ephemeral: true});
						}
						const players = this.getPlayers(args[8]);
						if (players.size > 1) return action.reply({content: `Be more specific! \`${args[8]}\` matched multiple players`, ephemeral: true});
						player2 = players.first();
						if (!player2 || player2 === player) return action.reply({content: "Could not find that player", ephemeral: true});
						if (!player2.cards.length && !player2.ToP?.cards.length) return action.reply({content: "They don't have any cards to steal", ephemeral: true});

						/**@type {ExkitCard} */
						let card2;
						if (player2.ToP?.cards.length) card2 = player2.ToP.cards.pop();
						else {
							if (!args[9]) {
								/**@type {import("discord.js").MessageSelectOption[]} */
								const cardlist = [{label: "Attack", value: "at"}, {label: "Beard Cat", value: "bc"}, {label: "Favor", value: "fv"}, {label: "Hairy Potato Cat", value: "pc"},
									{label: "Melon Cat", value: "mc"}, {label: "Nope", value: "no"}, {label: "Rainbow Ralphing Cat", value: "rc"}, {label: "See the Future", value: "sf"},
									{label: "Shuffle", value: "sh"}, {label: "Skip", value: "sp"}, {label: "Taco Cat", value: "tc"}];
								if (this.getSetting("imploding")) cardlist.push({label: "Alter the Future", value: "af"}, {label: "Draw from the Bottom", value: "db"},
									{label: "Feral Cat", value: "fc"}, {label: "Reverse", value: "re"}, {label: "Targeted Attack", value: "ta"});
								if (this.getSetting("streaking")) cardlist.push({label: "Alter the Future **x5**", value: "a5"}, {label: "Catomic Bomb", value: "cb"},
									{label: "Curse of the Cat Butt", value: "cc"}, {label: "Garbage Collection", value: "gc"}, {label: "Mark", value: "mk"}, {label: "See the Future **x5**", value: "s5"},
									{label: "Streaking Kitten", value: "sk"}, {label: "Swap Top and Bottom", value: "sw"});
								if (this.getSetting("barking")) cardlist.push({label: "Alter the Future **Now**", value: "an"}, {label: "Barking Kitten", value: "bk"}, {label: "Bury", value: "br"},
									{label: "I'll Take That", value: "tt"}, {label: "Personal Attack", value: "pa"}, {label: "Potluck", value: "pl"}, {label: "Share the Future", value: "hf"},
									{label: "Tower of Power", value: "tp"});
								if (this.getSetting("streaking") || this.getSetting("barking")) cardlist.push({label: "Super Skip", value: "ss"});
								cardlist.sort((op1, op2) => op1.label > op2.label ? 1 : (op1.label < op2.label ? -1 : 0)).unshift({label: "Defuse", value: "de"});
								const rows = [new MessageActionRow().addComponents(new MessageSelectMenu()
									.setCustomId(`game ${args.join(" ")}`)
									.setPlaceholder(`Choose a card to steal${cardlist.length > 25 ? ` (${cardlist[1].label.slice(0,1)}-${cardlist[24].label.slice(0,1)})` : ""}`)
									.addOptions(cardlist.slice(0,25)))
								];
								if (cardlist.length > 25) rows.push(new MessageActionRow().addComponents(new MessageSelectMenu()
									.setCustomId(`g ${args.join(" ")}`)
									.setPlaceholder(`Choose a card to steal (${cardlist[25].label.slice(0,1)}-Z)`)
									.addOptions(cardlist.slice(25))));
								rows.push(new MessageActionRow().addComponents(new MessageButton().setCustomId("hand 0 true").setLabel("Cancel").setStyle("SECONDARY")));
								return Util.update(action, {content: `Specify a card to steal from ${player2.member.displayName}`, components: rows, ephemeral: true});
							} else card2 = player2.grabCard(player2.getCards(args[9])[0]);
							if (card2) {
								this.removeCard(player2, card2);
								player2.messages = [`${member.displayName} stole a ${card2.name}`];
								player2.ping = true;
							}
						}

						if (card2) {
							player.cards.push(card2);
							this.receiveCard(player, card2);
							this.meta.actionHistory.push(Util.parseString(Util.weighted("$0 used shadow clone against $1 and stole a $2!", "$0 is ~~stealing~~ *permanently borrowing* a $2 from $1", "$0 played blue eyes white dragon against $1, stealing their $2!", "$0 swiped the $2 from under $1's nose!"), member.displayName, player2.member.displayName, card2.name));
						} else {
							player.messages = ["Tough luck! They didn't have that card ¯\\_(ツ)_/¯"];
							this.meta.actionHistory.push(Util.parseString(Util.weighted("$0 tried to use double team against $1 and steal $2! It's not very effective...", "$0 must pay for their crimes against $1 and their lack of $2", "$1 backstabbed $0 who couldn't steal a $2", "$0 and can't count $1's cards, with their sever lack of $2"), member.displayName, player2.member.displayName, `a card they don't have`));
						}
						break;
					}
					case "5": {
						// "combo 5 c1 n c2 n c3 n c4 n c5 n k"
						if (cards.length !== 5) return action.reply({content: "You didn't supply exactly 5 cards", ephemeral: true});
						if (new Set(cards.map(card => card.id)).size !== 5) return action.reply({content: "Each card must be unique", ephemeral: true});
						if (!discardPile.cards.length) return action.reply({content: "There aren't any card to grab!", ephemeral: true});

						if (!args[12]) {
							const rows = [];
							for (let i = 0; i < Math.ceil(discardPile.cards.length/25); i++) {
								rows.push(new MessageActionRow().addComponents(new MessageSelectMenu()
									.setCustomId(`${i} ${args.join(" ")}`)
									.setPlaceholder(`Cards ${i*25+1}${i*25 === discardPile.cards.length ? "" : `-${(i+1)*25}`}`)
									.addOptions(discardPile.cards.slice(i*25, (i+1)*25).map((card, k) => ({label: card.name, description: card.pair !== null && this.players.size > 5 + this.getSetting("imploding") ? `Pair: ${card.pair}` : "", value: `${k+i*25}`})))))
							}
							rows.push(new MessageActionRow().addComponents(new MessageButton().setCustomId("hand 0 true").setLabel("Cancel").setStyle("SECONDARY")));
							return Util.update(action, {content: `Specify a card to take back from the discard pile`, components: rows, ephemeral: true});
						}
						const card2 = discardPile.grabCard(discardPile.cards[args[12]]);
						if (!card2) return action.reply({content: "That card doesn't exist in the discard pile", ephemeral: true});
						player.cards.push(card2);
						this.receiveCard(player, card2);
						this.meta.actionHistory.push(Util.parseString(Util.weighted("$0 rolled a nat 20 and snagged a $1 from the discard pile", "$0 pulled a $1 from their flashback", "$0 found a $1 after reversing at a speed of 88 mph", "$0 wants to play the $1 again!", "$0 pulled a reverse isekai, giving them the superpower of a $1"), member.displayName, card2.name));
						break;
					}
				}

				cards.forEach(card => {
					card.marked = false;
					player.grabCard(card);
				});
				discardPile.cards.unshift(...cards);
				this.updateUI(action);
				this.copy = copy;
				break;
			}
			case "d":
			case "draw": {
				if (this.meta.phase < 2 || player !== this.currentPlayer) return Core.notYet(action);
				if (this.players.some(player2 => player2.cards.some(card => card.exploded))) return action.reply({content: "An Exploding Kitten must be placed back into the draw pile first", ephemeral: true});
				if (this.players.some(player2 => player2.cards.some(card => card.id === "ik"))) return action.reply({content: "The Imploding Kitten must be placed back in the draw pile first", ephemeral: true});
				const discardPile = this.piles.get("discard");
				if (discardPile.cards.some(card2 => card2.needsInput)) return action.reply({content: "A card requires your input first", ephemeral: true});
				if (player.cursed && player.cards.some(card => card.cursed)) return action.reply({content: "You must discard the cursed card first", ephemeral: true});

				this.copy = null;
				const card = this.piles.get("draw").cards.shift();
				player.cursed = false;
				if (player.bullyCard) {
					const bully = player.bullyCard.owner;
					bully.cards.push(card);

					player.messages = [`${bully.member.displayName} stole a ${card.name}`];
					// The only way the tally of ek's vs sk's would become suddenly negative would be if they just drew an ek in this case
					if (bully.cards.reduce((acc, card) => acc + (card.id === "sk" ? 1 : 0) - (card.id === "ek" ? 1 : 0), 0) < 0) {
						this.meta.actionHistory.push(`${bully.member.displayName} stole an Exploding Kitten from ${member.displayName}! ~~idiot~~`);
					} else if (card.id === "ik") {
						this.meta.actionHistory.push(`${bully.member.displayName} stole an Imploding Kitten from ${member.displayName}! ~~idiot~~`);
					} else {
						this.meta.actionHistory.push(`${bully.member.displayName} stole a card from ${member.displayName}`);
						this.nextPlayer();
					}
					this.receiveCard(bully, card);
					bully.ping = true;
					discardPile.cards.unshift(player.bullyCard);
					player.bullyCard = null;
				} else {
					player.cards.push(card);
					// The only way the tally of ek's vs sk's would become suddenly negative would be if they just drew an ek in this case
					if (player.cards.reduce((acc, card) => acc + (card.id === "sk" ? 1 : 0) - (card.id === "ek" ? 1 : 0), 0) < 0) {
						this.meta.actionHistory.push(`${member.displayName} drew an Exploding Kitten!`);
					} else if (card.id === "ik") {
						this.meta.actionHistory.push(`${member.displayName} drew an Imploding Kitten!`);
					} else {
						this.meta.actionHistory.push(`${member.displayName} drew`);
						this.nextPlayer();
					}
					this.receiveCard(player, card);
				}
				this.updateUI(action);
				break;
			}
			default: {
				if (this.meta.phase < 2) return Core.notYet(action);
				let card = player.getCards(args[0])[0];
				const discardPile = this.piles.get("discard");
				const discardNeedsInput = discardPile.cards.find(card2 => card2.needsInput);
				const ekNeedsInput = this.players.some(player2 => player2.cards.some(card2 => card2.exploded));
				const ikNeedsInput = this.players.some(player2 => player2.cards.some(card2 => card2.id === "ik"));
				if (player !== this.currentPlayer && card?.id !== "an" && card?.id !== "no" && !discardNeedsInput && !ekNeedsInput && !ikNeedsInput) return Core.notYet(action);
				if (!card && !discardNeedsInput && !player.cursed) return action.reply({content: `Cannot find card \`${args[0]}\` in your hand`, ephemeral: true});
				// Force players to discard ek's and ik's first
				if (ekNeedsInput && card?.id !== "ek" && (card?.id !== "no" || !this.copy)) return action.reply({content: "An Exploding Kitten must be placed back into the draw pile first", ephemeral: true});
				if (ikNeedsInput && card?.id !== "ik" && (card?.id !== "no" || !this.copy)) return action.reply({content: "The Imploding Kitten must be placed back into the draw pile first", ephemeral: true});
				// Always discard exploded eks first (don't want to accidently discard the one protected by a sk)
				if (card?.id === "ek") card = player.getCards(args[0]).sort((card1, card2) => card2.exploded - card1.exploded)[0];

				let copy = Util.deepClone(this);

				if (player.cursed && !discardNeedsInput) {
					const cursedCard = player.cards.find(card2 => card2.cursed);
					if (!cursedCard && !card.marked) {
						card = player.cards[Math.floor(Math.random()*player.cards.length)];
						const hasPair = card.pair !== null && this.players.size < 5 + (this.getSetting("imploding") ? 1 : 0);
						const props = `${card.marked || hasPair ? " (" : ""}${card.marked ? "marked" : ""}${card.marked && hasPair ? ", " : ""}${hasPair ? `pair: ${card.pair}` : ""}${card.marked || hasPair ? ") " : ""}`;
						card.cursed = true;
						player.messages = [`You discarded a ${card.name}${props.length ? props : " "}`];
						// Overflows into main card logic
					} else if (card !== cursedCard) {
						if (card.id === cursedCard.id) {
							card = cursedCard;
						} else {
							const hasPair = card.pair !== null && this.players.size < 5 + (this.getSetting("imploding") ? 1 : 0);
							const props = `${card.marked || hasPair ? " (" : ""}${card.marked ? "marked" : ""}${card.marked && hasPair ? ", " : ""}${hasPair ? `pair: ${card.pair}` : ""}${card.marked || hasPair ? ") " : ""}`;
							player.messages = [`You must discard a ${card.name}${props.length ? props : " "}next`];
							// Overflows into main card logic
						}
					}
				}

				// TODO: somehow find a way to nope see the future type cards

				const drawPile = this.piles.get("draw");
				if (discardNeedsInput && !ekNeedsInput && !ikNeedsInput && (card?.id !== "no" || args[1] !== "use")) {
					if (player.cursed && !card?.marked) card = player.cards[Math.floor(Math.random()*player.cards.length)];
					if (card?.id === "no" && this.copy && !args[1]) {
						const rows = [new MessageActionRow().addComponents(
								new MessageButton().setCustomId(`game ${args[0]} use`).setLabel("Use Nope").setStyle("PRIMARY"),
								new MessageButton().setCustomId(`game ${args[0]} submit`).setLabel("Submit").setStyle("PRIMARY"),
								new MessageButton().setCustomId("hand 0 true").setLabel("Cancel").setStyle("SECONDARY")
						)];
						if (action.component) rows.unshift(new MessageActionRow().addComponents(action.component));
						return Util.update(action, {content: `Are you using the Nope, or submitting it for the ${discardNeedsInput.name}?`, components: rows, ephemeral: true});
					}
					switch(discardNeedsInput.id) {
						case "fv":
							if (player !== discardNeedsInput.worker) return Core.notYet(action);
							if (player.cursed) {
								this.meta.actionHistory.push(`${member.displayName} blindly fulfilled ${discardNeedsInput.owner.member.displayName}'s favor`);
								player.messages = [`You gave ${discardNeedsInput.owner.member.displayName} a ${card.name}`];
							} else {
								if (!card) return action.reply({content: `Cannot find card \`${args[0]}\` in your hand`, ephemeral: true});
								this.meta.actionHistory.push(Util.parseString(Util.weighted(["$0 worked off $1's favor", 3], "$0 licked $1's boots", "$0 sucked up to $1", "Like a good neighbor, $0 was there for $1"), member.displayName, discardNeedsInput.owner.member.displayName));
							}
							discardNeedsInput.owner.cards.push(player.grabCard(card));
							discardNeedsInput.needsInput = false;
							this.receiveCard(discardNeedsInput.owner, card);
							discardNeedsInput.owner.ping = true;
							this.removeCard(player, card);
							break;
						case "af":
						case "a5":
						case "an":
						case "hf": {
							if ((discardNeedsInput.id === "an" && player !== discardNeedsInput.owner) || (discardNeedsInput.id !== "an" && player !== this.currentPlayer)) return Core.notYet(action);
							const max = Math.min(discardNeedsInput.id === "a5" ? 5 : 3, drawPile.cards.length);
							const order = args.slice(0, max).map(n => Util.clamp(Util.parseInt(n), 0, max-1));
							const comparison = [...new Array(max).keys()];
							if (order.length < max || order.some(n => isNaN(n)) || !order.every(n => {
								// Not within if statement.
								const i = comparison.findIndex(m => m === n);
								if (i < 0) return false;
								comparison.splice(i, 1);
								return true;
							})) return action.reply({content: `Invalid order. (Try something like \`/g ${Util.shuffle([...new Array(max).keys()].map(n => n+1))}\`)`, ephemeral: true});
							const topCards = drawPile.cards.slice(0, max);
							for (let i = 0; i < max; i++) {
								drawPile.cards[i] = topCards[order[i]];
							}
							const cardnames = topCards.map(card2 => `${card2.name}${card2.pair !== null && this.players.size > 5 + this.getSetting("imploding") ? ` (Pair: ${card2.pair})` : ""}`).join(", ");
							player.messages = [`Successfully set the new order: ${cardnames}`];
							if (discardNeedsInput.id === "hf") {
								const player2 = this.players.find(player2 => player2.index === (player.index + (this.clockwise ? 1 : -1) + this.players.size) % this.players.size);
								player2.messages = [`Next 3 cards: ${cardnames}`];
								player2.ping = true;
							}
							discardNeedsInput.needsInput = false;
							break;
						}
						case "gc":
							if (discardNeedsInput.contributors.has(member.id)) return Core.notYet(action);
							if (player.cursed) {
								player.messages = [`You blindly threw a ${card.name} at the garbage heap`];
							} else if (!card) return action.reply({content: `Cannot find card \`${args[0]}\` in your hand`, ephemeral: true});
							drawPile.cards.push(player.grabCard(card));
							this.removeCard(player, card);
							discardNeedsInput.contributors.set(member.id, player);
							if (discardNeedsInput.contributors.size === this.players.size) {
								discardNeedsInput.needsInput = false;
								Util.shuffle(drawPile.cards);
								this.meta.messages = [];
								this.meta.actionHistory.push(`All garbage collected! ${member.displayName} took out their trash. (${this.players.size}/${this.players.size})`);
								break;
							}
							this.meta.messages = [`${member.displayName} took out their trash. (${discardNeedsInput.contributors.size}/${this.players.size})`];
							break;
						case "pl": {
							if (discardNeedsInput.contributors.has(member.id)) return Core.notYet(action);
							if (player.cursed) {
								player.messages = [`You randomly cooked up a ${card.name} for the potluck`];
							} else if (!card) return action.reply({content: `Cannot find card ${args[0]} in your hand`, ephemeral: true});
							player.grabCard(card);
							this.removeCard(player, card);
							discardNeedsInput.contributors.set(member.id, card);
							if (discardNeedsInput.contributors.size === this.players.size) {
								discardNeedsInput.needsInput = false;
								const cards = [...discardNeedsInput.contributors.sort((_, __, id1, id2) => (this.players.get(id1).index - discardNeedsInput.owner.index + this.players.size) % this.players.size - (this.players.get(id2).index - discardNeedsInput.owner.index + this.players.size) % this.players.size).values()];
								drawPile.cards.unshift(...cards.filter(card2 => card2).reverse()); // Removes the undefined values from players with no cards
								this.meta.messages = [];
								this.meta.actionHistory.push(`${member.displayName} joined the fiesta, but now it's over :'( (${this.players.random().member.displayName} gets to wash the dishes)`);
								break;
							}
							this.meta.messages = [`${member.displayName} joined the fiesta! (${this.players.size - discardNeedsInput.contributors.size} left)`];
							break;
						}
						case "br": {
							if (player !== this.currentPlayer) return Core.notYet(action);
							const num = Util.clamp(Util.parseInt(args[0]), 0, drawPile.cards.length);
							if (isNaN(num)) return action.reply({content: `\`${args[0]}\` is not a number`, ephemeral: true});
							drawPile.cards.splice(num, 0, discardNeedsInput.contributors.get(member.id));
							discardNeedsInput.needsInput = false;
							this.nextPlayer();
							break;
						}
						default:
							return Util.UnknownInteraction(action);
					}
					this.copy = null;
					this.updateUI(action);
					return;
				}
				
				switch(card.id) {
					case "ek": {
						if (!card.exploded) { // If the player discards an unexploded ek of their own volition (possible through streaking kitten)
							card.exploded = true;
							this.receiveCard(player, card);
						}
						if (!this.players.has(member.id)) break; // Player died

						if (!args[1] || args[1] === "page") {
							const rows = [];
							if (!args[1]) {
								rows.push(new MessageActionRow().addComponents(new MessageSelectMenu().setCustomId(`game ${args[0]}`).setPlaceholder("Place this back into the draw pile").addOptions({label: "Top", description: "Violence", value: "0"})));
								if (drawPile.cards.length) {
									rows[0].components[0].addOptions(
										{label: "Bottom", description: "Pacifist Route", value: `${drawPile.cards.length}`},
										{label: "Random", description: "Not even you will know where it'll be", value: `${Math.floor(Math.random()*(drawPile.cards.length+1))} foo`}
									);
								}
								for (let i = 1; i <= Math.min(11, drawPile.cards.length); i++) {
									rows[0].components[0].addOptions({label: `${i} card${Util.plural(i)} from the top`, value: `${i}`});
								}
								for (let i = Math.max(12, drawPile.cards.length-11); i < drawPile.cards.length; i++) {
									rows[0].components[0].addOptions({label: `${i} cards from the top`, value: `${i}`});
								}
							} else {
								const page = Util.clamp(Util.parseInt(args[2]), 0, Math.floor(drawPile.cards.length/25)) || 0;
								rows.push(new MessageActionRow().addComponents(new MessageSelectMenu()
									.setCustomId(`gpage ${args[0]}`)
									.setPlaceholder("Place this back into the draw pile")
									.addOptions([...new Array(Math.min(25, drawPile.cards.length - 25*page + 1)).keys()].map(n => {
										const k = n + page * 25;
										return {label: `${k} card${Util.plural(k)} from the top`, value: `${k}`};
									})))
								);
							}
							if (drawPile.cards.length > 24) {
								rows.push(new MessageActionRow());
								for (let i = 0; i <= Math.floor(drawPile.cards.length/25); i++) {
									rows[1].addComponents(new MessageButton().setCustomId(`game ${args[0]} page ${i}`).setLabel(`View ${i*25}${i*25 === drawPile.cards.length ? "" : `-${i*25 + Math.min(24, drawPile.cards.length - i*25)}` }`).setStyle("SECONDARY"));
								}
							}
							if (args[1] === "page") rows.push(new MessageActionRow().addComponents(new MessageButton().setCustomId(`g ${args[0]}`).setLabel("Back").setStyle("SECONDARY")));
							if (action.component) rows.unshift(new MessageActionRow().addComponents(action.component));
							return Util.update(action, {content: `Place the Exploding Kitten back into the draw pile${drawPile.cards.length > 24 ? ".\nIf needed, use a button to view a different section of 25 cards at a time" : ""}`, components: rows, ephemeral: true});
						}

						const num = Util.clamp(Util.parseInt(args[1]), 0, drawPile.cards.length);
						if (isNaN(num)) return action.reply({content: `${args[1]} is not a number`, ephemeral: true});
						card.exploded = false;
						drawPile.cards.splice(num, 0, player.grabCard(card));
						this.meta.actionHistory.push(Util.parseString(Util.weighted(["$0 is plotting their revenge...", 2], "$0 committed arson", "$0 writes down names in a Death Note...", "$0: 'Bomb has been planted.'", "$0: 'お前は、もう死んでる'", "$0's eyes gleam with muderous intent"), member.displayName));
						this.nextPlayer();
						copy = null;
						break;
					}
					case "no": {
						const card2 = discardPile.cards.find(card2 => card2.id !== "no");
						if (!card2) {
							if (card.cursed) break;
							return action.reply({content: "Can't nope a card which doesn't exist!", ephemeral: true});
						}
						if (!this.copy) {
							if (card.cursed) break;
							return action.reply({content: "That card can't be noped anymore", ephemeral: true});
						}
						const yupped = discardPile.cards.findIndex(card3 => card3.id !== "no") % 2 === 1;
						const ownerInCopyWorld = this.copy.players.find(player2 => player2.member.id === discardPile.cards[0].owner?.member.id) || this.copy.currentPlayer; // Player who played the card being noped
						ownerInCopyWorld.messages = [];
						const playerInCopyWorld = this.copy.players.get(member.id);
						const prevCards = discardPile.cards.slice(0, discardPile.cards.length - this.copy.piles.get("discard").cards.length).map(card3 => ownerInCopyWorld.cards.splice(ownerInCopyWorld.cards.findIndex(card4 => card3.isEqual(card4) && card3.pair === card4.pair), 1)[0]);
						card = playerInCopyWorld.cards.find(card3 => card.isEqual(card3));
						card.owner = playerInCopyWorld;

						/*
						if (this.meta.traits.message) { // If the card being noped needs information to be redacted (such as a see the future)
							[this.meta.traits.message[0].embeds[0].description, this.meta.traits.message[1]] = [this.meta.traits.message[1], this.meta.traits.message[0].embeds[0].description];
							this.meta.traits.copy.meta.traits.message = this.meta.traits.message;
							this.meta.traits.message[0].edit(this.meta.traits.message[0].content, this.meta.traits.message[0].embeds[0]);
						}
						*/

						this.piles = this.copy.piles;
						this.players = this.copy.players;
						this.currentPlayer = ownerInCopyWorld;
						this.extraTurns = this.copy.extraTurns;
						this.clockwise = this.copy.clockwise;
						this.copy = this.copy.copy;

						this.piles.get("discard").cards.unshift(...prevCards.reverse());
						this.meta.actionHistory.push(Util.parseString(Util.weighted([`$0 ${yupped ? "yupped" : "noped"} the $1!`, 3], `$0 denied the $1's ${yupped ? "non" : ""}existence`, `$0 ${yupped ? "loves" : "hates"} it when the $1. bottom text`, `$0 pulled a ${new Array(discardPile.cards.findIndex(card3 => card3.id !== "no")+1).fill("no").join(" ")} you`, "$0 called in the nope-alope"), member.displayName, card2.name));
						break;
					}
					case "at":
						this.extraTurns += this.extraTurns ? 3 : 2; // These get subtracted by 1 when the next player is forced.
						this.nextPlayer(true);
						this.meta.actionHistory.push(Util.parseString(Util.weighted([`$0 attacked $1!`, 7], [`$0 mugged $1!`, 4], [`$0 vibechecked $1!`, 2], `$0 4-stocked $1`), member.displayName, this.currentPlayer.member.displayName));
						break;
					case "sp":
						this.nextPlayer();
						this.meta.actionHistory.push(Util.parseString(Util.weighted(["$0 ran away!", 2], "$0 retreated", "$0 chickened out", "$0 is speed", "$0 thought the next card was actually an exploding kitten", "$0 hates being fun"), member.displayName));
						break;
					case "fv": {
						/**@type {ExkitPlayer} */
						let player2;
						const favorable = this.players.filter(player3 => player3 !== player && (player3.cards.length || player3.ToP?.cards.length));
						if (!favorable.size) {
							if (card.cursed) break;
							return action.reply({content: "There isn't anyone you can call a favor on!", ephemeral: true});
						} else if (favorable.size === 1) args[1] = `<@${favorable.first().member.id}>`;
						if (!args[1]) {
							const rows = [
								new MessageActionRow().addComponents(new MessageSelectMenu()
									.setCustomId(`game ${args[0]}`)
									.setPlaceholder("Choose someone to call a favor on")
									.addOptions(favorable.map(player3 => ({label: player3.member.displayName, description: `${player3.ToP ? "Tower of Power" : `${player3.cards.length} Card${Util.plural(player3.cards.length)}`}${player3.cursed ? "・Cursed" : ""}`, value: `<@${player3.member.id}>`})))),
								new MessageActionRow().addComponents(new MessageButton().setCustomId("hand 0 true").setLabel("Cancel").setStyle("SECONDARY"))
							];
							if (action.component) rows.unshift(new MessageActionRow().addComponents(action.component));
							return Util.update(action, {content: "Specify a player to call a favor on", components: rows, ephemeral: true});
						}

						const players = this.getPlayers(args[1]);
						if (players.size > 1) return action.reply({content: `Be more specific! \`${args[1]}\` matched multiple players`, ephemeral: true});
						player2 = players.first();
						if (!player2 || player2 === player) return action.reply({content: "Could not find that player", ephemeral: true});
						if (!player2.cards.length && (!player2.ToP || !player2.ToP.cards.length)) return action.reply({content: "They don't have any favors to give", ephemeral: true});
						
						if (player2.ToP?.cards.length) {
							const card2 = player2.ToP.cards.pop();
							player.cards.push(card2);
							this.meta.actionHistory.push(Util.parseString(Util.weighted(["$0 hates $1", 3], ["$0 forgot about $1's magnificent tower", 2], "$0 killed $1, but they were in the *living* room", "$0 merely inconvenienced $1", "It's illegal for $0 to steal from $1 if they say 'no'"), member.displayName, player2.member.displayName));
							this.receiveCard(player, card2);
							break;
						} else if (player2.cursed && !player2.cards.some(card2 => card2.marked)) {
							const card2 = player2.cards[Math.floor(Math.random()*player2.cards.length)];
							player.cards.push(player2.grabCard(card2));
							player2.messages = [`You blindly gave ${member.displayName} a ${card2.name}`];
							player2.ping = true;
							this.meta.actionHistory.push(Util.parseString(Util.weighted("$0 is stealing candy from a baby ($1)", "$0 robs $1 blind"), member.displayName, player2.member.displayName));
							this.receiveCard(player, card2);
							this.removeCard(player2, card2);
							player2.ping = true;
							break;
						}
						card.needsInput = true;
						card.worker = player2;
						player2.messages = [`Give a card to ${member.displayName}.${player2.cursed ? " (You can voluntarily choose a marked card. Otherwise, selecting anything else will make it random.)" : ""}`];
						player2.ping = true;
						this.meta.actionHistory.push(Util.parseString(Util.weighted(["$0 hates $1", 3], ["$0 now owns $1's soul", 2], "$1 forgot one teensy-weeny, but ever so crucial, little, tiny detail. **$0 OWNS THEM**", "$0 asks a favor of $1 ( ͡° ͜ʖ ͡°)"), member.displayName, player2.member.displayName));
						break;
					}
					case "sh":
						Util.shuffle(drawPile.cards);
						this.meta.actionHistory.push(Util.parseString(Util.weighted(Util.shuffle(["$0", "has", "shuffled", "the", "cards"]).join(" "), "$0 tried changing their fate", "$0 was shuffled", "$0 created a never-before-seen arrangement of cards"), member.displayName));
						break;
					case "sf": {
						player.messages = [`**Next 3 Cards:**\n${drawPile.cards.slice(0,3).map((card2, i) => `${i+1}. ${card2.name}`).join("\n")}`];
						this.meta.actionHistory.push(Util.parseString(Util.weighted("$0 became a prophet", "$0 saw 14,000,605 universes", "$0 sniffed some glue", "$0 paid a pyschic ￥1337"), member.displayName));
						break;
					}
					case "ik": {
						if (!args[1] || args[1] === "page") {
							const rows = [];
							if (!args[1]) {
								rows.push(new MessageActionRow().addComponents(new MessageSelectMenu().setCustomId(`game ${args[0]}`).setPlaceholder("Place this back into the draw pile").addOptions({label: "Top", description: "Brutality", value: "0"})));
								if (drawPile.cards.length) {
									rows[0].components[0].addOptions(
										{label: "Bottom", description: "Anxiety Route", value: `${drawPile.cards.length}`},
										{label: "Random", description: "Not even your mom will know where it'll be", value: `${Math.floor(Math.random()*(drawPile.cards.length+1))} `}
									);
								}
								for (let i = 1; i <= Math.min(11, drawPile.cards.length); i++) {
									rows[0].components[0].addOptions({label: `${i} card${Util.plural(i)} from the top`, value: `${i}`});
								}
								for (let i = Math.max(12, drawPile.cards.length-11); i < drawPile.cards.length; i++) {
									rows[0].components[0].addOptions({label: `${i} cards from the top`, value: `${i}`});
								}
							} else {
								const page = Util.clamp(Util.parseInt(args[2]), 0, Math.floor(drawPile.cards.length/25)) || 0;
								rows.push(new MessageActionRow().addComponents(new MessageSelectMenu()
									.setCustomId(`game ${args[0]}`)
									.setPlaceholder("Place this back into the draw pile")
									.addOptions([...new Array(Math.min(25, drawPile.cards.length - 25*page + 1)).keys()].map(n => {
										const k = n + page * 25;
										return {label: `${k} card${Util.plural(k)} from the top`, value: `${k}`};
									})))
								);
							}
							if (drawPile.cards.length > 24) {
								rows.push(new MessageActionRow());
								for (let i = 0; i <= Math.floor(drawPile.cards.length/25); i++) {
									rows[1].addComponents(new MessageButton().setCustomId(`game ${args[0]} page ${i}`).setLabel(`View ${i*25}${i*25 === drawPile.cards.length ? "" : `-${i*25 + Math.min(24, drawPile.cards.length - i*25)}` }`).setStyle("SECONDARY"));
								}
							}
							if (args[1] === "page") rows.push(new MessageActionRow().addComponents(new MessageButton().setCustomId(`g ${args[0]}`).setLabel("Back").setStyle("SECONDARY")));
							if (action.component) rows.unshift(new MessageActionRow().addComponents(action.component));
							return Util.update(action, {content: `Place the Imploding Kitten back into the draw pile${drawPile.cards.length > 24 ? ".\nIf needed, use a button to view a different section of 25 cards at a time" : ""}`, components: rows, ephemeral: true});
						}

						const num = Util.clamp(Util.parseInt(args[1]), 0, drawPile.cards.length);
						if (isNaN(num)) return action.reply({content: `${args[1]} is not a number`, ephemeral: true});
						drawPile.cards.splice(num, 0, player.grabCard(card));
						this.meta.actionHistory.push(Util.parseString(Util.weighted(["$0 saw their doom", 5], ["$0 saw death itself", 3], "$0 witnessed ***true*** power", ["$0 turned deathly pale", 3], "$0 is inevitable", "$0 gazed into the abyss. And it gazed back"), member.displayName));
						this.nextPlayer();
						copy = null;
						break;
					}
					case "re":
						this.clockwise = !this.clockwise;
						this.meta.actionHistory.push(Util.parseString(Util.weighted("$0 spins right 'round, baby", "$0: 'no u'", ["$0 turned the tables!", 3], "!noitautis eht desrever $0"), member.displayName));
						this.nextPlayer();
						break;
					case "db": {
						const card2 = drawPile.cards.pop();
						card.owner = player;
						discardPile.cards.unshift(player.grabCard(card));
						if (player.cursed) player.cursed = false;
						if (player.bullyCard) {
							const bully = player.bullyCard.owner;
							bully.cards.push(card2);
							player.cursed = false;
							player.messages = [`${bully.member.displayName} stole a ${card2.name}`];
							// The only way the tally of ek's vs sk's would become suddenly negative would be if they just drew an ek in this case
							if (bully.cards.reduce((acc, card3) => acc + (card3.id === "sk") - (card3.id === "ek"), 0) < 0) {
								this.meta.actionHistory.push(`${bully.member.displayName} stole an Exploding Kitten from ${member.displayName}! ~~idiot~~`);
							} else if (card2.id === "ik") {
								this.meta.actionHistory.push(`${bully.member.displayName} stole an Imploding Kitten from ${member.displayName}! ~~idiot~~`);
							} else {
								this.meta.actionHistory.push(Util.parseString(Util.weighted("$1 flanked $0", "$1 is secretly a sub for $0", "$1 thinks they're ExTrA qUiRkY by stealing the bottom card from $0"), member.displayName, bully.member.displayName));
								this.nextPlayer();
							}
							bully.ping = true;
							player.bullyCard = null;
							this.receiveCard(bully, card2);
						} else {
							player.cards.push(card2);
							// The only way the tally of ek's vs sk's would become suddenly negative would be if they just drew an ek in this case
							if (player.cards.reduce((acc, card3) => acc + (card3.id === "sk") - (card3.id === "ek"), 0) < 0) {
								this.meta.actionHistory.push(Util.parseString(Util.weighted("$0's luck bottomed out, and drew an Exploding Kitten!", "$0 hit rock bottom with an Exploding Kitten!"), member.displayName));
							} else if (card2.id === "ik") {
								this.meta.actionHistory.push(Util.parseString(Util.weighted("$0 drew an Imploding Kitten and now hates themself", "$0 thought the bottom was safe, but drew an Imploding Kitten instead"), member.displayName));
							} else {
								this.meta.actionHistory.push(Util.parseString(Util.weighted(["$0 flanked the opposition", 2], "$0 is secretly a sub", "$0 thinks they're quirky by not drawing the top card"), member.displayName));
								this.nextPlayer();
							}
							this.receiveCard(player, card2);
						}
						break;
					}
					case "af": {
						const cards = drawPile.cards.slice(0,3);
						const n = cards.length; // If the draw pile has less than 3 cards
						player.messages = [`**Next ${n} Cards:**\n${cards.map((card2, i) => `${i+1}. ${card2.name}`).join("\n")}`, "Choose a new top card"];
						card.needsInput = true;
						this.meta.actionHistory.push(Util.parseString(Util.weighted("$0 found the TARDIS", "$0 altered the course of history", "$0 made irreparable damages to the timeline", "$0 killed Santa Claus"), member.displayName));
						break;
					}
					case "ta": {
						/**@type {ExkitPlayer} */
						let player2;
						if (this.players.size === 2) args[1] = `<@${this.players.find(player3 => player3 !== player).member.id}>`;
						if (!args[1]) {
							const rows = [
								new MessageActionRow().addComponents(new MessageSelectMenu()
									.setCustomId(`game ${args[0]}`)
									.setPlaceholder("Choose someone to attack")
									.addOptions(this.players.filter(player3 => player3 !== player).map(player3 => ({label: player3.member.displayName, description: `${player3.cards.length} Card${Util.plural(player3.cards.length)}${player3.cursed ? "・Cursed" : ""}`, value: `<@${player3.member.id}>`})))),
								new MessageActionRow().addComponents(new MessageButton().setCustomId("hand 0 true").setLabel("Cancel").setStyle("SECONDARY"))
							];
							if (action.component) rows.unshift(new MessageActionRow().addComponents(action.component));
							return Util.update(action, {content: "Specify a player to attack", components: rows, ephemeral: true});
						}

						const players = this.getPlayers(args[1]);
						if (players.size > 1) return action.reply({content: `Be more specific! \`${args[1]}\` matched multiple players`, ephemeral: true});
						player2 = players.first();
						if (!player2 || player2 === player) return action.reply({content: "Could not find that player", ephemeral: true});

						this.currentPlayer = player2;
						this.extraTurns += this.extraTurns ? 2 : 1;
						this.meta.actionHistory.push(Util.parseString(Util.weighted([`$0 targeted $1!`, 5], [`$0 jumped $1!`, 4], [`$0 assassinated $1!`, 2], `$0 is now convicted of manslaughtering $1`), member.displayName, this.currentPlayer.member.displayName));
						break;
					}
					case "sk":
						this.meta.actionHistory.push(Util.parseString(Util.weighted(["$0 just realized their mistake", 4], ["$0 is now regretting their life choices", 4], ["$0: 'oops'", 2], "$0 is a smooth-brained cretin"), member.displayName));
						break;
					case "ss":
						this.extraTurns = 0;
						this.nextPlayer();
						this.meta.actionHistory.push(Util.parseString(Util.weighted("$0 just got a new record for speedrunning life", "$0: ザ・ワールド!", "$0: 'I am already 4 parallel universes ahead of you'", "$0 apparently doesn't like this game"), member.displayName));
						break;
					case "s5": {
						player.messages = [`**Next 5 Cards:**\n${drawPile.cards.slice(0,5).map((card2, i) => `${i+1}. ${card2.name}`).join("\n")}`];
						this.meta.actionHistory.push(Util.parseString(Util.weighted("$0 became a seer", "$0 saw 6 trillion and 1 universes", "$0 sniffed some flex-glue", "$0 isn't cheating, they just have a gaming chair"), member.displayName));
						break;
					}
					case "a5": {
						const cards = drawPile.cards.slice(0,5);
						const n = cards.length; // If the draw pile has less than 5 cards
						player.messages = [`**Next ${n} Cards:**\n${cards.map((card2, i) => `${i+1}. ${card2.name}`).join("\n")}`, `Choose a new top card`];
						card.needsInput = true;
						this.meta.actionHistory.push(Util.parseString(Util.weighted("$0 cast Clairvoyance!", "$0 cheated", "$0 messed with wibbly-wobbly, timey-wimey, spacey-wacey... stuff.", "$0 ripped a hole in the fabric of the universe", "$0: 'This is the Monado's power!'"), member.displayName));
						break;
					}
					case "sw":
						[drawPile.cards[0], drawPile.cards[drawPile.cards.length-1]] = [drawPile.cards[drawPile.cards.length-1], drawPile.cards[0]];
						this.meta.actionHistory.push(Util.parseString(Util.weighted("$0 reversed gravity", "$0 could've used a draw from the bottom card", "$0 has an arm where their leg should be", "$0 lost half an eyebrow"), member.displayName));
						break;
					case "gc":
						card.contributors = this.players.filter(player2 => !player2.cards.length && (!player2.ToP || !player.ToP.cards.length)); // add players who don't have cards in hand nor tower of power
						this.players.forEach(player2 => {
							if (player2.ToP?.cards.length) {
								card.contributors.set(player2.member.id, player2);
								drawPile.cards.push(player2.ToP.cards.pop());
							}
						});
						if (card.contributors.size === this.players.size) {
							Util.shuffle(drawPile.cards);
							this.meta.actionHistory.push(Util.parseString(Util.weighted("$0 is on a quest to find every possible quote", "$0 actually recycles their garbage, smh", "$0 has been reduced, reused, and recycled", "$0 taught their racoon to eat recycling instead"), member.displayName));
							break;
						}
						card.needsInput = true;
						this.meta.actionHistory.push(Util.parseString(Util.weighted("$0 is the trash man", "$0 is taking out the trash", "$0's mom said they need to do their chores", "$0 is utter garbage", "$0 has a pet trash panda"), member.displayName));
						this.meta.messages = [`Everyone, give any card to the garbage heap!${this.players.some(player2 => player2.cursed) ? "\n(If you're cursed, choosing any card will randomly select one for you)" : ""}`];
						break;
					case "cb": {
						const eks = [];
						for (let card2 of drawPile.cards) {
							if (card2.id === "ek") eks.push(drawPile.grabCard(card2));
						}
						drawPile.cards.unshift(...eks);
						this.meta.actionHistory.push(Util.parseString(Util.weighted(["$0 has doomed us all", 3], "$0 cut the cheese", "$0: ***'TACTICAL NUKE: INCOMING'***", "$0 has brought balance, as all things should be"), member.displayName));
						this.nextPlayer();
						break;
					}
					case "mk": {
						/**@type {ExkitPlayer} */
						let player2;
						const markable = this.players.filter(player3 => player3 !== player && player3.cards.some(card2 => !card2.marked));
						if (!markable.size) {
							if (card.cursed) break;
							return action.reply({content: "There isn't anyone you can pee on!", ephemeral: true});
						}
						else if (markable.size === 1) args[1] = `<@${markable.first().member.id}>`;
						if (!args[1]) {
							const rows = [
								new MessageActionRow().addComponents(new MessageSelectMenu()
									.setCustomId(`game ${args[0]}`)
									.setPlaceholder(Util.weighted(["Choose someone to mark", 99], ":warning: Group pissing starts in 10 minutes! :warning:"))
									.addOptions(markable.map(player3 => ({label: player3.member.displayName, description: `${player3.cards.length} Card${Util.plural(player3.cards.length)}${player3.cursed ? "・Cursed" : ""}`, value: `<@${player3.member.id}>`})))),
								new MessageActionRow().addComponents(new MessageButton().setCustomId("hand 0 true").setLabel("Cancel").setStyle("SECONDARY"))
							];
							if (action.component) rows.unshift(new MessageActionRow().addComponents(action.component));
							return Util.update(action, {content: "Specify a player to mark a card from their hand", components: rows, ephemeral: true});
						}

						const players = this.getPlayers(args[1]);
						if (players.size > 1) return action.reply({content: `Be more specific! \`${args[1]}\` matched multiple players`, ephemeral: true});
						player2 = players.first();
						if (!player2 || player2 === player) return action.reply({content: "Could not find that player", ephemeral: true});

						const cards = player2.cards.filter(card2 => !card2.marked);
						if (!cards.length) return action.reply({content: "They don't have any cards to pee on", ephemeral: true});
						cards[Math.floor(Math.random()*cards.length)].marked = true;
						this.meta.actionHistory.push(Util.parseString(Util.weighted(`$0 peed on ${player2.member.displayName}'s cards`, "$0 is disgusting", "$0 has no public decency", "$0 isn't potty trained", "$0?! Bad Kitty!"), member.displayName));
						break;
					}
					case "cc": {
						/**@type {ExkitPlayer} */
						let player2;
						const cursable = this.players.filter(player3 => player3 !== player && !player3.cursed);
						if (!cursable.size) {
							if (card.cursed) break;
							return action.reply({content: "There isn't anyone you can curse!", ephemeral: true});
						}
						else if (cursable.size === 1) args[1] = `<@${cursable.first().member.id}>`;
						if (!args[1]) {
							const rows = [
								new MessageActionRow().addComponents(new MessageSelectMenu()
									.setCustomId(`game ${args[0]}`)
									.setPlaceholder("Choose someone to curse")
									.addOptions(cursable.map(player3 => ({label: player3.member.displayName, description: `${player3.cards.length} Card${Util.plural(player3.cards.length)}`, value: `<@${player3.member.id}>`})))),
								new MessageActionRow().addComponents(new MessageButton().setCustomId("hand 0 true").setLabel("Cancel").setStyle("SECONDARY"))
							];
							if (action.component) rows.unshift(new MessageActionRow().addComponents(action.component));
							return Util.update(action, {content: "Specify a player to curse", components: rows, ephemeral: true});
						}

						const players = this.getPlayers(args[1]);
						if (players.size > 1) return action.reply({content: `Be more specific! \`${args[1]}\` matched multiple players`, ephemeral: true});
						player2 = players.first();
						if (!player2 || player2 === player) return action.reply({content: "Could not find that player", ephemeral: true});

						player2.cursed = true;
						player2.messages = ["You've been cursed! Choosing any card will force you to discard a random one instead! (However, you *can* discard marked cards voluntarily)"];
						player2.ping = true;
						this.meta.actionHistory.push(Util.parseString(Util.weighted(["$0 bewitched $1 with a terrible curse!", 3], "$0 stabbed $1's eyes out!", "$1 was caught staring... :flushed:", "$1 looked at the sun for too long"), member.displayName, player2.member.displayName));
						break;
					}
					case "bk": {
						let player2 = this.players.find(player2 => player2.cards.some(card2 => card2.id === "bk" && card2 !== card && card2.pair === card.pair) || card.pair === player2.barkingCard?.pair);
						if (player === player2) {
							if (this.players.size === 2) args[1] = `<@${this.players.find(player3 => player3 !== player).member.id}>`;
							if (!args[1]) {
								const rows = [
									new MessageActionRow().addComponents(new MessageSelectMenu()
										.setCustomId(`game ${args[0]}`)
										.setPlaceholder("Choose someone to explode")
										.addOptions(this.players.filter(player3 => player3 !== player).map(player3 => ({label: player3.member.displayName, description: `${player3.cards.length} Card${Util.plural(player3.cards.length)}${player3.cursed ? "・Cursed" : ""}`, value: `<@${player3.member.id}>`})))),
									new MessageActionRow().addComponents(new MessageButton().setCustomId("hand 0 true").setLabel("Cancel").setStyle("SECONDARY"))
								];
								if (action.component) rows.unshift(new MessageActionRow().addComponents(action.component));
								return Util.update(action, {content: "Specify a player to explode", components: rows, ephemeral: true});
							}

							const players = this.getPlayers(args[1]);
							if (players.size > 1) return action.reply({content: `Be more specific! \`${args[1]}\` matched multiple players`, ephemeral: true});
							player2 = players.first();
							if (!player2 || player2 === player) return action.reply({content: "Could not find that player", ephemeral: true});

							discardPile.cards.unshift(player.barkingCard || player.cards.splice(player.cards.findIndex(card2 => card2.id === "bk" && card2 !== card && card2.pair === card.pair),1)[0]);
						}

						// Player discarded at correct time
						if (player2) {
							card.worker = player2;
							if (player2.barkingCard) {
								discardPile.cards.unshift(player2.barkingCard);
								player2.barkingCard = null;
							} else {
								const card2 = player2.cards.find(card2 => card2.id === "bk" && card2.pair === card.pair); // The only time it would be undefined is if player discarded both bks (and got to choose who to explode)
								if (card2) discardPile.cards.unshift(player2.grabCard(card2));
							}

							const saves = player2.cards.filter(card => card.id === "de").length;
							if (saves < 1) {
								this.meta.actionHistory.push(Util.parseString(`**${Util.weighted("$0 cast Avada Kedavra on $1!", "$1 activated $0's death trap!", "$1 was murdered in cold blood by $0", "$0 ︻╦╤─ $1", "$0 ended $1's reign of terror", "$1 was killed by [$0]", "$0 won the dogfight against $1", "$0 cast a 9th level fireball on $1", "$1 was doomed to die by $0", "$1 never saw it coming", "$0 did that anime sword trick on $1", "$0 assassinated $1")}**`, member.displayName, player2.member.displayName));
								this.removePlayer(player2); // conveniently also moves on to the next player
								break;
							}

							let bombs = 1; // Only used if player2 is cursed and accidently discards another ek
							for (let i = 0; i < bombs; i++) {
								if (player2.cursed) {
									/**@type {ExkitCard[]} */
									let cards;
									do {
										cards.unshift(player2.cards.splice(Math.floor(Math.random()*player2.cards.length), 1));
										discardPile.cards.unshift(cards[0]);
										this.removeCard(player2, cards[0]);
										if (cards[0].id === "ek" && saves < ++bombs) {
											this.meta.actionHistory.push(Util.parseString(`**${Util.weighted(["$1 was killed by $0... twice!", 2], "$1 just learned the meaning of $0's fury", "$1 didn't realize there was a second bomb from $0", "$1 just couldn't handle $0's onslaught", "$0 commited war crimes on $1", "$1 was double whammied by $0")}**`, member.displayName, player2.member.displayName));
											this.removePlayer(player2);
											break;
										}
									} while(cards[0].id !== "de");
									if (!this.players.has(player2.member.id)) break; // player2 died
									player2.ping = true;
									this.meta.actionHistory.push(`${player2.member.displayName} blindly threw a ${Util.plural(cards.length, cards[0].name, cards.reduce((acc, card2, i) => `${acc}${i === cards.length-2 ? `${card2.name}, ` : `${card2.name}, and a ` }`.slice(0,-2), ""))} at the Exploding Kitten to solve their problems`);
								} else {
									discardPile.cards.unshift(player2.cards.splice(player2.cards.findIndex(card2 => card2.id === "de"), 1)[0]);
								}
							}
							if (!this.players.has(player2.member.id)) break; // player2 died
							for (let i = 0; i < bombs; i++) {
								player2.cards.find(card2 => card2.id === "ek" && !card2.exploded).exploded = true;
							}
							const msgs = bombs > 1 ? ["$1 survived a multi-assassination attempt by $0!", "$0 couldn't throw off $1's groove", "$1 survived $0's execution!"] : [["$1 survived $0's blast!", 2], "$0 can't stop $1's roll!", "$0: 0, $1: 1", "$1 stopped $0's villainous crimes!", "$0 vs. $1: Archenemies", "$0 failed to assassinate $1!"];
							this.meta.actionHistory.push(Util.parseString(`**${Util.weighted(...msgs)}**`, member.displayName, player2.member.displayName));
							break;
						}

						// Player discarded too early
						player.barkingCard = card;
						player.grabCard(card);
						this.meta.actionHistory.push(Util.parseString(Util.weighted("$0 jebaited themself", "geeettttttt dunked on, $0!!!", "$0 made a 200 IQ wrinkly brain move", "$0 tripped over their untied socks and sandles"), member.displayName));
						break;
					}
					case "an": {
						const cards = drawPile.cards.slice(0,3);
						const n = cards.length; // If the draw pile has less than 3 cards
						player.messages = [`**Next ${n} Cards:**\n${cards.map((card2, i) => `${i+1}. ${card2.name}`).join("\n")}`, `Choose a new top card`];
						card.needsInput = true;
						this.meta.actionHistory.push(Util.parseString(Util.weighted("$0 is too impatient", "$0 needs to take a bathroom break", "$0 is breaking all the laws of time-travel", "$0 can't wait for their turn", "$0 bought a fast pass"), member.displayName));
						break;
					}
					case "br": {
						if (player.bullyCard) {
							if (card.cursed) break;
							return action.reply({content: "You can't bury a card while being bullied", ephemeral: true}); // because they're the nerd, and someone's bullying them with an "I'll Take That"
						}
						const card2 = drawPile.cards.shift();
						card.contributors.set(member.id, card2);
						card.needsInput = true;
						player.messages = [`Place the ${card2.name}${card.pair !== null && this.players.size > 5 + this.getSetting("imploding") ? ` (Pair: ${card.pair})` : ""} back into the draw pile${drawPile.cards.length > 24 ? ".\nIf needed, use a button to view a different section of 25 cards at a time" : ""}`];
						this.meta.actionHistory.push(Util.parseString(Util.weighted(["$0 digs this card", 3], "$0 has to hide the bod-- err... *evidence*", "$0 wishes to be exactly like Heathcliff", "$0 swears this shovel is just slightly shorter than the other ones"), member.displayName));
						break;
					}
					case "pa":
						this.extraTurns += this.extraTurns ? 3 : 2;
						this.meta.actionHistory.push(Util.parseString(Util.weighted(["$0 hurt themself in their confusion!", 2], `$0 mugged $0!`, "$0, why are you slapping yourself?", "$0 just wants to end the game sooner", "$0 has a death wish"), member.displayName));
						break;
					case "pl": {
						card.contributors = new Collection(this.players.filter(player2 => !player2.cards.length || player2.ToP?.cards.length).map(player2 => [player2.member.id, player2.ToP?.cards.pop()])); // value is undefined for those with no cards, or no cards within their tower
						if (card.contributors.size === this.players.size) {
							this.meta.actionHistory.push(Util.parseString(Util.weighted("$0 ate too much", "$0 might vomit...", "$0 is brought to you by the letter 'Diabetes'", "$0 solved world hunger", "$0 loves to find easter eggs"), member.displayName));
							break;
						}
						card.needsInput = true;
						this.meta.messages = ["Everyone, provide a card for the potluck!"];
						this.meta.actionHistory.push(Util.parseString(Util.weighted([Util.parseString("$0 is hungry for some $1food", "$0", Util.weighted("Mexican ", "Chinese ", "Japanese ", "Asian ", "Thai ", "Indian ", "Italian ", "Greek ", "fast ", "French ", "German ", "Mediterranean ", "Russian ", "Swedish ", "vegan ", "Danish ", "Antarctic ", "Filipino ", "Latvian ", "Polynesian ", "Australian ", "Brazilian ", "Canadian ", "fine-dining ", "barbeque ", "tapas ", "Mom's homemade ", "cat", "Syrian ", "African ", "Middle-Eastern ", "Jewish ", "Medieval", "sea", "Indonesian ", "British ")), 36], "$0 likes Thanksgiving a bit too much...", "$0 is brought to you by the letter 'Cookie'", "$0 ordered two number 9s, a number 9 large, a number 6 with extra dip, a number 7, two number 45s, one with cheese, and a large soda", "$0 has never heard of a diet before"), member.displayName));
						break;
					}
					case "tp":
						this.players.forEach(player2 => {
							if (player2.ToP === card.pair) player2.ToP = null; // Only occurs if the 5-combo is used, and they re-discard it. They aren't stealing cards from their hand ;)
						});
						player.ToP = this.piles.find(pile => pile.pair === card.pair);
						this.meta.actionHistory.push(Util.parseString(Util.weighted("$0 even makes Sauron look silly with their new tower", "$0 is **DOMINATING**", "$0 might be compensating for something...", "$0: 'Look at my magnificent tower!'"), member.displayName));
						break;
					case "tt": {
						/**@type {ExkitPlayer} */
						let player2;
						const bullyable = this.players.filter(player3 => player3 !== player && !player3.bullyCard);
						if (!bullyable.size) {
							if (card.cursed) break;
							return action.reply({content: "There isn't anyone you can bully!", ephemeral: true});
						}
						else if (bullyable.size === 1) args[1] = `<@${bullyable.first().member.id}>`;
						if (!args[1]) {
							const rows = [
								new MessageActionRow().addComponents(new MessageSelectMenu()
									.setCustomId(`game ${args[0]}`)
									.setPlaceholder("Choose someone to bully")
									.addOptions(bullyable.map(player3 => ({label: player3.member.displayName, description: `${player3.cards.length} Card${Util.plural(player3.cards.length)}`, value: `<@${player3.member.id}>`})))),
								new MessageActionRow().addComponents(new MessageButton().setCustomId("hand 0 true").setLabel("Cancel").setStyle("SECONDARY"))
							];
							if (action.component) rows.unshift(new MessageActionRow().addComponents(action.component));
							return Util.update(action, {content: "Specify a player to bully", components: rows, ephemeral: true});
						}

						const players = this.getPlayers(args[1]);
						if (players.size > 1) return action.reply({content: `Be more specific! \`${args[1]}\` matched multiple players`, ephemeral: true});
						player2 = players.first();
						if (!player2 || player2 === player) return action.reply({content: "Could not find that player", ephemeral: true});
						if (player2.bullyCard) return action.reply({content: "They're already being bullied, ya meanie >:(", ephemeral: true});

						card.owner = player;
						player2.bullyCard = player.grabCard(card);
						this.meta.actionHistory.push(Util.parseString(Util.weighted([`$0 is bullying $1!`, 2], `$0 is planning a heist on $1's house`, `$0: :musical_note: '$1's sweets are mine!' :musical_note:`, `$0 took one of $1's children`), member.displayName, player2.member.displayName));
						break;
					}
					case "hf": {
						const cards = drawPile.cards.slice(0,3);
						const n = cards.length; // If the draw pile has less than 3 cards
						player.messages = [`**Next ${n} Cards:**\n${cards.map((card2, i) => `${i+1}. ${card2.name}`).join("\n")}`, `Choose a new top card`];
						card.needsInput = true;
						this.meta.actionHistory.push(Util.parseString(Util.weighted("$0's friendship is magical", "$0 wants to share the love!", "$0 is the new companion for the Doctor", "$0 enjoys a bit of communism"), member.displayName));
						break;
					}
				}
				// Re-fetch the player/discard pile in case a nope was played
				const player2 = this.players.get(member.id);
				const card2 = player2?.grabCard(card);
				if (card2) {
					card2.owner = player2;
					this.piles.get("discard").cards.unshift(card2);
					this.removeCard(player2, card2);
				}
				this.updateUI(action);
				this.copy = copy;
				break;
			}
		}
	}

	/**
	 * @param {boolean} forceNewPlayer 
	 */
	nextPlayer(forceNewPlayer) {
		if (!this.extraTurns || forceNewPlayer) {
			const index = (this.currentPlayer.index + (this.clockwise ? 1 : -1) + this.players.size) % this.players.size;
			this.currentPlayer = this.players.find(player2 => player2.index === index);
		}
		this.extraTurns = Math.max(this.extraTurns - 1, 0);
	}

	/**
	 * @param {MessageComponentInteraction} action - The Interaction to reply to
	 */
	updateUI(action) {
		this.renderTable();
		this.render.queue(() => {
			const drawPile = this.piles.get("draw");
			const deathclock = drawPile.cards.findIndex(card => card.id === "ik" && card.up);

			const displays = [new MessageEmbed()
				.setTitle(`Last Discarded Card: ${this.piles.get("discard").cards[0]?.name || "Nothing!"}`)
				.setDescription(this.meta.ended ? `${this.currentPlayer.member.displayName} won the game!` : `\`/help kittens\` or [Browse Commands](https://github.com/Bedrockbreaker/unobot/wiki/Exploding-Kittens)\nIt is currently ${this.currentPlayer.member.displayName}'s turn`)
				.addField(this.meta.ended ? `${this.currentPlayer.member.displayName} won the game!` : `${this.players.find(player => player.index === (this.currentPlayer.index - 1 + this.players.size) % this.players.size).member.displayName} ${this.clockwise ? `:arrow_right: **${this.currentPlayer.member.displayName}** :arrow_right:` : `:arrow_left: **${this.currentPlayer.member.displayName}** :arrow_left:`} ${this.players.find(player => player.index === (this.currentPlayer.index + 1) % this.players.size).member.displayName}`, this.meta.actionHistory.slice(-3).reverse().join("\n"))
				.setColor(drawPile.cards.length ? Color.blend((drawPile.cards.length - 1)/(drawPile.total - 1), Color.Carmine, Color.Green) : Color.Purple)
				.setImage("attachment://game.png")
				.setFooter(`${drawPile.cards.length} Card${Util.plural(drawPile.cards.length)} Remaining${deathclock > -1 && deathclock <= 5 + this.players.size ? `・${deathclock} Card${deathclock} until Imploding Kitten` : ""}`)];
			if (this.meta.messages.length || this.extraTurns) {
				displays.push(new MessageEmbed()
					.setTitle("Notice")
					.setDescription(`${this.extraTurns ? `・Turns left: ${this.extraTurns+1}` : ""}${this.meta.messages.reduce((acc, msg) => `${acc}・${msg}\n`, "")}`)
					.setColor(this.extraTurns ? Color.Carmine : Color.randomColor()));
			}
			const showHandBtn = new MessageActionRow().addComponents(new MessageButton().setCustomId("hand").setLabel(`Show Hand${this.players.some(player => player.ping) ? " (!)" : ""}`).setStyle("PRIMARY"));

			/**@type {import("discord.js").MessageOptions} */
			const message = {embeds: displays, components: [showHandBtn], files: [new MessageAttachment(this.render.canvas.toBuffer(), "game.png")]}
			if (this.meta.gameMessage) return this.meta.gameMessage.removeAttachments().then(msg => msg.edit(message));
			return this.meta.thread.send(message).then(msg => this.meta.gameMessage = msg);
		}, () => {
			const hand = this.displayHand(this.players.get(action.member.id));
			if (action.replied || action.deferred) return Util.emptyPromise();
			return action.customId === "start" ? action.reply(hand) : Util.update(action, hand);
		});
		this.render.flush();
	}

	/**@param {ExkitPlayer} player - The player to remove from the game*/
	removePlayer(player) {
		this.copy = null; // yes, this can theoretically make a card "un-nopable" if a player leaves at the correct moment, but I don't care enough to fix that
		this.piles.get("discard").cards.push(...player.cards); // Return their cards in case they had an imploding kitten or other important card in their hand at the moment
		if (this.extraTurns) { // If the player died with extra turns left
			this.extraTurns = 0;
			this.nextPlayer();
		}
		this.players.forEach(player2 => {
			if (player2.index > player.index) player2.index--;
		});
		this.players.delete(player.member.id);
		this.drawStatic();
		if (this.players.size === 1) {
			this.meta.thread.send(`${this.players.first().member.displayName} won the game!`);
			this.meta.ended = true;
		}
	}

	renderTable() {
		super.renderTable();
		const drawPile = this.piles.get("draw");
		const discardPile = this.piles.get("discard");

		if (drawPile.cards[0]?.up) this.render.queue(() => Canvas.loadImage(drawPile.cards[0].image).then(image => this.render.drawImageNow(image, 237, 125, 175, 250)));
		this.players.forEach(player => {
			this.render.drawText(player.cards.length, player.x + 135, player.y + 35);
			// Marked cards rendering
			const marked = player.cards.filter(card => card.marked);
			marked.forEach((card, i) => {
				this.render.queue(() => Canvas.loadImage(card.image).then(image => {
					this.render.drawImageNow(image, player.x + 90 + 28*i/Math.max(marked.length-1, 1), player.y + 41, 28, 40);
					this.render.drawImageNow(this.render.images.get("marked"), player.x + 90 + 28*i/Math.max(marked.length-1, 1), player.y + 41, 28, 40);
					if (card.pair !== null && this.players.size > 5 + this.getSetting("imploding")) this.render.drawTextNow(card.pair, player.x + 90 + 28*i/Math.max(marked.length-1, 1), player.y + 80);
				}));
			});
			// Curse of the Cat Butt Rendering
			if (player.cursed) this.render.queue(() => this.render.drawImage(this.render.images.get("cursed"), player.x, player.y));
			// Tower rendering
			if (player.ToP) {
				this.render.queue(() => this.render.drawImage(this.render.images.get("tower"), player.x - 10, player.y - 10));
				if (player.ToP.cards.length) this.render.drawText(player.ToP.cards.length, player.x, player.y + 80);
				if (this.players.size > 5 + this.getSetting("imploding")) this.render.drawText(player.ToP.pair, player.x + 60, player.y + 80);
			}
			// Barking Kitten rendering (if the player discarded one too early)
			if (player.barkingCard) {
				this.render.queue(() => this.render.drawImage(this.render.images.get("mouse"), player.x - 10, player.y - 10));
				if (this.players.size > 5 + this.getSetting("imploding")) this.render.drawText(player.barkingCard.pair, player.x, player.y + 40);
			}
			// I'll Take That rendering
			if (player.bullyCard) this.render.queue(() => Canvas.loadImage(player.bullyCard.owner.member.displayAvatarURL({format: "png", size: 32})).then(image => this.render.drawImageNow(image, player.x+44, player.y+4, 32, 32)));
		});
		this.render.queue(() => Canvas.loadImage(discardPile.cards[0]?.image || "images/discardpileghost.png").then(image => {
			this.render.drawTextNow(`${drawPile.cards.length} Cards`, 260, 320, "32px Arial");
			this.render.drawImageNow(image, 437, 125, 175, 250);
			if (discardPile.cards[0]?.pair !== null && this.players.size > 5 + this.getSetting("imploding")) this.render.drawTextNow(discardPile.cards[0].pair, 568, 208, "54px Arial");
		}));
	}

	drawStatic() {
		super.drawStatic();
		this.render.queue(() => Canvas.loadImage("images/exkit/back.png").then(image => this.render.drawImageNow(image, 237, 125, 175, 250)),
			() => Canvas.loadImage("images/exkit/icon.png").then(image => this.players.forEach(player => this.render.drawImageNow(image, player.x + 90, player.y))),
			() => this.saveCanvas()
		);
	}

	/**
	 * @param {ExkitPlayer} player - the player to display their cards to.
	 * @param {number} page - The page of cards to display (0-indexed)
	 * @returns {import("discord.js").InteractionReplyOptions}
	 */
	displayHand(player, page = 0) {
		if (player) player.ping = false;
		if (this.meta.ended) return {content: "Game Ended!", components: [], ephemeral: true};
		const embed = new MessageEmbed()
			.setDescription(`${Util.getQuote()}\n\n${!player.cards.length ? "・You don't have any cards\n" : ""}${player.messages.reduce((acc, msg) => `${acc}・${msg}\n`, "")}`)
			.setColor(Color.randomColor()); // TODO: change player hand color. Also change it for see the future cards
		const display = super.displayHand(player, page);
		display.content = "\u200b";
		display.embeds = [embed];

		/**@type {MessageSelectMenu} */
		const cardMenu = display.components[0]?.components[0];
		cardMenu?.setOptions(player.cards.slice().sort((card1, card2) => {
			if (card1.id === "ik" || card2.id === "ik") return card1.id === "ik" ? -1 : 1;
			if (card1.id === "ek" || card2.id === "ek") return card1.id === "ek" ? -1 : 1;
			if (card1.id === "de" || card2.id === "de") return card1.id === "de" ? -1 : 1;
			return card1.name < card2.name ? -1 : (card1.name > card2.name);
		}).map(card => {
			const propValues = [];
			const propDescs = [];
			if (card === player.cards[player.cards.length-1]) propDescs.push("Newest Card");
			if (card.marked) {
				propValues.push("marked");
				propDescs.push("Marked");
			}
			if (card.pair !== null && this.players.size > 5 + this.getSetting("imploding")) {
				propValues.push(`pair:${card.pair}`);
				propDescs.push(`Pair: ${card.pair}`);
			}
			return {label: card.name, description: propDescs.join("・"), value: `${card.id}${propValues.length ? `.${propValues.join(",")}` : ""}  ${this.cardCounter}`};
		}));

		const drawPile = this.piles.get("draw");
		const discardNeedsInput = this.piles.get("discard").cards.find(card => card.needsInput);
		const rows = [new MessageActionRow()];
		if (["af", "a5", "an", "hf"].includes(discardNeedsInput?.id)) {
			embed.setColor(drawPile.cards.slice(0, discardNeedsInput.id === "a5" ? 5 : 3).some(card => card.id === "ik") ? [0,173,255] : (drawPile.cards.some(card => card.id === "ek") ? Color.Black : Color.randomColor()));
			for (let i = 0; i < Math.min(discardNeedsInput.id === "a5" ? 5 : 3, drawPile.cards.length); i++) {
				const card = drawPile.cards[i];
				rows[0].addComponents(new MessageButton().setCustomId(`game buildfuture ${i}`).setLabel(`${card.name}${card.pair !== null && this.players.size > 5 + this.getSetting("imploding") ? ` (Pair: ${card.pair})` : ""}`).setStyle("PRIMARY"));
			}
		} else if (discardNeedsInput?.id === "br") {
			if (!page) {
				rows[0].addComponents(new MessageSelectMenu().setCustomId("g").setPlaceholder("Place it back into the draw pile").addOptions({label: "Top", description: "nvm dont care anymore", value: "0"}));
				if (drawPile.cards.length) {
					rows[0].components[0].addOptions(
						{label: "Bottom", description: "Not a soul shall whisper its name", value: `${drawPile.cards.length}`},
						{label: "Random", description: "Lost to the sands of time", value: `${Math.floor(Math.random()*(drawPile.cards.length+1))} foo`}
					);
				}
				for (let i = 1; i <= Math.min(11, drawPile.cards.length); i++) {
					rows[0].components[0].addOptions({label: `${i} card${Util.plural(i)} from the top`, value: `${i}`});
				}
				for (let i = Math.max(12, drawPile.cards.length-11); i < drawPile.cards.length; i++) {
					rows[0].components[0].addOptions({label: `${i} cards from the top`, value: `${i}`});
				}
			} else {
				page -= 1;
				rows[0].addComponents(new MessageSelectMenu()
					.setCustomId("g")
					.setPlaceholder("Place it back into the draw pile")
					.addOptions([...new Array(Math.min(25, drawPile.cards.length - 25*page + 1)).keys()].map(n => {
						const k = n + page * 25;
						return {label: `${k} card${Util.plural(k)} from the top`, value: `${k}`};
					}))
				);
			}
			if (drawPile.cards.length > 24) {
				rows.push(new MessageActionRow());
				for (let i = 0; i <= Math.floor(drawPile.cards.length/25); i++) {
					rows[1].addComponents(new MessageButton().setCustomId(`hand ${i+1} true`).setLabel(`View ${i*25}${i*25 === drawPile.cards.length ? "" : `-${i*25 + Math.min(24, drawPile.cards.length - i*25)}` }`).setStyle("SECONDARY"));
				}
			}
			if (page) rows.push(new MessageActionRow().addComponents(new MessageButton().setCustomId("hand 0 true").setLabel("Back").setStyle("SECONDARY")));
		} else {
			rows[0].addComponents(
				new MessageButton()
					.setCustomId("game draw")
					.setLabel("Draw")
					.setStyle("PRIMARY")
					.setDisabled(player.cards.some(card => card.cursed)), // TODO: disabled on needinput, ek/ik need input?
				new MessageButton()
					.setCustomId("game combo 2")
					.setLabel("2-Combo")
					.setStyle("SECONDARY")
					.setDisabled(player.cards.length < 2),
				new MessageButton()
					.setCustomId("game combo 3")
					.setLabel("3-Combo")
					.setStyle("SECONDARY")
					.setDisabled(player.cards.length < 3),
				new MessageButton()
					.setCustomId("game combo 5")
					.setLabel("5-Combo")
					.setStyle("SECONDARY")
					.setDisabled(player.cards.length < 5)
			);
		}
		display.components.push(...rows);
		if (!player.cards.some(card => card.cursed)) player.messages = [];

		return display;
	}

	/**
	 * A method used to activate any actions a card may do after it enters a Player's hand, e.g. Exploding Kitten
	 * @param {ExkitPlayer} player - The Player receiving the Card
	 * @param {ExkitCard} card - The Card
	 * @returns {Boolean} Whether a player died because of the card they received.
	 */
	receiveCard(player, card) {
		switch(card.id) {
			case "ek":
				let bombs = player.cards.reduce((acc, card) => acc + (card.id === "ek" && !card.exploded ? 1 : 0) - (card.id === "sk" ? 1 : 0), 0);
				if (card.exploded) bombs++; // Only happens if they discard an ek protected by a sk
				if (bombs <= 0) break;
				const saves = player.cards.filter(card => card.id === "de").length;
				if (saves < bombs) {
					this.meta.actionHistory.push(Util.parseString(`**${Util.weighted(["$0 exploded!", 3], ["$0 hecking died!", 2], "$0 was slain", "R.I.P. $0", `$0 (<t:${Math.floor(this.meta.gameMessage.createdTimestamp/1000)}}>-<t:${Math.floor(Date.now()/1000)}>)`, "$0 was killed by [Intential Game Design]", "$0 went up in flames", "$0 cast a 9th level fireball on themselves", "$0 hit the ground too hard", "$0 fell for the cat belly rub trap", "$0 watched their innards become outards", "$0's extremeties were detached", "$0 was onboard the Challenger", "$0 survived an IED")}**`, player.member.displayName));
					this.removePlayer(player); // conveniently also moves on to the next player
					return true;
				}
				for (let i = 0; i < bombs; i++) {
					const discardPile = this.piles.get("discard");
					if (player.cursed) {
						/**@type {ExkitCard[]} */
						let cards;
						do {
							cards.unshift(player.cards.splice(Math.floor(Math.random()*player.cards.length), 1));
							discardPile.cards.unshift(cards[0]);
							this.removeCard(player, cards[0]);
							if (cards[0].id === "ek" && saves < ++bombs) {
								this.meta.actionHistory.push(Util.parseString(`**${Util.weighted(["$0 exploded... twice!", 2], "$0 cut the right wire.. on the wrong bomb", "$0 didn't realize there was a second bomb", "$0 pulled a grenade on themself", "$0 commited war crimes", "$0 couldn't handle the heat", "Sekiro: $0 Died Twice")}**`, player.member.displayName));
								this.removePlayer(player);
								return true;
							}
						} while(cards[0].id !== "de");
						this.meta.actionHistory.push(`${player.member.displayName} blindly threw ${Util.plural(cards.length, `a ${cards[0].name}`, cards.reduce((acc, card2, i) => `${acc}${i === cards.length-2 ? `${card2.name}, ` : `${card2.name}, and a ` }`.slice(0,-2), ""))} at the Exploding Kitten to solve their problems`);
					} else {
						discardPile.cards.unshift(player.cards.splice(player.cards.findIndex(card2 => card2.id === "de"), 1)[0]);
					}
				}
				for (let i = 0; i < bombs - (card.exploded ? 1 : 0); i++) {
					player.cards.find(card2 => card2.id === "ek" && !card2.exploded).exploded = true;
				}
				player.messages = ["Place the Exploding Kitten back into the draw pile"];
				const msgs = bombs > 1 ? ["$0 is a Gigachad", "$0 courted Death, as well as Death's Ex", "$0 just pulled a Franz Fedinand and lived!", "$0 has anime protagonist plot armor"] : [["$0 defused a bomb!", 2], "$0 defused a bomb by mailing it to their neighbor", "My Hero ~~Academia~~ $0", "$0 saved the day!", "$0 cut the right wire!", "$0 is now on the terrorist watch-list"]
				this.meta.actionHistory.push(Util.parseString(`**${Util.weighted(...msgs)}**`, player.member.displayName));
				break;
			case "ik":
				if (!card.up) {
					card.up = true;
					player.messages = ["Place the Imploding Kitten back into the draw pile"];
					break;
				}
				this.meta.actionHistory.push(Util.parseString(`**${Util.weighted(["$0 imploded!", 3], "$0 was eviscerated", ["$0 was annihilated", 2], "$0 finally saw their forehead... in a black hole", "$0: 'It's just a flesh wound...'", "Exenteration of $0: Complete", "$0 was expunged from existence", "Null Error: $0", "Quantum Liquifacted $0")}**`, player.member.displayName));
				this.removePlayer(player);
				return true;
		}
		return false;
	}

	/**
	 * A method used to activate any actions a card may do when it leaves a Player's hand, e.g. removing the marked condition on a card
	 * @param {ExkitPlayer} player - The Player removing the Card
	 * @param {ExkitCard} card - The Card
	 * @returns {Boolean} Whether the player died because of they card they gave away
	 */
	removeCard(player, card) {
		card.marked = false;
		card.cursed = false;
		switch(card.id) {
			case "sk":
				this.meta.actionHistory.push(Util.parseString(`**${Util.weighted(["$0 is an idiot", 3], ["$0 dismissed their own lifeline", 2], "$0 gets what they deserve", "$0 committed toaster-bath", "$0 commited scooter-ankle", "$0 watched their innards become outards", "$0's plea for death was answered")}**`, player.member.displayName));
				return this.receiveCard(player, new ExkitCard("ek")); // Test if they would explode. Never actually inserted into their hand.
		}
		return false;
	}

	/**
	 * @param {string} input 
	 * @returns {Collection<string, ExkitPlayer>}
	 */
	getPlayers(input) {
		return super.getPlayers(input);
	}

	/**
	 * @param {MessageEmbed} embed 
	 * @param {string[]} command 
	 */
	static help(embed, command) {
		embed.setTitle(`Help for \`/g ${command.join(" ")}\` in Exploding Kittens`).setDescription("[Browse Commands](https://github.com/Bedrockbreaker/unobot/wiki/Exploding-Kittens)");
		switch(command[0]) {
			case "":
			case undefined:
				embed.setTitle("Help for Exploding Kittens").addField("/help kittens <command>", "General help command for Exploding Kittens. Use this to receive information on using other commands.\nEx: \`/help kittens remove\`")
					.addFields(
						{name: "Available Commands", value: "(To discard, use `/g <cardId>`)"},
						{name: "remove", value: "/help kittens remove", inline: true},
						{name: "combo", value: "/help kittens combo", inline: true},
						{name: "draw", value: "/help kittens draw", inline: true},
						{name: "input", value: "/help kittens input", inline: true})
					.setColor(Color.White);
				break;
			case "remove":
				embed.addField("/g remove <num>", "Removes a percentage of cards from the draw pile, after hands have been dealt, and before exploding kittens are added.\nEx:`/g remove 33`").setColor(Color.Carmine);
				break;
			case "draw":
				embed.addField("/g draw", "Draws a card\nEx: `/g draw`").setColor(Color.Forest);
				break;
			case "combo":
				embed.addField("/g combo <type> <id1> 0 <id2> 0 <id3?> 0? <id4?> 0? <id5?> 0? <player?> <n?>", "Deprecated. Don't use.\nUses a combo of cards. In the case of a 5 card combo, `<n>` refers to the nth card in the discard pile (0-indexed).\nEx: `/g combo 2 hc hc <@1234>`, `/g combo 2 fc hc <@1234> de.marked`, `/g combo 3 mc fc mc <@1234> de`, `/g combo 5 mc tc rc bc pc 42`").setColor(Color.Purple);
				break;
			case "input":
				embed.setTitle(`Help for \`/g}\` in Exploding Kittens`);
				embed.addField("/g <...input>", "Deprecated. Do not use.\nFavor/Garbage Collection/Potluck: `/g <id>`. Ex: `/g tc`\n\"See the Future\"-type cards: `/g <a> <b> <c> <d> <e>`. Each number is the old position in the draw pile, 0-indexed. Ex: `/g 0 2 1`, `/g 3 0 2 1 4`\nBury: `/g <n>`, where `n` is the number of cards deep within the draw pile. Ex: `/g 42`").setColor(Color.Purple);
				break;
			default:
				embed.addField("Unknown command", "Did you spell it correctly?").setColor(Color.Carmine);
				break;
		}
	}
}

class ExkitPlayer extends Player {
	/**
	 * @param {GuildMember} member - The member associated with the player
	 * @param {boolean} [isLeader] - If the player is a leader/host over a game
	 */
	constructor(member, isLeader = false) {
		super(member, [], isLeader);

		/**@type {ExkitCard[]} */
		this.cards;

		/** Whether this player is cursed by the Cat Butt or not */
		this.cursed = false;

		/**
		 * The card bullying this player (Always an I'll Take That)
		 * @type {ExkitCard}
		 */
		this.bullyCard;

		/**
		 * The Barking Kitten in front of this player, if they played it too early
		 * @type {ExkitCard}
		 */
		this.barkingCard;

		/**
		 * This player's Tower of Power
		 * @type {ExkitPile}
		 */
		this.ToP;
	}

	/**
	 * @param {string} [argument] - The string formatted in "card selection syntax"
	 * @returns {ExkitCard[]} The cards which match the specified argument
	 */
	getCards(argument) {
		return super.getCards(argument);
	}
}

class ExkitPile extends Pile {
	/**
	 * @param {ExkitCard[]} [cards] - The cards in the pile
	 * @param {number} [pair] - The ID of the pair this pile belongs to (ToP only)
	 */
	constructor(cards = [], pair = null) {
		super(cards);

		/**@type {ExkitCard[]} */
		this.cards;

		/** The total number of cards originally in this pile*/
		this.total = cards.length;

		/** The ID of the pair this pile belongs to (ToP only) */
		this.pair = pair;
	}
}

class ExkitCard extends Card {
	/**
	 * @param {string} id - The id of the card
	 * @param {string} [name] - The Human-Readable name of the card, defaults to the id
	 * @param {string} [image] - The URL to the image of the card
	 * @param {number} [pair] - The ID of the pair this card belongs to (Barking Kitten and ToP only)
	 * @param {boolean} [up] - Whether this card is facing up or not
	 */
	constructor(id, name, image = "", pair = null, up = false) {
		super(id, name, image);

		/** The ID of the pair this card belongs to (Barking Kitten and ToP only) */
		this.pair = pair;

		/** Whether this card is facing up or not */
		this.up = up;

		/** If this card is an Exploding Kitten, whether it's exploded or not */
		this.exploded = false;

		/** Whether this card requires further input from the player */
		this.needsInput = false;

		/** Whether this card is the one chosen for a cursed player to discard next */
		this.cursed = false;

		/** Whether this card has been marked and is visible to all players */
		this.marked = false;

		/**
		 * The owner of this card, "attacking" another player
		 * @type {ExkitPlayer}
		 */
		this.owner;

		/**
		 * The person on the "attacking" end of this card
		 * @type {ExkitPlayer}
		 */
		this.worker;

		/**
		 * The contributers to this card, if its a Garbage Collection, Potluck, or Bury
		 * @type {Collection<string, ExkitPlayer|ExkitCard>}
		 */
		this.contributors = new Collection();
	}
}