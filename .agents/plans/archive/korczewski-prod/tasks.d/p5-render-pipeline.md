# p5 — Renderer und Artefakt-Workflow

Dieser Partial ist die zweite Instanz des Render-Vertrags aus ADR-016 D3 (design §4): ein Bash-Skript,
das den Overlay-Baum `korczewski-prod/` offline in die vier Artefakt-Pfade
`cluster-bootstrap/`, `platform/`, `secrets/`, `apps/` übersetzt, plus der Workflow, der genau diesen
Baum nach GHCR pusht und keyless signiert. Vorbild sind `scripts/devmesh/render-stack.sh` (135 Zeilen)
und `.github/workflows/render-devmesh-artifact.yml` (99 Zeilen); beide werden kopiert, nicht
verallgemeinert — ein gemeinsames `scripts/lib/render-stack-core.sh` ist laut design §4 ausdrücklich
Folgearbeit, nicht Teil dieses Plans.

Vorbedingung: p3 und p4 sind gemergt, `korczewski-prod/cluster-bootstrap`, `korczewski-prod/platform`,
`korczewski-prod/website` und `korczewski-prod/auth` sind mit `kustomize build` baubar. p1 liefert
`environments/korczewski-prod.yaml` und das SealedSecrets-Blatt.

S1-Budget: `scripts/korczewski-prod/render-stack.sh` ist neu, nicht in `docs/code-quality/baseline.json`
(`jq -r '."S1:scripts/korczewski-prod/render-stack.sh".metric // "nicht-baselined"'` →
`nicht-baselined`), also gilt das Extension-Limit aus `docs/code-quality/gates.yaml`:
`.sh: 800`. Budget = 800 − 0 = **800 Zeilen**; die Tasks sind auf zusammen ≤ 250 Zeilen geschnitten,
jeder Task prüft `wc -l < scripts/korczewski-prod/render-stack.sh`. Der Workflow ist YAML und damit
S1-ungated.

## Task 1: Renderer-Gerüst mit Werkzeug-Gate, Argumenten und Env-Auflösung

**Files:** `scripts/korczewski-prod/render-stack.sh`

Neue Datei, Aufbau analog `scripts/devmesh/render-stack.sh` Zeilen 1–46: Shebang `#!/usr/bin/env bash`,
Kopfkommentar mit Aufruf (`render-stack.sh [--out <dir>]`), Env-Herkunft und Exit-Codes
(0 = Ausgabe erzeugt, 1 = Validierungsfehler der Guards, 2 = Vorbedingung fehlt), dann
`set -euo pipefail`. `REPO_ROOT` über `"$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"`, danach
`cd "$REPO_ROOT"`, damit jeder Aufruf aus jedem Verzeichnis denselben Baum rendert.

Werkzeug-Gate als Schleife über `kustomize envsubst python3 yq` mit Exit 2 und Meldung
`render-stack: <tool> fehlt` — dieselbe Form wie im Vorbild (Zeilen 14–16), aber mit `kustomize` statt
`kubectl`: `scripts/devmesh/render-stack.sh` prüft `kubectl` und rendert über
`kubectl kustomize --load-restrictor=LoadRestrictionsNone` (Zeilen 14, 83, 118), während
`.github/workflows/render-devmesh-artifact.yml` Zeilen 36–41 die gepinnte `kustomize`-Binary 5.4.3 nach
`/usr/local/bin` installiert und danach nie aufruft. Diese Inkonsistenz wird hier bewusst aufgelöst:
der Prod-Renderer benutzt `kustomize build` und prüft genau das Werkzeug, das der Workflow pinnt.
Begründung im Kopfkommentar: (a) lokal und CI rendern dieselbe Version statt der kubectl-Client-Version,
(b) ein offline Render braucht keinen Cluster-Client, (c) p3 und p4 verifizieren bereits mit
`kustomize build` (Tasks 4 und 8 in p3, Task 3 in p4), es entsteht also kein zweiter Werkzeugbegriff.

