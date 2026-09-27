#!/usr/bin/env python3
"""Crop handraw-style band sheets into per-style tile images.

Usage: crop-handraw-tiles.py <handraw-clone-dir> <out-tiles-dir> [--validate]

Sheets vary widely: most are 1254x1254 with 4x4-ish cells on white, B_036-048
flows 4+4+5, partial bands carry trailing blanks, E/G bands print full-bleed
colored backgrounds. Strategy per sheet, in order:
1. connected components at rising thresholds (no morphological opening: it
   fuses B-band cards and erases thin one-line art),
2. a separator grid - exact line positions, else quarter lines - when
   components miss the count or contain stacked fragments (a tile split into
   figure/caption parts that fake the expected count),
3. a bbox-uniform 4x4 grid for full-bleed 16-tile sheets (E/G).
--validate re-reads each tile's printed number through the VLM helper.
"""

import glob
import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ASK_TILE = '/tmp/opencode/ask-tile.mjs'

BANDS = [
    (1, 16, 'A_001-016'), (17, 32, 'A_017-032'), (33, 35, 'A_033-035'),
    (36, 48, 'B_036-048'), (49, 54, 'B_049-054'),
    (55, 70, 'C_055-070'), (71, 82, 'C_071-082'),
    (83, 98, 'D_083-098'), (99, 114, 'D_099-114'), (115, 123, 'D_115-123'),
    (124, 139, 'E_124-139'), (140, 154, 'E_140-154'),
    (155, 170, 'F_155-170'), (171, 186, 'F_171-186'), (187, 200, 'F_187-200'),
    (201, 216, 'G_201-216'),
    (217, 232, 'H_217-232'), (233, 248, 'H_233-248'), (249, 264, 'H_249-264'),
    (265, 278, 'H_265-278'),
]


def merge_overlapping(boxes: list[tuple[int, int, int, int]]) -> list[tuple[int, int, int, int]]:
    """Merge boxes whose rectangles strictly intersect (figure + caption splits)."""
    result = list(boxes)
    changed = True
    while changed:
        changed = False
        for i, a in enumerate(result):
            for j, b in enumerate(result):
                if i >= j:
                    continue
                if min(a[2], b[2]) > max(a[0], b[0]) and min(a[3], b[3]) > max(a[1], b[1]):
                    result = [box for k, box in enumerate(result) if k not in (i, j)]
                    result.append((min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])))
                    changed = True
                    break
            if changed:
                break
    return result


def has_stacked(boxes: list[tuple[int, int, int, int]]) -> bool:
    """True when two boxes sit in the same column a short gap apart: the
    signature of one tile split into parts that fakes the expected count."""
    for i, a in enumerate(boxes):
        for b in boxes[i + 1:]:
            x_overlap = min(a[2], b[2]) - max(a[0], b[0])
            narrower = min(a[2] - a[0], b[2] - b[0])
            y_gap = max(a[1], b[1]) - min(a[3], b[3])
            if x_overlap > narrower * 0.6 and y_gap <= 40:
                return True
    return False


