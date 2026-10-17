import { describe, expect, it } from 'vitest';
import type { Candidate } from './analysis.ts';
import {
	chooseMove,
	hash,
	multiPv,
	STRONG_LINES,
	STYLE_ANCHORS,
	style,
	weigh,
	winChance
} from './humanize.ts';
import { seeded } from './thinkTime.ts';

// 1. e4 d5, White to move. exd5 grabs a pawn and looks best at a glance, but (in this made-up
// analysis) loses to a deep reply; the quiet Nf3 is really best.
const FEN = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2';
const candidate = (uci: string, cp: number, shallowCp: number): Candidate => ({
	uci,
	move: { from: uci.slice(0, 2), to: uci.slice(2, 4) } as Candidate['move'],
	cp,
	depth: 12,
	shallowCp
});
const CANDIDATES = [
	candidate('g1f3', 50, 20),
	candidate('a2a3', -30, -30),
	candidate('e4d5', -250, 100)
];

/** The chance of each move being picked: its share of the total weight. */
function chances(elo: number) {
	const weighted = weigh(FEN, CANDIDATES, elo);
	const total = weighted.reduce((sum, c) => sum + c.weight, 0);
	return Object.fromEntries(weighted.map((c) => [c.uci, c.weight / total]));
}

describe('humanize (§4.6.2)', () => {
	it('maps centipawns to winning chances', () => {
		expect(winChance(0)).toBe(0.5);
		expect(winChance(300) + winChance(-300)).toBeCloseTo(1);
		expect(winChance(10_000)).toBeCloseTo(1);
	});

	it('takes the anchors at their Elo, interpolates between and holds the ends', () => {
		for (const { elo, tau, salience } of STYLE_ANCHORS) {
			expect(style(elo).tau).toBeCloseTo(tau);
			expect(style(elo).salience).toBeCloseTo(salience);
		}
		const [a, b] = STYLE_ANCHORS;
		const mid = style((a.elo + b.elo) / 2);
		expect(mid.tau).toBeCloseTo(Math.sqrt(a.tau * b.tau));
		expect(mid.salience).toBeCloseTo((a.salience + b.salience) / 2);
		expect(style(100)).toEqual(style(a.elo));
		expect(style(9999)).toEqual(style(STYLE_ANCHORS.at(-1)!.elo));
	});

	it('scores every move for weaker players and the top few for strong ones', () => {
		expect(multiPv(450, 34)).toBe(34);
		expect(multiPv(2250, 34)).toBe(34);
		expect(multiPv(3000, 34)).toBe(STRONG_LINES);
		expect(multiPv(3000, 1)).toBe(1);
	});

	it('weighs each move by its cost, and by whether it stands out', () => {
		const [nf3, a3, exd5] = weigh(FEN, CANDIDATES, 900);
		expect(nf3.loss).toBe(0);
		expect(exd5.loss).toBeCloseTo(winChance(50) - winChance(-250));
		expect(exd5).toMatchObject({ forcing: true, natural: true });
		expect(nf3).toMatchObject({ forcing: false, natural: false });
		expect(a3.weight).toBeLessThan(nf3.weight);
	});

	it('has a beginner grab the poisoned pawn often, and an expert never', () => {
		const beginner = chances(450);
		const expert = chances(2250);
		expect(beginner.e4d5).toBeGreaterThan(0.2);
		expect(beginner.g1f3).toBeLessThan(0.6);
		expect(expert.e4d5).toBeLessThan(0.001);
		expect(expert.g1f3).toBeGreaterThan(0.9);
		// Drawing from the weights follows the same odds.
		const random = seeded(7);
		const n = 500;
		let grabs = 0;
		for (let i = 0; i < n; i++)
			if (chooseMove(FEN, CANDIDATES, 450, random)?.uci === 'e4d5') grabs++;
		expect(grabs / n).toBeCloseTo(beginner.e4d5, 1);
	});

	it('repeats its choice for the same seed', () => {
		const pick = (seed: number) => chooseMove(FEN, CANDIDATES, 900, seeded(hash(FEN, seed)))?.uci;
		const picks = Array.from({ length: 20 }, (_, i) => pick(i));
		expect(Array.from({ length: 20 }, (_, i) => pick(i))).toEqual(picks);
		expect(new Set(picks).size).toBeGreaterThan(1);
	});

	it('has nothing to choose without candidates', () => {
		expect(chooseMove(FEN, [], 900, Math.random)).toBeNull();
	});
});