`source scripts/env-resolve.sh korczewski-prod` (gesourct, niemals ausgeführt — Footgun aus `AGENTS.md`;
das Skript exportiert `PROD_DOMAIN`, `POD_CIDR`, `SERVICE_CIDR`, `WEBSITE_IMAGE_DIGEST`,
`WEBSITE_NAMESPACE`, `WORKSPACE_NAMESPACE`, `TLS_SECRET_NAME` und die übrigen Schema-Variablen).
Danach drei Pflicht-Vorbedingungen mit Exit 2: `PROD_DOMAIN`, `POD_CIDR` und `SERVICE_CIDR` müssen
nicht-leer sein. Das ist keine neue Anforderung, sondern genau der Guard, den p1 Task 1 in seinem
eigenen Verify schon führt; ohne ihn würde envsubst `cidr: ""` schreiben und die NetworkPolicies
fail-open schalten (design §9, Risiko 1). `POD_VTEP_IP` wird wie im Vorbild abgeleitet
(`"${POD_VTEP_IP:-${POD_CIDR%%/*}}"`) und exportiert, weil `k3d/network-policies.yaml` den Wert zieht.

Argument-Schleife mit genau einer Option: `--out` ohne Folgewert → Exit 2 mit
`render-stack: --out erfordert ein Verzeichnis`; jedes andere Argument → Exit 2 mit
`render-stack: Argument '<x>' unbekannt`. Kein Profil-, kein `--only`-Schalter: der Ziel-Cluster hat
genau einen Inhalt, ein zusätzlicher Schalter wäre eine zweite Semantik ohne Aufrufer.

Verify: `bash -n scripts/korczewski-prod/render-stack.sh && [ "$(wc -l < scripts/korczewski-prod/render-stack.sh)" -le 800 ] && grep -qx 'set -euo pipefail' scripts/korczewski-prod/render-stack.sh && grep -q 'source scripts/env-resolve.sh korczewski-prod' scripts/korczewski-prod/render-stack.sh && echo OK`

## Task 2: Drei Teilbäume rendern, envsubst nur für gesetzte Variablen

**Files:** `scripts/korczewski-prod/render-stack.sh`

Eine Funktion `render_part <overlay> <ziel>` rendert einen Overlay und schreibt das Ergebnis nach
`<ziel>`. Sie arbeitet in drei Schritten, deren Reihenfolge den Unterschied zwischen Laufzeit- und
Render-Variablen ausmacht:

1. `kustomize build --load-restrictor=LoadRestrictionsNone "$overlay"` — der Restrictor ist Pflicht,
   weil `prod-fleet/website-korczewski` über `../../k3d/website.yaml` und
   `../../k3d/website-seller-config.yaml` aus dem Baum herausreferenziert (ADR-015).
2. Laufzeit-Variablen sammeln, bevor irgendetwas ersetzt wird: dieselbe Regex wie im Vorbild
   (Zeile 93), `grep -oE '\$\$(\{)?[A-Za-z_][A-Za-z0-9_]*\}?'` mit der Nachbearbeitung
   `sed -E 's/^\$\$\{//; s/^\$\$//; s/\}$//'`. Die Treffer werden in der globalen Variablen
   `RUNTIME_VARS` akkumuliert (Dubletten erst beim Guard-Vergleich via `tr ' ' '\n' | sort -u`).
   Beleg, dass das gebraucht wird: `k3d/pocket-id-client-seed.yaml` enthält `$${SCHEME}`, `$${API}`,
   `$${page}`, `$${secret_key}`, `$${gname}` und weitere Shell-Variablen des Seed-Jobs; ohne diesen
   Schritt würde envsubst sie leer setzen und das Seed-Skript der Auth-Kette zerstören.
