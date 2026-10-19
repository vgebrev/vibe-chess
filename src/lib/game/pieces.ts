// Render model for pieces. Each piece gets a stable id when the game starts (e.g. `wn-b1`)
// and keeps it through moves, so the board can animate it (§4.5).
import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';

export interface BoardPiece {
	id: string;
	color: Color;
	type: PieceSymbol;
	square: Square;
}

/** Pieces of a position, each with an id derived from its colour, type and starting square. */
export function piecesFromFen(fen?: string): BoardPiece[] {
	const chess = new Chess(fen);
	return chess
		.board()
		.flat()
		.filter((p) => p !== null)
		.map((p) => ({
			id: `${p.color}${p.type}-${p.square}`,
			color: p.color,
			type: p.type,
			square: p.square
		}));
}

export type MoveRecord = Pick<Move, 'from' | 'to' | 'flags' | 'promotion'>;

/**
 * Pieces after a move, reconciled against chess.js's move record so the mover keeps its id:
 * the captured piece is removed (from its own square for en passant), castling also moves
 * the rook, and a promoted pawn keeps its id with its new type.
 */
export function applyMove(pieces: BoardPiece[], move: MoveRecord): BoardPiece[] {
	const rank = move.from[1];
	let captured: Square | null = null;
	if (move.flags.includes('e')) captured = `${move.to[0]}${rank}` as Square;
	else if (move.flags.includes('c')) captured = move.to;

	let rook: { from: Square; to: Square } | null = null;
	if (move.flags.includes('k')) rook = { from: `h${rank}` as Square, to: `f${rank}` as Square };
	if (move.flags.includes('q')) rook = { from: `a${rank}` as Square, to: `d${rank}` as Square };

	return pieces
		.filter((p) => p.square !== captured)
		.map((p) => {
			if (p.square === move.from) {
				return { ...p, square: move.to, type: move.promotion ?? p.type };
			}
			if (rook && p.square === rook.from) return { ...p, square: rook.to };
			return p;
		});
}
