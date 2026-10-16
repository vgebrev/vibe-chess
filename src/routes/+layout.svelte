<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { DEFAULT_SKIN_ID, skinBaseUrl } from '#lib/skins/index.ts';
	import { skin } from '#lib/skins/skin.svelte.ts';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// The skin must be loaded before the game screen renders (§5.5).
	skin.use(skinBaseUrl(DEFAULT_SKIN_ID), DEFAULT_SKIN_ID);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

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
