"""Skin asset conversion, run by hand when a skin's source art changes.

Reads source art from scratchpad/skins/<id>/assets/ and writes optimised assets next to
the hand-maintained manifest in static/skins/<id>/:

  board.png              -> board.webp
  pieces.png             -> pieces.webp (sprites detected by transparent gaps,
                            cropped, repacked into a clean columns x rows grid
                            of square cells: shared scale, centred, common baseline)
  indicator-move.png     -> indicator-move.webp
  indicator-capture.png  -> indicator-capture.webp (optional)
  font/*.ttf             -> font/*.woff2, font/OFL.txt copied

static/skins/<id>/skin.json is never written; it must reference the names above.

Usage: python scripts/convert-skin.py <skin-id> [<skin-id> ...]
Requires: pillow, fonttools, brotli
"""

import json
import shutil
import sys
from pathlib import Path

from fontTools.ttLib import TTFont
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "scratchpad" / "skins"  # source art, not committed
OUT_DIR = ROOT / "static" / "skins"

DETECT_ALPHA = 40  # alpha above this counts as "sprite" when finding gaps
CROP_ALPHA = 8  # alpha above this is kept when cropping (keeps soft edges)
MERGE_GAP_X = 20  # horizontal runs closer than this belong to the same sprite
MERGE_GAP_Y = 2  # rows can sit very close together (Marble's gap is 3 px)
CELL_PX = 320  # output size of one piece cell
CELL_PAD = 0.03  # padding around the largest sprite, fraction of the cell
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


def normalise_sheet(path, columns, rows):
    sheet = Image.open(path).convert("RGBA")
    alpha = sheet.getchannel("A")
    detect = alpha.point(lambda v: 255 if v > DETECT_ALPHA else 0).convert("1")
    keep = alpha.point(lambda v: 255 if v > CROP_ALPHA else 0)

    row_bands = split_bands(runs(projection(detect, 1), MERGE_GAP_Y), sheet.height, rows, "rows")
    sprites = []  # [row][col] -> cropped RGBA
    for y0, y1 in row_bands:
        band = detect.crop((0, y0, sheet.width, y1))
        col_bands = split_bands(runs(projection(band, 0), MERGE_GAP_X), sheet.width, columns, "sprites in a row")
        row = []
        for x0, x1 in col_bands:
            bbox = keep.crop((x0, y0, x1, y1)).getbbox()
            row.append(sheet.crop((x0 + bbox[0], y0 + bbox[1], x0 + bbox[2], y0 + bbox[3])))
        sprites.append(row)

    flat = [s for row in sprites for s in row]
    largest = max(max(s.width, s.height) for s in flat)
    inner = CELL_PX * (1 - 2 * CELL_PAD)
    scale = inner / largest
    pad = round(CELL_PX * CELL_PAD)

    out = Image.new("RGBA", (CELL_PX * columns, CELL_PX * rows), (0, 0, 0, 0))
    for r, row in enumerate(sprites):
        for c, sprite in enumerate(row):
            w = max(1, round(sprite.width * scale))
            h = max(1, round(sprite.height * scale))
            scaled = resize_rgba(sprite, (w, h))
            x = c * CELL_PX + (CELL_PX - w) // 2
            y = (r + 1) * CELL_PX - pad - h  # common baseline
            out.alpha_composite(scaled, (x, y))
    return out


def save_webp(im, path, lossless=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "WEBP", quality=WEBP_QUALITY, alpha_quality=100, method=6, lossless=lossless)
    return path


def convert(skin_id):
    src = SRC_DIR / skin_id / "assets"
    out = OUT_DIR / skin_id
    out.mkdir(parents=True, exist_ok=True)

    # The served manifest is hand-edited and never written by this script;
    # only the sheet grid size is read from it.
    manifest_path = out / "skin.json"
    pieces = json.loads(manifest_path.read_text())["pieces"] if manifest_path.exists() else {}

    save_webp(Image.open(src / "board.png").convert("RGB"), out / "board.webp")

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

    print(f"{skin_id}:")
    for f in sorted(out.rglob("*")):
        if f.is_file():
            print(f"  {f.relative_to(out)}  {f.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    for skin in sys.argv[1:] or [d.name for d in SRC_DIR.iterdir() if (d / "assets").is_dir()]:
        convert(skin)
