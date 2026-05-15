---
name: docs-to-html
description: Use when the user wants to turn one or more local files (markdown, HTML, txt, JSON, YAML, images) into a single self-contained, information-dense, interactive HTML bundle they can open offline. Triggers on phrases like "render these docs", "bundle into html", "make a one-pager", "view these together", "docs to html".
---

# docs-to-html

Turn a set of local files into one self-contained, interactive HTML file. The file works offline (no CDN, no fonts, no network), has full-text search, tag filters, theme toggle, and per-heading copy-link anchors.

**Sage zu Beginn:** "Ich nutze docs-to-html, um die Dateien zu einem interaktiven HTML-Bundle zu rendern."

---

## Wann diese Skill greift

Anfragen wie:

- "Render diese Markdown-Dateien zu einem HTML"
- "Mach mir einen Browser-tauglichen One-Pager aus dem Plan-Ordner"
- "Bundle README + SPEC + NOTES für meinen Vater"
- "Docs to HTML"
- "Pack das in eine interaktive HTML-Datei"

Nicht für: Live-Webseite, Server-Doku, etwas das deployt werden soll. Output ist ein **single file**, lokal, offline.

---

## Schritt 0: Inputs sammeln

**Pfad A — Args:** Der User hat Pfade beim Aufruf mitgegeben.

```
/docs-to-html docs/superpowers/plans/ README.md notes/*.md
```

Akzeptierte Argumente:
- Einzelne Dateien
- Verzeichnisse (werden rekursiv expandiert)
- Globs (`*.md`, `docs/**/*.md`)
- Mischbar

Falls Args fehlen → **Pfad B — Interaktiv:**

Frage den User:

> "Welche Dateien sollen ins HTML? Pfade absolut oder relativ, leerzeichengetrennt oder einer pro Zeile. Verzeichnisse werden rekursiv expandiert. Erlaubte Endungen: `.md .html .htm .txt .log .json .yaml .yml .png .jpg .jpeg .gif .webp .svg`."

Sammle die Antwort in ein Bash-Array:

```bash
INPUT_PATHS=(
  # gefüllt aus User-Input
)
```

Falls leer → Abbruch mit Nachfrage statt sang- und klanglos zu sterben.

---

## Schritt 1: Pfade auflösen + filtern

```bash
PLUGIN_DIR=$(realpath "$(dirname "${BASH_SOURCE[0]:-$0}")/../..")
# Fallback wenn aus Claude heraus invoked (kein Bash-Source):
[[ -d "$PLUGIN_DIR/scripts" ]] || PLUGIN_DIR="$(pwd)/.claude/plugins/docs-to-html"

RESOLVED=()
SUPPORTED='\.(md|markdown|html|htm|txt|log|json|yaml|yml|png|jpe?g|gif|webp|svg)$'

for p in "${INPUT_PATHS[@]}"; do
  # Glob expansion (bash shopt -s nullglob handles non-match)
  shopt -s nullglob
  for entry in $p; do
    if [[ -d "$entry" ]]; then
      while IFS= read -r f; do RESOLVED+=("$f"); done < <(find "$entry" -type f -regextype posix-extended -iregex ".*${SUPPORTED}")
    elif [[ -f "$entry" ]]; then
      [[ "$entry" =~ $SUPPORTED ]] && RESOLVED+=("$entry") || echo "skip (unsupported): $entry"
    fi
  done
  shopt -u nullglob
done

if [[ ${#RESOLVED[@]} -eq 0 ]]; then
  echo "Keine passenden Dateien gefunden. Erlaubt: $SUPPORTED"
  exit 1
fi

echo "Resolved: ${#RESOLVED[@]} Datei(en)"
```

**Footgun:** PDFs werden vom Build-Script übersprungen (Warning). Wenn der User PDFs erwartet, ihm das vorher sagen.

---

## Schritt 2: Layout entscheiden

```bash
N=${#RESOLVED[@]}
if [[ -n "$LAYOUT_OVERRIDE" ]]; then
  LAYOUT="$LAYOUT_OVERRIDE"
elif (( N == 1 )); then LAYOUT=single
elif (( N <= 3 )); then LAYOUT=single
elif (( N <= 20 )); then LAYOUT=sidebar
else LAYOUT=grid
fi

echo "→ Auto-Layout: $LAYOUT (für $N Dateien). Override mit --layout=single|sidebar|grid."
```

Vor dem Build kurz dem User mitteilen welches Layout gewählt wurde, sodass er bei "lieber Grid" einsteigen kann ohne nochmal zu starten.

---

## Schritt 3: Build aufrufen

