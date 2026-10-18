// Skin manifest type and validation (SPEC §5.1). Hand-written guard: collects every
// problem with its JSON path so a broken skin.json can be fixed in one pass.

export type PieceType = 'k' | 'q' | 'b' | 'n' | 'r' | 'p';
export type Color = 'w' | 'b';

export const PIECE_TYPES: readonly PieceType[] = ['k', 'q', 'b', 'n', 'r', 'p'];

export interface Inset {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

export interface FontFile {
	src: string;
	weight: number | string;
	style: string;
}

export interface Theme {
	bg: string;
	surface: string;
	surfaceRaised: string;
	text: string;
	textMuted: string;
	accent: string;
	danger: string;
	highlightSelected: string;
	highlightLastMove: string;
	highlightCheck: string;
	coordText: string;
	coordShadow: string;
	/** CSS `filter` on every piece sprite: an outline and/or drop shadow so pieces stand out. */
	pieceShadow: string;
	/** Per-side overrides of `pieceShadow`, e.g. a light rim so dark pieces show on dark squares. */
	pieceShadowWhite: string;
	pieceShadowBlack: string;
	/** Shadow of a dragged piece, as `x y blur color` (used in `drop-shadow()`). */
	dragShadow: string;
	/** Scale of a dragged piece, as a CSS number. */
	dragScale: string;
	scrim: string;
}

/** Generic game sounds (§4.11). */
export type SfxName =
	| 'start'
	| 'select'
	| 'move'
	| 'capture'
	| 'castle'
	| 'promotion'
	| 'check'
	| 'checkmate'
	| 'draw'
	| 'illegal'
	| 'click';
export const SFX_NAMES: readonly SfxName[] = [
	'start',
	'select',
	'move',
	'capture',
	'castle',
	'promotion',
	'check',
	'checkmate',
	'draw',
	'illegal',
	'click'
];

/** What a piece's voice line is about (§4.11). */
export type VoiceEvent = 'move' | 'capture' | 'captured' | 'check' | 'defeat' | 'taunt';
export const VOICE_EVENTS: readonly VoiceEvent[] = [
	'move',
	'capture',
	'captured',
	'check',
	'defeat',
	'taunt'
];

/** Pools of variations per side, piece type and event; any level may be missing. */
export type Voices = Record<
	Color,
	Partial<Record<PieceType, Partial<Record<VoiceEvent, string[]>>>>
>;

/** A skin's sounds, as asset paths (§4.11). Every part is optional. */
export interface SkinAudio {
	music: string[];
	sfx: Partial<Record<SfxName, string>>;
	voices: Voices;
}

/**
 * Speech bubbles shown over a piece while it speaks (§4.11): a sprite sheet, and for each voice
 * event the cells (numbered across, then down) to choose from. An event left out has no bubble.
 */
export interface Emotes {
	image: string;
	columns: number;
	rows: number;
	/** A bubble's width, in squares. */
	scale: number;
	events: Partial<Record<BubbleEvent, number[]>>;
}

/** The events whose speaker is on the board, so can have a bubble. */
export type BubbleEvent = Exclude<VoiceEvent, 'captured'>;

export interface Labels {
	white?: string;
	black?: string;
	difficulty?: Partial<Record<'p0' | 'p1' | 'p2' | 'p3' | 'p4', string>>;
}

/** A validated manifest with every optional field filled with its default. */
export interface SkinManifest {
	manifestVersion: 1;
	id: string;
	name: string;
	/** Left out of the skin choices, though still loadable (§5.5). */
	disabled: boolean;
	board: { image: string; inset: Inset };
	pieces: {
		image: string;
		columns: number;
		rows: number;
		order: PieceType[];
		rowFor: Record<Color, number>;
		scale: number;
		anchorY: number;
		/** Per-type anchor, `anchorY` unless overridden by the manifest's `anchorYFor`. */
		anchorYFor: Record<PieceType, number>;
	};
	moveIndicator: {
		image: string;
		scale: number;
		opacity: number;
		/** Opacity of the target under the pointer or dragged piece. */
		hoverOpacity: number;
		captureScale: number;
	};
	captureIndicator: { image: string; scale: number; opacity: number; hoverOpacity: number } | null;
	font: {
		family: string;
		files: FontFile[];
		css: string | null;
		fallback: string;
		license: string | null;
	};
	coordinates: { fontScale: number; gutter: number };
	theme: Theme;
	labels: Labels;
	/** Null for a silent skin. */
	audio: SkinAudio | null;
	/** Null for no speech bubbles. */
	emotes: Emotes | null;
}

export const DEFAULTS = {
	moveOpacity: 0.75,
	captureOpacity: 0.6,
	hoverOpacity: 0.85,
	captureScale: 1.1,
	captureIndicatorScale: 1,
	fontFallback: 'serif',
	coordFontScale: 0.55,
	coordGutter: 0.35,
	coordShadow: 'none',
	dragScale: '1.15',
	// Thin 0-offset shadows read as an antialiased outline (stacked filters compound, so two
	// make it firmer); the last is a diffuse shadow in cqw (1% of the board width) so it
	// scales with the board.
	pieceShadow:
		'drop-shadow(0 0 1px rgba(0, 0, 0, 0.9)) drop-shadow(0 0 1px rgba(0, 0, 0, 0.9)) drop-shadow(0.25cqw 0.8cqw 1cqw rgba(0, 0, 0, 0.55))'
} as const;

const REQUIRED_THEME_KEYS = [
	'bg',
	'surface',
	'surfaceRaised',
	'text',
	'textMuted',
	'accent',
	'danger',
	'highlightSelected',
	'highlightLastMove',
	'highlightCheck',
	'coordText',
	'dragShadow',
	'scrim'
] as const;

export type ValidationResult = { ok: true; skin: SkinManifest } | { ok: false; errors: string[] };

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * A skin asset path: relative to the skin folder, no scheme, no leading slash, no `..`.
 * Keeps a skin from reaching outside its own folder.
 */
export function isSkinPath(v: unknown): v is string {
	return (
		typeof v === 'string' &&
		/^[\w-]+(\/[\w-]+)*\.[a-z0-9]+$/i.test(v) &&
		!v.split('/').some((part) => part === '..')
	);
}

/** Validate raw `skin.json` content and fill in defaults. */
export function validateSkin(raw: unknown): ValidationResult {
	const errors: string[] = [];
	const err = (path: string, msg: string) => errors.push(`${path}: ${msg}`);

	const obj = (v: unknown, path: string): Obj | null => {
		if (isObj(v)) return v;
		err(path, 'expected an object');
		return null;
	};
	const optObj = (v: unknown, path: string): Obj | null => (v === undefined ? null : obj(v, path));
	const str = (v: unknown, path: string): string => {
		if (typeof v === 'string' && v.trim() !== '') return v;
		err(path, 'expected a non-empty string');
		return '';
	};
	const optStr = (v: unknown, path: string): string | undefined =>
		v === undefined ? undefined : str(v, path);
	const file = (v: unknown, path: string): string => {
		if (isSkinPath(v)) return v;
		err(path, `expected a relative path inside the skin folder, got ${JSON.stringify(v)}`);
		return '';
	};
	const num = (v: unknown, path: string, min: number, max: number, fallback?: number): number => {
		if (v === undefined && fallback !== undefined) return fallback;
		if (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max) return v;
		err(path, `expected a number in [${min}, ${max}]`);
		return fallback ?? min;
	};
	const int = (v: unknown, path: string, min: number, max: number): number => {
		if (Number.isInteger(v) && (v as number) >= min && (v as number) <= max) return v as number;
		err(path, `expected an integer in [${min}, ${max}]`);
		return min;
	};

	const root = obj(raw, '$');
	if (!root) return { ok: false, errors };

	if (root.manifestVersion !== 1) err('manifestVersion', 'expected 1');
	const id = str(root.id, 'id');
	if (id && !/^[a-z0-9-]+$/.test(id)) err('id', 'expected lowercase letters, digits and dashes');
	const name = str(root.name, 'name');
	if (root.disabled !== undefined && typeof root.disabled !== 'boolean')
		err('disabled', 'expected a boolean');
	const disabled = root.disabled === true;

	// board
	const board = obj(root.board, 'board') ?? {};
	const insetRaw = obj(board.inset, 'board.inset') ?? {};
	const inset: Inset = {
		top: num(insetRaw.top, 'board.inset.top', 0, 0.45),
		right: num(insetRaw.right, 'board.inset.right', 0, 0.45),
		bottom: num(insetRaw.bottom, 'board.inset.bottom', 0, 0.45),
		left: num(insetRaw.left, 'board.inset.left', 0, 0.45)
	};
	const boardImage = file(board.image, 'board.image');

	// pieces
	const pieces = obj(root.pieces, 'pieces') ?? {};
	const columns = int(pieces.columns, 'pieces.columns', 1, 12);
	const rows = int(pieces.rows, 'pieces.rows', 1, 12);
	let order: PieceType[] = [];
	if (
		Array.isArray(pieces.order) &&
		pieces.order.length === PIECE_TYPES.length &&
		PIECE_TYPES.every((t) => (pieces.order as unknown[]).includes(t))
	) {
		order = pieces.order as PieceType[];
		if (order.length > columns)
			err('pieces.order', `has ${order.length} entries but only ${columns} columns`);
	} else {
		err('pieces.order', 'expected each of "k", "q", "b", "n", "r", "p" exactly once');
	}
	const rowForRaw = obj(pieces.rowFor, 'pieces.rowFor') ?? {};
	const rowFor = {
		w: int(rowForRaw.w, 'pieces.rowFor.w', 0, rows - 1),
		b: int(rowForRaw.b, 'pieces.rowFor.b', 0, rows - 1)
	};
	const anchorY = num(pieces.anchorY, 'pieces.anchorY', 0, 0.5, 0);
	const anchorYForRaw = optObj(pieces.anchorYFor, 'pieces.anchorYFor') ?? {};
	for (const key of Object.keys(anchorYForRaw)) {
		if (!(PIECE_TYPES as string[]).includes(key))
			err(`pieces.anchorYFor.${key}`, 'unknown piece type');
	}
	const anchorYFor = Object.fromEntries(
		PIECE_TYPES.map((t) => [t, num(anchorYForRaw[t], `pieces.anchorYFor.${t}`, 0, 0.5, anchorY)])
	) as Record<PieceType, number>;
	const piecesOut = {
		image: file(pieces.image, 'pieces.image'),
		columns,
		rows,
		order,
		rowFor,
		scale: num(pieces.scale, 'pieces.scale', 0.1, 1.5, 1),
		anchorY,
		anchorYFor
	};

	// indicators
	const move = obj(root.moveIndicator, 'moveIndicator') ?? {};
	const moveIndicator = {
		image: file(move.image, 'moveIndicator.image'),
		scale: num(move.scale, 'moveIndicator.scale', 0.05, 2, 1),
		opacity: num(move.opacity, 'moveIndicator.opacity', 0, 1, DEFAULTS.moveOpacity),
		hoverOpacity: num(move.hoverOpacity, 'moveIndicator.hoverOpacity', 0, 1, DEFAULTS.hoverOpacity),
		captureScale: num(
			move.captureScale,
			'moveIndicator.captureScale',
			0.05,
			2,
			DEFAULTS.captureScale
		)
	};
	const capture = optObj(root.captureIndicator, 'captureIndicator');
	const captureIndicator = capture && {
		image: file(capture.image, 'captureIndicator.image'),
		scale: num(capture.scale, 'captureIndicator.scale', 0.05, 2, DEFAULTS.captureIndicatorScale),
		opacity: num(capture.opacity, 'captureIndicator.opacity', 0, 1, DEFAULTS.captureOpacity),
		hoverOpacity: num(
			capture.hoverOpacity,
			'captureIndicator.hoverOpacity',
			0,
			1,
			DEFAULTS.hoverOpacity
		)
	};

	// font: bundled files (documented path) or a stylesheet URL for experiments (§5.2)
	const font = obj(root.font, 'font') ?? {};
	const files: FontFile[] = [];
	let css: string | null = null;
	if (Array.isArray(font.files) && font.files.length > 0) {
		font.files.forEach((f, i) => {
			const p = `font.files[${i}]`;
			const fo = obj(f, p);
			if (!fo) return;
			const weight = fo.weight ?? 400;
			if (typeof weight !== 'number' && typeof weight !== 'string')
				err(`${p}.weight`, 'expected a number or string');
			files.push({
				src: file(fo.src, `${p}.src`),
				weight: weight as number | string,
				style: optStr(fo.style, `${p}.style`) ?? 'normal'
			});
		});
	} else if (typeof font.css === 'string' && /^https:\/\//.test(font.css)) {
		css = font.css;
	} else {
		err('font', 'expected a non-empty "files" array or an https "css" URL');
	}
	const fontOut = {
		family: str(font.family, 'font.family'),
		files,
		css,
		fallback: optStr(font.fallback, 'font.fallback') ?? DEFAULTS.fontFallback,
		license: font.license === undefined ? null : file(font.license, 'font.license')
	};

	// coordinates
	const coords = optObj(root.coordinates, 'coordinates') ?? {};
	const coordinates = {
		fontScale: num(coords.fontScale, 'coordinates.fontScale', 0.1, 1, DEFAULTS.coordFontScale),
		gutter: num(coords.gutter, 'coordinates.gutter', 0.1, 1, DEFAULTS.coordGutter)
	};

	// theme
	const themeRaw = obj(root.theme, 'theme') ?? {};
	const theme = {
		coordShadow: DEFAULTS.coordShadow,
		pieceShadow: DEFAULTS.pieceShadow,
		dragScale: DEFAULTS.dragScale
	} as Theme;
	for (const key of REQUIRED_THEME_KEYS) theme[key] = str(themeRaw[key], `theme.${key}`);
	for (const key of ['coordShadow', 'pieceShadow', 'dragScale'] as const) {
		if (themeRaw[key] !== undefined) theme[key] = str(themeRaw[key], `theme.${key}`);
	}
	for (const key of ['pieceShadowWhite', 'pieceShadowBlack'] as const) {
		theme[key] = optStr(themeRaw[key], `theme.${key}`) ?? theme.pieceShadow;
	}

	// labels (all optional, fall back to generic text)
	const labelsRaw = optObj(root.labels, 'labels') ?? {};
	const labels: Labels = {};
	labels.white = optStr(labelsRaw.white, 'labels.white');
	labels.black = optStr(labelsRaw.black, 'labels.black');
	const diff = optObj(labelsRaw.difficulty, 'labels.difficulty');
	if (diff) {
		labels.difficulty = {};
		for (const key of ['p0', 'p1', 'p2', 'p3', 'p4'] as const) {
			const v = optStr(diff[key], `labels.difficulty.${key}`);
			if (v !== undefined) labels.difficulty[key] = v;
		}
	}

	// audio (optional, every part optional; unknown names are errors so a typo isn't silent)
	const audioRaw = optObj(root.audio, 'audio');
	let audio: SkinAudio | null = null;
	if (audioRaw) {
		const files = (v: unknown, path: string): string[] => {
			if (Array.isArray(v) && v.length > 0) return v.map((f, i) => file(f, `${path}[${i}]`));
			err(path, 'expected a non-empty array of paths');
			return [];
		};
		const known = (o: Obj, names: readonly string[], path: string, what: string) => {
			for (const key of Object.keys(o))
				if (!names.includes(key)) err(`${path}.${key}`, `unknown ${what}`);
		};
		audio = { music: [], sfx: {}, voices: { w: {}, b: {} } };
		if (audioRaw.music !== undefined) audio.music = files(audioRaw.music, 'audio.music');
		const sfx = optObj(audioRaw.sfx, 'audio.sfx') ?? {};
		known(sfx, SFX_NAMES, 'audio.sfx', 'sound');
		for (const name of SFX_NAMES)
			if (sfx[name] !== undefined) audio.sfx[name] = file(sfx[name], `audio.sfx.${name}`);
		const voices = optObj(audioRaw.voices, 'audio.voices') ?? {};
		known(voices, ['w', 'b'], 'audio.voices', 'side');
		for (const side of ['w', 'b'] as const) {
			const byPiece = optObj(voices[side], `audio.voices.${side}`) ?? {};
			known(byPiece, PIECE_TYPES, `audio.voices.${side}`, 'piece type');
			for (const type of PIECE_TYPES) {
				const path = `audio.voices.${side}.${type}`;
				const byEvent = optObj(byPiece[type], path);
				if (!byEvent) continue;
				known(byEvent, VOICE_EVENTS, path, 'event');
				const pools: Partial<Record<VoiceEvent, string[]>> = {};
				for (const event of VOICE_EVENTS)
					if (byEvent[event] !== undefined)
						pools[event] = files(byEvent[event], `${path}.${event}`);
				audio.voices[side][type] = pools;
			}
		}
	}

	// emotes (optional): speech bubbles for voice lines
	const emotesRaw = optObj(root.emotes, 'emotes');
	let emotes: Emotes | null = null;
	if (emotesRaw) {
		const columns = int(emotesRaw.columns, 'emotes.columns', 1, 16);
		const rows = int(emotesRaw.rows, 'emotes.rows', 1, 16);
		const events = obj(emotesRaw.events, 'emotes.events') ?? {};
		emotes = {
			image: file(emotesRaw.image, 'emotes.image'),
			columns,
			rows,
			scale: num(emotesRaw.scale, 'emotes.scale', 0.25, 2, 1),
			events: {}
		};
		for (const [event, cells] of Object.entries(events)) {
			const path = `emotes.events.${event}`;
			if (event === 'captured') err(path, 'a captured piece has left the board, so has no bubble');
			else if (!VOICE_EVENTS.includes(event as VoiceEvent)) err(path, 'unknown event');
			else if (!Array.isArray(cells) || cells.length === 0)
				err(path, 'expected a non-empty array of cell numbers');
			else
				emotes.events[event as BubbleEvent] = cells.map((c, i) =>
					int(c, `${path}[${i}]`, 0, columns * rows - 1)
				);
		}
	}

	if (errors.length > 0) return { ok: false, errors };
	return {
		ok: true,
		skin: {
			manifestVersion: 1,
			id,
			name,
			disabled,
			board: { image: boardImage, inset },
			pieces: piecesOut,
			moveIndicator,
			captureIndicator,
			font: fontOut,
			coordinates,
			theme,
			labels,
			audio,
			emotes
		}
	};
}
