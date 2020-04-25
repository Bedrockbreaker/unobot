import core from "./coreGame.js";

/**
 * Popular house rules for uno
 * @class
 */
export default class modUnoHouseRules {

	/**
	 * 
	 * @param {import("./unoRefactored.js").default} game 
	 */
	constructor(game) {
		this.self = game;

		this.self.events.on("setup", phase => {
			if (phase !== core.phases.END || this.self.setup.cancelled) return;
			this.self.meta.rules = {...this.self.meta.rules, ...{
				contDraw: ["Draw Until You Discard - :arrow_up:", "If you can't play a card, you keep drawing until you can", "⬆️"],
				stacking: ["Stacking - :books:", "Draw 2s and Draw 4s can be stacked, moving play on to the next player, who can either stack again or draw for all stacked cards", "📚"], // TODO: add a command that changes how stacking works. i.e. "can stack on draw 4s" or "jumping in resets the stack"
				zSCards: ["0-7 Special Cards - :arrows_counterclockwise:", "0 cards rotate all hands in the direction of play, and 7s swap hands with a specific player of your choosing", "🔄"],
				jumpIn: ["Jump-in Rule - :zap:", "If you have a card that exactly matches the current card, you can play it immediately (no matter whose turn it is), and play continues as if you just took your turn", "⚡"]
				/* TODO: remove 666 and add that as a server-only rule (specifically to test server-only rules)
				six: ["666 - :smiling_imp:", "If three sixes are discarded in a row, the player to discard the last six must draw 13 cards", "😈"]*/
			}};
		});

		this.self.events.on("start", phase => {
			if (phase !== core.phases.END || this.self.start.cancelled) return;
			if (this.self.meta.rules.stacking) this.self.piles.draw.traits.drawNum = 0;
		});
	}
}