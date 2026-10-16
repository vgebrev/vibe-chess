// Parsing of the UCI lines Stockfish prints (§4.6).
import type { Square } from 'chess.js';
import type { MoveInput, PromotionPiece } from '#lib/game/game.svelte.ts';

/** `bestmove e7e8q ponder …` → the move; `bestmove (none)` (no legal move) → null. */
export function parseBestMove(line: string): MoveInput | null {
	const match = /^bestmove ([a-h][1-8])([a-h][1-8])([qrbn])?\b/.exec(line);
	if (!match) return null;
	const [, from, to, promotion] = match;
	const move: MoveInput = { from: from as Square, to: to as Square };
	if (promotion) move.promotion = promotion as PromotionPiece;
	return move;
}

export interface SpinOption {
	name: string;
	default: number;
	min: number;
	max: number;
}

/** `option name UCI_Elo type spin default 1320 min 1320 max 3190` → its range. */
export function parseSpinOption(line: string): SpinOption | null {
	const match = /^option name (.+?) type spin default (-?\d+) min (-?\d+) max (-?\d+)/.exec(line);
	if (!match) return null;
	return { name: match[1], default: +match[2], min: +match[3], max: +match[4] };
}

export interface SearchInfo {
	depth: number;
	nodes: number;
	/** Nodes per second. */
	nps: number;
	/** Milliseconds searched. */
	time: number;
}

/** The search statistics in an `info depth …` line, or null for other info lines. */
export function parseInfo(line: string): SearchInfo | null {
	if (!line.startsWith('info ') || !/ depth \d/.test(line)) return null;
	const field = (name: string) => Number(new RegExp(` ${name} (\\d+)`).exec(line)?.[1] ?? 0);
	return { depth: field('depth'), nodes: field('nodes'), nps: field('nps'), time: field('time') };
}
