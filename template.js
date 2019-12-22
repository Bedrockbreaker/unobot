const Discord = require("discord.js");
const EH = require("./eventHandler");
const game = EH.emitter;
const shuffle = EH.shuffle;
const resetTimeLimit = EH.timeLimit;

function begin() {
    game.on("setup", serverGame => {

    });

    game.on("start", serverGame => {

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