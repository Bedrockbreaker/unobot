var Discord = require('discord.io');
var logger = require('winston');

var fs = require("fs");

var counter = 0;
fs.readFile("count.txt", function(err,data) {
	if(err) {
		return console.log(error);
	}
	counter = Number(data);
	console.log("Successfully read file");
});
var ans = null;

var gamePhase = 0;
var msgID = [];
var players = {};
var scores = [0];
var unos = [0];
var rules = [false,false,false,false,false,false,7,20];
var currentPlayer = 0;

var deck = [];
var discard = [];
var dirPlay = 1;
var drawNum = 0;
var currentColor;

var extraRuleText = "";
var prevPlayer = 0;
var nicks = [];

// Configure logger settings
logger.remove(logger.transports.Console);
logger.add(new logger.transports.Console, {
    colorize: true
});
logger.level = 'debug';
//Initialize Discord Bot
var bot = new Discord.Client({
   token: process.env.token,
   autorun: true
});
bot.on('ready', function (evt) {
    logger.info('Connected');
    logger.info('Logged in as: ');
    logger.info(bot.username + ' - (' + bot.id + ')');
});

bot.on('message', function (user, userID, channelID, message, evt) {
    //It will listen for messages that will start with `u!`
    if (message.substring(0, 2) == 'u!') {
        var args = message.substring(2).split(' ');
        var cmd = args[0];
       
        args = args.splice(1);
        switch(cmd) {
            case 'startgame':
				if(checkPhase(0, channelID)) {
					gamePhase = 1;
					players[userID] = [];
					nicks.push(evt.d.member.nick || evt.d.author.username);
					bot.sendMessage({
						to: channelID,
						message: "Who's playing Uno? (type 'u!join' to play)\nWhen ready, type 'u!begin' to start playing!"
					}, function(err, response) {
						bot.sendMessage({
							to: channelID,
							message: "Players: <@" + getPlayers(false) + ">"
						}, function(err, response) {
							msgID[0] = response.id;
							msgID[6] = response.channel_id;
						})
					});
				}
            break;
			case 'quit':
				if (channelID == msgID[4] || channelID == msgID[5] || channelID == msgID[6]) {
					if (gamePhase) {
						var userExists = getPlayers(false).indexOf(userID);
						if (userExists>-1) {
							if (gamePhase == 3) {
								if (channelID != msgID[4]) {
									return;
								}
								if (userExists == currentPlayer) {
									nextPlayer();
								}
								bot.getMessage({
									channelID: channelID,
									messageID: msgID[2]
								}, function(err, response) {
									var newMsg = response.embeds;
									newMsg[0].fields[0].value = newMsg[0].fields[0].value.substring(0,18) + playerList[currentPlayer] + newMsg[0].fields[0].value.substring(newMsg[0].fields[0].value.indexOf(">"));
									newMsg[0].footer.text = getReadableScoreCards();
									bot.editMessage({
										channelID: channelID,
										messageID: response.id,
										message: "",
										embed: newMsg[0]
									});
								});
							}
							endUser(userID, channelID);
							if (getPlayers(false).length>1) {
								bot.sendMessage({
									to: channelID,
									message: "Bye <@" + userID + ">!"
								});
							} else {
								endGame(channelID);
							}
						} else {
							bot.sendMessage({
								to: channelID,
								message: "<@" + userID + ">, you're not even in the game!"
							});
						}
					} else {
						bot.sendMessage({
							to: channelID,
							message: "A game hasn't started yet! Type 'u!startgame' to start one"
						});
					}
				}
            break;
			case 'endgame':
				if (gamePhase) {
					if (userID == getPlayers(false)[0]) {
						endGame(channelID);
					} else {
						notLeader(userID, channelID);
					}
				} else {
					bot.sendMessage({
						to: channelID,
						message: "A game hasn't started yet! Type 'u!startgame' to start one"
					});
				}
            break;
			case 'join':
				if (checkPhase(1, channelID) && channelID == msgID[6]) {
					players[userID] = [];
					scores.push(0);
					unos.push(0);
					nicks.push(evt.d.member.nick || evt.d.author.username);
					bot.editMessage({
						channelID: channelID,
						messageID: msgID[0],
						message: "Players: <@" + getPlayers(false).join(">, <@") + ">"
					});
				}
            break;
			case "begin":
				if (checkPhase(1, channelID)) {
					if (getPlayers(false).length > 1) {
						if (getPlayers(false)[0] == userID) {
							gamePhase = 2;
							bot.sendMessage({
								to: channelID,
								embed: {
									title: "What rules is this game being played by? (respond by submitting reaction emojis)",
									description: "When you are done changing the rules, type \"u!play\"",
									color: "" + (Math.floor(Math.random() * 16777215) + 1),
									fields: [
										{
											name: "Play for Points - :100:",
											value: "When a round ends, the winner is awarded points according to the cards in the other players' hands.\nNumber cards score at face value, action cards at 20, and wilds at 50.\nThe first player to reach 500 points wins."
										},
										{
											name: "Alternate Points Rules - :1234:",
											value: "Like above, but instead, loosing playes keep their own points. Players who reach 500 points are eliminated from the game. Last person to reach 500 points wins."
										},
										{
											name: "Draw until you can discard - :small_red_triangle_down:",
											value: "If you can't discard a card, you keep drawing cards until you can."
										},
										{
											name: "Stacking - :books:",
											value: "When a player discards a draw 2 or draw 4 card, the next player can stack another draw 2 or draw 4 card on top, and play moves on to the next player."
										},
										{
											name: "0-7 Special Rules - :arrows_counterclockwise:",
											value: "When a 0 card is played, all players swap hands in the direction of play.\nWhen a 7 card is played, that player must choose another player to swap hands with."
										},
										{
											name: "Jump-in Rule - :zap:",
											value: "At any point during the game (including other peoples' turns) you may play a card if it exactly matches the current discarded card.\nPlay begins as if that player had just taken their turn."
										},
										{
											name: "Starting Number of Cards: " + rules[6],
											value: "The number of cards dealt to each player at the beginning of a game.\nType \"u!rule cards <number>\" to change this.\nNumber of decks to be used: " + Math.ceil(getPlayers(false).length*rules[6]/28)
										},
										{
											name: "Turn Time Limit: " + rules[7] + " seconds",
											value: "The maximum number of seconds a player can spend on their turn.\nType \"u!rule time <number>\" to change this.\n0 seconds means no time limit"
										}
									]
								}
							}, function(err, response) {
								msgID[1] = response.id;
								msgID[5] = response.channel_id;
								var emojis = ["💯","🔢","🔻","📚","🔄","⚡"];
								addReactions(channelID, response.id, emojis);
							});
						} else {
							notLeader(userID, channelID);
						}
					} else {
						bot.sendMessage({
							to: channelID,
							message: "Not enough players!"
						});
					}
				}
			break;
			case "rule":
				if (checkPhase(2, channelID) && channelID == msgID[5]) {
					if (userID == getPlayers(false)[0]) {
						switch(args[0]) {
							case "cards":
								if (!isNaN(args[1])) {
									args[1] = Number(args[1]);
									rules[6] = Math.max(Math.floor(args[1]),1);
									bot.getMessage({
										channelID: channelID,
										messageID: msgID[1]
									}, function(err, response) {
										var newMsg = response.embeds;
										newMsg[0].fields[5].name = "Starting Number of Cards: " + rules[6];
										newMsg[0].fields[5].value = "The number of cards dealt to each player at the beginning of a game.\nType \"u!rule cards <number>\" to change this.\nNumber of decks to be used: " + Math.ceil(getPlayers(false).length*rules[6]/28);
										bot.editMessage({
											channelID: channelID,
											messageID: response.id,
											message: "",
											embed: newMsg[0]
										});
									});
								} else {
									bot.sendMessage({
										to: channelID,
										message: "\"" + args[1] + "\" is not a valid number!"
									});
								}
							break;
							case "time":
								if (!isNaN(args[1])) {
									args[1] = Number(args[1]);
									rules[7] = Math.max(Math.floor(args[1]),0);
									bot.getMessage({
										channelID: channelID,
										messageID: msgID[1]
									}, function(err, response) {
										var newMsg = response.embeds;
										newMsg[0].fields[6].name = "Turn Time Limit: " + rules[7] + " seconds";
										bot.editMessage({
											channelID: channelID,
											messageID: response.id,
											message: "",
											embed: newMsg[0]
										});
									});
								} else {
									bot.sendMessage({
										to: channelID,
										message: "\"" + args[1] + "\" is not a valid number!"
									});
								}
							break;
							default:
								bot.sendMessage({
									to: channelID,
									message: "\"" + args[0] + "\" is not a recognized rule!"
								});
							break;
						}
					} else if (getPlayers(false).length > 0) {
						notLeader(userID, channelID);
					}
				}
			break;
			case "kick":
				if (channelID == msgID[4] || channelID == msgID[5] || channelID == msgID[6]) {
					if(gamePhase) {
						var playerList = getPlayers(false);
						if (playerList[0] == userID) {
							args[0] = args[0].replace("!","").substring(2);
							args[0] = args[0].substring(0,args[0].length-1);
							var userExists = getPlayers(false).indexOf(args[0]);
							if (userExists>-1) {
								if (gamePhase == 3) {
									if (channelID != msgID[4]) {
										return;
									}
									if (userExists == currentPlayer) {
										nextPlayer();
									}
									bot.getMessage({
										channelID: channelID,
										messageID: msgID[2]
									}, function(err, response) {
										var newMsg = response.embeds;
										newMsg[0].fields[0].value = newMsg[0].fields[0].value.substring(0,18) + playerList[currentPlayer] + newMsg[0].fields[0].value.substring(newMsg[0].fields[0].value.indexOf(">"));
										newMsg[0].footer.text = getReadableScoreCards();
										bot.editMessage({
											channelID: channelID,
											messageID: response.id,
											message: "",
											embed: newMsg[0]
										});
									});
								}
								endUser(args[0], channelID);
								bot.sendMessage({
									to: channelID,
									message: "Kicked <@" + args[0] + "> from the game"
								});
								return;
							}
							bot.sendMessage({
								to: channelID,
								message: "Unable to find <@" + args[0] + ">. Did you @<name> them? Are they in the game?"
							});
						} else {
							notLeader(userID, channelID);
						}
					} else {
						bot.sendMessage({
							to: channelID,
							message: "A game hasn't started yet! Type 'u!startgame' to start one"
						});
					}
				}
			break;
			case "play":
				if (checkPhase(2, channelID)) {
					playerList = getPlayers(false);
					if (playerList[0] == userID) {
						
						//Actually, it's just waiting for the async function to finish.
						bot.sendMessage({
							to: channelID,
							message: "Shuffling deck and dealing cards..."
						});
						
						async function getRules() {
							var result = await getReactions(channelID, msgID[1], ["💯", "🔢","🔻","📚","🔄","⚡"]);
							for (i = 0; i < result.length; i++) {
								for (j = 0; j < result[i].length; j++) {
									if(result[i][j].id == playerList[0]) {
										rules[i] = true;
										j = result[i].length;
									}
								}
							}
							
							resetGame(channelID, playerList);
						}
						
						getRules();
						
					} else {
						notLeader(userID, channelID);
					}
				}
			break;
			case "draw":
				if(checkPhase(3) && channelID == msgID[4]) {
					bot.deleteMessage({
						channelID: channelID,
						messageID: evt.d.id
					});
					playerList = getPlayers(false);
					if (playerList[currentPlayer] == userID) {
						if (!drawNum) {
							for (i = 0; i < players[playerList[currentPlayer]].length; i++) {
								if (canMatch(players[playerList[currentPlayer]][i], discard[discard.length-1])) {
									return;
								}
							}
						}
						var prevAmount = players[userID].length;
						var cards = draw(drawNum);
						for (i = 0; i < cards.length; i++) {
							players[playerList[currentPlayer]].splice(players[playerList[currentPlayer]].length,0, cards[i]);
						}
						bot.sendMessage({
							to: userID,
							message: getReadableHand(players[playerList[currentPlayer]])
						});
						
						if (drawNum) {
							nextPlayer();
						}
						bot.getMessage({
							channelID: channelID,
							messageID: msgID[2]
						}, function(err, response) {
							var newMsg = response.embeds;
							var action = "";
							if (discard[discard.length-1] == "ww4") {
								action += ". **The color is " + idToName(currentColor) + "**"
							}
							newMsg[0].fields[0].value = "It is currently <@" + playerList[currentPlayer] + ">'s turn. Type u!<cardID> to discard a card!\nOr type 'u!<cardID> <color>' to discard a wild." + extraRuleText + "\n<@" + userID + "> drew " + (players[userID].length-prevAmount) + " cards" + action;
							newMsg[0].footer.text = getReadableScoreCards();
							bot.editMessage({
								channelID: channelID,
								messageID: response.id,
								message: "",
								embed: newMsg[0]
							});
						});
						drawNum = 0;
						reEvalUnos();
					}
				}
			break;
			case "uno":
				if(checkPhase(3) && channelID == msgID[4]) {
					bot.deleteMessage({
						channelID: channelID,
						messageID: evt.d.id
					});
					playerList = getPlayers(false);
					if (players[userID].length == 1) {
						var unoer = 0;
						for (i = 0; i < playerList.length; i++) {
							if (playerList[i] == userID) {
								unoer = i;
							}
						}
						unos[unoer] = 1;
					} else {
						for (j = 0; j < playerList.length; j++) {
							if (unos[j] < 0) {
								var cards = draw(2);
								console.log(j);
								for (i = 0; i < cards.length; i++) {
									players[playerList[j]].splice(players[playerList[j]].length,0, cards[i]);
								}
								var k = j;
								bot.sendMessage({
									to: playerList[j],
									message: getReadableHand(players[playerList[j]])
								}, function(err, response) {
									bot.getMessage({
										channelID: channelID,
										messageID: msgID[2]
									}, function(err, response) {
										var newMsg = response.embeds;
										var action = "";
										if (discard[discard.length-1][0] == "w") {
											action += ". **The color is " + idToName(currentColor) + "**";
										}
										if (drawNum) {
											action += ". **" + drawNum + " cards stacked to draw**";
										}
										newMsg[0].fields[0].value = "It is currently <@" + playerList[currentPlayer] + ">'s turn. Type u!<cardID> to discard a card!\nOr type 'u!<cardID> <color>' to discard a wild." + extraRuleText + "\n<@" + playerList[k] + "> drew 2 cards from not saying 'u!uno' fast enough" + action;
										newMsg[0].footer.text = getReadableScoreCards();
										bot.editMessage({
											channelID: channelID,
											messageID: response.id,
											message: "",
											embed: newMsg[0]
										});
									});
								});
							}
						}
						reEvalUnos();
					}
				}
			break;
			case "challenge":
				if (checkPhase(3) && channelID == msgID[4]) {
					bot.deleteMessage({
						channelID: channelID,
						messageID: evt.d.id
					});
					playerList = getPlayers(false);
					if (userID == playerList[currentPlayer] && discard[discard.length-1] == "ww4") {
						var challenger = currentPlayer;
						var couldPlay = false;
						currentPlayer = prevPlayer;
						for (i = 0; i < players[playerList[currentPlayer]].length; i++) {
							var checkCard = players[playerList[currentPlayer]][i];
							if (checkCard != "ww4" && canMatch(checkCard, discard[discard.length-2]) && (!drawNum || (checkCard[1] == "d" && rules[3]))) {
								couldPlay = true;
								
								var cards = draw(drawNum);
								for (j = 0; j < cards.length; j++) {
									players[playerList[currentPlayer]].splice(players[playerList[currentPlayer]].length,0, cards[j]);
								}
								bot.sendMessage({
									to: playerList[currentPlayer],
									message: getReadableHand(players[playerList[currentPlayer]])
								}, function (err, response) {
									bot.getMessage({
										channelID: channelID,
										messageID: msgID[2]
									}, function(err, response) {
										var newMsg = response.embeds;
										var action = ". **The color is " + idToName(currentColor) + "**";
										newMsg[0].fields[0].value = "It is currently <@" + playerList[challenger] + ">'s turn. Type u!<cardID> to discard a card!\nOr type 'u!<cardID> <color>' to discard a wild." + extraRuleText + "\n<@" + playerList[prevPlayer] + "> drew " + drawNum + " cards from being challenged" + action;
										newMsg[0].footer.text = getReadableScoreCards();
										bot.editMessage({
											channelID: channelID,
											messageID: response.id,
											message: "",
											embed: newMsg[0]
										}, function(err, response) {
											drawNum = 0;
										});
									});
								});
							}
						}
					}
					currentPlayer = challenger;
					if (!couldPlay) {
						drawNum += 2;
						var cards = draw(drawNum);
						for (j = 0; j < cards.length; j++) {
							players[playerList[challenger]].splice(players[playerList[challenger]].length,0, cards[j]);
						}
						nextPlayer();
						
						bot.sendMessage({
							to: userID,
							message: getReadableHand(players[playerList[challenger]])
						}, function (err, response) {
							bot.getMessage({
								channelID: channelID,
								messageID: msgID[2]
							}, function(err, response) {
								var newMsg = response.embeds;
								var action = ". **The color is " + idToName(currentColor) + "**";
								newMsg[0].fields[0].value = "It is currently <@" + playerList[currentPlayer] + ">'s turn. Type u!<cardID> to discard a card!\nOr type 'u!<cardID> <color>' to discard a wild." + extraRuleText + "\n<@" + playerList[challenger] + "> drew " + drawNum + " cards from being unable to challenge" + action;
								newMsg[0].footer.text = getReadableScoreCards();
								bot.editMessage({
									channelID: channelID,
									messageID: response.id,
									message: "",
									embed: newMsg[0]
								}, function(err, response) {
									drawNum = 0;
								});
							});
						});
					}
					reEvalUnos();
				}
			break;
			//Just add any case commands if you want to..
			default:
				if(gamePhase == 3 && channelID == msgID[4]) {
					card = message.substring(2).slice(0,3).trimEnd();
					playerList = getPlayers(false);
					bot.deleteMessage({
						channelID: channelID,
						messageID: evt.d.id
					});
					if(playerList[currentPlayer] == userID || (card == discard[discard.length-1] && rules[3])) {
						for (i = 0; i < players[userID].length; i++) {
							if (players[userID][i] == card) {
								var color = "";
								if (args.length > 0) {
									if (card[0] == "w") {
										color = args[0].toLowerCase();
									} else {
										color = args[0].replace("!","").substring(2);
										color = color.substring(0,color.length-1);
									}
								}
								
								if (canMatch(card, discard[discard.length-1]) &&
								(!drawNum || ((card[1] == "d" || card[2] == "4") && rules[3])) &&
								((card != "ww" && card != "ww4") || (color == "red" || color == "blue" || color == "green" || color == "yellow" || players[userID].length == 1)) &&
								(card[1] != "7" || (players[color] && color != userID) || !rules[4] || players[userID].length == 1)) {
									 
									discard.push(players[userID].splice(i,1)[0]);
									if (players[userID].length == 0) {
										if (!rules[0] && !rules[1]) {
											bot.sendMessage({
												to: channelID,
												message: "<@" + userID + "> has won the game!"
											});
											lastCard(channelID, userID, true);
											return;
										} else if (rules[1]) {
											for (i = 0; i < playerList.length; i++) {
												var score = 0;
												for (j = 0; j < players[playerList[i]].length; j++) {
													cardHand = players[playerList[i]][j];
													if (cardHand) {
														if (card[1] == "r" || card[1] == "d" || card[1] == "s") {
															score += 20;
														} else if (card[1] == "w") {
															score += 50;
														} else {
															score += Number(card[1]);
														}
													}
												}
												scores[i] += score;
											}
											
											var minScoreIndex = 0;
											var eliminees = [];
											for (i = 0; i < scores.length; i++) {
												minScoreIndex = scores[minScoreIndex] < scores[i] ? minScoreIndex : i;
											}
											for (i = scores.length; i >= 0; i--) {
												if (scores[i] >= 500 && i != minScoreIndex && scores[i] != scores[minScoreIndex]) {
													endUser(playerList[i],channelID);
													eliminees.push("<@" + playerList[i] + ">, ");
													scores.splice(i,1);
												}
											}
											if (eliminees.length > 0) {
												eliminees[eliminees.length-1] = eliminees[eliminees.length-1].substring(0,eliminees[eliminees.length-1].length-2);
												bot.sendMessage({
													to: channelID,
													message: "Players: " + eliminees + " have been eliminated"
												});
											}
											
											if (getPlayers(false).length > 1) {
												lastCard(channelID, userID, false);
												return;
											} else {
												bot.sendMessage({
													to: channelID,
													message: "<@" + userID + "> has won the game, with " + scores[0] + " points!"
												});
												lastCard(channelID, userID, true);
												return;
											}
										} else if (rules[0]) {
											for (i = 0; i < playerList.length; i++) {
												var score = 0;
												for (j = 0; j < players[playerList[i]].length; j++) {
													handCard = players[playerList[i]][j];
													if (handCard) {
														if (handCard[1] == "r" || handCard[1] == "d" || handCard[1] == "s") {
															score += 20;
														} else if (handCard[1] == "w") {
															score += 50;
														} else {
															score += Number(card[1]);
														}
													}
												}
												scores[currentPlayer] += score;
											}
											if (scores[currentPlayer] >= 500) {
												bot.sendMessage({
													to: channelID,
													message: "<@" + userID + "> has won the game, with " + scores[currentPlayer] + " points!"
												});
												lastCard(channelID, userID, true);
												return;
											} else {
												bot.sendMessage({
													to: channelID,
													message: "<@" + userID + "> has won the round!"
												});
												lastCard(channelID, userID, false);
												return;
											}
										}
									}
									currentColor = card[0];
									
									if (card == "ww4") {
										prevPlayer = currentPlayer;
									}
									
									if (players[userID] != players[playerList[currentPlayer]]) {
										var action = "\n<@" + userID + "> jumped in with a " + idToName(card);
									} else {
										var action = "\n<@" + userID + "> discarded a " + idToName(card);
									}
									
									//Sets currentPlayer to whoever just played last.
									for (i = 0; i < playerList.length; i++) {
										if (userID == playerList[i]) {
											currentPlayer = i;
										}
									}
									nextPlayer();
									
									switch (card[1]) {
										case "r":
											dirPlay = !dirPlay;
											nextPlayer();
											if (playerList.length > 2) {
												nextPlayer();
											}
										break;
										case "d":
										case "w":
											if (card[2] == "4" || card[1] == "d") {
												var num = card[2] == "4" ? 4 : 2;
												if (rules[3]) {
													drawNum += num;
													action += ". **" + drawNum + " cards stacked to draw**";
												} else {
													action += ". <@" + playerList[currentPlayer] + "> drew " + drawNum + " cards";
													var cards = draw(num);
													for (i = 0; i < cards.length; i++) {
														players[playerList[currentPlayer]].splice(players[playerList[currentPlayer]].length,0, cards[i]);
													}
													bot.sendMessage({
														to: playerList[currentPlayer],
														message: getReadableHand(players[playerList[currentPlayer]])
													});
													
													nextPlayer();
												}
											}
										break;
										case "s":
											nextPlayer();
										break;
										case "7":
											if (rules[4]) {
												var temp = players[userID];
												players[userID] = players[color];
												players[color] = temp;
												
												action += " and swapped hands with <@" + color + ">";
												//console.log(players);
												if (currentPlayer != color) {
													bot.sendMessage({
														to: color,
														message: getReadableHand(players[color])
													});
												}
											}
										break;
										case "0":
											if (rules[4]) {
												var temp = players[playerList[dirPlay*(playerList.length-1)]];
												for (i = dirPlay*(playerList.length-1); (dirPlay ? i > 0 : i < playerList.length-1); i+=(dirPlay ? -1 : 1)) {
													players[playerList[i]] = players[playerList[i+(dirPlay ? -1 : 1)]];
												}
												players[playerList[(dirPlay ? 0 : playerList.length-1)]] = temp;
												
												sendMessages(playerList, getPlayers(true));
											}
										break;
									}
									if (card == "ww" || card == "ww4") {
										currentColor = color[0];
										action += ". **The color is " + idToName(currentColor) + "**";
									}
									reEvalUnos();
									
									bot.getMessage({
										channelID: channelID,
										messageID: msgID[2]
									}, function(err, response) {
										var newMsg = response.embeds;
										newMsg[0].fields[0].name = idToName(discard[discard.length-1]);
										newMsg[0].fields[0].value = "It is currently <@" + playerList[currentPlayer] + ">'s turn. Type u!<cardID> to discard a card!\nOr type 'u!<cardID> <color>' to discard a wild" + extraRuleText + "\n" + action;
										newMsg[0].footer.text = getReadableScoreCards();
										newMsg[0].image.url = getCardURL(discard[discard.length-1]);
										bot.editMessage({
											channelID: channelID,
											messageID: response.id,
											message: "",
											embed: newMsg[0]
										}, function(err, response) {
											bot.sendMessage({
												to: userID,
												message: getReadableHand(players[userID])
											});
										});
									});
									
									return;
								}
							}
						}
					}
				}
			break;
         }
     }
	 if (message.substring(0, 1) == '!') {
        var args = message.substring(1).split(' ');
        var cmd = args[0];
        
        args = args.splice(1);
        switch(cmd) {
            // !
            case 'lvlup':
				var empowered = [];
				for (i = 0; i < message.substring(7).length; i++) {
					empowered.push(message.substring(7).split("").splice(i,1));
				}
                bot.sendMessage({
                    to: channelID,
                    message: "***~~__" + empowered.join(" ") + "__~~***"
                });
            break;
			case "count":
				counter++;
				bot.sendMessage({
					to: channelID,
					message: "Count: " + counter
				});
				fs.writeFile("count.txt", counter, function(err) {
					if (err) {
						return console.log(err);
					}
					console.log("File saved successfully");
				});
			break;
			case "help":
				bot.sendMessage({
					to: channelID,
					message: "Commands:\n'**!**': Non-uno related command prefix\n'**!lvlup**': Takes whatever text is after it and makes it ***~~__l o o k   c o o l__~~***\n'**!count**': Counts a specific number up\n'**!help**': This help message\n'**u!**': Uno-related command prefix\n'**u!startgame**': Starts an Uno game\n'**u!join**': Joins a recently started Uno game\n'**u!endgame**': Ends the entire game\n'**u!quit**': Quit an Uno game\n'**u!begin**': Start an Uno game"
				});
			break;
            // Just add any case commands if you want to..
         }
     }
	 // Commands just for me
	 if (userID == "224285881383518208") {
		 var args = message.substring(0).split(' ');
		 var cmd = args[0];
       
        args = args.splice(1);
        switch(cmd) {
            case 'youcantactivatethiscommand':
                bot.sendMessage({
                    to: channelID,
                    message: 'nerd'
                });
            break;
			case 'log':
				try {
					ans = eval(args.join(" "));
					console.log(ans);
				} catch(err) {
					console.log(err);
				}
            break;
			case 'msg':
				try {
					var result = eval(args.join(" "));
					if (!result) {
						if (result != undefined) {
							result = result.toString();
						} else {
							result = "undefined";
						}
					}
					ans = result;
					bot.sendMessage({
						to: channelID,
						message: result
					});
				} catch(err) {
					bot.sendMessage({
						to: channelID,
						message: err
					});
				}
            break;
            // Just add any case commands if you want to..
        }
	}
	if(message.toLowerCase().indexOf("ha") != -1) {
		message = message.toLowerCase();
		var ha = message.indexOf("ha");
		var doTheHa = false;
		var allowedChars = [" ", "~", "*", "_", "h", "a"];
		if (message.length == 2) {
			doTheHa = true;
		}
		if (ha != 0) {
			if (message.length > ha+2) {
				if (allowedChars.includes(message[ha-1]) && allowedChars.includes(message[ha+2])) {
					doTheHa = true;
				}
			} else if (allowedChars.includes(message[ha-1])) {
				doTheHa = true;
			}
		} else {
			if (allowedChars.includes(message[ha+2])) {
				doTheHa = true;
			}
		}
		if (doTheHa) {
			bot.sendMessage({
				to: channelID,
				embed: {
					color: "" + (Math.floor(Math.random() * 16777215) + 1),
					image: {
						url: "https://cdn.discordapp.com/attachments/563223150569979909/612064679581450247/big_ha.png"
					}
				}
			});
		}
	}
	console.log(message);
});

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