3. Subst-Liste bilden und anwenden, exakt im Muster des Vorbilds (Zeilen 87–93): Kandidaten über
   `grep -oE '(^|[^$])\$\{[A-Za-z_][A-Za-z0-9_]*\}'` (das führende `[^$]` hält `$${...}` heraus),
   Namen via `sed -E 's/.*\$\{//; s/\}$//' | sort -u`, und nur Namen mit `[[ -n "${!v+x}" ]]` in die
   Liste aufnehmen. Damit wird eine gesetzte-aber-leere Variable (etwa
   `POCKET_ID_FALLBACK_URL=""`) zu `""`, eine gar nicht gesetzte bleibt als `${VAR}` stehen und läuft
   in den Leftover-Guard aus Task 4 — fail-closed statt stiller Leerung. Anschließend
   `envsubst "$vars"` und das Unwrapping `sed -E 's/\$\$(\{?[A-Za-z_])/$\1/g'`, das `$${VAR}` zu
   `${VAR}` macht (Container-Shell expandiert zur Laufzeit). Ist `vars` leer, entfällt nur der
   envsubst-Aufruf, das Unwrapping läuft trotzdem.

Die drei Aufrufe: `korczewski-prod/cluster-bootstrap` und `korczewski-prod/platform` je in eine eigene
Datei, die beiden App-Bäume `korczewski-prod/website` und `korczewski-prod/auth` nacheinander in zwei
Dateien, die anschließend mit `---`-Trennern zu einem Dokumentstrom verkettet werden. Grund für die
Verkettung: p2 setzt in `ks-apps.yaml` `path: ./apps` als einen Pfad, und die Meta-Kustomization
`korczewski-prod/kustomization.yaml` aus design §5 gehört zu keinem Partial dieses Plans — sie wird
deshalb nicht angelegt, der Renderer ist die einzige Stelle, die die vier Teile zusammenkennt (S4:
kein Orphan-Manifest, keine unbenutzte Datei).

Ohne `--out` wird dieser Dokumentstrom auf stdout geschrieben: vier Teile in Flux-Reihenfolge
`cluster-bootstrap → platform → secrets → apps` (die `dependsOn`-Kette aus design §2), jeder Teil mit
einer `# === <teil> ===`-Kommentarzeile und `---` eingeleitet, Secrets zuletzt, weil der Ciphertext
sonst den Lesefluss der Manifeste unterbricht. Es gibt nur einen Ausgabepfad im Code: intern wird
immer in ein `mktemp -d`-Staging gerendert (`trap 'rm -rf …' EXIT`), stdout und `--out` unterscheiden
sich erst beim Verteilen.

Verify: `bash scripts/korczewski-prod/render-stack.sh > /tmp/kp-stdout.yaml && [ -s /tmp/kp-stdout.yaml ] && [ "$(grep -c '^kind: ' /tmp/kp-stdout.yaml)" -ge 20 ] && ! grep -qE 'mentolder\.de|fleet-manifests|workspace-dev|devmesh\.korczewski\.de' /tmp/kp-stdout.yaml && echo OK`

## Task 3: `--out`-Layout mit vier Verzeichnissen und unveränderter Secrets-Kopie

**Files:** `scripts/korczewski-prod/render-stack.sh`

Mit `--out <dir>` verteilt der Renderer das Staging auf das in design §2 und in den `path:`-Feldern von
p2 festgelegte Layout: `cluster-bootstrap/bootstrap.yaml`, `platform/platform.yaml`,
`apps/apps.yaml`, `secrets/sealed-secrets.yaml`. Die Dateinamen folgen dem Vorbild
(`stack.yaml`/`platform.yaml`/`sealed-secrets.yaml`), nur `cluster-bootstrap` und `apps` sind neu
benannt, weil zwei Pfade sonst dieselbe Datei `stack.yaml` trügen. `mkdir -p` für alle vier
Verzeichnisse vor dem Schreiben, damit ein abgebrochener Lauf keine halbe Struktur hinterlässt;
vorhandene Dateien werden überschrieben (kein `--force`, kein Löschen des Zielverzeichnisses).

