# One-off / reusable: resize images for Chrome Web Store (screenshots + promo tiles).
# Usage: python scripts/build-cws-images-from-folder.py
# Edit SOURCE_DIR if needed.
from __future__ import annotations

import os
from pathlib import Path

from PIL import Image

SOURCE_DIR = Path(r"C:\Users\User\Desktop\ат-проверка")
OUT_SCREEN = Path(__file__).resolve().parents[1] / "CWS" / "screenshots"
OUT_PROMO = Path(__file__).resolve().parents[1] / "CWS" / "promo"


def to_rgb_no_alpha(im: Image.Image) -> Image.Image:
    if im.mode == "P":
        im = im.convert("RGBA")
    if im.mode in ("RGBA", "LA"):
        bg = Image.new("RGB", im.size, (255, 255, 255))
        alpha = im.split()[-1] if im.mode == "RGBA" else None
        bg.paste(im.convert("RGBA"), mask=alpha)
        return bg
    return im.convert("RGB")


def resize_cover_rgb(im: Image.Image, w: int, h: int) -> Image.Image:
    im = im.convert("RGBA")
    sw, sh = im.size
    scale = max(w / sw, h / sh)
    nw, nh = int(sw * scale), int(sh * scale)
    im = im.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - w) // 2
    top = (nh - h) // 2
    im = im.crop((left, top, left + w, top + h))
    return to_rgb_no_alpha(im)


def save_png_24bit(rgb: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    rgb.save(path, "PNG", optimize=True)


def main() -> None:
    if not SOURCE_DIR.is_dir():
        raise SystemExit(f"Missing source dir: {SOURCE_DIR}")

    OUT_SCREEN.mkdir(parents=True, exist_ok=True)
    OUT_PROMO.mkdir(parents=True, exist_ok=True)

    # Screenshots (max 5) — порядок: готовый 640x400, затем 1280x800 из остальных
    jobs = [
        ("640.png", 640, 400, "01-screenshot-640x400.png"),
        ("Screenshot_1.png", 1280, 800, "02-screenshot-1280x800.png"),
        ("editor.png", 1280, 800, "03-screenshot-1280x800.png"),
        ("editor_short.png", 1280, 800, "04-screenshot-1280x800.png"),
        ("plugin.png", 1280, 800, "05-screenshot-1280x800.png"),
    ]

    for name, tw, th, out_name in jobs:
        src = SOURCE_DIR / name
        if not src.exists():
            print(f"SKIP (missing): {src}")
            continue
        im = Image.open(src)
        if im.size == (tw, th):
            rgb = to_rgb_no_alpha(im)
        else:
            rgb = resize_cover_rgb(im, tw, th)
        save_png_24bit(rgb, OUT_SCREEN / out_name)
        print(f"OK {out_name} <- {name} ({tw}x{th})")

    # Promo: small from plugin (иконка/компакт), large from editor (широкий UI)
    promo_small_src = SOURCE_DIR / "plugin.png"
    promo_large_src = SOURCE_DIR / "editor_short.png"
    if promo_small_src.exists():
        save_png_24bit(resize_cover_rgb(Image.open(promo_small_src), 440, 280), OUT_PROMO / "promo-small-440x280.png")
        print("OK promo-small-440x280.png <- plugin.png")
    if promo_large_src.exists():
        save_png_24bit(resize_cover_rgb(Image.open(promo_large_src), 1400, 560), OUT_PROMO / "promo-large-1400x560.png")
        print("OK promo-large-1400x560.png <- editor_short.png")


if __name__ == "__main__":
    main()
