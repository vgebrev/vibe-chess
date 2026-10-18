<script lang="ts" module>
	// Who and what made the game (§6.3), shown in the Credits drawer.
	export const CREDITS = [
		{ role: 'Meat Proxy', name: 'Veli Gebrev', href: 'https://veli.gebrev.com' },
		{ role: 'Code', name: 'Claude', href: 'https://claude.ai' },
		{ role: 'Graphics', name: 'ChatGPT', href: 'https://chatgpt.com' },
		{ role: 'Music', name: 'Suno', href: 'https://suno.com' },
		{ role: 'Sound Effects', name: 'ElevenLabs', href: 'https://elevenlabs.io' },
		{ role: 'Chess rules', name: 'chess.js', href: 'https://github.com/jhlywa/chess.js' },
		{ role: 'Engine', name: 'stockfish.js', href: 'https://github.com/nmrugg/stockfish.js' }
	] as const;
</script>

<dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 py-2">
	{#each CREDITS as { role, name, href } (role)}
		<dt class="text-muted">{role}</dt>
		<dd>
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external sites -->
			<a {href} target="_blank" rel="noopener noreferrer" class="underline hover:text-accent">
				{name}
			</a>
		</dd>
	{/each}
</dl>