Der Secrets-Teil ist eine reine Kopie: `cp environments/sealed-secrets/korczewski-prod.yaml
"$out/secrets/sealed-secrets.yaml"`, **kein** envsubst, kein `yq`-Roundtrip — der Ciphertext muss
byte-identisch bleiben, sonst ist die Signatur des Sealed-Secrets-Controllers nicht mehr prüfbar. Das
ist dieselbe Entscheidung wie im Vorbild (Zeilen 122–125). Fehlt die Quelldatei, bricht der Lauf mit
Exit 1 und `render-stack: environments/sealed-secrets/korczewski-prod.yaml fehlt` ab — nicht mit
einem leeren Verzeichnis, das Flux später als „nichts zu tun" liest.

Der Secrets-Teil taucht bewusst **nicht** in `RUNTIME_VARS`/envsubst auf: in der Datei steht kein
`${...}`, und das bleibt so, weil die vier SealedSecrets laut p1 nur `encryptedData` tragen.

Verify: `rm -rf /tmp/kp-out && bash scripts/korczewski-prod/render-stack.sh --out /tmp/kp-out && [ -s /tmp/kp-out/cluster-bootstrap/bootstrap.yaml ] && [ -s /tmp/kp-out/platform/platform.yaml ] && [ -s /tmp/kp-out/apps/apps.yaml ] && cmp -s /tmp/kp-out/secrets/sealed-secrets.yaml environments/sealed-secrets/korczewski-prod.yaml && [ "$(ls /tmp/kp-out | sort | tr '\n' ' ')" = "apps cluster-bootstrap platform secrets " ] && echo OK`

## Task 4: Sechs fail-closed Guards über den gerenderten Baum

**Files:** `scripts/korczewski-prod/render-stack.sh`

Eine Funktion `validate_tree <dir>` läuft nach dem Rendern, vor dem Verteilen, und prüft sechs Dinge.
Jeder Befund beendet den Lauf mit Exit 1 und der Zeile `render-stack: <Befund>` plus den betroffenen
Dateien auf stderr — nie eine Warnung, nie ein stiller Default. Reihenfolge = Reihenfolge der Prüfung:

1. **Leere Ausgabe.** Jede der vier Dateien muss `-s` sein. Zusätzlich als semantische Leere: `yq ea
   'select((.apiVersion // "") == "") | "doc ohne apiVersion"'` über die Dateien; ein nicht-leerer,
   aber unparsebarer oder apiVersion-loser Baum ist derselbe Fehler wie eine leere Datei. Das ist der
   Grund, warum `yq` in Task 1 im Werkzeug-Gate steht.
2. **`${`-Reste.** Alle `${NAME}`-Treffer im Baum sammeln
   (`grep -ohE '\$\{[A-Za-z_][A-Za-z0-9_]*\}'`), dann jeden Namen aus `RUNTIME_VARS` mit
   `grep -vxF "\${NAME}"` entfernen. Bleibt etwas übrig, ist eine Render-Variable nicht gesetzt: Exit 1
   mit der Liste der Namen. Die Ausnahme ist zwingend, weil `$${SCHEME}` nach dem Unwrapping
   absichtlich als `${SCHEME}` im Job-Skript steht (Task 2) — ein Guard ohne diese Ausnahme würde
   jedes korrekte Auth-Artefakt rot machen.
3. **Fremdreferenzen.** `grep -rnE 'mentolder\.de|fleet-manifests|workspace-dev|devmesh\.korczewski\.de'`
   über den Baum → Exit 1. Das ist die Skript-Hälfte derselben vier Verbote, die der Workflow in Task 5
   als Render-Gate fährt (design §8).
4. **Digest-Pinning.** Jede `image:`-Zeile extrahieren
   (`grep -rhoE '^[[:space:]]*image:[[:space:]]*[^[:space:]]+'`), Präfix und Anführungszeichen strippen
   und gegen `^@sha256:[0-9a-f]{64}$` prüfen (der Wert endet auf `@sha256:<64 Hex>`). Jede Abweichung →
   Exit 1 mit Repo und Wert. Belegt: `k3d/website.yaml:252` rendert
   `ghcr.io/paddione/${WEBSITE_IMAGE}:${WEBSITE_IMAGE_TAG}`, alle anderen Images der Kette
   (`k3d/pocket-id*.yaml`, `website-common`, `website-korczewski`) tragen bereits `@sha256:`; der
   Website-Patch aus p4 Task 1 ersetzt den Tag durch `@${WEBSITE_IMAGE_DIGEST}`. Ist
   `WEBSITE_IMAGE_DIGEST` leer, endet der Wert auf `@` und fällt hier durch — der Guard fängt damit
   auch die leere Substitution, die ein reiner Leftover-Check nicht sieht.
