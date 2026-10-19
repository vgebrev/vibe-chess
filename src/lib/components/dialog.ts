// The full-screen modal dialogs: drawers, the game-over overlay and the splash (§6.4). Each fills
// the viewport and draws its own scrim and content inside, so both can be animated.

export const dialogClass =
	'fixed inset-0 m-0 size-full max-h-none max-w-none overflow-hidden bg-transparent p-0 text-text outline-none backdrop:bg-transparent';

/**
 * Where focus goes when the dialog opens:
 * - `first`: the browser's choice, the first control;
 * - `dialog`: the dialog itself, so no focus ring shows until Tab;
 * - `keyboard`: the first control if the dialog was opened from the keyboard, else the dialog.
 */
export type DialogFocus = 'first' | 'dialog' | 'keyboard';

/**
 * Attachment that opens a `<dialog>` as modal: the rest of the page goes inert and focus stays
 * inside. Unless the dialog took focus itself, focus goes back to where it was once the dialog
 * has gone, if that is still on the page.
 */
export function modal(focus: DialogFocus = 'first') {
	return (dialog: HTMLDialogElement) => {
		const trigger = document.activeElement;
		const keyboard = trigger?.matches(':focus-visible') ?? false;
		dialog.showModal();
		const self = focus === 'dialog' || (focus === 'keyboard' && !keyboard);
		if (self) dialog.focus();
		return () => {
			if (!self && trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
		};
	};
}

/** The dialog's `cancel` (Esc) handler: close through the parent, so the dialog animates out. */
export const cancelWith = (onclose: () => void) => (e: Event) => {
	e.preventDefault();
	onclose();
};
