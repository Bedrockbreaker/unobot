import Discord from "discord.js";
import Canvas from "canvas";
import {Core, Player, Pile, Card} from "./core.js";

/**
 * Phase 10
 * @class
 */
export default class basePhase extends Core {
	/**@param {Discord.GuildChannel} channel - The channel to send updates to*/
	constructor(channel) {
		let rules = {
			partialPhasing: ["Partial Phasing - :asterisk:", "If  a portion of a phase is completed, you can lay it down to remove points from your hand", "*️⃣"],
			moveWilds: ["Movable Wilds - :twisted_rightwards_arrows:", "Wilds can be moved around within a run", "🔀"],
			extendedWilds: ["Extended Wilds - :hash:", "Wilds can act as numbers beyond 1-12.", "#️⃣"],
			skipStacking: ["Skip Stacking - :fast_forward:", "Skips can be stacked on players who are already skipped", "⏩"],
			graceRound: ["Last Stand - :repeat_one:", "After someone phases, everyone has one final turn", "🔂"],
			reverses: ["Reverse Cards - :track_previous:", "Adds 8 reverse cards to the game (15 points each)", "⏮️"],
			selectionType: ["Phase Selection: Normal", "Type `!ps 𝘵𝘺𝘱𝘦` to change.\nPhase Selection can be `Normal, Rand, RandomNoRepeats, Manual`"],
			phases: ["Phases: 1-10", "Type `!phases` for information on how to re-order/change allowed phases\nSupports up to 30 phases"]
		}
		let phaseDescs = ["2 sets of 3", "1 set of 3 + 1 run of 4", "1 set of 4 + 1 run of 4", "1 run of 7", "1 run of 8",
			"1 run of 9", "2 sets of 4", "7 cards of one color", "1 set of 5 + 1 set of 2", "1 set of 5 + 1 set of 3",
			"1 run of 4 of one color", "1 run of 6 of one color", "1 run of 4 + 6 cards of one color", "1 run of 6 + 4 cards of one color", "8 cards of one color",
			"9 cards of one color", "3 sets of 3", "1 set of 4 + 1 run of 6", "1 set of 5 + 1 run of 5", "1 set of 5 + 5 cards of one color",
			"5 sets of 2", "1 run of 10", "10 cards of one color", "1 run of 5 of odd numbers of one color + 1 run of 5 of even numbers of one color", "1 set of 5 + 1 run of 5 odd numbers",
			"1 set of 5 + 1 run of 5 even numbers", "1 set of 4 + 1 run of 3 + 1 set of 3 of one color", "1 run of 5 + 1 run of 5 odd numbers of one color", "1 run of 5 + 1 run of 5 even numbers of one color", "2 sets of 5"]
		super("Phase 10", channel, rules, {selectionType: 0, phases: [...new Array(10).keys()], phaseDescs, clockwise: true});
	}

	setup() {
		super.setup();
		this.render.queue(() => Canvas.loadImage("images/phase/skip.png").then(image => this.render.images.skip = image));
	}

	/**
	 * @param {Discord.GuildMember} member - The member to generate a player for
	 * @param {Boolean} isLeader - Whether the new player is a leader
	 */
	genDefaultPlayer(member, isLeader) {
		return new Player(member, [], isLeader, 0, {}, {phase: 0, phases: [], phased: false, score: 0, skips: 0}); // Phase represents the index in phases, not the phase itself
	}

	start() {
		if (Object.keys(this.players).length < 2) return this.meta.channel.send("Not enough players!");
		if (!this.meta.traits.phases.length) return this.meta.channel.send("There aren't any phases to play!");
		if (this.meta.phase < 2) this.getRules();  // Because start() can be called multiple times

		this.meta.currentPlayer = null; // No funny business with trying to phase between rounds

		let choosePhase = false;
		const players = Object.values(this.players);
		for (let j = 0; j < players.length; j++) {
			const player = players[j];
			if (this.meta.phase < 2) player.traits.phases = [...this.meta.traits.phases];
			player.traits.score += this.score(player.cards);
			if (player.traits.phased) player.traits.phase++;

			if (player.traits.phase === player.traits.phases.length) {
				const completed = [player, ...Object.values(this.players).filter(player2 => player2.traits.phased && player2.traits.phase === player2.traits.phases.length - 1)];
				let lowScore = Number.MAX_SAFE_INTEGER;
				let winner;
				for (let i = 0; i < completed.length; i++) {
					if (completed[i].traits.score < lowScore) { // If there's a tie, it's whoever first joined the game gets to win ¯\_(ツ)_/¯
						lowScore = completed[i].traits.score;
						winner = completed[i];
					}
				}
				this.meta.channel.send(`${winner.member.displayName} wins the entire game, with ${lowScore} points!`);
				this.meta.ended = true;
				return;
			}

			switch(this.meta.traits.selectionType) {
				case 1: // Random
					if (this.meta.phase < 2) player.traits.phases = player.traits.phases.map(() => Math.floor(Math.random()*player.traits.phases.length));
					break;
				case 2: // Random no Repeats
					if (this.meta.phase < 2) Core.shuffle(player.traits.phases);
					break;
				case 3: // Manual
					if (player.traits.phased || this.meta.phase < 2) player.traits.choosePhase = choosePhase = true;
					if (player.traits.choosePhase) {
						const list = new Discord.MessageEmbed()
							.setTitle("Choose Your Next Phase")
							.setDescription("Phases Left:")
							.setColor(Math.floor(Math.random() * 16777215))
							.setFooter("!choose 𝘯𝘶𝘮");
						player.traits.phases.slice(player.traits.phase).forEach(phase => list.description += `\n${phase + 1}: ${this.meta.traits.phaseDescs[phase]}`);
						player.member.send(list);
					}
					break;
			}
			player.traits.phased = false;
		}
		this.meta.phase = 2;
		if (choosePhase) return this.meta.channel.send("Waiting for players to choose their next phase..");

		this.randomizePlayerOrder();
		this.piles.draw = new Pile();
		this.piles.discard = new Pile();
		this.deckCreate();
		this.piles.discard.cards.unshift(this.piles.draw.cards.shift());
		players.forEach(player => {
			player.cards = this.piles.draw.cards.splice(0, 10);
			this.generatePhasePiles(player);
		});

		this.meta.currentPlayer = players.find(player => !player.index);
		this.meta.actionHistory.push("The game has just started!");
		switch(this.piles.discard.cards[0].id) {
			case "ww":
				this.meta.actionHistory.push(`${this.meta.currentPlayer.member.displayName} gets a free birthday present`);
				break;
			case "re":
				this.meta.traits.clockwise = !this.meta.traits.clockwise;
			case "sk":
				this.meta.actionHistory.push(`${this.meta.currentPlayer.member.displayName} was skipped due to the starting card!`);
				this.nextPlayer();
				break;
		}
		this.dealCards(players);
		this.render.ctx.fillStyle = "#FFFFFF";
		this.meta.channel.send(`Play order: ${players.sort((player1, player2) => player1.index - player2.index).reduce((acc, player) => {return `${acc}${player.member.displayName}, `}, "").slice(0,-2)}\nGo to <https://github.com/Bedrockbreaker/unobot/wiki/Phase-10> for Phase 10-specifc commands.`);
		super.start();
		this.updateUI();
		this.resetTimeLimit();
	}

