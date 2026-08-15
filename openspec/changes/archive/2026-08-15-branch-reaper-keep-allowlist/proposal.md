# Proposal: branch-reaper-keep-allowlist

## Why

`scripts/branch-reaper.sh --sweep --dry-run` meldet gemergte Branches massenhaft als KEEP, weil
seine Allowlist (`openspec/changes/*`, `docs/code-quality/*`, `website/src/data/*` + 3
Einzeldateien) `openspec/specs/*`, `openspec/changes/archive/*`, `scripts/*`,
`.claude/skills/*`, `tests/*` NICHT deckt. Nach Squash-Merge + main-Evolution ist fast jeder
gemergte Branch tip-to-tip „abweichend" und bleibt deshalb liegen, obwohl sein Inhalt längst
in main ist.

MESSUNG (2026-08-15, ~10:15Z, Factory-Tick frei):

```bash
PRE=f868fa3b76cb8b10ef06acd4d2cd05d3f2c68446
git fetch origin --prune
bash scripts/branch-reaper.sh --sweep --dry-run | grep -c '^KEEP'   # → 24
```

Deep-Clean-Analyse aller analysierbaren KEEP-Branches (17): **17/17 waren Blob-nachweislich in
main angekommen** — Tier A (10) via eigene gemergte PRs, Tier B (7) via Nachfolge-/Parallel-Branch.
Live-Beleg am 2026-08-15 nach dem Deep-Clean: `chore/pk-device-autostart-T006842` (PR #4622
gemergt) → KEEP wegen `scripts/llm/pk-devices/download-quant.ps1` ausserhalb der Allowlist.

## What

branch-reaper gewinnt ein **Positiv-Signal für gemergte Branches**, unabhängig von der Allowlist
(T005958-Vorgehensweise verallgemeinert):

- Ein eigener MERGED-PR, dessen `headRefOid` dem Remote-Tip des Branches entspricht → REAP-Kandidat
  ohne Blob-Abweichungs-Check (Ticket-Status- und offener-PR-Gate bleiben).
- Kein eigener verifizierbarer MERGED-PR → ein Nachfolge-Branch, der selbst einen MERGED-PR hat und
  für jede divergierende Datei identische Blobs trägt → REAP-Kandidat.
- Unverifizierbar heisst verschonen (gh-Ausfall, kein MERGED-PR, SHA-Mismatch ohne
  identischen-Blobs-Nachfolger): die bestehende Blob-/Allowlist-Prüfung bleibt der konservative
  Fallback. Die `chore/freshness-regen-*`-Klasse (T005958) und die Löschmechanik
  (Archiv-Tag, lokaler Ref, Ausgabe-Vertrag) bleiben unverändert.

_Ticket: T007032_
