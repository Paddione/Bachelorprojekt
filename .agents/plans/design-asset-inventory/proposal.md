# Design-Asset-Inventory — Proposal (T901038)

## WARUM

Design-Quellen, abgeleitete Kopien und Generatoren liegen im Repo verstreut
(`assets/`, `.design-sync/`, `packages/design-system/`, `design/leitstand-ds/`,
`components/website/public/brand/`, Brett-Public-Kopien). Verbraucher-Pfade und
Quellen sind teilweise gekoppelt (`packages/design-system/build.mjs` liest
`website/public/brand/mentolder/colors_and_type.css` und kopiert SVGs;
`scripts/assets-sync.sh` kopiert per rsync, teils mit `--delete`). Ohne
Inventur ist keine belastbare Konsolidierung in ein dediziertes Designs-Repo
moeglich. Ticket T901038 verlangt daher zuerst eine reproduzierbare,
begrenzte Bestandsaufnahme mit Klassifikation — ohne Moves und ohne
Loeschungen.

## WAS

1. Neues, rein lesendes Inventur-Kommando `scripts/design-assets-inventory.sh`:
   begrenzter Scan der beobachteten Pfade (kein Symlink-Follow, keine
   Secrets/History), pro Datei Stable-ID, SHA-256, Groesse, Format, dazu
   Duplikat-Gruppen per Hash. Ausgabe: stabiles, commitbares Manifest.
2. Baseline-Manifest `docs/design-assets/manifest.json`, erzeugt per Kommando
   und als PRE-Referenz committet (Byte-reproduzierbar: stabil sortiert, keine
   Zeitstempel im Hash-Kern).
3. Klassifikation `docs/design-assets/catalog.md`: Quelle vs. Derivat, Marke,
   Herkunft/Rechte, Generator-Version/Prompt/Seed/Modell-Lizenz wo bekannt.
4. Verbraucher-Karte `docs/design-assets/consumer-map.md`: Abhaengigkeiten und
   Kopplungen (assets-sync-Mappings, build.mjs-Extraktion, Public-Kopien).
5. Guards als pytest-Spec `tests/py/spec/design_assets/test_inventory.py`:
   Manifest-Schema, Reproduzierbarkeit, keine absoluten WSL-Pfade, keine
   Secret-nahen Pfade, Abdeckung der bekannten Kopplungen.

## NICHT im Scope

- ComfyUI-Pfade (gestrichen, 2026-10-09 verifiziert abwesend).
- Ausfuehren von `scripts/assets-sync.sh` (destruktives `--delete`).
- Moves, Loeschungen, Migration, Designs-Repo-Anlage.
- Modell-Weights, Caches, Backups, Dependencies, fremde Third-Party-Assets.
