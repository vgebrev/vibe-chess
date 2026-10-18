// Skin loading (§5.5): fetch + validate the manifest, preload images and fonts in parallel,
// and compute the CSS variables the theme sets. Applying it is the store's job (skin.svelte.ts).
import { validateSkin, type ResultImages, type SkinManifest, type Theme } from './schema.ts';

export interface LoadedSkin {
	manifest: SkinManifest;
	/** Absolute URL of the skin folder, with a trailing slash. */
	baseUrl: string;
	urls: {
		board: string;
		pieces: string;
		moveIndicator: string;
		captureIndicator: string | null;
		emotes: string | null;
		/** The game-over pictures (§4.7.1), as absolute URLs. */
		results: ResultImages | null;
	};
}

export class SkinError extends Error {
	constructor(
		readonly skinUrl: string,
		readonly errors: string[]
	) {
		super(`Invalid skin at ${skinUrl}:\n  ${errors.join('\n  ')}`);
		this.name = 'SkinError';
	}
}

/** Fetch, validate and preload a skin. Throws a SkinError listing every problem. */
export async function loadSkin(baseUrl: string, expectedId?: string): Promise<LoadedSkin> {
	const base = new URL(baseUrl, location.href).href;
	const fail = (...errors: string[]) => new SkinError(base, errors);

	let raw: unknown;
	try {
		const res = await fetch(new URL('skin.json', base));
		if (!res.ok) throw fail(`skin.json: HTTP ${res.status}`);
		raw = await res.json();
	} catch (e) {
		throw e instanceof SkinError ? e : fail(`skin.json: ${(e as Error).message}`);
	}

	const result = validateSkin(raw);
	if (!result.ok) throw fail(...result.errors);
	const manifest = result.skin;
	if (expectedId !== undefined && manifest.id !== expectedId) {
		throw fail(`id: expected "${expectedId}" (the folder name), got "${manifest.id}"`);
	}

	const url = (path: string) => new URL(path, base).href;
	const skin: LoadedSkin = {
		manifest,
		baseUrl: base,
		urls: {
			board: url(manifest.board.image),
			pieces: url(manifest.pieces.image),
			moveIndicator: url(manifest.moveIndicator.image),
			captureIndicator: manifest.captureIndicator && url(manifest.captureIndicator.image),
			emotes: manifest.emotes && url(manifest.emotes.image),
			results: manifest.results && resultUrls(manifest.results, url)
		}
	};

	// Speech bubbles and game-over pictures are only needed later, so they load without holding
	// up the skin.
	const later = [skin.urls.emotes, ...resultImageList(skin.urls.results)];
	for (const src of new Set(later)) if (src) void preloadImage(src).catch(() => {});
	const { board, pieces, moveIndicator, captureIndicator } = skin.urls;
	const images = [board, pieces, moveIndicator, captureIndicator].filter(
		(u): u is string => u !== null
	);
	const fonts = manifest.font.css
		? [loadFontCss(manifest.font.family, manifest.font.css)]
		: manifest.font.files.map((f) =>
				loadFontFile(manifest.font.family, url(f.src), f.weight, f.style)
			);
	const results = await Promise.allSettled([...images.map(preloadImage), ...fonts]);
	const failures = results.flatMap((r) =>
		r.status === 'rejected' ? [String((r.reason as Error).message ?? r.reason)] : []
	);
	if (failures.length > 0) throw fail(...failures);

	return skin;
}

function resultUrls(results: ResultImages, url: (path: string) => string): ResultImages {
	const bySide = (r: Record<'w' | 'b', string> | null) => r && { w: url(r.w), b: url(r.b) };
	return {
		win: bySide(results.win),
		loss: bySide(results.loss),
		resign: bySide(results.resign),
		draw: results.draw && url(results.draw),
		stalemate: results.stalemate && url(results.stalemate)
	};
}

function resultImageList(results: ResultImages | null): (string | null)[] {
	if (!results) return [];
	const { win, loss, resign, draw, stalemate } = results;
	return [...[win, loss, resign].flatMap((r) => (r ? [r.w, r.b] : [])), draw, stalemate];
}

async function preloadImage(src: string): Promise<void> {
	const img = new Image();
	img.src = src;
	try {
		await img.decode();
	} catch {
		throw new Error(`could not load image ${src}`);
	}
}

// One FontFace per file URL for the page's lifetime, so switching skins back and forth
// doesn't stack duplicate faces in document.fonts.
const fontFiles = new Map<string, Promise<void>>();

function loadFontFile(
	family: string,
	src: string,
	weight: number | string,
	style: string
): Promise<void> {
	let p = fontFiles.get(src);
	if (!p) {
		const face = new FontFace(family, `url("${src}")`, { weight: String(weight), style });
		p = face.load().then(
			(f) => void document.fonts.add(f),
			() => {
				fontFiles.delete(src);
				throw new Error(`could not load font ${src}`);
			}
		);
		fontFiles.set(src, p);
	}
	return p;
}

async function loadFontCss(family: string, href: string): Promise<void> {
	if (!document.querySelector(`link[data-skin-font="${CSS.escape(href)}"]`)) {
		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = href;
		link.dataset.skinFont = href;
		await new Promise<void>((resolve, reject) => {
			link.onload = () => resolve();
			link.onerror = () => reject(new Error(`could not load font stylesheet ${href}`));
			document.head.append(link);
		});
	}
	await document.fonts.load(`1em "${family}"`);
}

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** The CSS custom properties a skin sets on :root (§5.4, mapped into Tailwind in app.css). */
export function skinCssVars(manifest: SkinManifest): Record<string, string> {
	const vars: Record<string, string> = {};
	for (const [key, value] of Object.entries(manifest.theme) as [keyof Theme, string][]) {
		vars[`--${kebab(key)}`] = value;
	}
	vars['--skin-font'] = JSON.stringify(manifest.font.family);
	vars['--font-fallback'] = manifest.font.fallback;
	return vars;
}
