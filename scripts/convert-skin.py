"""Skin asset conversion, run by hand when a skin's source art changes.

Reads source art from scratchpad/skins/<id>/assets/ and writes optimised assets next to
the hand-maintained manifest in static/skins/<id>/:

  board.png              -> board.webp (framed boards: resampled so the hand-drawn
                            square edges fall on an even 8x8 grid)
  pieces.png             -> pieces.webp (rows split at transparent gaps, sprites
                            by their outlines, repacked into a clean columns x rows grid
                            of square cells: shared scale, centred on their base,
                            common baseline)
  indicator-move.png     -> indicator-move.webp
  indicator-capture.png  -> indicator-capture.webp (optional)
  emotes.png             -> emotes.webp (optional; speech bubbles on white, on an even
                            grid: background cut out, repacked into square cells)
  result-*.png           -> result-*.webp (optional; game-over pictures: cropped to the art,
                            centred in a square, RESULT_PX)
  splash.png             -> splash.webp (optional; the start screen's picture: opaque,
                            at most SPLASH_PX on its longest side)
  splash-mobile.png      -> splash-mobile.webp (optional; the same, portrait, for phones)
  font/*.ttf             -> font/*.woff2, font/OFL.txt copied
  audio/music/*.mp3      -> audio/music/*.mp3 (stereo, levelled)
  audio/sfx/*.mp3        -> audio/sfx/<event>.mp3 (mono, trimmed, levelled)
  audio/voices/          -> audio/voices/<w|b>-<piece>-<event>-<n>.mp3: one-line recordings
                            are cut at the points in voice-cues.json (scripts/cue-voices.py);
                            files named <colour>-<piece>-<event>[-alt].mp3 are taken as they are

static/skins/<id>/skin.json is never written; it must reference the names above. For audio,
the script prints the manifest's "audio" block to paste in.

Usage: python scripts/convert-skin.py [--only images,fonts,audio] [<skin-id> ...]
Requires: requirements.txt (pillow, fonttools, brotli, numpy, imageio-ffmpeg)
"""

import argparse
import json
import re
import shutil
import statistics
import subprocess
from pathlib import Path

import imageio_ffmpeg
import numpy as np
from fontTools.ttLib import TTFont
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "scratchpad" / "skins"  # source art, not committed
OUT_DIR = ROOT / "static" / "skins"

DETECT_ALPHA = 40  # alpha above this counts as "sprite" when finding gaps
CROP_ALPHA = 8  # alpha above this is kept when cropping (keeps soft edges)
MERGE_GAP_Y = 2  # rows can sit very close together (Marble's gap is 3 px)
CELL_PX = 320  # output size of one piece cell
CELL_PAD = 0.03  # padding around the largest sprite, fraction of the cell
BASE_FRACTION = 0.15  # bottom part of a sprite treated as its base when centring
GRID_SEARCH = 0.18  # how far from the even grid to look for a drawn line, fraction of a square
INDICATOR_PX = 320
RESULT_PX = 512  # output size of a game-over picture
SPLASH_PX = 1920  # longest side of a splash picture; it is shown at most about 64rem wide, 2x on HiDPI
SPLASH_QUALITY = 75  # busy, opaque art that is on screen at first load: a third smaller than at WEBP_QUALITY
RESULT_PAD = 0.04  # padding around a game-over picture's art, fraction of its size
EMOTE_PX = 256  # output size of one speech-bubble cell
EMOTE_WHITE = 232  # every channel at least this counts as the white background around emotes
EMOTE_INK = 40  # luminance of the outline the background is un-blended against
WEBP_QUALITY = 88

CLIP_RATE = 44100  # SFX and voices: mono MP3 at CLIP_BITRATE
CLIP_BITRATE = "64k"
MUSIC_BITRATE = "112k"  # stereo, at the source rate
CLIP_LOUDNESS = -18.0  # target gated RMS, dBFS (one level for SFX and voices; volumes balance them)
MUSIC_LOUDNESS = -20.0
PEAK_LIMIT = -1.0  # never raise a sound's peak above this, dBFS
TRIM_BELOW = -45.0  # clip edges quieter than this (dB under the loudest moment) are trimmed
PRE_ROLL = 0.01  # seconds kept before a clip's first sound
TAIL = 0.10  # and after its last, for decay
FADE_IN = 0.005
FADE_OUT = 0.04
SFX_EVENTS = {"game-start": "start", "castling": "castle", "illegal-move": "illegal", "stalemate": "draw"}
SFX_KNOWN = {"start", "select", "move", "capture", "castle", "promotion", "check", "checkmate", "draw", "illegal", "click"}
SIDES = {"white": "w", "black": "b"}
PIECES = {"king": "k", "queen": "q", "bishop": "b", "knight": "n", "rook": "r", "pawn": "p"}
VOICE_EVENTS = ("move", "capture", "captured", "check", "defeat", "taunt")
VOICE_FILE = re.compile(rf"({'|'.join(SIDES)})-({'|'.join(PIECES)})-({'|'.join(VOICE_EVENTS)})(-alt)?\.mp3")
PARTS = ("images", "fonts", "audio")


