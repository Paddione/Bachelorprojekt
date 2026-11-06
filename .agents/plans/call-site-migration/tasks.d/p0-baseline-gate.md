# p0 — Re-Baseline + Boundary-Test (Tests-Rolle, zuerst)

## Ziel
Verbindliche Zählbasis pro Welle + CI-Gate, das ab sofort NEUE direkte
`llm|coaching|code-quality → website`-Importe verbietet (Bestand vorerst
allowlistet, damit das Gate ab Tag 1 grün ist und nur Zuwachs blockiert).

## Warum zuerst (Graph stale + Rauschen)
Der Planungs-Graph stand auf `b678a5f` (HEAD `2e57b2d93`); Goal-Recept
(`llm 74 / code-quality 21 / coaching 15`) vs. aktuelle Top-10-Boundaries
(`llm 74` bestätigt, coaching/code-quality unter Schwelle 5) weichen ab.
Zusätzlich dominiert Test-Helper-Rauschen (`graph-utils.test.node`,
`cockpit-api.test.url`, `zugferd.test.test`) die CALLS-Kanten.
P0 trennt Prod-Kanten von Rauschen, daher hängt JEDE Welle von P0 ab.

## Schritte
1. Frischen Graph anfordern/abwarten (od5-graph-refresh, Home-Seite) und
   `get_architecture(aspects=[boundaries])` sichern: Output + Commit-SHA in
   `phase-events.log` (wird in p5 als Vorher-Beleg wiederverwendet).
2. Pro Caller-Familie (`scripts/llm-proxy`, `scripts/coaching`,
   `scripts/code-quality`, `scripts/sdlc`, `scripts/index-repo.ts`,
   `scripts/build-route-manifest.mjs`, `knowledge`) zählen:
   `rg -n "components/website/src" <dir> --type ts -g '!*.test.*'`
   minus Kommentarzeilen (`^\s*//`) minus Pfad-Strings (nur String-Literale
   ohne `import/from`) = Prod-Sites pro Welle. Test-Only-Kanten separat
   ausweisen (VANTA-Liste für den Boundary-Test).
3. Boundary-Test anlegen (Red-phase proof: run `python3 -m pytest tests/py/spec/website_sink/ -q`
   with an EMPTY allowlist first — expected: FAIL, proving the gate sees the
   baseline; only then set the p0 allowlist → green):
   `tests/py/spec/website_sink/test_boundary_no_new_imports.py`
   - Scannt die Caller-Verzeichnisse auf `components/website/src`-Importe
     (statisch, `.mts/.mjs/.ts`, ohne `.test.`-Dateien).
   - Allowlist = P0-Bestand (Inline-Liste mit `ALLOWLISTED (p0)`-Kommentar +
     Ablaufdatum der Migration); jeder NICHT-gelistete Treffer → FAIL.
   - VANTA-Ausnahmen (Test-Helper, VideoVault-`resolve`-Kollision) als
     dokumentierte Excludes mit Begründung, kein Blanket-Ignore.
4. Gate-Verdrahtung prüfen: Suite läuft in `task test:changed` mit
   (ggf. Pfad in `taskfiles/Taskfile.test.yml` ergänzen — EIN Pfad, kein
   neues Task-Gerüst).

## Gates (p0Done)
- `python3 -m pytest tests/py/spec/website_sink/ -q` grün.
- `task test:changed` grün (Suite enthalten).
- `phase-events.log`: Boundary-Tabelle (Vorher) + Test-Only-VANTA-Liste.
- STOP: Prod-Gesamtcount weicht > ±25 % von 74 ab → Wellen neu gruppieren,
  an Primary zurückgeben, NICHT still rescopen.

## Erwartung (kein Fix)
Prod-Sites ≈ 10–12 (coaching 7 + route-manifest 2 + llm-Rest Kleinstmenge);
der Rest der 74 Kanten ist Test-Rauschen und wird exkludiert, nicht migriert.