```bash
TS=$(date +%Y%m%d-%H%M)
# Slug: bei 1 Datei → ihr Basename, sonst → Parent-Dir-Name, sonst "bundle"
if (( N == 1 )); then
  SLUG=$(basename "${RESOLVED[0]%.*}")
elif [[ -n "${INPUT_PATHS[0]:-}" && -d "${INPUT_PATHS[0]}" ]]; then
  SLUG=$(basename "${INPUT_PATHS[0]}")
else
  SLUG=bundle
fi
SLUG=$(echo "$SLUG" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9-' '-' | sed 's/-\+/-/g; s/^-\|-$//g')

OUT_DIR="$(pwd)/docs-html-bundles"
mkdir -p "$OUT_DIR"
OUT="${OUT_OVERRIDE:-$OUT_DIR/${SLUG}-${TS}.html}"

TITLE="${TITLE_OVERRIDE:-$SLUG}"

CFG=$(mktemp /tmp/docs-to-html-cfg-XXXXXX.json)
python3 -c '
import json, sys
cfg = {
  "inputs": sys.argv[1:-3],
  "layout": sys.argv[-3],
  "out": sys.argv[-2],
  "title": sys.argv[-1],
}
json.dump(cfg, open("'"$CFG"'", "w"))
' "${RESOLVED[@]}" "$LAYOUT" "$OUT" "$TITLE"

node "$PLUGIN_DIR/scripts/build.mjs" --config "$CFG"
rm -f "$CFG"
```

**Footgun:** Das Build-Script bricht hart ab wenn eine einzelne Datei > 5 MB oder das Gesamtoutput > 50 MB würde — beides absichtlich, weil große Inline-Base64-Bilder den Browser-Parser zum Stehen bringen.

---

## Schritt 4: Öffnen

```bash
echo "✓ $OUT"
if command -v xdg-open >/dev/null; then xdg-open "$OUT" >/dev/null 2>&1 &
elif command -v open >/dev/null; then open "$OUT"
fi
```

Den absoluten Pfad **immer** ausgeben, damit der User die Datei copy-pasten oder verschicken kann, auch wenn `xdg-open` fehlt.

---

## Footguns / Limits

| Was | Warum | Wie umgehen |
|---|---|---|
| PDF wird übersprungen | Browser-PDF-Embed offline zu fragil | Vorher Text via `pdftotext` extrahieren |
| > 5 MB Datei | inline-base64 sprengt Parser | Auf < 5 MB schrumpfen oder weglassen |
| > 50 MB Gesamt | gleiches Problem | Inputs reduzieren |
| Schriften fehlen | Kein CDN — `system-ui` Fallback | Akzeptiert, ist beabsichtigt |
| Mermaid/PlantUML | nicht supported in v0.1 | Block bleibt als Code-Fence |
| Emoji-Shortcodes (`:rocket:`) | marked rendert sie nicht | wörtlich anzeigen |
| Frontmatter-Inkonsistenz | `Tags:` vs `tags:` vs nichts | Skill normalisiert auf lowercase |
| Bilder mit weißem Hintergrund im dark theme | per Design — keine forcierten Filter | Theme-Toggle nutzen |

---

## Layout-Heuristik im Überblick

| Dateien | Layout | Warum |
|---|---|---|
| 1 | single | TOC reicht, kein File-Switcher nötig |
| 2–3 | single | Linear lesbar, eine Section pro Datei |
| 4–20 | sidebar | Echte Navigation zwischen Dateien |
| > 20 | grid | Landing mit Cards skaliert besser als flache Liste |

Override mit `--layout=single|sidebar|grid` wenn der User eine spezifische Präferenz hat.

---

## Was im Output drin ist

- **Topbar** mit Titel, Suchfeld (`⌘K` / `Ctrl+K`), Theme-Toggle
- **Tag-Chips** unter der Topbar — auto-extrahiert aus Frontmatter, Bracket-Prefixes, Parent-Dirs
- **Layout-Body** (single/sidebar/grid wie oben)
- **Search-Highlighting** in-place — Treffer werden mit `<mark>` umrandet
- **Heading-Anchor** — Hover auf H1-H4 zeigt `#`-Button; Klick kopiert stabilen `#fragment`-Link in die Zwischenablage
- **Toast** — Bestätigt "Link copied"
- **PrismJS-Highlighting** für JSON/YAML/Bash/TypeScript/Python Codeblocks

---

## Post-Execution

Diese Skill hält keinen `MISHAP_LOG` selbst — sie ist eine User-facing Tool-Skill, kein langer Runbook. Wenn aus der Ausführung Anomalien auftauchen (z.B. seltsame Markdown-Renderings, unbekannte Frontmatter-Felder), bitte direkt im Antwort-Text erwähnen statt zu ticketen.
