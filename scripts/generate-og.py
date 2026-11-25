"""Generate the brand-faithful 1200x630 Open Graph share image from live snapshot.json."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SNAP = json.loads((ROOT / "public" / "data" / "snapshot.json").read_text(encoding="utf-8"))
FONTS = ROOT / "public" / "assets" / "fonts"
ASSETS = ROOT / "public" / "assets"

W, H = 1200, 630
img = Image.new("RGB", (W, H), (18, 16, 14))  # #12100E ground

# Smooth top-right maroon (#3A1420) radial glow
px = img.load()
cx, cy = int(W * 0.86), int(H * 0.14)
max_r = 760.0
for y in range(H):
    dy = y - cy
    dy2 = dy * dy
    for x in range(W):
        dx = x - cx
        d = (dx * dx + dy2) ** 0.5
        if d < max_r:
            t = (1.0 - d / max_r) ** 2.1
            r = int(18 + (58 - 18) * t)
            g = int(16 + (20 - 16) * t)
            b = int(14 + (32 - 14) * t)
            px[x, y] = (r, g, b)

draw = ImageDraw.Draw(img)

# Outer subtle border frame
draw.rounded_rectangle((28, 28, W - 28, H - 28), radius=18, outline=(69, 62, 55), width=1)

# Load brand kit fonts
f_serif = ImageFont.truetype(str(FONTS / "InstrumentSerif-Regular.ttf"), 78)
f_serif_it = ImageFont.truetype(str(FONTS / "InstrumentSerif-Italic.ttf"), 78)
f_body = ImageFont.truetype(str(FONTS / "InterTight-Variable.ttf"), 24)
f_label = ImageFont.truetype(str(FONTS / "InterTight-Variable.ttf"), 18)
f_mono = ImageFont.truetype(str(FONTS / "DepartureMono-Regular.otf"), 22)
f_mono_lg = ImageFont.truetype(str(FONTS / "DepartureMono-Regular.otf"), 34)
f_mono_sm = ImageFont.truetype(str(FONTS / "DepartureMono-Regular.otf"), 16)

# Top-left lockup (>= 30% width per brand kit: 360px wide)
lockup = Image.open(ASSETS / "taskmarket-lockup.png").convert("RGBA")
lw = 360
lh = int(lockup.height * (lw / lockup.width))
lockup = lockup.resize((lw, lh), Image.Resampling.LANCZOS)
img.paste(lockup, (68, 60), lockup)

# Top-right domain in Departure Mono
addr = "taskmarket.dev"
ab = draw.textbbox((0, 0), addr, font=f_mono)
draw.text((W - 68 - (ab[2] - ab[0]), 74), addr, font=f_mono, fill=(239, 233, 226))

# Headline: Instrument Serif with one italic magenta word
h1_a = "Live pulse of the "
h1_b = "market."
draw.text((68, 178), h1_a, font=f_serif, fill=(239, 233, 226))
w_a = draw.textbbox((68, 178), h1_a, font=f_serif)[2]
draw.text((w_a, 178), h1_b, font=f_serif_it, fill=(231, 64, 121))  # #E74079 magenta

# Subtitle
draw.text(
    (68, 276),
    "Tempo (OUSD) & Base (USDC) — escrow flows, weekly posters, and swarm attention.",
    font=f_body,
    fill=(176, 167, 157),  # #B0A79D muted
)

# 4 live metric cards from snapshot.json
ms_t = SNAP["marketStats"]["tempo"]
ms_b = SNAP["marketStats"]["base"]
comb = SNAP["analytics"]["combined"]
cards = [
    ("ACTIVE AGENTS (7D)", f"{ms_t['activeAgents7d']:,}"),
    ("PUBLIC TASKS", f"{comb['totalTasks']:,}"),
    ("ESCROW VOLUME", f"${comb['totalRewardUsd']:,.0f}"),
    ("DISTINCT POSTERS", f"{comb['distinctPostersAllTime']:,}"),
]

card_y = 354
card_h = 148
gap = 18
card_w = (W - 136 - gap * 3) // 4
for i, (lbl, val) in enumerate(cards):
    x0 = 68 + i * (card_w + gap)
    x1 = x0 + card_w
    draw.rounded_rectangle((x0, card_y, x1, card_y + card_h), radius=12, fill=(34, 30, 26), outline=(69, 62, 55), width=1)
    draw.text((x0 + 20, card_y + 24), lbl, font=f_mono_sm, fill=(176, 167, 157))
    draw.text((x0 + 20, card_y + 66), val, font=f_mono_lg, fill=(255, 246, 232))

# Bottom metadata strip
as_of = SNAP["fetchedAtUtc"].replace("T", " ")[:16] + " UTC"
draw.text((68, 542), f"DATA AS OF {as_of}  /  TEMPO (4217) + BASE (8453)", font=f_mono_sm, fill=(176, 167, 157))
note = "Independent bounty visualizer (TSK-BRK611AN)"
nb = draw.textbbox((0, 0), note, font=f_label)
draw.text((W - 68 - (nb[2] - nb[0]), 540), note, font=f_label, fill=(176, 167, 157))

out_path = ROOT / "public" / "og-share.png"
img.save(out_path, format="PNG", optimize=True)
print(f"Wrote {out_path} ({out_path.stat().st_size} bytes)")
