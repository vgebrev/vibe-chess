// Small numeric helpers.

/** `x` limited to [min, max]. */
export const clamp = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));
