#!/usr/bin/env python3
"""Punch skin sheets, crop head/torso, synthesize matching arm/leg strips."""

from __future__ import annotations

import colorsys
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public" / "assets" / "skins"
OUT = SRC

SKINS = ("olive", "desert", "urban", "crimson", "navy")


def punch_black(im: Image.Image, threshold: int = 28) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    assert px is not None
    visited = [[False] * h for _ in range(w)]
    q: deque[tuple[int, int]] = deque()

    def enq(x: int, y: int) -> None:
        if 0 <= x < w and 0 <= y < h:
            q.append((x, y))

    for x in range(w):
        enq(x, 0)
        enq(x, h - 1)
    for y in range(h):
        enq(0, y)
        enq(w - 1, y)

    bg: list[tuple[int, int]] = []
    while q:
        x, y = q.popleft()
        if visited[x][y]:
            continue
        visited[x][y] = True
        r, g, b, a = px[x, y]
        if a == 0 or (r <= threshold and g <= threshold and b <= threshold):
            bg.append((x, y))
            enq(x + 1, y)
            enq(x - 1, y)
            enq(x, y + 1)
            enq(x, y - 1)

    for x, y in bg:
        r, g, b, _ = px[x, y]
        px[x, y] = (r, g, b, 0)
    return im


def content_bbox(im: Image.Image, alpha_min: int = 16) -> tuple[int, int, int, int]:
    a = im.split()[-1]
    return a.getbbox() or (0, 0, im.width, im.height)


def dominant_colors(im: Image.Image, n: int = 5) -> list[tuple[int, int, int]]:
    small = im.convert("RGBA").resize((48, 48), Image.Resampling.BOX)
    counts: dict[tuple[int, int, int], int] = {}
    for r, g, b, a in small.getdata():
        if a < 40:
            continue
        if r + g + b < 40:
            continue
        key = (r // 12 * 12, g // 12 * 12, b // 12 * 12)
        counts[key] = counts.get(key, 0) + 1
    ranked = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)
    cols = [c for c, _ in ranked[:n]]
    while len(cols) < n:
        cols.append(cols[-1] if cols else (90, 100, 70))
    return cols


def shade(rgb: tuple[int, int, int], mul: float) -> tuple[int, int, int]:
    return tuple(max(0, min(255, int(c * mul))) for c in rgb)  # type: ignore[return-value]