function getPlayers(id) {
	var temp = [];
	for (key in players) {
		if (id) {
			temp.push(players[key]);
		} else {
			temp.push(key);
		}
	}
	
	return temp;
}

function notLeader(id, channelID) {
	bot.sendMessage({
		to: channelID,
		message: "<@" + id + ">, you aren't the leader!"
	});
}

function sendMessages(channelArray, messageArray) {
	var i = 0;
	msgID[3] = [];
	var msgTimer = setInterval(function() {
		if (i < channelArray.length) {
			bot.sendMessage({
				to: channelArray[i],
				message: getReadableHand(messageArray[i])
			}, function(err, response) {
				msgID[3].push(response.id);
			});
		} else {
			clearInterval(msgTimer);
		}
		i++;
	},1000); //Avoid the rate limits
}

function addReactions(channelID, messageID, emojiArray) {
	var i = -1;
	var msgTimer = setInterval(function() {
		i++;
		if (i < emojiArray.length) {
			bot.addReaction({
				channelID: channelID,
				messageID: messageID,
				reaction: emojiArray[i]
			}, function(err, response) {
				if (err) {
					console.log(err);
				}
			});
		} else {
			clearInterval(msgTimer);
		}
	},1000); //Avoid the rate limits
}

function getReactions(channelID, messageID, emojiArray) {
	return new Promise(function(resolve) {
		var i = -1;
		var reactions = [];
		var msgTimer = setInterval(function() {
			i++;
			if (i < emojiArray.length) {
				bot.getReaction({
					channelID: channelID,
					messageID: messageID,
					reaction: emojiArray[i]
				}, function(err, response) {
					reactions.push(response);
				});
			} else {
				clearInterval(msgTimer);
				resolve(reactions);
			}
		},1000); //Avoid the rate limits
	})
}

