const Discord = require("discord.js");
const EH = require("./eventHandler");
const game = EH.emitter;
const shuffle = EH.shuffle;
const resetTimeLimit = EH.timeLimit;

function begin() {
    game.on("setup", serverGame => {
        if (!serverGame || serverGame.meta.title !== "uno") return;
        serverGame.meta.traits.startingCards = 7;
        serverGame.meta.traits.matchFuncs = {};
        serverGame.meta.traits.genericMatchFuncs = {};
        game.emit("getMatchFunctions", serverGame);

        // Setup all possible traits before adding rules, so that custom rules can use the numbers/info from the setup, e.g. number of decks used from starting cards.
        // Though make sure not to include things that need to be reset between rounds in a game of uno with points.
        serverGame.meta.rules = {
            ...serverGame.meta.rules,
            ...{
                points: ["Play for Points - :100:", "---", "💯"],
                altPoints: ["Alternate Points Rule - :1234:", "---", "🔢"],
                contDraw: ["Draw Until You Discard - :small_red_triangle_down:", "---", "🔻"],
                stacking: ["Stacking - :books:", "---", "📚"],
                zSCards: ["0-7 Special Cards - :arrows_counterclockwise:", "---", "🔄"],
                jumpIn: ["Jump-in Rule - :zap:", "---", "⚡"],
                undefined: [`Number of Starting Cards: ${serverGame.meta.traits.startingCards}`, `Number of decks used: ${Math.ceil(Object.keys(serverGame.players).length * serverGame.meta.traits.startingCards / 28)}`]
            }
        };
    });

    game.on("start", serverGame => {
        if (!serverGame || serverGame.meta.title !== "uno") return;
        if (Object.keys(serverGame.players).length < 2) return serverGame.meta.channel.send("Not enough players!");
        if (Object.keys(serverGame.meta.rules).length) serverGame.meta.ruleReactor.stop();
        serverGame.meta.gamePhase = 3;

        // Everything in here will be ran multiple times if the uno game is setup with points.
        serverGame.meta.traits.clockwise = true;
        for (playerID in serverGame.players) {
            serverGame.players[playerID].traits.score = 0;
            serverGame.players[playerID].traits.saidUno = false;
        }
        serverGame.piles.draw = {
            cards: [],
            traits: { drawNum: 0 }
        };
        serverGame.piles.discard = {
            cards: [],
            traits: {}
        };
        const currentPlayerIndex = Math.floor(Math.random() * Object.keys(serverGame.players).length);
        for (i = 0; i < Object.keys(serverGame.players).length; i++) {
            Object.values(serverGame.players).find(player => player.index === (currentPlayerIndex + i) % Object.keys(serverGame.players).length).index = i;
        }
        serverGame.meta.currentPlayer = Object.keys(serverGame.players).find(playerID => serverGame.players[playerID].index === 0);

        game.emit("deckCreate", serverGame, false);
        serverGame.piles.discard.cards.unshift(serverGame.piles.draw.cards.shift());
        for (player in serverGame.players) {
            serverGame.players[player].cards = serverGame.piles.draw.cards.splice(0, serverGame.meta.traits.startingCards);
        }
        serverGame.piles.discard.traits.currentColor = serverGame.piles.discard.cards[0][0];
        switch (serverGame.piles.discard.cards[0]) {
            case "d":
                game.emit("draw", serverGame, serverGame.meta.traits.currentPlayer, 2, " due to the first drawn card");
                game.emit("nextPlayer", serverGame);
                break;
            case "s":
                game.emit("nextPlayer", serverGame);
                break;
            case "r":
                serverGame.meta.traits.clockwise = !serverGame.meta.traits.clockwise;
                game.emit("nextPlayer", serverGame);
                break;
        }

        dealCards(serverGame, 0);
        const gameInfo = new Discord.RichEmbed()
            .setTitle(`Current Discarded Card: ${serverGame.meta.cardNames[serverGame.piles.discard.cards[0]]}`)
            .setThumbnail(serverGame.players[serverGame.meta.currentPlayer].member.user.avatarURL)
            .addField(`It is currently ${serverGame.players[serverGame.meta.currentPlayer].member.displayName}'s turn`, "The game has just started!")
            .setColor(Math.floor(Math.random() * 16777215))
            .setImage(serverGame.meta.cardImgs[serverGame.piles.discard.cards[0]] || "https://i.ibb.co/BwSXYnV/unknown.png")
            .setFooter(Object.values(serverGame.players).map(player => [player.member.displayName, player.cards.length, player.traits.score]).reduce((acc, val) => acc += `${val[0]}: ${val[1]} cards${(serverGame.meta.rules.points || serverGame.meta.rules.altPoints) ? ` + ${val[2]} points, ` : ", "}`, "").slice(0, -2));
        serverGame.meta.channel.send(`Play order: <@${Object.values(serverGame.players).sort((player1, player2) => player1.index - player2.index).map(player => player.member.id).join(">, <@")}>\nGo to <https://github.com/Bedrockbreaker/unobot/wiki/Uno> to learn how to play.`)
            .then(message => {
                serverGame.meta.channel.send(gameInfo)
                    .then(message => serverGame.meta.msgs[2] = message);
            });
        resetTimeLimit(serverGame);
    });

    game.on("deckCreate", (serverGame, onlyPopulate) => {
        // Populate deck
        if (!serverGame || serverGame.meta.title !== "uno") return;
        const colors = ["r", "g", "b", "y"];
        for (k = 0; k < Math.ceil(Object.keys(serverGame.players).length * serverGame.meta.traits.startingCards / 28); k++) {
            for (j in colors) {
                serverGame.piles.draw.cards.push("ww", "w4", `${colors[j]}0`, `${colors[j]}d`, `${colors[j]}d`, `${colors[j]}s`, `${colors[j]}s`, `${colors[j]}r`, `${colors[j]}r`);
                for (i = 1; i < 10; i++) {
                    serverGame.piles.draw.cards.push(colors[j] + i, colors[j] + i);
                }
            }
        }
        do {
            shuffle(serverGame.piles.draw.cards);
        } while (serverGame.piles.draw.cards[0] === "w4");
		// while ([array, of, cards, that, can't, be, drawn, first].includes(serverGame.piles.draw.cards[0]));

        if (onlyPopulate) return;

        // Generate Human-Readable card names
        const colors2 = ["Red", "Green", "Blue", "Yellow"];
        serverGame.meta.cardNames["ww"] = "Wild";
        serverGame.meta.cardNames["w4"] = "Wild Draw 4";
        for (j in colors) {
            serverGame.meta.cardNames[`${colors[j]}d`] = `${colors2[j]} Draw 2`;
            serverGame.meta.cardNames[`${colors[j]}r`] = `${colors2[j]} Reverse`;
            serverGame.meta.cardNames[`${colors[j]}s`] = `${colors2[j]} Skip`;
            for (i = 0; i < 10; i++) {
                serverGame.meta.cardNames[colors[j] + i] = `${colors2[j]} ${i}`;
            }
        }

        // Assign card image links
        const cardLinks = ["https://i.ibb.co/2SV4KC2/b0.png",
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
        for (card in serverGame.meta.cardNames) {
            serverGame.meta.cardImgs[card] = cardLinks.find(link => link.replace(/https:\/\/i\.ibb.co\/.*\/(.*)\.png/, "$1") === card);
        }
        serverGame.meta.cardImgs["w4"] = "https://i.ibb.co/K5Sn3gp/ww4.png";
    });

    game.on("getMatchFunctions", serverGame => {
        if (!serverGame || serverGame.meta.title !== "uno") return;
        // Assign a card matching function with a unique id. To override, replace the base function.
        // Returns [canCardMatch, canCardStillMatchEvenIfOtherFunctionsReturnFalse]
        serverGame.meta.traits.matchFuncs.base = function canMatch(serverGame, card1, card2, args, member) {
            const matches = card1[0] === card2[0] || card1[1] === card2[1] || card1[0] === "w" || card1[0] === serverGame.piles.discard.traits.currentColor || serverGame.piles.discard.traits.currentColor === "w";
            if (!args || !member) return [matches, true]; // Generic match returned -- "could this card have been played?"

            if (serverGame.meta.rules.zSCards && card1[1] === "7" && !args[1]) return [false, false]; // Avoids a try/catch statement.
            const colors = ["red", "r", "green", "g", "blue", "b", "yellow", "y"];
            // Advanced match returned -- "was this card correctly played?"
            if (matches && // If can normally match
                (!serverGame.piles.draw.traits.drawNum || (serverGame.meta.rules.contDraw && (card1[1] === "d" || card1 === "w4"))) && // If no need to draw, or can stack and is stacking
                ((card1 !== "ww" && card1 !== "w4") || colors.includes(args[1])) && // If wild card color is correct
                (!serverGame.meta.rules.zSCards || card1[1] !== "7" || (serverGame.players.hasOwnProperty(args[1].replace(/<@!?(\d*)>/, "$1")) && args[1].replace(/<@!?(\d*)>/, "$1") !== member.id))) return [true, true]; // If special 7 card, make sure mentioned user is valid
            return [false, true];
        }
    });

    game.on("discard", (serverGame, args, member) => {
        if (!serverGame || serverGame.meta.title !== "uno" || !Object.keys(serverGame.players).includes(member.id)) return;
        switch (args[0]) {
            case "!sC":
            case "!startingCards":
                if (isNaN(Number(args[1]))) return serverGame.meta.channel.send(`${args[1] === undefined ? "That" : `\`${args[1]}\``} is not a valid number!`);
                if (!serverGame.meta.msgs[1]) return serverGame.meta.channel.send("Advance to changing the game rules before changing this!");
                serverGame.meta.traits.startingCards = Math.abs(Math.floor(Number(args[1])));
                const fieldIndex = serverGame.meta.msgs[1].embeds[0].fields.findIndex(field => field.name.includes("Number of Starting Cards: "));
                serverGame.meta.msgs[1].embeds[0].fields[fieldIndex].name = `Number of Starting Cards: ${serverGame.meta.traits.startingCards}`;
                serverGame.meta.msgs[1].embeds[0].fields[fieldIndex].value = `Number of decks used: ${Math.ceil(Object.keys(serverGame.players).length * serverGame.meta.traits.startingCards / 28)}`;
                serverGame.meta.msgs[1].edit(new Discord.RichEmbed(serverGame.meta.msgs[1].embeds[0]));
                return;
            case "!d":
            case "!draw":
                if (serverGame.meta.gamePhase < 3 || serverGame.meta.currentPlayer !== member.id) return;
                if (!serverGame.players[member.id].cards.some(card => match(serverGame, card, serverGame.piles.discard.cards[0])) || serverGame.piles.draw.traits.drawNum) { game.emit("draw", serverGame, member.id, 0, ""); break; }
                return;
            case "!u":
            case "!uno":
                if (serverGame.meta.gamePhase < 3) return;
                let protectedSelf = false;
                if (serverGame.players[member.id].cards.length === 1) {
                    serverGame.meta.actions.unshift(`${member.displayName} called uno!`);
                    serverGame.players[member.id].traits.saidUno = true;
                    protectedSelf = true;
                }
                const slowPlayer = Object.values(serverGame.players).find(player => player.cards.length === 1 && player.traits.saidUno === false).member.id;
                if (slowPlayer) {
                    game.emit("draw", serverGame, slowPlayer, 2, " because they didn't call `!uno` fast enough");
                    break;
                }
                if (!protectedSelf) game.emit("draw", serverGame, member.id, 2, " for falsely calling uno");
                break;
            case "!c":
            case "!challenge":
                if (serverGame.meta.gamePhase < 3 || serverGame.meta.currentPlayer !== member.id || serverGame.piles.discard.cards[0] !== "w4") return;
                if (serverGame.players[serverGame.meta.traits.prevPlayer].cards.some(card => card !== "w4" ? match(serverGame, card, serverGame.piles.discard.cards[1]) && (!serverGame.piles.discard.traits.drawNum || (card[1] === "d" && serverGame.meta.rules.stacking)) : false)) {
                    // TODO: Fix the logic above to determine if they actually had a card they could play
                    game.emit("draw", serverGame, serverGame.meta.traits.prevPlayer, serverGame.piles.discard.traits.drawNum, " from loosing to a Draw 4 challenge");
                    serverGame.piles.discard.traits.drawNum = 0;
                    break;
                }
                game.emit("draw", serverGame, member.id, 0, " from unsuccesfully challenging a Draw 4");
                break;
            default:
                const card = args[0].substring(1);
                if (serverGame.meta.gamePhase < 3 || !serverGame.players[member.id].cards.includes(card) || !serverGame.meta.cardNames.hasOwnProperty(card)) return;
                if (member.id !== serverGame.meta.currentPlayer && (!serverGame.meta.rules.jumpIn || card !== serverGame.piles.discard.cards[0])) return;
                if (!match(serverGame, card, serverGame.piles.discard.cards[0], args, member)) return;
                serverGame.piles.discard.cards.unshift(serverGame.players[member.id].cards.splice(serverGame.players[member.id].cards.indexOf(card), 1)[0]);
                if (serverGame.players[member.id].cards.length === 0) {
                    if (!serverGame.meta.rules.points && !serverGame.meta.rules.altPoints) {
                        serverGame.meta.channel.send(`${member.displayName} has won the game!`);
                        serverGame.meta.actions.unshift(`${member.displayName} won the game!`);
                        serverGame.meta.ended = true;
                        break;
                    }
                    if (serverGame.meta.rules.points) {
                        // For every player, add their cards together and calculate a score, which is given to the winning player. Normal cards = face value, specials = 20, wilds = 50.
                        serverGame.players[member.id].traits.score += Object.values(serverGame.players).flatmap(player => player.cards).reduce((acc, card) => {acc + (Number(card[1]) ? Number(card[1]) : (card[0] === "w" ? 50 : 20))},0);
                        if (serverGame.players[member.id].traits.score >= 500) {
                            serverGame.meta.channel.send(`${member.displayName} has won the game, with ${serverGame.players[member.id].traits.score} points!`);
                            serverGame.meta.actions.unshift(`${member.displayName} won the game!`);
                            serverGame.meta.ended = true;
                            break;
                        }
                        serverGame.meta.channel.send(`${member.displayName} has won the round!`);
                        serverGame.meta.actions.unshift(`${member.displayName} won the round!`);
                        game.emit("start", serverGame);
                        break;

                    }
                    // Like above, though each player gets their own score
                    Object.values(serverGame.players).forEach(player => player.traits.score += player.cards.reduce((acc, card) => { acc + (Number(card[1]) ? Number(card[1]) : (card[0] === "w" ? 50 : 20)) }, 0));
                    const lowestScore = Object.values(serverGame.players).map(player => player.traits.score).reduce((acc, score) => Math.min(acc, score));
                    Object.values(serverGame.players).forEach(player => (player.traits.score >= 500 && player.traits.score != lowestScore) ? game.emit("quit", serverGame, player.member.id, false) : null);
                    if (Object.keys(serverGame.players).length === 1) {
                        serverGame.meta.channel.send(`${member.displayName} has won the game, with ${serverGame.players[member.id].traits.score} points!`);
                        serverGame.meta.actions.unshift(`${member.displayName} won the game!`);
                        serverGame.meta.ended = true;
                        break;
                    }
                    serverGame.meta.channel.send(`${member.displayName} has won the round!`);
                    serverGame.meta.actions.unshift(`${member.displayName} won the round!`);
                    game.emit("start", serverGame);
                    break;
                }
                serverGame.piles.discard.traits.currentColor = card[0];
                serverGame.meta.actions.unshift(`${member.displayName} ${serverGame.meta.currentPlayer !== member.id ? "jumped in with" : "discarded"} a ${serverGame.meta.cardNames[card]}`);
                serverGame.meta.currentPlayer = member.id; // In case someone jumped in
                game.emit("nextPlayer", serverGame);
                switch (card[1]) {
                    case "r":
                        serverGame.meta.traits.clockwise = !serverGame.meta.traits.clockwise;
                        game.emit("nextPlayer", serverGame);
                        if (Object.keys(serverGame.players).length > 2) game.emit("nextPlayer");
                        serverGame.meta.actions[0] += ` and ${Object.keys(serverGame.players).length === 2 ? `skipped ${serverGame.players[serverGame.meta.traits.prevPlayer].member.displayName}'s turn` : "reversed the play direction"}`;
                        break;
                    case "4":
                        if (card !== "w4") break;
                    case "d":
                        const drawNum = card === "w4" ? 4 : 2;
                        serverGame.piles.draw.traits.drawNum += drawNum
                        if (serverGame.meta.rules.stacking) break;
                        game.emit("draw", serverGame, serverGame.meta.currentPlayer, 0, "");
                        game.emit("nextPlayer", serverGame);
                        break;
                    case "s":
                        game.emit("nextPlayer", serverGame);
                        serverGame.meta.actions[0] += ` and skipped ${serverGame.players[serverGame.meta.traits.prevPlayer].member.displayName}'s turn`;
                        break;
                    case "7":
                        if (!serverGame.meta.rules.zSCards) break;
                        const temp = serverGame.players[member.id].cards;
                        const player2ID = args[1].replace(/<@!?(\d*)>/, "$1");
                        serverGame.players[member.id].cards = serverGame.players[player2ID].cards;
                        serverGame.players[player2ID].cards = temp;
                        serverGame.players[member.id].traits.saidUno = false;
                        serverGame.players[player2ID].traits.saidUno = false;
                        dealCards(serverGame, player2ID);
                        serverGame.meta.actions[0] += ` and swapped hands with ${serverGame.players[player2ID].member.displayName}`;
                        break;
                    case "0":
                        if (!serverGame.meta.rules.zSCards) break;
                        // If play direction is clockwise, copy the last player's hand, else, copy the first player's hand.
                        const temp2 = Object.values(serverGame.players).find(player => player.index === (serverGame.meta.traits.clockwise ? Object.keys(serverGame.players).length - 1 : 0)).cards;
                        for (i = serverGame.meta.traits.clockwise ? Object.keys(serverGame.players).length - 1 : 0; serverGame.meta.traits.clockwise ? i > 0 : i < Object.keys(serverGame.players).length - 1; i += serverGame.meta.traits.clockwise ? -1 : 1) {
                            Object.values(serverGame.players).find(player => player.index === i).cards = Object.values(serverGame.players).find(player => player.index === i + (serverGame.meta.traits.clockwise ? -1 : 1)).cards;
                            Object.values(serverGame.players).find(player => player.index === i).traits.saidUno = false;
                        }
                        Object.values(serverGame.players).find(player => player.index === (serverGame.meta.traits.clockwise ? 0 : Object.keys(serverGame.players).length - 1)).cards = temp2;
                        serverGame.meta.actions[0] += ` and rotated everyone's hands around`;
                        break;
                }
                if (card[0] === "w") serverGame.piles.discard.traits.currentColor = args[1].substring(0, 1);
                card[1] === "0" && serverGame.meta.rules.zSCards ? dealCards(serverGame, 0) : dealCards(serverGame, member.id);
                break;
        }
        return serverGame.meta.update = true;
    });

    game.on("draw", (serverGame, playerID, numCards, reason) => {
        if (!serverGame || serverGame.meta.title !== "uno") return;
        serverGame.players[playerID].traits.saidUno = false;
        // if numCards isn't specified, draw normally. (aka either forcefully draw or willingly draw)
        const given = numCards; // Does the player have to draw a number of cards other than normal?
        if (!numCards) { numCards = serverGame.piles.draw.traits.drawNum; serverGame.piles.draw.traits.drawNum = 0; }
        const specified = numCards; // Does the player have to draw a certain number of cards? (ignoring the 1 for non-continuous draw)
        const before = serverGame.players[playerID].cards.length;
        do {
            serverGame.players[playerID].cards.unshift(serverGame.piles.draw.cards.shift());
            if (serverGame.piles.draw.cards.length === 0) game.emit("deckCreate", serverGame, true); // Keeps a history of all played cards. Doesn't break mods which rely on previous cards in the discard pile.
            numCards = Math.max(numCards - 1, 0);
        } while (serverGame.meta.rules.contDraw && !numCards && !specified ? !match(serverGame, serverGame.players[playerID].cards[0], serverGame.piles.discard.cards[0]) : numCards);
        dealCards(serverGame, playerID);
        if ((!specified && !match(serverGame, serverGame.players[playerID].cards[0], serverGame.piles.discard.cards[0])) || (specified && !given)) game.emit("nextPlayer", serverGame);
        serverGame.meta.actions.unshift(`${serverGame.players[playerID].member.displayName} drew ${serverGame.players[playerID].cards.length - before} cards${reason}`);
    });

    game.on("nextPlayer", serverGame => {
        if (!serverGame || serverGame.meta.title !== "uno") return;
        serverGame.meta.traits.prevPlayer = serverGame.meta.currentPlayer; // Mainly in case they challenge a draw 4
        serverGame.meta.currentPlayer = Object.values(serverGame.players).find(player => player.index === (Object.values(serverGame.players).find(player1 => player1.member.id === serverGame.meta.currentPlayer).index + 1) % Object.keys(serverGame.players).length).member.id;
        resetTimeLimit(serverGame);
    });

    game.on("timeLimit", serverGame => {
        if (!serverGame || serverGame.meta.title !== "uno") return;
        game.emit("draw", serverGame, serverGame.meta.currentPlayer, 0, " due to taking too long on their turn");
        // TODO: end the game if everyone hasn't gone once in row.
        game.emit("nextPlayer", serverGame);
    });

    game.on("updateUI", serverGame => {
        if (!serverGame || serverGame.meta.title !== "uno" || serverGame.meta.gamePhase < 3) return;
        let info = [];
        if (serverGame.piles.discard.cards[0][0] === "w" && serverGame.piles.discard.cards.length > 1) {
            let color = "";
            switch (serverGame.piles.discard.traits.currentColor) {
                case "r":
                    color = "Red";
                    break;
                case "g":
                    color = "Green";
                    break;
                case "b":
                    color = "Blue";
                    break;
                case "y":
                    color = "Yellow";
                    break;
            }
            info.push(`The current color is ${color}`);
        }
        if (serverGame.piles.draw.traits.drawNum) info.push(`${serverGame.piles.draw.traits.drawNum} cards stacked to draw`);
        info.push(`Play direction is currently ${serverGame.meta.traits.clockwise ? "left" : "right"} -> ${serverGame.meta.traits.clockwise ? "right" : "left"}`);

        serverGame.meta.msgs[2].embeds[0].title = `Current Discarded Card: ${serverGame.meta.cardNames[serverGame.piles.discard.cards[0]]}`;
        serverGame.meta.msgs[2].embeds[0].thumbnail.url = serverGame.players[serverGame.meta.currentPlayer].member.user.avatarURL;
        serverGame.meta.msgs[2].embeds[0].fields[0].name = `**It is currently ${serverGame.players[serverGame.meta.currentPlayer].member.displayName}'s turn\n${info.join("\n")}**`;
        serverGame.meta.msgs[2].embeds[0].fields[0].value = `**${serverGame.meta.actions[0]}**${serverGame.meta.actions[1] ? `\n${serverGame.meta.actions[1]}` : ""}`;
        serverGame.meta.msgs[2].embeds[0].image.url = serverGame.meta.cardImgs[serverGame.piles.discard.cards[0]] || "https://i.ibb.co/BwSXYnV/unknown.png";
        serverGame.meta.msgs[2].embeds[0].footer.text = Object.values(serverGame.players).map(player => [player.member.displayName, player.cards.length, player.traits.score]).reduce((acc, val) => acc += `${val[0]}: ${val[1]} cards${(serverGame.meta.rules.points || serverGame.meta.rules.altPoints) ? ` + ${val[2]} points, ` : ", "}`, "").slice(0,-2);

        setImmediate(() => serverGame.meta.msgs[2].edit(new Discord.RichEmbed(serverGame.meta.msgs[2].embeds[0]))); // Delays this so that mods can change the embed before the message is edited.
    });

    game.on("join", (serverGame, member) => {
        if (!serverGame || serverGame.meta.title !== "uno") return;
        serverGame.players[member.id] = {
            member: member,
            cards: [],
            isLeader: false,
            index: Object.keys(serverGame.players).length,
            traits: { saidUno: false, score: 0 }
        }
        serverGame.players[member.id].cards = serverGame.piles.draw.cards.splice(0, serverGame.meta.traits.startingCards);
        const fieldIndex = serverGame.meta.msgs[1].embeds[0].fields.findIndex(field => field.name.includes("Number of Starting Cards: "));
        serverGame.meta.msgs[1].embeds[0].fields[fieldIndex].name = `Number of Starting Cards: ${serverGame.meta.traits.startingCards}`;
        serverGame.meta.msgs[1].embeds[0].fields[fieldIndex].value = `Number of decks used: ${Math.ceil(Object.keys(serverGame.players).length * serverGame.meta.traits.startingCards / 28)}`;
        serverGame.meta.msgs[1].edit(new Discord.RichEmbed(serverGame.meta.msgs[1].embeds[0]));
        serverGame.meta.msgs[0].edit(`Who is joining \`${serverGame.meta.title}\`? (Type \`!join\` to join. When finished, type \`!start\`)\nPlayers: <@${Object.keys(serverGame.players).map(player => guild.members.get(player).id).join(">, <@")}>`);
    });

    game.on("quit", (serverGame, member, generateMessage) => {
        if (!serverGame || serverGame.meta.title !== "uno") return;
        serverGame.piles.draw.cards.concat(serverGame.players[member.id].cards);
        shuffle(serverGame.piles.draw.cards);
        delete serverGame.players[member.id];
        if (member.id === serverGame.meta.currentPlayer) game.emit("nextPlayer", serverGame);
        if (Object.keys(serverGame.players).length === 0) return;
        if (generateMessage) return serverGame.meta.channel.send(`Bye <@${member.id}>!`);
    });
}

