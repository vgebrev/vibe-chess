// Active skin store: loads a skin, applies its CSS variables and swaps it in one step (§5.5).
import { loadSkin, skinCssVars, SkinError, type LoadedSkin } from './loader.ts';

class SkinStore {
	/** The skin currently applied, or null before the first successful load. */
	current = $state.raw<LoadedSkin | null>(null);
	/** Errors from the last failed load, for display when no skin could be loaded at all. */
	errors = $state.raw<string[]>([]);
	#seq = 0;

	/**
	 * Load and apply a skin. On failure, log the specific errors and stay on the current skin.
	 * A later call supersedes an earlier one that is still loading.
	 */
	async use(baseUrl: string, expectedId?: string): Promise<boolean> {
		const seq = ++this.#seq;
		try {
			const skin = await loadSkin(baseUrl, expectedId);
			if (seq !== this.#seq) return false;
			const style = document.documentElement.style;
			for (const [name, value] of Object.entries(skinCssVars(skin.manifest)))
				style.setProperty(name, value);
			this.current = skin;
			this.errors = [];
			return true;
		} catch (e) {
			const errors = e instanceof SkinError ? e.errors : [String(e)];
			console.error(e instanceof SkinError ? e.message : e);
			if (seq === this.#seq) this.errors = errors;
			return false;
		}
	}
}

export const skin = new SkinStore();