def make_limb(
    colors: list[tuple[int, int, int]],
    length: int,
    thickness: int,
    *,
    tip: str = "none",
) -> Image.Image:
    """Horizontal limb strip: shoulder/hip at left, hand/foot at right."""
    pad = 4
    w, h = length + pad * 2, thickness + pad * 2
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    base = colors[0]
    mid = colors[1] if len(colors) > 1 else shade(base, 1.15)
    dark = shade(base, 0.45)
    light = shade(mid, 1.35)
    outline = shade(base, 0.22)

    x0, y0 = pad, pad
    x1, y1 = pad + length, pad + thickness
    d.rounded_rectangle([x0, y0, x1, y1], radius=thickness // 2, fill=base + (255,))
    # top highlight ridge
    d.rounded_rectangle(
        [x0 + 2, y0 + 1, x1 - 2, y0 + thickness * 0.42],
        radius=thickness // 3,
        fill=light + (210,),
    )
    # bottom shadow
    d.rounded_rectangle(
        [x0 + 2, y1 - thickness * 0.4, x1 - 2, y1 - 1],
        radius=thickness // 3,
        fill=dark + (180,),
    )
    d.rounded_rectangle([x0, y0, x1, y1], radius=thickness // 2, outline=outline + (255,), width=2)

    if tip == "hand":
        cx, cy = x1 - thickness * 0.15, (y0 + y1) / 2
        r = thickness * 0.42
        glove = shade(colors[min(2, len(colors) - 1)], 0.55)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=glove + (255,), outline=outline + (255,))
    elif tip == "boot":
        bx0, by0 = x1 - thickness * 0.9, y0 + thickness * 0.15
        bx1, by1 = x1 + 2, y1 + 2
        boot = shade(colors[min(2, len(colors) - 1)], 0.4)
        d.rounded_rectangle([bx0, by0, bx1, by1], radius=4, fill=boot + (255,), outline=outline + (255,))

    # fabric noise
    noise = Image.effect_noise((w, h), 18).convert("L")
    noise = ImageEnhance.Contrast(noise).enhance(1.4)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    src = im.load()
    nd = noise.load()
    od = out.load()
    assert src and nd and od
    for y in range(h):
        for x in range(w):
            r, g, b, a = src[x, y]
            if a == 0:
                continue
            n = nd[x, y]
            f = 0.92 + (n / 255) * 0.16
            od[x, y] = (
                max(0, min(255, int(r * f))),
                max(0, min(255, int(g * f))),
                max(0, min(255, int(b * f))),
                a,
            )
    return out.filter(ImageFilter.SMOOTH_MORE)


def make_torso_fallback(colors: list[tuple[int, int, int]], w: int, h: int) -> Image.Image:
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    base, mid = colors[0], colors[1]
    dark, light = shade(base, 0.5), shade(mid, 1.3)
    outline = shade(base, 0.2)
    d.rounded_rectangle([2, 2, w - 3, h - 3], radius=8, fill=base + (255,))
    d.rounded_rectangle([6, 4, w - 7, h * 0.35], radius=5, fill=light + (200,))
    d.rounded_rectangle([8, h * 0.55, w - 9, h - 8], radius=4, fill=dark + (160,))
    # straps
    strap = shade(colors[min(2, len(colors) - 1)], 0.65)
    d.rectangle([w * 0.22, 6, w * 0.34, h - 8], fill=strap + (220,))
    d.rectangle([w * 0.66, 6, w * 0.78, h - 8], fill=strap + (220,))
    d.rounded_rectangle([2, 2, w - 3, h - 3], radius=8, outline=outline + (255,), width=2)
    return im


def crop_head(body: Image.Image) -> Image.Image:
    x0, y0, x1, y1 = content_bbox(body)
    bw, bh = x1 - x0, y1 - y0
    # Head is upper ~32% of figure, slightly wider than tall
    hx0 = x0 + int(bw * 0.28)
    hx1 = x0 + int(bw * 0.72)
    hy0 = y0
    hy1 = y0 + int(bh * 0.34)
    head = body.crop((hx0, hy0, hx1, hy1))
    # trim again
    bb = content_bbox(head)
    head = head.crop(bb)
    # pad for rotation
    pad = 6
    out = Image.new("RGBA", (head.width + pad * 2, head.height + pad * 2), (0, 0, 0, 0))
    out.paste(head, (pad, pad), head)
    return out


def crop_torso(body: Image.Image) -> Image.Image:
    x0, y0, x1, y1 = content_bbox(body)
    bw, bh = x1 - x0, y1 - y0
    tx0 = x0 + int(bw * 0.22)
    tx1 = x0 + int(bw * 0.78)
    ty0 = y0 + int(bh * 0.28)
    ty1 = y0 + int(bh * 0.58)
    torso = body.crop((tx0, ty0, tx1, ty1))
    bb = content_bbox(torso)
    if not bb:
        return make_torso_fallback(dominant_colors(body), 56, 64)
    torso = torso.crop(bb)
    # If crop is too arm-contaminated / thin, fall back
    if torso.width < 20 or torso.height < 24:
        return make_torso_fallback(dominant_colors(body), 56, 64)
    pad = 4
    out = Image.new("RGBA", (torso.width + pad * 2, torso.height + pad * 2), (0, 0, 0, 0))
    out.paste(torso, (pad, pad), torso)
    return out


def process_skin(name: str) -> None:
    sheet = SRC / f"skin_{name}_sheet.png"
    if not sheet.exists():
        print(f"missing {sheet}")
        return
    im = punch_black(Image.open(sheet))
    bb = content_bbox(im)
    body = im.crop(bb)
    # normalize height ~220 for consistent crops
    target_h = 220
    scale = target_h / body.height
    body = body.resize((max(1, int(body.width * scale)), target_h), Image.Resampling.LANCZOS)

    colors = dominant_colors(body)
    head = crop_head(body)
    torso = crop_torso(body)
    arm = make_limb(colors, 72, 22, tip="hand")
    leg = make_limb(colors, 84, 24, tip="boot")

    head.save(OUT / f"skin_{name}_head.png")
    torso.save(OUT / f"skin_{name}_torso.png")
    arm.save(OUT / f"skin_{name}_arm.png")
    leg.save(OUT / f"skin_{name}_leg.png")
    body.save(OUT / f"skin_{name}_full.png")
    print(
        f"{name}: head={head.size} torso={torso.size} arm={arm.size} leg={leg.size} colors={colors[:3]}"
    )


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name in SKINS:
        process_skin(name)
    print("done →", OUT)


if __name__ == "__main__":
    main()
