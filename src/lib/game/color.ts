// The two sides.
import type { Color } from 'chess.js';

/** The other side. */
export const other = (color: Color): Color => (color === 'w' ? 'b' : 'w');