5. **`cluster-admin`.** `grep -rn 'cluster-admin'` über den ganzen Baum → Exit 1, Meldung nennt
   ausdrücklich `roleRef`/`subjects`. Baumweit statt AST-genau, weil jede Fundstelle in einem
   Rollen-Block steht und ein Rollen-*Name* wie `korczewski-prod-cluster-admin-reader` genauso
   verboten sein soll (design §3, C2).
6. **Kein Klartext-Secret.** `yq ea 'select(.kind == "Secret") | .metadata.name'` über die vier Dateien;
   nicht-leere Ausgabe → Exit 1. Beleg, dass das im Ist-Baum null Treffer hat: die Abschluss-Hülle
   dieses Pfads (`prod-fleet/website-korczewski`, `prod-fleet/website-common`, `k3d/website*.yaml`,
   `k3d/pocket-id*.yaml`) enthält keine `kind: Secret`-Ressource. Dieser Guard ist der Grund, warum der
   Workflow `scripts/ci-dummy-secrets.sh` nicht braucht (Task 5): das Dummy-Skript schreibt
   `k3d/secrets.yaml` als Klartext-Secret und würde hier korrekt scheitern.

Damit ist auch die Vertragsseite von p7 abgedeckt: `test_render_out_layout`, `test_no_devmesh_or_fleet_refs`
und `test_images_are_digest_pinned` prüfen denselben Baum, den diese Funktion schon im Renderer
abweist.

Verify: `rm -rf /tmp/kp-out && bash scripts/korczewski-prod/render-stack.sh --out /tmp/kp-out && ! grep -rqE 'mentolder\.de|fleet-manifests|workspace-dev|devmesh\.korczewski\.de|cluster-admin' /tmp/kp-out && [ "$(grep -rhoE '^[[:space:]]*image:[[:space:]]*[^[:space:]]+' /tmp/kp-out | sed -E 's/^[[:space:]]*image:[[:space:]]*//' | grep -vcE '@sha256:[0-9a-f]{64}$')" -eq 0 ] && [ -z "$(yq ea 'select(.kind == "Secret") | .metadata.name' /tmp/kp-out/*/*.yaml)" ] && echo OK`

## Task 5: Artefakt-Workflow mit Render-Gate, GHCR-Push und cosign

**Files:** `.github/workflows/render-korczewski-prod-artifact.yml`

Neue Datei, strukturgleich zu `.github/workflows/render-devmesh-artifact.yml` (99 Zeilen), dieselbe
Reihenfolge der Schritte und dieselben gepinnten Werkzeuge. `name: Render Korczewski Prod Artifact`.

Trigger: `on.push.branches: [main]` mit `paths` aus design §8, ergänzt um die Abhängigkeiten, die der
Renderer wirklich liest: `korczewski-prod/**`, `environments/korczewski-prod.yaml`,
`environments/schema.yaml` (`env-resolve.sh` exportiert genau die Schema-Namen, eine neue Variable dort
ändert das Render-Ergebnis), `environments/sealed-secrets/korczewski-prod.yaml`,
`scripts/korczewski-prod/**`, `scripts/env-resolve.sh`, `scripts/lib/render-subst-list.sh` (SSOT der
repo-weiten envsubst-Doktrin, inklusive der `$$`-Runtime-Semantik, die Task 2 spiegelt), `k3d/**`,
`prod-fleet/website-korczewski/**`, `prod-fleet/website-common/**` und die Workflow-Datei selbst; dazu
`workflow_dispatch`. `concurrency.group: render-korczewski-prod-artifact` mit
`cancel-in-progress: false` (ein abgebrochener Signatur-Lauf hinterlässt ein unsigniertes Tag),
`permissions: contents: read, packages: write, id-token: write`.

