import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULTS, isSkinPath, validateSkin } from './schema.ts';

const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const fixture = () => read('tests/fixtures/skins/test/skin.json');
/** The skin folder that asset paths resolve against. */
const BASE = 'https://chess.test/skins/test/';
const url = (path: string) => BASE + path;
const validate = (raw: unknown) => validateSkin(raw, BASE);

function errorsOf(raw: unknown): string[] {
	const result = validate(raw);
	if (result.ok) throw new Error('expected validation to fail');
	return result.errors;
}

describe('validateSkin', () => {
	it.each(['default', 'pirate'])('accepts the served %s manifest', (id) => {
		const result = validate(read(`static/skins/${id}/skin.json`));
		expect(result.ok && result.skin.id).toBe(id);
	});

	it('reads the optional disabled flag, enabled by default', () => {
		const ok = (raw: unknown) => {
			const result = validate(raw);
			if (!result.ok) throw new Error(result.errors.join('; '));
			return result.skin;
		};
		expect(ok(fixture()).disabled).toBe(false);
		expect(ok({ ...fixture(), disabled: true }).disabled).toBe(true);
		expect(errorsOf({ ...fixture(), disabled: 'yes' })).toEqual(['disabled: expected a boolean']);
	});

	it('accepts a framed board and keeps its inset', () => {
		const result = validate(read('static/skins/pirate/skin.json'));
		expect(result.ok && result.skin.board.inset).toEqual({
			top: 0.059,
			right: 0.06,
			bottom: 0.064,
			left: 0.06
		});
	});

	it('resolves asset paths against the skin folder', () => {
		const result = validate(fixture());
		if (!result.ok) throw new Error(result.errors.join('\n'));
		expect(result.skin.board.image).toBe('https://chess.test/skins/test/board.webp');
		expect(result.skin.font.license).toBe('https://chess.test/skins/test/font/OFL.txt');
	});

	it('accepts inset 0 and fills every optional field with its default', () => {
		const result = validate(fixture());
		if (!result.ok) throw new Error(result.errors.join('\n'));
		const skin = result.skin;
		expect(skin.board.inset).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
		expect(skin.captureIndicator).toBeNull();
		expect(skin.moveIndicator).toEqual({
			image: url('indicator-move.webp'),
			scale: 1,
			opacity: DEFAULTS.moveOpacity,
			hoverOpacity: DEFAULTS.hoverOpacity,
			captureScale: DEFAULTS.captureScale
		});
		expect(skin.pieces.scale).toBe(1);
		expect(skin.pieces.anchorY).toBe(0);
		expect(skin.coordinates).toEqual({
			fontScale: DEFAULTS.coordFontScale,
			gutter: DEFAULTS.coordGutter
		});
		expect(skin.font.files).toEqual([
			{ src: url('font/Marcellus-Regular.woff2'), weight: 400, style: 'normal' }
		]);
		expect(skin.font.fallback).toBe(DEFAULTS.fontFallback);
		expect(skin.theme.coordShadow).toBe('none');
		expect(skin.theme.pieceShadow).toBe(DEFAULTS.pieceShadow);
		expect(skin.theme.pieceShadowWhite).toBe(DEFAULTS.pieceShadow);
		expect(skin.theme.pieceShadowBlack).toBe(DEFAULTS.pieceShadow);
		expect(skin.pieces.anchorYFor).toEqual({ k: 0, q: 0, b: 0, n: 0, r: 0, p: 0 });
		expect(skin.labels).toEqual({});
	});

	it('defaults the capture indicator opacity when one is given', () => {
		const raw = fixture();
		raw.captureIndicator = { image: 'x.webp' };
		const result = validate(raw);
		expect(result.ok && result.skin.captureIndicator).toEqual({
			image: url('x.webp'),
			scale: DEFAULTS.captureIndicatorScale,
			opacity: DEFAULTS.captureOpacity,
			hoverOpacity: DEFAULTS.hoverOpacity
		});
	});

	it('falls back to pieceShadow for each side unless overridden', () => {
		const raw = fixture();
		raw.theme.pieceShadow = 'drop-shadow(0 0 1px red)';
		raw.theme.pieceShadowBlack = 'drop-shadow(0 0 1px white)';
		const result = validate(raw);
		expect(result.ok && result.skin.theme.pieceShadowWhite).toBe('drop-shadow(0 0 1px red)');
		expect(result.ok && result.skin.theme.pieceShadowBlack).toBe('drop-shadow(0 0 1px white)');
	});

	it('overrides the anchor per piece type', () => {
		const raw = fixture();
		raw.pieces.anchorY = 0.02;
		raw.pieces.anchorYFor = { p: 0.07 };
		const result = validate(raw);
		expect(result.ok && result.skin.pieces.anchorYFor).toEqual({
			k: 0.02,
			q: 0.02,
			b: 0.02,
			n: 0.02,
			r: 0.02,
			p: 0.07
		});

		raw.pieces.anchorYFor = { x: 0.1, p: 0.9 };
		expect(errorsOf(raw).map((e) => e.split(':')[0])).toEqual([
			'pieces.anchorYFor.x',
			'pieces.anchorYFor.p'
		]);
	});

	it('accepts a font stylesheet URL instead of files', () => {
		const raw = fixture();
		raw.font = { family: 'Pirata One', css: 'https://fonts.googleapis.com/css2?family=Pirata+One' };
		const result = validate(raw);
		expect(result.ok && result.skin.font.css).toBe(raw.font.css);
	});

	it.each([
		['board.image', '../board.webp'],
		['board.image', '/skins/test/board.webp'],
		['board.image', 'https://example.com/board.webp'],
		['board.image', 'board'],
		['pieces.image', 'sprites\\pieces.webp'],
		['moveIndicator.image', 42]
	])('rejects a bad path in %s: %j', (path, value) => {
		const raw = fixture();
		const [section, key] = path.split('.');
		raw[section][key] = value;
		expect(errorsOf(raw)).toEqual([
			expect.stringMatching(new RegExp(`^${path.replace('.', '\\.')}: `))
		]);
	});

	it('collects every error with its path', () => {
		const errors = errorsOf(read('tests/fixtures/skins/invalid/skin.json'));
		const paths = errors.map((e) => e.split(':')[0]);
		expect(paths).toEqual(
			expect.arrayContaining([
				'board.inset.left',
				'board.image',
				'pieces.order',
				'font',
				'theme.bg',
				'theme.scrim'
			])
		);
	});

	it('rejects out-of-range numbers and rows outside the sheet', () => {
		const raw = fixture();
		raw.board.inset.top = 0.6;
		raw.pieces.rowFor.b = 2;
		raw.moveIndicator.opacity = 1.5;
		expect(errorsOf(raw).map((e) => e.split(':')[0])).toEqual([
			'board.inset.top',
			'pieces.rowFor.b',
			'moveIndicator.opacity'
		]);
	});

	it('rejects a wrong manifest version and a non-object', () => {
		expect(errorsOf({ ...fixture(), manifestVersion: 2 })).toEqual(['manifestVersion: expected 1']);
		expect(errorsOf(null)).toEqual(['$: expected an object']);
		expect(errorsOf([])).toEqual(['$: expected an object']);
	});
});

