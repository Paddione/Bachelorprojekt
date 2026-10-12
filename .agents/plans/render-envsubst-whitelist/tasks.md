---
title: Fleet-Renderer envsubst-Whitelist (vendored Fremd-Platzhalter schützen)
ticket_id: T901791
domains: [monitoring, render]
status: staged
---

# render-envsubst-whitelist — Implementation Plan

Single-Plan (ein Subsystem + Tests). Root-Cause-Analyse und Evidenz:
`design.md` im selben Ordner, Proposal in `proposal.md`. Strategie D1
(User-Entscheid): Whitelist in der vars-Extraktion. Ausgangslage:
Branch-Basis `4f4166973`. Task 2/4 brauchen lokal `kustomize` (v5.8.1
verifiziert) und sind nicht CI-lauffähig; die pytest-Suite braucht nur
Bash und `envsubst` (mit Skip-Guard).

## File Structure

| Datei | Änderung |
|---|---|
| `scripts/lib/render-subst-list.sh` | Neu: `render_subst_list` (stdin Text, stdout Namen) + `RENDER_SKIP_VARS` |
| `scripts/flux-render-artifact.sh` | Lib sourcen, `render_component` nutzt die Funktion, Leftover-Check nimmt Skip-Liste aus |
| `tests/py/spec/native_ported/spec/flux-render-security/test_envsubst_whitelist.py` | RED-Tests (bereits im Branch, 104 Zeilen) |
| `components/website/src/data/test-inventory.json` | Regenerieren falls verändert |

`scripts/flux-render-artifact.sh` hat Ist 475 bei Budget 325.
`tests/py/spec/native_ported/spec/flux-render-security/test_envsubst_whitelist.py`
hat Ist 104 bei Budget 696. Die neue Lib bleibt klein (Ziel unter 120 Zeilen,
`.sh`-Limit 800, neue Datei mit Wachstumsreserve). S4: die Tests pinnen, dass
der Renderer die Lib sourct. S2: pure Bash-Funktion ohne Imports. S3: keine
Brand-Domains in Snippets.

## Task 1 — RED-Bestätigung

- Step: `bash scripts/pytest-run.sh tests/py/spec/native_ported/spec/flux-render-security/test_envsubst_whitelist.py` — expected: FAIL, alle 5 Tests rot.
- Acceptance: alle 5 Tests scheitern mit `No such file or directory` für die
  Lib; die T901780-Suite
  (`test_runtime_var_unwrapping.py`) bleibt vollständig grün.

## Task 2 — Vars-Klassifikation (owned vs. fremd)

- `kustomize build prod-fleet/mentolder --load-restrictor=LoadRestrictionsNone`
  bauen und die 98 distinkten `${VAR}`-Namen extrahieren
  (Phase-A-Befehl mit `grep -oE`); ebenso für `prod-fleet/korczewski`.
- Jeden Namen gegen die Owned-Quellen prüfen (`environments/schema.yaml`,
  `scripts/env-resolve.sh`-Outputs für `fleet-mentolder`/`fleet-korczewski`):
  owned = wird dort gesetzt; fremd = Grafana-/Shell-/SealedSecret-Platzhalter.
  Die vier gepinnten Namen `datasource`, `cluster`, `namespace`, `code`
  sind fremd; den Rest empirisch einordnen, nicht per Case-Heuristik raten.
- Ergebnis als Tabelle in den Lib-Datei-Kopfkommentar schreiben (Name,
  Quelle/Grund, Stand-Datum).
- Acceptance: jede der 13+ fremden Namen hat einen Skip-Grund, jeder
  Owned-Name eine Quelle; die Tabelle steht im Lib-Header.

## Task 3 — Lib und Renderer-Umbau

- `scripts/lib/render-subst-list.sh` anlegen mit:
  - `RENDER_SKIP_VARS` (space-separiert, enthält mindestens die vier
    gepinnten Namen plus die in Task 2 gefundenen fremden),
  - `render_subst_list`: stdin = gerendertes Manifest, stdout =
    space-separierte Subst-Namen nach der Regel
    extrahiert ∩ im-Environment-gesetzt − `$$`-Runtime (mit/ohne Klammern,
    T002306/T901780-Verhalten erhalten) − `RENDER_SKIP_VARS`.
- `scripts/flux-render-artifact.sh`: Lib sourcen, in `render_component` die
  bisherige Alles-Extraktion durch `render_subst_list` ersetzen. Der
  `WEBSITE_CONFIG_SHA`-Sonderpfad, das `$$`-Unwrapping und `render-guard.sh`
  bleiben unverändert.
- Leftover-Fail-Closed-Check: `RENDER_SKIP_VARS`-Namen ausnehmen (sie
  überleben gewollt), alle übrigen unsubstituierten `${VAR}` weiter hart
  fehlschlagen lassen.
- Acceptance: die 5 RED-Tests sind grün; `test_runtime_var_unwrapping.py`
  bleibt vollständig grün (keine Regression des T901780-Verhaltens).

## Task 4 — Render-Parity über alle Overlays

- Pro Overlay (`platform`, `mentolder`, `korczewski`, `mentolder-jobs`,
  `korczewski-jobs`, `website-mentolder`, `website-korczewski`,
  `korczewski-auth`, `staging`, `website-staging`, `dev-pod`) den
  kustomize-Output einmalig sichern und alte Liste (Alles-Extraktion minus
  Runtime) gegen neue Liste (`render_subst_list`) diffen.
- Acceptance: jede Differenz `alt − neu` besteht ausschließlich aus
  Skip-gelisteten Fremd-Namen; kein Owned-Name fehlt in der neuen Liste.
  Zusätzlich ein vollständiger Vorher/nachher-Render von `mentolder`:
  einzige Deltas sind erhaltene Fremd-Platzhalter (`${datasource}` u. a.).

## Task 5 — Verify

- Steps:
  - `bash scripts/pytest-run.sh tests/py/spec/native_ported/spec/flux-render-security/` (grün, beide Module)
  - `task test:changed`
  - `task test:inventory` falls Test-Inventar betroffen, Artefakt mitcommitten
  - `task freshness:regenerate`
  - Artefakte committen
  - `task freshness:check`
- Acceptance: alle drei Kommandos `task test:changed`,
  `task freshness:regenerate`, `task freshness:check` laufen erfolgreich.