function checkPhase(phaseNum, channelID) {
	if (gamePhase != phaseNum) {
		if (!gamePhase) {
			bot.sendMessage({
				to: channelID,
				message: "A game hasn't started yet! Type 'u!startgame' to start one"
			});
		} else if (gamePhase == 1) {
			bot.sendMessage({
				to: channelID,
				message: "People are still joining the game!"
			});
		} else if (gamePhase == 2 || gamePhase == 3) {
			bot.sendMessage({
				to: channelID,
				message: "The game has already begun!"
			});
		}
		return false
	}
	return true
}

function endGame(channelID) {
	gamePhase = 0;
	msgID = [];
	players = {};
	scores = [0];
	unos = [0];
	rules = [false,false,false,false,false,false,7,20];
	currentPlayer = 0;

	deck = [];
	discard = [];
	dirPlay = 1;
	drawNum = 0;
	currentColor = "";
	
	nicks = [];
	
	bot.sendMessage({
		to: channelID,
		message: "Uno Game Ended"
	}, function(err, response) {
		bot.editMessage({
			channelID: channelID,
			messageID: msgID[0],
			message: "Game ended"
		});
	});
}

function endUser(userID, channelID) {
	if (players[userID]) {
		playerList = getPlayers(false);
		players[userID].forEach(function(elem) {
			deck.push(elem);
		});
		
		delete players[userID];
		scores.splice(playerList.indexOf(userID),1);
		unos.splice(playerList.indexOf(userID),1);
		nicks.splice(playerList.indexOf(userID),1);
		if(getPlayers(false).length<2) {
			if (gamePhase == 3 || getPlayers(false).length == 0) {
				endGame(channelID);
			}
		} else {
			bot.editMessage({
				channelID: channelID,
				messageID: msgID[0],
				message: "Players: <@" + playerList.join(">, <@") + ">"
			});
		}
		return true;
	}
	return false;
}

