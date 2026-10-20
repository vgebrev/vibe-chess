// Parsing of the UCI lines Stockfish prints (§4.6).
import type { Square } from 'chess.js';
import type { MoveInput, PromotionPiece } from '#lib/game/game.svelte.ts';

/** A move in UCI notation (`e7e8q`) → from, to and promotion. */
function parseUciMove(text: string): MoveInput | null {
	const match = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(text);
	if (!match) return null;
	const [, from, to, promotion] = match;
	const move: MoveInput = { from: from as Square, to: to as Square };
	if (promotion) move.promotion = promotion as PromotionPiece;
	return move;
}

/** `bestmove e7e8q ponder …` → the move; `bestmove (none)` (no legal move) → null. */
export function parseBestMove(line: string): MoveInput | null {
	const match = /^bestmove (\S+)/.exec(line);
	return match ? parseUciMove(match[1]) : null;
}

export interface SearchInfo {
	depth: number;
	/** Nodes per second. */
	nps: number;
	/**
	 * The evaluation, in centipawns for the side to move; a mate is worth MATE less the moves to
	 * it (negative if being mated).
	 */
	score: number;
	/** The line the engine expects, in UCI notation, its best move first. */
	pv: string[];
}

/** What a mate is worth, in centipawns: more than any material. */
export const MATE = 100_000;

/**
 * The search statistics in an `info depth … score …` line, as the engine prints at the end of
 * each depth; null for other info lines, for a score that is only a bound (an aspiration window
 * failing), and for the alternatives of a multi-line search (`multipv 2` and on, which Skill
 * Level uses).
 */
export function parseInfo(line: string): SearchInfo | null {
	const [, unit, text] = / score (cp|mate) (-?\d+)\b(?! (?:lower|upper)bound)/.exec(line) ?? [];
	if (!line.startsWith('info ') || !/ depth \d/.test(line) || !unit) return null;
	const field = (name: string) => Number(new RegExp(` ${name} (\\d+)`).exec(line)?.[1] ?? 0);
	if ((field('multipv') || 1) > 1) return null;
	const value = Number(text);
	// `mate 0`: the side to move is mated.
	const mate = value > 0 ? MATE - value : -MATE - value;
	return {
		depth: field('depth'),
		nps: field('nps'),
		score: unit === 'cp' ? value : mate,
		pv: / pv (.+)$/.exec(line)?.[1].split(' ') ?? []
	};
}
