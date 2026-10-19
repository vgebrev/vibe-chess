// Skin registry (§5.5): the ids of the skin folders under static/skins/.
// Adding a skin = dropping its folder in static/skins/ and listing its id here.
import { asset } from '$app/paths';

const SKIN_IDS = ['default', 'pirate'] as const;
export type SkinId = (typeof SKIN_IDS)[number];

export const DEFAULT_SKIN_ID: SkinId = 'default';

/** URL of a registered skin's folder, with a trailing slash. */
export function skinBaseUrl(id: SkinId): string {
	// Typed against the static/ file list, so a registered id without a manifest fails `check`.
	return asset(`skins/${id}/skin.json`).replace(/skin\.json$/, '');
}

export interface SkinInfo {
	id: SkinId;
	name: string;
}

let available: Promise<SkinInfo[]> | undefined;

/**
 * The registered skins whose manifests aren't `disabled`, in registry order, with their
 * display names. A manifest that can't be read stays listed under its id, so loading it
 * reports the problem (§5.5).
 */
export function availableSkins(): Promise<SkinInfo[]> {
	available ??= Promise.all(
		SKIN_IDS.map(async (id) => {
			try {
				const res = await fetch(`${skinBaseUrl(id)}skin.json`);
				const { name, disabled } = await res.json();
				if (disabled === true) return null;
				return { id, name: typeof name === 'string' && name ? name : id };
			} catch {
				return { id, name: id };
			}
		})
	).then((skins) => skins.filter((s) => s !== null));
	return available;
}

/**
 * The skins to try at start-up, in order: the saved one if it is still available, then the
 * default, then the rest. With every skin disabled, the default is used anyway.
 */
export function startOrder(saved: string, skins: readonly SkinInfo[]): SkinId[] {
	const ids = skins.map((s) => s.id);
	if (ids.length === 0) return [DEFAULT_SKIN_ID];
	const order = [saved, DEFAULT_SKIN_ID, ...ids].filter((id) => ids.includes(id as SkinId));
	return [...new Set(order)] as SkinId[];
}
