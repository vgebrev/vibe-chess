import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULTS, isSkinPath, validateSkin } from './schema.ts';

const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const fixture = () => read('tests/fixtures/skins/test/skin.json');

function errorsOf(raw: unknown): string[] {
	const result = validateSkin(raw);
	if (result.ok) throw new Error('expected validation to fail');
	return result.errors;
}

describe('validateSkin', () => {
	it.each(['default', 'pirate'])('accepts the served %s manifest', (id) => {
		const result = validateSkin(read(`static/skins/${id}/skin.json`));
		expect(result.ok && result.skin.id).toBe(id);
	});

	it('accepts a framed board and keeps its inset', () => {
		const result = validateSkin(read('static/skins/pirate/skin.json'));
		expect(result.ok && result.skin.board.inset).toEqual({
			top: 0.059,
			right: 0.06,
			bottom: 0.064,
			left: 0.06
		});
	});

	it('accepts inset 0 and fills every optional field with its default', () => {
		const result = validateSkin(fixture());
		if (!result.ok) throw new Error(result.errors.join('\n'));
		const skin = result.skin;
		expect(skin.board.inset).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
		expect(skin.captureIndicator).toBeNull();
		expect(skin.moveIndicator).toEqual({
			image: 'indicator-move.webp',
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
			{ src: 'font/Marcellus-Regular.woff2', weight: 400, style: 'normal' }
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
		const result = validateSkin(raw);
		expect(result.ok && result.skin.captureIndicator).toEqual({
			image: 'x.webp',
			scale: DEFAULTS.captureIndicatorScale,
			opacity: DEFAULTS.captureOpacity,
			hoverOpacity: DEFAULTS.hoverOpacity
		});
	});

	it('falls back to pieceShadow for each side unless overridden', () => {
		const raw = fixture();
		raw.theme.pieceShadow = 'drop-shadow(0 0 1px red)';
		raw.theme.pieceShadowBlack = 'drop-shadow(0 0 1px white)';
		const result = validateSkin(raw);
		expect(result.ok && result.skin.theme.pieceShadowWhite).toBe('drop-shadow(0 0 1px red)');
		expect(result.ok && result.skin.theme.pieceShadowBlack).toBe('drop-shadow(0 0 1px white)');
	});

	it('overrides the anchor per piece type', () => {
		const raw = fixture();
		raw.pieces.anchorY = 0.02;
		raw.pieces.anchorYFor = { p: 0.07 };
		const result = validateSkin(raw);
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
		const result = validateSkin(raw);
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
