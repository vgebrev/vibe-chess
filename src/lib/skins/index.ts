// Skin registry (§5.5): the ids of the skin folders under static/skins/.
// Adding a skin = dropping its folder in static/skins/ and listing its id here.
import { asset } from '$app/paths';

export const SKIN_IDS = ['default', 'pirate'] as const;
export type SkinId = (typeof SKIN_IDS)[number];

export const DEFAULT_SKIN_ID: SkinId = 'default';

/** URL of a registered skin's folder, with a trailing slash. */
export function skinBaseUrl(id: SkinId): string {
	// Typed against the static/ file list, so a registered id without a manifest fails `check`.
	return asset(`skins/${id}/skin.json`).replace(/skin\.json$/, '');
}

let names: Promise<Record<SkinId, string>> | undefined;

/** Display names of the registered skins from their manifests, falling back to the id. */
export function skinNames(): Promise<Record<SkinId, string>> {
	names ??= Promise.all(
		SKIN_IDS.map(async (id) => {
			try {
				const res = await fetch(`${skinBaseUrl(id)}skin.json`);
				const { name } = await res.json();
				return [id, typeof name === 'string' && name ? name : id] as const;
			} catch {
				return [id, id] as const;
			}
		})
	).then((entries) => Object.fromEntries(entries) as Record<SkinId, string>);
	return names;
}
