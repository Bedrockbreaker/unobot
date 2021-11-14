import {Collection, GuildMember, MessageActionRow, MessageButton, MessageComponentInteraction, MessageEmbed, MessageSelectMenu, ThreadChannel} from "discord.js";
import {Core, Util, Color, Player} from "./core.js";

/**
 * Wikipedia Game
 */
export default class baseWiki extends Core {
	/**@param {ThreadChannel} thread - The thread to send updates to */
	constructor(thread) {
		super("The Wikipedia Game", thread);

		/**@type {Collection<string, WikiPlayer} */
		this.players;

		/**
		 * The Player who submitted the current topic (and is telling the truth)
		 * @type {WikiPlayer}
		 */
		this.truther;
		
		/**
		 * The Judge of this topic
		 * @type {WikiPlayer}
		 */
		this.judge;
	}

	/**
	 * @param {GuildMember} member - The member to generate a player for
	 * @param {Boolean} isLeader - Whether the new player is a leader
	 */
	genDefaultPlayer(member, isLeader = false) {
		return new WikiPlayer(member, isLeader);
	}

	/**
	 * @param {MessageComponentInteraction} action
	 */
	start(action) {
		// Don't set the phase to 2
		const embed = new MessageEmbed()
			.setTitle("The Wikipedia Game")
			.setDescription("`/help wikigame` or [Browse Commands](https://github.com/Bedrockbreaker/unobot/wiki/Wikipedia-Game)\nSubmit titles with `/g <title>`")
			.setColor(Color.randomColor());
		const rows = [new MessageActionRow().addComponents(new MessageButton().setCustomId("game get").setLabel("Get Submission").setStyle("PRIMARY"))];
		this.meta.thread.send({embeds: [embed], components: rows});
		action.update({content: "Started!", components: [], ephemeral: true});
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
		switch(args[0].toLowerCase()) {
			case "guess": {
				if (player !== this.judge || !this.truther) return Core.notYet(action);
				const players = this.getPlayers(args[1]);
				if (players.size > 1) return action.reply({content: `Be more specific! \`${args[1]}\` matched multiple players`, ephemeral: true});
				const player2 = players.first();
				if (!player2 || player2 === player) return action.reply({content: "Could not find that player", ephemeral: true});
				
				player2.score++;
				const embed = new MessageEmbed()
					.setTitle("The Wikipedia Game")
					.setDescription("`/help wikigame` or [Browse Commands](https://github.com/Bedrockbreaker/unobot/wiki/Wikipedia-Game)\nSubmit titles with `/g <title>`");
				if (player2 === this.truther) {
					embed.addField("Correct!", `${member.displayName} correctly guessed ${player2.member.displayName} was telling the truth!`).setColor(Color.Forest);
					player.score++;
				} else {
					embed.addField("Incorrect!", `${member.displayName} incorrectly guessed ${player2.member.displayName}.\n${this.truther.member.displayName} was actually telling the truth!`).setColor(Color.Carmine);
				}
				embed.addField("Point Totals", this.players.sort((player3, player4) => player4.score - player3.score).reduce((acc, player3) => acc + `${player3.member.displayName}: ${player3.score}\n`,""));
				const row = new MessageActionRow().addComponents(new MessageButton().setCustomId("game get").setLabel("Get Submission").setStyle("PRIMARY"));

				this.meta.thread.send({embeds: [embed], components: [row]});
				Util.update(action, {content: player2 === this.truther ? "Good job!" : "Nice try", components: [], ephemeral: true});
				this.truther = null;
				this.judge = null;
				break;
			}
			case "get": {
				if (this.judge) return Core.notYet(action);
				this.judge = player;
				const submitters = this.players.filter(player2 => player2 !== player && player2.submissions.length);
				if (submitters.size < 2) return action.reply({content: "There aren't enough submissions to retrieve!", ephemeral: true});
				this.truther = submitters.random();

				const embed = new MessageEmbed()
					.setTitle(`Topic: "${this.truther.submissions.splice(Math.floor(Math.random()*this.truther.submissions.length), 1)[0]}"`)
					.setDescription("Start ~~lying~~ talking!")
					.addField("Need a random player to start?", `I choose ${submitters.random().member.displayName}!`)
					.setColor(Color.randomColor());
				this.meta.thread.send({embeds: [embed]});

				const row = new MessageActionRow().addComponents(new MessageSelectMenu().setCustomId("game guess").setPlaceholder("Guess who's telling the truth").addOptions(submitters.map(player2 => ({label: player2.member.displayName, value: `<@${player2.member.id}>`}))));
				action.reply({content: "You're the judge!", components: [row], ephemeral: true});
				break;
			}
			case "delete": {
				const index = Util.clamp(Util.parseInt(args[1]), 1, player.submissions.length) - 1;
				if (isNaN(index)) return action.reply({content: `Can't find sumbission number \`${args[1]}\``, ephemeral: true});
				const submission = player.submissions.splice(index, 1)[0];
				const row = new MessageActionRow().addComponents(new MessageButton().setCustomId(`game ${submission}`).setLabel("Resubmit").setStyle("SECONDARY"));
				Util.update(action, {content: `Successfully deleted \`${submission}\``, components: [row], ephemeral: true});
				break;
			}
			default: {
				player.submissions.push(args.join(" "));
				const row = new MessageActionRow().addComponents(new MessageButton().setCustomId(`game delete ${player.submissions.length}`).setLabel("Delete Submission").setStyle("DANGER"));
				Util.update(action, {content: `Submitted: \`${args.join(" ")}\``, components: [row], ephemeral: true});
				break;
			}
		}
	}

