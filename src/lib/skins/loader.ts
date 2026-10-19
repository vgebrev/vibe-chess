// Skin loading (§5.5): fetch + validate the manifest, preload images and fonts in parallel,
// and compute the CSS variables the theme sets. Applying it is the store's job (skin.svelte.ts).
import {
	validateSkin,
	type ResultImages,
	type SkinManifest,
	type Splash,
	type Theme
} from './schema.ts';

export class SkinError extends Error {
	constructor(
		skinUrl: string,
		readonly errors: string[]
	) {
		super(`Invalid skin at ${skinUrl}:\n  ${errors.join('\n  ')}`);
		this.name = 'SkinError';
	}
}

/**
 * Fetch, validate and preload a skin, whose asset paths come back as absolute URLs. Throws a
 * SkinError listing every problem.
 */
export async function loadSkin(baseUrl: string, expectedId?: string): Promise<SkinManifest> {
	const base = new URL(baseUrl, location.href).href;
	const fail = (...errors: string[]) => new SkinError(base, errors);

	// A network error or a manifest that isn't JSON.
	const unreadable = (e: Error): never => {
		throw fail(`skin.json: ${e.message}`);
	};
	const res = await fetch(new URL('skin.json', base)).catch(unreadable);
	if (!res.ok) throw fail(`skin.json: HTTP ${res.status}`);
	const raw: unknown = await res.json().catch(unreadable);

	const result = validateSkin(raw, base);
	if (!result.ok) throw fail(...result.errors);
	const skin = result.skin;
	if (expectedId !== undefined && skin.id !== expectedId) {
		throw fail(`id: expected "${expectedId}" (the folder name), got "${skin.id}"`);
	}

	// Speech bubbles and game-over pictures are only needed later, so they load without holding
	// up the skin. The splash is on screen first, so the picture for this screen holds it up like
	// the board does; the other is left to the <picture> element, should the window change.
	const later = [skin.emotes?.image, ...resultImageList(skin.results)];
	for (const src of new Set(later)) if (src) void preloadImage(src).catch(() => {});
	const images = [
		skin.board.image,
		skin.pieces.image,
		skin.moveIndicator.image,
		skin.captureIndicator?.image,
		splashShown(skin.splash)
	].filter((u): u is string => !!u);
	const { family, css, files } = skin.font;
	const fonts = css
		? [loadFontCss(family, css)]
		: files.map((f) => loadFontFile(family, f.src, f.weight, f.style));
	const results = await Promise.allSettled([...images.map(preloadImage), ...fonts]);
	const failures = results.flatMap((r) =>
		r.status === 'rejected' ? [String((r.reason as Error).message ?? r.reason)] : []
	);
	if (failures.length > 0) throw fail(...failures);

	return skin;
}

/** Screens that show the main splash picture rather than the portrait one: `md` and up (§4.13). */
export const SPLASH_WIDE_MEDIA = '(width >= 48rem)';

/** The splash picture this screen shows (§4.13): portrait below md, if there is one. */
function splashShown(splash: Splash | null): string | null {
	if (!splash?.portrait) return splash?.image ?? null;
	return matchMedia(SPLASH_WIDE_MEDIA).matches ? splash.image : splash.portrait.image;
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

/** A CSS `url()` of a skin asset, quoted so any URL is safe in it. */
export const cssUrl = (url: string) => `url(${JSON.stringify(url)})`;

/**
 * The CSS variables piece sprites read (Sprite.svelte), for the element that holds them: the
 * sheet's URL and its size in cells.
 */
export function piecesSheetStyle(skin: SkinManifest): string {
	const { image, columns, rows } = skin.pieces;
	return `--pieces-url: ${cssUrl(image)}; --sheet-size: ${columns * 100}% ${rows * 100}%`;
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
