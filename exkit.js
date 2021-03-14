import Discord from "discord.js";
import Canvas from "canvas";
import {Core, Player, Pile, Card} from "./core.js";

/**
 * The base implementation of Exploding Kittens
 * @class baseExkit
 */
export default class baseExkit extends Core {
	/**@param {Discord.GuildChannel} channel - The channel to send updates to*/
	constructor(channel) {
		const rules = {
			"imploding": ["Imploding Kittens Expansion Pack - :exploding_head:", "---", "🤯"],
			"streaking": ["Streaking Kittens Expansion Pack - :shorts:", "---", "🩳"],
			"barking": ["Barking Kittens Expansion Pack - :dog:", "---", "🐶"],
			"removePercent": ["Percent of Cards to Remove: 0%", "Type `!remove 𝘯𝘶𝘮` to change (33 recommended for quick games)"]
		}

		super("Exploding Kittens", channel, rules, {removePercent: 0, extraTurns: 0, clockwise: true});
	}

	setup () {
		return super.setup();
	}

	start() {
		//this.events.emit("start", Core.phases.START);
		//if (!this.start.cancelled) {
		if (Object.keys(this.players).length < 2) return this.meta.channel.send("Not enough players!");
		if (Object.keys(this.meta.rules).length) this.meta.ruleReactor.stop();
		this.meta.phase = 2;
		if (this.meta.rules.barking) {
			Canvas.loadImage("images/exkit/tower.png").then(image => {
				this.render.images.tower = image;
				return Canvas.loadImage("images/exkit/mouse.png");
			}).then(image => this.render.images.mouse = image);
		}
		if (this.meta.rules.streaking) Canvas.loadImage("images/exkit/marked.png").then(image => this.render.images.marked = image);
		this.randomizePlayerOrder();

		this.piles.draw = new Pile();
		this.piles.discard = new Pile([]);
		this.deckCreate(this.piles.draw);

		this.meta.currentPlayer = Object.values(this.players).find(player => !player.index);
		this.meta.actionHistory.push("The game has just started!");
		this.dealCards(Object.values(this.players));
		this.render.ctx.fillStyle = "#FFFFFF";
		this.meta.channel.send(`Play order: ${Object.values(this.players).sort((player1, player2) => player1.index - player2.index).reduce((acc, player) => {return `${acc}${player.member.displayName}, `}, "").slice(0,-2)}\nGo to <https://github.com/Bedrockbreaker/unobot/wiki/Exploding-Kittens> for Exploding Kittens-specifc commands.`);
		if (!Object.values(this.players).reduce((acc, player) => {return acc+player.traits.points},0)) super.start().then(() => this.updateUI());
		this.resetTimeLimit();
		//}
		//this.events.emit("start", Core.phases.END);
		//this.start.cancelled = false;
	}

	/**
	 * Creates a deck of cards for the provided pile
	 * @param {Pile} pile - The pile to create a deck of cards for
	 * @returns {Card[]} The newly created cards for the pile
	 */
	deckCreate(pile) {
		/** @type {Card[]} */
		let cards = [];
		if (pile === this.piles.draw) {
			const url = "images/exkit/";
			const players = Object.values(this.players);
			const maxSet = 5 + (this.meta.rules.imploding ? 1 : 0);
			for (let i = 0; i < players.length; i += maxSet) {
				const set = Math.min(maxSet, players.length - i);
				cards.push(new Card("at", "Attack", `${url}at.png`), new Card("at", "Attack", `${url}at.png`), new Card("at", "Attack", `${url}at.png`), new Card("at", "Attack", `${url}at.png`),
					new Card("sp", "Skip", `${url}sp.png`), new Card("sp", "Skip", `${url}sp.png`), new Card("sp", "Skip", `${url}sp.png`), new Card("sp", "Skip", `${url}sp.png`),
					new Card("sf", "See the Future", `${url}sf.png`), new Card("sf", "See the Future", `${url}sf.png`), new Card("sf", "See the Future", `${url}sf.png`), new Card("sf", "See the Future", `${url}sf.png`), new Card("sf", "See the Future", `${url}sf.png`),
					new Card("sh", "Shuffle", `${url}sh.png`), new Card("sh", "Shuffle", `${url}sh.png`), new Card("sh", "Shuffle", `${url}sh.png`), new Card("sh", "Shuffle", `${url}sh.png`),
					new Card("fv", "Favor", `${url}fv.png`), new Card("fv", "Favor", `${url}fv.png`), new Card("fv", "Favor", `${url}fv.png`), new Card("fv", "Favor", `${url}fv.png`),
					new Card("no", "Nope", `${url}no.png`), new Card("no", "Nope", `${url}no.png`), new Card("no", "Nope", `${url}no.png`), new Card("no", "Nope", `${url}no.png`), new Card("no", "Nope", `${url}no.png`),
					new Card("tc", "Taco Cat", `${url}tc.png`),  new Card("tc", "Taco Cat", `${url}tc.png`), new Card("tc", "Taco Cat", `${url}tc.png`), new Card("tc", "Taco Cat", `${url}tc.png`),
					new Card("mc", "Melon Cat", `${url}mc.png`), new Card("mc", "Melon Cat", `${url}mc.png`), new Card("mc", "Melon Cat", `${url}mc.png`), new Card("mc", "Melon Cat", `${url}mc.png`),
					new Card("pc", "Hairy Potato Cat", `${url}pc.png`), new Card("pc", "Hairy Potato Cat", `${url}pc.png`), new Card("pc", "Hairy Potato Cat", `${url}pc.png`), new Card("pc", "Hairy Potato Cat", `${url}pc.png`),
					new Card("bc", "Beard Cat", `${url}bc.png`), new Card("bc", "Beard Cat", `${url}bc.png`), new Card("bc", "Beard Cat", `${url}bc.png`), new Card("bc", "Beard Cat", `${url}bc.png`),
					new Card("rc", "Rainbow Ralphing Cat", `${url}rc.png`), new Card("rc", "Rainbow Ralphing Cat", `${url}rc.png`), new Card("rc", "Rainbow Ralphing Cat", `${url}rc.png`), new Card("rc", "Rainbow Ralphing Cat", `${url}rc.png`));
				for (let j = 0; j < Math.max(2, 6 - set); j++) {
					cards.push(new Card("de", "Defuse", `${url}de.png`));
				}
				if (this.meta.rules.imploding) {
					cards.push(new Card("re", "Reverse", `${url}re.png`), new Card("re", "Reverse", `${url}re.png`), new Card("re", "Reverse", `${url}re.png`), new Card("re", "Reverse", `${url}re.png`),
						new Card("db", "Draw from the Bottom", `${url}db.png`), new Card("db", "Draw from the Bottom", `${url}db.png`), new Card("db", "Draw from the Bottom", `${url}db.png`), new Card("db", "Draw from the Bottom", `${url}db.png`),
						new Card("fc", "Feral Cat", `${url}fc.png`), new Card("fc", "Feral Cat", `${url}fc.png`), new Card("fc", "Feral Cat", `${url}fc.png`), new Card("fc", "Feral Cat", `${url}fc.png`),
						new Card("af", "Alter the Future", `${url}af.png`), new Card("af", "Alter the Future", `${url}af.png`), new Card("af", "Alter the Future", `${url}af.png`), new Card("af", "Alter the Future", `${url}af.png`),
						new Card("ta", "Targeted Attack", `${url}ta.png`), new Card("ta", "Targeted Attack", `${url}ta.png`), new Card("ta", "Targeted Attack", `${url}ta.png`));
				}
				if (this.meta.rules.streaking) {
					cards.push(new Card("sk", "Streaking Kitten", `${url}sk.png`),
						new Card("ss", "Super Skip", `${url}ss.png`),
						new Card("s5", "See the Future **x5**", `${url}s5.png`),
						new Card("a5", "Alter the Future **x5**", `${url}a5.png`),
						new Card("sw", "Swap Top and Bottom", `${url}sw.png`), new Card("sw", "Swap Top and Bottom", `${url}sw.png`), new Card("sw", "Swap Top and Bottom", `${url}sw.png`),
						new Card("gc", "Garbage Collection", `${url}gc.png`),
						new Card("cb", "Catomic Bomb", `${url}cb.png`),
						new Card("mk", "Mark", `${url}mk.png`), new Card("mk", "Mark", `${url}mk.png`), new Card("mk", "Mark", `${url}mk.png`),
						new Card("cc", "Curse of the Cat Butt", `${url}cc.png`), new Card("cc", "Curse of the Cat Butt", `${url}cc.png`));
				}
				if (this.meta.rules.barking) {
					cards.push(new Card("bk", "Barking Kitten", `${url}bk.png`, {pair: i / maxSet}), new Card("bk", "Barking Kitten", `${url}bk.png`, {pair: i / maxSet}),
						new Card("an", "Alter the Future **Now**", `${url}an.png`), new Card("an", "Alter the Future **Now**", `${url}an.png`),
						new Card("br", "Bury", `${url}br.png`), new Card("br", "Bury", `${url}br.png`),
						new Card("pa", "Personal Attack", `${url}pa.png`), new Card("pa", "Personal Attack", `${url}pa.png`), new Card("pa", "Personal Attack", `${url}pa.png`), new Card("pa", "Personal Attack", `${url}pa.png`),
						new Card("ss", "Super Skip", `${url}ss.png`),
						new Card("pl", "Potluck", `${url}pl.png`), new Card("pl", "Potluck", `${url}pl.png`),
						new Card("tt", "I'll Take That", `${url}tt.png`), new Card("tt", "I'll Take That", `${url}tt.png`), new Card("tt", "I'll Take That", `${url}tt.png`), new Card("tt", "I'll Take That", `${url}tt.png`),
						new Card("hf", "Share the Future", `${url}hf.png`), new Card("hf", "Share the Future", `${url}hf.png`));
				}
			}
			Core.shuffle(cards);
			for (let i = 0; i < cards.length * this.meta.traits.removePercent / 100; i++) {
				const card = cards.pop();
				if (card.id === "bk") { // Because we don't want a game with only 1 barking kitten
					cards.splice(cards.findIndex(card2 => card2.traits.pair === card.traits.pair),1);
					i++;
				}
			}
			if (this.meta.rules.barking) {
				for (let i = 0; i < players.length; i += maxSet) {
					this.piles[`top${i/maxSet}`] = new Pile(cards.splice(0, 6), {pair: i/maxSet});
				}
				for (let i = 0; i < players.length; i += maxSet) {
					cards.push(new Card("tp", "Tower of Power", `${url}tp.png`, {pair: i/maxSet}));
				}
				Core.shuffle(cards);
			}
			players.forEach(player => {
				player.cards = player.cards.concat(cards.splice(0,7));
				player.cards.push(new Card("de", "Defuse", `${url}de.png`));
			});

			for (let i = 0; i < players.length + (this.meta.rules.streaking ? 0 : -1); i++) {
				cards.push(new Card("ek", "Exploding Kitten", `${url}ek.png`));
			}
			for (let i = 0; i < players.length; i += maxSet) {
				if (this.meta.rules.imploding) {
					cards.push(new Card("ik", "Imploding Kitten", `${url}ik.png`, {up: false}));
					if (players.length > 2) cards.splice(cards.findIndex(card => card.id === "ek"), 1); // Removes an exploding kitten
				}
			}
			pile.traits.total = cards.length;
		}
		Core.shuffle(cards);
		pile.cards = pile.cards.concat(cards);
		return cards;
	}

