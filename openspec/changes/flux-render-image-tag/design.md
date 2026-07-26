---
ticket_id: T002209
plan_ref: openspec/changes/flux-render-image-tag/tasks.md
status: active
date: 2026-07-26
---

# Design: Der gebaute Image-Tag erreicht das gerenderte Manifest

**Ticket:** T002209 · **Branch:** `fix/flux-render-image-tag-T002209` · **Typ:** fix

## Purpose

Website-Deploys kommen seit Einführung des Flux-Pfads nicht an. Der Build läuft grün, das OCI-Artefakt wird gerendert und gepusht, der Receiver gepingt — und im Cluster passiert nichts. Der Grund ist eine zweifach unterbrochene Verkabelung zwischen dem gebauten Image-Tag und dem Manifest.

Das ist die Ursache der Deploy-Drift, die T002192 als Phantom-Bug erzeugt und T002202 messbar gemacht hat.

## Root Cause

**Bruch 1 — der Wert wird nie gelesen.** `.github/workflows/render-fleet-artifact.yml:73` setzt `WEBSITE_IMAGE_TAG` als **Umgebungsvariable**. `Taskfile.yml:4687` ruft `scripts/flux-render-artifact.sh --out "…"` auf. Das Skript liest den Tag ausschließlich aus dem **CLI-Flag** `--website-image` (Zeile 20–23); `WEBSITE_IMAGE_OVERRIDE` bleibt leer. Repo-weit gibt es genau **einen** Treffer für `WEBSITE_IMAGE_TAG` — die Zuweisung selbst.

**Bruch 2 — der Wert würde an der falschen Stelle landen.** `k3d/website.yaml:223` lautet:

```yaml
image: ghcr.io/paddione/${WEBSITE_IMAGE}:latest
```

Variabel ist nur der **Name**, der **Tag ist hartcodiert**. Selbst wenn der Override griffe, würde er den Namen ersetzen: aus dem Tag `sha-20260726-abc` würde `ghcr.io/paddione/sha-20260726-abc:latest` — ein Image, das nicht existiert.

**Wirkung.** Das Manifest behält `:latest`. Da sich sein Inhalt zwischen zwei Builds nicht ändert, hat Flux nichts zu applizieren. Kein neues ReplicaSet, kein neuer Pod — `imagePullPolicy: Always` greift nicht, weil der Pod gar nicht neu erzeugt wird. Am 2026-07-26 lief der Pod 2,5 Stunden nach einem erfolgreichen Build noch unverändert weiter (Run 30208864439).

Die Flux-Kustomizations sind dabei **gesund**: `flux-website-mentolder`/`-korczewski` melden `Healthy=True`. Sie haben schlicht nichts zu tun.

**`BRETT_IMAGE_TAG` hat dieselbe Verkabelung** (`--brett-image`, Zeile 24–27) und wird mitbehoben.

## Fehlerklasse

Ein Wert wird korrekt bereitgestellt und von der Gegenseite nie gelesen. Kein Fehler, kein Absturz — nur ein Default, der weiterläuft. Dieselbe Klasse dokumentiert diese Datei bereits zweimal:

- **T002199** — das Auth-Gate prüfte `E2E_ADMIN_PASS`, der Login liest `CRON_SECRET`
- **`website/Dockerfile` vor T002202** — `--build-arg` übergeben ohne `ARG`-Zeile: stiller No-op
- **T001396/T001400** — `$SMTP_USER`/`$SMTP_PORT` fehlten in `ENVSUBST_VARS`

## Architektur

### K1 — Der Tag wird im Manifest zum Platzhalter

```yaml
image: ghcr.io/paddione/${WEBSITE_IMAGE}:${WEBSITE_IMAGE_TAG}
```

### K2 — Der Platzhalter darf nie leer rendern

