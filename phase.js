import {Collection, GuildMember, MessageActionRow, MessageAttachment, MessageButton, MessageComponentInteraction, MessageEmbed, MessageSelectMenu, ThreadChannel} from "discord.js";
import {Core, Util, Color, Player, Pile, Card, Setting} from "./core.js";

/**
 * Phase 10
 */
export default class basePhase extends Core {
	/**@param {ThreadChannel} thread - The channel to send updates to */
	constructor(thread) {
		const settings = new Collection([
			["partialPhasing", new Setting(0,
				"Partial Phasing - :asterisk: ・ $0",
				"- If a portion of a phase is completed, you can lay it down to remove points from your hand",
				Util.Selection("partialPhasing", [["Partial Phasing - Off", "Partial Phases are not allowed"], ["Partial Phasing - On", "Partial Phases are allowed"]]),
				() => [this.displayVote("partialPhasing", ["Off", "On"])])],
			["moveWilds", new Setting(0,
				"Movable Wilds - :twisted_rightwards_arrows: ・ $0",
				"- Wilds can be moved around within a run after they've been placed",
				Util.Selection("moveWilds", [["Movable Wilds - Off", "Wilds within a run cannot be changed once placed"], ["Movable Wilds - On", "Wilds within a run can be moved around"]]),
				() => [this.displayVote("moveWilds", ["Off", "On"])])],
			["extendedWilds", new Setting(0,
				"Extended Wilds - :hash: ・ $0",
				"- Wilds can act as numbers beyond 1-12.",
				Util.Selection("extendedWilds", [["Extended Wilds - Off", "Wilds can only be numbers 1-12"], ["Extended Wilds - On", "Wilds can act as numbers beyond 1-12"]]),
				() => [this.displayVote("extendedWilds", ["Off", "On"])])],
			["skipStacking", new Setting(0,
				"Skip Stacking - :fast_forward: ・ $0",
				"- Skips can be stacked on players who are already skipped",
				Util.Selection("skipStacking", [["Skip Stacking - Off", "You can't skip a player who's currently skipped"], ["Skip Stacking - On", "Stack as many skips on a player as you'd like"]]),
				() => [this.displayVote("skipStacking", ["Off", "On"])])],
			["graceRound", new Setting(0,
				"Last Stand - :repeat_one: ・ $0",
				"- After someone phases, everyone has one final turn",
				Util.Selection("graceRound", [["Last Stand - Off", "As soon as someone goes out, the round is over"], ["Last Stand - On", "Everyone has one final turn after someone goes out"]]),
				() => [this.displayVote("graceRound", ["Off", "On"])])],
			["reverses", new Setting(0,
				"Reverse Cards - :track_previous: ・ $0",
				"- Adds 8 reverse cards to the game (15 points each)",
				Util.Selection("reverses", [["Reverses - Off", "Reverse cards are not in the game"], ["Reverses - On", "8 Reverse cards are added to the game"]]),
				() => [this.displayVote("reverses", ["Off", "On"])])],
			["selectionType", new Setting(0,
				"Phase Selection: $0",
				"- Changes how phases are selected.",
				Util.Selection("selectionType", [["Phase Selection: Normal", "Phases are accomplished in order"], ["Phase Selection: Random", "A random phase is chosen among the enabled phases"], ["Phase Selection: Random No Repeats", "A random phase without repeating any is chosen"], ["Phase Selection: Manual", "You choose your next phase"]]),
				() => [this.displayVote("selectionType", ["Normal", "Random", "Random No Repeats", "Manual"])])],
			["phases", new Setting(0,
				"Current Phases",
				"- $0\n- Use `/help phase10 phases` for information on how to change",
				undefined,
				() => [this.compress(this.phases.map(n => n+1)) || "¯\\_(ツ)_/¯"])]
		]);
		
		super("Phase 10", thread, settings);
		this.render.dy = 130;

		/** @type {Collection<string, PhasePile}*/
		this.piles;
		/**@type {PhasePlayer} */
		this.currentPlayer;
		/**@type {Collection<string, PhasePlayer>} */
		this.players;

		/** Array of all phases being played */
		this.phases = [...new Array(10).keys()];

		/** Whether the play-direction is clockwise or not */
		this.clockwise = true;

		/** List of tips displayed in the footer */
		this.tips = ["Tip #1: Play as many cards as possible, to remove points from your hand", "Tip #2: Don't give up.", "Tip #3: Add cards to completed phases whenever possible", "Tip #4: Rushing to phase can be a viable strategy",
			"Tip #5: Dump your high cards", "Tip #6: Hold on to your skips until near the end of the round", "Tip #6: Count cards and watch your opponents", "Tip #7: Bluff. Don't give away your hand.",
			"Tip #8: Don't forget to phase", "Tip #9: Sometimes, high cards are good for phasing, since everyone throws them away"];
	}

	/** Array of all phases' descriptions */
	static phaseDescs = ["2 sets of 3", "1 set of 3 + 1 run of 4", "1 set of 4 + 1 run of 4", "1 run of 7", "1 run of 8",
		"1 run of 9", "2 sets of 4", "7 cards of one color", "1 set of 5 + 1 set of 2", "1 set of 5 + 1 set of 3",
		"1 run of 4 of one color", "1 run of 6 of one color", "1 run of 4 + 6 cards of one color", "1 run of 6 + 4 cards of one color", "8 cards of one color",
		"9 cards of one color", "3 sets of 3", "1 set of 4 + 1 run of 6", "1 set of 5 + 1 run of 5", "1 set of 5 + 5 cards of one color",
		"5 sets of 2", "1 run of 10", "10 cards of one color", "1 run of 5 of odd numbers of one color + 1 run of 5 of even numbers of one color", "1 set of 5 + 1 run of 5 odd numbers",
		"1 set of 5 + 1 run of 5 even numbers", "1 set of 4 + 1 run of 3 + 1 set of 3 of one color", "1 run of 5 + 1 run of 5 odd numbers of one color", "1 run of 5 + 1 run of 5 even numbers of one color", "2 sets of 5"];

	/**
	 * @param {GuildMember} member - The member to generate a player for
	 * @param {Boolean} isLeader - Whether the new player is a leader
	 */
	genDefaultPlayer(member, isLeader = false) {
		return new PhasePlayer(member, isLeader);
	}

	/**
	 * @returns {import("discord.js").MessageOptions?}
	 */
	displaySettings() {
		const display = super.displaySettings();
		display.embeds[0].setDescription("\`/help phase10\` or [Browse Commands](https://github.com/Bedrockbreaker/unobot/wiki/Phase-10)");
		return display;
	}

