// Move list formatting (§4.7): SAN in numbered pairs.
import type { Color } from 'chess.js';

export interface MoveRow {
	number: number;
	/** Null when the game started with Black to move. */
	white: string | null;
	black: string | null;
}

/** The side to move and move number a FEN starts from. */
function fenStart(fen: string): { color: Color; number: number } {
	const fields = fen.split(' ');
	return { color: fields[1] === 'b' ? 'b' : 'w', number: Number(fields[5]) || 1 };
}

/** SAN moves played from `startFen`, grouped into numbered White/Black pairs. */
export function moveRows(startFen: string, sans: string[]): MoveRow[] {
	const start = fenStart(startFen);
	const rows: MoveRow[] = [];
	const queue = start.color === 'b' ? [null, ...sans] : sans;
	for (let i = 0; i < queue.length; i += 2) {
		rows.push({ number: start.number + i / 2, white: queue[i], black: queue[i + 1] ?? null });
	}
	return rows;
}

/** A move with its number, e.g. "12. Nf3" or "12… Nf6". */
export function numberedMove(startFen: string, index: number, san: string): string {
	const start = fenStart(startFen);
	const ply = index + (start.color === 'b' ? 1 : 0);
	const number = start.number + Math.floor(ply / 2);
	return ply % 2 === 0 ? `${number}. ${san}` : `${number}… ${san}`;
}
