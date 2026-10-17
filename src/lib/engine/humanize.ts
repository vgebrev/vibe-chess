// Human-like move choice (§4.6.2). The engine plays at full strength and scores the candidate
// moves; this picks one the way a player of the target Elo might. Every move's cost is the
// winning chances it gives up against the best move. A weaker player is less sensitive to
// that cost (a higher "sloppiness" τ) and drawn more to moves that stand out: captures,
// checks, promotions, and moves that look good at a glance. So a blunder is a natural-looking
// move that misses something, not a random one.
//
//   weight = e^(−loss / τ) × salience^s      salience: 1 if the move stands out, else QUIET
import { Chess } from 'chess.js';
import type { Candidate } from './analysis.ts';

/** Expected score (0–1) for the side to move at `cp` centipawns: lichess's win-chance curve. */
export const winChance = (cp: number) => 1 / (1 + Math.exp(-0.00368208 * cp));

export interface Style {
	/** Sloppiness: the cost (in expected score) at which a move's weight drops by e. */
	tau: number;
	/** How strongly moves that stand out are preferred (an exponent; 0 = not at all). */
	salience: number;
}

/**
 * Style per target Elo, tuned with `scripts/calibrate.ts` (§4.6.2). Between anchors τ is
 * interpolated geometrically and the salience exponent linearly; outside them, the end
 * values hold.
 */
export const STYLE_ANCHORS: readonly ({ elo: number } & Style)[] = [
	{ elo: 450, tau: 0.23, salience: 1.15 },
	{ elo: 900, tau: 0.107, salience: 1.07 },
	{ elo: 1350, tau: 0.062, salience: 0.83 },
	{ elo: 1800, tau: 0.039, salience: 0.55 },
	{ elo: 2250, tau: 0.0255, salience: 0.26 },
	{ elo: 3000, tau: 0.011, salience: 0 }
];

/** The weight factor of a move that doesn't stand out, before the salience exponent. */
export const QUIET = 0.4;
/** A move "looks good at a glance" if its shallow score is within this of the best one's. */
export const NATURAL = 0.05;
/**
 * From this Elo up, only the top few moves are scored, so the engine searches deeper. Below
 * it every move is scored: leaving the weak ones out removes mistakes a tier would make, and
 * made 2250 play ~400 Elo above target in calibration.
 */
export const STRONG_ELO = 2600;
export const STRONG_LINES = 6;

export function style(elo: number): Style {
	const anchors = STYLE_ANCHORS;
	if (elo <= anchors[0].elo) return { tau: anchors[0].tau, salience: anchors[0].salience };
	for (let i = 1; i < anchors.length; i++) {
		const [a, b] = [anchors[i - 1], anchors[i]];
		if (elo > b.elo) continue;
		const t = (elo - a.elo) / (b.elo - a.elo);
		return {
			tau: a.tau * (b.tau / a.tau) ** t,
			salience: a.salience + (b.salience - a.salience) * t
		};
	}
	const last = anchors.at(-1)!;
	return { tau: last.tau, salience: last.salience };
}

/** How many moves the engine should score (`MultiPV`) for a player of `elo`. */
export function multiPv(elo: number, legalMoves: number): number {
	return Math.max(1, elo < STRONG_ELO ? legalMoves : Math.min(legalMoves, STRONG_LINES));
}

export interface Weighted extends Candidate {
	/** Expected score given up against the best move, 0–1. */
	loss: number;
	/** A capture, check or promotion. */
	forcing: boolean;
	/** Looks about as good as the best move at a glance. */
	natural: boolean;
	weight: number;
}

/** Weigh the engine's candidates for the side to move in `fen` (§4.6.2). */
export function weigh(fen: string, candidates: readonly Candidate[], elo: number): Weighted[] {
	if (candidates.length === 0) return [];
	const { tau, salience } = style(elo);
	const forcing = new Set(
		new Chess(fen)
			.moves({ verbose: true })
			.filter((m) => m.isCapture() || m.isEnPassant() || m.isPromotion() || /[+#]$/.test(m.san))
			.map((m) => m.from + m.to + (m.promotion ?? ''))
	);
	const best = winChance(Math.max(...candidates.map((c) => c.cp)));
	const bestShallow = winChance(Math.max(...candidates.map((c) => c.shallowCp)));
	return candidates.map((c) => {
		const loss = Math.max(0, best - winChance(c.cp));
		const natural = bestShallow - winChance(c.shallowCp) <= NATURAL;
		const stands = forcing.has(c.uci) || natural;
		const weight = Math.exp(-loss / tau) * (stands ? 1 : QUIET) ** salience;
		return { ...c, loss, forcing: forcing.has(c.uci), natural, weight };
	});
}

/** Pick a move in proportion to its weight. `random` returns [0, 1). Null with no candidates. */
export function chooseMove(
	fen: string,
	candidates: readonly Candidate[],
	elo: number,
	random: () => number
): Weighted | null {
	const weighted = weigh(fen, candidates, elo);
	const total = weighted.reduce((sum, c) => sum + c.weight, 0);
	let r = random() * total;
	for (const c of weighted) {
		r -= c.weight;
		if (r < 0) return c;
	}
	return weighted[0] ?? null;
}

/** A 32-bit FNV-1a hash, to derive a repeatable seed from a game seed and a position. */
export function hash(text: string, seed = 0x811c9dc5): number {
	let h = seed >>> 0;
	for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
	return h;
}
