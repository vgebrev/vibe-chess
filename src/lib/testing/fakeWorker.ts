// A scripted stand-in for the Stockfish worker, for tests.
import type { EngineWorker } from '#lib/engine/engine.ts';

/** `go` searches until `finish()` or `stop`. */
export class FakeWorker implements EngineWorker {
	onmessage: EngineWorker['onmessage'] = null;
	onerror: EngineWorker['onerror'] = null;
	sent: string[] = [];
	terminated = false;
	searching: string[] = [];
	bestMoves = ['e7e5', 'g8f6', 'b8c6'];
	/** Answer each `go` straight away instead of waiting for `finish()`. */
	instant = false;
	/** The score and expected line each search reports, in turn, after the default ones. */
	infos: { score: number; pv: string[] }[] = [];

	postMessage(command: string) {
		this.sent.push(command);
		if (command === 'uci') {
			this.reply('id name Fake', 'uciok');
		} else if (command === 'isready') this.reply('readyok');
		else if (command.startsWith('go')) {
			this.searching.push(this.bestMoves.shift()!);
			if (this.instant) this.finish();
		} else if (command === 'stop') this.finish();
	}

	/** End the current searches, as the engine does on `stop` or when time is up. */
	finish() {
		for (const move of this.searching.splice(0)) {
			const { score, pv } = this.infos.shift() ?? { score: 20, pv: [move] };
			this.reply(
				`info depth 9 score cp ${score} nodes 5000 nps 250000 time 20 pv ${pv.join(' ')}`,
				`bestmove ${move}`
			);
		}
	}

	reply(...lines: string[]) {
		for (const line of lines)
			queueMicrotask(() => this.onmessage?.({ data: line } as MessageEvent));
	}

	terminate() {
		this.terminated = true;
	}
}