describe('validateSkin: audio (§4.11)', () => {
	const audioOf = (raw: unknown) => {
		const result = validate(raw);
		if (!result.ok) throw new Error(result.errors.join('; '));
		return result.skin.audio;
	};

	it('reads the Pirate sounds', () => {
		const audio = audioOf(read('static/skins/pirate/skin.json'))!;
		expect(audio.music).toHaveLength(7);
		expect(Object.keys(audio.sfx).sort()).toEqual([
			'capture',
			'castle',
			'check',
			'checkmate',
			'click',
			'draw',
			'illegal',
			'move',
			'promotion',
			'select',
			'start'
		]);
		const pools = (['w', 'b'] as const).flatMap((side) =>
			Object.values(audio.voices[side]).flatMap((byEvent) => Object.values(byEvent))
		);
		expect(pools.flat()).toHaveLength(108);
		expect(audio.voices.w.k?.check).toEqual([
			url('audio/voices/w-king-check-1.mp3'),
			url('audio/voices/w-king-check-2.mp3')
		]);
		expect(audio.voices.b.n?.taunt).toBeUndefined();
	});

	it('is null for a silent skin, and every part is optional', () => {
		expect(audioOf(fixture())).toBeNull();
		expect(audioOf({ ...fixture(), audio: {} })).toEqual({
			music: [],
			sfx: {},
			voices: { w: {}, b: {} }
		});
	});

	it('reports unknown names and bad pools with their paths', () => {
		expect(
			errorsOf({
				...fixture(),
				audio: {
					music: [],
					sfx: { moves: 'a.mp3', check: '../c.mp3' },
					voices: { white: {}, w: { x: {}, k: { shout: ['a.mp3'], move: [] } } }
				}
			})
		).toEqual([
			'audio.music: expected a non-empty array of paths',
			'audio.sfx.moves: unknown sound',
			'audio.sfx.check: expected a relative path inside the skin folder, got "../c.mp3"',
			'audio.voices.white: unknown side',
			'audio.voices.w.x: unknown piece type',
			'audio.voices.w.k.shout: unknown event',
			'audio.voices.w.k.move: expected a non-empty array of paths'
		]);
	});
});

describe('validateSkin emotes (§4.11)', () => {
	const emotesOf = (raw: unknown) => {
		const result = validate(raw);
		if (!result.ok) throw new Error(result.errors.join('\n'));
		return result.skin.emotes;
	};

	it("reads Pirate's speech bubbles", () => {
		expect(emotesOf(read('static/skins/pirate/skin.json'))).toEqual({
			image: url('emotes.webp'),
			columns: 4,
			rows: 2,
			scale: 1.3,
			events: { taunt: [0, 1, 2, 6] }
		});
	});

	it('is null without bubbles, and reports bad events and cells', () => {
		expect(emotesOf(fixture())).toBeNull();
		expect(
			errorsOf({
				...fixture(),
				emotes: {
					image: 'e.webp',
					columns: 2,
					rows: 1,
					events: { captured: [0], shout: [0], move: [], taunt: [1, 2] }
				}
			})
		).toEqual([
			'emotes.events.captured: a captured piece has left the board, so has no bubble',
			'emotes.events.shout: unknown event',
			'emotes.events.move: expected a non-empty array of cell numbers',
			'emotes.events.taunt[1]: expected an integer in [0, 1]'
		]);
	});
});

