---
title: "flux-bootstrap-secrets-ssot-T002254 — Implementation Plan"
ticket_id: T002254
domains: [infra, security]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# flux-bootstrap-secrets-ssot-T002254 — Implementation Plan

_Ticket: T002254_

Die beiden Flux-Bootstrap-SealedSecrets (`flux-system/ghcr-auth`,
`flux-system/flux-webhook-token`) werden künftig von `task env:seal` erzeugt statt von
Hand gesealt. Design-Entscheidungen und Begründung: `proposal.md` im selben Ordner.

## File Structure

| Datei | Ist-Zeilen | S1-Budget |
|-------|-----------|-----------|
| `scripts/lib/seal-extra-namespaces.sh` | 208 | 292 |
| `environments/schema.yaml` | 1391 | S1 kennt kein Limit für `.yaml` |
| `tests/spec/secret-rotation.bats` | 125 | S1 kennt kein Limit für `.bats` |
| `flux/clusters/fleet/bootstrap/ghcr-auth-sealedsecret.yaml` | 30 | generiert, kein Limit |
| `flux/clusters/fleet/bootstrap/flux-webhook-token-sealedsecret.yaml` | 30 | generiert, kein Limit |

Die gesamte neue Logik gehört nach `scripts/lib/seal-extra-namespaces.sh` (Budget 292).
Die aufrufende Datei bleibt bewusst unverändert: sie liegt mit 427 von 500 Zeilen bei
85 % ihrer wirksamen Schwelle, und ihre bestehende `source`-Zeile genügt, um die
erweiterte Bibliothek zu laden. Das setzt die Extraktion fort, mit der
`seal-extra-namespaces.sh` ursprünglich herausgelöst wurde.

<!-- vitest: kein neuer Test nötig, weil diese Änderung ausschließlich Bash und YAML
     berührt und keine Datei unter website/src/ anfasst. -->

## Task 1 — RED: Tests für Typ, dockerconfigjson und Ausgabedatei

Erweitere `tests/spec/secret-rotation.bats` um vier `@test`-Blöcke. Alle vier sourcen
`scripts/lib/seal-extra-namespaces.sh` und prüfen die reinen Bau-Funktionen offline —
ohne `kubeseal`, ohne Cluster, ohne Zugriff auf `environments/.secrets/`. Als Eingabe
dient je eine temporäre Schema- und Secrets-Datei in `$BATS_TEST_TMPDIR`, befüllt mit
frei erfundenen Testwerten.

1. **Default-Typ bleibt `Opaque`.** Ein `extra_namespaces`-Eintrag ohne `type` erzeugt ein
   Manifest mit `type: Opaque`.
2. **`type` wird durchgereicht.** Ein Eintrag mit
   `type: kubernetes.io/dockerconfigjson` erzeugt ein Manifest mit genau diesem Typ.
3. **dockerconfigjson wird korrekt zusammengesetzt.** Aus `registry: ghcr.io`,
   `username_key` und Quell-Key entsteht der Wert
   `{"auths":{"ghcr.io":{"auth":"<base64 von user:token>"}}}` unter dem Schlüssel
   `.dockerconfigjson`. Gegenprobe: der rohe Token taucht im Manifest nicht unverpackt auf.
4. **`output_file` routet die Ausgabe.** Ein Eintrag mit `output_file` landet in genau
   dieser Datei und **nicht** in der Sammeldatei; zwei Einträge mit demselben
   `output_file` erscheinen dort als zwei YAML-Dokumente.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/secret-rotation.bats
