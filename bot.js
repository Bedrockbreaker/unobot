const Discord = require("discord.js");
//const ytdl = require("ytdl-core");
//const YouTube = require("simple-youtube-api");
const bot = new Discord.Client();
//const ytapi = new YouTube(process.env.ytoken);

var ans = null;

const queue = new Map();

bot.on("warn", console.warn);
bot.on("error", console.error);
bot.on("ready", () => console.log("Logged in as " + bot.user.tag));

bot.on("message", async msg => {
	const args = msg.content.split(" ");
	const channel = msg.channel;
	const user = msg.author;
	const serverQueue = queue.get(msg.guild.id);
	
	if (msg.content[0] === "!") {
		switch(args[0].substr(1)) {
			case "p":
			case "play":
				const VC = msg.member.voiceChannel;
				
				if (!VC) return channel.send("Join a Voice Channel first!");
				const perms = VC.permissionsFor(msg.client.user);
				if (!perms.has("CONNECT")) return channel.send("I don't have the permissions to join that voice channel!");
				if (!perms.has("SPEAK")) return channel.send("I don't have the permissions to speak in that voice channel!");
				if (args.length === 1) return channel.send("Usage: `!<play|p> (URL) <shuffle|s>` or `!<play|p> (Search terms) <shuffle|s>`\nWill search youtube with those search terms and retrieve the first match or will use the URL\nThen plays the audio from that video in your current voice channel.\nSpecify with the 'shuffle' or 's' argument to shuffle the queue afterwards.");
				const newUrl = args[1].replace(/<(.+)>/g, "$1"); // replaces the '<' and '>' in the link
				
				if (newUrl.match(/^https?:\/\/(www.youtube.com|youtube.com)\/playlist(.*)$/)) {
					const playlist = await ytapi.getPlaylist(newUrl);
					const videos = await playlist.getVideos();
					for (const video of Object.values(videos)) {
						const video2 = await ytapi.getVideoByID(video.id);
						await addVideo(video2, msg, VC, true);
					}
					channel.send("`" + playlist.title + "` has been added to the queue");
				} else {
					try {
						var video = await ytapi.getVideo(newUrl);
					} catch(err) {
						try {
							var searchResults = await ytapi.searchVideos(args.splice(1).join(" "), 1);
							var video = await ytapi.getVideoByID(searchResults[0].id);
						} catch(err2) {
							console.error(err2);
							return channel.send("I can't find a video that matches those terms!");
						}
					}
					return addVideo(video, msg, VC);
				}
				console.log(args[2]);
				if (args.length > 2 && (args[2] === "shuffle" || args[2] === "s")) {
					serverQueue.songs = [serverQueue.songs[0], shuffle(serverQueue.songs.splice(1, serverQueue.songs.length))].flat();
					channel.send("Shuffled queue");
				}
				break;
			case "stop":
				if (!serverQueue) return channel.send("I can't stop silence!");
				serverQueue.songs = [];
				serverQueue.connection.dispatcher.end("User stopped song");
				break;
			case "skip":
				if (!serverQueue) return channel.send("I can't skip silence!");
				channel.send("Skipped: `" + serverQueue.songs[0].title + "`");
				serverQueue.connection.dispatcher.end("User skipped song");
				break;
			case "song":
				if (!serverQueue) return channel.send("Nothing!");
				channel.send("Now Playing: `" + serverQueue.songs[0].title + "`\n<" + serverQueue.songs[0].url + ">\n" + duration(Math.floor(serverQueue.connection.dispatcher.time/1000), true) + " / " + duration(duration(serverQueue.songs[0].duration), true));
				break;
			case "q":
			case "queue":
				if (!serverQueue) return channel.send("It's empty!");
				const qDuration = serverQueue.songs.map(song => duration(song.duration)).reduce((acc, val) => acc+val);
				channel.send("Queue: (Length: " + duration(qDuration, true) + ")\n`- " + serverQueue.songs.map(song => song.title).join("\n- ") + "`");
				break;
			case "vol":
			case "volume":
				if (!serverQueue) return channel.send("I can't set the volume of silence!");
				if (!args.length > 1) return channel.send("Current volume: " + serverQueue.volume*100);
				if (isNaN(Number(args[1]))) return channel.send(args[1] + " is not a valid number! (range 0~200%)");
				serverQueue.volume = Math.min(Math.max(args[1],0), 200)/100;
				serverQueue.connection.dispatcher.setVolumeLogarithmic(serverQueue.volume);
				channel.send("Set the volume to: " + Math.round(serverQueue.volume*100));
				break;
			case "rem":
			case "remove":
				if (!serverQueue) return channel.send("I can't remove silence!");
				if (args.length === 1) return channel.send("Usage `!<remove|rem> (any words to match in the song title)`\nRemoves the first song which contains those words");
				const removedSong = serverQueue.songs.findIndex(song => song.title.toLowerCase().includes(args.splice(1).join(" ").toLowerCase()));
				if (!(removedSong+1)) return channel.send("I couldn't find a match for that!");
				channel.send("Removed `" + serverQueue.songs[removedSong].title + "` from the queue");
				if (!removedSong) return serverQueue.connection.dispatcher.end("User removed video");
				serverQueue.songs.splice(removedSong, 1);
				break;
			case "pause":
				if (!serverQueue || !serverQueue.playing) return channel.send("I can't pause silence!");
				serverQueue.playing = false;
				serverQueue.connection.dispatcher.pause();
				if (Math.floor(Math.random()*1000)) return channel.send("Paused the song");
				channel.send("i guess you like the void of silence filling your soul");
				break;
			case "resume":
				if (!serverQueue || serverQueue.playing) return channel.send("I can't resume silence!");
				serverQueue.playing = true;
				serverQueue.connection.dispatcher.resume();
				channel.send("Resumed the song");
				break;
			case "loop":
				if (!serverQueue || (!serverQueue.loop && args.length === 1)) return channel.send("Usage: `!loop <single|all>`\nLoops the current song or the entire queue. Specify with neither to stop looping");
				if (serverQueue.loop) {
					serverQueue.loop = 0;
					channel.send("Stopped looping!");
				} else {
					if (!(args[1] === "single" || args[1] === "all")) return channel.send("Usage: `!loop <single|all>`\nLoops the current song or the entire queue. Specify with neither to stop looping");
					if (args[1] === "single") {
						serverQueue.loop = 1;
						return channel.send("Looping `" + serverQueue.songs[0].title + "`");
					} else {
						serverQueue.loop = 2;
						return channel.send ("Looping the entire queue");
					}
				}
				break;
			case "shuffle":
				if (!serverQueue) return channel.send("I can't shuffle silence!");
				serverQueue.songs = [serverQueue.songs[0], shuffle(serverQueue.songs.splice(1, serverQueue.songs.length))].flat();
				channel.send("Shuffled queue");
				break;
			case "seek":
				return channel.send("This command is currently WIP!");
				if (!serverQueue) return channel.send("The silence is infinite -- the silence is constant");
				serverQueue.connection.dispatcher.time = Math.floor(Number(args[1])*1000);
				channel.send("Skipped to: " + Math.floor(Number(args[1])) + " seconds!");
				break;
		}
	}
	if (user.id === "224285881383518208") {
		switch(args[0]) {
			case "log":
				try {
					ans = eval(args.splice(1).join(" "));
					console.log(ans);
				} catch(err) {
					console.error(err);
				}
				break;
			case "msg":
				try {
					ans = eval(args.splice(1).join(" "));
					if (!ans) ans = ans.toString();
					channel.send(ans);
				} catch(err) {
					channel.send(err);
				}
				break;
		}
	}
	if(msg.content.match(/([^a-z]|h|a|^|)ha([^a-z]|h|a|$)/i)) {
		const ha = new Discord.RichEmbed()
			.setColor(Math.floor(Math.random()*16777215)+1)
			.setImage("https://cdn.discordapp.com/attachments/563223150569979909/612064679581450247/big_ha.png");
		channel.send(ha);
	}
	return undefined;
});

