---
title: Renovate auf GitHub-App-Token umstellen und Automerge-Kollision auflösen
ticket_id: T002161
domains: [ci, dependencies]
status: plan_staged
---

# renovate-app-token — Implementation Plan

Design-Spec: `openspec/changes/renovate-app-token/design.md`
SSOT-Spec: `openspec/specs/ci-cd.md`

## File Structure

| Datei | Ist-Zeilen | S1-Budget |
|---|---|---|
| `.github/workflows/renovate.yml` | 55 | kein S1-Limit für `.yml` (gates.yaml → s1.limits listet nur Code-Extensions) |
| `.github/workflows/auto-enable-automerge.yml` | 43 | kein S1-Limit für `.yml` |
| `renovate.json5` | 156 | kein S1-Limit für `.json5` |
| `tests/spec/ci-cd.bats` | 819 | kein S1-Limit für `.bats` |
| `website/src/data/test-inventory.json` | generiert | regeneriert via `task test:inventory` |

Keine der Dateien ist in `docs/code-quality/baseline.json` gebaselined, keine fällt unter eine
Extension mit Zeilenlimit → kein Ratchet-Risiko, kein Split nötig.

<!-- vitest: kein neuer Test nötig, weil ausschließlich CI-Workflows und Renovate-Config
     geändert werden — kein Code unter website/src/lib/** oder website/src/pages/api/**. -->

## Task 1 — RED-Nachweis: die fünf T002161-Assertions schlagen fehl

Die Tests sind in `tests/spec/ci-cd.bats` bereits geschrieben (Fix-Pfad-Voraussetzung) und
dokumentieren RC1–RC3 in ihren FAIL-Meldungen.

```bash
bats tests/spec/ci-cd.bats --filter "T002161"
```

**expected: FAIL** — alle fünf Assertions (`T002161-A` ×2, `-B`, `-C`, `-D`) melden `not ok`,
weil `create-github-app-token` noch nicht eingebaut ist, `auto-enable-automerge.yml` keinen
Label-Guard hat und `renovate.json5` weder `labels` noch `platformAutomerge` setzt.

Nachgewiesener Ist-Zustand vor dem Fix: `1..5`, fünfmal `not ok`.

## Task 2 — `renovate.yml` auf frisch geprägten App-Token umstellen

Ziel: Der Workflow prägt pro Run einen frischen Installation-Token, statt ein statisches
(und nicht existierendes) `RENOVATE_TOKEN` zu erwarten.

Schritte:

1. Neuen Step **vor** dem Renovate-Step einfügen, mit `id: app-token`:

   ```yaml
   - name: Create GitHub App token
     # SHA-gepinnt (Supply-Chain: Action erhaelt den App Private Key).
     # v3.2.0 (2026-07). Bump via Review / Renovate selbst; nie @latest
     # fuer secret-tragende Third-Party-Actions.
     uses: actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1  # v3.2.0
     id: app-token
     with:
       app-id: ${{ secrets.RENOVATE_APP_ID }}
       private-key: ${{ secrets.RENOVATE_APP_PRIVATE_KEY }}
   ```

   `app-id` mit dem gesetzten Secret `RENOVATE_APP_ID` (hält die numerische App ID). Der Input
   ist in v3 deprecated (`action.yml`: *„Use 'client-id' instead."*), funktioniert aber
   unverändert; eine Migration auf `client-id` erfordert zusätzlich einen neuen Secret-Wert und
   wird als Workflow-Kommentar vermerkt. Kein `owner`/`repositories`-Input — Default ist das
   aktuelle Repository.

2. Im Renovate-Step beide Token-Referenzen auf den Step-Output umstellen:
   `RENOVATE_TOKEN: ${{ steps.app-token.outputs.token }}` (env) und
   `token: ${{ steps.app-token.outputs.token }}` (with). Beides bleibt gesetzt, damit der
   funktionale Teil unverändert ist und nur der Token-Wert wechselt.

3. `permissions:` im Job auf `contents: read` reduzieren. Die Schreibrechte kommen aus dem
   App-Token, nicht mehr aus `GITHUB_TOKEN`. `id-token: write` wird **nicht** gesetzt — es gibt
   keinen OIDC-Flow.

4. Header-Kommentar (Zeilen 6-9) korrigieren: statt *„a dedicated GitHub App token must be
   stored as repo secret RENOVATE_TOKEN"* die tatsächliche Anforderung dokumentieren — zwei
   Secrets `RENOVATE_APP_ID` + `RENOVATE_APP_PRIVATE_KEY`, App-Permissions
   Contents RW / Pull requests RW / **Workflows RW** / Metadata RO, und der Hinweis, dass ein
   Installation-Token 1 h TTL hat und deshalb nicht statisch hinterlegt werden kann.

Akzeptanz: `bats tests/spec/ci-cd.bats --filter "T002161-A"` und `--filter "T002161-B"` sind grün.

## Task 3 — `auto-enable-automerge.yml`: Renovate-PRs ausnehmen

Ziel: Renovates gestufte Automerge-Policy wieder wirksam machen (RC3).

Die `if:`-Bedingung des Jobs um einen Label-Guard erweitern:

```yaml
    if: |
      github.event.pull_request.draft == false &&
      !contains(github.event.pull_request.labels.*.name, 'dependencies')
```

Label-basiert statt Bot-Name-basiert, weil `pull_request.user.login` am frei gewählten App-Namen
hängt und beim Umbenennen still bricht. Kommentarblock am Dateikopf um den Grund ergänzen: PRs mit
`dependencies`-Label setzen ihr Auto-Merge-Flag selbst über Renovate, gestaffelt nach der Policy
in `renovate.json5`.

Akzeptanz: `bats tests/spec/ci-cd.bats --filter "T002161-C"` ist grün.

## Task 4 — `renovate.json5`: Label + `platformAutomerge`

Zwei Top-Level-Keys ergänzen (mit Begründungskommentar, wie im Rest der Datei üblich):

```json5
  // PR-Label — auto-enable-automerge.yml nimmt PRs mit diesem Label aus, damit
  // ausschliesslich die gestaffelte automerge-Policy unten greift (T002161).
  "labels": ["dependencies"],

  // Renovate setzt das GitHub-Auto-Merge-Flag selbst — aber nur fuer PRs, die
  // die packageRules unten freigeben (patch + devDependencies).
  "platformAutomerge": true,
```

Die `packageRules` bleiben unverändert — sie sind korrekt und waren nie das Problem.

Akzeptanz: `bats tests/spec/ci-cd.bats --filter "T002161-D"` ist grün.

## Task 5 — Manueller Anteil: GitHub App anlegen (Patrick, außerhalb der PR)

Nicht automatisierbar, blockiert den Merge aber nicht — der Workflow-Umbau hängt nur an den
Secret-*Namen*. Bis die Secrets gesetzt sind, bleibt Renovate schlafend (rote Cron-Läufe wie
bisher), also entsteht durch die Reihenfolge kein zusätzliches Risiko.

1. App unter https://github.com/settings/apps/new anlegen: Webhook deaktiviert, Installation
   *Only on this account*, Permissions Contents RW / Pull requests RW / Workflows RW /
   Metadata RO.
2. **App ID** notieren, Private Key generieren, App auf `Paddione/Bachelorprojekt` installieren.
3. Secrets setzen:
   ```bash
   gh secret set RENOVATE_APP_ID --body "<app-id>"
   gh secret set RENOVATE_APP_PRIVATE_KEY < <pfad>.private-key.pem
   ```

**Status: erledigt** (2026-07-26). Beide Secrets sind gesetzt — `RENOVATE_APP_ID` (11:09 UTC)
und `RENOVATE_APP_PRIVATE_KEY` (11:11 UTC), verifiziert via `gh secret list`. Der hinterlegte
Wert ist die numerische App ID, weshalb Task 2 den Input `app-id` statt `client-id` verwendet.

## Task 6 — Verifikation

```bash
bats tests/spec/ci-cd.bats --filter "T002161"   # 5/5 ok (RED aus Task 1 ist grün geworden)
task test:inventory                              # Test-Inventar nach Test-Änderung regenerieren
task test:changed
task freshness:regenerate
task freshness:check
```

`website/src/data/test-inventory.json` mit committen — der CI-Inventar-Check vergleicht gegen die
committete Version und failt sonst.

Nach Merge **und** gesetzten Secrets (Task 5) der eigentliche Live-Nachweis:

```bash
gh workflow run renovate.yml
gh run list --workflow=renovate.yml --limit 1
```

Abnahme:
- Der `workflow_dispatch`-Run ist **grün** (erster erfolgreiche Renovate-Lauf überhaupt).
- Renovate erzeugt das Dependency-Dashboard-Issue bzw. mindestens einen Update-PR; der
  Vaultwarden-Bump `1.35.3 → 1.37.0` ist darunter.
- Gegenprobe zu RC3: Diese Vaultwarden-PR trägt das Label `dependencies` und hat **kein**
  aktiviertes Auto-Merge (Minor auf eine Prod-Dependency → bleibt Review-PR).

Der Vaultwarden-Bump selbst wird in dieser PR **nicht** durchgeführt — er ist der Beweis, dass
der Fix greift, und braucht wegen der SSO-only/PKCE-Konfiguration eine eigene Prüfung der
Release Notes auf OIDC-Breaking-Changes (Folgeticket).
