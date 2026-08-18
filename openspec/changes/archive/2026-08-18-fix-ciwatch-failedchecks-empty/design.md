# Design: fix-ciwatch-failedchecks-empty

_Ticket: T012242_

## Root-Cause (Post-Merge-Review-Befund zu T012239, PR #4737)

Die check-runs-Abfrage in `scripts/devflow-ci-watch.sh` (seit T012239) liefert
`FAILED_CHECKS` als JSON-Array (Wrapper-Form). Bei null Fehlern ist das Ergebnis
das zweizeichenige Literal `[]`, und `[[ -n "[]" ]]` ist **wahr**. Folgen:

1. Jeder grüne Lauf durchläuft die T003224-Gegenprobe (Run-/Job-Ebene) inklusive
   eines unnötigen `gh run list`-Calls.
2. **Falsch-Rot:** Liegt am selben HEAD ein überholter failure-Run (erfolgreich
   oder abgebrochen re-gerunnter Workflow), findet die Gegenprobe ihn, seine Jobs
   enden weiterhin auf `failure` → `FAILED_CHECKS="[]"` bleibt stehen → nach
   `MAX_CI_ATTEMPTS` exit 1 auf einem grünen PR. Der T003224-Guard
   (cancelled/abgebrochen ≠ Codefehler) wirkt damit invertiert.

Empirische Reproduktion: RED-Test `T012242` in
`tests/spec/ci-cd/devflow-ci-watch-rollup-headsha.bats` — Marker `[]` +
stale failure-Run am selben HEAD → Skript eskaliert `❌ CI nach 1 Versuchen noch
rot: []` mit exit 1.

Verwandt: Der Test-Stub bildete das reale post-jq-Shape (`[]` bei null Fehlern)
nicht ab — der Grün-Fall lief mit `""`-Marker und sah die Kante nie (Review-I2).

## D-Entscheidungen

**D1 — Normalisierung statt jq-Formwechsel.** Nach dem `FAILED_CHECKS`-Fetch
wird die leere Array-Form als „keine Fehler" normalisiert:

```bash
[[ "$FAILED_CHECKS" == "[]" ]] && FAILED_CHECKS=""
```

Begründung: Die Wrapper-Form bleibt unverändert (der Test-Stub simuliert damit
weiter exakt den echten post-jq-Output); die Wahrheits-Semantik von
`[[ -n "$FAILED_CHECKS" ]]` wird an der einen Stelle repariert, an der sie
falsch war. Ein jq-Formwechsel (Wrapper entfernen) hätte den Test-Stub an die
Query-Form gekoppelt und den RED-Test in beiden Fix-Zuständen instabil gemacht.

**D2 — Zeilenweise Eskalationsmeldung (Review-M4).** Im Rot-Eskalationspfad
wird die JSON-Array-Form vor der Ausgabe aufgelöst:

```bash
echo "$FAILED_CHECKS" | jq -r '.[]' 2>/dev/null || echo "$FAILED_CHECKS"
```

Der Fallback deckt Nicht-JSON-Inhalte ab (Stub-/Alt-Formen); die Meldung zeigt
eine Zeile pro Check statt `["name: url", ...]`.

**D3 — Kommentar-Hygiene (Review-M1).** Die Kommentare in
`devflow-ci-watch.sh` (Zeilen ~89-91 und ~161-164) beschreiben noch den
entfernten Rollup-Selector mit headSha-Filter. Sie werden auf die
check-runs-API als Quelle umgestellt.

**D4 — Totes Fixture entfernen (Review-M2).** In
`tests/spec/batch-repo-hygiene-ops-fixes.bats` liest der angepasste Stub das
`rollup.json`-Fixture nicht mehr. Fixture-Referenz entfernen, wenn sie nach
Durchsicht wirklich tot ist (Verifikation im Implement-Step, kein blindes
Löschen).

**D5 — Non-Goals:** M3 (zwei `PR_HEAD_OID`-Fetches pro Runde — vorbestehendes
Muster, eigenes Follow-up wert); alle übrigen T012239-Non-Goals.

## Edge-Cases

- **`[]` mit Leerraum/Varianten:** Die Normalisierung matcht exakt `[]` (jq
  ohne `-c` erzeugt bei leerem Array genau dieses Literal); andere Leerformen
  treten nicht auf, weil der jq-Output hier nicht mehr transformiert wird.
- **Echtes Rot bleibt rot:** Ein nicht-leeres Array (ein oder mehrere
  failure-Checks) passiert die Normalisierung unverändert — die
  T003224-Gegenprobe greift weiter wie bisher.
- **Nicht-JSON-Inhalt:** Der `jq -r '.[]'`-Fallback in D2 hält die Meldung auch
  für rohe Zeilen stabil (bestehender Rot-Test bleibt grün).

## Tests

- `tests/spec/ci-cd/devflow-ci-watch-rollup-headsha.bats` erweitert um den
  T012242-RED-Test (Falsch-Rot-Reproduktion mit `[]` + stale Run); der
  bestehende Rot-Test nutzt jetzt die echte Array-Form als Marker. Positiv-Anker
  unverändert (Grün-Anker + T012239-Rot-Test).
