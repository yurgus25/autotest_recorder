"""
Генерация промо-плиток Chrome Web Store: 440x280 и 1400x560 (RGB PNG, без альфы).
Запуск из корня репозитория: python scripts/build-cws-promo-branded.py
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ICON_PATH = ROOT / "icons" / "icon128.png"
OUT_DIR = ROOT / "CWS" / "promo"

# Тёмный градиент (читаемый текст белый)
C_TOP = (30, 58, 95)
C_BOT = (13, 27, 42)
ACCENT = (66, 165, 245)


def _font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = []
    if bold:
        candidates += [
            Path(r"C:\Windows\Fonts\segoeuib.ttf"),
            Path(r"C:\Windows\Fonts\arialbd.ttf"),
            Path(r"C:\Windows\Fonts\calibrib.ttf"),
        ]
    else:
        candidates += [
            Path(r"C:\Windows\Fonts\segoeui.ttf"),
            Path(r"C:\Windows\Fonts\arial.ttf"),
            Path(r"C:\Windows\Fonts\calibri.ttf"),
        ]
    for p in candidates:
        if p.exists():
            try:
                return ImageFont.truetype(str(p), size)
            except OSError:
                continue
    return ImageFont.load_default()


def gradient_rgb(size: tuple[int, int]) -> Image.Image:
    w, h = size
    img = Image.new("RGB", (w, h))
    draw = ImageDraw.Draw(img)
    for y in range(h):
        t = y / max(h - 1, 1)
        r = int(C_TOP[0] * (1 - t) + C_BOT[0] * t)
        g = int(C_TOP[1] * (1 - t) + C_BOT[1] * t)
        b = int(C_TOP[2] * (1 - t) + C_BOT[2] * t)
        draw.line([(0, y), (w, y)], fill=(r, g, b))
    return img


def paste_icon(canvas: Image.Image, icon: Image.Image, box: tuple[int, int, int, int]) -> None:
    icon_rgba = icon.convert("RGBA")
    icon_rgba.thumbnail((box[2] - box[0], box[3] - box[1]), Image.Resampling.LANCZOS)
    iw, ih = icon_rgba.size
    x = box[0] + (box[2] - box[0] - iw) // 2
    y = box[1] + (box[3] - box[1] - ih) // 2
    canvas.paste(icon_rgba, (x, y), icon_rgba)


def draw_small() -> None:
    w, h = 440, 280
    img = gradient_rgb((w, h))
    draw = ImageDraw.Draw(img)
    icon = Image.open(ICON_PATH)
    paste_icon(img, icon, (20, 70, 132, 210))

    title = _font(22, bold=True)
    sub = _font(13, bold=False)
    draw.text((140, 78), "AutoTest Recorder", fill="white", font=title)
    draw.text((140, 108), "& Player", fill="white", font=title)
    draw.text((140, 148), "No-code web test automation", fill=ACCENT, font=sub)
    draw.text((140, 168), "Record · Edit · Replay", fill=(200, 210, 220), font=sub)

    accent_bar = Image.new("RGB", (4, 96), ACCENT)
    img.paste(accent_bar, (20, 92))

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / "promo-small-440x280.png"
    img.save(out, "PNG", optimize=True)
    print(f"OK {out} ({w}x{h})")


def draw_large() -> None:
    w, h = 1400, 560
    img = gradient_rgb((w, h))
    draw = ImageDraw.Draw(img)
    icon = Image.open(ICON_PATH)
    paste_icon(img, icon, (80, 120, 280, 440))

    title_font = _font(52, bold=True)
    sub_font = _font(22, bold=False)
    bullet_font = _font(18, bold=False)

    draw.text((320, 140), "AutoTest Recorder & Player", fill="white", font=title_font)
    draw.text((320, 220), "No-code web test automation for Chrome", fill=ACCENT, font=sub_font)

    lines = [
        "• Record user flows · Visual editor · Smart waits & self-healing",
        "• Playback with logs & screenshots · Manifest V3",
    ]
    y = 290
    for line in lines:
        draw.text((320, y), line, fill=(220, 228, 236), font=bullet_font)
        y += 36

    # Декоративная полоса справа
    for i in range(8):
        a = 40 + i * 12
        draw.rectangle([w - 120 + i * 8, 0, w - 112 + i * 8, h], fill=(a, 70 + i * 8, 120 + i * 5))

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / "promo-large-1400x560.png"
    img.save(out, "PNG", optimize=True)
    print(f"OK {out} ({w}x{h})")


def main() -> None:
    if not ICON_PATH.is_file():
        raise SystemExit(f"Icon not found: {ICON_PATH}")
    draw_small()
    draw_large()


if __name__ == "__main__":
    main()
