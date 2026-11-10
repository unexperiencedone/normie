# Normie brand assets

The logo is a bold "nor·ie" wordmark with a hand-drawn **m** in the middle. The theme comes from
Canva's "Black Orange Minimalist Beauty Logo" template, recoloured in Normie's palette. The
squiggled "m" is the brand mark: it is the one letter that is not "normal".

## Files

| File | What it is | Use it for |
|---|---|---|
| `logo-primary.png` | Full logo on paper: ink wordmark, violet **m**, "DATABASE COPILOT · ESTD 2026" | Title slides, documents, posters on light backgrounds |
| `logo-dark.png` | Full logo on ink: off-white wordmark, lime **m**, captions | Dark slides, social banners, dark posters |
| `wordmark-light.png` | Wordmark only, transparent, ink + violet | Website header, app sidebar, login page (light mode) |
| `wordmark-dark.png` | Wordmark only, transparent, off-white + lime | Footer, dark-mode header and sidebar |
| `icon.png` | Lime **m** on a rounded ink tile, transparent corners | App icon, social avatar, large favicon |
| `icon-small.png` | Same icon with a bolder **m** | 16–48px favicons, where the thin stroke would disappear |

Web copies (resized) live in `frontend/public/brand/`, and the browser-tab icons in
`frontend/src/app/` (`favicon.ico`, `icon.png`, `apple-icon.png`). In code, use the components in
`frontend/src/components/logo.tsx`:
- `<Wordmark />` switches between the light and dark versions with the theme.
- `<Wordmark tone="dark" />` forces the dark version, for surfaces that are always dark.
- `<Logo />` is the icon.

## Where it appears on the site

| Place | Asset |
|---|---|
| Landing top bar, app sidebar, login, projects page | `<Wordmark />`: light version, swaps to dark in dark mode |
| Landing footer | `<Wordmark tone="dark" />` |
| Demo app in the landing hero | wordmark in its sidebar, icon in its copilot header |
| Copilot panel header and welcome screen, collapsed sidebar, login side panel, empty projects page | `<Logo />` (icon) |
| Browser tab | `favicon.ico` (bold "m"), `icon.png` |
| iPhone home screen | `apple-icon.png` |
| "Add to home screen" / install | `manifest.ts` → `icon-192.png`, `icon-512.png`, ink toolbar colour |
| Link previews (WhatsApp, LinkedIn, Slack, X) | `opengraph-image.png` / `twitter-image.png`: the dark logo on a 1200×630 card (`share-card.png` here) |

When the site goes live, set `NEXT_PUBLIC_SITE_URL` to its public address so link previews point
at the right domain.

## Colours

| Role | Hex |
|---|---|
| Ink (wordmark on light) | `#0A0C10` |
| Violet (the **m** on light, buttons) | `#6D5CF5` |
| Lime (the **m** on dark, brand accent) | `#C8F560` |
| Deep lime (small text on light) | `#4F6B0F` |
| Off-white (wordmark on dark) | `#EEF1F5` |
| Paper (light background) | `#F4F5F0` |

Do not put the violet **m** on ink or the lime **m** on paper: both lose contrast. Use the matching
version instead.

## Source designs in Canva

| Design | Link |
|---|---|
| Primary logo (master) | https://www.canva.com/d/3yWQTv7WQUVfzW9 |
| Dark logo | https://www.canva.com/d/mCLv-45g947wmvG |
| Wordmark · light | https://www.canva.com/d/bcYPM49-YO08IDA |
| Wordmark · dark | https://www.canva.com/d/QRWFPClVUHKEYXf |
| Icon | https://www.canva.com/d/VqdFvp4Jh2B0j2R |

## Rebuilding the web files

Canva's free plan cannot export transparent PNGs, so `make_assets.py` recovers transparency:
- **Wordmark:** it is exported on a perfectly solid ink background. For each pixel, the script
  works out how much of the ink colour versus the letter colour it contains (anti-aliased edges
  included). That gives a clean letter mask, which it refills in both palettes.
- **Icon:** the tile has a known shape, so the script crops it and cuts the rounded corners.

After editing a design in Canva, export it as PNG (2000px) into `canva-src/`
(`wordmark-dark-opaque.png`, `icon-opaque.png`, `logo-primary.png`, `logo-dark.png`) and run:

```bash
uv run --no-project --with pillow --with numpy python docs/brand/make_assets.py
```

`canva/` holds the first four AI-generated explorations, kept for the record.
