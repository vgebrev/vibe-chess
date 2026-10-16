// Render model for pieces. Each piece gets a stable id when the game starts (e.g. `wn-b1`)
// so later moves can keep its identity for animation (§4.5, reconciliation lands in M4).
import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';

export interface BoardPiece {
	id: string;
	color: Color;
	type: PieceSymbol;
	square: Square;
	leaving?: boolean;
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