function createDeck() {
	var color;
	for (j = 0; j < 4; j++) {
		switch(j) {
			case 0:
				color = "r";
			break;
			case 1:
				color = "g";
			break;
			case 2:
				color = "b";
			break;
			case 3:
				color = "y";
			break;
		}
		deck.push(color + "0", "ww", "ww4");
		for (k = 0; k < 2; k++) {
			for (l = 1; l <= 9; l++) {
				deck.push(color+l);
			}
			deck.push(color+"d", color+"s", color+"r");
		}
	}
}

function dealCards(userID) {
	playerList = getPlayers(false);
	for (i = 0; i < rules[6]; i++) {
		for (id in players) {
			players[id].push(deck.pop());
		}
	}
	
	sendMessages(playerList, getPlayers(true));
}

function idToName(cardID) {
	var temp = "";
	switch(cardID[0]) {
		case "r":
			temp += "Red ";
		break;
		case "g":
			temp += "Green ";
		break;
		case "b":
			temp += "Blue ";
		break;
		case "y":
			temp += "Yellow ";
		break;
		case "w":
			temp += "Wild";
		break;
	}
	switch(cardID.substring(1)) {
		case "w4":
			temp += " Draw 4";
		break;
		case "s":
			temp += "Skip";
		break;
		case "d":
			temp += "Draw 2";
		break;
		case "r":
			temp += "Reverse";
		break;
		case "w":
		break;
		default:
			temp += cardID.substring(1);
	}
	return temp;
}

