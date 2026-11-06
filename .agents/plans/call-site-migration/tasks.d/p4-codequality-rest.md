# p4 — Code-Quality + Rest-Welle (Impl)

## Ziel
Verbleibende Prod-Sites schließen: `scripts/code-quality/*`,
`scripts/sdlc/*`, `scripts/index-repo.ts`, `scripts/build-route-manifest.mjs`,
`knowledge`-Caller — soweit P0 sie als Prod-Sites bestätigt (Erwartung:
0–4 Sites; die 60/24 Graph-Zeilen dieser Familien sind fast vollständig
Test-Rauschen).

## Schritte
1. P0-Tabelle abarbeiten; pro Fundstelle wie p2/p3 (ports-Import,
   typecheck, Tests, Allowlist kürzen).
2. `scripts/build-route-manifest.mjs` (Brand-Configs) GESONDERT:
   - Vorab `brand-trennung`-Status prüfen (mentolder-Import stirbt dort
     ohnehin). Falls mentolder-Config dort schon entfernt: nur
     korczewski-Import auf ports-Regel prüfen (Config ≠ lib — ggf.
     dokumentierte Ausnahme statt Umbau, Begründung ins Log).
   - KEIN Doppel-Umbau gegen laufenden brand-trennung-Plan.
3. `scripts/sdlc/*` + `index-repo.ts` + `knowledge`: Erwartung = nur
   Pfad-Strings/JSON-Outputs, keine TS-Importe → als „geprüft, kein
   Handlungsbedarf" mit rg-Beleg ins Log (Negativ-Beleg ist Beleg).

## Gates (p4Done)
- `npm run typecheck` grün; `task test:changed` grün.
- Boundary-Allowlist enthält nur noch p5-verschärfte Restposten (Ziel: leer).
- `phase-events.log`: je Familie Beleg (umbaut ODER geprüft-kein-Bedarf).