def runs(values, min_gap):
    """Return [start, end] runs of truthy values, merging runs separated by < min_gap."""
    out = []
    start = None
    for i, v in enumerate(values):
        if v and start is None:
            start = i
        elif not v and start is not None:
            out.append([start, i - 1])
            start = None
    if start is not None:
        out.append([start, len(values) - 1])
    merged = []
    for r in out:
        if merged and r[0] - merged[-1][1] < min_gap:
            merged[-1][1] = r[1]
        else:
            merged.append(r)
    return merged


def filled_rows(mask):
    """Per row, whether any pixel of a 1-bit mask is set."""
    w, h = mask.size
    return [mask.crop((0, y, w, y + 1)).getbbox() is not None for y in range(h)]


def split_bands(spans, total, expected, what):
    if len(spans) != expected:
        raise SystemExit(f"expected {expected} {what}, found {len(spans)}: {spans}")
    # band boundaries at the midpoint of each gap
    edges = [0]
    for a, b in zip(spans, spans[1:]):
        edges.append((a[1] + b[0]) // 2)
    edges.append(total)
    return list(zip(edges, edges[1:]))


def alpha_mask(im, above):
    """An L mask of the pixels whose alpha is above `above`."""
    return im.getchannel("A").point(lambda v: 255 if v > above else 0)


def resize_rgba(im, size):
    return im.convert("RGBa").resize(size, Image.LANCZOS).convert("RGBA")


def base_centre(sprite):
    """x of the centre of a sprite's base (its bottom BASE_FRACTION), in sprite pixels.

    Centring on the base rather than the whole bounding box keeps pieces that hold
    something out to one side (a sword, a flag) standing in the middle of their square.
    """
    mask = alpha_mask(sprite, DETECT_ALPHA)
    x0, y0, x1, y1 = mask.getbbox()
    band = max(1, round((y1 - y0) * BASE_FRACTION))
    # Median of per-row centres, so a coat or cape flaring into the band doesn't skew it.
    centres = []
    for y in range(y1 - band, y1):
        row = mask.crop((0, y, sprite.width, y + 1)).getbbox()
        if row:
            centres.append((row[0] + row[2]) / 2)
    return statistics.median(centres)


def outlines(band, count):
    """Split one row of the sheet into its `count` sprites by their connected outlines.

    Sprites packed tightly can overlap horizontally (a feather reaching over its neighbour's
    sword) without touching, so a straight cut would clip them. Each sprite is the largest
    connected shapes; stray specks join the sprite whose box is nearest. Returns cropped
    RGBA sprites, left to right.
    """
    w, h = band.size
    alpha = band.getchannel("A").tobytes()
    label = [0] * (w * h)
    shapes = []  # (pixel count, bbox, label)
    for start in range(w * h):
        if alpha[start] <= CROP_ALPHA or label[start]:
            continue
        n = len(shapes) + 1
        label[start] = n
        stack, size = [start], 0
        x0, y0, x1, y1 = w, h, 0, 0
        while stack:
            p = stack.pop()
            size += 1
            x, y = p % w, p // w
            x0, y0, x1, y1 = min(x0, x), min(y0, y), max(x1, x), max(y1, y)
            for q, ok in ((p - 1, x > 0), (p + 1, x < w - 1), (p - w, y > 0), (p + w, y < h - 1)):
                if ok and alpha[q] > CROP_ALPHA and not label[q]:
                    label[q] = n
                    stack.append(q)
        shapes.append((size, (x0, y0, x1, y1), n))
    if len(shapes) < count:
        raise SystemExit(f"expected {count} sprites in a row, found {len(shapes)} shapes")

    seeds = sorted(sorted(shapes, reverse=True)[:count], key=lambda s: s[1][0])
    owner = {seed[2]: i for i, seed in enumerate(seeds)}
    for size, (x0, y0, x1, y1), n in shapes:
        if n in owner:
            continue

        def distance(seed):
            # gap between the boxes, then (where boxes overlap) between their centres
            sx0, sy0, sx1, sy1 = seed[1]
            gap = max(sx0 - x1, x0 - sx1, 0) ** 2 + max(sy0 - y1, y0 - sy1, 0) ** 2
            return gap, (sx0 + sx1 - x0 - x1) ** 2 + (sy0 + sy1 - y0 - y1) ** 2

        owner[n] = min(range(count), key=lambda i: distance(seeds[i]))

    sprites = []
    for i in range(count):
        mask = Image.frombytes("L", (w, h), bytes(255 if v and owner[v] == i else 0 for v in label))
        sprite = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        sprite.paste(band, mask=mask)
        sprites.append(sprite.crop(mask.getbbox()))
    return sprites


def normalise_sheet(path, columns, rows):
    sheet = Image.open(path).convert("RGBA")
    detect = alpha_mask(sheet, DETECT_ALPHA).convert("1")

    row_bands = split_bands(runs(filled_rows(detect), MERGE_GAP_Y), sheet.height, rows, "rows")
    sprites = [outlines(sheet.crop((0, y0, sheet.width, y1)), columns) for y0, y1 in row_bands]  # [row][col]

    centres = [[base_centre(s) for s in row] for row in sprites]
    flat = [(s, cx) for row, crow in zip(sprites, centres) for s, cx in zip(row, crow)]
    # Width needed with the base centred: twice the larger side of the sprite around it.
    largest = max(max(2 * max(cx, s.width - cx), s.height) for s, cx in flat)
    inner = CELL_PX * (1 - 2 * CELL_PAD)
    scale = inner / largest
    pad = round(CELL_PX * CELL_PAD)

    out = Image.new("RGBA", (CELL_PX * columns, CELL_PX * rows), (0, 0, 0, 0))
    for r, row in enumerate(sprites):
        for c, sprite in enumerate(row):
            w = max(1, round(sprite.width * scale))
            h = max(1, round(sprite.height * scale))
            scaled = resize_rgba(sprite, (w, h))
            x = c * CELL_PX + round(CELL_PX / 2 - centres[r][c] * scale)
            y = (r + 1) * CELL_PX - pad - h  # common baseline
            out.alpha_composite(scaled, (x, y))
    return out


def cut_out(im):
    """An image drawn on a white background, with the background made transparent: the near-white
    area connected to the edges goes, and the anti-aliased rim around it is un-blended from white
    so it doesn't leave a pale halo."""
    rgb = np.asarray(im.convert("RGB"), dtype=np.float32)
    light = Image.fromarray(((rgb.min(axis=2) >= EMOTE_WHITE) * 255).astype(np.uint8))
    framed = Image.new("L", (light.width + 2, light.height + 2), 255)  # one fill reaches every edge
    framed.paste(light, (1, 1))
    ImageDraw.floodfill(framed, (0, 0), 128, thresh=0)
    background = np.asarray(framed)[1:-1, 1:-1] == 128
    near = Image.fromarray((background * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))
    rim = (np.asarray(near) > 0) & ~background

    alpha = np.ones(background.shape, np.float32)
    alpha[background] = 0
    lum = rgb.mean(axis=2)
    alpha[rim] = np.clip((255 - lum[rim]) / (255 - EMOTE_INK), 0, 1)
    a = np.maximum(alpha[..., None], 1e-3)
    colour = np.where(rim[..., None], (rgb - 255 * (1 - a)) / a, rgb)
    out = np.dstack([np.clip(colour, 0, 255), alpha * 255]).round().astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def result_picture(path):
    """A game-over picture: cropped to its art, centred in a padded square, RESULT_PX."""
    im = Image.open(path).convert("RGBA")
    art = im.crop(alpha_mask(im, CROP_ALPHA).getbbox())
    side = round(max(art.size) * (1 + 2 * RESULT_PAD))
    square = Image.new("RGBA", (side, side))
    square.paste(art, ((side - art.width) // 2, (side - art.height) // 2))
    return resize_rgba(square, (RESULT_PX, RESULT_PX))


def emote_sheet(path, columns, rows):
    """Speech bubbles on an even grid, cut out and repacked into cells of EMOTE_PX at one
    shared scale, each centred in its cell."""
    sheet = cut_out(Image.open(path))
    cw, ch = sheet.width / columns, sheet.height / rows
    sprites = []
    for r in range(rows):
        for c in range(columns):
            cell = sheet.crop((round(c * cw), round(r * ch), round((c + 1) * cw), round((r + 1) * ch)))
            # Only the bubble around the cell's centre: neighbours' edges can cross the grid lines.
            mask = alpha_mask(cell, 0)
            ImageDraw.floodfill(mask, (cell.width // 2, cell.height // 2), 128, thresh=0)
            own = mask.point(lambda v: 255 if v == 128 else 0)
            cell.putalpha(ImageChops.multiply(cell.getchannel("A"), own))
            sprites.append(cell.crop(own.getbbox()))
    scale = EMOTE_PX * (1 - 2 * CELL_PAD) / max(max(s.size) for s in sprites)
    out = Image.new("RGBA", (EMOTE_PX * columns, EMOTE_PX * rows), (0, 0, 0, 0))
    for i, sprite in enumerate(sprites):
        w, h = round(sprite.width * scale), round(sprite.height * scale)
        x = (i % columns) * EMOTE_PX + (EMOTE_PX - w) // 2
        y = (i // columns) * EMOTE_PX + (EMOTE_PX - h) // 2
        out.alpha_composite(resize_rgba(sprite, (w, h)), (x, y))
    return out


def find_grid_lines(board, start, end, axis):
    """Positions of the 9 square edges along one axis, found as the darkest line near
    each even-grid position. The outer two stay at the inset; only inner lines move."""
    lum = board.convert("L")
    w, h = lum.size
    # Mean luminance per column (axis "x") or row ("y") across the playing area.
    if axis == "x":
        strip = lum.crop((0, round(start[1]), w, round(end[1]))).resize((w, 1), Image.BOX)
        profile = [strip.getpixel((i, 0)) for i in range(w)]
        a0, a1 = start[0], end[0]
    else:
        strip = lum.crop((round(start[0]), 0, round(end[0]), h)).resize((1, h), Image.BOX)
        profile = [strip.getpixel((0, i)) for i in range(h)]
        a0, a1 = start[1], end[1]
    sq = (a1 - a0) / 8
    lines = [a0]
    for i in range(1, 8):
        expected = a0 + i * sq
        lo, hi = round(expected - sq * GRID_SEARCH), round(expected + sq * GRID_SEARCH)
        lines.append(min(range(lo, hi + 1), key=lambda k: profile[k]))
    lines.append(a1)
    return lines, [a0 + i * sq for i in range(9)]


def warp_axis(im, src, dst, axis):
    """Piecewise-linear resample so each src knot moves to its dst knot."""
    w, h = im.size
    size = w if axis == "x" else h
    src, dst = [0, *src, size], [0, *dst, size]
    out = Image.new(im.mode, im.size)
    for s0, s1, d0, d1 in zip(src, src[1:], dst, dst[1:]):
        o0, o1 = round(d0), round(d1)
        if o1 <= o0:
            continue
        if axis == "x":
            out.paste(im.resize((o1 - o0, h), Image.LANCZOS, box=(s0, 0, s1, h)), (o0, 0))
        else:
            out.paste(im.resize((w, o1 - o0), Image.LANCZOS, box=(0, s0, w, s1)), (0, o0))
    return out


def fit_grid(board, inset):
    """Resample a hand-drawn framed board so its square edges sit on an even grid,
    which is what the app assumes when it places pieces (SPEC §5.4)."""
    w, h = board.size
    start = (inset["left"] * w, inset["top"] * h)
    end = (w - inset["right"] * w, h - inset["bottom"] * h)
    for axis in ("x", "y"):
        found, even = find_grid_lines(board, start, end, axis)
        print(f"  board {axis} lines off the even grid (px):", " ".join(f"{f - e:+.0f}" for f, e in zip(found[1:-1], even[1:-1])))
        board = warp_axis(board, found, even, axis)
    return board


def save_webp(im, path, quality=WEBP_QUALITY):
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "WEBP", quality=quality, alpha_quality=100, method=6)


def decode(path, rate=None, channels=1):
    """Float samples, shape (frames, channels), through the bundled ffmpeg."""
    args = [imageio_ffmpeg.get_ffmpeg_exe(), "-v", "error", "-i", str(path), "-f", "f32le", "-ac", str(channels)]
    if rate:
        args += ["-ar", str(rate)]
    raw = subprocess.run([*args, "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, channels).copy()


def encode(samples, rate, path, bitrate):
    path.parent.mkdir(parents=True, exist_ok=True)
    channels = samples.shape[1]
    subprocess.run(
        [imageio_ffmpeg.get_ffmpeg_exe(), "-v", "error", "-y", "-f", "f32le", "-ar", str(rate), "-ac", str(channels), "-i", "-"]
        + ["-map_metadata", "-1", "-c:a", "libmp3lame", "-b:a", bitrate, str(path)],
        input=np.clip(samples, -1, 1).astype(np.float32).tobytes(),
        check=True,
    )


def envelope(samples, rate, window):
    """Per-window loudness in dBFS (RMS over channels)."""
    n = max(1, round(window * rate))
    frames = len(samples) // n
    power = (samples[: frames * n] ** 2).mean(axis=1).reshape(frames, n).mean(axis=1)
    return 10 * np.log10(power + 1e-12), n


def level(samples, rate, target):
    """Gain to `target` gated RMS loudness: the mean power of the 50 ms windows within
    20 dB of the loudest, so pauses don't count. Capped so the peak stays under PEAK_LIMIT."""
    db, _ = envelope(samples, rate, 0.05)
    loud = db[db > db.max() - 20]
    loudness = 10 * np.log10(np.mean(10 ** (loud / 10)))
    peak = 20 * np.log10(np.abs(samples).max() + 1e-12)
    gain = min(target - loudness, PEAK_LIMIT - peak)
    return samples * 10 ** (gain / 20)


def clip(samples, rate):
    """Trim silence from both ends (keeping a little pre-roll and tail), fade, level."""
    db, n = envelope(samples, rate, 0.01)
    sound = np.nonzero(db > db.max() + TRIM_BELOW)[0]
    start = max(0, sound[0] * n - round(PRE_ROLL * rate))
    end = min(len(samples), (sound[-1] + 1) * n + round(TAIL * rate))
    out = samples[start:end].copy()
    fade_in, fade_out = round(FADE_IN * rate), round(FADE_OUT * rate)
    out[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
    out[-fade_out:] *= np.linspace(1, 0, fade_out)[:, None]
    return level(out, rate, CLIP_LOUDNESS)


def convert_audio(src, out):
    """Music, SFX and voices (SPEC §4.11, §5.6). Returns the manifest's "audio" block."""
    audio = out / "audio"
    if audio.exists():
        shutil.rmtree(audio)  # fully generated, so renamed or dropped sounds don't linger
    block = {}

    music = sorted((src / "music").glob("*.mp3"))
    for path in music:
        rate = int(re.search(r"(\d+) Hz", subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-i", str(path)], capture_output=True, text=True).stderr).group(1))
        encode(level(decode(path, channels=2), rate, MUSIC_LOUDNESS), rate, audio / "music" / path.name, MUSIC_BITRATE)
    if music:
        block["music"] = [f"audio/music/{p.name}" for p in music]

    sfx = {}
    for path in sorted((src / "sfx").glob("*.mp3")):
        event = SFX_EVENTS.get(path.stem, path.stem)
        if event not in SFX_KNOWN:
            raise SystemExit(f"unknown SFX {path.name}: expected one of {sorted(SFX_KNOWN)} (or {sorted(SFX_EVENTS)})")
        encode(clip(decode(path, CLIP_RATE), CLIP_RATE), CLIP_RATE, audio / "sfx" / f"{event}.mp3", CLIP_BITRATE)
        sfx[event] = f"audio/sfx/{event}.mp3"
    if sfx:
        block["sfx"] = sfx

    voices = {}  # (side, piece, event) -> [samples, ...]
    folder = src / "voices"
    cues_path = folder / "voice-cues.json"
    cued = json.loads(cues_path.read_text())["files"] if cues_path.exists() else {}
    for name, cue in cued.items():
        samples = decode(folder / name, CLIP_RATE)
        for line in cue["lines"]:
            part = samples[round(line["start"] * CLIP_RATE) : round(line["end"] * CLIP_RATE)]
            voices.setdefault((cue["side"], cue["piece"], line["event"]), []).append(part)
    for path in sorted(folder.glob("*.mp3"), key=lambda p: (p.stem.removesuffix("-alt"), p.stem.endswith("-alt"))):
        if path.name in cued:
            continue
        match = VOICE_FILE.fullmatch(path.name)
        if not match:
            raise SystemExit(f"{path.name}: not in {cues_path.name} and not named <colour>-<piece>-<event>[-alt].mp3")
        colour, piece, event, _ = match.groups()
        voices.setdefault((SIDES[colour], piece, event), []).append(decode(path, CLIP_RATE))
    for (side, piece, event), parts in sorted(voices.items()):
        pool = block.setdefault("voices", {}).setdefault(side, {}).setdefault(PIECES[piece], {}).setdefault(event, [])
        for i, part in enumerate(parts, 1):
            name = f"{side}-{piece}-{event}-{i}.mp3"
            encode(clip(part, CLIP_RATE), CLIP_RATE, audio / "voices" / name, CLIP_BITRATE)
            pool.append(f"audio/voices/{name}")
    return block


def convert(skin_id, parts):
    src = SRC_DIR / skin_id / "assets"
    out = OUT_DIR / skin_id
    out.mkdir(parents=True, exist_ok=True)

    # The served manifest is hand-edited and never written by this script;
    # only the sheet grid sizes and board inset are read from it.
    manifest_path = out / "skin.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    pieces = manifest.get("pieces", {})
    inset = manifest.get("board", {}).get("inset", {})

    print(f"{skin_id}:")
    if "images" in parts:
        convert_images(src, out, pieces, inset, manifest.get("emotes", {}))
    if "fonts" in parts:
        convert_fonts(src, out)
    block = convert_audio(src / "audio", out) if "audio" in parts and (src / "audio").is_dir() else None

    for f in sorted(out.rglob("*")):
        if f.is_file():
            print(f"  {f.relative_to(out)}  {f.stat().st_size / 1024:.0f} KB")
    if block:
        # one line per pool of variations, as in the hand-edited manifest
        text = json.dumps({"audio": block}, indent=2, ensure_ascii=False)[2:-2]
        text = re.sub(r"\[\s+(\"[^\]]*?\")\s+\]", lambda m: "[" + re.sub(r",\s+", ", ", m.group(1)) + "]", text)
        print('  "audio" for skin.json:')
        print(text)


def convert_images(src, out, pieces, inset, emotes):
    board = Image.open(src / "board.png").convert("RGB")
    if any(inset.get(side, 0) > 0 for side in ("top", "right", "bottom", "left")):
        board = fit_grid(board, inset)
    save_webp(board, out / "board.webp")

    sheet = normalise_sheet(src / "pieces.png", pieces.get("columns", 6), pieces.get("rows", 2))
    save_webp(sheet, out / "pieces.webp")

    for name in ("indicator-move", "indicator-capture"):
        if (src / f"{name}.png").exists():
            im = Image.open(src / f"{name}.png").convert("RGBA")
            save_webp(resize_rgba(im, (INDICATOR_PX, INDICATOR_PX)), out / f"{name}.webp")

    for name in ("splash", "splash-mobile"):
        if (src / f"{name}.png").exists():
            splash = Image.open(src / f"{name}.png").convert("RGB")
            scale = SPLASH_PX / max(splash.size)
            if scale < 1:
                splash = splash.resize((round(splash.width * scale), round(splash.height * scale)), Image.LANCZOS)
            save_webp(splash, out / f"{name}.webp", quality=SPLASH_QUALITY)

    for picture in sorted(src.glob("result-*.png")):
        save_webp(result_picture(picture), out / f"{picture.stem}.webp")

    if (src / "emotes.png").exists():
        save_webp(emote_sheet(src / "emotes.png", emotes.get("columns", 4), emotes.get("rows", 2)), out / "emotes.webp")


def convert_fonts(src, out):
    (out / "font").mkdir(exist_ok=True)
    for ttf in (src / "font").glob("*.ttf"):
        tt = TTFont(ttf)
        tt.flavor = "woff2"
        tt.save(out / "font" / (ttf.stem + ".woff2"))
    for lic in (src / "font").glob("OFL.txt"):
        shutil.copy(lic, out / "font" / lic.name)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Convert skin source art (SPEC §5.6).")
    parser.add_argument("skins", nargs="*", help="skin ids (default: every skin with source assets)")
    parser.add_argument("--only", default=",".join(PARTS), help="comma-separated parts to convert")
    args = parser.parse_args()
    parts = set(args.only.split(","))
    if parts - set(PARTS):
        raise SystemExit(f"--only: unknown part(s) {sorted(parts - set(PARTS))}")
    for skin in args.skins or [d.name for d in SRC_DIR.iterdir() if (d / "assets").is_dir()]:
        convert(skin, parts)