# expected: FAIL — build_secret_manifest kennt weder `type` noch `output_file`,
# und einen dockerconfigjson-Builder gibt es noch nicht.
```

## Task 2 — Schema um Typ, Registry und Ausgabedatei erweitern

In `environments/schema.yaml`:

- Neuer Secret-Eintrag `GHCR_USERNAME` (`required: false`, `generate: false`) mit
  Beschreibung, dass er zusammen mit `GHCR_PAT` das `ghcr-auth`-Secret bildet.
- Neuer Secret-Eintrag `FLUX_WEBHOOK_TOKEN` (`required: false`, `generate: true`,
  `length: 32`) — der Receiver-Token ist ein reines Shared Secret ohne externe Bindung
  und darf deshalb generiert werden.
- `GHCR_PAT` bekommt ein `extra_namespaces`-Mapping auf `flux-system` / `ghcr-auth` mit
  `type: kubernetes.io/dockerconfigjson`, `registry: ghcr.io`,
  `username_key: GHCR_USERNAME`, `dest_key: .dockerconfigjson`,
  `output_file: flux/clusters/fleet/bootstrap/ghcr-auth-sealedsecret.yaml` und
  `owner_brand: [mentolder]`.
- `FLUX_WEBHOOK_TOKEN` bekommt ein Mapping auf `flux-system` / `flux-webhook-token` mit
  `dest_key: token`,
  `output_file: flux/clusters/fleet/bootstrap/flux-webhook-token-sealedsecret.yaml` und
  `owner_brand: [mentolder]`.

Beide Einträge erhalten einen Kommentar, der auf T002251 (Herkunft der handgesealten
Ciphertexte) und T002254 verweist.

## Task 3 — GREEN: Sealer um Typ, dockerconfigjson und Ausgabedatei erweitern

In `scripts/lib/seal-extra-namespaces.sh`:

- `parse_extra_namespace_entries` gibt vier weitere Tab-getrennte Felder aus:
  `type`, `output_file`, `registry`, `username_key`. Leere Felder bleiben leer — das
  bestehende Ausgabeformat wird nur erweitert, nicht umgestellt.
- `build_secret_manifest` nimmt den Typ als Parameter und schreibt ihn statt des bisher
  hart kodierten `type: Opaque`. Fehlt er, bleibt `Opaque` der Default.
- Neue Funktion `build_dockerconfigjson <registry> <username> <token>`, die
  `{"auths":{"<registry>":{"auth":"<base64 von user:token>"}}}` liefert. Sie schreibt
  weder in eine Datei noch nach stdout-Logs, damit kein Plaintext in Logs landet.
- `seal_extra_namespace_secrets` gruppiert die Mappings nach `output_file`. Für Gruppen
  mit gesetztem `output_file` wird die Zieldatei **vollständig neu geschrieben** (nicht
  angehängt), damit ein aus dem Schema entfernter Eintrag keinen Ciphertext zurücklässt.
  Die Gruppe ohne `output_file` verhält sich unverändert und landet in
  `environments/sealed-secrets/<env>.yaml`.
- Der bestehende `owner_brand`-Filter greift vor dem Schreiben: wird eine Gruppe für die
  aktuelle Brand übersprungen, bleibt ihre Zieldatei unangetastet.

Der Kopfkommentar beider generierten Dateien unter `flux/clusters/fleet/bootstrap/` wird
so erzeugt, dass er den bisherigen manuellen Regenerierungs-Hinweis durch
`task env:seal ENV=mentolder` ersetzt und weiterhin auf T002251 und T002254 verweist.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/secret-rotation.bats
# erwartet: PASS — alle vier Tests aus Task 1 grün
```

## Task 4 — Migration: Plaintext aus dem Cluster in den SSOT überführen

Dieser Schritt ist einmalig und berührt eine git-crypt-verschlüsselte Datei. Er wird
**nicht** automatisiert und **nicht** in ein Skript geschrieben.

1. Die drei Werte `GHCR_USERNAME`, `GHCR_PAT` und `FLUX_WEBHOOK_TOKEN` in
   `environments/.secrets/mentolder.yaml` eintragen. `GHCR_PAT` existiert dort
   möglicherweise bereits — in dem Fall den vorhandenen Wert prüfen statt zu überschreiben.
   Die aktuellen Cluster-Werte lassen sich mit `kubectl --context fleet -n flux-system get
   secret <name> -o jsonpath=…` lesen; sie dürfen dabei nicht in Shell-History,
   Logdateien oder Terminalausgabe landen.
2. `task env:validate ENV=mentolder` — muss grün sein.
3. `task env:seal ENV=mentolder` — erzeugt beide Bootstrap-Dateien neu.
4. **Äquivalenz-Gate.** Verglichen werden die *entschlüsselten* Werte im Cluster vor und
   nach `kubectl apply` der neuen Dateien, nicht die Ciphertexte: `kubeseal` erzeugt bei
   jedem Lauf unterschiedliche Ciphertexte für denselben Klartext, ein Byte-Diff der
   `-sealedsecret.yaml` ist also ohne Aussagekraft. Weichen die entschlüsselten Werte ab,
   wird nicht appliziert, sondern der Schema-Eintrag korrigiert.
5. `task env:seal ENV=korczewski` — die beiden Bootstrap-Dateien müssen danach
   byte-identisch sein (`git diff --exit-code flux/clusters/fleet/bootstrap/`), weil
   `owner_brand: [mentolder]` greift.

## Task 5 — Abschließende Verifikation

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/secret-rotation.bats
task test:changed
task freshness:regenerate
task freshness:check
```

Zusätzlich `task test:inventory` ausführen und
`website/src/data/test-inventory.json` mitcommitten, da Task 1 neue `@test`-Blöcke
hinzufügt und der CI-Inventar-Check sonst rot wird.