	/**
	 * @param {string[]} args - The exact string the user typed, sans the server prefix, separated by spaces
	 * @param {Discord.GuildMember|Discord.User} member - The member who typed the message
	 * @param {Discord.Channel} channel - The channel the command was posted in
	 */
	discard(args, member, channel) {
		if (this.players[member.id]) {
			let player = this.players[member.id];
			member = player.member; // If the player sends a command through their DMs, the original "member" is actually a User.
			switch(args[0]) {
				case "r":
				case "remove":
					// TODO: edit rules message to reflect new value
					if (this.meta.phase >= 2) {channel.send("Imagine being such a smooth brain and trying that"); break;}
					if (!player.isLeader) {channel.send("Only the leader can change that!"); break;}
					if (isNaN(Number(args[1]))) {channel.send(`${typeof args[1] === "undefined" ? "That" : `\`${args[1]}\``} is not a valid number!`); break;}
					this.meta.traits.removePercent = Math.min(100,Math.max(0,Number(args[1])));
					channel.send(`:white_check_mark: Successfully changed the removed percent of cards to ${this.meta.traits.removePercent}%`);
					break;
				case "d":
				case "draw": {
					if (this.meta.phase < 2 || player !== this.meta.currentPlayer) break;
					
					if (Object.values(this.players).some(player2 => player2.cards.some(card2 => card2.traits.exploded))) return channel.send("An Exploding Kitten must be placed back into the draw pile!");
					if (Object.values(this.players).some(player2 => player2.cards.some(card2 => card2.id === "ik"))) return channel.send("The Imploding Kitten must be placed back into the draw pile!");
					if (this.piles.discard.cards.find(card2 => card2.hidden.needsInput)?.hidden.needsInput) return channel.send("A card requires your input first!");
					if (player.traits.cursed && player.cards.some(card => card.hidden.cursed)) return channel.send("You must discard the cursed card first!");

					this.meta.traits.copy = null;
					this.meta.traits.message = null;
					const card = this.piles.draw.cards.shift();
					let doUpdate = true;
					if (player.traits.cursed) player.traits.cursed = null;
					if (player.traits.bully) {
						const bully = player.traits.bully.hidden.bully;
						bully.cards.push(card);
						player.member.send(`${bully.member.displayName} stole a ${card.name}`);
						// The only way the tally of ek's vs sk's would become suddenly negative would be if they just drew an ek in this case
						if (bully.cards.reduce((acc, card) => acc + (card.id === "sk") - (card.id === "ek"), 0) < 0) {
							this.meta.actionHistory.push(`${bully.member.displayName} stole an Exploding Kitten from ${member.displayName}! ~~idiot~~`);
						} else if (card.id === "ik") {
							this.meta.actionHistory.push(`${bully.member.displayName} stole an Imploding Kitten from ${member.displayName}! ~~idiot~~`);
						} else {
							this.meta.actionHistory.push(`${bully.member.displayName} stole a card from ${member.displayName}`);
						}
						doUpdate = !this.receiveCard(bully, card);
						this.piles.discard.cards.unshift(player.traits.bully);
						player.cards.splice(player.cards.findIndex(card2 => card2 === card), 1);
						player.traits.bully = null;
					} else {
						player.cards.push(card);
						// The only way the tally of ek's vs sk's would become suddenly negative would be if they just drew an ek in this case
						if (player.cards.reduce((acc, card) => acc + (card.id === "sk") - (card.id === "ek"), 0) < 0) {
							this.meta.actionHistory.push(`${member.displayName} drew an Exploding Kitten!`);
						} else if (card.id === "ik") {
							this.meta.actionHistory.push(`${member.displayName} drew an Imploding Kitten!`);
						} else {
							this.meta.actionHistory.push(`${member.displayName} drew`);
						}
						doUpdate = !this.receiveCard(player, card);
					}
					this.nextPlayer();
					if (doUpdate) this.updateUI();
					break;
				}
				default: {
					if (this.meta.phase < 2) break;
					let card = Core.getCards(player.cards, args[0].split(".")[0], args[0].split(".")[1])[0];
					const disCard = this.piles.discard.cards.find(card2 => card2.hidden.needsInput);
					const ekNeedsInput = Object.values(this.players).reduce((acc, player2) => acc + player2.cards.reduce((acc2, card2) => acc2 + (card2.traits.exploded ? 1 : 0), 0), 0);
					const ikNeedsInput = Object.values(this.players).some(player2 => player2.cards.some(card2 => card2.id === "ik"));
					if (player !== this.meta.currentPlayer && card?.id !== "an" && card?.id !== "no" && !disCard?.hidden.needsInput && !ekNeedsInput && !ikNeedsInput) break;
					if (!card && !(["2", "3", "5"].includes(args[0])) && !disCard?.hidden.needsInput && !player.traits.cursed) return channel.send(`Cannot find card \`${args[0]}\` in your hand`);
					// Force players to discard ek's and ik's first
					if (ekNeedsInput && (card.id !== "ek" && (card.id !== "no" || !this.meta.traits.copy))) return channel.send("An Exploding Kitten must be placed back into the draw pile first!");
					if (ikNeedsInput && (card.id !== "ik" && (card.id !== "no" || !this.meta.traits.copy))) return channel.send("The Imploding Kitten must be placed back into the draw pile first!");
					// Always discard exploded eks first (don't want to accidently discard the one protected by a sk)
					if (card?.id === "ek") card = player.getCards(args[0].split(".")[0], args[0].split(".")[1]).sort((card1, card2) => card2.traits.exploded - card1.traits.exploded)[0];

					/**@type {baseExkit} */
					let copy = Core.deepClone(this);

					if (player.traits.cursed && !disCard?.hidden.needsInput) {
						const cursedCard = player.cards.find(card2 => card2.hidden.cursed);
						if (!cursedCard && !card?.traits.marked) {
							card = player.cards[Math.floor(Math.random()*player.cards.length)];
							const traits = Object.keys(card.traits).map(traitKey => (card.traits[traitKey] === false || (traitKey === "pair" && Object.keys(this.players).length < 5 + (this.meta.rules.imploding ? 1 : 0))) ? "" : (`${traitKey}${card.traits[traitKey] === true ? "" : `:${card.traits[traitKey]}`}`)).join(",");
							card.hidden.cursed = true;
							return channel.send(`You must discard a ${card.name} next. (\`!${card.id}${traits.length > 0 ? `.${traits}` : ""}\`)`);
						} else if (card !== cursedCard) {
							if (card?.id === cursedCard.id) {
								card = cursedCard;
							} else {
								const traits = Object.keys(cursedCard.traits).map(traitKey => (cursedCard.traits[traitKey] === false || (traitKey === "pair" && Object.keys(this.players).length < 5 + (this.meta.rules.imploding ? 1 : 0))) ? "" : (`${traitKey}${cursedCard.traits[traitKey] === true ? "" : `:${cursedCard.traits[traitKey]}`}`)).join(",");
								return channel.send(`You must discard a ${cursedCard.name} next. (\`!${cursedCard.id}${traits.length > 0 ? `.${traits}` : ""}\`)`);
							}
						}
					}

					let doUpdate = true;
					if (disCard?.hidden.needsInput && !ekNeedsInput && !ikNeedsInput && card?.id !== "no") {
						card = Core.getCards(player.cards, args[1]?.split(".")[0], args[1]?.split(".")[1])[0];
						if (player.traits.cursed && !card.traits.marked) card = player.cards[Math.floor(Math.random()*player.cards.length)];
						switch(disCard.id) {
							case "fv":
								if (player !== disCard.hidden.worker) return;
								if (player.traits.cursed) {
									this.meta.actionHistory.push(`${member.displayName} blindly fulfilled ${disCard.hidden.owner.member.displayName}'s favor`);
									player.member.send(`You blindly gave ${disCard.hidden.owner.displayName} a ${card.name}`);
								} else {
									if (!card) return channel.send(`Cannot find card ${args[1]} in your hand`);
									this.meta.actionHistory.push(`${member.displayName} ${Core.weighted([[`worked off ${disCard.hidden.owner.member.displayName}'s favor`, 3], [`licked ${disCard.hidden.owner.member.displayName}'s boots`], [`sucked up to ${disCard.hidden.owner.member.displayName}`]])}`);
								}
								player.cards.splice(player.cards.findIndex(card2 => card2 === card), 1);
								disCard.hidden.owner.cards.push(card);
								disCard.hidden.needsInput = false;
								doUpdate = !this.receiveCard(disCard.hidden.owner, card);
								doUpdate = !this.removeCard(player, card) && doUpdate;
								break;
							case "af": {
								if (player !== this.meta.currentPlayer) return;
								const order = args.slice(1,4).map(n => Number(n));
								const comparison = [1,2,3];
								if (order.length < 3 || order.some(n => isNaN(n)) || !order.every(n => {
									const i = comparison.findIndex(m => m === n);
									if (i < 0) return false;
									comparison.splice(i, 1);
									return true;
								})) return channel.send("Invalid order. (Try something like `!af 2 1 3`)");
								const copy2 = this.piles.draw.cards.slice(0,3);
								this.piles.draw.cards[0] = copy2[order[0]-1];
								this.piles.draw.cards[1] = copy2[order[1]-1];
								this.piles.draw.cards[2] = copy2[order[2]-1];
								disCard.hidden.needsInput = false;
								break;
							}
							case "a5": {
								if (player !== this.meta.currentPlayer) return;
								const order = args.slice(1,6).map(n => Number(n));
								const comparison = [1,2,3,4,5];
								if (order.length < 5 || order.some(n => isNaN(n)) || !order.every(n => {
									const i = comparison.findIndex(m => m === n);
									if (i < 0) return false;
									comparison.splice(i, 1);
									return true;
								})) return channel.send("Invalid order. (Try something like `!a5 4 2 5 1 3`)");
								const copy2 = this.piles.draw.cards.slice(0,5);
								this.piles.draw.cards[0] = copy2[order[0]-1];
								this.piles.draw.cards[1] = copy2[order[1]-1];
								this.piles.draw.cards[2] = copy2[order[2]-1];
								this.piles.draw.cards[3] = copy2[order[3]-1];
								this.piles.draw.cards[4] = copy2[order[4]-1];
								disCard.hidden.needsInput = false;
								break;
							}
							case "gc":
								if (disCard.hidden.collected.includes(player)) return;
								if (player.traits.cursed) {
									player.member.send(`You blindly threw a ${card.name} at the garbage heap`);
								} else if (!card) return channel.send(`Cannot find card ${args[1]} in your hand`);
								this.piles.draw.cards.push(player.cards.splice(player.cards.findIndex(card2 => card2 === card), 1)[0]);
								doUpdate = !this.removeCard(player, card);
								disCard.hidden.collected.push(player);
								if (disCard.hidden.collected.length === Object.keys(this.players).length) {
									disCard.hidden.needsInput = false;
									Core.shuffle(this.piles.draw.cards);
									this.meta.channel.send("Garbage collected!");
									break;
								}
								this.meta.channel.send(`${member.displayName} took out their trash! (${disCard.hidden.collected.length}/${Object.keys(this.players).length})`);
								return;
							case "bk": {
								if ((disCard.hidden.phase !== 1 || player !== disCard.hidden.mouse) && (disCard.hidden.phase !== 2 || player !== disCard.hidden.cat)) return;
								let currentArg = 1;
								/**@type {Card[]}*/
								const cards = [];
								do {
									const card2 = Core.getCards(player.cards, args[currentArg]?.split(".")[0], args[currentArg]?.split(".")[1])[0];
									if (card2) {
										cards.push(card2);
										player.cards.splice(player.cards.findIndex(card3 => card3 === card2), 1);
									}
									currentArg++;
								} while(currentArg <= disCard.hidden.num);
								if (player.traits.cursed) {
									for (let i = 0; i < disCard.hidden.num - cards.length; i++) {
										const card2 = player.cards[Math.floor(Math.random()*player.cards.length)];
										cards.push(card2);
										player.cards.splice(player.cards.findIndex(card3 => card3 === card2), 1);
									}
									player.member.send(`You randomly hand over ${cards.map(card2 => card2.name).join(", ")}`);
								}
								player.cards = player.cards.concat(cards); // Reinsert cards in case any were invalid. Don't want to accidently delete cards
								if (cards.length !== disCard.hidden.num) return channel.send("Invalid number of cards chosen, or could not find all of the cards requested from your hand.");
								cards.forEach(card2 => {
									if (card2.traits.marked) card2.traits.marked = false;
									player.cards.splice(player.cards.findIndex(card3 => card3 === card2), 1);
								});

								// player = disCard.hidden.mouse
								if (disCard.hidden.phase === 1) {
									doUpdate = !this.receiveCard(player, new Card("ek")); // The fake exploding kitten isn't ever actually inserted into their hand. It just checks if they'll explode from the new cards
									/*
									if (disCard.hidden.cat.traits.top?.cards.length) {
										disCard.hidden.cat.traits.top.cards = disCard.hidden.cat.traits.top.cards.concat(cards);
										Core.shuffle(disCard.hidden.cat.traits.top.cards);
										player.cards = player.cards.concat(disCard.hidden.cat.traits.top.cards.splice(0, disCard.hidden.num));
										this.receiveCard(player, new Card("ek")); // This shouldn't be necessary, but if I ever implement modding, something could change.
										disCard.hidden.needsInput = false;
										break;
									}
									*/
									disCard.hidden.cat.cards = disCard.hidden.cat.cards.concat(cards);
									doUpdate = !this.receiveCard(disCard.hidden.cat, new Card("ek")) && doUpdate;
									disCard.hidden.cat.member.send(`Choose ${disCard.hidden.num} cards to hand over: \`!bk 𝘪𝘥 𝘪𝘥 𝘪𝘥...\`.\n(almost like discarding them, each id is a different card)`);
									disCard.hidden.phase = 2;
									break;
								}

								// player = disCard.hidden.cat
								doUpdate = !this.receiveCard(player, new Card("ek"));
								disCard.hidden.needsInput = false;
								/*
								if (disCard.hidden.mouse.traits.top?.cards.length) {
									disCard.hidden.mouse.traits.top.cards = disCard.hidden.mouse.traits.top.cards.concat(cards);
									Core.shuffle(disCard.hidden.mouse.traits.top.cards);
									player.cards = player.cards.concat(disCard.hidden.mouse.traits.top.cards.splice(0, disCard.hidden.num));
									this.receiveCard(player, new Card("ek"));
									break;
								}
								*/
								disCard.hidden.mouse.cards = disCard.hidden.mouse.cards.concat(cards);
								doUpdate = !this.receiveCard(disCard.hidden.mouse, new Card("ek")) && doUpdate;
								break;
							}
							case "an": {
								if (player !== disCard.hidden.owner) return;
								const order = args.slice(1,4).map(n => Number(n));
								const comparison = [1,2,3];
								if (order.length < 3 || order.some(n => isNaN(n)) || !order.every(n => {
									const i = comparison.findIndex(m => m === n);
									if (i < 0) return false;
									comparison.splice(i, 1);
									return true;
								})) return channel.send("Invalid order. (Try something like `!an 2 1 3`)");
								const copy = this.piles.draw.cards.slice(0,3);
								this.piles.draw.cards[0] = copy[order[0]-1];
								this.piles.draw.cards[1] = copy[order[1]-1];
								this.piles.draw.cards[2] = copy[order[2]-1];
								disCard.hidden.needsInput = false;
								break;
							}
							case "br":
								if (player !== this.meta.currentPlayer) return;
								if (isNaN(Number(args[1]))) return channel.send(`${args[1]} is not a number`);
								this.piles.draw.cards.splice(Math.min(this.piles.draw.cards.length, Math.max(0, Math.floor(Number(args[1])))), 0, disCard.hidden.card);
								disCard.hidden.needsInput = false;
								this.nextPlayer();
								break;
							case "pl":
								if (player !== disCard.hidden.players[0]) return;
								if (player.traits.cursed) {
									player.member.send(`You randomly cooked up a ${card.name} for the potluck`);
								} else if (!card) return channel.send(`Cannot find card ${args[1]} in your hand`);
								this.piles.draw.cards.unshift(card);
								player.cards.splice(player.cards.findIndex(card2 => card2 === card), 1);
								doUpdate = !this.removeCard(player, card);
								disCard.hidden.players.shift();
								while (disCard.hidden.players[0] && disCard.hidden.players[0].traits.top?.cards.length) {
									this.piles.draw.cards.unshift(disCard.hidden.players[0].traits.top.pop());
									disCard.hidden.playes.shift();
								}
								if (!disCard.hidden.players.length) {
									disCard.hidden.needsInput = false;
									this.meta.channel.send(`Potluck finished! ${Object.values(this.players)[Math.floor(Math.random()*Object.keys(this.players).length)].member.displayName} "gets" to wash the dishes! /s`);
									break;
								}
								this.meta.channel.send(`${member.displayName} joined the fiesta! (${disCard.hidden.players.length} players left)`);
								disCard.hidden.players[0].member.send("Give any card to the potluck by typing `!pl 𝘪𝘥`, very similar to discarding it");
								return;
							case "hf": {
								if (player !== this.meta.currentPlayer) return;
								const order = args.slice(1,4).map(n => Number(n));
								const comparison = [1,2,3];
								if (order.length < 3 || order.some(n => isNaN(n)) || !order.every(n => {
									const i = comparison.findIndex(m => m === n);
									if (i < 0) return false;
									comparison.splice(i, 1);
									return true;
								})) return channel.send("Invalid order. (Try something like `!hf 2 1 3`)");
								const copy = this.piles.draw.cards.slice(0,3);
								this.piles.draw.cards[0] = copy[order[0]-1];
								this.piles.draw.cards[1] = copy[order[1]-1];
								this.piles.draw.cards[2] = copy[order[2]-1];
								disCard.hidden.needsInput = false;
								const hand = new Discord.MessageEmbed()
									.setTitle("Next 3 Cards:")
									.setDescription(this.piles.draw.cards.slice(0,3).map((card, i) => `${i+1}. ${card.id}: ${card.name}`))
									.setColor(Math.floor(Math.random() * 16777215));
								const pLength = Object.keys(this.players).length;
								Object.values(this.players).find(player2 => player2.index === (player.index+pLength+(this.meta.traits.clockwise ? 1 : -1))%pLength).member.send(hand);
								break;
							}
							default:
								return channel.send(`Invalid Move! (Try beginning your next message with \`!${disCard.id}\`)`);
						}
						this.meta.traits.copy = null;
						this.meta.traits.message = null;
						this.updateUI();
						break;
					}
					
					switch(card?.id || args[0]) {
						case "ek":
							if (!card.traits.exploded) {
								card.traits.exploded = true;
								doUpdate = !this.receiveCard(player, card);
								break;
							}
							if (isNaN(Number(args[1]))) return channel.send(`${args[1]} is not a number`);
							card.traits.exploded = null;
							this.piles.draw.cards.splice(Math.min(this.piles.draw.cards.length, Math.max(0, Math.floor(Math.abs(Number(args[1]))))), 0, player.cards.splice(player.cards.findIndex(card2 => card2 === card), 1)[0]);
							this.meta.actionHistory.push(`${member.displayName}${Core.weighted([[" is plotting their revenge!", 2],[" committed arson!"], [" writes down names in a Death Note..."], [": 'Bomb has been planted.'"], [": 'お前はもう死んでる'"], ["'s eyes gleam with muderous intent"]])}`);
							copy = null;
							this.meta.traits.message = null;
							break;
						case "no": {
							const card2 = this.piles.discard.cards.find(card2 => card2.id !== "no");
							if (!card2) return channel.send("Can't nope a card which doesn't exist!");
							if (!this.meta.traits.copy) return channel.send("That card can't be noped anymore!");
							const yupped = this.piles.discard.cards.findIndex(card2 => card2.id !== "no");
							const playerCopy = Object.values(this.meta.traits.copy.players).find(player2 => player2.member.id === this.piles.discard.cards[0].hidden.owner?.member.id) || this.meta.traits.copy.meta.currentPlayer; // Player who played the card being noped
							player = this.meta.traits.copy.players[member.id]; // Player who played the nope card
							const prevCards = this.piles.discard.cards.slice(0, this.piles.discard.cards.length - this.meta.traits.copy.piles.discard.cards.length).map(card3 => playerCopy.cards.splice(playerCopy.cards.findIndex(card4 => card3.isEqual(card4)), 1)[0]);
							const prevAction = this.meta.actionHistory[this.meta.actionHistory.length-1];
							card = player.cards.find(card3 => card.isEqual(card3));
							card.hidden.owner = player;
							if (this.meta.traits.message) { // If the card being noped needs information to be redacted (such as a see the future)
								[this.meta.traits.message[0].embeds[0].description, this.meta.traits.message[1]] = [this.meta.traits.message[1], this.meta.traits.message[0].embeds[0].description];
								this.meta.traits.copy.meta.traits.message = this.meta.traits.message;
								this.meta.traits.message[0].edit(this.meta.traits.message[0].content, this.meta.traits.message[0].embeds[0]);
							}

							this.piles = this.meta.traits.copy.piles;
							this.players = this.meta.traits.copy.players;
							this.meta = this.meta.traits.copy.meta;

							this.piles.discard.cards.unshift(...prevCards.reverse());
							this.meta.actionHistory.push(prevAction, `${member.displayName}${Core.weighted([[` ${yupped % 2 ? "yupped" : "noped"} the ${card2.name}!`,3],[` denied the ${card2.name}'s ${yupped % 2 ? "non" : ""}existence`], [` ${yupped % 2 ? "loves" : "hates"} it when the ${card2.name}. bottom text`], [` pulled a ${new Array(yupped).fill("no").join(" ")} you`], [" called in the nope-alope"]])}`);
							break;
						}
						case "at":
							this.meta.traits.extraTurns += (!this.meta.traits.extraTurns ? 2 : 3); // These get subtracted by 1 when the next player is forced.
							this.nextPlayer(true);
							this.meta.actionHistory.push(`${member.displayName}${Core.weighted([[` attacked ${this.meta.currentPlayer.member.displayName}!`, 7], [` mugged ${this.meta.currentPlayer.member.displayName}!`, 4], [` vibechecked ${this.meta.currentPlayer.member.displayName}!`, 2], [` 4-stocked ${this.meta.currentPlayer.member.displayName}`]])}`);
							break;
						case "sp":
							this.nextPlayer();
							this.meta.actionHistory.push(`${member.displayName}${Core.weighted([[" ran away!", 2], [" chickened out!"], [" is speed"], [" thought the next card was actually an exploding kitten"], [" hates being fun"]])}`);
							break;
						case "fv": {
							if (!args[1]) return channel.send("Specify a player to ask a favor of! (`!fv 𝘱𝘭𝘢𝘺𝘦𝘳`. Accepts name/nickname, portions of the name, or @)");
							let player2 = this.getPlayers(args[1]);
							if (player2.length > 1) return channel.send(`Be more specific! \`${args[1]}\` matched multiple players`);
							player2 = player2[0];
							if (!player2 || player2 === player) return channel.send("Could not find that player");
							if (player2.cards.length === 0) return channel.send("They don't have any favors to give!");
							if (!player2.traits.top?.cards.length) {
								card.hidden.needsInput = true;
								card.hidden.owner = player;
								card.hidden.worker = player2;
								player2.traits.cursed ? player2.member.send(`Give a random card to ${member.displayName} by typing \`!fv\``) : player2.member.send(`Give any card to ${member.displayName} by typing \`!fv 𝘪𝘥\`, similar to discarding it`);
								this.meta.actionHistory.push(Core.weighted([[`${member.displayName} hates ${player2.member.displayName}`, 3], [`${member.displayName} now owns ${player2.member.displayName}'s soul`, 2], [`${player2.member.displayName} forgot one teensy-weeny, but ever so crucial, little, tiny detail. **${member.displayName.toUpperCase()} OWNS THEM**`], [`${member.displayName} asks a favor of ${player2.member.displayName} ( ͡° ͜ʖ ͡°)`, 5]]));
								break;
							}
							const card2 = player2.traits.top.cards.pop();
							player.cards.push(card2);
							doUpdate = !this.receiveCard(player, card2);
							this.meta.actionHistory.push(Core.weighted([[`${member.displayName} hates ${player2.member.displayName}`, 3], [`${member.displayName} forgot about ${player2.member.displayName}'s magnificent tower`, 2], [`${player2.member.displayName} has life insurance`], [`It's illegal for ${member.displayName} to steal from ${player2.member.displayName} if they say 'no'`]]));
							break;
						}
						case "sh":
							Core.shuffle(this.piles.draw.cards);
							this.meta.actionHistory.push(`${member.displayName}${Core.weighted([[" cards shuffled the has"], [" tried changing their fate"], [" was shuffled"], [" created a never-before-seen arrangement of cards"]])}`);
							break;
						case "sf": {
							const hand = new Discord.MessageEmbed()
								.setTitle("Next 3 Cards:")
								.setDescription(this.piles.draw.cards.slice(0,3).map((card, i) => `${i+1}. ${card.id}: ${card.name}`))
								.setColor(Math.floor(Math.random() * 16777215));
							member.send(hand).then(msg => this.meta.traits.message = [msg, "¯\\_(ツ)_/¯"]);
							this.meta.actionHistory.push(`${member.displayName}${Core.weighted([[" became a prophet"], [" saw 14,000,605 universes"], [" sniffed some glue"], [" paid a pyschic $19.95"]])}`);
							break;
						}
						case "2": {
							let currentArg = 1;
							/**@type {Card[]} */
							let cards = [];
							do {
								const cards2 = Core.getCards(player.cards, args[currentArg]?.split(".")[0], args[currentArg]?.split(".")[1]);
								if (!cards2[0]) {
									player.cards = player.cards.concat(cards);
									return channel.send("Could not find all of the cards requested from your hand");
								}
								cards2.forEach(card2 => player.cards.splice(player.cards.findIndex(card3 => card3 === card2), 1));
								cards.push(...cards2);
								currentArg++;
							} while(cards.length < 2);
							player.cards = player.cards.concat(cards);
							cards = cards.splice(0,2);
							if ([...new Set(cards.map(card2 => card2.id).filter(card2ID => card2ID !== "fc"))].length > 1) return channel.send("Cards must match");
							if (!args[currentArg]) return channel.send(`Specify a player to steal a card from! (\`!${args.join(" ")} 𝘯𝘢𝘮𝘦\`. Accepts @, or any portion of a username or nickname)`);
							let player2 = this.getPlayers(args[currentArg]);
							if (player2.length > 1) return channel.send(`Be more specific! \`${args[currentArg]}\` matched multiple players`);
							player2 = player2[0];
							if (!player2 || player2 === player) return channel.send("Could not find that player");
							if (!player2.cards.length) return channel.send("They don't have any cards to give you!");
							cards.forEach(card2 => {
								if (card2.traits.marked) card2.traits.marked = null;
								player.cards.splice(player.cards.findIndex(card3 => card2 === card3),1);
							});
							this.piles.discard.cards = cards.concat(this.piles.discard.cards);
							currentArg++;
							/**@type {Card} */
							let card2;
							if (player2.traits.top?.cards.length) {
								card2 = player2.traits.top.cards.pop();
							} else {
								const traitReq = args[currentArg]?.split(".")[1];
								const request = Core.getCards(player2.cards, args[currentArg]?.split(".")[0], `${traitReq?.length ? `${traitReq},` : ""}marked`)[0];
								if (request) {
									card2 = request;
								} else {
									let cards2 = player2.cards.filter(card3 => !card3.traits.marked);
									if (!cards2.length) cards2 = player2.cards.filter(card3 => card3.traits.marked);
									card2 = cards2[Math.floor(Math.random()*cards2.length)];
								}
								player2.cards.splice(player2.cards.findIndex(card3 => card3 === card2), 1);
								doUpdate = !this.removeCard(player2, card2);
							}
							player.cards.push(card2);
							doUpdate = !this.receiveCard(player, card2) && doUpdate;
							this.meta.actionHistory.push(`${member.displayName}${Core.weighted([[" used double team! It's super effective!",2],[` cut ${player2.member.displayName}'s purse`,2], [" knows the magic of friendship!"], [" couldn't have saved up another card for the triple combo?"]])}`);
							break;
						}
						case "3": {
							let currentArg = 1;
							/**@type {Card[]} */
							let cards = [];
							do {
								const cards2 = Core.getCards(player.cards, args[currentArg]?.split(".")[0], args[currentArg]?.split(".")[1]);
								if (!cards2[0]) {
									player.cards = player.cards.concat(cards);
									return channel.send("Could not find all of the cards requested from your hand");
								}
								cards2.forEach(card2 => player.cards.splice(player.cards.findIndex(card3 => card3 === card2), 1));
								cards.push(...cards2);
								currentArg++;
							} while(cards.length < 3);
							player.cards = player.cards.concat(cards);
							cards = cards.splice(0,3);
							if ([...new Set(cards.map(card2 => card2.id).filter(card2ID => card2ID !== "fc"))].length > 1) return channel.send("Cards must match");
							if (!args[currentArg]) return channel.send(`Specify a player to steal a card from! (\`!${args.join(" ")} 𝘯𝘢𝘮𝘦\`. Accepts @, or any portion of a username or nickname)`);
							let player2 = this.getPlayers(args[currentArg]);
							if (player2.length > 1) return channel.send(`Be more specific! \`${args[currentArg]}\` matched multiple players`);
							player2 = player2[0];
							if (!player2 || player2 === player) return channel.send("Could not find player");
							cards.forEach(card2 => {
								if (card2?.traits.marked) card2.traits.marked = null;
								player.cards.splice(player.cards.findIndex(card3 => card2 === card3),1);
							});
							this.piles.discard.cards = cards.concat(this.piles.discard.cards);
							currentArg++;
							const card2 = Core.getCards(player2.cards, args[currentArg]?.split(".")[0], args[currentArg]?.split(".")[1])[0];
							this.meta.actionHistory.push(`${member.displayName} asked ${player2.member.displayName} for a ${card2?.name || `${args[currentArg]?.split(".")[0]}. Hint: they don't have it`}`);
							if (!card2 && !player2.traits.top?.cards.length) {
								member.send("Tough luck! They didn't have that card ¯\\_(ツ)_/¯");
								this.meta.actionHistory.push(`${member.displayName}${Core.weighted([[" used double team! It's not very effective..."],[" must pay for their crimes against skyrim and her people"], ["'s friends backstabbed them"], [" can't count cards"]])}`);
								break;
							}
							player.cards.push(player2.traits.top?.cards.length ? player2.traits.top.cards.pop() : player2.cards.splice(player2.cards.findIndex(card3 => card3 === card2),1)[0]);
							doUpdate = !this.removeCard(player2, card2);
							doUpdate = !this.receiveCard(player, card2) && doUpdate;
							this.meta.actionHistory.push(`${member.displayName}${Core.weighted([[" used shadow clone!"], [` is ~~stealing~~ *permanently borrowing* from ${player2.member.displayName}`], [" played blue eyes white dragon!"], [" knows the triple combo is infinitely better than the double combo"]])}`);
							break;
						}
						case "5": {
							let currentArg = 1;
							const cards = [];
							do {
								const card2 = player.getCards(args[currentArg]?.split(".")[0], args[currentArg]?.split(".")[1])[0];
								if (!card2 || card2.id === "ek" || card2.id === "sk") {
									player.cards = player.cards.concat(cards);
									return channel.send("Could not find all of the cards requested from your hand");
								}
								player.cards.splice(player.cards.findIndex(card3 => card3 === card2), 1);
								cards.push(card2);
								currentArg++;
							} while (cards.length < 5);
							player.cards = player.cards.concat(cards);
							if ([...new Set(cards.map(card2 => card2.id))].length < 5) return channel.send("Each card must be unique.");
							cards.forEach(card2 => {
								if (card2?.traits.marked) card2.traits.marked = false;
								player.cards.splice(player.cards.findIndex(card3 => card3 === card2), 1);
							});
							this.piles.discard.cards = cards.concat(this.piles.discard.cards);
							const card2 = Core.getCards(this.piles.discard.cards, args[currentArg].split(".")[0], args[currentArg].split(".")[1])[0];
							const extra = card2 ? Core.weighted([[" and rolled a nat 20!"], [" from their flashback"], [" while reversing at a speed of 88 mph"], [" and wants to play it again!"], [" and pulled a reverse isekai"]]) : Core.weighted([[". Hint: they failed."], [" and rolled a nat 1"],[" and is *really* bad at paying attention"], [". Are they trying to just throw away cards?"], [" but made a typo"]]);
							this.meta.actionHistory.push(`**${member.displayName} is collecting a ${card2?.name || `${args[currentArg].split(".")[0]}**${extra}`}`);
							if (!card2) break;
							player.cards.push(this.piles.discard.cards.splice(this.piles.discard.cards.findIndex(card3 => card3 === card2),1)[0]);
							doUpdate = !this.receiveCard(player, card2);
							break;
						}
						case "ik":
							if (isNaN(Number(args[1]))) return channel.send(`${args[1]} is not a number`);
							this.piles.draw.cards.splice(Math.min(this.piles.draw.cards.length, Math.max(0, Math.floor(Math.abs(Number(args[1]))))), 0, player.cards.splice(player.cards.findIndex(card2 => card2 === card), 1)[0]);
							this.meta.actionHistory.push(`${member.displayName}${Core.weighted([[" saw their doom", 5],[" saw death", 3], [" witnessed ***true*** power"], [" turned deathly pale", 3], [" is inevitable"]])}`);
							if (player === this.meta.currentPlayer) this.nextPlayer(); // It should never not be the current player, but ¯\_(ツ)_/¯
							copy = null;
							this.meta.traits.message = null;
							break;
						case "re":
							this.meta.traits.clockwise = !this.meta.traits.clockwise;
							this.meta.actionHistory.push(Core.weighted([[`${member.displayName} spins right 'round, baby`], [`${member.displayName}: 'no u'`], [`${member.displayName} turned the tables!`, 3], [`!noitautis eht desrever ${member.displayName}`]]));
							this.nextPlayer();
							break;
						case "db": {
							const card2 = this.piles.draw.cards.pop();
							this.piles.discard.cards.unshift(player.cards.splice(player.cards.findIndex(card3 => card3 === card), 1)[0]);
							if (player.traits.cursed) player.traits.cursed = null;
							if (player.traits.bully) {
								const bully = player.traits.bully.hidden.bully;
								bully.cards.push(card2);
								player.member.send(`${bully.member.displayName} stole a ${card2.name}`);
								// The only way the tally of ek's vs sk's would become suddenly negative would be if they just drew an ek in this case
								if (bully.cards.reduce((acc, card3) => acc + (card3.id === "sk") - (card3.id === "ek"), 0) < 0) {
									this.meta.actionHistory.push(`${bully.member.displayName} stole an Exploding Kitten from ${member.displayName}! ~~idiot~~`);
								} else if (card2.id === "ik") {
									this.meta.actionHistory.push(`${bully.member.displayName} stole an Imploding Kitten from ${member.displayName}! ~~idiot~~`);
								} else {
									this.meta.actionHistory.push(`${bully.member.displayName}${Core.weighted([[` flanked ${member.displayName}`], [` is secretly a sub for ${member.displayName}`], [" thinks they're ExTrA qUiRkY by stealing the bottom card"]])}`);
								}
								doUpdate = !this.receiveCard(bully, card2);
								player.traits.bully = null;
							} else {
								player.cards.push(card2);
								// The only way the tally of ek's vs sk's would become suddenly negative would be if they just drew an ek in this case
								if (player.cards.reduce((acc, card3) => acc + (card3.id === "sk") - (card3.id === "ek"), 0) < 0) {
									this.meta.actionHistory.push(`${member.displayName}${Core.weighted([["'s luck bottomed out, and drew an Exploding Kitten!"], [" hit rock bottom with an Exploding Kitten!"]])}`);
								} else if (card2.id === "ik") {
									this.meta.actionHistory.push(`${member.displayName}${Core.weighted([[" drew an Imploding Kitten and now hates themself"], [" thought the bottom was safe, but drew an Imploding Kitten instead"]])}`);
								} else {
									this.meta.actionHistory.push(`${member.displayName}${Core.weighted([[" flanked the opposition", 2], [" is secretly a sub"], [" thinks they're quirky by not drawing the top card"]])}`);
								}
								doUpdate = !this.receiveCard(player, card2);
							}
							this.nextPlayer();
							break;
						}
						case "af": {
							const cards = this.piles.draw.cards.slice(0,3);
							const hand = new Discord.MessageEmbed()
								.setTitle("Next 3 Cards:")
								.setDescription(cards.map((card2, i) => `${i+1}. ${card2.id}: ${card2.name}`))
								.addField("Type `!af 𝘯𝘶𝘮 𝘯𝘶𝘮 𝘯𝘶𝘮` to change the order","Example: `!af 3 2 1` will swap the first and third cards")
								.setColor(cards.some(card2 => card2.id === "ek") ? [142,17,1] : (cards.some(card2 => card2.id === "ik") ? [0,173,255] : Math.floor(Math.random() * 16777215)));
							member.send(hand).then(msg => this.meta.traits.message = [msg, "¯\\_(ツ)_/¯"]);
							card.hidden.needsInput = true;
							this.meta.actionHistory.push(`${member.displayName}${Core.weighted([[" found the TARDIS"], [" altered the course of history"], [" made irreparable damages to the timeline"], [" killed Santa Claus"]])}`);
							break;
						}
						case "ta": {
							if (!args[1]) return channel.send("Specify a player to target! (`!ta 𝘱𝘭𝘢𝘺𝘦𝘳`. Accepts name/nickname, portions of the name, or @)");
							let player2 = this.getPlayers(args[1]);
							if (player2.length > 1) return channel.send(`Be more specific! \`${args[1]}\` matched multiple players`);
							player2 = player2[0];
							if (!player2) return channel.send("Could not find player"); // yes, you can target yourself
							this.meta.currentPlayer = player2;
							this.meta.traits.extraTurns += (!this.meta.traits.extraTurns ? 1 : 2);
							this.meta.actionHistory.push(`${member.displayName}${Core.weighted([[` targeted ${this.meta.currentPlayer.member.displayName}!`, 5], [` jumped ${this.meta.currentPlayer.member.displayName}!`, 4], [` assassinated ${this.meta.currentPlayer.member.displayName}!`, 2], [` is now convicted of manslaughtering ${this.meta.currentPlayer.member.displayName}`]])}`);
							break;
						}
						case "sk":
							this.meta.actionHistory.push(`${member.displayName}${Core.weighted([[" just realized their mistake", 4], [" is now regretting their life choices", 4], [": 'oops'", 2], [" is a smooth-brained cretin"]])}`);
							break;
						case "ss":
							this.meta.traits.extraTurns = 0;
							this.nextPlayer();
							this.meta.actionHistory.push(`${member.displayName}${Core.weighted([[" just got a new record for speedrunning life"], [": ザワルド!"], [": 'I am already 4 parallel universes ahead of you'"], [" apparently doesn't like this game"]])}`);
							break;
						case "s5": {
							const hand = new Discord.MessageEmbed()
								.setTitle("Next 5 Cards:")
								.setDescription(this.piles.draw.cards.slice(0,5).map((card, i) => `${i+1}. ${card.id}: ${card.name}`))
								.setColor(Math.floor(Math.random() * 16777215));
							member.send(hand).then(msg => this.meta.traits.message = [msg, "¯\\_(ツ)_/¯"]);
							this.meta.actionHistory.push(`${member.displayName}${Core.weighted([[" became a seer"], [" saw 6 trillion and 1 universes"], [" sniffed some flex-glue"], [" has a ***really*** good hunch"]])}`);
							break;
						}
						case "a5": {
							const cards = this.piles.draw.cards.slice(0,5);
							const hand = new Discord.MessageEmbed()
								.setTitle("Next 5 Cards:")
								.setDescription(cards.map((card2, i) => `${i+1}. ${card2.id}: ${card2.name}`))
								.addField("Type `!a5 𝘯𝘶𝘮 𝘯𝘶𝘮 𝘯𝘶𝘮 𝘯𝘶𝘮 𝘯𝘶𝘮` to change the order","Example: `!a5 3 2 1 5 4` will rearrange cards accordingly.\n(card 3 is now on top, card 4 is now 5th, etc.)")
								.setColor(cards.some(card2 => card2.id === "ek") ? [142,17,1] : (cards.some(card2 => card2.id === "ik") ? [0,173,255] : Math.floor(Math.random() * 16777215)));
							member.send(hand).then(msg => this.meta.traits.message = [msg, "¯\\_(ツ)_/¯"]);
							card.hidden.needsInput = true;
							this.meta.actionHistory.push(`${member.displayName}${Core.weighted([[" cast fireball"], [" cheated"], [" messed with wibbly-wobbly, timey-wimey, spacey-wacey... stuff."], [" ripped a hole in the fabric of the universe"], [": 'This is the Monado's power!'"]])}`);
							break;
						}
						case "sw":
							[this.piles.draw.cards[0], this.piles.draw.cards[this.piles.draw.cards.length-1]] = [this.piles.draw.cards[this.piles.draw.cards.length-1], this.piles.draw.cards[0]];
							this.meta.actionHistory.push(`${member.displayName}${Core.weighted([[" reversed gravity"], [" could've used a draw from the bottom card"], [" has an arm where their leg should be"], [" lost half an eyebrow"]])}`);
							break;
						case "gc":
							card.hidden.needsInput = true;
							card.hidden.collected = Object.values(this.players).filter(player => !player.cards.length && !player.traits.top?.cards.length); // add players who don't have cards in hand nor tower of power
							Object.values(this.players).forEach(player2 => {
								if (player2.traits.top?.cards.length) {
									card.hidden.collected.push(player2);
									this.piles.draw.cards.push(player2.traits.top.cards.pop());
								}
							});
							if (card.hidden.collected.length === Object.keys(this.players).length) {
								card.hidden.needsInput = false;
								Core.shuffle(this.piles.draw.cards);
								this.meta.actionHistory.push(`${member.displayName}${Core.weighted([[" is on a quest to find every possible quote"], [" actually does recycling, not trash smh"], [" has been reduced, reused, and recycled"], [" taught their racoon to eat recycling instead"]])}`);
								break;
							}
							this.meta.actionHistory.push(`${member.displayName}${Core.weighted([[" is the trash man"], [" is taking out the trash"], ["'s mom said they need to do chores"], [" is utter garbage"], [" has a pet trash panda"]])}`);
							this.meta.channel.send(`Give any card to the garbage heap by typing \`!gc 𝘪𝘥\`, similar to discarding it${Object.values(this.players).some(player2 => player2.traits.cursed) ? "\n(If you're cursed, just type `!gc`)" : ""}`);
							break;
						case "cb": {
							const eks = [];
							for (let i = this.piles.draw.cards.length - 1; i > 0; i--) {
								if (this.piles.draw.cards[i].id === "ek") eks.push(this.piles.draw.cards.splice(i, 1)[0]);
							}
							this.piles.draw.cards = eks.concat(this.piles.draw.cards);
							this.meta.actionHistory.push(`${member.displayName}${Core.weighted([[" has doomed us all", 3], [" has forced all heck to break loose!"], [": ***'TACTICAL NUKE: INCOMING'***"], [" has brought balance, like all things should be"]])}`);
							this.nextPlayer();
							break;
						}
						case "mk": {
							if (!args[1]) return channel.send("Specify a player to mark! (`!mk 𝘱𝘭𝘢𝘺𝘦𝘳`. Accepts name/nickname, portions of the name, or @)");
							let player2 = this.getPlayers(args[1]);
							if (player2.length > 1) return channel.send(`Be more specific! \`${args[1]}\` matched multiple players`);
							player2 = player2[0];
							if (!player2 || !player2.cards.length) return channel.send("Could not find player"); // yes, you could mark yourself, but why?
							const cards = player2.cards.filter(card2 => !card2.traits.marked);
							if (!cards.length) return channel.send("They don't have any cards to pee on!");
							cards[Math.floor(Math.random()*cards.length)].traits.marked = true;
							this.meta.actionHistory.push(`${member.displayName}${Core.weighted([[` peed on ${player2.member.displayName}'s cards`], [" is disgusting"], [" has no public decency"], [" isn't potty trained"], ["! Bad Kitty!"]])}`);
							break;
						}
						case "cc": {
							if (!args[1]) return channel.send("Specify a player to curse! (`!cc 𝘱𝘭𝘢𝘺𝘦𝘳`. Accepts name/nickname, portions of the name, or @)");
							let player2 = this.getPlayers(args[1]);
							if (player2.length > 1) return channel.send(`Be more specific! \`${args[1]}\` matched multiple players`);
							player2 = player2[0];
							if (!player2) return channel.send("Could not find player"); // yes, you could curse yourself, but why?
							player2.traits.cursed = true;
							player2.member.send(`You've been blinded! Discard random cards using just a plain \`!\`${player2.cards.some(card2 => card2.traits.marked) ? " -- You can discard marked cards like normal, however." : ""}`);
							this.meta.actionHistory.push(Core.weighted([[`${member.displayName} bewitched ${player2.member.displayName} with a terrible curse!`, 3], [`${member.displayName} stabbed ${player2.member.displayName}'s eyes out!`], [`${player2.member.displayName} was caught staring... :flushed:`], [`${player2.member.displayName} looked at the sun for too long`]]));
							break;
						}
						case "bk": {
							let player2 = Object.values(this.players).find(player2 => player2.cards.some(card2 => card2 !== card && card2.traits.pair === card.traits.pair) || card.traits.pair === player2.traits.mouse?.traits.pair);
							if (player === player2) {
								if (!args[1]) return channel.send("Specify a player to bark at! (`!bk 𝘱𝘭𝘢𝘺𝘦𝘳`. Accepts name/nickname, portions of the name, or @)");
								player2 = this.getPlayers(args[1]);
								if (player2.length > 1) return channel.send(`Be more specific! \`${args[1]}\` matched multiple players`);
								player2 = player2[0];
								if (!player2 || player2 === player) return channel.send("Could not find player. (Did you @ them?)");
								this.piles.discard.cards.unshift(player.traits.mouse || player.cards.splice(player.cards.findIndex(card2 => card2.traits.pair === card.traits.pair && card2 !== card),1)[0]);
							}
							if (player2) {
								card.hidden.mouse = player2;
								card.hidden.cat = player;
								card.hidden.num = Math.ceil(player2.cards.length/2);
								card.hidden.needsInput = true;
								if (player2.traits.mouse) {
									this.piles.discard.cards.unshift(player2.traits.mouse);
									player2.traits.mouse = null;
								} else {
									const card2Index = player2.cards.findIndex(card2 => card2.traits.pair === card.traits.pair);
									// The only time it would be -1 is if player discarded both bks (and got to choose who to steal from)
									if (card2Index !== -1) {
										this.piles.discard.cards.unshift(player2.cards.splice(card2Index, 1)[0]);
										card.hidden.num = Math.ceil(player2.cards.length/2);
										this.removeCard(player2, new Card("ek")); // Just to update their hand.
									}
								}
								// Cards should not be put back into the tower.
								// Situations where no one can steal from player with tower (due to lack of steal cards) can arise, and if an ek is put inside, causes a game breaking scenario
								/*
								if (player2.traits.top?.cards.length) {
									card.hidden.num = Math.ceil(player2.traits.top.cards.length/2);
									const cards = player2.traits.top.cards.splice(0, card.hidden.num);
									if (player.traits.top?.cards.length) {
										card.hidden.needsInput = false;
										player.traits.top.cards = player.traits.top.cards.concat(cards);
										Core.shuffle(player.traits.top.cards);
										player2.traits.top.cards = player2.traits.top.cards.concat(player.traits.top.cards.splice(0, card.hidden.num));
										this.meta.actionHistory.push(Core.weighted([[`${member.displayName} and ${player2.member.displayName} jebaited each other`], [`${member.displayName} and ${player2.member.displayName} failed successfully`], [`I tried to unravel ${member.displayName} and ${player2.member.displayName}'s brains, but couldn't because they were too smooth`], [`${member.displayName} and ${player2.member.displayName} wanted to see if a particular edge case broke the game. Well, it doesn't, ***N E R D S***`]]));
										break;
									}
									card.hidden.phase = 2;
									player.cards = player.cards.concat(cards);
									member.send(`Choose ${card.hidden.num} cards to put back into the tower: \`!bk 𝘪𝘥 𝘪𝘥 𝘪𝘥...\`.\n(almost like discarding them, each id is a different card)`);
									this.meta.actionHistory.push(Core.weighted([[`${player2.member.displayName} jebaited ${member.displayName}`], [`${player2.member.displayName} reverse slam-dunked on ${member.displayName}`], [`${member.displayName} couldn't match ${player2.member.displayName}'s big-brain moves`]]));
									break;
								}
								*/
								if (player2.cards.length) {
									card.hidden.phase = 1;
									/*
									if (player.traits.top?.cards.length) {
										player2.member.send(`Choose ${card.hidden.num} cards to trade with their tower: \`!bk 𝘪𝘥 𝘪𝘥 𝘪𝘥...\`.\n(almost like discarding them, each id is a different card)`);
									} else {
									*/
									player2.traits.cursed ? player2.member.send(`Just type \`!bk\` and ${card.hidden.num} random cards will be exchanged`) : player2.member.send(`Choose ${card.hidden.num} cards to hand over: \`!bk 𝘪𝘥 𝘪𝘥 𝘪𝘥...\`.\n(almost like discarding them, each id is a different card)`);
									/*
									}
									*/
									this.meta.actionHistory.push(Core.weighted([[`${member.displayName} jebaited ${player2.member.displayName}`], [`${member.displayName} dunked on ${player2.member.displayName}`], [`${player2.member.displayName} couldn't match ${member.displayName}'s sanic speed`], [`${member.displayName} is 2 fast 4 u`]]));
									break;
								} else {
									card.hidden.needsInput = false;
									this.meta.actionHistory.push(`${member.displayName} ${Core.weighted([["can't count cards", 2], ["bit their own tail"], ["was muzzled"]])}`);
									break;
								}
							}
							player.traits.mouse = card; // only used to signify if they attempted discarding too early
							this.meta.actionHistory.push(`${member.displayName}${Core.weighted([[" jebaited themself"], [", geeettttttt dunked on!!!"], [" made a 200 IQ wrinkly brain move"], [" tripped over their untied socks and sandles"]])}`);
							break;
						}
						case "an": {
							const cards = this.piles.draw.cards.slice(0,3);
							const hand = new Discord.MessageEmbed()
								.setTitle("Next 3 Cards:")
								.setDescription(cards.map((card2, i) => `${i+1}. ${card2.id}: ${card2.name}`))
								.addField("Type `!an 𝘯𝘶𝘮 𝘯𝘶𝘮 𝘯𝘶𝘮` to change the order","Example: `!an 3 2 1` will swap the first and third cards")
								.setColor(cards.some(card2 => card2.id === "ek") ? [142,17,1] : (cards.some(card2 => card2.id === "ik") ? [0,173,255] : Math.floor(Math.random() * 16777215)));
							member.send(hand).then(msg => this.meta.traits.message = [msg, "¯\\_(ツ)_/¯"]);
							card.hidden.needsInput = true;
							card.hidden.owner = player;
							this.meta.actionHistory.push(`${member.displayName}${Core.weighted([[" is too impatient"], [" needs to take a bathroom break"], [" is breaking all laws of time-travel"], [" can't wait for their turn"], [" bought a fast pass"]])}`);
							break;
						}
						case "br": {
							if (player.traits.bully) return channel.send("You can't bury a card while being bullied"); // because they're the nerd, and someone's bullying them with an "I'll Take That"
							const card2 = this.piles.draw.cards.shift();
							card.hidden.card = card2;
							card.hidden.needsInput = true;
							member.send(`Type \`!br 𝘯𝘶𝘮\` to place the **${card2.name}** back into the draw pile.\nRange: 0-${this.piles.draw.cards.length}. 0 is the top of the deck`);
							this.meta.actionHistory.push(`${member.displayName}${Core.weighted([[" digs this card", 3], [" has to hide the bod-- err... *evidence*"], [" wishes to be exactly like Heathcliff"], [" swears this shovel is just slightly shorter than the other ones"]])}`);
							break;
						}
						case "pa":
							this.meta.traits.extraTurns += (!this.meta.traits.extraTurns ? 2 : 3);
							this.meta.actionHistory.push(`${member.displayName}${Core.weighted([[" hurt themself in their confusion!", 2], [` mugged ${member.displayName}!`], [", why are you slapping yourself?"], [" just wants to end the game sooner"], [" has a death wish"]])}`);
							break;
						case "pl": {
							const pLength = Object.keys(this.players).length;
							card.hidden.needsInput = true;
							card.hidden.players = Object.values(this.players).filter(player2 => player2.cards.length || player2.traits.top?.cards.length).sort((player2, player3) => ((this.meta.traits.clockwise ? player2 : player3).index-player.index+pLength)%pLength - ((this.meta.traits.clockwise ? player3 : player2).index-player.index+pLength)%pLength);
							while (card.hidden.players[0] && card.hidden.players[0].traits.top?.cards.length) {
								this.piles.draw.cards.unshift(card.hidden.players[0].traits.top.pop());
								card.hidden.players.shift();
							}
							if (!card.hidden.players.length) {
								this.meta.actionHistory.push(`${member.displayName}${Core.weighted([[" ate too much"], [" might vomit..."], [" is brought to you by the letter 'Diabetes'"], [" solved world hunger"], [" is playing with way too many friends and was really trying to achieve this edge case"]])}`);
								card.hidden.needsInput = false;
								break;
							}
							card.hidden.players[0].member.send("Give any card to the potluck by typing `!pl 𝘪𝘥`, very similar to discarding it");
							this.meta.actionHistory.push(`${member.displayName}${Core.weighted([[` is hungry for some ${Core.weighted([["Mexican"], ["Chinese"], ["Japanese"], ["Asian"], ["Thai"], ["Indian"], ["Italian"], ["Greek"], ["fast"], ["French"], ["German"], ["Mediterranean"], ["Russian"], ["Swedish"], ["vegan"], ["Danish"], ["Antarctic"], ["Filipino"], ["Latvian"], ["Polynesian"], ["Australian"], ["Brazilian"], ["Canadian"], ["fine-dining"], ["barbeque"], ["tapas"], ["Mom's homemade"], ["cat"], ["Syrian"], ["African"], ["Middle-Eastern"], ["Jewish"], ["Medieval"], ["sea"], ["Indonesian"]])} food`, 9], [" likes Thanksgiving a bit too much..."], [" is brought to you by the letter 'Cookie'"], [" ordered two number 9s, a number 9 large, a number 6 with extra dip, a number 7, two number 45s, one with cheese, and a large soda"], [" has never heard of a diet before"]])}`);
							break;
						}
						case "tp":
							Object.values(this.players).forEach(player2 => {
								if (player2.traits.top === card.traits.pair) player2.traits.top = null; // Only occurs if the 5-combo is used, and they re-discard it. They aren't stealing cards from their hand ;)
							});
							player.traits.top = Object.values(this.piles).find(pile => pile.traits.pair === card.traits.pair);
							this.meta.actionHistory.push(`${member.displayName}${Core.weighted([[" even makes Sauron look silly with their new tower"], [" is **DOMINATING**"], [" might be compensating for something..."], [": 'Look at my magnificent tower!'"]])}`);
							break;
						case "tt": {
							if (!args[1]) return channel.send("Specify a player to bully! (`!tt 𝘱𝘭𝘢𝘺𝘦𝘳`. Accepts name/nickname, portions of the name, or @)");
							let player2 = this.getPlayers(args[1]);
							if (player2.length > 1) return channel.send(`Be more specific! \`${args[1]}\` matched multiple players`);
							player2 = player2[0];
							if (!player2 || player2 === player) return channel.send("Could not find player");
							if (player2.traits.bully) return channel.send("They're already being bullied, ya meanie >:(");
							card.hidden.bully = player;
							player2.traits.bully = card;
							player.cards.splice(player.cards.findIndex(card2 => card2 === card), 1)[0];
							doUpdate = !this.removeCard(player, card); // Just updates their hand
							this.meta.actionHistory.push(`${member.displayName}${Core.weighted([[` is bullying ${player2.member.displayName}!`, 2], [` is planning a heist on ${player2.member.displayName}'s house`], [`: :musical_note: '${player2.member.displayName}'s sweets are mine!' :musical_note:`], [` took one of ${player2.member.displayName}'s children`]])}`);
							break;
						}
						case "hf": {
							const cards = this.piles.draw.cards.slice(0,3);
							const hand = new Discord.MessageEmbed()
								.setTitle("Next 3 Cards:")
								.setDescription(cards.map((card2, i) => `${i+1}. ${card2.id}: ${card2.name}`))
								.addField("Type `!hf 𝘯𝘶𝘮 𝘯𝘶𝘮 𝘯𝘶𝘮` to change the order","Example: `!hf 3 2 1` will swap the first and third cards")
								.setColor(cards.some(card2 => card2.id === "ek") ? [142,17,1] : (cards.some(card2 => card2.id === "ik") ? [0,173,255] : Math.floor(Math.random() * 16777215)));
							member.send(hand).then(msg => this.meta.traits.message = [msg, "¯\\_(ツ)_/¯"]);
							card.hidden.needsInput = true;
							this.meta.actionHistory.push(`${member.displayName}${Core.weighted([["'s friendship is magical"], [" wants to share the love!"], [" found a new companion for the Doctor"], [" enjoys a bit of communism"]])}`);
							break;
						}
					}
					// If discarded card is not a combo, exploding/imploding kitten, a draw from the bottom, an I'll Take That, or a poorly timed barking kitten, discard it.
					if (!(["ek", "2", "3", "5", "ik", "db", "tt"].includes(card?.id || args[0])) && (card?.id !== "bk" || !player.traits.mouse)) {
						this.piles.discard.cards.unshift(player.cards.splice(player.cards.findIndex(card2 => card2 === card), 1)[0]);
						doUpdate = !this.removeCard(player, card);
					}
					if (doUpdate) this.updateUI();
					this.meta.traits.copy = copy;
					break;
				}
			}
		}
	}

	nextPlayer(forceNewPlayer) {
		if (!this.meta.traits.extraTurns || forceNewPlayer) {
			const index = ((this.meta.currentPlayer.index + (this.meta.traits.clockwise ? 1 : -1)) + Object.keys(this.players).length) % Object.keys(this.players).length;
			this.meta.currentPlayer = Object.values(this.players).find(player2 => player2.index === index);
		}
		this.meta.traits.extraTurns = Math.max(this.meta.traits.extraTurns-1, 0);
		this.resetTimeLimit();
	}

	timeLimit() {
			// TODO: what if a card needs input and they are afk?
			const card = this.piles.draw.cards.shift();
			const player = this.meta.traits.currentPlayer;
			if (player.traits.bully) {
				player.traits.bully.cards.push(card);
				// The only way the tally of ek's vs sk's would become suddenly negative would be if they just drew an ek in this case
				if (player.traits.bully.cards.reduce((acc, card) => acc + (card.id === "sk") - (card.id === "ek"), 0) < 0) {
					this.meta.actionHistory.push(`${player.traits.bully.member.displayName} afked and stole an Exploding Kitten from ${member.displayName}! ~~idiot~~`);
				} else if (card.id === "ik") {
					this.meta.actionHistory.push(`${player.traits.bully.member.displayName} afked and stole an Imploding Kitten from ${member.displayName}! ~~idiot~~`);
				} else {
					this.meta.actionHistory.push(`${player.traits.bully.member.displayName} afked and stole a card from ${member.displayName}`);
					this.nextPlayer();
				}
				this.receiveCard(player.traits.bully, card);
				player.traits.bully = null;
			} else {
				player.cards.push(card);
				// The only way the tally of ek's vs sk's would become suddenly negative would be if they just drew an ek in this case
				if (player.cards.reduce((acc, card) => acc + (card.id === "sk") - (card.id === "ek"), 0) < 0) {
					this.meta.actionHistory.push(`${member.displayName} drew an Exploding Kitten while they were afk!`);
				} else if (card.id === "ik") {
					this.meta.actionHistory.push(`${member.displayName} drew an Imploding Kitten while they were afk!`);
				} else {
					this.meta.actionHistory.push(`${member.displayName} drew from afking too long`);
					this.nextPlayer();
				}
				this.receiveCard(player, card);
			}
		this.meta.actionHistory.push(`${this.meta.currentPlayer.member.displayName} drew from taking too long`);
		this.nextPlayer();
	}

	updateUI() {
		const display = new Discord.MessageEmbed();
		//const rightPlayer = Object.values(this.players).find(player => player.index === (this.meta.currentPlayer.index+1)%Object.keys(this.players).length);
		//const leftPlayer = Object.values(this.players).find(player => player.index === (this.meta.currentPlayer.index-1+Object.keys(this.players).length)%Object.keys(this.players).length);
		this.renderTable().then(() => {
			const deathclock = this.piles.draw.cards.findIndex(card => card.id === "ik" && card.traits.up);
			display.setTitle(`It is currently ${this.meta.currentPlayer.member.displayName}'s turn`)
			   .attachFiles(new Discord.MessageAttachment(this.render.canvas.toBuffer(), "game.png"))
			   .setDescription(this.meta.actionHistory.slice(-3).reverse().join("\n"))
			   //.addField(`${leftPlayer.member.displayName} ${this.meta.traits.clockwise ? `-> **${this.meta.currentPlayer.member.displayName}** ->` : `<- **${this.meta.currentPlayer.member.displayName}** <-`} ${rightPlayer.member.displayName}`, this.meta.actionHistory.slice(-2).reverse().join("\n"))
			   .setColor([Math.max(0, Math.min(255, -510*(this.piles.draw.cards.length/this.piles.draw.traits.total - 1))), Math.max(0, Math.min(255, 510*this.piles.draw.cards.length/this.piles.draw.traits.total)), 0])
			   .setImage("attachment://game.png")
			   .setFooter(`${this.piles.draw.cards.length} Card${Core.plural(this.piles.draw.cards.length)} Remaining${deathclock !== -1 && deathclock <= Math.max(5, Object.keys(this.players).length)? ` · Cards until Imploding Kitten: ${deathclock}` : ""}${this.meta.traits.extraTurns ? ` · Turns left: ${this.meta.traits.extraTurns + 1}` : ""}`);
			this.meta.channel.send(display);
		});
	}

	/**@param {Player} player - The player to remove from the game*/
	removePlayer(player) {
		this.meta.traits.copy = null; // yes, this can theoretically make a card "un-nopable," but I don't care enough to fix that
		this.meta.traits.message = null;
		this.piles.discard.cards = this.piles.discard.cards.concat(player.cards);
		this.meta.deletePlayer = player.member.id;
		if (this.meta.traits.extraTurns) { // If the player died with extra turns left
			this.meta.traits.extraTurns = 0;
			this.nextPlayer();
		}
		Object.values(this.players).forEach(player2 => {
			if (player2.index > player.index) player2.index--;
		});
		delete this.players[player.member.id];
		this.drawStatic().then(() => this.updateUI());
		if (Object.keys(this.players).length === 1) {
			this.meta.channel.send(`${Object.values(this.players)[0].member.displayName} won the game!`);
			this.meta.ended = true;
		}
	}

	renderTable() {
		this.render.ctx.drawImage(this.render._canvas, 0, 0);
		const players = Object.values(this.players);
		if (this.piles.draw.cards[0]?.traits.up) Canvas.loadImage(this.piles.draw.cards[0].image).then(image => this.render.ctx.drawImage(image, 237, 125, 175, 250));
		let lastPromise = new Promise((res, rej) => res());
		for (let j = 0; j < players.length; j++) {
			const player = players[j];
			const x = 300*Math.cos(2*Math.PI*player.index/players.length-Math.PI);
			const y = 200*Math.sin(2*Math.PI*player.index/players.length-Math.PI);
			this.render.drawText(player.cards.length.toString(), x + 480, y + 241);
			// Marked cards rendering
			const marked = player.cards.filter(card => card.traits.marked);
			marked.forEach((card, i) => {
				Canvas.loadImage(card.image).then(image => {
					this.render.ctx.drawImage(image, x + 432 + (marked.length > 1 ? 40*i/(marked.length-1) : 0), y + 255, 40, 57);
					this.render.ctx.drawImage(this.render.images.marked, x + 432 + (marked.length > 1 ? 40*i/(marked.length-1) : 0), y + 255, 40, 57);
					if (card.traits.pair >= 0 && Object.keys(this.players).length > 5 + (this.meta.rules.imploding ? 1 : 0)) this.render.drawText(card.traits.pair, x + 442 + (marked.length > 1 ? 40*i/(marked.length-1) : 0), y + 245);
				});
			});
			// Tower rendering
			if (player.traits.top) {
				this.render.ctx.drawImage(this.render.images.tower, x+330, y+200);
				this.render.drawText(player.traits.top.cards.length, x+340, y+290);
				if (Object.keys(this.players).length > 5 + (this.meta.rules.imploding ? 1 : 0)) this.render.drawText(player.traits.top.traits.pair, x+400, y+290);
			}
			// Barking Kitten rendering (if the player discarded one too early)
			if (player.traits.mouse) {
				this.render.ctx.drawImage(this.render.images.mouse, x+330, y+200);
				if (Object.keys(this.players).length > 5 + (this.meta.rules.imploding ? 1 : 0)) this.render.drawText(player.traits.mouse.traits.pair, x+340, y+240);
			}
			// I'll Take That rendering
			if (player.traits.bully) lastPromise = Canvas.loadImage(player.traits.bully.hidden.bully.member.user.displayAvatarURL({format: "png", size: 32})).then(image => this.render.ctx.drawImage(image, x+380, y+210, 40, 40));
		}
		this.render.ctx.drawImage(this.render.images.halo, 300*Math.cos(2*Math.PI*this.meta.currentPlayer.index/players.length-Math.PI)+330, 200*Math.sin(2*Math.PI*this.meta.currentPlayer.index/players.length-Math.PI)+200);
		return lastPromise.then(() => Canvas.loadImage(this.piles.discard.cards[0]?.image || "images/exkit/discardpileghost.png").then(image => {
			this.render.ctx.font = "32px Arial";
			this.render.drawText(`${this.piles.draw.cards.length} Cards`, 260, 320);

			this.render.ctx.drawImage(image, 437, 125, 175, 250);
			if (this.piles.discard.cards[0]?.traits.pair >= 0 && Object.keys(this.players).length > 5 + (this.meta.rules.imploding ? 1 : 0)) {
				this.render.ctx.font = "54px Arial";
				this.render.drawText(this.piles.discard.cards[0].traits.pair, 568, 208);
				this.render.ctx.font = "40px Arial";
			}
		}));
	}

	drawStatic() {
		return super.drawStatic().then(() => {
			return Canvas.loadImage("images/exkit/back.png");
		})
		.then(image => {
			this.render.ctx.drawImage(image, 237, 125, 175, 250);
			return Canvas.loadImage("images/exkit/icon.png");
		})
		.then(image => {
			const players = Object.values(this.players);
			players.forEach(player => this.render.ctx.drawImage(image, 300*Math.cos(2*Math.PI*player.index/players.length-Math.PI)+432, 200*Math.sin(2*Math.PI*player.index/players.length-Math.PI)+210));
			this.saveCanvas();
		});
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
				if (card1.id === "de" || card2.id === "de") return card1.id === "de" ? -1 : 1;
				return card1.name < card2.name ? -1 : (card1.name > card2.name);
				}).map(card => {
					const traits = Object.keys(card.traits).map(traitKey => ((!card.traits[traitKey] && card.traits[traitKey] !== 0) || (traitKey === "pair" && Object.keys(this.players).length < 5 + (this.meta.rules.imploding ? 1 : 0))) ? "" : (`${traitKey}${card.traits[traitKey] === true ? "" : `:${card.traits[traitKey]}`}`)).join(",");
					return `${card.id}: ${card.name}${traits.length > 0 ? `.${traits}` : ""}`;
				}))
			.setColor(Math.floor(Math.random() * 16777215));
		player.member.send(hand).then(this.dealCards(players));
	}

	/**
	 * A method used to activate any actions a card may do after it enters a Player's hand, e.g. Exploding Kitten
	 * @param {Player} player - The Player receiving the Card
	 * @param {Card} card - The Card
	 * @returns {Boolean} Whether a player died because of the card they received.
	 */
	receiveCard(player, card) {
		switch(card.id) {
			case "ek":
				let bombs = player.cards.reduce((acc, card) => acc + (card.id === "ek" && !card.traits.exploded) - (card.id === "sk"), 0);
				if (card.traits.exploded) bombs++; // Only happens if they discard an ek protected by a sk
				if (bombs <= 0) {
					this.dealCards([player]);
					break;
				}
				const saves = player.cards.filter(card => card.id === "de").length;
				if (saves < bombs) {
					this.meta.actionHistory.push(`**${player.member.displayName}${Core.weighted([[" exploded!", 3], [" hecking died!", 2], [" was slain"], [" was killed by [Intential Game Design]"], [" went up in flames"], [" cast a 9th level fireball on themselves"], [" hit the ground too hard"], [" fell for the cat belly rub trap"], [" watched their innards become outards"], ["'s extremities were detached"], [" was onboard the Challenger"]])}**`);
					this.removePlayer(player); // conveniently also moves on to the next player
					return true;
				}
				for (let i = 0; i < bombs; i++) {
					if (player.traits.cursed) {
						/**@type {Card[]} */
						let cards;
						do {
							cards.unshift(player.cards.splice(Math.floor(Math.random()*player.cards.length), 1));
							this.piles.discard.cards.unshift(cards[0]);
							this.removeCard(player, cards[0]);
							if (cards[0].id === "ek") {
								if (saves < ++bombs) {
									this.meta.actionHistory.push(`**${player.member.displayName}${Core.weighted([[" exploded! twice!", 2], [" cut the right wire.. on the wrong bomb"], [" didn't realize there was a second bomb"], [" pulled a grenade on themself"], [" commited war crimes"], [" couldn't handle the heat"]])}**`);
									this.removePlayer(player);
									return true;
								}
							}
						} while(cards[0].id !== "de");
						this.meta.channel.send(`${player.member.displayName} blindly threw a ${cards.map(card2 => card2.name).join(" and ")} at the Exploding Kitten to solve their problems`);
					} else {
						this.piles.discard.cards.unshift(player.cards.splice(player.cards.findIndex(card2 => card2.id === "de"), 1)[0]);
					}
				}
				for (let i = 0; i < bombs - (card.traits.exploded ? 1 : 0); i++) {
					player.cards.find(card2 => card2.id === "ek" && !card2.traits.exploded).traits.exploded = true;
				}
				if (bombs > 1) {
					player.member.send(`Type \`!ek 𝘯𝘶𝘮\` to place 1 Exploding Kitten back into the draw pile, and repeat for each one you defused (${bombs}).\nRange: 0-${this.piles.draw.cards.length}. 0 is the top of the deck`);
					this.meta.actionHistory.push(`**${player.member.displayName}${Core.weighted([[" is a hecking madlad!"], [" is truly a chad"], [" just pulled a Franz Fedinand! And Lived!"], [" has anime protagonist plot armor"]])}**`);
				} else {
					player.member.send(`Type \`!ek 𝘯𝘶𝘮\` to place the Exploding Kitten back into the draw pile.\nRange: 0-${this.piles.draw.cards.length}. 0 is the top of the deck`);
					this.meta.actionHistory.push(`**${player.member.displayName}${Core.weighted([[" defused a bomb!", 2], [" defused a bomb by mailing it to their neighbor"], [" became a hero!"], [" saved the day!"], [" cut the right wire!"], [" is now on the terrorist watch-list"]])}**`);
				}
				break;
			case "ik":
				if (card.traits.up) {
					this.meta.actionHistory.push(`**${player.member.displayName}${Core.weighted([[" imploded!", 3], [" was eviscerated!"], [" was annihilated!", 2], [" saw their forehead... in a black hole"], [": 'It's just a flesh wound...'"]])}**`);
					this.removePlayer(player);
					return true;
				}
				card.traits.up = true;
				player.member.send(`Type \`!ik 𝘯𝘶𝘮\` to place the Imploding Kitten back into the draw pile.\nRange: 0-${this.piles.draw.cards.length}. 0 is the top of the deck`);
				break;
			default:
				this.dealCards([player]);
				break;
		}
		return false;
	}

	/**
	 * A method used to activate any actions a card may do when it leaves a Player's hand, e.g. removing the marked condition on a card
	 * @param {Player} player - The Player removing the Card
	 * @param {Card} card - The Card
	 * @returns {Boolean} Whether the player died because of they card they gave away
	 */
	removeCard(player, card) {
		if (card.traits.marked) card.traits.marked = null;
		if (card.hidden.cursed) card.hidden.cursed = null;
		switch(card.id) {
			case "sk":
				this.meta.actionHistory.push(`**${player.member.displayName}${Core.weighted([[" is an idiot", 3], [" attempted suicide", 2], [" gets what they deserve"], [" committed toaster-bath"], [" watched their innards become outards"], ["'s plea for death was answered"]])}**`);
				return this.receiveCard(player, new Card("ek"));
			default:
				this.dealCards([player]);
				break;
		}
		return false;
	}
}