Job `render-push-korczewski-prod`, `runs-on: ubuntu-latest`, `timeout-minutes: 20`. Schritte:

1. `actions/checkout@v7` mit `fetch-tags: false`.
2. Werkzeuge installieren wie im Vorbild Zeilen 36–52: `rm -f /usr/local/bin/kustomize`, dann
   `install_kustomize.sh` mit `5.4.3 /usr/local/bin`; `yq` nur falls nicht vorhanden
   (`mikefarah/yq` latest-download nach `/usr/local/bin`); `curl -sSL https://fluxcd.io/install.sh |
   sudo bash`; cosign mit den Werten des Originals — `COSIGN_VERSION=3.1.3`,
   `COSIGN_SHA256=4629c757b7618056f8ddd7e2625ae9fdd94c0372a65049520bc7d9df9efc7f71`, Download von
   `releases/download/v${COSIGN_VERSION}/cosign-linux-amd64`, Prüfung mit `sha256sum -c -`, dann
   `chmod +x`. Keine Version wird neu gewählt.
3. **Kein** `bash scripts/ci-dummy-secrets.sh`. Begründung als Kommentar im Workflow und als
   Nachweisbefehl: das Dummy-Skript erzeugt `k3d/secrets.yaml` und `k3d/backup-secrets.yaml`, und
   `k3d/secrets.yaml` wird ausschließlich von `k3d/kustomization.yaml` referenziert, das nicht in der
   Render-Hülle liegt (`grep -n 'secrets.yaml' prod-fleet/website-korczewski/kustomization.yaml` →
   kein Treffer). Der Prod-Render kommt ohne Klartext-Secrets aus, und der Klartext-Secret-Guard aus
   Task 4 würde ein Dummy ohnehin abweisen. Der Workflow erzeugt damit nirgends Klartext; die
   SealedSecrets-Datei wird nur kopiert.
4. Render: `bash scripts/korczewski-prod/render-stack.sh --out ./out`.
5. Render-Gate als eigener Schritt (Vorbild Zeilen 60–66), `set -euo pipefail`:
   `grep -rnE 'mentolder\.de|fleet-manifests|workspace-dev|devmesh\.korczewski\.de|:latest' out/` →
   bei Treffer `ERROR: Forbidden reference or mutable tag found in out/` und `exit 1`. Die vier
   Fremdreferenzen und `:latest` stehen hier als Text-Gate, weil ein Reviewer im Workflow liest, was
   verboten ist; der Renderer prüft dieselben Verbote feiner (Task 4).
6. `docker/login-action@abd2ef45e78c5afb21d64d4ca52ee8550d9572c7` (`# v5`), `registry: ghcr.io`,
   `username: ${{ github.actor }}`, `password: ${{ secrets.GITHUB_TOKEN }}`.
7. Push mit `id: push-artifact`: `flux push artifact
   oci://ghcr.io/paddione/korczewski-prod-manifests:latest --path=./out
   --source="$(git config --get remote.origin.url)" --revision="${GITHUB_REF_NAME}@sha1:${GITHUB_SHA}"
   --output json`; den `digest` mit demselben `python3 -c`-Einzeiler wie im Vorbild in `$GITHUB_OUTPUT`
   schreiben; danach `flux tag artifact` zweimal — `sha-${GITHUB_SHA}` und `v0.0.${GITHUB_RUN_NUMBER}`.
8. Signatur: `cosign sign --yes
   "ghcr.io/paddione/korczewski-prod-manifests@${{ steps.push-artifact.outputs.digest }}"` (keyless,
   `id-token: write`).

Der Workflow-Name und der Branch sind der Anker, den `flux/clusters/korczewski-prod/oci-source.yaml`
(p2) per `matchOIDCIdentity` pinnt
(`…/render-korczewski-prod-artifact\.yml@refs/heads/main`); er darf hier nicht umbenannt werden.

Verify: `yq -e '.jobs' .github/workflows/render-korczewski-prod-artifact.yml >/dev/null && bash scripts/lint-workflows.sh`

