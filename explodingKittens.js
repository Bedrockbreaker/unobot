const Discord = require("discord.js");
const EH = require("./eventHandler");
const game = EH.emitter;
const shuffle = EH.shuffle;
const resetTimeLimit = EH.timeLimit;

function begin() {
    game.on("setup", serverGame => {
        if (!serverGame || serverGame.meta.game !== "exKit") return;
        serverGame.meta.rules = {
            ...serverGame.meta.rules, 
            ...{
                "impoding": ["Imploding Kittens Expansion Pack", "---", "🤯"],
                "streaking": ["Streaking Kittens Expansion Pack", "---", "👕"]
            }
        }
    });

    game.on("start", serverGame => {
        if (!serverGame || serverGame.meta.game !== "exKit") return;
        if (Object.keys(serverGame.players).length < 2) return serverGame.meta.channel.send("Not enough players!");
        if (Object.keys(serverGame.meta.rules).length) serverGame.meta.ruleReactor.stop();
        serverGame.meta.gamePhase = 3;
    });

    game.on("deckCreate", (serverGame, onlyPopulate) => {

    });

    game.on("discard", (serverGame, args, member) => {

    });

    game.on("nextPlayer", serverGame => {

    });

    game.on("timeLimit", serverGame => {

    });

    game.on("updateUI", serverGame => {

    });

    game.on("join", (serverGame, member) => {

    });

    game.on("quit", (serverGame, member, generateMessage) => {

    });
}

module.exports.load = begin;