	/**
	 * @param {MessageComponentInteraction} action - The Interaction to reply to
	 */
	start(action) {
		if (this.players.size < 2) return action.reply({content: "Not enough players", ephemeral: true});
		if (!this.phases.length) return action.reply({content: "There aren't any phases to play", ephemeral: true});
		if (this.meta.phase < 2) { // Because start() can be called multiple times
			this.getSettings();
			if (this.getSetting("reverses")) this.tips.push("Tip #10: Reverses can effectively control phasing and the flow of cards");
		}
		this.meta.phase = 2;
		this.currentPlayer = null; // No funny business with trying to phase between rounds
		this.clockwise = true;

		let choosePhase = false;
		for (let j = 0; j < this.players.size; j++) {
			const player = this.players.first(j+1)[j];

			if (this.meta.phase < 2) player.phases = [...this.phases];

			player.cards.forEach(card => {
				if (card.id === "ww") player.score += 25;
				else if (card.id === "sk" || card.id === "re") player.score += 15;
				else if (Number(card.id.substring(1)) < 10) player.score += 5;
				else player.score += 10;
			});
			player.cards = [];

			if (player.phased) player.phase++;
			if (player.phase === player.phases.length) {
				const completed = [player, ...this.players.filter(player2 => player2.phased && player2.phase === player2.phases.length - 1).values()];
				let lowScore = Infinity;
				let winner;
				for (const player2 of completed) {
					if (player2.score < lowScore) { // If there's a tie, it's whoever first joined the game gets to win ¯\_(ツ)_/¯
						lowScore = player2.score;
						winner = player2;
					}
				}
				this.meta.thread.send(`${winner.member.displayName} wins the entire game, with ${lowScore} points!`);
				this.meta.ended = true;
				return;
			}

			switch(this.getSetting("selectionType")) {
				case 1: // Random
					if (this.meta.phase < 2) player.phases = player.phases.map(() => Math.floor(Math.random()*player.phases.length));
					break;
				case 2: // Random no Repeats
					if (this.meta.phase < 2) Util.shuffle(player.phases);
					break;
				case 3: // Manual
					if (player.phased || this.meta.phase < 2) player.choosePhase = choosePhase = true;
					break;
			}
			player.phased = false;
		}

		if (choosePhase) {
			const row = new MessageActionRow().addComponents(new MessageButton().setCustomId("game choose").setLabel("Choose Phase").setStyle("PRIMARY"));
			return action.reply({content: "Waiting for players to choose their next phase..", components: [row]});
		}

		this.randomizePlayerOrder();
		const drawPile = new PhasePile(this.deckCreate());
		const discardPile = new PhasePile();
		this.piles.set("draw", drawPile);
		this.piles.set("discard", discardPile);
		discardPile.cards.unshift(drawPile.cards.shift());
		this.currentPlayer = this.players.find(player => !player.index);
		this.players.forEach(player => {
			player.cards = drawPile.cards.splice(0, 10);
			this.generatePhasePiles(player);
			player.ping = true;
		});
		if (!this.players.some(player => player.phase) && this.getSetting("selectionType") !== 3) this.players.get(action.member.id).ping = false; // If first round of the game

		this.meta.actionHistory.push("The game has just started!");
		switch(discardPile.cards[0].id) {
			case "ww":
				this.meta.actionHistory.push(`${this.currentPlayer.member.displayName} gets a free birthday present`);
				break;
			case "re":
				this.clockwise = !this.clockwise;
			case "sk":
				this.meta.actionHistory.push(`${this.currentPlayer.member.displayName} was skipped due to the starting card!`);
				this.nextPlayer();
				break;
		}

		this.meta.gameMessage = null;
		if (this.players.some(player => player.phase)) this.drawStatic(); // If not first round
		else super.start(action);
		this.updateUI(action);
	}

