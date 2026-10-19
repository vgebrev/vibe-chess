<script lang="ts">
	import '../app.css';
	import { loadSettings } from '#lib/persistence.ts';
	import { availableSkins, skinBaseUrl, startOrder } from '#lib/skins/index.ts';
	import { skin } from '#lib/skins/skin.svelte.ts';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// The skin must be loaded before the game screen renders (§5.5). It is the saved one if it
	// is still available, else the default or the next available skin that loads (§4.9).
	(async () => {
		const order = startOrder(loadSettings().skinId, await availableSkins());
		for (const id of order) if (await skin.use(skinBaseUrl(id), id)) return;
	})();
</script>

{#if skin.current}
	{@render children()}
{:else if skin.errors.length > 0}
	<main class="p-4">
		<h1 class="text-xl">Could not load the board skin</h1>
		<ul class="mt-2 list-disc pl-6 text-sm">
			{#each skin.errors as error, i (i)}
				<li>{error}</li>
			{/each}
		</ul>
	</main>
{/if}