cardURLs = ["https://i.ibb.co/2SV4KC2/b0.png",
"https://i.ibb.co/4t7S3Zf/b1.png",
"https://i.ibb.co/BtFpW18/b2.png",
"https://i.ibb.co/tDZzVT5/b3.png",
"https://i.ibb.co/1Tk0gzS/b4.png",
"https://i.ibb.co/bWQry0p/b5.png",
"https://i.ibb.co/gPdqSSh/b6.png",
"https://i.ibb.co/vs9X8Fk/b7.png",
"https://i.ibb.co/68gdXvk/b8.png",
"https://i.ibb.co/NYvQ0sM/b9.png",
"https://i.ibb.co/R9DJ3x8/bd.png",
"https://i.ibb.co/GW7Rs6b/br.png",
"https://i.ibb.co/zrg83n0/bs.png",
"https://i.ibb.co/mqXfV1C/g0.png",
"https://i.ibb.co/Gv5yt5k/g1.png",
"https://i.ibb.co/xScDXS0/g2.png",
"https://i.ibb.co/kcyvrzW/g3.png",
"https://i.ibb.co/cYk2Z8h/g4.png",
"https://i.ibb.co/tJ2rTBn/g5.png",
"https://i.ibb.co/PQ5rvyM/g6.png",
"https://i.ibb.co/wR2mpYV/g7.png",
"https://i.ibb.co/9GYJRRZ/g8.png",
"https://i.ibb.co/c6dzRjh/g9.png",
"https://i.ibb.co/nmk9C8M/gd.png",
"https://i.ibb.co/WzgNFH9/gr.png",
"https://i.ibb.co/2KqWgfx/gs.png",
"https://i.ibb.co/xFt35XF/r0.png",
"https://i.ibb.co/jJ8CMPf/r1.png",
"https://i.ibb.co/883RqFT/r2.png",
"https://i.ibb.co/H23cmDY/r3.png",
"https://i.ibb.co/K2VjTpY/r4.png",
"https://i.ibb.co/8Nv6QkT/r5.png",
"https://i.ibb.co/dQXcWtc/r6.png",
"https://i.ibb.co/GVmF38Y/r7.png",
"https://i.ibb.co/xfghsC0/r8.png",
"https://i.ibb.co/SdZgsMQ/r9.png",
"https://i.ibb.co/RNvv63T/rd.png",
"https://i.ibb.co/HdtrcVJ/rr.png",
"https://i.ibb.co/D9rNQB2/rs.png",
"https://i.ibb.co/JyjhTCL/ww.png",
"https://i.ibb.co/K5Sn3gp/ww4.png",
"https://i.ibb.co/RHQs1rw/y0.png",
"https://i.ibb.co/SccbhCy/y1.png",
"https://i.ibb.co/hyDvNQM/y2.png",
"https://i.ibb.co/XYnzgRK/y3.png",
"https://i.ibb.co/MhvwP9Y/y4.png",
"https://i.ibb.co/y6scbRx/y5.png",
"https://i.ibb.co/89Qw31T/y6.png",
"https://i.ibb.co/JxBqnW2/y7.png",
"https://i.ibb.co/9YZ6pd1/y8.png",
"https://i.ibb.co/DrgSc1t/y9.png",
"https://i.ibb.co/4V1XzRR/yd.png",
"https://i.ibb.co/X44dStJ/yr.png",
"https://i.ibb.co/TWyQ1RL/ys.png",
"https://i.ibb.co/TWyQ1RL/ys.png"];

