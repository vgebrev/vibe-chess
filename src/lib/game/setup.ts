// What a new game is: the mode, the player's colour and the computer's difficulty (§3, §7.3).
import type { Color } from 'chess.js';
import { DEFAULT_DIFFICULTY, type Difficulty } from '#lib/engine/difficulty.ts';

export type Mode = 'computer' | 'hotseat';

export type ColorChoice = Color | 'random';

export interface GameSetup {
	mode: Mode;
	/** The player's colour vs the computer. */
	color: ColorChoice;
	difficulty: Difficulty;
}

export const DEFAULT_SETUP: GameSetup = {
	mode: 'computer',
	color: 'w',
	difficulty: DEFAULT_DIFFICULTY
};

export function pickColor(choice: ColorChoice, random: () => number = Math.random): Color {
	if (choice !== 'random') return choice;
	return random() < 0.5 ? 'w' : 'b';
}
