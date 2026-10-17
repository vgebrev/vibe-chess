// Parsing of the UCI lines Stockfish prints (§4.6).
import type { Square } from 'chess.js';
import type { MoveInput, PromotionPiece } from '#lib/game/game.svelte.ts';

/** A move in UCI notation (`e7e8q`) → from, to and promotion. */
export function parseUciMove(text: string): MoveInput | null {
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

/** A score from the side to move's point of view: centipawns, or mate in N moves (negative: mated). */
export type Score = { cp: number } | { mate: number };

/** One principal variation from an `info … multipv … score … pv …` line (§4.6.2). */
export interface PvLine {
	depth: number;
	/** 1 for the best line, 2 for the next, … */
	multipv: number;
	score: Score;
	/** A bound means the search of this line was cut short and the score isn't exact. */
	bound: 'lower' | 'upper' | null;
	/** The line's first move, in UCI notation. */
	move: string;
}

/** The principal variation in an `info` line, or null for lines without one. */
export function parsePv(line: string): PvLine | null {
	if (!line.startsWith('info ')) return null;
	const depth = / depth (\d+)/.exec(line);
	const score = / score (cp|mate) (-?\d+)(?: (lowerbound|upperbound))?/.exec(line);
	const pv = / pv (\S+)/.exec(line);
	if (!depth || !score || !pv) return null;
	const multipv = / multipv (\d+)/.exec(line);
	return {
		depth: Number(depth[1]),
		multipv: multipv ? Number(multipv[1]) : 1,
		score: score[1] === 'cp' ? { cp: Number(score[2]) } : { mate: Number(score[2]) },
		bound: score[3] === 'lowerbound' ? 'lower' : score[3] === 'upperbound' ? 'upper' : null,
		move: pv[1]
	};
}
