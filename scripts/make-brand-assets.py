#!/usr/bin/env python3
"""
Generates the brand source images that @capacitor/assets expands into every
iOS and Android icon and splash size.

The Q is drawn geometrically rather than set in a typeface: no font dependency,
identical output on any machine, and re-runnable when the brand colours change.
Swap this for a real logo by dropping a 1024x1024 assets/icon.png in place and
skipping this script -- `npm run assets` reads the PNGs, not this file.

    python3 scripts/make-brand-assets.py && npm run assets
"""
from PIL import Image, ImageDraw

# app/globals.css of the dashboard: --indigo / --violet, and the dark canvas.
INDIGO = (79, 70, 229)
VIOLET = (124, 58, 237)
CANVAS_LIGHT = (241, 243, 249)
CANVAS_DARK = (8, 9, 15)
WHITE = (255, 255, 255)

SS = 4  # supersample factor; PIL has no antialiased drawing, so draw big and downscale


def gradient(size, start, end):
    """Diagonal indigo -> violet, matching the dashboard's brand gradient."""
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            px[x, y] = tuple(round(start[i] + (end[i] - start[i]) * t) for i in range(3))
    return img


def draw_q(size, colour, stroke_ratio=0.085, scale=0.52):
    """
    Transparent layer holding the Q mark, centred.

    The ring is an ellipse outline; the tail is a rounded line crossing the
    lower-right at 45 degrees, which is what separates a Q from an O at icon sizes.
    """
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    stroke = max(1, round(size * stroke_ratio))
    r = size * scale / 2
    cx = cy = size / 2

    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=colour + (255,), width=stroke)

    # Tail: from just inside the ring to just outside, along the 45 degree diagonal.
    inner = r * 0.42
    outer = r * 1.16
    k = 0.7071  # cos/sin 45 degrees
    d.line(
        [cx + inner * k, cy + inner * k, cx + outer * k, cy + outer * k],
        fill=colour + (255,),
        width=stroke,
    )
    # PIL leaves square line caps; discs round them off.
    for dist in (inner, outer):
        x, y = cx + dist * k, cy + dist * k
        d.ellipse([x - stroke / 2, y - stroke / 2, x + stroke / 2, y + stroke / 2],
                  fill=colour + (255,))
    return layer


def rounded_mask(size, radius_ratio=0.2237):
    """iOS squircle approximation -- Apple's continuous corner is ~22.37% of the side."""
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, size - 1, size - 1], radius=round(size * radius_ratio), fill=255
    )
    return mask


def icon(out, size=1024, rounded=False):
    big = size * SS
    img = gradient(big, INDIGO, VIOLET).convert("RGBA")
    img.alpha_composite(draw_q(big, WHITE))
    if rounded:
        img.putalpha(rounded_mask(big))
    img.resize((size, size), Image.LANCZOS).save(out)
    print(f"  {out}  {size}x{size}")


def icon_foreground(out, size=1024):
    """
    Android adaptive icon foreground. The outer ~28% is cropped by the launcher
    mask on some devices, so the mark is drawn small enough to survive it.
    """
    big = size * SS
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    img.alpha_composite(draw_q(big, WHITE, scale=0.36, stroke_ratio=0.058))
    img.resize((size, size), Image.LANCZOS).save(out)
    print(f"  {out}  {size}x{size}")


def icon_background(out, size=1024):
    gradient(size * SS, INDIGO, VIOLET).resize((size, size), Image.LANCZOS).save(out)
    print(f"  {out}  {size}x{size}")


def splash(out, size=2732, dark=False):
    """
    Square and oversized on purpose: @capacitor/assets centre-crops this one
    source to every portrait and landscape density, so the mark must sit well
    inside the safe centre.
    """
    bg = CANVAS_DARK if dark else CANVAS_LIGHT
    img = Image.new("RGBA", (size, size), bg + (255,))

    mark = size // 4
    tile = gradient(mark * SS, INDIGO, VIOLET).convert("RGBA")
    tile.alpha_composite(draw_q(mark * SS, WHITE, scale=0.5, stroke_ratio=0.08))
    tile.putalpha(rounded_mask(mark * SS))
    tile = tile.resize((mark, mark), Image.LANCZOS)

    img.alpha_composite(tile, ((size - mark) // 2, (size - mark) // 2))
    img.convert("RGB").save(out)
    print(f"  {out}  {size}x{size}")


if __name__ == "__main__":
    import os

    os.makedirs("assets", exist_ok=True)
    print("Generating brand assets:")
    icon("assets/icon.png")
    icon("assets/icon-only.png")
    icon_foreground("assets/icon-foreground.png")
    icon_background("assets/icon-background.png")
    icon("assets/logo.png", rounded=True)
    splash("assets/splash.png")
    splash("assets/splash-dark.png", dark=True)
    print("\nNext: npm run assets")
