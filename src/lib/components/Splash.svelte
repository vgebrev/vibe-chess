<script lang="ts">
	import { fade } from 'svelte/transition';
	import { motion } from '#lib/board/motion.ts';
	import type { Splash } from '#lib/skins/schema.ts';

	interface Props {
		open: boolean;
		/** The skin's picture. */
		image: string;
		/** Where the title goes on the picture, and its colour. */
		splash: Splash;
		/** There is a game in progress to go back to. */
		canContinue: boolean;
		onnew: () => void;
		/** Continue, or Esc: back to the game behind. */
		onclose: () => void;
	}

	let { open, image, splash, canContinue, onnew, onclose }: Props = $props();

	const id = $props.id();
	const { inset, color } = $derived(splash.title);
	const bottom = $derived(splash.buttons.bottom);

	// A modal dialog, like the game-over overlay (§4.7.1). It opens before any input, so the
	// dialog itself takes focus and no focus ring shows until Tab.
	function modal(dialog: HTMLDialogElement) {
		dialog.showModal();
		dialog.focus();
	}

	function oncancel(e: Event) {
		// Esc: close through the parent, so the splash fades out.
		e.preventDefault();
		onclose();
	}

	const button = 'rounded px-5 py-2 shadow-lg disabled:opacity-50 sm:text-lg lg:px-6 lg:text-xl';
</script>

{#if open}
	<dialog
		{@attach modal}
		class="fixed inset-0 m-0 size-full max-h-none max-w-none overflow-hidden bg-transparent p-0 text-text outline-none backdrop:bg-transparent"
		tabindex="-1"
		aria-labelledby="{id}-title"
		{oncancel}
		onclose={() => onclose()}
		transition:fade={{ duration: motion.drawer }}
		data-splash
	>
		<div class="absolute inset-0 bg-bg/85" role="presentation"></div>
		<div class="absolute inset-0 flex items-center justify-center p-4">
			<!-- Shrinks to the picture, so the title and buttons can be placed over it. Below sm the
			     picture is too small to put buttons on, so they go under it. -->
			<div class="relative overflow-hidden rounded-xl bg-surface shadow-lg">
				<!-- The picture alone, so the title's % are of the picture even with buttons below. -->
				<div class="relative">
					<img
						src={image}
						alt=""
						class="block max-h-[calc(100dvh-7rem)] max-w-[min(calc(100vw-2rem),64rem)] sm:max-h-[calc(100dvh-2rem)]"
						data-splash-image
					/>
					<div
						class="[container-type:size] absolute flex items-center justify-center"
						style:top="{inset.top * 100}%"
						style:right="{inset.right * 100}%"
						style:bottom="{inset.bottom * 100}%"
						style:left="{inset.left * 100}%"
					>
						<h2
							id="{id}-title"
							class="text-[min(75cqh,18cqw)] leading-none whitespace-nowrap"
							style:color={color ?? 'var(--text)'}
							data-splash-title
						>
							Vibe Chess
						</h2>
					</div>
				</div>
				<!-- On the picture, a panel keeps the buttons from getting lost in the art. -->
				<div
					class="flex justify-center gap-3 p-3 sm:absolute sm:bottom-(--buttons-bottom) sm:left-1/2 sm:-translate-x-1/2 sm:rounded-xl sm:bg-surface/80 sm:shadow-lg sm:backdrop-blur-sm"
					style:--buttons-bottom="{bottom * 100}%"
					data-splash-buttons
				>
					<button
						class="{button} {canContinue
							? 'bg-surface-raised hover:text-accent'
							: 'bg-accent text-bg'}"
						onclick={onnew}
					>
						New Game
					</button>
					<button
						class="{button} {canContinue
							? 'bg-accent text-bg'
							: 'bg-surface-raised enabled:hover:text-accent'}"
						disabled={!canContinue}
						onclick={onclose}
					>
						Continue
					</button>
				</div>
			</div>
		</div>
	</dialog>
{/if}
