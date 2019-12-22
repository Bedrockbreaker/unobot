const Discord = require("discord.js");
const EH = require("./eventHandler");
const uno = require("./uno");
const game = EH.emitter;
const shuffle = EH.shuffle;
const resetTimeLimit = EH.timeLimit;

function begin() {
    game.on("setup", serverGame => {
        if (!serverGame || serverGame.meta.title !== "uno") return;
        serverGame.meta.rules = {
            ...serverGame.meta.rules,
            ...{
                sssix: ["666 - :smiling_imp:", "If there are three sixes are discarded in a row,\nthe player to discard the last six must draw 13 cards", "😈"]
            }
        };
    });

    game.on("discard", (serverGame, args, member) => {
        if (serverGame && serverGame.meta.title === "uno" && serverGame.meta.rules.sssix && serverGame.piles.discard.cards.slice(0, 3).map(card => card[1]).every(card => card === "6")) game.emit("draw", serverGame, member.id, 13, " for placing down the third six in a row");
    });
}
module.exports.load = begin;