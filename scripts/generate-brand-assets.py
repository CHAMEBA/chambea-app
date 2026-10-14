#!/usr/bin/env python3
"""Generate CHAMBEA native launcher/splash graphics from the user's approved icon."""
import base64
import io
import re
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "branding" / "chambea-icon.webp.base64"
SRC = Image.open(io.BytesIO(base64.b64decode(SOURCE.read_text().strip()))).convert("RGB")
RES = ROOT / "android" / "app" / "src" / "main" / "res"
LANCZOS = Image.Resampling.LANCZOS

def png(im, dest):
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest, format="PNG", optimize=True)

for density, px, scale in [
    ("mdpi", 48, 1), ("hdpi", 72, 1.5), ("xhdpi", 96, 2),
    ("xxhdpi", 144, 3), ("xxxhdpi", 192, 4)
]:
    folder = RES / f"mipmap-{density}"
    flat = SRC.resize((px, px), LANCZOS)
    png(flat, folder / "ic_launcher.png")
    png(flat, folder / "ic_launcher_round.png")

    size = round(108 * scale)
    icon_size = round(size * 0.78)
    foreground = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    inset = SRC.resize((icon_size, icon_size), LANCZOS).convert("RGBA")
    foreground.alpha_composite(inset, ((size-icon_size)//2, (size-icon_size)//2))
    png(foreground, folder / "ic_launcher_foreground.png")

background = RES / "values" / "ic_launcher_background.xml"
background.write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n'
    '<resources><color name="ic_launcher_background">#005450</color></resources>\n',
    encoding="utf-8"
)

ios_icon = (ROOT / "ios" / "App" / "App" / "Assets.xcassets" /
            "AppIcon.appiconset" / "AppIcon-512@2x.png")
png(SRC.resize((1024, 1024), LANCZOS), ios_icon)

splash_sizes = {
    "drawable": (480, 320),
    "drawable-land-mdpi": (480, 320),
    "drawable-land-hdpi": (800, 480),
    "drawable-land-xhdpi": (1280, 720),
    "drawable-land-xxhdpi": (1600, 960),
    "drawable-land-xxxhdpi": (1920, 1280),
    "drawable-port-mdpi": (320, 480),
    "drawable-port-hdpi": (480, 800),
    "drawable-port-xhdpi": (720, 1280),
    "drawable-port-xxhdpi": (960, 1600),
    "drawable-port-xxxhdpi": (1280, 1920)
}
for folder, (w, h) in splash_sizes.items():
    canvas = Image.new("RGB", (w, h), "#FFFFFF")
    side = round(min(w,h) * 0.42)
    icon = SRC.resize((side,side), LANCZOS)
    canvas.paste(icon, ((w-side)//2, (h-side)//2))
    png(canvas, RES / folder / "splash.png")

web = ROOT / "www"
web.mkdir(exist_ok=True)
png(SRC.resize((192,192), LANCZOS), web / "chambea-icon.png")
index = web / "index.html"
if index.exists():
    html = index.read_text(encoding="utf-8")
    html,count = re.subn(
        r'<link\s+rel="icon"[^>]*>',
        '<link rel="icon" type="image/png" sizes="192x192" href="./chambea-icon.png">'
        '<link rel="apple-touch-icon" href="./chambea-icon.png">',
        html,count=1
    )
    if count != 1:
        raise RuntimeError("Could not find CHAMBEA favicon link")
    index.write_text(html, encoding="utf-8")

print("Original CHAMBEA house/wrench icon installed in native Android, iOS, splash and web resources")