`envsubst` kennt kein `${VAR:-default}`: Eine nicht gesetzte Variable wird zur **leeren Zeichenkette**, das Ergebnis wäre `image: ghcr.io/paddione/website:` — ein kaputtes Manifest. Genau diese Klasse Schaden zeigt der `notify-push`-Container auf korczewski, der auf `bin/$/notify_push` wartet.

Deshalb setzt **jeder** Render-Pfad einen Default, bevor `envsubst` läuft:

```bash
: "${WEBSITE_IMAGE_TAG:=latest}"
export WEBSITE_IMAGE_TAG
```

Das erhält das bisherige Verhalten für lokale Renders und den Break-glass-Pfad, während CI den echten SHA-Tag liefert.

### K3 — Die Allowlists müssen den Platzhalter kennen

Die `envsubst`-Aufrufe sind fail-closed über explizite Variablenlisten (T001993-Härtung). `$WEBSITE_IMAGE_TAG` muss in **jede** Liste, die bereits `$WEBSITE_IMAGE` enthält — vier Stellen in `Taskfile.yml` (Zeilen 2763, 2929, 3645, 3679). Eine vergessene Liste erzeugt genau den leeren Tag aus K2.

Ein Test erzwingt diese Kopplung strukturell, statt sich auf Sorgfalt zu verlassen.

### K4 — Das Skript liest die Umgebung, das Flag behält Vorrang

```bash
WEBSITE_IMAGE_OVERRIDE="${WEBSITE_IMAGE_TAG:-}"
BRETT_IMAGE_OVERRIDE="${BRETT_IMAGE_TAG:-}"
```

Initialisierung vor dem Argument-Parsing, damit `--website-image` weiterhin gewinnt. Der Workflow bleibt unverändert — er übergibt den Wert bereits korrekt.

## Requirements

### R1 — The built image tag reaches the rendered manifest
The rendered website manifest SHALL reference the image tag supplied by the build, not a hardcoded `latest`.

**Scenario:** Given `WEBSITE_IMAGE_TAG=sha-20260726-abc` is set, when the fleet artifact is rendered, then the website Deployment references `…/website:sha-20260726-abc`.

**Scenario:** Given no tag is supplied, when the artifact is rendered, then the Deployment references `…/website:latest` — never an empty tag.

### R2 — The tag placeholder is never dropped by envsubst
Every `envsubst` allowlist that permits `$WEBSITE_IMAGE` SHALL also permit `$WEBSITE_IMAGE_TAG`.

**Scenario:** Given an allowlist contains `$WEBSITE_IMAGE` but not `$WEBSITE_IMAGE_TAG`, when the spec suite runs, then the test fails naming the offending list.

### R3 — Environment and flag are both honoured
`flux-render-artifact.sh` SHALL read `WEBSITE_IMAGE_TAG`/`BRETT_IMAGE_TAG` from the environment, with the CLI flags `--website-image`/`--brett-image` taking precedence.

**Scenario:** Given both the env var and the CLI flag are set, when the script runs, then the flag value wins.

## Betroffene Dateien

| Datei | Änderung |
|---|---|
| `k3d/website.yaml` | Tag als `${WEBSITE_IMAGE_TAG}` statt hartcodiert |
| `scripts/flux-render-artifact.sh` | Env-Fallback + Default für beide Tags |
| `Taskfile.yml` | `$WEBSITE_IMAGE_TAG` in 4 `envsubst`-Allowlists; Default im Deploy-Pfad |
| `tests/spec/workspace-deploy.bats` | 6 Tests (bereits geschrieben, rot) |

## Nicht in diesem Change

- **LiveKit-Rückbau (T002184)** und **Health-Gate-Härtung (T002207)** — beide blockieren `flux-mentolder`/`flux-korczewski`, aber **nicht** die Website-Kustomizations. Eigenständige Arbeit.
- **`nextcloud`/`notify-push` auf korczewski** — kaputter Alt-Render, gehört zu T002207.
- **Der manuelle `rollout restart`** vom 2026-07-26 bleibt eine einmalige Zwischenmaßnahme.
