"""Renders candidate app icons into _tmp/ as a contact sheet.

These are design candidates only: nothing here touches build/icon.ico until one is picked.
Every candidate is drawn at 4x and downsampled so the small sizes stay legible.

Run: python build/make-icon-candidates.py
"""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / "_tmp"
SS = 4  # supersample factor


def rounded_mask(size: int, radius_ratio: float = 0.235) -> Image.Image:
    big = Image.new("L", (size * SS, size * SS), 0)
    ImageDraw.Draw(big).rounded_rectangle(
        (0, 0, size * SS - 1, size * SS - 1), radius=int(size * SS * radius_ratio), fill=255
    )
    return big.resize((size, size), Image.LANCZOS)


def diag_gradient(size: int, stops: list[tuple[float, tuple[int, int, int]]]) -> Image.Image:
    """45-degree gradient through evenly spaced colour stops."""
    yy, xx = np.mgrid[0:size, 0:size]
    t = (xx + yy) / (2 * (size - 1))
    out = np.zeros((size, size, 3), dtype=np.float64)
    pos = [p for p, _ in stops]
    for i in range(len(stops) - 1):
        lo, hi = pos[i], pos[i + 1]
        c0 = np.array(stops[i][1], dtype=np.float64)
        c1 = np.array(stops[i + 1][1], dtype=np.float64)
        band = (t >= lo) & (t <= hi) if i < len(stops) - 2 else (t >= lo)
        local = np.clip((t - lo) / max(hi - lo, 1e-6), 0, 1)[..., None]
        mixed = c0 + (c1 - c0) * local
        out = np.where(band[..., None], mixed, out)
    # Anything above the last stop keeps the final colour.
    out = np.where((t > pos[-1])[..., None], np.array(stops[-1][1], dtype=np.float64), out)
    return Image.fromarray(out.astype(np.uint8), "RGB").convert("RGBA")


def radial_gradient(size: int, inner: tuple[int, int, int], outer: tuple[int, int, int]) -> Image.Image:
    yy, xx = np.mgrid[0:size, 0:size]
    cx = cy = (size - 1) / 2
    r = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / (size * 0.62)
    r = np.clip(r, 0, 1)[..., None]
    out = np.array(inner, dtype=np.float64) + (np.array(outer, dtype=np.float64) - np.array(inner)) * r
    return Image.fromarray(out.astype(np.uint8), "RGB").convert("RGBA")


def soft(size: int) -> Image.Image:
    """A transparent canvas already at 4x, for shape drawing."""
    return Image.new("RGBA", (size * SS, size * SS), (0, 0, 0, 0))


def finish(layer: Image.Image, size: int) -> Image.Image:
    return layer.resize((size, size), Image.LANCZOS)


def glow_under(layer: Image.Image, size: int, radius: float, alpha: int = 120) -> Image.Image:
    """Blurred copy of the shape placed under it, so thin white lines glow on dark grounds."""
    size_px = size * SS
    mask = Image.new("RGBA", (size_px, size_px), (0, 0, 0, 0))
    mask.paste((255, 255, 255, alpha), (0, 0), layer)
    mask = mask.filter(ImageFilter.GaussianBlur(size_px * radius))
    return Image.alpha_composite(mask, layer)


# ---------------------------------------------------------------- candidate E: single note

def note_e(size: int, color=(255, 255, 255, 255)) -> Image.Image:
    s = size * SS
    layer = soft(size)
    d = ImageDraw.Draw(layer)
    hw, hh = s * 0.245, s * 0.185
    cx, cy = s * 0.455, s * 0.735
    stem_w = s * 0.052
    stem_x = cx + hw * 0.40
    top = s * 0.215
    d.ellipse((cx - hw / 2, cy - hh / 2, cx + hw / 2, cy + hh / 2), fill=color)
    d.rectangle((stem_x, top, stem_x + stem_w, cy), fill=color)
    # Flag: a thin crescent hanging off the top of the stem.
    d.polygon(
        [(stem_x, top), (stem_x + s * 0.175, top + s * 0.070),
         (stem_x + s * 0.150, top + s * 0.210), (stem_x + stem_w, top + s * 0.130)],
        fill=color,
    )
    return layer


def icon_e(size: int) -> Image.Image:
    canvas = radial_gradient(size, (32, 32, 42), (10, 10, 14))
    canvas.putalpha(rounded_mask(size))
    canvas = Image.alpha_composite(canvas, finish(glow_under(note_e(size), size, 0.03), size))
    canvas.putalpha(rounded_mask(size))
    return canvas


# ---------------------------------------------------------------- candidate F: sound rings

def rings_f(size: int) -> Image.Image:
    s = size * SS
    layer = soft(size)
    d = ImageDraw.Draw(layer)
    c = s * 0.5
    for i, (rad, alpha, width) in enumerate(
        [(0.395, 70, 0.011), (0.300, 120, 0.013), (0.205, 180, 0.015)]
    ):
        r = s * rad
        d.ellipse((c - r, c - r, c + r, c + r),
                  outline=(255, 255, 255, alpha), width=max(1, int(s * width)))
    dot = s * 0.088
    d.ellipse((c - dot, c - dot, c + dot, c + dot), fill=(255, 255, 255, 250))
    return layer


