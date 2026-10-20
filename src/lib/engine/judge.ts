// What the computer makes of the player's move, for its taunt (§4.11): from what its last search
// expected, and its first look at the position the move left.
import type { Judgement } from '#lib/audio/voices.ts';

/** A move that hands the computer this much (centipawns, by the engine's count) is a bad one. */
export const BAD_MOVE_CP = 150;

/** What the computer's search expected when it last moved. */
export interface Expectation {
	/** Its score for itself, in centipawns. */
	score: number;
	/** The player's reply it expected, in UCI notation, if it played the move it found best. */
	reply?: string;
}

/**
 * A player's move (`played`, in UCI notation), given the computer's `score` for itself after
 * it: bad if that is BAD_MOVE_CP better than it expected before its own move (which, if it chose a
 * weaker move, it only overstated), good if it is the reply the computer expected, else neutral.
 */
export function judge(expected: Expectation, played: string, score: number): Judgement {
	if (score - expected.score >= BAD_MOVE_CP) return 'bad';
	if (played === expected.reply) return 'good';
	return 'neutral';
}
