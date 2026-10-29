"""Renders build/icon.ico and build/icon.png from scratch.

The icon is drawn instead of hand-painted so every size in the .ico is rendered at its native
resolution: Windows picks 16px in the taskbar and 256px in the Start menu, and letting it downscale
one big bitmap makes the note's stroke turn to mush at the small end.

Run: python build/make-icon.py
"""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = Path(__file__).resolve().parent
SIZES = (16, 24, 32, 48, 64, 128, 256)

# Same red as the app's default accent, so the icon and the window agree.
TOP = (232, 72, 84)
BOTTOM = (150, 12, 26)


def rounded_mask(size: int, radius_ratio: float = 0.235) -> Image.Image:
    """Anti-aliased rounded-square alpha mask; Windows uses this shape for app icons."""
    scale = 4  # supersample, then shrink, because ImageDraw has no anti-aliased corners
    big = Image.new("L", (size * scale, size * scale), 0)
    ImageDraw.Draw(big).rounded_rectangle(
        (0, 0, size * scale - 1, size * scale - 1),
        radius=int(size * scale * radius_ratio),
        fill=255,
    )
    return big.resize((size, size), Image.LANCZOS)


def gradient(size: int) -> Image.Image:
    """Vertical red gradient with a soft highlight in the upper third."""
    y = np.linspace(0.0, 1.0, size)[:, None]
    eased = y ** 0.85
    rgb = np.stack(
        [TOP[0] + (BOTTOM[0] - TOP[0]) * eased,
         TOP[1] + (BOTTOM[1] - TOP[1]) * eased,
         TOP[2] + (BOTTOM[2] - TOP[2]) * eased],
        axis=-1,
    )[:, 0, :]
    canvas = np.repeat(rgb[:, None, :], size, axis=1).astype(np.uint8)
    image = Image.fromarray(canvas, "RGB").convert("RGBA")

    glow = Image.new("L", (size, size), 0)
    ImageDraw.Draw(glow).ellipse(
        (-size * 0.35, -size * 0.55, size * 1.35, size * 0.55), fill=110
    )
    glow = glow.filter(ImageFilter.GaussianBlur(size * 0.14))
    highlight = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    highlight.putalpha(glow)
    return Image.alpha_composite(image, highlight)


def note_layer(size: int) -> Image.Image:
    """A beamed pair of notes, drawn as geometry so the shape holds at 16px too."""
    s = size * 4
    layer = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)

    stroke = s * 0.082          # stem thickness
    head_w = s * 0.255          # note-head width; the two heads must stay apart at any size
    head_h = s * 0.205
    left_cx, right_cx = s * 0.335, s * 0.665
    head_cy = s * 0.700
    beam_left_top, beam_right_top = s * 0.300, s * 0.255
    beam = s * 0.088

    left_stem = left_cx + head_w / 2 - stroke * 0.62
    right_stem = right_cx + head_w / 2 - stroke * 0.62

    for cx in (left_cx, right_cx):
        draw.ellipse(
            (cx - head_w / 2, head_cy - head_h / 2, cx + head_w / 2, head_cy + head_h / 2),
            fill=(255, 255, 255, 255),
        )

    # Stems run from the top of the beam down into the note heads, so the join has no seam.
    draw.rectangle((left_stem, beam_left_top, left_stem + stroke, head_cy), fill=(255, 255, 255, 255))
    draw.rectangle((right_stem, beam_right_top, right_stem + stroke, head_cy), fill=(255, 255, 255, 255))

    # The beam is a filled quad rather than a rectangle because it tilts up to the right.
    draw.polygon(
        [
            (left_stem, beam_left_top),
            (right_stem + stroke, beam_right_top),
            (right_stem + stroke, beam_right_top + beam),
            (left_stem, beam_left_top + beam * 1.35),
        ],
        fill=(255, 255, 255, 255),
    )

    layer = layer.resize((size, size), Image.LANCZOS)

    # A short drop shadow keeps the white note readable on the brightest part of the gradient.
    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    shadow.paste((0, 0, 0, 90), (0, 0), layer)
    shadow = shadow.filter(ImageFilter.GaussianBlur(max(1, size * 0.02)))
    return Image.alpha_composite(shadow, layer)


def render(size: int) -> Image.Image:
    canvas = gradient(size)
    canvas.putalpha(rounded_mask(size))
    canvas = Image.alpha_composite(canvas, note_layer(size))
    # Re-apply the mask so the note cannot bleed past the rounded corners.
    canvas.putalpha(rounded_mask(size))
    return canvas


def main() -> None:
    images = [render(size) for size in SIZES]
    images[-1].save(OUT / "icon.png")
    # Pillow writes every supplied size as its own PNG-compressed frame, which is what Windows 10+
    # expects for a crisp 256px tile in the Start menu and Explorer's extra-large view.
    images[-1].save(OUT / "icon.ico", format="ICO", sizes=[(s, s) for s in SIZES])
    print("wrote", OUT / "icon.ico", "and", OUT / "icon.png", "sizes:", SIZES)


if __name__ == "__main__":
    main()
