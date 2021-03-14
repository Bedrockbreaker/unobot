import Discord from "discord.js";
import {Core, Player} from "./core.js";

/**
 * Wikipedia Game
 * @class baseWiki
 */
export default class baseWiki extends Core {
	/**@param {Discord.GuildChannel} channel - The channel to send updates to*/
	constructor(channel) {
		super("Wikipedia Game", channel, {}, {truePlayer: null, judge: null});
		this.meta.channel.send("Submit titles with `!𝘵𝘪𝘵𝘭𝘦 𝘨𝘰𝘦𝘴 𝘩𝘦𝘳𝘦` (through DMs with me). To retrieve a random submission, type `!`\nThe judge can `!guess 𝘱𝘭𝘢𝘺𝘦𝘳` -- 1 point if correct, and 1 point to the person they chose");
	}

	/**
	 * @param {Discord.GuildMember} member - The member to generate a player for
	 * @param {Boolean} isLeader - Whether the new player is a leader
	 */
	genDefaultPlayer(member, isLeader) {
		return new Player(member, [], isLeader, 0, {}, {score: 0, submissions: []});
	}

	start() {
		// Don't change the phase to 2, because that blocks players from freely joining
		this.meta.channel.send(`This game doesn't actually need that command. It's already started!${Core.weighted([["",99],[" Here, have an easter egg: :egg:"]])}`);
	}

	/**
	 * @param {string[]} args - The exact string the user typed, sans the server prefix, separated by spaces
	 * @param {Discord.GuildMember|Discord.User} member - The member who typed the message
	 * @param {Discord.Channel} channel - The channel the command was posted in
	 */
	discard(args, member, channel) {
		if (this.players[member.id]) {
			const player = this.players[member.id];
			member = player.member;
			switch(args[0]) {
				case "guess":
					if (player !== this.meta.traits.judge || !this.meta.traits.truePlayer) return;
					let player2 = this.getPlayers(args[1]);
					if (player2.length > 1) return channel.send(`Be more specific! \`${args[1]}\` matched multiple players`);
					player2 = player2[0];
					if (!player2 || player2 === player) return channel.send("Could not find that player");
					player2.traits.score++;
					if (player2 === this.meta.traits.truePlayer) {
						this.meta.channel.send(`${member.displayName} correctly guessed ${player2.member.displayName} was telling the truth!`);
						player.traits.score++;
					} else {
						this.meta.channel.send(`${member.displayName} incorrectly guessed ${player2.member.displayName}.\n${this.meta.traits.truePlayer.member.displayName} was actually telling the truth!`);
					}
					this.meta.traits.truePlayer = null;
					this.meta.channel.send(`**Totals:**\n${Object.values(this.players).reduce((acc, player3) => acc + `${player3.member.displayName}: ${player3.traits.score}\n`,"")}`);
					break;
				case "":
					this.meta.traits.judge = player;
					const submitters = Object.values(this.players).filter(player2 => player2 !== player && player2.traits.submissions.length);
					if (submitters.length < 2) return channel.send("There aren't enough submissions to retrieve!");
					this.meta.traits.truePlayer = submitters[Math.floor(Math.random()*submitters.length)];
					this.meta.channel.send(`This round's title: "${this.meta.traits.truePlayer.traits.submissions.splice(Math.floor(Math.random()*this.meta.traits.truePlayer.traits.submissions.length),1)[0]}"`);
					break;
				default:
					player.traits.submissions.push(args.join(" "));
					channel.send("Submission recieved!");
					break;
			}
		}
	}
}