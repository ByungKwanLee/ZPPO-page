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
script.js            Theme toggle, results table, qualitative carousel
assets/
  nvidia-logo.svg    Navbar / footer logo (currentColor for wordmark)
  og-thumbnail.png   PLACEHOLDER — replace with your custom thumbnail (1200×630)
  og-placeholder.svg (alternative SVG version of the placeholder)
  figures/           PNG figures converted from the paper PDFs
  qualitative/       Qualitative example images (banana, coat, books, straws, ...)
```

### Replacing the thumbnail

`assets/og-thumbnail.png` is a placeholder. Replace the file in-place (keep
the same name) and the link preview on KakaoTalk / Teams / Slack / Twitter will
pick it up automatically — no other edits needed. Target size: **1200×630 px**.

## Deployment

The page is fully static. Drop the whole folder on any host:

- GitHub Pages (recommended) — push to `main` and enable Pages.
- Any S3 / Cloudflare Pages / Vercel / Netlify static site.

## Theme

- Default: **dark** (NVIDIA dark + green accent).
- Toggle in the top-right of the navbar.
- Choice is persisted in `localStorage` as `zppo-theme`.

## Customizing the results table

The headline tables live as plain JS objects in `script.js`:
- `DATA.VLM`, `DATA.LLM`, `DATA.Video` (× `0.8B / 2B / 4B / 9B`).
- `COLS.VLM / .LLM / .Video` set the column order.
Edit those constants if any number changes; the UI re-renders automatically.

## Qualitative carousel

Edit the `QUAL` array in `script.js`. Each entry has:
- `img`, `question`, `ref`, `studentWrong`
- `bcq.text`, `bcq.verdict` ('ok' | 'no')
- `ncq.text`, `ncq.verdict`

Keyboard: ← / → ; mobile: touch-swipe.

## License & affiliation

© NVIDIA. Project lead: Byung-Kwan Lee.