bot.on("voiceStateUpdate", (oldMem, newMem) => {
	if (newMem.voiceChannel != undefined && newMem.voiceChannel.id === "614241699820208164") {
		newMem.guild.members.get(newMem.guild.members.map(member => [member.id, member.roles.get("615701598504747010")]).filter(memRole => memRole[1] != undefined)[0][0]).removeRole("615701598504747010", "New gay baby");
		newMem.addRole("615701598504747010", "Went AFK");
	}
});

function playSong(msg, song) {
	const serverQueue = queue.get(msg.guild.id);
	
	if (serverQueue.songs.length > 0) {
		serverQueue.textChannel.send("Now Playing: `" + serverQueue.songs[0].title + "`\n" + serverQueue.songs[0].url);
		const dispatcher = serverQueue.connection.playStream(ytdl(song.url))
			.on("end", (reason) => {
				console.log(reason);
				if (!serverQueue.loop) {
					serverQueue.songs.shift();
				} else if (serverQueue.loop === 2) {
					addVideo(serverQueue.songs.shift(), msg, serverQueue.voiceChannel);
				}
				playSong(msg, serverQueue.songs[0]);
			})
			.on("error", err => console.error("Error:" + err));
		dispatcher.setVolumeLogarithmic(serverQueue.volume);
	} else {
		serverQueue.voiceChannel.leave();
		queue.delete(msg.guild.id);
		return;
	}
}

async function addVideo(video, msg, VC, playlist = false) {
	const serverQueue = queue.get(msg.guild.id);
	const song = {
		title: video.title,
		url: "https://www.youtube.com/watch?v=" + video.id,
		id: video.id,
		duration: [video.duration.hours, video.duration.minutes, video.duration.seconds]
	}
	if (!serverQueue) {
		const queueConstruct = {
			textChannel: msg.channel,
			voiceChannel: VC,
			connection: null,
			songs: [],
			volume: 1,
			playing: true,
			loop: 0
		}
		queue.set(msg.guild.id, queueConstruct);
		queueConstruct.songs.push(song);
		try {
			var connection = await VC.join();
			queueConstruct.connection = connection;
			playSong(msg, queueConstruct.songs[0]);
		} catch (err) {
			queue.delete(msg.guild.id);
			console.error(err);
		}
	} else {
		serverQueue.songs.push(song);
		if (playlist) return;
		msg.channel.send("`" + song.title + "` has been added to the queue");
	}
}

function duration(duration, formatted = false) {
	if (!formatted) return duration[0]*3600+duration[1]*60+duration[2];
	return (duration>=3600?Math.floor(duration/3600) + ":":"") + ((duration/60)%60<10?"0":"") + Math.floor((duration/60)%60) + ":" + (duration%60<10?"0":"") + (duration%60);
}

function shuffle(array) {
	var i, j, k;
	for(i = array.length - 1; i > 0; i--) {
		j = Math.floor(Math.random() * (i + 1));
		k = array[i];
		array[i] = array[j];
		array[j] = k;
	}
	return array;
}

bot.login(process.env.token);