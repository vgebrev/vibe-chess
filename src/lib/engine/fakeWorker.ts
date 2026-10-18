// A scripted stand-in for the Stockfish worker, for tests.
import type { EngineWorker } from './engine.ts';

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
			this.reply('info depth 9 nodes 5000 nps 250000 time 20', `bestmove ${move}`);
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