	/** Creates a deck of cards for the draw pile */
	deckCreate() {
		/** @type {PhaseCard[]} */
		let cards = [];
		const c = ["r","g","b","y"];
		const colors = ["Red", "Green", "Blue", "Yellow"];
		for (let k = 0; k < Math.ceil(this.players.size/6); k++) {
			for (let i = 0; i < 4; i++) {
				cards.push(new PhaseCard("ww", "Wild", `phase/ww.png`), new PhaseCard("ww", "Wild", `phase/ww.png`), new PhaseCard("sk", "Skip", `phase/sk.png`));
				if (this.getSetting("reverses")) cards.push(new PhaseCard("re", "Reverse", `phase/re.png`), new PhaseCard("re", "Reverse", `phase/re.png`));
				for (let j = 1; j <= 12; j++) {
					cards.push(new PhaseCard(`${c[i]}${j}`, `${colors[i]} ${j}`, `phase/${c[i]}${j}.png`), new PhaseCard(`${c[i]}${j}`, `${colors[i]} ${j}`, `phase/${c[i]}${j}.png`));
				}
			}
		}
		Util.shuffle(cards);
		return cards;
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
			case "phases":
				switch (args[1]) {
					case "add":
					case "a":
					case "+": {
						if (!player.isLeader) return action.reply({content: "Only the leader can add phases", ephemeral: true});
						if (this.meta.phase > 2) return action.reply({content: "Can't add phases once the game has started", ephemeral: true});
						if (!args[2]) return action.reply({content: "Specify the phases to add! (`/help phase10 phases add`)", ephemeral: true});
						const nums = args[2].split("-").map(num => Util.clamp(Util.parseInt(num), 1, 30));
						if (isNaN(nums[0])) return action.reply({content: `\`${args[2]}\` is not a valid phase`, ephemeral: true});
						nums[1] ||= nums[0];
						const phases = [...new Array(Math.abs(nums[1] - nums[0]) + 1).keys()].map(n => n + Math.min(nums[0], nums[1]) - 1);
						if (nums[1] < nums[0]) phases.reverse();
						this.phases.push(...phases);
						if (this.meta.settingsMessage) this.meta.settingsMessage.edit(this.displaySettings());
						action.reply(`Added phase${Util.plural(phases.length)} ${this.compress(phases.map(n => n+1))}`);
						break;
					}
					case "remove":
					case "rem":
					case "-": {
						if (!player.isLeader) return action.reply({content: "Only the leader can remove phases", ephemeral: true});
						if (this.meta.phase > 2) return  action.reply({content: "Can't remove phases once the game has started", ephemeral: true});
						if (!args[2]) return action.reply({content: "Specify the phases to remove! (`/help phase10 phases remove`)", ephemeral: true});
						const nums = args[2].split("-").map(num => Util.clamp(Util.parseInt(num), 1, 30));
						if (isNaN(nums[0])) return action.reply({content: `\`${args[2]}\` is not a valid phase`, ephemeral: true});
						nums[1] ||= nums[0];
						[nums[0], nums[1]] = [Math.min(nums[1], nums[0]), Math.max(nums[1], nums[0])];
						const phases = [...new Array(nums[1] - nums[0] + 1).fill().keys()].map(n => n + nums[0] - 1);
						this.phases = this.phases.filter(phase => !phases.includes(phase));
						if (this.meta.settingsMessage) this.meta.settingsMessage.edit(this.displaySettings());
						action.reply(`Removed phase${Util.plural(phases.length)} ${this.compress(phases.map(n => n+1))}`);
						break;
					}
					case "set":
						if (!player.isLeader) return action.reply({content: "Only the leader can change the phases", ephemeral: true});
						if (this.meta.phase > 2) return  action.reply({content: "Can't change the phases once the game has started", ephemeral: true});
						if (!args[2]) return action.reply({content: "Specify the phases to set! (`/help phase10 phases set`)", ephemeral: true});
						const nums = args[2].split(",").flatMap(arg => {
							const nums2 = arg.split("-").map(n => Util.clamp(Util.parseInt(n), 1, 30));
							if (isNaN(nums2[0])) return [];
							nums2[1] ||= nums2[0];
							const phases = [...new Array(Math.abs(nums2[1] - nums2[0]) + 1).keys()].map(n => n + Math.min(nums2[0], nums2[1]) - 1);
							if (nums2[1] < nums2[0]) phases.reverse();
							return phases;
						});
						this.phases = nums;
						if (this.meta.settingsMessage) this.meta.settingsMessage.edit(this.displaySettings());
						action.reply(`Set the phases to ${this.compress(nums.map(n => n+1))}`);
						break;
					default: {
						const embed = new MessageEmbed()
							.setTitle("Phases for this game")
							.setDescription(this.phases.reduce((acc, phase) => `${acc}${phase+1}. ${basePhase.phaseDescs[phase]}\n`, "") || "¯\\_(ツ)_/¯")
							.setColor(Color.blend(this.players.reduce((max, player2) => Math.max(max, player2.phase), 0) / Math.max(this.phases.length - 1, 1), Color.Green, Color.Carmine));
						action.reply({embeds: [embed], ephemeral: true});
						break;
					}
				}
				break;
			case "vote":
				if (!this.meta.voting && !player.isLeader) return action.reply({content: `Voting isn't enabled! Either accept your plight, or ask <@!${this.players.find(p => p.isLeader).member.id}> to enable Democracy (\`/vote Enable\`)`, ephemeral: true});
				// Silently ignore errors (only possible through a slash command)
				for (let i = 1; i < args.length; i += 2) {
					this.voteSetting(args[i], args[i+1], member.id);
				}
				if (this.meta.settingsMessage) this.meta.settingsMessage.edit(this.displaySettings());
				action.reply({content: "Settings updated", ephemeral: true});
				break;
			case "sort":
				if (args[1] !== "number" && args[1] !== "color") return action.reply({content: "Invalid hand sorting parameter", ephemeral: true});
				player.sortBy = args[1];
				if (this.meta.phase >= 2) return Util.update(action, this.displayHand(player));
				action.reply({content: `Your hand will now be sorted by ${args[2]}`, ephemeral: true});
				break;
			case "choose":
			case "c": {
				if (!player.choosePhase) return action.reply({content: "You can't change your phase once you've you selected it!", ephemeral: true});
				if (!args[1]) {
					const row = new MessageActionRow().addComponents(new MessageSelectMenu()
						.setCustomId("game choose")
						.setPlaceholder("Phases Left")
						.addOptions(player.phases.slice(player.phase).map(phase => ({label: `Phase ${phase+1}`, description: basePhase.phaseDescs[phase], value: `${phase+1} ${this.cardCounter}`})))
					);
					return action.reply({content: "Specify the phase you'll play next!", components: [row], ephemeral: true});
				}
				const phaseIndex = player.phases.slice(player.phase).findIndex(n => n + 1 === Number(args[1]));
				if (phaseIndex < 0) return action.reply({content: `${args[1]} is not a valid phase`, ephemeral: true});
				player.phases.splice(player.phase, 0, player.phases.splice(player.phase + phaseIndex, 1)[0]);
				player.choosePhase = false;
				Util.update(action, {content: `Chose Phase ${player.phases[player.phase]+1}: ${basePhase.phaseDescs[player.phases[player.phase]]}`, components: [], ephemeral: true});
				if (this.players.every(player => !player.choosePhase)) this.start(action);
				break;
			}
			case "ph": {
				if (this.meta.phase < 2) return Core.notYet(action);
				if (player !== this.currentPlayer) return action.reply({content: "It isn't your turn", ephemeral: true});
				if (!player.drew) return action.reply({content: "Draw a card first", ephemeral: true});
				if (args.length < 4) return action.reply(`You did it wrong. (Why are you using a slash command for this anyway?) (\`/g ph <player> <cardId1>[;<cardId2>[;<cardId3>...]];<s1>[ <cardId4>[;<cardId5>...]];<s2>[ ...]\`)`);
				
				const players = this.getPlayers(args[0]);
				if (players.size > 2) return action.reply({content: `Be more specific! \`${args[0]}\` matched multiple players`, ephemeral: true});
				const player2 = players.first();
				if (!player2) return action.reply({content: "Could not find that player", ephemeral: true});
				if (!player.phased && player2 !== player) return action.reply({content: "You haven't phased yet", ephemeral: true});
				if (!player.phased) return action.reply({content: "They haven't phased yet", ephemeral: true});

				if (args.length - 1 !== player2.phasePiles.length) return action.reply({content: "Invalid number of card groups (needs to match the number phase piles for that player)", ephemeral: true});
				/**@type {PhaseCard[][]} */
				const cards = [];
				/**@type {number[]} */
				const forceWilds = [];
				for (let j = 2; j < args.length; j++) {
					cards.push([]);
					const cardArgs = args[j].split(";");
					for (let i = 0; i < cardArgs.length - 1; i++) {
						const card = player.getCards(cardArgs[i])[0];
						if (card && card.id !== "re" && card.id !== "sk") cards[j-2].push(player.grabCard(card));
					}
					const forceWild = Util.clamp(Util.parseInt(cardArgs[cardArgs.length - 1]), 0, cardArgs.length - 1);
					forceWilds.push(Util.NaNfallback(forceWild, 0));
				}
				player.cards.push(...cards.flat());
				if (cards.some((cards2, i) => cards2.length !== args[i+2].split(";").length - 1)) return action.reply({content: "At least one of the provided cards was invalid", ephemeral: true});
				if (cards.every(cards2 => !cards2.length)) return action.reply({content: "Umm, why?", ephemeral: true});

				/**@type {boolean[]} */
				const canPhase = [];
				for (let i = 0; i < player2.phasePiles.length; i++) {
					const pile = player2.phasePiles[i];
					canPhase.push(this.validatePartialPhase(pile, cards[i], forceWilds[i]));
					if (!canPhase[i] && cards[i].length) return action.reply({content: `Invalid card${Util.plural(cards.length)} (${cards[i].map(card => card.id.toUpperCase()).join(", ")}) for ${player === player2 ? "your" : `${player2.member.displayName}'s`} ${{set: `set of ${pile.min}${pile.color ? " of 1 color" : ""}`, run: `run of ${pile.min}${pile.evens ? " evens" : (pile.evens === false ? " odds" : "")}${pile.color ? " of 1 color" : ""}`, col: `${pile.min} cards of 1 color`}[pile.type]}${pile.cards.length ? ` (${pile.cards.map(card => card.id.toUpperCase()).join(", ")})` : ""}`, ephemeral: true});
				}
				const cardlength = cards.reduce((acc, cards2) => acc + cards2.length, 0);
				if (!player.phased && !canPhase.every(b => b)) {
					if (this.getSetting("partialPhasing")) {
						if (player.cards.length - cardlength < player.phasePiles.reduce((acc, pile, i) => acc + (pile.cards.length || cards[i].length ? 0 : pile.min), 0)) return action.reply({content: "You wouldn't have enough cards to phase afterwards", ephemeral: true});
					} else { // Not phased, not every pile is valid, and no partial phasing
						return action.reply({content: "Partial phasing isn't enabled", ephemeral: true});
					}
				}

				// Finally, after 27 million different verification checks, the player can phase cards. Though, with a slash command, I don't know why.
				this.phase(action, player, cards, player2);
				break;
			}
			case "buildphase": {
				if (action.isCommand()) return action.reply({content: "No. Stop that.", ephemeral: true});
				if (player !== this.currentPlayer) return action.reply({content: "It isn't your turn", ephemeral: true});
				if (!player.drew) return action.reply({content: "Draw a card first", ephemeral: true});

				switch(args[1]) {
					case "player": {
						if (!player.phased) {args.splice(1, 1, `<@${player.member.id}>`, "-1"); break;}
						const phasedPlayers = this.players.filter(player2 => player2.phased);
						if (phasedPlayers.size === 1) {args.splice(1, 1, `<@${phasedPlayers.first().member.id}>`, "-1"); break;}
						const rows = [
							new MessageActionRow().addComponents(new MessageSelectMenu()
								.setCustomId("game buildphase")
								.setPlaceholder("Players")
								.addOptions(phasedPlayers.map(player2 => ({label: player2.member.displayName, value: `<@${player2.member.id}> -1`})))),
							new MessageActionRow().addComponents(new MessageButton().setCustomId("hand 0 true").setLabel("Cancel").setStyle("SECONDARY"))
						];
						return Util.update(action, {content: "Choose whose phase to place cards into", components: rows, ephemeral: true});
					}
					case "wilds": {
						args[args.length-2] += `;${args[args.length-1]}`;
						args.pop();
						args.splice(1, 1);
						break;
					}
				}

				// Expected syntax: "buildphase", <player>, <pileN>, "<id1>;<id2>;<id3>;...;<s1>", ..., <id4>, 0, <id5>, 1, <id6>, 2, ...
				const player2 = this.getPlayers(args[1]).first();
				const pileN = Number(args[2]);
				const pile = player2.phasePiles[pileN];
				/**@type {PhaseCard[][]} */
				const cardgroups = [];
				/**@type {PhaseCard[]} */
				const validcards = [];
				/**@type {number[]} */
				const forceWilds = [];
				for (let j = 0; j < pileN; j++) {
					cardgroups.push([]);
					const cardArgs = args[j+3].split(";");
					for (let i = 0; i < cardArgs.length - 1; i++) {
						const card = player.grabCard(player.getCards(cardArgs[i])[0]);
						validcards.push(card);
						cardgroups[j].push(card);
					}
					forceWilds.push(Number(cardArgs[cardArgs.length-1]));
				}
				player.cards.push(...validcards);

				if (args.slice(3 + pileN).includes("NONE")) args = [...args.slice(0, 3 + pileN), ""]; // Blank string, since it'll later be set to "0"
				if (args.length > 3 + Math.max(pileN, 0)) { // New cards, validate them
					validcards.forEach(card => player.grabCard(card));
					const newcards = [];
					for (let i = pileN + 3; i < args.length; i += 2) { // += 2, since there's the collision avoidance number (this.cardCounter) after every card id
						const newcard = player.grabCard(player.getCards(args[i])[0]);
						if (newcard) newcards.push(newcard); // Prevents adding undefined if "NONE" was selected. Otherwise, all cards should be valid.
					}
					player.cards.push(...validcards, ...newcards);

					const tooFewCards = player.cards.length - validcards.length - newcards.length < player2.phasePiles.reduce((acc, pile2, i) => acc + (pile2.cards.length || cardgroups[i]?.length || (pileN === i && newcards.length) ? 0 : pile2.min), 0);
					if ((!this.validatePartialPhase(pile, newcards) && newcards.length) || tooFewCards) {
						const viablecards = player.cards.filter(card => !validcards.includes(card)).map(card => ({label: card.name, value: `${card.id} ${this.cardCounter}`}));
						const rows = [
							new MessageActionRow().addComponents(new MessageSelectMenu()
								.setCustomId(`game ${args.slice(0, 3 + pileN).join(" ")}`)
								.setPlaceholder("Your Hand")
								.addOptions(viablecards)
								.setMinValues(!pile.cards.length && !this.getSetting("partialPhasing") ? pile.min : 1)
								.setMaxValues(viablecards.length)),
							new MessageActionRow().addComponents(new MessageButton().setCustomId("hand 0 true").setLabel("Cancel").setStyle("SECONDARY"))
						];
						if (player !== player2 || this.getSetting("partialPhasing") || player.phased) rows[0].components[0].spliceOptions(0, 0, {label: "None", description: "Don't add any cards", value: "NONE"});
						const stringPile = `${player === player2 ? "your" : `${player2.member.displayName}'s`} ${{set: `set of ${pile.min}${pile.color ? " of 1 color" : ""}`, run: `run of ${pile.min}${pile.evens ? " evens" : (pile.evens === false ? " odds" : "")}${pile.color ? " of 1 color" : ""}`, col: `${pile.min} cards of 1 color`}[pile.type]}${pile.cards.length ? ` (${pile.cards.map(card => card.id.toUpperCase()).join(", ")})` : ""}`;
						return Util.update(action, {content: tooFewCards ? `You wouldn't have enough cards to phase afterwards.\n(${pileN}) Choose some new cards for ${stringPile}` : `${Util.plural(newcards.length, "Those cards weren't", "That card wasn't")} valid for ${stringPile}.\n${pileN}Choose some new cards`, components: rows, ephemeral: true});
					}

					args.splice(3 + pileN, args.length - 3 - pileN, args.slice(3 + pileN).filter((arg, i) => !(i%2)).join(";")); // buildphase player pileN id1;id2;id3;s1 id4 0 id5 1 id6 2 => buildphase player pileN id1;id2;id3;s1 id4;id5;id6
					if (pile.type === "run" && !this.getSetting("moveWilds")) {
						const cards2 = [...pile.cards, ...newcards].sort((card1, card2) => {
							if (card1.id === "ww" || card2.id === "ww") {
								if ((card1.num === null && card1.id === "ww") || (card2.num === null && card2.id === "ww")) return card1.num === null && card1.id === "ww" ? 1 : -1;
								return card1.id === "ww" ? 1 : -1;
							}
							return 0;
						});
						const run = this.sortRun(pile, cards2);
						const minForce = run.findIndex(card => card.id !== "ww" || card.num !== null); // Minimum number of wilds to come at the beginning of a run. (extendedWilds is false) - Run is near value 12 and can't extend past it.
						const numEndWilds = run.length - 1 - Util.findLastIndexOf(run, card => card.id !== "ww" || card.num !== null);
						const maxForce = minForce + Math.min(this.getSetting("extendedWilds") ? Infinity : ((Number(run[0].id.slice(1)) || run[0].tempNum) + (pile.evens === false ? 1 : 0)) / (pile.evens !== null ? 2 : 1) - 1, numEndWilds);
						if (maxForce > minForce) { // If there is a variable number of "floating" wilds which can be forced to the beginning of a run
							const strippedRun = run.slice(minForce, Util.findLastIndexOf(run, card => card.id !== "ww" || card.num !== null) + 1 || run.length).map(card => card.id.toUpperCase()).join(",");
							const rows = [
								new MessageActionRow().addComponents(new MessageSelectMenu()
									.setCustomId(`game buildphase wilds ${args[1]} ${pileN+1} ${args.slice(3).join(" ")}`)
									.setPlaceholder("Number of wilds")
									.addOptions([...new Array(maxForce - minForce + 1).keys()].map(n => ({label: `${n+minForce} Wild${Util.plural(n+minForce)}`, description: `${"WW,".repeat(n+minForce)}${strippedRun},${"WW,".repeat(numEndWilds-n)}`.slice(0,-1), value: `${n+minForce}`})))),
								new MessageActionRow().addComponents(new MessageButton().setCustomId("hand 0 true").setLabel("Cancel").setStyle("SECONDARY"))
							];
							return Util.update(action, {content: "Choose how many of the wilds should be at the start of the run.\nThe rest of the wilds will be placed at the end.", components: rows, ephemeral: true});
						}
						args[args.length-1] += `${args[args.length-1].length ? ";" : ""}${minForce}`; // minForce === maxForce
						forceWilds.push(minForce);
					} else {
						args[args.length-1] += `${args[args.length-1].length ? ";" : ""}0`;
						forceWilds.push(0);
					}

					validcards.push(...newcards);
					cardgroups.push(newcards);
				}

				if (pileN >= player2.phasePiles.length - 1) { // Greater than, in case the last group of cards needed to have a forceWild selected
					if (!validcards.length) return Util.update(action, {content: "Umm, why?", components: this.displayHand(player).components, ephemeral: true});
					cardgroups.forEach((cards2, i) => this.validatePartialPhase(player2.phasePiles[i], cards2, forceWilds[i])); // Set the wild's temp numbers
					return this.phase(action, player, cardgroups, player2);
				}

				const cardargs = args.slice(3).join(" ");
				const pile2 = player2.phasePiles[pileN + 1];
				const viablecards = player.cards.filter(card => !validcards.includes(card)).map(card => ({label: card.name, value: `${card.id} ${this.cardCounter}`}));
				const rows = [
					new MessageActionRow().addComponents(new MessageSelectMenu()
						.setCustomId(`game buildphase ${args[1]} ${pileN+1}${cardargs.length ? ` ${cardargs}` : ""}`)
						.setPlaceholder("Your Hand")
						.addOptions(viablecards)
						.setMinValues(!pile2.cards.length && !this.getSetting("partialPhasing") ? pile2.min : 1)
						.setMaxValues(Math.max(viablecards.length, 1))),
					new MessageActionRow().addComponents(new MessageButton().setCustomId("hand 0 true").setLabel("Cancel").setStyle("SECONDARY"))
				];
				if (player !== player2 || this.getSetting("partialPhasing") || player.phased) rows[0].components[0].spliceOptions(0, 0, {label: "None", description: "Don't add any cards", value: "NONE"});
				return Util.update(action, {content: `(${pileN+1}) Choose cards for ${player === player2 ? "your" : `${player2.member.displayName}'s`} ${{set: `set of ${pile2.min}${pile2.color ? " of 1 color" : ""}`, run: `run of ${pile2.min}${pile2.evens ? " evens" : (pile2.evens === false ? " odds" : "")}${pile2.color ? " of 1 color" : ""}`, col: `${pile2.min} cards of 1 color`}[pile2.type]}${pile2.cards.length ? ` (${pile2.cards.map(card => card.id.toUpperCase()).join(", ")})` : ""}`, components: rows, ephemeral: true});
			}
			case "discard":
			case "draw": {
				if (this.meta.phase < 2 || player !== this.currentPlayer) return Core.notYet(action);
				if (player.drew) return action.reply({content: "You've already drawn a card", ephemeral: true});
				const discardPile = this.piles.get("discard");
				const drawPile = this.piles.get("draw");
				const topDiscard = discardPile.cards[0];
				const wantDis = args[0] === "discard";
				if (wantDis && (topDiscard.id === "sk" || topDiscard.id === "re")) return action.reply({content: `Can't pick up ${topDiscard.id === "sk" ? "skips" : "reverses"} from the discard pile.`, ephemeral: true});
				const card = wantDis ? discardPile.cards.shift() : drawPile.cards.shift();
				player.cards.push(card);
				if (!drawPile.cards.length) drawPile.cards = this.deckCreate();
				player.drew = card;
				this.meta.actionHistory.push(wantDis ? `${member.displayName} picked up a ${topDiscard.name} from the discard pile` : `${member.displayName} drew a card`);
				this.updateUI(action);
				break;
			}
			default: {
				if (this.meta.phase < 2 || player !== this.currentPlayer) return Core.notYet(action);
				if (!player.drew) return action.reply({content: "Draw a card first", ephemeral: true});
				const card = player.getCards(args[0])[0];
				if (!card) return action.reply({content: `Cannot find card \`${args[0]}\` in your hand`, ephemeral: true});

				let move = "";
				switch(card.id) {
					case "sk": {
						/**@type {PhasePlayer} */
						let player2;
						if (this.players.size === 2) {
							player2 = this.players.find(player3 => player3 !== player);
						} else {
							if (!args[1]) {
								const skippable = this.players.filter(player3 => player3 !== player && (!player3.skips || this.getSetting("skipStacking") || !player3.cards.length));
								if (!skippable.size) return action.reply({content: "There isn't anyone you can skip!", ephemeral: true});
								else if (skippable.size === 1) args[1] = `<@${skippable.first().member.id}>`;
								else {
									const rows = [
										new MessageActionRow().addComponents(new MessageSelectMenu()
											.setCustomId("game")
											.setPlaceholder("Choose who to skip")
											.addOptions(skippable.map(player3 => ({label: player3.member.displayName, description: `Phase ${player3.phases[player3.phase]+1} (${player3.phased ? "" : "Not "}Phased) - ${player3.cards.length} Card${Util.plural(player3.cards.length)}・${player3.score} points`, value: `${args[0]} <@${player3.member.id}>`})))),
										new MessageActionRow().addComponents(new MessageButton().setCustomId("hand 0 true").setLabel("Cancel").setStyle("SECONDARY"))
									];
									return Util.update(action, {content: `Specify a player to skip`, components: rows, ephemeral: true});
								}
							}
							const players = this.getPlayers(args[1]);
							if (players.size > 1) return action.reply({content: `Be more specific! \`${args[1]}\` matched multiple players`, ephemeral: true});
							player2 = players.first();
							if (!player2 || player2 === player) return action.reply({content: "Could not find that player", ephemeral: true});
						}
						if (player2.skips && !this.getSetting("skipStacking") && player.cards.length) return action.reply({content: "They're already skipped", ephemeral: true});
						player2.skips++;
						move = `, skipping ${player2.member.displayName}'s turn`;
						break;
					}
					case "re": {
						if (this.players.size === 2) {
							const doNothing = this.players.reduce((acc, player2) => acc + (player2.lastStand ? 1 : 0), 0) === 1;
							if (!doNothing) this.nextPlayer();
							move = `, skipping ${doNothing ? "Casper" : this.currentPlayer.member.displayName}'s turn`;
						} else {
							this.clockwise = !this.clockwise;
							move = ", reversing the play direction.";
						}
						break;
					}
					case "ww":
						move = ", because they're an idiot";
						break;
				}

				player.drew = null;
				this.meta.actionHistory.push(`${member.displayName} discarded a ${card.name}` + move);
				this.piles.get("discard").cards.unshift(player.grabCard(card));

				if (!player.cards.length) {
					player.drew = null;
					if (this.getSetting("graceRound")) {
						if (this.players.every(player3 => !player3.lastStand)) { // If no one is on their last stand yet
							this.meta.actionHistory.push(`**${member.displayName} went out!** Everyone has one last turn!`);
							this.players.forEach(player3 => player3.lastStand = true);
						} else this.meta.actionHistory.push(`${member.displayName} managed to go out on their last turn!`);
					} else this.meta.actionHistory.push(`**${member.displayName} went out,** winning this round!`);
				}

				this.nextPlayer();
				this.updateUI(action);
				if (this.players.some(player3 => !player3.cards.length) && this.players.every(player3 => !player3.lastStand)) this.render.queue(() => {this.start(action); return Util.emptyPromise()}); // Flushed from updateUI on the previous line
				break;
			}
		}
	}

	nextPlayer() {
		this.currentPlayer.lastStand = false;
		const player = this.currentPlayer = this.players.find(player2 => player2.index === (this.currentPlayer.index + (this.clockwise ? 1 : -1) + this.players.size) % this.players.size);
		if (player.skips) {
			player.skips--;
			this.nextPlayer();
		}
		if (this.players.some(player2 => player2.lastStand) && !player.lastStand) this.nextPlayer();
	}

	/**
	 * @param {MessageComponentInteraction} action - The Interaction to reply to
	 */
	updateUI(action) {
		this.renderTable();

		const display = new MessageEmbed()
			.setTitle(`Current Discarded Card: ${this.piles.get("discard").cards[0]?.name || "Nothing!"}`)
			.setDescription(this.meta.ended ? `${this.currentPlayer.member.displayName} won the game!` : `\`/help phase10\` or [Browse Commands](https://github.com/Bedrockbreaker/unobot/wiki/Phase-10)\nIt is currently ${this.currentPlayer.member.displayName}'s turn`)
			.addField(this.meta.ended ? `${this.currentPlayer.member.displayName} won the game!` : `${this.players.find(player => player.index === (this.currentPlayer.index - 1 + this.players.size) % this.players.size).member.displayName} ${this.clockwise ? `:arrow_right: **${this.currentPlayer.member.displayName}** :arrow_right:` : `:arrow_left: **${this.currentPlayer.member.displayName}** :arrow_left:`} ${this.players.find(player => player.index === (this.currentPlayer.index + 1) % this.players.size).member.displayName}`, this.meta.actionHistory.slice(-3).reverse().join("\n"))
			.setColor(this.players.some(player => !player.cards.length) ? Color.Black : Color.blend(this.players.reduce((acc, player) => Math.min(acc, player.cards.length - 1), 9) / 9, Color.Carmine, Color.Green))
			.setImage("attachment://game.png")
			.setFooter(Util.weighted(...this.tips));
		const btns = new MessageActionRow().addComponents(
			new MessageButton().setCustomId("hand").setLabel(`Show Hand${this.players.some(player => player.ping) ? " (!)" : ""}`).setStyle("PRIMARY"),
			new MessageButton().setCustomId("game phases").setLabel("Show Phases").setStyle("SECONDARY")
		);
		
		this.render.queue(() => {
			/**@type {import("discord.js").MessageOptions} */
			const message = {embeds: [display], components: [btns], files: [new MessageAttachment(this.render.canvas.toBuffer(), `game.png`)]}
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
		super.renderTable();
		this.render.queue(
			() => {
				this.players.forEach(player => {
					this.render.drawText(player.cards.length, player.x + 135, player.y + 35);
					this.render.drawText(`${player.score} pts`, player.x + 90, player.y + 80, "24px Arial");
					if (player.skips) {
						this.render.drawImage("phase/skip.png", player.x - 10, player.y - 10);
						if (player.skips > 1) this.render.drawText(player.skips, player.x + 40, player.y + 35);
					}
					if (this.getSetting("selectionType") || this.phases.some((n, i) => n - i)) this.render.drawText(`${player.phase + (player.phased ? 1 : 0)}/${player.phases.length}`, player.x + 135, player.y + 59, "24px Arial");
					if (player.phased) this.render.drawText(`P${player.phases[player.phase]+1}`, player.x + 90, player.y + 59, "24px Arial", Color.toHexString(Color.White), Color.toHexString(Color.White));
		
					const runSpace = 165 / player.phasePiles.length - 5; // Space allowed for a phase pile
					let h = player.x;
					for (let i = 0; i < player.phasePiles.length; i++) {
						const pile = player.phasePiles[i];
						const runCardSpace = Math.min(28, (runSpace - 28) / (pile.cards.length - 1));
						if (pile.cards.length && pile.type === "run") pile.cards = this.sortRun(pile, pile.cards.sort((card1, card2) => {
							if (card1.id === "ww" || card2.id === "ww") return card1.id === "ww" ? 1 : -1;
							return 0;
						}));
						pile.cards.forEach((card, i) => this.render.drawImage(player.phased ? card.image : "phase/back.png", h + runCardSpace * i, player.y + 90, 28, 40));
						if (player.phased) {
							const cardID = pile.cards.findIndex(card => card.id !== "ww");
							const mult = pile.evens || pile.evens === false ? 2 : 1;
							const start = Number(pile.cards[cardID].id.slice(1)) - cardID * mult; // Only used for if the pile is a run
							const text = pile.type === "run" ? `${pile.evens ? "E" : (pile.evens === false ? "O" : "")}${start}-${start + (pile.cards.length - 1) * mult}` : `${pile.type === "set" ? pile.cards[cardID].id.slice(1) : pile.cards[cardID].id.slice(0, 1).toUpperCase()}`;
							this.render.ctx.font = "37px Arial";
							const width = this.render.ctx.measureText(text).width;
							this.render.ctx.font = "40px Arial";
							this.render.drawText(text, h + (runSpace - width) / 2, player.y + 125, "37px Arial", Color.toHexString(Color.Black), pile.color || pile.type === "col" ? {r: "#e10000", g: "#00b600", b: "#221bb3", y: "#ffde00"}[pile.cards[cardID].id.slice(0, 1)] : Color.toHexString(Color.White));
						}
						h += runSpace + 5;
					}
				});
				return Util.emptyPromise();
			},
			() => this.render.drawImage(this.piles.get("discard").cards[0]?.image || "common/discardpileghost.png", 230, 120, 183, 261)
		);
	}

	drawStatic() {
		super.drawStatic();
		this.render.queue(
			() => this.render.drawImageNow("phase/back.png", 438, 120, 183, 261),
			() => {
				this.players.forEach(player => {
					this.render.drawImage("phase/icon.png", player.x + 90, player.y);
					this.render.drawText(`P${player.phases[player.phase]+1}`, player.x + 90, player.y + 59, "24px Arial", Color.toHexString(Color.Black));
				});
				return Util.emptyPromise();
			},
			() => this.saveCanvas()
		);
	}

	/**
	 * @param {PhasePlayer} player - the player to display their cards to.=
	 */
	displayHand(player) {
		player.ping = false;
		if (this.meta.ended) return {content: "Game Ended!", components: [], ephemeral: true};
		if (!player.cards.length) return {content: "You don't have any cards!", ephemeral: true};
		const display = super.displayHand(player);

		/**@type {MessageSelectMenu} */
		const cardMenu = display.components[0].components[0];
		cardMenu.setOptions(player.cards.sort((card1, card2) => {
			if (card1.id === "ww" || card2.id === "ww") return card1.id === "ww" ? -1 : 1;
				if (card1.id === "sk" || card2.id === "sk") return card1.id === "sk" ? 1 : -1;
				if (card1.id === "re" || card2.id === "re") return card1.id === "re" ? 1 : -1;
				return player.sortBy === "number" ? Number(card1.id.slice(1)) - Number(card2.id.slice(1)) : (card1.id.slice(0,1) < card2.id.slice(0,1) ? -1 : (card1.id.slice(0,1) > card2.id.slice(0,1) ? 1 : Number(card1.id.slice(1)) - Number(card2.id.slice(1))));
		}).map(card => ({label: card.name, description: card === player.drew ? "Newest Card" : "", value: `${card.id}  ${this.cardCounter}`})));

		const row = new MessageActionRow()
		if (player.drew) row.addComponents(new MessageButton().setCustomId("game buildphase player").setLabel(player.phased ? "Hit Cards" : "Phase").setStyle("SECONDARY"))
		else row.addComponents(new MessageButton().setCustomId("game discard").setLabel("Draw from Discard Pile").setStyle("PRIMARY"), new MessageButton().setCustomId("game draw").setLabel("Draw from Draw Pile").setStyle("PRIMARY"));
		if (player.sortBy === "number") row.addComponents(new MessageButton().setCustomId("game sort color").setLabel("Sort by Color").setStyle("SECONDARY"))
		else row.addComponents(new MessageButton().setCustomId("game sort number").setLabel("Sort by Number").setStyle("SECONDARY"));
		display.components.push(row);

		display.content += `\n\n${basePhase.phaseDescs[player.phases[player.phase]]}`;

		return display;
	}

	/**
	 * Generates a series of piles attached to the player, corresponding to their phase
	 * @param {PhasePlayer} player - The player to generate piles for
	 */
	generatePhasePiles(player) {
		player.phasePiles = [];
		switch (player.phases[player.phase]) {
			case 0: // 2 sets of 3
				player.phasePiles.push(new PhasePile([], "set", 3));
				player.phasePiles.push(new PhasePile([], "set", 3));
				break;
			case 1: // 1 set of 3 + 1 run of 4
				player.phasePiles.push(new PhasePile([], "set", 3));
				player.phasePiles.push(new PhasePile([], "run", 4));
				break;
			case 2: // 1 set of 4 + 1 run of 4
				player.phasePiles.push(new PhasePile([], "set", 4));
				player.phasePiles.push(new PhasePile([], "run", 4));
				break;
			case 3: // 1 run of 7
				player.phasePiles.push(new PhasePile([], "run", 7));
				break;
			case 4: // 1 run of 8
				player.phasePiles.push(new PhasePile([], "run", 8));
				break;
			case 5: // 1 run of 9
				player.phasePiles.push(new PhasePile([], "run", 9));
				break;
			case 6: // 2 sets of 4
				player.phasePiles.push(new PhasePile([], "set", 4));
				player.phasePiles.push(new PhasePile([], "set", 4));
				break;
			case 7: // 7 cards of one color
				player.phasePiles.push(new PhasePile([], "col", 7));
				break;
			case 8: // 1 set of 5 + 1 set of 2
				player.phasePiles.push(new PhasePile([], "set", 5));
				player.phasePiles.push(new PhasePile([], "set", 2));
				break;
			case 9: // 1 set of 5 + 1 set of 3
				player.phasePiles.push(new PhasePile([], "set", 5));
				player.phasePiles.push(new PhasePile([], "set", 3));
				break;
			
			case 10: // 1 run of 4 of one color
				player.phasePiles.push(new PhasePile([], "run", 4, true));
				break;
			case 11: // 1 run of 6 of one color
				player.phasePiles.push(new PhasePile([], "run", 6, true));
				break;
			case 12: // 1 run of 4 + 6 cards of one color
				player.phasePiles.push(new PhasePile([], "run", 4));
				player.phasePiles.push(new PhasePile([], "col", 6));
				break;
			case 13: // 1 run of 6 + 4 cards of one color
				player.phasePiles.push(new PhasePile([], "run", 6));
				player.phasePiles.push(new PhasePile([], "col", 4));
				break;
			case 14: // 8 cards of one color
				player.phasePiles.push(new PhasePile([], "col", 8));
				break;
			case 15: // 9 cards of one color
				player.phasePiles.push(new PhasePile([], "col", 9));
				break;
			case 16: // 3 sets of 3
				player.phasePiles.push(new PhasePile([], "set", 3));
				player.phasePiles.push(new PhasePile([], "set", 3));
				player.phasePiles.push(new PhasePile([], "set", 3));
				break;
			case 17: // 1 set of 4 + 1 run of 6
				player.phasePiles.push(new PhasePile([], "set", 4));
				player.phasePiles.push(new PhasePile([], "run", 6));
				break;
			case 18: // 1 set of 5 + 1 run of 5
				player.phasePiles.push(new PhasePile([], "set", 5));
				player.phasePiles.push(new PhasePile([], "run", 5));
				break;
			case 19: // 1 set of 5 + 5 cards of one color
				player.phasePiles.push(new PhasePile([], "set", 5));
				player.phasePiles.push(new PhasePile([], "col", 5));
				break;

			case 20: // 5 sets of 2
				player.phasePiles.push(new PhasePile([], "set", 2));
				player.phasePiles.push(new PhasePile([], "set", 2));
				player.phasePiles.push(new PhasePile([], "set", 2));
				player.phasePiles.push(new PhasePile([], "set", 2));
				player.phasePiles.push(new PhasePile([], "set", 2));
				break;
			case 21: // 1 run of 10
				player.phasePiles.push(new PhasePile([], "run", 10));
				break;
			case 22: // 10 cards of one color
				player.phasePiles.push(new PhasePile([], "col", 10));
				break;
			case 23: // 1 run of 5 of odd numbers of one color + 1 run of 5 of even numbers of one color
				player.phasePiles.push(new PhasePile([], "run", 5, true, false));
				player.phasePiles.push(new PhasePile([], "run", 5, true, true));
				break;
			case 24: // 1 set of 5 + 1 run of 5 odd numbers
				player.phasePiles.push(new PhasePile([], "set", 5));
				player.phasePiles.push(new PhasePile([], "run", 5, false, false));
				break;
			case 25: // 1 set of 5 + 1 run of 5 even numbers
				player.phasePiles.push(new PhasePile([], "set", 5));
				player.phasePiles.push(new PhasePile([], "run", 5, false, true));
				break;
			case 26: // 1 set of 4 + 1 run of 3 + 1 set of 3 of one color
				player.phasePiles.push(new PhasePile([], "set", 4));
				player.phasePiles.push(new PhasePile([], "run", 3));
				player.phasePiles.push(new PhasePile([], "set", 3, true));
				break;
			case 27: // 1 run of 5 + 1 run of 5 odd numbers of one color
				player.phasePiles.push(new PhasePile([], "run", 5));
				player.phasePiles.push(new PhasePile([], "run", 5, true, false));
				break;
			case 28: // 1 run of 5 + 1 run of 5 even numbers of one color
				player.phasePiles.push(new PhasePile([], "run", 5));
				player.phasePiles.push(new PhasePile([], "run", 5, true, true));
				break;
			case 29: // 2 sets of 5
				player.phasePiles.push(new PhasePile([], "set", 5));
				player.phasePiles.push(new PhasePile([], "set", 5));
				break;
		}
	}

	/**
	 * Stringifies an array
	 * 
	 * Ex: `[1,2,3,4,5,30,29,28,21,14,2]` => `"1-5, 30-28, 21, 14, 2"`
	 * @param {number[]} array 
	 */
	compress(array) {
		if (!array.length) return "";
		let str = "";
		let rangeLow = array[0];
		let rangeLength = 1;
		let delta = Math.sign(array[1] - array[0]);
		for (let i = 0; i < array.length-1; i++) {
			const n = array[i];
			const k = array[i+1];
			if (Math.abs(k - n) === 1 && Math.sign(k - n) === delta) {
				rangeLength++;
				continue;
			}
			if (rangeLength > 2) str += `${rangeLow}-${n}, `;
			else if (rangeLength === 2) str += `${rangeLow}, ${n}, `;
			else str += `${n}, `;
			rangeLength = 1;
			rangeLow = k;
			delta = Math.sign(array[i+2] - k);
		}
		if (rangeLength > 2) str += `${rangeLow}-${array[array.length-1]}`;
		else if (rangeLength === 2) str += `${rangeLow}, ${array[array.length-1]}`;
		else str += `${array[array.length-1]}`;
		return str;
	}

	/**
	 * Returns whether the provided cards are valid for a partial phase
	 * @param {PhasePile} pile - The partial phase
	 * @param {PhaseCard[]} cards2 - The cards to test
	 * @param {number} wildStart - The number of wilds required to come at the beginning of the run
	 * @returns {boolean} Whether the cards were valid
	 */
	validatePartialPhase(pile, cards2, wildStart = 0) {
		const cards = pile.cards.slice();
		cards.push(...cards2);
		cards.sort((card1, card2) => {
			if (card1.id === "ww" || card2.id === "ww") {
				if ((card1.num === null && card1.id === "ww") || (card2.num === null && card2.id === "ww")) return card1.num === null && card1.id === "ww" ? 1 : -1;
				return card1.id === "ww" ? 1 : -1;
			}
			return 0; //Number(card1.id.slice(1)) - Number(card2.id.slice(1));
		});
		if (cards.some(card => !card) || cards.every(card => card.id === "ww")) return false; // Also returns false if cards is empty
		switch(pile.type) {
			case "set": {
				const n = cards[0].id.slice(1);
				const c = cards[0].id.substring(0, 1);
				return cards.every(card => (card.id.slice(1) === n && (!pile.color || card.id.startsWith(c))) || card.id === "ww") && cards.length >= pile.min;
			}
			case "run": {
				if (cards.length < pile.min) return false;
				const run = this.sortRun(pile, cards, wildStart);
				return run.length > 0;
			}
			case "col": {
				const c = cards[0].id.substring(0, 1);
				return cards.every(card => card.id.startsWith(c) || card.id === "ww") && cards.length >= pile.min;
			}
		}
	}

	/**
	 * Sorts a valid run into ascending order
	 * @param {PhasePile} pile - The pile with properties to sort the run by
	 * @param {PhaseCard[]} cards - The cards within the run
	 * @param {number} wildStart - The number of wilds required to come at the beginning of the run
	 * @returns {PhaseCard[]} The sorted run, or an empty array if an invalid run
	 */
	sortRun(pile, cards, wildStart = 0) {
		const c = cards[0].id.slice(0, 1);
		const mult = pile.evens === true || pile.evens === false ? 2 : 1;
		const wilds = cards.reduce((acc, card) => acc + (card.id === "ww" ? 1 : 0), 0);
		const extendedWilds = this.getSetting("extendedWilds");
		const moveWilds = this.getSetting("moveWilds");
		const max = 12 + (extendedWilds ? wilds : 0) * mult;
		if (!moveWilds) cards.unshift(...cards.filter(card => card.id === "ww" && card.num === null).slice(0, wildStart).map(card => Util.grab(cards, card)));
		for (let i = max - (pile.evens === false ? (max - 1) % 2 : (pile.evens === true ? max % 2 : 0)); i > (cards.length - 1 - (extendedWilds ? wilds : 0)) * mult; i -= mult) {
			const run = [];
			for (let j = cards.length - 1 - run.length; j >= 0; j--) {
				const n = i - j * mult;
				const card = cards.find(card => ((card.id.slice(1) === n.toString() || card.num === n) && (!pile.color || card.id.startsWith(c))) || (card.id === "ww" && !run.includes(card) && (moveWilds || card.num === null) && ((n > 0 && n < 13) || extendedWilds)));
				if (!card) break;
				if (card.id === "ww" && !moveWilds && card.num === null) card.tempNum = n;
				run.push(card);
			}
			if (run.length === cards.length) return run;
		}
		return [];
	}

	/**
	 * Phases the provided cards into each pile of player2's phase. Cards must be validated beforehand.
	 * @param {MessageComponentInteraction} action
	 * @param {PhasePlayer} player - The player phasing
	 * @param {PhaseCard[][]} cards - The cards to phase
	 * @param {PhasePlayer} player2 - The player to whose phase to add cards to
	 */
	phase(action, player, cards, player2) {
		cards.forEach((cards2, i) => {
			player2.phasePiles[i].cards.push(...cards2);
			cards2.forEach(card => {
				card.num = card.tempNum;
				player.grabCard(card);
			});
		});

		if (!player.phased) {
			if (player.phasePiles.every(pile => pile.cards.length)) {
				player.phased = true;
				this.meta.actionHistory.push(`**${player.member.displayName} phased!**`);
			} else {
				this.meta.actionHistory.push(`${player.member.displayName} has partially phased`);
			}
		} else {
			const cardlength = cards.reduce((acc, cards2) => acc + cards2.length, 0);
			this.meta.actionHistory.push(`${player.member.displayName} added ${cardlength} card${Util.plural(cardlength)} to ${player2 === player ? "their own" : `${player2.member.displayName}'s`} phase`);
		}
		if (!player.cards.length) {
			player.drew = null;
			if (this.getSetting("graceRound")) {
				if (this.players.every(player3 => !player3.lastStand)) { // If no one is on their last stand yet
					this.meta.actionHistory.push(`**${player.member.displayName} went out!** Everyone has one last turn!`);
					this.players.forEach(player3 => player3.lastStand = true);
				} else this.meta.actionHistory.push(`${player.member.displayName} managed to go out on their last turn!`);
			} else this.meta.actionHistory.push(`**${player.member.displayName} went out,** winning this round!`);
			this.nextPlayer();
		}

		this.updateUI(action);
		if (this.players.some(player3 => !player3.cards.length) && this.players.every(player3 => !player3.lastStand)) this.render.queue(() => {this.start(action); return Util.emptyPromise()}); // Flushed from updateUI on the previous line
	}

	/**
	 * @param {string} input 
	 * @returns {Collection<string, PhasePlayer>}
	 */
	getPlayers(input) {
		return super.getPlayers(input);
	}

	/**
	 * @param {MessageEmbed} embed
	 * @param {string[]} command
	 */
	static help(embed, command) {
		embed.setTitle(`Help for \`/g ${command.join(" ")}\` in Phase 10`).setDescription("[Browse Commands](https://github.com/Bedrockbreaker/unobot/wiki/Phase-10)");
		switch(command[0]) {
			case "":
			case undefined:
				embed.setTitle("Help for Phase 10").addField("/help phase10 <command>", "General help command for Phase 10. Use this to receive information on using other commands.\nEx: \`/help phase10 phases\`")
					.addFields(
						{name: "Available Commands", value: "(To discard a card, use `/g <cardId>`)"},
						{name: "phases", value: "/help phase10 phases", inline: true},
						{name: "choose", value: "/help phase10 choose", inline: true},
						{name: "ph", value: "/help phase10 ph", inline: true},
						{name: "draw", value: "/help phase10 draw", inline: true},
						{name: "discard", value: "/help phase10 discard", inline: true})
					.setColor("#FFFFFF");
				break;
			case "phases":
				switch(command[1]) {
					case "":
					case undefined:
						embed.addFields(
							{name: "/g phases", value: "Changes the phases for this game. See `/help phase10 phases all` for their descriptions.\nEx: `/g phases add 15-21`"},
							{name: "Available Sub-Commands", value: "Use with no sub-commands during a game to get a list of all phases for that game"},
							{name: "add", value: "/help phase10 phases add", inline: true},
							{name: "remove", value: "/help phase10 phases remove", inline: true},
							{name: "set", value: "/help phase10 phases set", inline: true},
							{name: "all", value: "/help phase10 phases all", inline: true})
							.setColor(Color.White);
						break;
					case "add":
					case "a":
					case "+":
						embed.addField("/g phases add <num>[-<num>]", "Adds phases to the game. Multiple of the same phase can exist.\nAliases: `/g phases a`, `/g phases +`\nEx: `/g phases add 11` or `/g phases add 15-21`").setColor(Color.Forest);
						break;
					case "remove":
					case "rem":
					case "-":
						embed.addField("/g phases remove <num>[-<num>]", "Removes all occurences of the specified phases.\nAliases: `/g phases rem`, `/g phases -`\nEx: `/g phases remove 11` or `/g phases remove 15-21`").setFooter("Not to be confused with her twin sister Ram").setColor(Color.Carmine);
						break;
					case "set":
						embed.addField("/g phases set <num>[-<num>][,<num>[-<num>][,<num>...]]", "Sets the phases for the game.\nEx: `/g phases set 1-5,10-6,21,14,1-2`").setColor(Color.randomColor())
						break;
					case "all":
						embed.setTitle("Phases in Phase 10")
							.setDescription(basePhase.phaseDescs.reduce((acc, phase, i) => `${acc}${i+1}. ${phase}\n`, ""))
							.setColor(Color.randomColor());
						break;
					default:
						embed.addField("Unknown command", "Did you spell it correctly?").setColor(Color.Carmine);
						break;
				}
				break;
			case "choose":
			case "c":
				embed.addField("/g choose <phase>", "If manual phase selection is on, chooses your next phase.\nAlias: `/g c`\nEx: `/g choose 7`").setColor(Color.Forest);
				break;
			case "ph":
				embed.addField("/g ph <player> <cardId1>[;<cardId2>[;<cardId3>...]];<s1>[ <cardId4>[;<cardId5>...]];<s2>[ ...]", "Deprecated. Don't use.\nEach group of cards will attempted to be added to that player's phase piles.\n`<sN>` is the number of wilds required to appear at the beginning of the phase.\nEx: `/g ph Bob r2;b3;g4;ww;y5;1 g1;g7;ww;g2;g3;0`").setColor(Color.Purple);
				break;
			case "draw":
				embed.addField("/g draw", "Draws a card from the draw pile.\nEx: `/g draw`").setColor(Color.randomColor());
				break;
			case "discard":
				embed.addField("/g discard", "Draws a card from the discard pile.\nEx: `/g discard`").setColor(Color.Forest);
				break;
			default:
				embed.addField("Unknown command", "Did you spell it correctly?").setColor(Color.Carmine);
				break;
		}
	}
}

class PhasePlayer extends Player {
	/**
	 * @param {GuildMember} member - The member associated with the player
	 * @param {boolean} isLeader - If the player is a leader/host over a game
	 */
	constructor(member, isLeader = false) {
		super(member, [], isLeader);

		/**@type {PhaseCard[]} */
		this.cards;

		/** 
		 * How to sort this player's hand
		 * @type {"number"|"color"}
		 */
		this.sortBy = "number";
		
		/** The player's score */
		this.score = 0;

		/** The index in player.{@link phases} the player is on */
		this.phase = 0;

		/** 
		 * The phases this player has to complete
		 * @type {number[]}
		 */
		this.phases = [];

		/**
		 * Array of piles corresponding to the player's phase
		 * @type {PhasePile[]}
		 */
		this.phasePiles = [];

		/** Whether the player has phased this round or not */
		this.phased = false;

		/** Whether the player is in the process of choosing their next phase while in between rounds */
		this.choosePhase = false;

		/** How many skips are on this player currently */
		this.skips = 0;

		/**
		 * Whether the player has drawn on their turn yet or not. If so, contains the card they last drew.
		 * @type {PhaseCard}
		 */
		this.drew = null;

		/** Whether or not the player is on their last turn, if the grace round is enabled */
		this.lastStand = false;
	}

	/**
	 * @param {string} [argument] - The string formatted in "card selection syntax"
	 * @returns {PhaseCard[]} The cards which match the specified argument
	 */
	getCards(argument) {
		return super.getCards(argument);
	}
}

class PhasePile extends Pile {
	/**
	 * @param {PhaseCard[]} [cards] - The cards in the pile
	 * @param {"run"|"set"|"col"|""} [type] - The "type" of this pile: A run, a set, or cards of 1 color
	 * @param {number} [min] - The minimum number cards in this pile in order to partial phase
	 * @param {boolean} [color] - Whether this pile enforces cards of 1 color (If it's not already a colored pile)
	 * @param {boolean?} [evens] - The parity of the cards within the pile. If null, no parity.
	 */
	constructor(cards = [], type = "", min = 0, color = false, evens = null) {
		super(cards);

		/** The "type" of this pile: A run, a set, or cards of 1 color */
		this.type = type;
		/** The minimum number cards in this pile in order to partial phase */
		this.min = min;
		/** Whether this pile enforces cards of 1 color */
		this.color = color;
		/** The parity of the cards within the pile. If null, no parity. */
		this.evens = evens;
	}
}

class PhaseCard extends Card {
	/**
	 * @param {string} id - The id of the card
	 * @param {string} [name] - The Human-Readable name of the card, defaults to the id
	 * @param {string|""} [image] - The URL to the image of the card
	 */
	constructor(id, name, image = "") {
		super(id, name, image);

		/**
		 * The number of this card, if it's a Wild
		 * @type {number}
		 */
		this.num = null;

		/**
		 * Temporary assignment for `num`, for processing
		 * @type {number}
		 */
		this.tempNum = null;
	}
}