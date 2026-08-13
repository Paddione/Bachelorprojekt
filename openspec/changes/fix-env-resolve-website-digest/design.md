# Design: env-resolve clobbers WEBSITE_IMAGE_DIGEST (T004041)

## Symptom vs. Ursache (T002448-M5)

**Symptom (beobachtet, reproduzierbar):** Seit c8d611366 (T002706) enthält jedes
gerenderte fleet-manifests-Artefakt für beide Brands den Placeholder-Digest
`sha256:1111…` im Website-Deployment. Das ReplicaSet `website-5cd876887d` hängt
seit 2026-08-09 in ImagePullBackOff; der letzte ausgerollte Pod ist vom 2026-08-08.

**Ursache (verifiziert, nicht Hypothese):** Reproducer aus dem Ticket, ausgeführt am
2026-08-13 gegen main:

```bash
WEBSITE_IMAGE_DIGEST="sha256:565e7cecafd4d792620b4c68a168046481567dec53c4f61545f62f3edd1c7d41" \
  bash -c 'set +u; source scripts/env-resolve.sh fleet-mentolder 2>/dev/null; echo "AFTER: $WEBSITE_IMAGE_DIGEST"'
# → AFTER: sha256:1111111111111111111111111111111111111111111111111111111111111111
```

Bewiesen in drei Stufen:

1. `environments/fleet-mentolder.yaml` / `fleet-korczewski.yaml` hardcoden
   `WEBSITE_IMAGE_DIGEST: sha256:1111…` (Placeholder; BRETT analog mit `2222…`).
2. `scripts/env-resolve.sh` exportiert ALLE env_vars unbedingt: `emit()` erzeugt
   `export NAME=value` ohne Prüfung, ob die Variable im Caller bereits gesetzt ist.
3. `scripts/flux-render-artifact.sh` sourced in jeder Brand-/Website-Subshell
   `env-resolve.sh` — NACHDEM `render-fleet-artifact.yml` den echten Digest als
   Env gesetzt hat (`WEBSITE_IMAGE_DIGEST: ${{ steps.resolve-digests.outputs.website_digest }}`).
   Das Sourcing überschreibt den echten Wert mit dem Placeholder; `envsubst`
   bäckt ihn in `prod-fleet/website-*/website-patch.yaml` ein.

Der T002706-Guard (`immutable-image-refs.bats`) prüft nur Digest-Form (`@sha256:`),
nicht Placeholder-Form — `sha256:1111…` ist formell gültig, der Guard bleibt grün.

## Alternativen

### A) Snapshot/Restore in flux-render-artifact.sh (analog WEBSITE_IMAGE_OVERRIDE)

Digest vor dem Sourcing snapshotten, danach zurückschreiben.

- Pro: Minimal-invasiv, nur ein Caller betroffen.
- Contra: Behebt nur den Flux-Pfad. Jeder künftige Caller (Taskfile
  break-glass `workspace:deploy`, neue Workflows) erleidet dieselbe Clobber-Klasse
  erneut. Der Fehler liegt in env-resolve — die Semantik „env-resolve überschreibt
  Caller-Werte" ist per se überraschend.

### B) env-resolve.sh respektiert Caller-Werte (Gewählt)

`emit()` überspringt Variablen, die im Caller-Environment bereits gesetzt sind
(`os.environ`-Check im Python-Resolver).

- Pro: Behebt die Ursache an der Wurzel für ALLE Caller — Flux-Render-Pfad,
  break-glass Taskfile-Pfad, Setup-Skripte. Standard-Semantik für env-Loader.
- Contra: Verhaltensänderung für alle Caller. Risiko geprüft: `env-resolve.bats`
  (10 Tests) und die Render-Tests laufen in frischen Shells ohne vorgesetzte
  Variablen → unverändert grün. `ci-dummy-secrets.sh` schreibt nur Dateien, keine
  Env-Vars → keine Wechselwirkung. Kein Caller setzt eine env_var vor dem Sourcing
  und erwartet, dass env-resolve sie überschreibt (geprüft per grep über
  scripts/, Taskfile.yml, .github/workflows/).

### C) Guard-Kontext

Der fail-closed Guard ist immer aktiv (analog checksum/config-Check T002156),
nicht CI-gekoppelt: „sha256:1111…/2222… nie wieder in einem Artefakt" gilt
unabhängig davon, wer den Render aufruft. Offline-Render ohne Digest brechen dann
mit klarer Fehlermeldung ab — gewollt (fail-closed), denn der Placeholder
referenziert ein nicht existierendes Image.

## Entscheidungen

| # | Entscheidung | Begründung |
|---|---|---|
| D1 | `env-resolve.sh`: Caller-gesetzte Variablen gewinnen (B) | Wurzel-Fix, deckt alle Caller ab |
| D2 | `flux-render-artifact.sh`: `: "${WEBSITE_IMAGE_DIGEST:=}"`-Defaults für DIGESTS entfernen (WEBSITE_IMAGE_TAG bleibt) | Sonst würde das leere `:=`-Export als „Caller-Wert" gelten und den env-file-Placeholder in Offline-Rendern unterdrücken; Tag-Default ist ein echter Default, kein Placeholder |
| D3 | Always-on Placeholder-Guard in der Validation-Gate-Sektion | Fail-closed wie gefordert; analog checksum/config-Check |
| D4 | Fixture-Digests in allen Render-Tests (realistische sha256 statt 1111…) | Guard würde Offline-Render mit Placeholder abbrechen; echte Digests machen die bestehenden Pinning-Tests zu echten Regressions-Tests (Clobber → Placeholder → Guard rot) |

## Betroffene Dateien

- `scripts/env-resolve.sh` (Kern-Fix)
- `scripts/flux-render-artifact.sh` (Default-Entfernung + Guard)
- `tests/unit/env-resolve.bats` (neuer Caller-Respect-Test)
- `tests/spec/flux-render-security/immutable-image-refs.bats` (Fixture-Digests + Regressions-Tests)
- `tests/spec/flux-artifact-versioning/flux-artifact-versioning.bats` (Fixture-Digests statt Placeholder)
- `tests/spec/workspace-deploy.bats` (Fixture-Digests für die zwei Render-Tests)
- `openspec/specs/flux-render-security.md` (SSOT-Delta: Caller-Digest überlebt + Placeholder fail-closed)

## Nicht betroffen / bewusst außen vor

- `environments/fleet-*.yaml` behalten die Placeholder-Werte: Sie sind der
  dokumentierte Offline-Fallback (T002706), den der Guard abfängt, statt sie
  still durchzulassen.
- `k3d/`-Basis und dev-Tree: referenzieren bewegliche Tags, keine Digest-
  Platzhalter → Guard greift dort nicht.
- `scripts/resolve-image-digest.sh`, `render-fleet-artifact.yml`,
  `build-website.yml`: unverändert — der Workflow liefert den Digest bereits korrekt.
