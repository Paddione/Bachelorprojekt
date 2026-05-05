# Mentolder — Website UI kit (reference snapshot)

`index.html` is intended to be a static snapshot of `https://web.mentolder.de/` with `colors_and_type.css` and `styles/website.css` inlined. The live site requires OIDC auth for direct curl — the current file is a placeholder.

To rebuild: `curl -sL https://web.mentolder.de/ -o /tmp/h.html` (from an authenticated session), then inline the stylesheets.

## Brand quick reference

- Background `--ink-900` (deep navy), foreground `--fg` (warm off-white)
- `--brass` accent for italic emphasis and CTAs
- `--sage` secondary accent
- Newsreader serif for headlines, Geist body, Geist Mono labels