	/**
	 * @param {string} input 
	 * @returns {Collection<string, WikiPlayer>}
	 */
	getPlayers(input) {
		return super.getPlayers(input);
	}

	/**
	 * @param {MessageEmbed} embed
	 * @param {string[]} command
	 */
	static help(embed, command) {
		embed.setTitle(`Help for \`/g ${command.join(" ")}\` in The Wikipedia Game`).setDescription("[Browse Commands](https://github.com/Bedrockbreaker/unobot/wiki/Wikipedia-Game)");
		switch(command[0]) {
			case "":
			case undefined:
				embed.setTitle("Help for The Wikipedia Game").addField("/help wikigame <command>", "General help command for The Wikipedia Game. Use this to receive information on using other commands.\nEx: \`/help wikigame guess\`")
					.addFields(
						{name: "Available Commands", value: "(To submit a title, use `/g <title>`)"},
						{name: "guess", value: "/help wikigame guess", inline: true},
						{name: "get", value: "/help wikigame get", inline: true},
						{name: "delete", value: "/help wikigame delete", inline: true})
					.setColor("#FFFFFF");
				break;
			case "guess":
				embed.addField("/g guess <player>", "If you're the current Judge, guess which player you think is telling the truth.\nAccepts a mention or any portion of their name/nickname.\nEx:`/g guess Bob`").setColor(Color.randomColor());
				break;
			case "get":
				embed.addField("/g get", "Returns a random submission (which you didn't submit), and designates you as the Judge.\nEach player who's submitted is given an equal chance of being selected.\nEx: `/g get`").setColor(Color.White);
				break;
			case "delete":
				embed.addField("/g delete <number>", "Deletes your n-th submission.\nEx: `/g delete 2`").setColor(Color.Carmine);
				break;
			default:
				embed.addField("Unknown command", "Did you spell it correctly?").setColor(Color.Carmine);
				break;
		}
	}
}

class WikiPlayer extends Player {
	/**
	 * @param {GuildMember} member - The member associated with the player
	 */
	constructor(member, isLeader = false) {
		super(member, [], isLeader);

		/**
		 * The Player's score
		 * @type {number}
		 */
		this.score = 0;

		/**
		 * The Player's submissions
		 * @type {string[]}
		 */
		this.submissions = [];
	}
}