function dealCards(serverGame, playerIDex) {
    // If a 0 is passed, deal all players. If a player id is passed, only deal to that player.
    // TODO: if an array is passed, deal to those players
    if (typeof (playerIDex) === "string") {
        if (serverGame.players[playerIDex].member.user.bot) return; // I use the bot itself to test things. Prevents error spam. I guess you could program a bot to perfectly play uno now.
        const hand = new Discord.RichEmbed()
            .setTitle("Your Hand:")
            .setDescription(serverGame.players[playerIDex].cards.map(card => `${card}: ${serverGame.meta.cardNames[card]}`).sort().join("\n"))
            .setColor(Math.floor(Math.random() * 16777215));
        return serverGame.players[playerIDex].member.send(hand);
    }
    if (playerIDex >= Object.keys(serverGame.players).length) return;
    if (Object.values(serverGame.players)[playerIDex].member.user.bot) return dealCards(serverGame, playerIDex + 1); // Same deal with the bot here
    const hand = new Discord.RichEmbed()
        .setTitle("Your Hand:")
        .setDescription(Object.values(serverGame.players)[playerIDex].cards.map(card => `${card}: ${serverGame.meta.cardNames[card]}`).sort().join("\n"))
        .setColor(Math.floor(Math.random() * 16777215));
    Object.values(serverGame.players)[playerIDex].member.send(hand)
        .then(dealCards(serverGame, playerIDex + 1));
}

function match(serverGame, card1, card2, args, member) {
    const matches = Object.values(serverGame.meta.traits.matchFuncs).map(func => func(serverGame, card1, card2, args, member));
    return (matches.find(match => match[0]) ? true : false) && matches.every(match => match[1] || match[0]);
}

module.exports.load = begin;
module.exports.match = match;
module.exports.dealCards = dealCards;