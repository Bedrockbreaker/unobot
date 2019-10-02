const Discord = require("discord.js");
const ytdl = require("ytdl-core");
const YouTube = require("simple-youtube-api");
const bot = new Discord.Client();
const ytapi = new YouTube(process.env.ytoken);

var ans = null;

const queue = new Map();

bot.on("warn", console.warn);
bot.on("error", console.error);
bot.on("ready", () => {
	console.log("Logged in as " + bot.user.tag);
});

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
				if (args.length === 1) return channel.send("Usage: `!play (URL)` or `!play (Search terms)`\nWill search youtube with those search terms and retrieve the first match or will use the URL\nThen plays the audio from that video in your current voice channel");
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
				break;
			case "stop":
				if (!serverQueue) return channel.send("A song needs to be playing to stop it!");
				serverQueue.songs = [];
				serverQueue.connection.dispatcher.end("User stopped song");
				break;
			case "skip":
				if (!serverQueue) return channel.send("Unable to skip!");
				channel.send("Skipped: `" + serverQueue.songs[0].title + "`");
				serverQueue.connection.dispatcher.end("User skipped song");
				break;
			case "song":
				if (!serverQueue) return channel.send("Nothing!");
				channel.send("Now Playing: `" + serverQueue.songs[0].title + "`\n<" + serverQueue.songs[0].url + ">");
				break;
			case "q":
			case "queue":
				if (!serverQueue) return channel.send("It's empty!");
				const duration = serverQueue.songs.map(song => song.duration[0]*3600+song.duration[1]*60+song.duration[2]).reduce((acc, val) => acc+val);
				channel.send("Queue: (Length: " + (duration>=3600?Math.floor(duration/3600) + ":":"") + ((duration/60)%60<10?"0":"") + Math.floor((duration/60)%60) + ":" + (duration%60<10?"0":"") + (duration%60) + ")\n`- " + serverQueue.songs.map(song => song.title).join("\n- ") + "`");
				break;
			case "vol":
			case "volume":
				if (!serverQueue) return channel.send("I can't set the volume of silence!");
				if (args.length > 1) {
					if (isNaN(Number(args[1]))) return channel.send(args[1] + " is not a valid number! (range 0~200%)");
					serverQueue.volume = Math.min(Math.max(args[1],0), 200)/100;
					serverQueue.connection.dispatcher.setVolumeLogarithmic(serverQueue.volume);
					channel.send("Set the volume to: " + serverQueue.volume*100);
				} else {
					channel.send("Current volume: " + serverQueue.volume*100);
				}
			case "remove":
				break;
			case "pause":
				if (!serverQueue || !serverQueue.playing) return channel.send("I can't pause silence!");
				serverQueue.playing = false;
				serverQueue.connection.dispatcher.pause();
				break;
			case "resume":
				if (!serverQueue || serverQueue.playing) return channel.send("I can't resume silence!");
				serverQueue.playing = true;
				serverQueue.connection.dispatcher.resume();
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
					if (!ans)
						ans = ans.toString();
					channel.send(ans);
				} catch(err) {
					channel.send(err);
				}
				break;
		}
	}
	console.log(msg.content);
	return undefined;
});

function playSong(guild, song) {
	const serverQueue = queue.get(guild.id);
	
	if (serverQueue.songs.length > 0) {
		serverQueue.textChannel.send("Now Playing: `" + serverQueue.songs[0].title + "`\n" + serverQueue.songs[0].url);
		const dispatcher = serverQueue.connection.playStream(ytdl(song.url))
			.on("end", (reason) => {
				console.log(reason);
				serverQueue.songs.shift();
				playSong(guild, serverQueue.songs[0]);
			})
			.on("error", err => console.error(err));
		dispatcher.setVolumeLogarithmic(serverQueue.volume);
	} else {
		serverQueue.voiceChannel.leave();
		queue.delete(guild.id);
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
			textChannel: channel,
			voiceChannel: VC,
			connection: null,
			songs: [],
			volume: 1,
			playing: true
		}
		queue.set(msg.guild.id, queueConstruct);
		queueConstruct.songs.push(song);
		try {
			var connection = await VC.join();
			queueConstruct.connection = connection;
			playSong(msg.guild, queueConstruct.songs[0]);
		} catch (err) {
			queue.delete(msg.guild.id);
			console.error(err);
		}
	} else {
		serverQueue.songs.push(song);
		if (playlist) return;
		channel.send("`" + song.title + "` has been added to the queue");
	}
}

bot.login(process.env.token);