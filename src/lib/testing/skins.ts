// Skins, timing and geometry for component tests, which run in the browser: the fixture skin
// (tests/fixtures/skins/test/, inset 0, every optional default) and Pirate as shipped.
import { loadSkin } from '#lib/skins/loader.ts';
import type { SkinManifest } from '#lib/skins/schema.ts';

let skins: Promise<{ fixture: SkinManifest; pirate: SkinManifest }> | undefined;

/** The fixture and Pirate skins, loaded once per test file. */
export function testSkins() {
	skins ??= Promise.all([
		loadSkin('/tests/fixtures/skins/test/', 'test'),
		loadSkin('/skins/pirate/', 'pirate')
	]).then(([fixture, pirate]) => ({ fixture, pirate }));
	return skins;
}

/** An element's centre in viewport pixels. */
export function centre(el: Element | null): { x: number; y: number } {
	if (!el) throw new Error('element not found');
	const r = el.getBoundingClientRect();
	return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Wait for running animations (slides, fades) to finish. */
export const settle = () => Promise.all(document.getAnimations().map((a) => a.finished));
