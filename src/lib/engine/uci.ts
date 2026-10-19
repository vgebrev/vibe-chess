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
}

/** The search statistics in an `info depth …` line, or null for other info lines. */
export function parseInfo(line: string): SearchInfo | null {
	if (!line.startsWith('info ') || !/ depth \d/.test(line)) return null;
	const field = (name: string) => Number(new RegExp(` ${name} (\\d+)`).exec(line)?.[1] ?? 0);
	return { depth: field('depth'), nps: field('nps') };
}
