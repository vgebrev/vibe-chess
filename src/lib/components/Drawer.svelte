<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import { fade, type TransitionConfig } from 'svelte/transition';
	import { motion } from '#lib/board/motion.ts';
	import { cancelWith, dialogClass, modal } from './dialog.ts';
	import Icon from './Icon.svelte';

	interface Props {
		open: boolean;
		title: string;
		onclose: () => void;
		children: Snippet;
	}

	let { open, title, onclose, children }: Props = $props();

	const id = $props.id();

	/** Swiping down on the handle further than this closes the sheet. */
	const SWIPE_CLOSE_PX = 64;
	let swipe = $state<{ pointer: number; startY: number; dy: number } | null>(null);

	// Up from the bottom below lg, in from the right at lg: the direction comes from CSS
	// variables the breakpoint classes set, so no media query is needed here.
	const sheet: (node: Element) => TransitionConfig = () => ({
		duration: motion.drawer,
		easing: cubicOut,
		css: (_t, u) =>
			`transform: translate(calc(var(--sheet-x) * ${u * 100}%), calc(var(--sheet-y) * ${u * 100}%))`
	});

	function onpointerdown(e: PointerEvent) {
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		swipe = { pointer: e.pointerId, startY: e.clientY, dy: 0 };
	}

	function onpointermove(e: PointerEvent) {
		if (swipe?.pointer === e.pointerId) swipe.dy = Math.max(0, e.clientY - swipe.startY);
	}

	function onpointerup(e: PointerEvent) {
		if (swipe?.pointer !== e.pointerId) return;
		const close = e.type === 'pointerup' && swipe.dy > SWIPE_CLOSE_PX;
		swipe = null;
		if (close) onclose();
	}
</script>

{#if open}
	<!-- Modal (§6.4); the control that opened it gets focus back once it has gone. -->
	<dialog
		{@attach modal()}
		class={dialogClass}
		aria-labelledby="{id}-title"
		oncancel={cancelWith(onclose)}
		onclose={() => onclose()}
		data-drawer
	>
		<!-- Tapping the scrim closes; Esc and the close button cover the keyboard. -->
		<div
			class="absolute inset-0 bg-(--scrim)"
			role="presentation"
			onclick={onclose}
			transition:fade={{ duration: motion.drawer }}
			data-scrim
		></div>
		<div
			class={[
				'absolute inset-x-0 bottom-0 flex max-h-[calc(100dvh-4rem)] flex-col rounded-t-xl bg-surface shadow-lg',
				'[--sheet-x:0] [--sheet-y:1] lg:inset-y-0 lg:right-0 lg:left-auto lg:max-h-none lg:w-96',
				'lg:rounded-none lg:[--sheet-x:1] lg:[--sheet-y:0]',
				// A short swipe springs back.
				!swipe && 'transition-[translate] duration-200 motion-reduce:transition-none'
			]}
			style:translate={swipe ? `0 ${swipe.dy}px` : undefined}
			transition:sheet
			data-sheet
		>
			<!-- Swipe down on the handle to close (narrow screens only). -->
			<div
				class="flex cursor-grab touch-none justify-center pt-2 pb-1 lg:hidden"
				{onpointerdown}
				{onpointermove}
				{onpointerup}
				onpointercancel={onpointerup}
				aria-hidden="true"
				data-handle
			>
				<span class="h-1 w-10 rounded-full bg-muted"></span>
			</div>
			<header class="flex items-center justify-between gap-2 px-4 py-2 lg:pt-4">
				<h2 id="{id}-title" class="text-lg">{title}</h2>
				<button
					class="-mr-2 rounded p-2 text-muted hover:text-accent"
					aria-label="Close"
					onclick={onclose}
				>
					<Icon name="close" />
				</button>
			</header>
			<div class="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
				{@render children()}
			</div>
		</div>
	</dialog>
{/if}