function getCardURL(cardID) {
	for (i = 0; i < cardURLs.length; i++) {
		card = cardURLs[i].substring(25);
		if (cardID == card.substring(0,card.indexOf("."))) {
			return cardURLs[i];
		}
	}
	return "https://i.ibb.co/BwSXYnV/unknown.png";
}

function getReadableHand(hand) {
	hand.sort();
	var newHand = "**Your Hand:**\n";
	for (i = 0; i < hand.length; i++) {
		newHand += idToName(hand[i]) + ": " + hand[i] + "\n"
	}
	return newHand;
}

function draw(numCards) {
	var cards = [];
	for (i = 0; i < numCards; i++) {
		cards.push(deck.pop());
		if (deck.length == 0) {
			deck = discard.slice(0,discard.length-1);
			shuffle(deck);
			discard = [discard[discard.length - 1]];
		}
	}
	
	if (!numCards) {
		cards.push(deck.pop());
		if (deck.length == 0) {
			deck = discard.slice(0,discard.length-1);
			shuffle(deck);
			discard = [discard[discard.length - 1]];
		}
		
		while (!canMatch(cards[cards.length-1],discard[discard.length-1]) && rules[2]) {
			cards.push(deck.pop());
			if (deck.length == 0) {
				deck = discard.slice(0,discard.length-1);
				shuffle(deck);
				discard = [discard[discard.length - 1]];
			}
		}
	}
	return cards;
}

