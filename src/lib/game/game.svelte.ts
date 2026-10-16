// Game: owns the chess.js instance and exposes reactive state to components, which never
// touch chess.js directly (§7.3).
import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import { capturedBy, materialBalance } from './material.ts';
import { applyMove, piecesFromFen, type BoardPiece } from './pieces.ts';

/** A legal destination for the selected piece (§4.3). */
export interface Target {
	square: Square;
	/** Includes en passant, whose captured pawn is not on the target square. */
	capture: boolean;
	/** The move needs a promotion choice. */
	promotion: boolean;
}

export type PromotionPiece = Extract<PieceSymbol, 'q' | 'r' | 'b' | 'n'>;

export interface MoveInput {
	from: Square;
	to: Square;
	promotion?: PromotionPiece;
}

export type EndReason =
	'checkmate' | 'resignation' | 'stalemate' | 'repetition' | 'fifty-move' | 'insufficient-material';

export interface Result {
	winner: Color | 'draw';
	reason: EndReason;
}

const other = (color: Color): Color => (color === 'w' ? 'b' : 'w');

export class Game {
	#chess: Chess;
	// chess.js isn't reactive: every change bumps this, and getters that read chess.js
	// read it first so they re-run.
	#version = $state(0);
	#resigned = $state<Color | null>(null);

	readonly startFen: string;
	pieces = $state.raw<BoardPiece[]>([]);
	/** Moves played so far, oldest first. */
	moves = $state.raw<Move[]>([]);

	constructor(fen?: string) {
		this.#chess = new Chess(fen);
		this.startFen = this.#chess.fen();
		this.pieces = piecesFromFen(fen);
	}

	get lastMove(): Move | null {
		return this.moves.at(-1) ?? null;
	}

	get fen(): string {
		void this.#version;
		return this.#chess.fen();
	}

	get turn(): Color {
		void this.#version;
		return this.#chess.turn();
	}

	/** How the game ended, or null while it is in progress. */
	get result(): Result | null {
		void this.#version;
		const chess = this.#chess;
		if (this.#resigned) return { winner: other(this.#resigned), reason: 'resignation' };
		if (chess.isCheckmate()) return { winner: other(chess.turn()), reason: 'checkmate' };
		if (chess.isStalemate()) return { winner: 'draw', reason: 'stalemate' };
		if (chess.isInsufficientMaterial()) return { winner: 'draw', reason: 'insufficient-material' };
		if (chess.isThreefoldRepetition()) return { winner: 'draw', reason: 'repetition' };
		if (chess.isDrawByFiftyMoves()) return { winner: 'draw', reason: 'fifty-move' };
		return null;
	}

	get isGameOver(): boolean {
		return this.result !== null;
	}

	/** A resignation is final; a game that ended on the board can still be taken back. */
	get canUndo(): boolean {
		return this.moves.length > 0 && !this.#resigned;
	}

	/** The pieces each side has captured (§4.10). */
	get captured(): Record<Color, PieceSymbol[]> {
		return capturedBy(this.moves);
	}

	/** White's material lead on the board; negative when Black is ahead (§4.10). */
	get material(): number {
		return materialBalance(this.pieces);
	}

	/** The square of the king in check, if the side to move is in check. */
	get checkSquare(): Square | null {
		void this.#version;
		if (!this.#chess.inCheck()) return null;
		return this.#chess.findPiece({ type: 'k', color: this.#chess.turn() })[0] ?? null;
	}

	pieceAt(square: Square): { type: PieceSymbol; color: Color } | null {
		void this.#version;
		return this.#chess.get(square) ?? null;
	}

	/** Legal destinations of the piece on `from`, one entry per square. */
	targets(from: Square): Target[] {
		void this.#version;
		const targets: Target[] = [];
		for (const m of this.#chess.moves({ square: from, verbose: true })) {
			// A promotion is four moves to the same square.
			if (targets.some((t) => t.square === m.to)) continue;
			targets.push({
				square: m.to,
				capture: m.isCapture() || m.isEnPassant(),
				promotion: m.isPromotion()
			});
		}
		return targets;
	}

	/** Play a move. Returns null, changing nothing, if it is illegal or the game is over. */
	move(input: MoveInput): Move | null {
		if (this.isGameOver) return null;
		let move: Move;
		try {
			move = this.#chess.move(input);
		} catch {
			return null;
		}
		this.pieces = applyMove(this.pieces, move);
		this.moves = [...this.moves, move];
		this.#version++;
		return move;
	}

	/**
	 * Take back the last move. The pieces are rebuilt by replaying the game from the start,
	 * which gives every piece its original id back, so the mover slides home and a captured
	 * piece reappears where it was (§4.5).
	 */
	undo(): Move | null {
		if (!this.canUndo) return null;
		const move = this.#chess.undo();
		if (!move) return null;
		this.moves = this.moves.slice(0, -1);
		this.pieces = this.moves.reduce(
			(pieces, m) => applyMove(pieces, m),
			piecesFromFen(this.startFen)
		);
		this.#version++;
		return move;
	}

	/** `color` has a move to take back (vs Computer, where Undo takes back the pair). */
	canUndoTurn(color: Color): boolean {
		return this.canUndo && this.moves.some((m) => m.color === color);
	}

	/**
	 * Take back `color`'s last move and any reply to it, so it is their turn again (§4.7).
	 * Returns the number of moves taken back.
	 */
	undoTurn(color: Color): number {
		if (!this.canUndoTurn(color)) return 0;
		let undone = 0;
		do undone += this.undo() ? 1 : 0;
		while (this.turn !== color && this.canUndo);
		return undone;
	}

	/** The side to move resigns (hot-seat), or the given side. */
	resign(color: Color = this.turn) {
		if (this.isGameOver) return;
		this.#resigned = color;
	}
}
