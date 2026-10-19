<script lang="ts">
	import { fade } from 'svelte/transition';
	import { motion } from '#lib/board/motion.ts';
	import { SPLASH_WIDE_MEDIA } from '#lib/skins/loader.ts';
	import type { Splash, SplashLayout } from '#lib/skins/schema.ts';
	import { cancelWith, dialogClass, modal } from './dialog.ts';
	import { primary, secondary } from './styles.ts';

	interface Props {
		open: boolean;
		/**
		 * The skin's pictures (for md and up, and portrait for narrower screens), where the title
		 * and buttons go on each, and the title's colour.
		 */
		splash: Splash;
		/** There is a game in progress to go back to. */
		canContinue: boolean;
		onnew: () => void;
		/** Continue, or Esc: back to the game behind. */
		onclose: () => void;
	}

	let { open, splash, canContinue, onnew, onclose }: Props = $props();

	const id = $props.id();
	/** With a portrait picture, phones get it and their buttons go on it too. */
	const portrait = $derived(splash.portrait !== null);

	// Where the title and buttons go, as CSS variables: the narrow screen's picture (portrait if
	// there is one) unsuffixed, md and up's with -md, switched by breakpoint classes below.
	const place = (layout: SplashLayout, suffix: string) => {
		const { inset, color } = layout.title;
		return [
			`--title-top${suffix}: ${inset.top * 100}%`,
			`--title-right${suffix}: ${inset.right * 100}%`,
			`--title-bottom${suffix}: ${inset.bottom * 100}%`,
			`--title-left${suffix}: ${inset.left * 100}%`,
			`--title-color${suffix}: ${color ?? 'var(--text)'}`,
			`--buttons-bottom${suffix}: ${layout.buttons.bottom * 100}%`
		];
	};
	const vars = $derived(
		[...place(splash.portrait ?? splash, ''), ...place(splash, '-md')].join('; ')
	);

	const button = 'px-5 py-2 shadow-lg disabled:opacity-50 sm:text-lg lg:px-6 lg:text-xl';
</script>

{#if open}
	<!-- Modal, like the game-over overlay (§4.7.1). It opens before any input, so the dialog
	     itself takes focus and no focus ring shows until Tab. -->
	<dialog
		{@attach modal('dialog')}
		class={dialogClass}
		tabindex="-1"
		aria-labelledby="{id}-title"
		oncancel={cancelWith(onclose)}
		onclose={() => onclose()}
		transition:fade={{ duration: motion.drawer }}
		data-splash
	>
		<div class="absolute inset-0 bg-bg/85" role="presentation"></div>
		<div class="absolute inset-0 flex items-center justify-center p-4">
			<!-- Shrinks to the picture, so the title and buttons can be placed over it. Without a
			     portrait picture, the landscape one is too small below sm to put buttons on, so they
			     go under it. -->
			<div class="relative overflow-hidden rounded-xl bg-surface shadow-lg" style={vars}>
				<!-- The picture alone, so the title's % are of the picture even with buttons below. -->
				<div class="relative">
					<!-- Only the picture for this screen is downloaded. -->
					<picture>
						{#if splash.portrait}
							<source media={SPLASH_WIDE_MEDIA} srcset={splash.image} />
						{/if}
						<img
							src={splash.portrait?.image ?? splash.image}
							alt=""
							class="block max-w-[min(calc(100vw-2rem),64rem)] {portrait
								? 'max-h-[calc(100dvh-2rem)]'
								: 'max-h-[calc(100dvh-7rem)] sm:max-h-[calc(100dvh-2rem)]'}"
							data-splash-image
						/>
					</picture>
					<div
						class="[container-type:size] absolute top-(--title-top) right-(--title-right) bottom-(--title-bottom) left-(--title-left) flex items-center justify-center md:top-(--title-top-md) md:right-(--title-right-md) md:bottom-(--title-bottom-md) md:left-(--title-left-md)"
					>
						<h2
							id="{id}-title"
							class="text-[min(75cqh,18cqw)] leading-none whitespace-nowrap text-(--title-color) md:text-(--title-color-md)"
							data-splash-title
						>
							Vibe Chess
						</h2>
					</div>
				</div>
				<!-- On the picture, a panel keeps the buttons from getting lost in the art. -->
				<div
					class="flex w-max justify-center gap-3 p-3 md:bottom-(--buttons-bottom-md) {portrait
						? 'absolute bottom-(--buttons-bottom) left-1/2 -translate-x-1/2 rounded-xl bg-surface/80 shadow-lg backdrop-blur-sm'
						: 'sm:absolute sm:bottom-(--buttons-bottom) sm:left-1/2 sm:-translate-x-1/2 sm:rounded-xl sm:bg-surface/80 sm:shadow-lg sm:backdrop-blur-sm'}"
					data-splash-buttons
				>
					<!-- The main action is Continue when there is a game to go back to. -->
					<button class={[button, canContinue ? secondary : primary]} onclick={onnew}>
						New Game
					</button>
					<button
						class={[button, canContinue ? primary : secondary]}
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
