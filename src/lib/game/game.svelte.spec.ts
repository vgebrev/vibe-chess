import { Chess, type Square } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { Game } from './game.svelte.ts';

describe('Game', () => {
	it('lists one target per square, flagging promotions and captures', () => {
		const game = new Game('1r2k3/P7/8/8/8/8/8/4K3 w - - 0 1');
		expect(game.targets('a7')).toEqual([
			{ square: 'a8', capture: false, promotion: true },
			{ square: 'b8', capture: true, promotion: true }
		]);
	});

	it('rejects an illegal move without changing anything', () => {
		const game = new Game();
		const fen = game.fen;
		expect(game.move({ from: 'e2', to: 'e5' })).toBeNull();
		expect(game.fen).toBe(fen);
		expect(game.lastMove).toBeNull();
	});

	it('plays a move and updates the render pieces, turn and last move', () => {
		const game = new Game();
		expect(game.move({ from: 'g1', to: 'f3' })?.san).toBe('Nf3');
		expect(game.turn).toBe('b');
		expect(game.lastMove?.to).toBe('f3');
		expect(game.pieces.find((p) => p.id === 'wn-g1')?.square).toBe('f3');
	});

	it('reports check and checkmate', () => {
		const game = new Game();
		for (const [from, to] of [
			['f2', 'f3'],
			['e7', 'e5'],
			['g2', 'g4'],
			['d8', 'h4']
		] as const) {
			game.move({ from, to });
		}
		expect(game.checkSquare).toBe('e1');
		expect(game.isGameOver).toBe(true);
	});

	it("finds each side's king", () => {
		const game = new Game('4k3/8/8/8/8/8/8/R3K3 w - - 0 1');
		expect(game.kingSquare('w')).toBe('e1');
		expect(game.kingSquare('b')).toBe('e8');
		expect(game.checkSquare).toBeNull();
	});

	it('keeps the move history and derives captures and material from it', () => {
		const game = new Game();
		for (const san of ['e4', 'd5', 'exd5', 'Qxd5']) game.move(sanMove(game, san));
		expect(game.moves.map((m) => m.san)).toEqual(['e4', 'd5', 'exd5', 'Qxd5']);
		expect(game.lastMove?.san).toBe('Qxd5');
		expect(game.captured).toEqual({ w: ['p'], b: ['p'] });
		expect(game.material).toBe(0);
	});
});

/** Translate SAN into the from/to input the board sends. */
function sanMove(game: Game, san: string) {
	const move = new Chess(game.fen).move(san);
	return { from: move.from, to: move.to, promotion: move.promotion as 'q' | undefined };
}

function play(fen: string | undefined, ...sans: string[]) {
	const game = new Game(fen);
	for (const san of sans) expect(game.move(sanMove(game, san))?.san).toBe(san);
	return game;
}

const ids = (game: Game) =>
	Object.fromEntries(game.pieces.map((p) => [p.id, `${p.color}${p.type}@${p.square}`]));

