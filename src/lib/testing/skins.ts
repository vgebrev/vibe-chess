// Skins and timing for component tests, which run in the browser: the fixture skin
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

/** Wait for running animations (slides, fades) to finish. */
export const settle = () => Promise.all(document.getAnimations().map((a) => a.finished));