def tile_boxes(image: Image.Image, gray: np.ndarray, expected: int) -> list[tuple[int, int, int, int]]:
    """Component analysis at rising thresholds, each raw and 3x3-opened;
    first exact count wins."""
    height, width = gray.shape
    # Erase the outer border frame first: a tile touching it would otherwise
    # join the frame component and be discarded with it. Each threshold runs
    # raw and opened: the opening snaps background-wash bridges (D_115) but
    # also fuses B-band cards, so neither variant wins universally.
    for threshold in (235, 240, 245, 248):
      for opening in (False, True):
        mask = gray < threshold
        mask[:6, :] = False
        mask[height - 6:, :] = False
        mask[:, :6] = False
        mask[:, width - 6:] = False
        if opening:
            mask = ndimage.binary_opening(mask, structure=np.ones((3, 3)))
        labels, _ = ndimage.label(mask)
        content_boxes: list[tuple[int, int, int, int]] = []
        for sl in ndimage.find_objects(labels):
            if sl is None:
                continue
            y0, y1 = sl[0].start, sl[0].stop
            x0, x1 = sl[1].start, sl[1].stop
            # Skip background washes, decorative bands and the border frame:
            # no tile spans more than half the sheet in either dimension.
            if (x1 - x0) > width * 0.55 or (y1 - y0) > height * 0.55:
                continue
            area = int((labels[sl] > 0).sum())
            if area > 5000 and (x1 - x0) > 90 and (y1 - y0) > 90:
                content_boxes.append((x0, y0, x1, y1))
        boxes = merge_overlapping(content_boxes)
        if len(boxes) == expected:
            # Reading order: cluster into rows by y-center, then sort by x.
            boxes.sort(key=lambda b: b[1] + b[3])
            rows: list[list[tuple[int, int, int, int]]] = []
            for box in boxes:
                if rows and abs((box[1] + box[3]) / 2 - (rows[-1][0][1] + rows[-1][0][3]) / 2) < 150:
                    rows[-1].append(box)
                else:
                    rows.append([box])
            ordered = [box for row in rows for box in sorted(row, key=lambda b: b[0])]
            img_width, img_height = image.size
            return [(max(x0 - 3, 0), max(y0 - 3, 0), min(x1 + 3, img_width), min(y1 + 3, img_height))
                    for x0, y0, x1, y1 in ordered]
    return []


def line_positions(fraction: np.ndarray, size: int) -> list[tuple[int, int]]:
    """Contiguous runs of separator rows/cols, ignoring the outer margins."""
    hits = np.where(fraction > 0.99)[0]
    merged: list[list[int]] = []
    for i in hits:
        if merged and i - merged[-1][-1] <= 3:
            merged[-1].append(i)
        else:
            merged.append([i])
    return [(g[0], g[-1]) for g in merged if g[0] > 10 and g[-1] < size - 10]


def grid_boxes(image: Image.Image) -> list[tuple[int, int, int, int]] | None:
    """Uniform grid cells from separator lines: exact line positions when all
    three interior lines register per axis, else the quarter partition when at
    least two detected lines per axis sit on quarter positions (15px)."""
    a = np.asarray(image.convert('L')).astype(float)
    height, width = a.shape
    white_rows = line_positions((a > 242).mean(axis=1), height)
    white_cols = line_positions((a > 242).mean(axis=0), width)
    dark_rows = line_positions((a < 80).mean(axis=1), height)
    dark_cols = line_positions((a < 80).mean(axis=0), width)
    flat_rows = line_positions((a.std(axis=1) < 8).astype(float), height)
    flat_cols = line_positions((a.std(axis=0) < 8).astype(float), width)
    for rows, cols in ((white_rows, white_cols), (dark_rows, dark_cols), (flat_rows, flat_cols)):
        if len(rows) == 3 and len(cols) == 3:
            ys = [0, *(g[0] for g in rows), height]
            xs = [0, *(g[0] for g in cols), width]
            return [(xs[i] + 3, ys[j] + 3, xs[i + 1] - 3, ys[j + 1] - 3) for j in range(4) for i in range(4)]

    def on_quarters(lines: list[tuple[int, int]], quarters: list[int]) -> int:
        return sum(any(abs(line - q) <= 15 for q in quarters) for line, _ in lines)

    all_rows = white_rows + dark_rows + flat_rows
    all_cols = white_cols + dark_cols + flat_cols
    if on_quarters(all_rows, [round(height * k / 4) for k in (1, 2, 3)]) >= 2 \
            and on_quarters(all_cols, [round(width * k / 4) for k in (1, 2, 3)]) >= 2:
        ys = [0, *(round(height * k / 4) for k in (1, 2, 3)), height]
        xs = [0, *(round(width * k / 4) for k in (1, 2, 3)), width]
        return [(xs[i] + 3, ys[j] + 3, xs[i + 1] - 3, ys[j + 1] - 3) for j in range(4) for i in range(4)]
    return None