describe('Game.undo', () => {
	// Undo replays the game, so every piece gets its original id back: the mover slides home
	// and a captured piece fades back in where it stood (§4.5).
	const cases: [string, string | undefined, string[]][] = [
		['a quiet move', undefined, ['e4', 'Nf6']],
		['a capture', undefined, ['e4', 'd5', 'exd5']],
		['kingside castling', 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', ['O-O']],
		['queenside castling', 'r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1', ['O-O-O']],
		['en passant', undefined, ['e4', 'a6', 'e5', 'd5', 'exd6']],
		['a promotion', '1n2k3/P7/8/8/8/8/8/4K3 w - - 0 1', ['axb8=Q+']]
	];

	for (const [name, fen, sans] of cases) {
		it(`takes back ${name}, restoring the pieces and their ids`, () => {
			const game = play(fen, ...sans.slice(0, -1));
			const before = { fen: game.fen, pieces: ids(game), moves: game.moves.length };
			game.move(sanMove(game, sans.at(-1)!));
			expect(game.undo()?.san).toBe(sans.at(-1));
			expect(game.fen).toBe(before.fen);
			expect(ids(game)).toEqual(before.pieces);
			expect(game.moves).toHaveLength(before.moves);
		});
	}

	it('does nothing at the start', () => {
		const game = new Game();
		expect(game.canUndo).toBe(false);
		expect(game.undo()).toBeNull();
	});

	it('can take back a checkmate', () => {
		const game = play(undefined, 'f3', 'e5', 'g4', 'Qh4#');
		expect(game.result).toEqual({ winner: 'b', reason: 'checkmate' });
		game.undo();
		expect(game.result).toBeNull();
		expect(game.lastMove?.san).toBe('g4');
	});
});

describe('Game.undoTurn (vs Computer)', () => {
	it("takes back the player's move and the reply", () => {
		const game = play(undefined, 'e4', 'e5', 'Nf3', 'Nc6');
		expect(game.undoTurn('w')).toBe(2);
		expect(game.moves.map((m) => m.san)).toEqual(['e4', 'e5']);
		expect(game.turn).toBe('w');
	});

	it("takes back only the player's move while the reply is pending", () => {
		const game = play(undefined, 'e4', 'e5', 'Nf3');
		expect(game.undoTurn('w')).toBe(1);
		expect(game.turn).toBe('w');
	});

	it("needs a move of the player's to take back", () => {
		const game = play(undefined, 'e4');
		expect(game.canUndoTurn('b')).toBe(false);
		expect(game.undoTurn('b')).toBe(0);
		expect(game.moves).toHaveLength(1);
	});

	it('takes back a checkmate the computer delivered', () => {
		const game = play(undefined, 'f3', 'e5', 'g4', 'Qh4#');
		expect(game.undoTurn('w')).toBe(2);
		expect(game.lastMove?.san).toBe('e5');
	});
});

describe('Game.result', () => {
	it('is null while the game is on', () => {
		expect(new Game().result).toBeNull();
	});

	it('detects each kind of draw', () => {
		expect(play('k7/8/1K6/8/8/8/8/2Q5 w - - 0 1', 'Qc7').result).toEqual({
			winner: 'draw',
			reason: 'stalemate'
		});
		expect(play('4k3/8/8/8/8/8/8/3NK3 w - - 0 1').result?.reason).toBe('insufficient-material');
		expect(play(undefined, 'Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8').result).toEqual({
			winner: 'draw',
			reason: 'repetition'
		});
		expect(play('4k3/8/8/8/8/8/8/R3K3 w - - 99 80', 'Ra2').result).toEqual({
			winner: 'draw',
			reason: 'fifty-move'
		});
	});

	it('ends the game when the side to move resigns, and refuses further moves and undo', () => {
		const game = play(undefined, 'e4');
		game.resign('b');
		expect(game.result).toEqual({ winner: 'w', reason: 'resignation' });
		expect(game.isGameOver).toBe(true);
		expect(game.move({ from: 'e7', to: 'e5' })).toBeNull();
		expect(game.canUndo).toBe(false);
		expect(game.undo()).toBeNull();
	});

	describe('replay (§4.9)', () => {
		const play = (game: Game, moves: [Square, Square][]) =>
			moves.forEach(([from, to]) => game.move({ from, to }));

		it('rebuilds the position and the undo history from the saved moves', () => {
			const game = new Game();
			play(game, [
				['e2', 'e4'],
				['d7', 'd5'],
				['e4', 'd5']
			]);
			game.move({ from: 'd8', to: 'd5' });
			const saved = JSON.parse(JSON.stringify(game.history));

			const restored = Game.replay(game.startFen, saved)!;
			expect(restored.fen).toBe(game.fen);
			expect(restored.pieces).toEqual(game.pieces);
			expect(restored.captured).toEqual({ w: ['p'], b: ['p'] });
			restored.undo();
			restored.undo();
			expect(restored.pieceAt('d5')).toEqual({ type: 'p', color: 'b' });
			expect(restored.pieces.find((p) => p.id === 'bp-d7')?.square).toBe('d5');
		});

		it('saves the moves as from, to and only a real promotion', () => {
			const game = new Game();
			game.move({ from: 'e2', to: 'e4' });
			expect(game.history).toEqual([{ from: 'e2', to: 'e4' }]);
			const promoted = new Game('1n2k3/P7/8/8/8/8/8/4K3 w - - 0 1');
			promoted.move({ from: 'a7', to: 'b8', promotion: 'n' });
			expect(promoted.history).toEqual([{ from: 'a7', to: 'b8', promotion: 'n' }]);
		});

		it('keeps a promotion, a custom start and a resignation', () => {
			const start = '4k3/P7/8/8/8/8/8/R3K3 w - - 0 1';
			const restored = Game.replay(start, [{ from: 'a7', to: 'a8', promotion: 'n' }], 'b')!;
			expect(restored.pieceAt('a8')).toEqual({ type: 'n', color: 'w' });
			expect(restored.result).toEqual({ winner: 'w', reason: 'resignation' });
			expect(restored.canUndo).toBe(false);
		});

		it('gives up on an illegal move or a bad start position', () => {
			expect(Game.replay(new Game().startFen, [{ from: 'e2', to: 'e5' }])).toBeNull();
			expect(Game.replay('not a fen', [])).toBeNull();
		});
	});
});
