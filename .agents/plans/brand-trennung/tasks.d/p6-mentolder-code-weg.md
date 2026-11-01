# p6 — mentolder-web + Content raus

## Ziel
1. Verzeichnis `components/mentolder-web/` vollständig entfernen
   (Targets als Repräsentanten: `package.json`, `Dockerfile`, `nginx.conf`;
   zusätzlich `pnpm-workspace.yaml`-Eintrag + `build-mentolder-web.yml`-
   Workflow prüfen: Verweise auf das entfernte Verzeichnis im selben Commit
   bereinigen — als implizite Mitänderung in DIESER Partial-Datei erlaubt,
   keine eigene Partial nötig).
2. `components/website/content/mentolder/*.json` (13 Dateien, Liste tasks.md)
   löschen. `massage`/`korczewski`/`presentation` unangetastet.

## Randbedingungen
- Referenzen suchen vor dem Löschen (`grep -rn "mentolder-web"` über Repo
  ohne `.git/`, Trefferliste in phase-events.log) — jeder Treffer wird im
  selben Commit bereinigt oder als bewusste Ausnahme im PR-Body begründet.
- Kein Löschen von Cluster-Daten (siehe p5-Grenze).

## Gates
- `grep -rn "mentolder-web" --include="*" . | grep -v .git/` nachher leer
  (oder Ausnahmen im PR-Body begründet).
- Website-Build grün (`components/website`: pnpm-Lint/Check per test:changed).