	/** Creates a deck of cards for the draw pile */
	 deckCreate() {
		/** @type {Card[]} */
		let cards = [];
		const c = ["r","g","b","y"];
		const colors = ["Red", "Green", "Blue", "Yellow"];
		const url = "images/phase/";
		for (let k = 0; k < Math.ceil(Object.keys(this.players).length/6); k++) {
			for (let i = 0; i < 4; i++) {
				cards.push(new Card("ww", "Wild", `${url}ww.png`), new Card("ww", "Wild", `${url}ww.png`), new Card("sk", "Skip", `${url}sk.png`));
				if (this.meta.rules.reverses) cards.push(new Card("re", "Reverse", `${url}re.png`), new Card("re", "Reverse", `${url}re.png`));
				for (let j = 1; j < 12; j++) {
					cards.push(new Card(`${c[i]}${j}`, `${colors[i]} ${j}`, `${url}${c[i]}${j}.png`), new Card(`${c[i]}${j}`, `${colors[i]} ${j}`, `${url}${c[i]}${j}.png`));
				}
			}
		}
		Core.shuffle(cards);
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
			let player = this.players[member.id];
			member = player.member; // If the player sends a command through their DMs, the original "member" is actually a User.
			switch(args[0]) {
				case "phasetype":
				case "ps":
					// TODO: edit rules message to reflect new value
					if (this.meta.phase >= 2) return channel.send("Can't change phase selection after the game has started!");
					if (!player.isLeader) return channel.send("Only the leader can change that!");
					switch(args[1]?.toLowerCase()) {
						case "normal":
						case "n":
							this.meta.traits.selectionType = 0;
							channel.send("Phase selection is now normal!");
							break;
						case "random":
						case "r":
							this.meta.traits.selectionType = 1;
							channel.send("Phase selection is now random!");
							break;
						case "randomnorepeats":
						case "rnr":
							this.meta.traits.selectionType = 2;
							channel.send("Phase selection is now random with no repeats!");
							break;
						case "manual":
						case "m":
							this.meta.traits.selectionType = 3;
							channel.send("Phase selection is now manual!");
							break;
						default:
							channel.send(`Incorrect argument! (Try something like \`!${args[0]} normal\`.\nAllowed types: \`Normal, n, Random, r, RandomNoRepeats, rnr, Manual, m\`)`);
							break;
					}
					break;
				case "phases":
					switch (args[1]) {
						case "all": {
							const embed = new Discord.MessageEmbed()
								.setTitle("All Phases:")
								.setDescription(this.meta.phase < 2 ? this.meta.traits.phaseDescs.map((desc, i) => `${i + 1}. ${desc}`) : this.meta.traits.phases.map(phase => `${phase + 1}. ${this.meta.traits.phaseDescs[phase]}`))
								.setColor(Math.floor(Math.random() * 16777215))
								.setFooter(this.meta.phase < 2 ? "Type \"!phases\" to change which phases will be played" : "");
							const enabled = this.meta.traits.phases.map(phase => `${phase + 1}. ${this.meta.traits.phaseDescs[phase]}`);
							if (this.meta.phase < 2) embed.addField("Enabled Phases:", enabled.length ? enabled : "¯\\_(ツ)_/¯");
							channel.send(embed);
							break;
						}
						case "add":
						case "a":
						case "+": {
							if (this.meta.phase > 2) return channel.send("Can't add phases once the game has started!");
							if (!args[2]) return channel.send(`Specify a phase to add! (Try something like \`!${args.join(" ")} 11\`)`);
							const nums = args[2].split("-").map(num => Math.min(30, Math.max(1, Math.floor(Number(num)))));
							if (isNaN(nums[0])) return channel.send(`\`${args[2]}\` is not a valid phase!`);
							if (nums[1] < nums[0]) [nums[0], nums[1]] = [nums[1], nums[0]];
							const phases = [...new Array(nums[1] ? nums[1] - nums[0] + 1 : 1).fill().keys()].map(n => n + nums[0] - 1);
							this.meta.traits.phases.push(...phases);
							channel.send(`Added phase${Core.plural(phases.length)} ${phases.map(n => n + 1).join(", ")}`);
							break;
						}
						case "subtract":
						case "sub":
						case "s":
						case "remove":
						case "rem": // Not to be confused with her twin sister, ram
						case "r":
						case "-": {
							if (this.meta.phase > 2) return channel.send("Can't remove phases once the game has started!");
							if (!args[2]) return channel.send(`Specify a phase to remove! (Try something like \`!${args.join(" ")} 3\`)`);
							const nums = args[2].split("-").map(num => Math.min(30, Math.max(1, Math.floor(Number(num)))));
							if (isNaN(nums[0])) return channel.send(`\`${args[2]}\` is not a valid phase!`);
							if (nums[1] < nums[0]) [nums[0], nums[1]] = [nums[1], nums[0]];
							const phases = [...new Array(nums[1] ? nums[1] - nums[0] + 1 : 1).fill().keys()].map(n => n + nums[0] - 1);
							for (let i = 0; i < phases.length; i++) {
								this.meta.traits.phases = this.meta.traits.phases.filter(phase => phase !== phases[i]);
							}
							channel.send(`Removed phase${Core.plural(phases.length)} ${phases.map(n => n + 1).join(", ")}`);
							break;
						}
						default: {
							const embed = new Discord.MessageEmbed()
							if (this.meta.phase < 2) {
								embed.setTitle("How to Change Available Phases:")
									.addField("`!phases add 𝘯𝘶𝘮`", "Adds phase 𝘯𝘶𝘮 to the end of the list of phases\nEx: `!phases add 14` adds phase 14 to end of the list")
									.addField("`!phases add 𝘯𝘶𝘮-𝘯𝘶𝘮`", "Adds a range of phases, 𝘯𝘶𝘮-𝘯𝘶𝘮, to the end of the list of phases\nEx: `!phases add 21-27` adds phases 21-27 to the end of the list")
									.addField("`!phases rem 𝘯𝘶𝘮`", "Removes all occurrences of phase 𝘯𝘶𝘮 from the list of phases\nEx: `!phases rem 10` removes all occurrences of phase 10 from the list")
									.addField("`!phases rem 𝘯𝘶𝘮-𝘯𝘶𝘮`", "Removes all occurrences of phases 𝘯𝘶𝘮-𝘯𝘶𝘮 from the list of phases\nEx: `!phases rem 1-5` removes all occurrences of phases 1-5 from the list")
									.setColor(Math.floor(Math.random() * 16777215))
									.setFooter("Type \"!phases all\" for a list of all phases");
							} else {
								embed.setTitle("Everyone's Phases:")
								.setDescription(Object.values(this.players).map(player => `${player.member.displayName}: P${player.traits.phases[player.traits.phase] + 1} - ${this.meta.traits.phaseDescs[player.traits.phases[player.traits.phase]]}`))
								.setColor(Math.floor(Math.random() * 16777215))
								.setFooter("Type \"!phases all\" for a list of all phases");
							}
							channel.send(embed);
							break;
						}
					}
					break;
				case "choose":
				case "c": {
					if (!player.traits.choosePhase) break;
					if (!args[1]) return channel.send(`Specify the phase you'll play next! (Try something like \`!${args[0]} ${player.traits.phases[player.traits.phase]}\`)\nType \`!phases all\` for a list of phase descriptions`);
					const phase = player.traits.phases.slice(player.traits.phase).findIndex(n => n + 1 === Number(args[1]));
					if (phase < 0) return channel.send(`${args[1]} is not a valid phase!`);
					player.traits.phases.splice(player.traits.phase, 0, player.traits.phases.splice(player.traits.phase + phase, 1)[0]);
					player.traits.choosePhase = false;
					channel.send(`You have chosen phase ${player.traits.phases[player.traits.phase] + 1}: ${this.meta.traits.phaseDescs[player.traits.phases[player.traits.phase]]}`);
					if (Object.values(this.players).every(player => !player.traits.choosePhase)) this.start();
					break;
				}
				case "phase":
				case "ph": {
					if (this.meta.traits < 2) break;
					if (player !== this.meta.currentPlayer) return channel.send("It isn't your turn!");
					if (!player.traits.drew) return channel.send("Draw a card first, using `!d` or `!dis`!");
					if (args.length === 1) {
						if (!player.traits.phased) return channel.send(`Specify the cards you're phasing with! (\`!${args[0]} ${new Array(player.traits.phasePiles.length).fill().map((n, i) => new Array(player.traits.phasePiles[i].traits.min).fill().map((m, j) => `𝘪𝘥${j + 1}`).join(";")).join(" ")}\`)`);
						return channel.send(`Specify the cards you're contributing! (\`!${args[0]} ${new Array(player.traits.phasePiles[0].traits.min).fill().map((n, i) => `𝘪𝘥${i + 1}`).join(";")} 𝘯𝘢𝘮𝘦\`)\n\`𝘯𝘢𝘮𝘦\` can be blank for yourself, or an @ or any portion of a username of nickname of someone else`);
					}
					/**@type {Card[][]} */
					const cards = [];
					for (let j = 1; j < (player.traits.phased ? 2 : args.length); j++) {
						let phaseCards = args[j].split(";");
						cards.push([]);
						for (let i = 0; i < phaseCards?.length; i++) {
							const card2 = player.getCards(phaseCards[i].split(".")[0], phaseCards[i].split(".")[1])[0];
							if (card2 && card2.id !== "re" && card2.id !== "sk") {
								player.cards.splice(player.cards.findIndex(card3 => card3 === card2), 1);
								cards[j-1].push(card2);
							}
						}
					}
					player.cards = player.cards.concat(cards.flat());

					const canPhase = [];
					if (player.traits.phased || (!cards[1] && this.meta.rules.partialPhasing)) {
						/**@type {Player} */
						let player2 = (!player.traits.phased || !args[2]) ? [player] : this.getPlayers(args[2]);
						if (player2.length > 1) return channel.send(`Be more specific! \`${args[2]}\` matched multiple players`);
						player2 = player2[0];
						if (!player2) return channel.send("Could not find that player");
						if (player2 !== player && !player.traits.phased) return channel.send("They haven't phased yet!");

						for (let i = 0; i < player2.traits.phasePiles.length; i++) {
							canPhase.push(this.validatePartialPhase(player2.traits.phasePiles[i], cards[0], args[args.length-1] === "s" ? cards[0].findIndex(card => card.id !== "ww") : 0));
						}
						const n = (Math.min(canPhase.length, Math.max(1, Math.floor(Number(args[3])))) || canPhase.findIndex(b => b) + 1) - 1;
						if (!canPhase[n]) return channel.send(`Can't add only \`${cards[0].map(card => card.name).join(", ") || "your imaginary cards"}\` to ${player2 === player ? "your" : `${player2.member.displayName}'s`} phase!`);
						if (player.cards.length - cards[0].length < player.traits.phasePiles.reduce((acc, pile) => acc + (!pile.cards.length && pile !== player2.traits.phasePiles[n] ? pile.traits.min : 0), 0)) return channel.send("You wouldn't have enough cards to phase afterwards!");
						player2.traits.phasePiles[n].cards.push(...cards[0]);
						cards[0].forEach(card => player.cards.splice(player.cards.findIndex(card2 => card2 === card), 1));
						if (!player.traits.phased) {
							if (player2 === player && player.traits.phasePiles.every(pile => pile.cards[0])) {
								this.meta.actionHistory.push(`**${member.displayName} phased!**`);
								player.member.send("You've phased! Place cards in existing piles with `!ph 𝘪𝘥1;𝘪𝘥2;𝘪𝘥3 𝘯𝘢𝘮𝘦` now.\n\`𝘯𝘢𝘮𝘦\` can be blank for yourself, or an @ or any portion of a username of nickname of someone else");
								player.traits.phased = true;
							} else {
								this.meta.actionHistory.push(`${member.displayName} has partially phased`);
							}
						} else {
							this.meta.actionHistory.push(`${member.displayName} added ${cards[0].length} card${Core.plural(cards[0].length)} to ${player2 === player ? "their own" : `${player2.member.displayName}'s`} phase`);
						}
					} else {
						for (let i = 0; i < player.traits.phasePiles.length; i++) {
							canPhase.push(this.validatePartialPhase(player.traits.phasePiles[i], cards[i], args[args.length-1] === "s" ? cards[i].findIndex(card => card.id !== "ww") : 0));
						}
						if (!canPhase.every(b => b)) return channel.send(`Can't phase with those cards!`);
						for (let i = 0; i < canPhase.length; i++) {
							player.traits.phasePiles[i].cards = cards[i];
							cards[i].forEach(card => player.cards.splice(player.cards.findIndex(card2 => card2 === card), 1));
						}
						player.traits.phased = true;
						this.meta.actionHistory.push(`**${member.displayName} phased!**`);
						player.member.send("You've phased! Place cards in existing piles with `!ph 𝘪𝘥1;𝘪𝘥2;𝘪𝘥3 𝘯𝘢𝘮𝘦` now.\n\`𝘯𝘢𝘮𝘦\` can be blank for yourself, or an @ or any portion of a username of nickname of someone else");
					}
					const players = Object.values(this.players);
					if (!player.cards.length) {
						player.traits.drew = false;
						if (this.meta.rules.graceRound) {
							this.dealCards([player]);
							if (players.every(player2 => !player2.traits.lastStand)) {
								this.meta.actionHistory.push(`**${member.displayName} has gone out!** Everyone has one last turn!`);
								players.forEach(player2 => player2.traits.lastStand = true);
							} else this.meta.actionHistory.push(`${member.displayName} managed to go out on their last turn!`);
						} else this.meta.actionHistory.push(`**${member.displayName} has gone out,** winning this round!`);
						this.nextPlayer();
					} else this.dealCards([player]);
					if (players.every(player2 => player2.cards.length) || players.some(player2 => player2.traits.lastStand)) this.updateUI();
					if (players.some(player2 => !player2.cards.length) && players.every(player2 => !player2.traits.lastStand)) this.start();
					break;
				}
				case "discard":
				case "draw":
				case "dis":
				case "d":
					if (this.meta.traits < 2 || player !== this.meta.currentPlayer) break;
					if (player.traits.drew) return channel.send("You've already drawn a card!");
					const discard = this.piles.discard.cards[0];
					const wantDis = args[0] === "dis" || args[0] === "discard";
					if (wantDis && (discard.id === "sk" || discard.id === "re")) return channel.send(`Can't pick up ${discard.id === "sk" ? "skips" : "reverses"} from the discard pile.`);
					player.cards.push(wantDis ? this.piles.discard.cards.shift() : this.piles.draw.cards.shift());
					if (!this.piles.draw.cards.length) this.deckCreate();
					player.traits.drew = true;
					this.meta.actionHistory.push(wantDis ? `${member.displayName} picked up a ${discard.name} from the discard pile` : `${member.displayName} drew a card`);
					this.dealCards([player]);
					this.updateUI();
					break;
				default: {
					if (this.meta.traits < 2 || player !== this.meta.currentPlayer) break;
					if (!player.traits.drew) return channel.send("Draw a card first, using `!d` or `!dis`!");
					const card = player.getCards(args[0].split(".")[0], args[0].split(".")[1])[0];
					if (!card) return channel.send(`Cannot find card \`${args[0]}\` in your hand`);
					let action = "";
					const players = Object.values(this.players);
					switch(card.id) {
						case "sk": {
							/**@type {Player} */
							let player2;
							if (players.length === 2) {
								player2 = players.find(player3 => player3 !== player);
							} else {
								if (!args[1]) return channel.send("Specify a player to skip! (`!sk 𝘱𝘭𝘢𝘺𝘦𝘳`. Accepts name/nickname, portions of the name, or @)");
								let player2 = this.getPlayers(args[1]);
								if (player2.length > 1) return channel.send(`Be more specific! \`${args[1]}\` matched multiple players`);
								player2 = player2[0];
								if (!player2 || player2 === player) return channel.send("Could not find that player");
								if (!player2.cards.length && players.reduce((acc, player3) => acc + (player3.traits.lastStand ? 1 : 0), 0) > 1) return channel.send("They're already out of the game");
							}
							if (player2.traits.skips && !this.meta.rules.skipStacking) return channel.send("They're already skipped!");
							player2.traits.skips++;
							action = `, skipping ${player2.member.displayName}'s turn`;
							break;
						}
						case "re": {
							if (players.length === 2) {
								const doNothing = players.reduce((acc, player2) => acc + (player2.traits.lastStand ? 1 : 0), 0) === 1;
								if (!doNothing) this.nextPlayer();
								action = ` skipping, ${doNothing ? "Casper" : this.meta.currentPlayer.member.displayName}'s turn`;
							} else {
								this.meta.traits.clockwise = !this.meta.traits.clockwise;
								action = ", reversing the play direction.";
							}
							break;
						}
						case "ww":
							action = ", because they're an idiot";
							break;
					}
					player.traits.drew = false;
					this.meta.actionHistory.push(`${member.displayName} discarded a ${card.name}` + action);
					this.piles.discard.cards.unshift(player.cards.splice(player.cards.findIndex(card2 => card2 === card), 1)[0]);
					if (!player.cards.length) {
						if (this.meta.rules.graceRound) {
							this.dealCards([player]);
							if (players.every(player2 => !player2.traits.lastStand)) {
								this.meta.actionHistory.push(`**${member.displayName} has gone out!** Everyone has one last turn!`);
								players.forEach(player2 => player2.traits.lastStand = true);
							} else this.meta.actionHistory.push(`${member.displayName} managed to go out on their last turn!`);
						} else this.meta.actionHistory.push(`**${member.displayName} has gone out,** winning this round!`);
					} else this.dealCards([player]);
					this.nextPlayer();
					if (players.every(player2 => player2.cards.length) || players.some(player2 => player2.traits.lastStand)) this.updateUI();
					if (players.some(player2 => !player2.cards.length) && players.every(player2 => !player2.traits.lastStand)) this.start();
					break;
				}
			}
		}
	}

	nextPlayer() {
		const pLength = Object.keys(this.players).length;
		const players = Object.values(this.players);
		if (this.meta.currentPlayer.traits.lastStand) this.meta.currentPlayer.traits.lastStand = false;
		const player = this.meta.currentPlayer = players.find(player2 => player2.index === ((this.meta.currentPlayer.index + (this.meta.traits.clockwise ? 1 : -1)) + pLength) % pLength);
		if (player.traits.skips) {
			player.traits.skips--;
			this.nextPlayer();
		}
		if (players.some(player2 => player2.traits.lastStand) && !player.traits.lastStand) this.nextPlayer();
		this.resetTimeLimit();
	}

	updateUI() {
		this.renderTable();
		this.render.queue(() => {
			const display = new Discord.MessageEmbed();
			const players = Object.values(this.players);
			const lowCard = players.reduce((acc, player) => Math.min(acc, player.cards.length), 10);
			display.setTitle(`It is currently ${this.meta.currentPlayer.member.displayName}'s turn`)
				.attachFiles(new Discord.MessageAttachment(this.render.canvas.toBuffer(), "game.png"))
				.setDescription(this.meta.actionHistory.slice(-3).reverse().join("\n"))
				.setColor(players.some(player => player.traits.lastStand) ? [0, 0, 0] : [Math.max(0, Math.min(255, -510*(lowCard/10 - 1))), Math.max(0, Math.min(255, 51*lowCard)), 0])
				.setImage("attachment://game.png")
				.setFooter(`${players.map(player => `${player.member.displayName}'s score: ${player.traits.score}`).join(" · ")} · !phases`);
			return this.meta.channel.send(display);
		});
		this.render.flush();
	}

	/**@param {Player} player - The player to remove from the game*/
	removePlayer(player) {
		this.piles.discard.cards = this.piles.discard.cards.concat(player.cards);
		this.meta.deletePlayer = player.member.id;
		Object.values(this.players).forEach(player2 => {
			if (player2.index > player.index) player2.index--;
		});
		delete this.players[player.member.id];
		if (player === this.meta.currentPlayer) this.nextPlayer();
		this.drawStatic().then(() => this.updateUI());
		if (Object.keys(this.players).length === 1) {
			this.meta.channel.send(`${Object.values(this.players)[0].member.displayName} won the game!`);
			this.meta.ended = true;
		}
	}

	renderTable() {
		this.render.queue(() => this.render.drawImage(this.render._canvas, 0, 0));
		const pLength = Object.keys(this.players).length;
		const players = Object.values(this.players);
		
		players.forEach(player => {
			const x = -300*Math.cos(2*Math.PI*player.index/pLength);
			const y = -200*Math.sin(2*Math.PI*player.index/pLength);

			this.render.drawText(player.cards.length, x + 480, y + 241);
			if (player.traits.skips) {
				this.render.queue(() => this.render.drawImage(this.render.images.skip, x + 330, y + 200));
				if (player.traits.skips > 1) this.render.drawText(player.traits.skips, x + 335, y + 205);
			}
			if (this.meta.traits.selectionType || this.meta.traits.phases.some((n, i) => n - i)) this.render.drawText(`${player.traits.phase + player.traits.phased}/${player.traits.phases.length}`, x + 475, y + 280, "24px Arial");

			if (player.traits.phased) {
				this.render.queue(() => {
					this.render.ctx.fillStyle = "#00b600";
					this.render.ctx.font = "24px Arial";
					this.render.ctx.fillText(`P${player.traits.phases[player.traits.phase] + 1}`, x + 432, y + 280);
					this.render.ctx.fillStyle = "#ffffff";
					this.render.ctx.font = "40px Arial";
					return new Promise((res, rej) => res());
				});
			}

			const runSpace = 165 / player.traits.phasePiles.length - 5; // Space allowed for a partial phase
			let h = x + 340;
			for (let i = 0; i < player.traits.phasePiles.length; i++) {
				/**@type {Pile} */
				const pile = player.traits.phasePiles[i];
				const runCardSpace = Math.min(28, (runSpace - 28) / (pile.cards.length - 1));
				if (pile.traits.type === "run") pile.cards = this.sortRun(pile, pile.cards.sort((card1, card2) => {
					if (card1.id === "ww" || card2.id === "ww") return card1.id === "ww" ? 1 : -1;
					return 0;
				}));
				pile.cards.forEach((card, i) => {
					const url = card.image;
					const a = h + runCardSpace * i;
					const b = y + 297;
					this.render.queue(() => {
						return player.traits.phased ? Canvas.loadImage(url).then(image => this.render.ctx.drawImage(image, a, b, 28, 40)) : this.render.drawImage(this.render.images.back, a, b, 28, 40);
					});
				});
				if (player.traits.phased) {
					const cardID = pile.cards.findIndex(card => card.id !== "ww");
					const mult = pile.traits.evens || pile.traits.evens === false ? 2 : 1;
					const start = Number(pile.cards[cardID].id.slice(1)) - cardID * mult; // Only used for if the pile is a run
					const text = pile.traits.type === "run" ? `${pile.traits.evens ? "E" : (pile.traits.evens === false ? "O" : "")}${start}-${start + (pile.cards.length - 1) * mult}` : `${pile.traits.type === "set" ? pile.cards[cardID].id.slice(1) : pile.cards[cardID].id.substring(0, 1).toUpperCase()}`;
					this.render.ctx.font = "37px Arial";
					const width = this.render.ctx.measureText(text).width; // Measured outside of the queue, because otherwise the measurement would be using the 40px font size
					this.render.ctx.font = "40px Arial";
					this.render.drawText(text, h + (runSpace - width) / 2, y + 330, "37px Arial", pile.traits.color || pile.traits.type === "col" ? {r: "#e10000", g: "#00b600", b: "#221bb3", y: "#ffde00"}[pile.cards[cardID].id.substring(0, 1)] : "");
				}
				h += runSpace + 5;
			}
		});

		this.render.queue(() => this.render.drawImage(this.render.images.halo, 330-300*Math.cos(2*Math.PI*this.meta.currentPlayer.index/pLength), 200-200*Math.sin(2*Math.PI*this.meta.currentPlayer.index/pLength)),
			() => Canvas.loadImage(this.piles.discard.cards[0]?.image || "images/exkit/discardpileghost.png").then(image => this.render.ctx.drawImage(image, 437, 125, 175, 250)));
	}

	drawStatic() {
		super.drawStatic();
		this.render.queue(() => {
			return Canvas.loadImage("images/phase/back.png").then(image => {
				this.render.images.back = image;
				this.render.ctx.drawImage(image, 237, 125, 175, 250);
			});
		}, () => {
			return Canvas.loadImage("images/phase/icon.png").then(image => {
				const players = Object.values(this.players);
				players.forEach(player => {
					const x = 300*Math.cos(2*Math.PI*player.index/players.length-Math.PI);
					const y = 200*Math.sin(2*Math.PI*player.index/players.length-Math.PI);
					this.render.ctx.drawImage(image, x + 432, y + 210);
					this.render.ctx.strokeStyle = "#ffffff";
					this.render.ctx.font = "24px Arial";
					this.render.ctx.strokeText(`P${player.traits.phases[player.traits.phase] + 1}`, x + 432, y + 280);
					this.render.ctx.strokeStyle = "#000000";
					this.render.ctx.font = "40px Arial";
				});
			});
		}, () => this.saveCanvas());
		this.render.flush();
	}

	/**
	 * @param {Player[]} players - the player(s) to display their cards to.
	 * @returns {void}
	 */
	dealCards(players) {
		if (players.length === 0) return;
		const player = players.pop();
		if (player.member.user.bot) return this.dealCards(players); // I use the bot to test things. Makes sure that this doesn't error
		const hand = new Discord.MessageEmbed()
			.setTitle("Your Hand:")
			.setDescription(player.cards.sort((card1, card2) => {
				if (card1.id === "ww" || card2.id === "ww") return card1.id === "ww" ? -1 : 1;
				if (card1.id === "sk" || card2.id === "sk") return card1.id === "sk" ? 1 : -1;
				if (card1.id === "re" || card2.id === "re") return card1.id === "re" ? 1 : -1;
				return card1.id < card2.id ? -1 : (card1.id > card2.id);
			}).map(card => `${card.id}: ${card.name}`).join("\n"))
			.setColor(Math.floor(Math.random() * 16777215))
			.setFooter(`${this.meta.traits.phaseDescs[player.traits.phases[player.traits.phase]]}`);
		player.member.send(hand).then(this.dealCards(players));
	}

	/**
	 * Generates a series of piles attached to player, corresponding to their phase
	 * @param {Player} player - The player to generate piles for
	 */
	generatePhasePiles(player) {
		player.traits.phasePiles = [];
		switch (player.traits.phases[player.traits.phase]) {
			case 0: // 2 sets of 3
				player.traits.phasePiles.push(new Pile([], {type: "set", min: 3}));
				player.traits.phasePiles.push(new Pile([], {type: "set", min: 3}));
				break;
			case 1: // 1 set of 3 + 1 run of 4
				player.traits.phasePiles.push(new Pile([], {type: "set", min: 3}));
				player.traits.phasePiles.push(new Pile([], {type: "run", min: 4}));
				break;
			case 2: // 1 set of 4 + 1 run of 4
				player.traits.phasePiles.push(new Pile([], {type: "set", min: 4}));
				player.traits.phasePiles.push(new Pile([], {type: "run", min: 4}));
				break;
			case 3: // 1 run of 7
				player.traits.phasePiles.push(new Pile([], {type: "run", min: 7}));
				break;
			case 4: // 1 run of 8
				player.traits.phasePiles.push(new Pile([], {type: "run", min: 8}));
				break;
			case 5: // 1 run of 9
				player.traits.phasePiles.push(new Pile([], {type: "run", min: 9}));
				break;
			case 6: // 2 sets of 4
				player.traits.phasePiles.push(new Pile([], {type: "set", min: 4}));
				player.traits.phasePiles.push(new Pile([], {type: "set", min: 4}));
				break;
			case 7: // 7 cards of one color
				player.traits.phasePiles.push(new Pile([], {type: "col", min: 7}));
				break;
			case 8: // 1 set of 5 + 1 set of 2
				player.traits.phasePiles.push(new Pile([], {type: "set", min: 5}));
				player.traits.phasePiles.push(new Pile([], {type: "set", min: 2}));
				break;
			case 9: // 1 set of 5 + 1 set of 3
				player.traits.phasePiles.push(new Pile([], {type: "set", min: 5}));
				player.traits.phasePiles.push(new Pile([], {type: "set", min: 3}));
				break;
			
			case 10: // 1 run of 4 of one color
				player.traits.phasePiles.push(new Pile([], {type: "run", min: 4, color: true}));
				break;
			case 11: // 1 run of 6 of one color
				player.traits.phasePiles.push(new Pile([], {type: "run", min: 6, color: true}));
				break;
			case 12: // 1 run of 4 + 6 cards of one color
				player.traits.phasePiles.push(new Pile([], {type: "run", min: 4}));
				player.traits.phasePiles.push(new Pile([], {type: "col", min: 6}));
				break;
			case 13: // 1 run of 6 + 4 cards of one color
				player.traits.phasePiles.push(new Pile([], {type: "run", min: 6}));
				player.traits.phasePiles.push(new Pile([], {type: "col", min: 4}));
				break;
			case 14: // 8 cards of one color
				player.traits.phasePiles.push(new Pile([], {type: "col", min: 8}));
				break;
			case 15: // 9 cards of one color
				player.traits.phasePiles.push(new Pile([], {type: "col", min: 9}));
				break;
			case 16: // 3 sets of 3
				player.traits.phasePiles.push(new Pile([], {type: "set", min: 3}));
				player.traits.phasePiles.push(new Pile([], {type: "set", min: 3}));
				player.traits.phasePiles.push(new Pile([], {type: "set", min: 3}));
				break;
			case 17: // 1 set of 4 + 1 run of 6
				player.traits.phasePiles.push(new Pile([], {type: "set", min: 4}));
				player.traits.phasePiles.push(new Pile([], {type: "run", min: 6}));
				break;
			case 18: // 1 set of 5 + 1 run of 5
				player.traits.phasePiles.push(new Pile([], {type: "set", min: 5}));
				player.traits.phasePiles.push(new Pile([], {type: "run", min: 5}));
				break;
			case 19: // 1 set of 5 + 5 cards of one color
				player.traits.phasePiles.push(new Pile([], {type: "set", min: 5}));
				player.traits.phasePiles.push(new Pile([], {type: "col", min: 5}));
				break;

			case 20: // 5 sets of 2
				player.traits.phasePiles.push(new Pile([], {type: "set", min: 2}));
				player.traits.phasePiles.push(new Pile([], {type: "set", min: 2}));
				player.traits.phasePiles.push(new Pile([], {type: "set", min: 2}));
				player.traits.phasePiles.push(new Pile([], {type: "set", min: 2}));
				player.traits.phasePiles.push(new Pile([], {type: "set", min: 2}));
				break;
			case 21: // 1 run of 10
				player.traits.phasePiles.push(new Pile([], {type: "run", min: 10}));
				break;
			case 22: // 10 cards of one color
				player.traits.phasePiles.push(new Pile([], {type: "col", min: 10}));
				break;
			case 23: // 1 run of 5 of odd numbers of one color + 1 run of 5 of even numbers of one color
				player.traits.phasePiles.push(new Pile([], {type: "run", min: 5, color: true, evens: false}));
				player.traits.phasePiles.push(new Pile([], {type: "run", min: 5, color: true, evens: true}));
				break;
			case 24: // 1 set of 5 + 1 run of 5 odd numbers
				player.traits.phasePiles.push(new Pile([], {type: "set", min: 5}));
				player.traits.phasePiles.push(new Pile([], {type: "run", min: 5, evens: false}));
				break;
			case 25: // 1 set of 5 + 1 run of 5 even numbers
				player.traits.phasePiles.push(new Pile([], {type: "set", min: 5}));
				player.traits.phasePiles.push(new Pile([], {type: "run", min: 5, evens: true}));
				break;
			case 26: // 1 set of 4 + 1 run of 3 + 1 set of 3 of one color
				player.traits.phasePiles.push(new Pile([], {type: "set", min: 4}));
				player.traits.phasePiles.push(new Pile([], {type: "run", min: 3}));
				player.traits.phasePiles.push(new Pile([], {type: "set", min: 3, color: true}));
				break;
			case 27: // 1 run of 5 + 1 run of 5 odd numbers of one color
				player.traits.phasePiles.push(new Pile([], {type: "run", min: 5}));
				player.traits.phasePiles.push(new Pile([], {type: "run", min: 5, color: true, evens: false}));
				break;
			case 28: // 1 run of 5 + 1 run of 5 even numbers of one color
				player.traits.phasePiles.push(new Pile([], {type: "run", min: 5}));
				player.traits.phasePiles.push(new Pile([], {type: "run", min: 5, color: true, evens: true}));
				break;
			case 29: // 2 sets of 5
				player.traits.phasePiles.push(new Pile([], {type: "set", min: 5}));
				player.traits.phasePiles.push(new Pile([], {type: "set", min: 5}));
				break;
		}
	}

	/**
	 * Returns whether the provided cards are valid for a partial phase
	 * @param {Pile} pile - The partial phase
	 * @param {Card[]} cards - The cards to test
	 * @param {number} wildStart - The number of wilds required to come at the beginning of the run
	 * @returns {boolean} Whether the cards were valid
	 */
	validatePartialPhase(pile, cards, wildStart) {
		cards = cards.concat(pile.cards).sort((card1, card2) => {
			if (card1.id === "ww" || card2.id === "ww") return card1.id === "ww" ? 1 : -1;
			return card1.id < card2.id ? -1 : (card1.id > card2.id);
		});
		if (cards.some(card => !card) || cards.every(card => card.id === "ww")) return false; // Also returns false if cards is empty
		switch(pile.traits.type) {
			case "set": {
				const n = cards[0].id.slice(1);
				const c = cards[0].id.substring(0, 1);
				return cards.every(card => (card.id.slice(1) === n && (!pile.traits.color || card.id.startsWith(c))) || card.id === "ww") && cards.length >= pile.traits.min;
			}
			case "run": {
				if (cards.length < pile.traits.min) return false;
				const run = this.sortRun(pile, cards, wildStart);
				return run.length ? true : false;
			}
			case "col": {
				const c = cards[0].id.substring(0, 1);
				return cards.every(card => card.id.startsWith(c) || card.id === "ww") && cards.length >= pile.traits.min;
			}
		}
	}

	/**
	 * Sorts a valid run into descending order
	 * @param {Pile} pile - The pile with traits to sort the run by
	 * @param {Card[]} cards - The cards within the run
	 * @param {number} wildStart - The number of wilds required to come at the beginning of the run
	 * @returns {Card[]} The sorted run, or an empty array if an invalid run
	 */
	sortRun(pile, cards, wildStart = 0) {
		const c = cards[0].id.substring(0, 1);
		const mult = pile.traits.evens === true || pile.traits.evens === false ? 2 : 1;
		const wilds = cards.reduce((acc, card) => acc + (card.id === "ww" ? 1 : 0), 0);
		const max = 12 + (this.meta.rules.extendedWilds ? wilds : 0) * mult;
		for (let i = max - (pile.traits.evens === false ? (max - 1) % 2 : (pile.traits.evens === true ? max % 2 : 0)); i > (cards.length - 1 - (this.meta.rules.extendedWilds ? wilds : 0)) * mult; i -= mult) {
			const run = this.meta.rules.moveWilds ? [] : cards.filter(card => card.id === "ww" && typeof(card.traits.num) === "undefined").slice(0, wildStart);
			for (let j = cards.length - 1 - run.length; j >= 0; j--) {
				const n = i - j * mult;
				const card = cards.find(card => ((card.id.slice(1) === n.toString() || card.traits.num === n) && (!pile.traits.color || card.id.startsWith(c))) || (card.id === "ww" && !run.includes(card) && (this.meta.moveWilds || typeof(card.traits.num) === "undefined") && ((n > 0 && n < 13) || this.meta.rules.extendedWilds)));
				if (!card) break;
				if (card.id === "ww" && !this.meta.rules.moveWilds && typeof(card.traits.num) === "undefined") card.hidden.temp = n;
				run.push(card);
			}
			if (run.length === cards.length) {
				if (!this.meta.rules.moveWilds) run.forEach(card => {if (typeof(card.hidden.temp) === "number") card.traits.num = card.hidden.temp});
				return run;
			}
		}
		return [];
	}

	/**
	 * Returns the score for the array of cards
	 * @param {Card[]} cards - The cards being score
	 * @returns {number} - The score of the cards
	 */
	score(cards) {
		let score = 0;
		for (let i = 0; i < cards.length; i++) {
			if (cards[i].id === "ww") score += 25;
			else if (cards[i].id === "sk" || cards[i].id === "re") score += 15;
			else if (Number(cards[i].id.substring(1)) < 10) score += 5;
			else score += 10;
		}
		return score;
	}
}