function canMatch(inputCard, compCard) {
	if (inputCard[0] == compCard[0] || inputCard[1] == compCard[1] || 
	inputCard[0] == "w" || inputCard[1] == "w" || inputCard[0] == currentColor || currentColor == "w") {
		return true;
	}
	return false;
}

function nextPlayer() {
	var playerList = getPlayers(false);
	if (dirPlay) {
		currentPlayer = (currentPlayer + 1) % playerList.length;
	} else {
		currentPlayer = (currentPlayer - 1) < 0 ? playerList.length - 1 : currentPlayer - 1;
	}
}

function resetGame(channelID, playerList) {
	deck = [];
	discard = [];
	dirPlay = 1;
	drawNum = 0;
	currentColor = "";
	for (id in players) {
		players[id] = [];
	}
	unos = [0];
	
	for (i = 0; i < Math.ceil(playerList.length*rules[6]/28); i++) {
		createDeck();
	}
	shuffle(deck);
	
	currentPlayer = Math.floor(Math.random()*playerList.length);
	gamePhase = 3;
	
	var temp = "";
	for(i = 0; i < playerList.length; i++) {
		temp += playerList[(currentPlayer+i)%playerList.length] + ">, <@";
	}
	temp = temp.substring(0, temp.length-5);
	
	var topCard = deck.pop();
	while (topCard == "ww4") {
		deck.push(topCard);
		shuffle(deck);
		topCard = deck.pop();
	}
	discard.push(topCard);
	currentColor = topCard[0];
	
	switch(discard[discard.length-1][1]) {
		case "d":
			var cards = draw(2);
			players[playerList[currentPlayer]].splice(players[playerList[currentPlayer]].length,0, cards[0], cards[1]);
			nextPlayer();
		break;
		case "s":
			nextPlayer();
		break;
		case "r":
			dirPlay = !dirPlay();
			nextPlayer();
		break;
	}
	dealCards();
	reEvalUnos();
	
	if (rules[4]) {
		extraRuleText = ", or 'u!<cardID> <@name>' to discard a 7";
	}
	
	bot.sendMessage({
		to: channelID,
		message: "Play order: <@" + temp + ">\nWhen you get your hand and it's your turn, type 'u!<cardID>' to discard a card\nOr type 'u!<cardID> <color>' to discard a wild" + extraRuleText
	}, function(err, response) {
		bot.sendMessage({
			to: channelID,
			embed: {
				title: "Current Card on top of the discard pile:",
				color: "" + (Math.floor(Math.random() * 16777215) + 1),
				footer: {
					text: getReadableScoreCards()
					},
				image: {
					url: getCardURL(discard[0])
				},
				fields: [
					{
						name: idToName(discard[0]),
						value: "It is currently <@" + getPlayers(false)[currentPlayer] + ">'s turn. Type u!<cardID> to discard a card!\nOr type 'u!<cardID> <color>' to discard a wild" + extraRuleText
					}
				]
			}
		}, function(err, response) {
			msgID[2] = response.id;
			msgID[4] = response.channel_id;
		});
	});
}

