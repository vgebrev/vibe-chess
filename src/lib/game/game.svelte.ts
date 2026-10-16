// Game: owns the chess.js instance and exposes reactive state to components, which never
// touch chess.js directly (§7.3).
import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
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

export class Game {
	#chess: Chess;
	// chess.js isn't reactive: every change bumps this, and getters that read chess.js
	// read it first so they re-run.
	#version = $state(0);

	pieces = $state.raw<BoardPiece[]>([]);
	lastMove = $state.raw<Move | null>(null);

	constructor(fen?: string) {
		this.#chess = new Chess(fen);
		this.pieces = piecesFromFen(fen);
	}

	get fen(): string {
		void this.#version;
		return this.#chess.fen();
	}

	get turn(): Color {
		void this.#version;
		return this.#chess.turn();
	}

	get isGameOver(): boolean {
		void this.#version;
		return this.#chess.isGameOver();
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

	/** Play a move. Returns null, changing nothing, if it is illegal. */
	move(input: MoveInput): Move | null {
		let move: Move;
		try {
			move = this.#chess.move(input);
		} catch {
			return null;
		}
		this.pieces = applyMove(this.pieces, move);
		this.lastMove = move;
		this.#version++;
		return move;
	}
}
