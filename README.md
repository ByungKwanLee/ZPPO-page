# NVIDIA-ZPPO Project Page

Project page for **Zone of Proximal Policy Optimization: Teacher in Prompts, Not Gradients** (NVIDIA Research).

## Local preview

Any static-file server works. Examples:

```bash
# Python (any version)
python -m http.server 8765
# Node
npx serve .
```

Then open <http://localhost:8765/>.

## Files

```
index.html           Page structure + meta tags
styles.css           Theme tokens, dark / light, responsive
script.js            Theme toggle, TL;DR panel, scroll animations, qualitative carousel
assets/
  og-thumbnail.png   Social / link-preview thumbnail
  byungkwan.jpg      "Through Our Lens" author photo
  vygotsky.jpg       Inspiration (ZPD) author photo
  figures/           Method figure (figure2.png)
  qualitative/       Qualitative example images (straws, banana, coat, books, airplane)
```

The NVIDIA logos are inlined as `<svg>` in `index.html` (no logo image files needed).

### Replacing the thumbnail

Replace `assets/og-thumbnail.png` in-place (keep the same name) and the link
preview on KakaoTalk / Teams / Slack / Twitter will pick it up automatically.
If the dimensions change, update `og:image:width` / `og:image:height` in
`index.html` to match.

## Deployment

The page is fully static. Drop the whole folder on any host:

- GitHub Pages (recommended) — push to `main` and enable Pages.
- Any S3 / Cloudflare Pages / Vercel / Netlify static site.

## Theme

- Default: **dark** (NVIDIA dark + green accent).
- Toggle in the top-right of the navbar.
- Choice is persisted in `localStorage` as `zppo-theme`.

## Editing the numbers

The accuracy tables live as a plain JS object in `script.js`:
- `DATA.VLM`, `DATA.LLM`, `DATA.Video` (× `0.8B / 2B / 4B / 9B`).

These drive the TL;DR "Accuracy Gain (Δ pp)" panel.

## Qualitative carousel

Edit the `QUAL` array in `script.js`. Each entry has:
- `img`, `question`, `ref`, `studentWrong`
- `bcq.text`, `bcq.verdict` ('ok' | 'no')
- `ncq.text`, `ncq.verdict`

Keyboard: ← / → ; mobile: touch-swipe.

## License & affiliation

© NVIDIA. Project lead: Byung-Kwan Lee.