function lastCard(channelID, userID, gameEnd) {
	bot.getMessage({
		channelID: channelID,
		messageID: msgID[2]
	}, function(err, response) {
		var newMsg = response.embeds;
		newMsg[0].fields[0].name = idToName(discard[discard.length-1]);
		newMsg[0].fields[0].value = "<@" + userID + "> discarded a " + idToName(discard[discard.length-1]);
		newMsg[0].footer.text = getReadableScoreCards();
		newMsg[0].image.url = getCardURL(discard[discard.length-1]);
		bot.editMessage({
			channelID: channelID,
			messageID: response.id,
			message: "",
			embed: newMsg[0]
		}, function (err, response) {
			if (gameEnd) {
				endGame(channelID);
			} else {
				resetGame(channelID, getPlayers(false));
			}
		});
	});
}

function reEvalUnos() {
	playerList = getPlayers(false);
	for (i = 0; i < playerList.length; i++) {
		if (players[playerList[i]].length == 1 && unos[i] != 1) {
			unos[i] = -1;
		} else if (players[playerList[i]].length > 1){
			unos[i] = 0;
		}
	}
}

function getReadableScoreCards() {
	var list = "";
	var playerList = getPlayers(false);
	for (i = 0; i < playerList.length; i++) {
		list += nicks[i] + ": " + players[playerList[i]].length + " cards";
		if (rules[0] || rules[1]) {
			list += " + " + scores[i] + " points";
		}
		list += ", ";
	}
	list = list.substring(0,list.length-2);
	return list;
}

//Benjamin: 351141123949068300