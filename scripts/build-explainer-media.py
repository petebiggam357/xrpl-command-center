#!/usr/bin/env python3
"""
Compose a crisp 1920x1080 MP4 promo explainer video and a lightweight
animated GIF tour from real XRPL Command Center screenshots.
"""

import os
import subprocess
import tempfile
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS_DIR = os.path.join(ROOT, "docs", "media", "screenshots")
OUT_MP4 = os.path.join(ROOT, "docs", "media", "xrpl-command-center-promo.mp4")
OUT_GIF = os.path.join(ROOT, "docs", "media", "xrpl-command-center-tour.gif")

W, H = 1920, 1080
FPS = 30

SLIDES = [
    (
        "01-command-deck.png",
        "01 / COMMAND DECK",
        "60fps Live Consensus Core, Particle River & Mempool Fee Radar",
        "Watch XRPL consensus close every ~3.5s with live open-ledger fee pressure & Whale Radar.",
        (34, 211, 238),
    ),
    (
        "02-wallets-defi.png",
        "02 / WALLETS & PRO DEFI STUDIO",
        "Rust Argon2id Vault + Ledger, Trezor, Cold QR & Multi-Sig",
        "Process-isolated signing, Dry-Run Tx Simulator, Escrow Vesting & Security Audit (.md).",
        (52, 211, 153),
    ),
    (
        "03-3d-globe.png",
        "03 / 3D CONTINENT CONSENSUS GLOBE",
        "Interactive WebGL2 Global Validator & Peer Topology",
        "Real world continents, click-to-inspect node details drawer & live geodesic consensus arcs.",
        (56, 189, 248),
    ),
    (
        "04-tokens-dex-amm.png",
        "04 / TOKENS, CLOB DEX & XLS-30 AMM",
        "Live CLOB vs. AMM Spread Radar & Impermanent Loss Simulator",
        "Verify issuer flags on-ledger, compare live spreads & model LP fee APR vs. IL before depositing.",
        (167, 139, 250),
    ),
    (
        "05-nft-studio.png",
        "05 / XLS-20 NFT STUDIO & LAUNCHPAD",
        "1-of-1 & Collection Batch Minter + Creator Playbook",
        "XLS-24d metadata linter, NFTokenPage reserve planner, rarity analyzer & whitelist airdrops.",
        (232, 121, 249),
    ),
    (
        "06-vaults-lending.png",
        "06 / XLS-65 VAULTS & XLS-66 LENDING",
        "Native Single Asset Vaults & First-Loss Cover Waterfall",
        "Amendment-aware VaultCreate, LoanBrokerSet & interactive default-shock stress testing.",
        (52, 211, 153),
    ),
    (
        "07-node-ops.png",
        "07 / MY NODE OPS & 1-CLICK DOCKER",
        "Self-Hosted rippled Node, Custom Drive Picker & Node Doctor",
        "Spin up a local Mainnet node in 1 click, stream trustless 1ms data & diagnose sync health.",
        (251, 191, 36),
    ),
    (
        "08-xrpl-academy-animations.png",
        "08 / XRPL ACADEMY & VISUAL EXPLAINERS",
        "11 Deep Lessons + 5 Interactive 60fps Protocol Animations",
        "Learn Consensus, Fee Escalation, AMM Auto-Bridging & XLS-65/66 Vaults hands-on.",
        (34, 211, 238),
    ),
]


def load_font(size: int, bold: bool = False):
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    for p in candidates:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


FONT_H1 = load_font(66, True)
FONT_H2 = load_font(34, True)
FONT_SUB = load_font(24, False)
FONT_BADGE = load_font(20, True)
FONT_SMALL = load_font(18, False)


def make_grid_bg():
    img = Image.new("RGB", (W, H), (5, 9, 20))
    draw = ImageDraw.Draw(img)
    for x in range(0, W, 48):
        draw.line([(x, 0), (x, H)], fill=(12, 24, 44), width=1)
    for y in range(0, H, 48):
        draw.line([(0, y), (W, y)], fill=(12, 24, 44), width=1)
    return img


