#!/usr/bin/env python3
"""Crop the handraw-style 4x4 contact sheets into per-style tiles.

Usage: python3 scripts/crop-handraw-tiles.py <handraw-clone-dir> <out-tiles-dir>

Sheets are 1254x1254 with a ~4px outer border and ~2-3px separator lines at
313/625/939 (rows and columns); tiles are read row-major, style #lo at the
top-left. Each band covers styles lo..hi from
skills/handraw-style-prompter/references/styles.json; leftover cells are
ignored.
"""
import json
import sys
from glob import glob
from pathlib import Path

from PIL import Image

BANDS = [
    (1, 16, 'A_001-016.webp'), (17, 32, 'A_017-032.webp'), (33, 35, 'A_033-035.webp'),
    (36, 48, 'B_036-048.webp'), (49, 54, 'B_049-054.webp'), (55, 70, 'C_055-070.webp'),
    (71, 82, 'C_071-082.webp'), (83, 98, 'D_083-098.webp'), (99, 114, 'D_099-114.webp'),
    (115, 123, 'D_115-123.webp'), (124, 139, 'E_124-139.webp'), (140, 154, 'E_140-154.webp'),
    (155, 170, 'F_155-170.webp'), (171, 186, 'F_171-186.webp'), (187, 200, 'F_187-200.webp'),
    (201, 216, 'G_201-216.webp'), (217, 232, 'H_217-232.webp'), (233, 248, 'H_233-248.webp'),
    (249, 264, 'H_249-264.webp'), (265, 278, 'H_265-278.webp'),
]
# Interior tile bounds between the border (0-3) and separators (313-315/625-627/939-940/1250-1253).
STARTS = (4, 316, 628, 941)
ENDS = (312, 624, 938, 1249)


def main() -> None:
    clone_dir, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
    if len(sys.argv) != 3:
        raise SystemExit('usage: crop-handraw-tiles.py <handraw-clone-dir> <out-tiles-dir>')
    refs = sorted(glob(str(clone_dir / 'skills/*/references')))[0]
    styles = json.loads((Path(refs) / 'styles.json').read_text())
    known = {int(item['number']) for item in styles}
    out_dir.mkdir(parents=True, exist_ok=True)
    written = 0
    for lo, hi, sheet in BANDS:
        image = Image.open(clone_dir / 'images' / sheet)
        for number in range(lo, hi + 1):
            if number not in known:
                continue
            tile_index = number - lo
            box = (STARTS[tile_index % 4], STARTS[tile_index // 4], ENDS[tile_index % 4], ENDS[tile_index // 4])
            tile = image.crop(box)
            extrema = tile.convert('L').getextrema()
            if extrema[1] - extrema[0] < 12:
                raise SystemExit(f'style #{number} tile in {sheet} looks blank (extrema {extrema})')
            tile.save(out_dir / f's-{number:03d}.webp', 'WEBP', quality=88, method=6)
            written += 1
    print(f'wrote {written} tiles to {out_dir}')


if __name__ == '__main__':
    main()
