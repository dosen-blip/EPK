"""Bake a depth map of a hero video for the hero's depth lighting (app/_hero/hero-light.ts).

Runs Depth Anything V2 Small over the video at a few frames a second and packs the frames into one grayscale
atlas image (near = white) plus a small JSON description, both imported by the site. Run it again if a hero
video changes:

    <python with torch + transformers> scripts/hero-depth/build.py public/media/hero/hero-mobile-v3.mp4 hero-mobile-depth
    <python with torch + transformers> scripts/hero-depth/build.py public/media/hero/hero-desktop-v1.mp4 hero-desktop-depth

The Python needs torch, transformers, pillow and numpy; it isn't part of the site's own dependencies.
"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "app/_hero/depth"
FPS = 12
# Shot cuts and strobe flashes (ffmpeg scene score above this): depth is never blended across one, which would
# light the new shot with the last one's shapes for a moment (a ghost).
CUT_SCORE = 0.32
# Keep the atlas within the 4096 px texture limit many phones have.
MAX_ATLAS = 4096
# Soft lighting needs little resolution: about 96 x 170 for portrait video, 170 x 96 for landscape.
CELL_SHORT, CELL_LONG = 96, 170
MODEL = "depth-anything/Depth-Anything-V2-Small-hf"


def main(video, name):
    import torch
    from transformers import pipeline

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    depth = pipeline("depth-estimation", model=MODEL, device=device)
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(
            ["ffmpeg", "-loglevel", "error", "-i", video, "-vf", f"fps={FPS},scale='if(gt(iw,ih),640,432)':-2", f"{tmp}/f%05d.png"],
            check=True,
        )
        frames = sorted(Path(tmp).glob("f*.png"))
        width, height = Image.open(frames[0]).size
        maps = []
        for i, frame in enumerate(frames):
            result = depth(Image.open(frame).convert("RGB"))
            maps.append(np.asarray(result["predicted_depth"].squeeze().float().cpu(), np.float32))
            if i % 40 == 0:
                print(f"depth {i + 1}/{len(frames)}")

    probe = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", video, "-vf", f"select='gt(scene,{CUT_SCORE})',showinfo", "-f", "null", "-"],
        capture_output=True, text=True,
    ).stderr
    cuts = [round(float(t), 4) for t in __import__("re").findall(r"pts_time:([0-9.]+)", probe)]

    # Relative depth (larger = nearer). Normalise with percentiles eased over time, so the map doesn't pump
    # brighter and darker from frame to frame as the crowd moves.
    CELL_W, CELL_H = (CELL_LONG, CELL_SHORT) if width > height else (CELL_SHORT, CELL_LONG)
    lo_s = hi_s = None
    cells = []
    for i, m in enumerate(maps):
        lo, hi = np.percentile(m, 2), np.percentile(m, 98)
        fresh = lo_s is None or any((i - 1) / FPS < cut <= i / FPS for cut in cuts)
        lo_s = lo if fresh else lo_s * 0.8 + lo * 0.2
        hi_s = hi if fresh else hi_s * 0.8 + hi * 0.2
        n = np.clip((m - lo_s) / max(1e-6, hi_s - lo_s), 0, 1)
        img = Image.fromarray((n * 255).astype(np.uint8)).resize((CELL_W, CELL_H), Image.BILINEAR)
        cells.append(np.asarray(img.filter(ImageFilter.GaussianBlur(1.2)), np.float32))
    # A light temporal smooth (neighbouring frames) keeps the lighting from shimmering, but never across a cut.
    def same_shot(i, j):
        lo, hi = sorted((i / FPS, j / FPS))
        return not any(lo < cut <= hi for cut in cuts)

    smooth = []
    for i in range(len(cells)):
        prev = cells[i - 1] if i > 0 and same_shot(i - 1, i) else cells[i]
        nxt = cells[i + 1] if i + 1 < len(cells) and same_shot(i, i + 1) else cells[i]
        smooth.append((prev + 2 * cells[i] + nxt) / 4)
    # A roughly square grid, so neither side of the atlas runs past the texture limit.
    cols = max(1, round((len(smooth) * CELL_H / CELL_W) ** 0.5))
    rows = -(-len(smooth) // cols)
    if cols * CELL_W > MAX_ATLAS or rows * CELL_H > MAX_ATLAS:
        raise SystemExit(f"atlas {cols * CELL_W}x{rows * CELL_H} is over {MAX_ATLAS}px; lower FPS or the cell size")
    atlas = np.zeros((rows * CELL_H, cols * CELL_W), np.uint8)
    for i, cell in enumerate(smooth):
        r, c = divmod(i, cols)
        atlas[r * CELL_H:(r + 1) * CELL_H, c * CELL_W:(c + 1) * CELL_W] = np.clip(cell, 0, 255).astype(np.uint8)

    OUT.mkdir(parents=True, exist_ok=True)
    Image.fromarray(atlas).convert("RGB").save(OUT / f"{name}.webp", quality=82, method=6)
    meta = {"fps": FPS, "frames": len(smooth), "cols": cols, "rows": rows, "cellWidth": CELL_W, "cellHeight": CELL_H, "cuts": cuts}
    (OUT / f"{name}.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(f"wrote {len(smooth)} frames to {OUT.relative_to(ROOT)}/{name}.webp ({(OUT / f'{name}.webp').stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else str(ROOT / "public/media/hero/hero-mobile-v3.mp4"), sys.argv[2] if len(sys.argv) > 2 else "hero-mobile-depth")