def icon_f(size: int) -> Image.Image:
    canvas = diag_gradient(size, [(0.0, (26, 18, 46)), (0.55, (86, 24, 52)), (1.0, (176, 84, 52))])
    canvas.putalpha(rounded_mask(size))
    canvas = Image.alpha_composite(canvas, finish(glow_under(rings_f(size), size, 0.035, 90), size))
    canvas.putalpha(rounded_mask(size))
    return canvas


# ---------------------------------------------------------------- candidate G: L + waveform

def bars_g(size: int) -> Image.Image:
    s = size * SS
    layer = soft(size)
    d = ImageDraw.Draw(layer)
    ink = (24, 22, 26, 255)
    # Thin L: a vertical stroke that turns into the baseline.
    stem_w = s * 0.062
    x0 = s * 0.255
    d.rectangle((x0, s * 0.235, x0 + stem_w, s * 0.700), fill=ink)
    d.rectangle((x0, s * 0.700 - stem_w, s * 0.470, s * 0.700), fill=ink)
    # The baseline continues as five bars of an equaliser, tallest nearest the letter.
    base = s * 0.700
    heights = [0.300, 0.185, 0.255, 0.115, 0.170]
    widths = [0.036, 0.030, 0.033, 0.026, 0.029]
    gap = s * 0.034
    x = s * 0.510
    for h, w in zip(heights, widths):
        d.rounded_rectangle((x, base - s * h, x + s * w, base), radius=s * 0.014, fill=ink)
        x += s * w + gap
    return layer


def icon_g(size: int) -> Image.Image:
    canvas = radial_gradient(size, (250, 247, 238), (228, 220, 204))
    canvas.putalpha(rounded_mask(size))
    canvas = Image.alpha_composite(canvas, finish(bars_g(size), size))
    canvas.putalpha(rounded_mask(size))
    return canvas


# ---------------------------------------------------------------- candidate H: prism note

def note_h(size: int, color=(255, 255, 255, 235)) -> Image.Image:
    """Beamed pair of notes, same construction as build/make-icon.py so 16px stays readable."""
    s = size * SS
    layer = soft(size)
    d = ImageDraw.Draw(layer)
    stroke = s * 0.070
    head_w = s * 0.215
    head_h = s * 0.172
    left_cx, right_cx = s * 0.345, s * 0.655
    head_cy = s * 0.700
    beam_left_top, beam_right_top = s * 0.315, s * 0.272
    beam = s * 0.075

    left_stem = left_cx + head_w / 2 - stroke * 0.62
    right_stem = right_cx + head_w / 2 - stroke * 0.62

    for cx in (left_cx, right_cx):
        d.ellipse((cx - head_w / 2, head_cy - head_h / 2, cx + head_w / 2, head_cy + head_h / 2), fill=color)

    d.rectangle((left_stem, beam_left_top, left_stem + stroke, head_cy), fill=color)
    d.rectangle((right_stem, beam_right_top, right_stem + stroke, head_cy), fill=color)

    d.polygon(
        [(left_stem, beam_left_top), (right_stem + stroke, beam_right_top),
         (right_stem + stroke, beam_right_top + beam), (left_stem, beam_left_top + beam * 1.35)],
        fill=color,
    )
    return layer


def icon_h(size: int) -> Image.Image:
    canvas = diag_gradient(size, [(0.0, (255, 92, 106)), (0.48, (255, 160, 96)), (1.0, (128, 92, 240))])
    canvas.putalpha(rounded_mask(size))
    canvas = Image.alpha_composite(canvas, finish(glow_under(note_h(size), size, 0.02, 70), size))
    canvas.putalpha(rounded_mask(size))
    return canvas


CANDIDATES = {
    "E 墨玉音符": icon_e,
    "F 声环": icon_f,
    "G 素纸波": icon_g,
    "H 棱镜双音": icon_h,
}


def contact_sheet() -> None:
    cell = 256
    pad = 20
    label_h = 26
    cols = len(CANDIDATES)
    sheet = Image.new("RGBA", (cols * (cell + pad) + pad, cell + pad * 2 + label_h + 96), (245, 245, 248, 255))
    draw = ImageDraw.Draw(sheet)
    for i, (name, fn) in enumerate(CANDIDATES.items()):
        big = fn(cell)
        x = pad + i * (cell + pad)
        sheet.alpha_composite(big, (x, pad))
        draw.text((x + 4, pad + cell + 8), name, fill=(30, 30, 34, 255))
        # 32px and 16px previews, blown up 2x with nearest so the pixel work is visible.
        small = fn(32).resize((64, 64), Image.NEAREST)
        tiny = fn(16).resize((64, 64), Image.NEAREST)
        sheet.alpha_composite(small, (x, pad + cell + label_h))
        sheet.alpha_composite(tiny, (x + 72, pad + cell + label_h))
    sheet.save(OUT / "icon-candidates.png")

    # A 5-row stack at true app sizes for a quick sanity check.
    sizes = (16, 24, 32, 48, 64)
    stack = Image.new("RGBA", (sum(sizes) + 60, len(CANDIDATES) * (64 + 8)), (255, 255, 255, 255))
    for row, (name, fn) in enumerate(CANDIDATES.items()):
        x = 10
        for s in sizes:
            stack.alpha_composite(fn(s), (x, row * 72 + 4 + (64 - s) // 2))
            x += s + 12
    stack.save(OUT / "icon-candidates-sizes.png")
    print("wrote", OUT / "icon-candidates.png", "and icon-candidates-sizes.png")


if __name__ == "__main__":
    contact_sheet()