def render_title_card(title: str, subtitle: str, footer: str) -> Image.Image:
    img = make_grid_bg()
    draw = ImageDraw.Draw(img)
    # Accent frame
    draw.rounded_rectangle([120, 180, W - 120, H - 180], radius=36, fill=(9, 17, 34), outline=(34, 211, 238), width=3)
    draw.text((W // 2, 360), "XRPL COMMAND CENTER", fill=(34, 211, 238), font=FONT_BADGE, anchor="mm")
    draw.text((W // 2, 465), title, fill=(248, 250, 252), font=FONT_H1, anchor="mm")
    draw.text((W // 2, 565), subtitle, fill=(148, 163, 184), font=FONT_SUB, anchor="mm")
    draw.rounded_rectangle([W // 2 - 420, 650, W // 2 + 420, 725], radius=16, fill=(14, 34, 56), outline=(52, 211, 153), width=2)
    draw.text((W // 2, 687), footer, fill=(110, 231, 183), font=FONT_SUB, anchor="mm")
    return img


def render_feature_card(shot_file: str, badge: str, title: str, subtitle: str, accent) -> Image.Image:
    img = make_grid_bg()
    draw = ImageDraw.Draw(img)

    # Load and fit screenshot into sleek framed viewport
    shot_path = os.path.join(SHOTS_DIR, shot_file)
    shot = Image.open(shot_path).convert("RGB")
    target_w, target_h = 1520, 820
    shot_resized = shot.resize((target_w, target_h), Image.Resampling.LANCZOS)

    sx = (W - target_w) // 2
    sy = 42
    # Glow border
    draw.rounded_rectangle([sx - 4, sy - 4, sx + target_w + 4, sy + target_h + 4], radius=20, outline=accent, width=3)
    img.paste(shot_resized, (sx, sy))

    # Lower-third glassmorphic caption bar
    bar_y1 = sy + target_h + 18
    bar_y2 = H - 30
    draw.rounded_rectangle([sx, bar_y1, sx + target_w, bar_y2], radius=20, fill=(9, 17, 34), outline=(30, 58, 95), width=2)

    # Pill badge
    draw.rounded_rectangle([sx + 28, bar_y1 + 22, sx + 430, bar_y1 + 58], radius=10, fill=(15, 29, 54), outline=accent, width=2)
    draw.text((sx + 44, bar_y1 + 40), badge, fill=accent, font=FONT_BADGE, anchor="lm")

    draw.text((sx + 28, bar_y1 + 92), title, fill=(248, 250, 252), font=FONT_H2, anchor="lm")
    draw.text((sx + 28, bar_y1 + 134), subtitle, fill=(148, 163, 184), font=FONT_SUB, anchor="lm")

    # Right-side version tag
    draw.text((sx + target_w - 28, bar_y1 + 42), "v0.2.8-beta • 100% Free & Open Source", fill=(100, 116, 139), font=FONT_SMALL, anchor="rm")
    return img


def main():
    os.makedirs(os.path.dirname(OUT_MP4), exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        cards = []
        cards.append(
            render_title_card(
                "Real-Time XRP Ledger Cockpit",
                "60fps Telemetry • Rust Argon2id Vault • 3D Globe • NFT Studio • 1-Click Docker Node",
                "Linux .AppImage  •  Windows .exe  •  macOS .dmg  •  MIT Open Source",
            )
        )
        for s in SLIDES:
            cards.append(render_feature_card(*s))
        cards.append(
            render_title_card(
                "Trustless. Local. Free Forever.",
                "Run your own XRPL Mainnet node in 1 click — zero API limits, zero key escrow.",
                "XRPL Command Center v0.2.8-beta  •  Download & Verify SHA-256",
            )
        )

        # Save each card PNG and build smooth xfade MP4 using ffmpeg
        card_paths = []
        for idx, card in enumerate(cards):
            p = os.path.join(tmp, f"card_{idx:02d}.png")
            card.save(p, "PNG")
            card_paths.append(p)

        # Build ffmpeg filter_complex with 3.2s per slide & 0.5s smooth fade transitions
        inputs = []
        slide_dur = 3.2
        fade_dur = 0.5
        for p in card_paths:
            inputs += ["-loop", "1", "-t", str(slide_dur), "-i", p]

        filters = []
        for i in range(len(card_paths)):
            filters.append(f"[{i}:v]fps={FPS},format=yuv420p[v{i}]")

        cur = "v0"
        offset = slide_dur - fade_dur
        for i in range(1, len(card_paths)):
            nxt = f"xf{i}"
            filters.append(f"[{cur}][v{i}]xfade=transition=fade:duration={fade_dur}:offset={offset:.2f}[{nxt}]")
            cur = nxt
            offset += slide_dur - fade_dur

        filter_complex = ";".join(filters)
        cmd_mp4 = [
            "ffmpeg", "-y",
            *inputs,
            "-filter_complex", filter_complex,
            "-map", f"[{cur}]",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "medium", "-crf", "22",
            "-movflags", "+faststart",
            OUT_MP4,
        ]
        subprocess.run(cmd_mp4, check=True)
        print("[media] Built MP4:", OUT_MP4)

        # Build compact 960x540 animated GIF tour for GitHub README (fast-loading palette)
        palette = os.path.join(tmp, "palette.png")
        subprocess.run(
            ["ffmpeg", "-y", "-i", OUT_MP4, "-vf", "fps=6,scale=960:-1:flags=lanczos,palettegen=max_colors=128", palette],
            check=True,
        )
        subprocess.run(
            [
                "ffmpeg", "-y", "-i", OUT_MP4, "-i", palette,
                "-lavfi", "fps=6,scale=960:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3",
                OUT_GIF,
            ],
            check=True,
        )
        print("[media] Built GIF:", OUT_GIF)


if __name__ == "__main__":
    main()
