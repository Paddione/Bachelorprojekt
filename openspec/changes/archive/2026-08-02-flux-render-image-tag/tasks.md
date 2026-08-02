---
title: Der gebaute Image-Tag erreicht das gerenderte Manifest
ticket_id: T002209
domains: [infra, test]
status: plan_staged
---

# flux-render-image-tag — Implementation Plan

Design-SSOT: `openspec/changes/flux-render-image-tag/design.md`

Website-Deploys kommen seit Einführung des Flux-Pfads nicht an: Der Build übergibt `WEBSITE_IMAGE_TAG` als Env-Var, das Render-Skript liest nur das CLI-Flag `--website-image`, und `k3d/website.yaml` hat den Tag ohnehin hartcodiert. Das Manifest behält `:latest`, ändert sich zwischen Builds nie, und Flux hat nichts zu applizieren.

Die Tests sind bereits geschrieben und **rot**: 6 Failures in `tests/spec/workspace-deploy.bats`.

## File Structure

| Datei | Ist | S1-Budget |
| --- | --- | --- |
| `k3d/website.yaml` | 832 | kein S1-Gate (`.yaml` nicht limitiert) |
| `scripts/flux-render-artifact.sh` | 243 | 257 |
| `Taskfile.yml` | 4723 | kein S1-Gate (`.yml` nicht limitiert) |
| `tests/spec/workspace-deploy.bats` | 474 | kein S1-Gate (`.bats` nicht limitiert) |

`docs/code-quality/gates.yaml` limitiert `.sh` auf 500 Zeilen; `scripts/flux-render-artifact.sh` ist nicht gebaselined. Kein Split nötig.

## Task 1 — Den Tag im Manifest zum Platzhalter machen

**1.1** In `k3d/website.yaml` Zeile 223 den hartcodierten Tag ersetzen:

```yaml
image: ghcr.io/paddione/${WEBSITE_IMAGE}:${WEBSITE_IMAGE_TAG}
```

Bisher war nur der **Name** variabel. Ein Override hätte den Namen ersetzt und aus dem Tag `sha-20260726-abc` das nicht existierende `ghcr.io/paddione/sha-20260726-abc:latest` gemacht.

**Verifikation:**
```bash
bats tests/spec/workspace-deploy.bats -f "image tag"
```

## Task 2 — Den Platzhalter gegen leeres Rendern absichern

`envsubst` kennt kein `${VAR:-default}` — eine nicht gesetzte Variable wird zur leeren Zeichenkette. Ohne Default würde `image: ghcr.io/paddione/website:` gerendert. Denselben Schaden zeigt aktuell der `notify-push`-Container auf korczewski, der auf `bin/$/notify_push` wartet.

**2.1** In `scripts/flux-render-artifact.sh` die Override-Initialisierung (Zeilen 11–12) aus der Umgebung speisen, **vor** dem Argument-Parsing, damit die CLI-Flags weiterhin Vorrang behalten:

```bash
WEBSITE_IMAGE_OVERRIDE="${WEBSITE_IMAGE_TAG:-}"
BRETT_IMAGE_OVERRIDE="${BRETT_IMAGE_TAG:-}"
```

**2.2** Im selben Skript vor dem ersten `envsubst`-Aufruf den Default setzen und exportieren:

```bash
: "${WEBSITE_IMAGE_TAG:=latest}"
: "${BRETT_IMAGE_TAG:=latest}"
export WEBSITE_IMAGE_TAG BRETT_IMAGE_TAG
```

Der Override-Mechanismus (`export WEBSITE_IMAGE="$WEBSITE_IMAGE_OVERRIDE"` an den Zeilen 143, 191, 202, 213, 224) bleibt unverändert — er betrifft den Image-**Namen** und ist von dieser Änderung unabhängig.

**2.3** Im Taskfile-Deploy-Pfad (Break-glass, `workspace:deploy`) denselben Default setzen, bevor `envsubst` über `k3d/website.yaml` läuft. Ohne das rendert der Break-glass-Pfad einen leeren Tag — der Pfad, den man ausgerechnet dann benutzt, wenn Flux schon nicht funktioniert.

**Verifikation:**
```bash
bats tests/spec/workspace-deploy.bats -f "environment"
bats tests/spec/workspace-deploy.bats -f "never renders empty"
```

## Task 3 — Die envsubst-Allowlists ergänzen

Die `envsubst`-Aufrufe sind fail-closed über explizite Variablenlisten (T001993). Ein Platzhalter, der in einer Liste fehlt, rendert dort leer.

**3.1** `$WEBSITE_IMAGE_TAG` in **alle vier** Listen in `Taskfile.yml` aufnehmen, die bereits `$WEBSITE_IMAGE` führen — Zeilen 2763, 2929, 3645, 3679. Der rote Test benennt sie einzeln; keine davon auslassen.

**3.2** Prüfen, ob `scripts/flux-render-artifact.sh` eigene `envsubst`-Allowlisten führt, und diese analog ergänzen.

**Verifikation:**
```bash
bats tests/spec/workspace-deploy.bats -f "envsubst list"
```

## Task 4 — Rot→Grün nachweisen und verifizieren

**4.1** Die Spec-Suite laufen lassen. Vorher waren 6 Tests rot (`expected: FAIL`), jetzt müssen alle grün sein:

```bash
bats tests/spec/workspace-deploy.bats
```

**4.2** Den Render **funktional** prüfen — der entscheidende Nachweis, dass der Wert wirklich ankommt:

```bash
WEBSITE_IMAGE_TAG=sha-testtag-0000 task flux:render OUT=/tmp/flux-render-check
grep -r 'website:sha-testtag-0000' /tmp/flux-render-check/ | head
```

Erwartung: Treffer im gerenderten Website-Deployment. Kein Treffer bedeutet, die Kette ist weiterhin unterbrochen — dann ist der Fix nicht fertig, unabhängig davon, ob die grep-basierten Tests grün sind.

**4.3** Gegenprobe ohne Tag — der Default muss greifen und darf keinen leeren Tag erzeugen:

```bash
task flux:render OUT=/tmp/flux-render-default
grep -rE 'image: ghcr\.io/paddione/website:$' /tmp/flux-render-default/ && echo "FEHLER: leerer Tag" || echo "OK: kein leerer Tag"
grep -r 'website:latest' /tmp/flux-render-default/ | head -2
```

**4.4** Abschließende Verifikation:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
