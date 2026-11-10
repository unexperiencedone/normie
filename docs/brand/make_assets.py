"""Build Normie's web logo assets from the Canva exports in docs/brand/canva-src/.

Canva's free plan cannot export transparent PNGs, so transparency is recovered here:

* Wordmark: the dark wordmark is exported on a perfectly solid ink background b = rgb(10,12,16).
  Every pixel is a blend p = a*f + (1-a)*b of the background and one of two known ink colours f
  (off-white for "nor"/"ie", lime for the "m"). For each pixel we pick the f that explains it best and
  solve for the coverage a = <p-b, f-b> / |f-b|^2. That gives a clean alpha mask with smooth
  anti-aliased edges, which is then refilled in any palette (light or dark surfaces).
* Icon: the tile's geometry is known (a rounded square), so it is cropped and its corners are cut with
  a supersampled rounded-rectangle mask.

Run:  uv run --no-project --with pillow --with numpy python docs/brand/make_assets.py
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "docs/brand/canva-src"
OUT_DOCS = ROOT / "docs/brand"
OUT_WEB = ROOT / "frontend/public/brand"
OUT_APP = ROOT / "frontend/src/app"

INK = np.array([10, 12, 16], float)
OFFWHITE = np.array([238, 241, 245], float)  # the dark export's "nor" / "ie"
LIME = np.array([200, 245, 96], float)  # the dark export's "m"

PALETTES = {
    # name: (letters colour, "m" colour)
    "wordmark-light": ((10, 12, 16), (109, 92, 245)),  # ink + violet: on paper / white surfaces
    "wordmark-dark": ((238, 241, 245), (200, 245, 96)),  # off-white + lime: on ink surfaces
}


def coverage(img: np.ndarray, fg: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Alpha for each pixel assuming it blends `fg` over INK, plus the residual of that fit."""
    d = img - INK
    f = fg - INK
    a = np.clip((d @ f) / (f @ f), 0.0, 1.0)
    resid = np.linalg.norm(d - a[..., None] * f, axis=-1)
    return a, resid


def wordmarks() -> None:
    img = np.asarray(Image.open(SRC / "wordmark-dark-opaque.png").convert("RGB"), float)
    a_txt, r_txt = coverage(img, OFFWHITE)
    a_m, r_m = coverage(img, LIME)
    is_m = r_m < r_txt  # which ink explains the pixel better
    alpha = np.where(is_m, a_m, a_txt)
    alpha[alpha < 0.02] = 0  # kill compression noise in the flat background

    ys, xs = np.nonzero(alpha > 0.05)
    pad = int(0.04 * (ys.max() - ys.min()))
    y0, y1 = max(ys.min() - pad, 0), min(ys.max() + pad, img.shape[0])
    x0, x1 = max(xs.min() - pad, 0), min(xs.max() + pad, img.shape[1])
    alpha, is_m = alpha[y0:y1, x0:x1], is_m[y0:y1, x0:x1]

    for name, (txt, m) in PALETTES.items():
        rgb = np.where(is_m[..., None], np.array(m, float), np.array(txt, float))
        rgba = np.dstack([rgb, alpha * 255]).round().astype(np.uint8)
        im = Image.fromarray(rgba, "RGBA")
        im.save(OUT_DOCS / f"{name}.png")
        # web copy: 160px tall is plenty for a 40px header at 4x density
        h = 160
        im.resize((round(im.width * h / im.height), h), Image.LANCZOS).save(OUT_WEB / f"{name}.png", optimize=True)
        print(name, im.size)


def icon() -> None:
    src = Image.open(SRC / "icon-opaque.png").convert("RGB")
    arr = np.asarray(src, int)
    tile = np.all(np.abs(arr - INK) < 30, axis=-1) | (arr[..., 1] > 200) & (arr[..., 2] < 140)
    # tile bounding box = rows/cols that are mostly tile pixels
    rows = np.nonzero(tile.mean(axis=1) > 0.2)[0]
    cols = np.nonzero(tile.mean(axis=0) > 0.2)[0]
    box = (cols.min(), rows.min(), cols.max() + 1, rows.max() + 1)
    crop = src.crop(box)
    w, h = crop.size
    # rounded-square mask (22% corner radius, as drawn in Canva), 4x supersampled, inset 1px
    s = 4
    mask = Image.new("L", (w * s, h * s), 0)
    ImageDraw.Draw(mask).rounded_rectangle((s, s, w * s - s, h * s - s), radius=int(0.22 * w * s), fill=255)
    mask = mask.resize((w, h), Image.LANCZOS)
    full = crop.convert("RGBA")
    full.putalpha(mask)
    full.save(OUT_DOCS / "icon.png")
    for size, name in [(512, "icon-512.png"), (192, "icon-192.png")]:
        full.resize((size, size), Image.LANCZOS).save(OUT_WEB / name, optimize=True)
    # Next.js App Router picks these up automatically as <link rel="icon"> / apple-touch-icon
    full.resize((256, 256), Image.LANCZOS).save(OUT_APP / "icon.png", optimize=True)
    # Apple touch icons are shown on their own background: use the full-bleed square tile
    crop.resize((180, 180), Image.LANCZOS).save(OUT_APP / "apple-icon.png", optimize=True)
    # At 16-48px the hand-drawn stroke is thinner than a pixel, so the favicon uses a bolder "m":
    # the lime stroke is dilated (grown outwards) before downscaling. Large sizes keep the original.
    tc = arr[box[1]:box[3], box[0]:box[2]]
    lime = Image.fromarray((((tc[..., 1] - tc[..., 2]) > 60) * 255).astype(np.uint8), "L")  # lime = green far above blue; greys and paper are not
    bold = lime.filter(ImageFilter.MaxFilter(25)).filter(ImageFilter.GaussianBlur(2))
    small = Image.new("RGBA", (w, h), (10, 12, 16, 255))
    small.paste(Image.new("RGBA", (w, h), (200, 245, 96, 255)), (0, 0), bold)
    small.putalpha(mask)
    small.save(OUT_DOCS / "icon-small.png")
    small.resize((48, 48), Image.LANCZOS).save(OUT_APP / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    print("icon", crop.size, "box", box)


def share_image() -> None:
    """1200x630 link-preview card (Open Graph / X): the dark logo, trimmed and centred on ink."""
    src = np.asarray(Image.open(SRC / "logo-dark.png").convert("RGB"), float)
    ink = np.linalg.norm(src - INK, axis=-1) > 18
    ys, xs = np.nonzero(ink)
    art = Image.open(SRC / "logo-dark.png").convert("RGB").crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    scale = min(900 / art.width, 400 / art.height)
    art = art.resize((round(art.width * scale), round(art.height * scale)), Image.LANCZOS)
    card = Image.new("RGB", (1200, 630), (10, 12, 16))
    card.paste(art, ((1200 - art.width) // 2, (630 - art.height) // 2))
    # JPEG: the format WhatsApp/Facebook previews handle most reliably, and small enough for mobile data
    for name in ("opengraph-image.jpg", "twitter-image.jpg"):
        card.save(OUT_APP / name, quality=88, optimize=True, progressive=True)
    card.save(OUT_DOCS / "share-card.png")
    print("share card", art.size)


if __name__ == "__main__":
    OUT_WEB.mkdir(parents=True, exist_ok=True)
    wordmarks()
    icon()
    share_image()
    for f in ["logo-primary.png", "logo-dark.png"]:
        Image.open(SRC / f).save(OUT_DOCS / f)