describe('validateSkin results (§4.7.1)', () => {
	const resultsOf = (raw: unknown) => {
		const result = validate(raw);
		if (!result.ok) throw new Error(result.errors.join('\n'));
		return result.skin.results;
	};

	it('reads one picture for both sides, or one per winning side', () => {
		expect(resultsOf(fixture())).toBeNull();
		expect(
			resultsOf({
				...fixture(),
				results: { win: { w: 'win-w.webp', b: 'win-b.webp' }, loss: 'loss.webp', draw: 'd.webp' }
			})
		).toEqual({
			win: { w: url('win-w.webp'), b: url('win-b.webp') },
			loss: { w: url('loss.webp'), b: url('loss.webp') },
			resign: null,
			draw: url('d.webp'),
			stalemate: null
		});
	});

	it('reports bad paths and unknown results', () => {
		expect(
			errorsOf({
				...fixture(),
				results: { win: { w: 'win.webp' }, draw: '../d.webp', tie: 't.webp' }
			})
		).toEqual([
			'results.tie: unknown result',
			'results.win.b: expected a relative path inside the skin folder, got undefined',
			'results.draw: expected a relative path inside the skin folder, got "../d.webp"'
		]);
	});
});

describe('validateSkin splash (§4.13)', () => {
	const splashOf = (raw: unknown) => {
		const result = validate(raw);
		if (!result.ok) throw new Error(result.errors.join('\n'));
		return result.skin.splash;
	};
	const inset = { top: 0.1, right: 0.3, bottom: 0.75, left: 0.3 };

	it('reads the picture and the title area, the colour optional', () => {
		expect(splashOf(fixture())).toBeNull();
		expect(splashOf({ ...fixture(), splash: { image: 's.webp', title: { inset } } })).toEqual({
			image: url('s.webp'),
			title: { inset, color: null },
			buttons: { bottom: DEFAULTS.splashButtonsBottom },
			portrait: null
		});
		expect(
			splashOf({
				...fixture(),
				splash: { image: 's.webp', title: { inset }, buttons: { bottom: 0.2 } }
			})?.buttons.bottom
		).toBe(0.2);
		expect(
			splashOf({ ...fixture(), splash: { image: 's.webp', title: { inset, color: '#432' } } })
				?.title.color
		).toBe('#432');
	});

	it('reads a portrait picture, whose title colour defaults to the main one', () => {
		const portrait = splashOf({
			...fixture(),
			splash: {
				image: 's.webp',
				title: { inset, color: '#432' },
				portrait: { image: 'p.webp', title: { inset }, buttons: { bottom: 0.06 } }
			}
		})?.portrait;
		expect(portrait).toEqual({
			image: url('p.webp'),
			title: { inset, color: '#432' },
			buttons: { bottom: 0.06 }
		});
		expect(
			errorsOf({
				...fixture(),
				splash: { image: 's.webp', title: { inset }, portrait: { title: {} } }
			})
		).toEqual([
			'splash.portrait.title.inset: expected an object',
			'splash.portrait.title.inset.top: expected a number in [0, 0.95]',
			'splash.portrait.title.inset.right: expected a number in [0, 0.95]',
			'splash.portrait.title.inset.bottom: expected a number in [0, 0.95]',
			'splash.portrait.title.inset.left: expected a number in [0, 0.95]',
			'splash.portrait.image: expected a relative path inside the skin folder, got undefined'
		]);
	});

	it('reports a missing picture, a bad inset and an area with no room', () => {
		expect(errorsOf({ ...fixture(), splash: { title: { inset } } })).toEqual([
			'splash.image: expected a relative path inside the skin folder, got undefined'
		]);
		expect(
			errorsOf({
				...fixture(),
				splash: { image: 's.webp', title: { inset: { ...inset, top: -1, left: 0.7 } } }
			})
		).toEqual([
			'splash.title.inset.top: expected a number in [0, 0.95]',
			'splash.title.inset: leaves no room for the title'
		]);
	});
});

describe('isSkinPath', () => {
	it.each(['board.webp', 'font/PirataOne-Regular.woff2', 'a/b/c_d-e.png'])('accepts %s', (p) => {
		expect(isSkinPath(p)).toBe(true);
	});
	it.each([
		'',
		'..',
		'../x.webp',
		'a/../x.webp',
		'/x.webp',
		'x',
		'C:/x.webp',
		'a//b.webp',
		'a b.webp'
	])('rejects %j', (p) => {
		expect(isSkinPath(p)).toBe(false);
	});
});
