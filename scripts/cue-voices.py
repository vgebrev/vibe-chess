"""Find where each recorded voice line starts and ends, run by hand once per recording.

Spoken characters' lines are recorded as one file per side and piece (white-king.mp3),
with the script in a CSV in the same folder: colour,piece,action,line, in recording order.
This transcribes each file with Whisper, aligns the words with the script, cuts in the
quietest point between consecutive lines, then transcribes every cut on its own to check
it holds its line. The cut points go to voice-cues.json next to the CSV, which
convert-skin.py reads, so the converter itself doesn't need Whisper.

Reads and writes scratchpad/skins/<id>/assets/audio/voices/ (SPEC §5.6).

Usage: python scripts/cue-voices.py <skin-id>
Requires: requirements.txt plus requirements-cues.txt (faster-whisper; downloads the
medium.en model, about 1.5 GB, on first run)
"""

import csv
import difflib
import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

import imageio_ffmpeg
import numpy as np
from faster_whisper import WhisperModel

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "scratchpad" / "skins"
CUES = "voice-cues.json"

RATE = 16000  # Whisper's sample rate; cut points are in seconds, so this needn't match the source
WINDOW = 0.02  # loudness window when looking for the quietest point between lines
MIN_GAP = 0.1  # word timings closer than this get widened by GAP_PAD to search for the pause
GAP_PAD = 0.15
CHECK_RATIO = 0.75  # a re-transcribed cut matching its line less than this is flagged
SIDES = {"white": "w", "black": "b"}
EVENTS = {"checkmate_defeat": "defeat"}  # CSV action -> manifest event (SPEC §5.1)


def decode(path, rate=RATE):
    """Mono float samples at `rate`, through the bundled ffmpeg."""
    raw = subprocess.run(
        [imageio_ffmpeg.get_ffmpeg_exe(), "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", str(rate), "-"],
        capture_output=True,
        check=True,
    ).stdout
    return np.frombuffer(raw, np.float32)


def letters(text):
    """Lowercase a-z only, accents folded, so script and transcript spellings compare."""
    folded = unicodedata.normalize("NFKD", text.lower()).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z]", "", folded)


def read_script(path):
    """Script rows grouped by recording, in order. A line with an unquoted comma spills
    into extra columns, which are joined back on."""
    groups = {}
    with open(path, encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            line = ",".join([row["line"], *row.get(None, [])]).strip()
            line = re.sub(r",\s*", ", ", line)
            key = f"{row['colour'].strip()}-{row['piece'].strip()}"
            groups.setdefault(key, []).append({"event": EVENTS.get(row["action"], row["action"]), "line": line})
    return groups


def first_words(script, words):
    """Index of the transcribed word each script line starts at, by aligning the letters
    of the whole script with the letters of the transcript."""
    heard, owner = "", []
    for i, (_, _, word) in enumerate(words):
        text = letters(word)
        heard += text
        owner += [i] * len(text)
    text, starts = "", []
    for entry in script:
        starts.append(len(text))
        text += letters(entry["line"])
    blocks = difflib.SequenceMatcher(None, text, heard, autojunk=False).get_matching_blocks()

    def heard_at(p):
        for a, b, n in blocks:
            if n and a <= p < a + n:
                return b + p - a
            if n and a > p:  # unmatched letters: take the next match
                return b
        return len(heard) - 1

    found = [owner[heard_at(p)] for p in starts]
    if found != sorted(set(found)):
        raise SystemExit(f"could not align the script with the recording: line starts at words {found}")
    return found


def cut_points(samples, words, firsts):
    """Seconds to cut at: the quietest WINDOW between each line's last word and the next
    line's first, so a cut never lands inside a word."""
    win = round(WINDOW * RATE)
    loudness = np.sqrt(np.convolve(samples * samples, np.ones(win) / win, "same"))
    cuts = [0.0]
    for k in firsts[1:]:
        lo, hi = words[k - 1][1], words[k][0]
        if hi - lo < MIN_GAP:
            lo, hi = min(lo, hi) - GAP_PAD, max(lo, hi) + GAP_PAD
        a, b = round(lo * RATE), round(hi * RATE)
        cuts.append(round((a + int(np.argmin(loudness[a:b]))) / RATE, 3))
    cuts.append(round(len(samples) / RATE, 3))
    return cuts


def cue(skin_id):
    folder = SRC_DIR / skin_id / "assets" / "audio" / "voices"
    scripts = sorted(folder.glob("*.csv"))
    if len(scripts) != 1:
        raise SystemExit(f"expected one script CSV in {folder}, found {len(scripts)}")
    groups = read_script(scripts[0])
    model = WhisperModel("medium.en", device="cpu", compute_type="int8")

    def transcribe(samples, words=False):
        segments, _ = model.transcribe(samples, beam_size=5, language="en", word_timestamps=words)
        return list(segments)

    cues, flagged = {"script": scripts[0].name, "files": {}}, 0
    for name, script in groups.items():
        colour, piece = name.split("-", 1)
        path = folder / f"{name}.mp3"
        samples = decode(path)
        words = [(w.start, w.end, w.word) for s in transcribe(samples, words=True) for w in s.words]
        cuts = cut_points(samples, words, first_words(script, words))
        lines = []
        print(f"{path.name}:")
        for entry, start, end in zip(script, cuts, cuts[1:]):
            heard = "".join(s.text for s in transcribe(samples[round(start * RATE) : round(end * RATE)])).strip()
            match = difflib.SequenceMatcher(None, letters(entry["line"]), letters(heard)).ratio()
            flag = match < CHECK_RATIO
            flagged += flag
            print(f"  {'!!' if flag else '  '} {start:6.2f}-{end:6.2f}  {entry['event']:9} {entry['line']!r:38} heard {heard!r}")
            lines.append({**entry, "start": start, "end": end})
        cues["files"][path.name] = {"side": SIDES[colour], "piece": piece, "lines": lines}

    (folder / CUES).write_text(json.dumps(cues, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {folder / CUES}" + (f"; {flagged} cut(s) flagged !!, check them by ear" if flagged else ""))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    cue(sys.argv[1])
