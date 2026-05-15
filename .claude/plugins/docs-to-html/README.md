# docs-to-html

Turn one or more local files (markdown, HTML, txt, JSON/YAML, images) into a single self-contained, information-dense, interactive HTML bundle you can open offline.

## Invoke

```
/docs-to-html <path>...        # explicit args win
/docs-to-html                  # no args → interactive picker
```

Args may be files, directories (recursed), or globs. Mixed input is fine.

## Output

```
<cwd>/docs-html-bundles/<slug>-YYYYMMDD-HHMM.html
```

The skill auto-picks a layout based on input count:

| Inputs | Layout |
|---|---|
| 1 | Single page + sticky TOC |
| 2–3 | Single page + sticky TOC (one section per file) |
| 4–20 | Sidebar + content (Docsify-like) |
| > 20 | Card grid landing + drill-in content pane |

Override with `--layout=single|sidebar|grid`.

## Features (baked into every output)

- **Search** — full-text, client-side, `Cmd/Ctrl+K` to focus
- **Tag filter** — auto-extracted from frontmatter, bracketed heading prefixes, parent dirs
- **Theme** — light/dark/system, persists in `localStorage`
- **Copy-link** — hover any heading for a stable `#fragment` URL

## Offline by design

- No CDN fonts (system-ui fallback)
- All libs vendored in `scripts/vendor/`
- Output works fully offline

## Limits

- Single file inlined: 5 MB max
- Total output: 50 MB hard cap
- PDFs: not supported (skipped with warning)
