#!/usr/bin/env python3
"""Punch near-black backplates to alpha (flood-fill from edges), then crop."""
from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image

ASSETS = Path(__file__).resolve().parents[1] / "public" / "assets"

FLOOD = [
    "prop_crate.png",
    "prop_sandbags.png",
    "prop_ruin.png",
    "bg_scrub.png",
    "fx_explosion.png",
    "fx_blood.png",
    "icon_rifle.png",
    "icon_sniper.png",
    "icon_shotgun.png",
    "terrain_edge.png",
]

# Full painted backdrop — leave opaque (used as parallax plate)
NO_CROP = {"bg_scrub.png"}
SKIP = {"terrain_dirt.png"}


def is_bg(r: int, g: int, b: int, threshold: int) -> bool:
    return r <= threshold and g <= threshold and b <= threshold


def punch(path: Path, threshold: int = 32) -> int:
    im = Image.open(path).convert("RGBA")
    px = im.load()
    w, h = im.size
    assert px is not None

    visited = [[False] * h for _ in range(w)]
    q: deque[tuple[int, int]] = deque()

    def enqueue(x: int, y: int) -> None:
        if 0 <= x < w and 0 <= y < h:
            q.append((x, y))

    for x in range(w):
        enqueue(x, 0)
        enqueue(x, h - 1)
    for y in range(h):
        enqueue(0, y)
        enqueue(w - 1, y)

    bg: list[tuple[int, int]] = []
    while q:
        x, y = q.popleft()
        if visited[x][y]:
            continue
        visited[x][y] = True
        r, g, b, a = px[x, y]
        if a == 0 or not is_bg(r, g, b, threshold):
            continue
        bg.append((x, y))
        enqueue(x + 1, y)
        enqueue(x - 1, y)
        enqueue(x, y + 1)
        enqueue(x, y - 1)

    for x, y in bg:
        r, g, b, _ = px[x, y]
        px[x, y] = (r, g, b, 0)

    fringe: list[tuple[int, int, int]] = []
    for x, y in bg:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if not (0 <= nx < w and 0 <= ny < h):
                continue
            r, g, b, a = px[nx, ny]
            if a == 0:
                continue
            lum = (r + g + b) / 3
            if lum < threshold + 40:
                na = max(0, min(a, int(a * (lum / (threshold + 40)))))
                fringe.append((nx, ny, na))

    for x, y, na in fringe:
        r, g, b, _ = px[x, y]
        px[x, y] = (r, g, b, na)

    if path.name not in NO_CROP:
        bbox = im.getbbox()
        if bbox:
            pad = 4
            x0, y0, x1, y1 = bbox
            x0 = max(0, x0 - pad)
            y0 = max(0, y0 - pad)
            x1 = min(im.width, x1 + pad)
            y1 = min(im.height, y1 + pad)
            im = im.crop((x0, y0, x1, y1))

    im.save(path, optimize=True)
    return len(bg)


def main() -> None:
    for name in FLOOD:
        if name in SKIP:
            continue
        path = ASSETS / name
        if not path.exists():
            print(f"missing {name}")
            continue
        thr = 40 if name == "terrain_edge.png" else 32
        n = punch(path, threshold=thr)
        print(f"punched {name}: {n} bg px -> {Image.open(path).size}")


if __name__ == "__main__":
    main()
