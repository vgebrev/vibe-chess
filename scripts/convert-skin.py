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
  font/*.ttf             -> font/*.woff2, font/OFL.txt copied

static/skins/<id>/skin.json is never written; it must reference the names above.

Usage: python scripts/convert-skin.py <skin-id> [<skin-id> ...]
Requires: pillow, fonttools, brotli
"""

import json
import shutil
import statistics
import sys
from pathlib import Path

from fontTools.ttLib import TTFont
from PIL import Image

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
WEBP_QUALITY = 88


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


def projection(mask, axis):
    """Per-column (axis=0) or per-row (axis=1) 'any pixel set' for a 1-bit mask."""
    w, h = mask.size
    if axis == 0:
        return [mask.crop((x, 0, x + 1, h)).getbbox() is not None for x in range(w)]
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


def resize_rgba(im, size):
    return im.convert("RGBa").resize(size, Image.LANCZOS).convert("RGBA")


def base_centre(sprite):
    """x of the centre of a sprite's base (its bottom BASE_FRACTION), in sprite pixels.

    Centring on the base rather than the whole bounding box keeps pieces that hold
    something out to one side (a sword, a flag) standing in the middle of their square.
    """
    mask = sprite.getchannel("A").point(lambda v: 255 if v > DETECT_ALPHA else 0)
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
    detect = sheet.getchannel("A").point(lambda v: 255 if v > DETECT_ALPHA else 0).convert("1")

    row_bands = split_bands(runs(projection(detect, 1), MERGE_GAP_Y), sheet.height, rows, "rows")
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


def save_webp(im, path, lossless=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "WEBP", quality=WEBP_QUALITY, alpha_quality=100, method=6, lossless=lossless)
    return path


def convert(skin_id):
    src = SRC_DIR / skin_id / "assets"
    out = OUT_DIR / skin_id
    out.mkdir(parents=True, exist_ok=True)

    # The served manifest is hand-edited and never written by this script;
    # only the sheet grid size and board inset are read from it.
    manifest_path = out / "skin.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    pieces = manifest.get("pieces", {})
    inset = manifest.get("board", {}).get("inset", {})

    print(f"{skin_id}:")
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

    (out / "font").mkdir(exist_ok=True)
    for ttf in (src / "font").glob("*.ttf"):
        tt = TTFont(ttf)
        tt.flavor = "woff2"
        tt.save(out / "font" / (ttf.stem + ".woff2"))
    for lic in (src / "font").glob("OFL.txt"):
        shutil.copy(lic, out / "font" / lic.name)

    for f in sorted(out.rglob("*")):
        if f.is_file():
            print(f"  {f.relative_to(out)}  {f.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    for skin in sys.argv[1:] or [d.name for d in SRC_DIR.iterdir() if (d / "assets").is_dir()]:
        convert(skin)
