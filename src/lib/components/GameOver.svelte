<script lang="ts">
	import { cubicOut } from 'svelte/easing';
	import { fade, scale } from 'svelte/transition';
	import { motion } from '#lib/board/motion.ts';
	import { cancelWith, dialogClass, modal } from './dialog.ts';
	import { primary, secondary } from './styles.ts';

	interface Props {
		open: boolean;
		/** The headline, e.g. "Victory!" or "Blue Crew wins!". */
		title: string;
		/** Why the game ended, e.g. "Checkmate". */
		reason: string;
		/** The skin's picture for the outcome, or null for text only. */
		image: string | null;
		onnew: () => void;
		onclose: () => void;
	}

	let { open, title, reason, image, onnew, onclose }: Props = $props();

	const id = $props.id();
</script>

{#if open}
	<!-- Modal, like the drawers (§6.4). New game takes focus only when the game ended from the
	     keyboard; after a tap the dialog itself does, so no focus ring shows. -->
	<dialog
		{@attach modal('keyboard')}
		class={dialogClass}
		tabindex="-1"
		aria-labelledby="{id}-title"
		aria-describedby="{id}-reason"
		oncancel={cancelWith(onclose)}
		onclose={() => onclose()}
		data-game-over
	>
		<!-- Tapping the scrim shows the board, like "View board". -->
		<div
			class="absolute inset-0 bg-(--scrim)"
			role="presentation"
			onclick={onclose}
			transition:fade={{ duration: motion.drawer }}
			data-scrim
		></div>
		<div
			class="pointer-events-none absolute inset-0 flex items-center justify-center p-4"
			transition:scale={{ duration: motion.drawer, start: 0.9, easing: cubicOut }}
		>
			<div
				class="pointer-events-auto flex w-full max-w-sm flex-col items-center gap-2 rounded-xl bg-surface px-6 pt-4 pb-6 text-center shadow-lg"
			>
				{#if image}
					<!-- A soft glow in the accent colour, so dark art stands out from the surface. -->
					<img
						src={image}
						alt=""
						class="glow aspect-square w-[min(16rem,60vw,36dvh)] object-contain"
						data-result-image
					/>
				{/if}
				<h2 id="{id}-title" class="text-4xl text-accent">{title}</h2>
				<p id="{id}-reason" class="text-lg text-muted">{reason}</p>
				<div class="mt-3 flex gap-2">
					<button class={[primary, 'px-4 py-2']} onclick={onnew}>New game</button>
					<button class={[secondary, 'px-4 py-2']} onclick={onclose}>View board</button>
				</div>
			</div>
		</div>
	</dialog>
{/if}

<style>
	.glow {
		background: radial-gradient(
			closest-side,
			color-mix(in srgb, var(--accent) 40%, transparent),
			transparent
		);
	}
</style>
