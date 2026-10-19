// Guards for reading untrusted JSON (skin manifests, saved state).

export type Obj = Record<string, unknown>;

/** A plain JSON object: not null, not an array. */
export const isObj = (v: unknown): v is Obj =>
	typeof v === 'object' && v !== null && !Array.isArray(v);