def bbox_grid(gray: np.ndarray) -> list[tuple[int, int, int, int]]:
    """Uniform 4x4 cells over the non-white bounding box, for full-bleed
    sheets whose backgrounds defeat component analysis."""
    height, width = gray.shape
    rows = np.where((gray < 245).any(axis=1))[0]
    cols = np.where((gray < 245).any(axis=0))[0]
    x0, x1, y0, y1 = int(cols[0]), int(cols[-1]), int(rows[0]), int(rows[-1])
    cw, ch = (x1 - x0) / 4, (y1 - y0) / 4
    return [(round(x0 + (i % 4) * cw) + 3, round(y0 + (i // 4) * ch) + 3,
             round(x0 + (i % 4 + 1) * cw) - 3, round(y0 + (i // 4 + 1) * ch) - 3)
            for i in range(16)]


def filled_cells(cells: list[tuple[int, int, int, int]], gray: np.ndarray) -> list[tuple[int, int, int, int]]:
    """Cells holding real content: >=4% clearly non-white interior pixels.
    Pale one-line art lands near 10%; empty-cell webp noise stays below 3.5%."""
    return [c for c in cells
            if float((gray[c[1] + 6:c[3] - 6, c[0] + 6:c[2] - 6] < 240).mean()) >= 0.04]


def main() -> None:
    args = [arg for arg in sys.argv[1:] if not arg.startswith('--')]
    validate = '--validate' in sys.argv[1:]
    if len(args) != 2:
        raise SystemExit('usage: crop-handraw-tiles.py <handraw-clone-dir> <out-tiles-dir> [--validate]')
    clone_dir, out_dir = Path(args[0]), Path(args[1])
    refs = sorted(glob.glob(str(clone_dir / 'skills/*/references')))[0]
    styles = json.loads((Path(refs) / 'styles.json').read_text())
    known = {int(item['number']) for item in styles}
    out_dir.mkdir(parents=True, exist_ok=True)
    written: dict[str, int] = {}
    for lo, hi, sheet in BANDS:
        expected = list(range(lo, hi + 1))
        image = Image.open(clone_dir / 'images' / f'{sheet}.webp')
        gray = np.asarray(image.convert('L'))
        candidates = tile_boxes(image, gray, len(expected))
        # Grid fallbacks: exact/quarter separator lines, then the bbox-uniform
        # partition for full-bleed 16-tile sheets (E/G bands).
        grid = grid_boxes(image)
        grid_ok = grid is not None and len(filled_cells(grid, gray)) == len(expected)
        if not grid_ok and len(expected) == 16:
            bbox = bbox_grid(gray)
            if len(filled_cells(bbox, gray)) == 16:
                grid, grid_ok = bbox, True
        # Components win only on an exact count free of stacked fragments:
        # a split tile plus a missing pale one fake the count and shift every
        # later assignment.
        if grid_ok and (len(candidates) != len(expected) or has_stacked(candidates)):
            candidates = filled_cells(grid, gray)
        if len(candidates) != len(expected):
            raise SystemExit(f'{sheet}: {len(candidates)} tiles != {len(expected)} expected styles {expected}')
        for box, number in zip(candidates, expected):
            if number not in known:
                continue
            image.crop(box).save(out_dir / f's-{number:03d}.webp', 'WEBP', quality=88, method=6)
            written[f's-{number:03d}'] = number
    print(f'wrote {len(written)} tiles to {out_dir}')
    missing = sorted(n for n in range(1, 279) if n not in written.values())
    if missing:
        print(f'styles without tiles (fallback to band sheet): {missing}')

    if validate:
        def ask(item: tuple[str, int]) -> tuple[str, int, str]:
            name, number = item
            result = subprocess.run(['node', ASK_TILE, str(out_dir / f'{name}.webp'),
                                     '小图上方或角落标注的编号数字是什么？只回答数字，没有则答无。'],
                                    capture_output=True, text=True, timeout=120)
            return name, number, (result.stdout or '').strip()

        with ThreadPoolExecutor(max_workers=8) as pool:
            for name, number, answer in pool.map(ask, sorted(written.items())):
                digits = ''.join(ch for ch in answer if ch.isdigit())[-3:]
                # Grid crops exclude nothing but component crops exclude the
                # printed label; skip reads that found no digits at all.
                if not digits:
                    continue
                ok = digits == f'{number:03d}' or digits.lstrip('0') == str(number)
                if not ok:
                    print(f'MISMATCH {name}: expected {number:03d}, read {answer!r}')


if __name__ == '__main__':
    main()
