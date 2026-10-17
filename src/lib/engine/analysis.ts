// Collects the engine's score for each candidate move from its MultiPV lines, for the
// human-like move choice (§4.6.2).
import type { MoveInput } from '#lib/game/game.svelte.ts';
import { parsePv, parseUciMove, type Score } from './uci.ts';

/** Centipawns standing in for a forced mate; a quicker mate scores a little higher. */
export const MATE_CP = 10_000;

/** A score in centipawns from the side to move's point of view. */
export function toCp(score: Score): number {
	if ('cp' in score) return score.cp;
	return score.mate > 0 ? MATE_CP - 10 * score.mate : -MATE_CP - 10 * score.mate;
}

export interface Candidate {
	/** The move in UCI notation, e.g. `e7e8q`. */
	uci: string;
	move: MoveInput;
	/** The score from the deepest exact search of the move. */
	cp: number;
	depth: number;
	/** The score when the move was first reported, at the shallowest depth: how it looks at a glance. */
	shallowCp: number;
}

export class Analysis {
	#moves = new Map<string, Candidate>();

	/** Take in one line of engine output; anything but an exact principal variation is ignored. */
	add(line: string) {
		const pv = parsePv(line);
		if (!pv || pv.bound) return;
		const move = parseUciMove(pv.move);
		if (!move) return;
		const cp = toCp(pv.score);
		const known = this.#moves.get(pv.move);
		if (!known) {
			this.#moves.set(pv.move, { uci: pv.move, move, cp, depth: pv.depth, shallowCp: cp });
		} else if (pv.depth >= known.depth) {
			known.cp = cp;
			known.depth = pv.depth;
		}
	}

	/**
	 * The scored moves, best first. Only moves scored in the last two iterations count: one
	 * that dropped out of the reported lines earlier keeps a stale, shallower score.
	 */
	get candidates(): Candidate[] {
		const all = [...this.#moves.values()];
		const deepest = Math.max(0, ...all.map((c) => c.depth));
		return all.filter((c) => c.depth >= deepest - 1).sort((a, b) => b.cp - a.cp);
	}
}