## Task 6: Gesamtabgleich beider Dateien und Commit

**Files:** `scripts/korczewski-prod/render-stack.sh`, `.github/workflows/render-korczewski-prod-artifact.yml`

Beide Dateien zusammen offline durchlaufen: `bash -n` auf das Skript, Zeilenbudget prüfen
(`wc -l` ≤ 800, Ist-Erwartung ~230), Workflow per `scripts/lint-workflows.sh` (actionlint 1.7.7,
`-shellcheck= -pyflakes=`; `shellcheck` ist im Repo kein Gate — weder `.github/workflows/*.yml` noch
`Taskfile*.yml` rufen es auf, nur `tests/local/FA-*.sh` erwähnen es deaktiviert), dann ein voller Render
nach `/tmp/kp-out` mit den unabhängigen Gegenproben aus Task 4. Zusätzlich die Trigger-Liste ausgeben
(`yq -r '.on.push.paths[]' .github/workflows/render-korczewski-prod-artifact.yml`) und Pfad für Pfad
gegen design §8 lesen; eine Längenprüfung allein würde ein falsches Pfad-Set nicht erkennen.

Stage ausschließlich die zwei Zieldateien (kein `git add -A`, kein `git add .`), weil in diesem
Worktree parallel p1–p4 arbeiten. Danach der Commit.

Verify: `bash -n scripts/korczewski-prod/render-stack.sh && [ "$(wc -l < scripts/korczewski-prod/render-stack.sh)" -le 800 ] && yq -e '.jobs' .github/workflows/render-korczewski-prod-artifact.yml >/dev/null && bash scripts/lint-workflows.sh >/dev/null && rm -rf /tmp/kp-out && bash scripts/korczewski-prod/render-stack.sh --out /tmp/kp-out && ! grep -rqE 'mentolder\.de|fleet-manifests|workspace-dev|devmesh\.korczewski\.de|cluster-admin|:latest' /tmp/kp-out && echo OK`

Commit: `feat(infra): korczewski-prod Render- und Artefakt-Pipeline`

## Abweichungen bei der Ausführung (2026-10-26)

- **`flux/clusters/korczewski-prod/**` steht zusätzlich in den Triggern.** design §8 nennt den Pfad,
  Task 5 zählt ihn nicht auf (dort nur `korczewski-prod/**`); eine Umbenennung der `path:`-Felder in
  `ks-*.yaml` soll aber einen Re-Push auslösen. Die übrige Liste ist die Schnittmenge aus design §8
  und den Abhängigkeiten, die der Renderer tatsächlich liest.
- **Guard 1 und Guard 6 prüfen dateiweise, Guard 1 endet auf `.kind` statt auf einem String-Literal.**
  `yq` v4.53.3 wertet ein String-Literal nach `select(...)` je Dokument unabhängig vom `select` aus:
  `yq ea 'select(.apiVersion == "") | "doc ohne apiVersion"'` liefert auch für einen gesunden Baum
  eine Zeile und hätte den Guard dauerhaft rot gemacht (beim Ausführen am 2026-10-26 aufgefallen).
  Jetzt `select((.apiVersion // "") == "") | .kind`, also ein datenabhängiger Pfad; leere Ausgabe =
  kein Befund. Nebeneffekt: der Befund nennt die Datei, was die Task-4-Vorgabe „plus den betroffenen
  Dateien" für diesen Guard sonst nicht erfüllt hätte.
- **stdout-Reihenfolge: Secrets zuletzt.** Der Partial nennt in einem Satz die Flux-Kette
  (`cluster-bootstrap → platform → secrets → apps`) und direkt danach „Secrets zuletzt". Beides
  zugleich geht nicht; die Kette steht in design §2 und gilt für `dependsOn`, die vier Teile liegen im
  Artefakt aber in getrennten Dateien, die Reihenfolge im Strom hat dort keine Semantik. Der Renderer
  folgt deshalb der Begründung des Partials und setzt den Ciphertext ans Ende; die Begründung steht
  als Kommentar im Block, der den Strom schreibt.
