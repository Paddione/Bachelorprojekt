---
title: "fix-k3d-kubelet-cert-T002999 — Implementation Plan"
ticket_id: T002999
domains: [infra, plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# fix-k3d-kubelet-cert-T002999 — Implementation Plan

## File Structure

```
scripts/sdlc/kubelet-cert-check.sh              (neu,  ~130 Zeilen · Limit .sh 800 → Budget ~670)
scripts/lib/kubelet-cert-hint.sh                (neu,  ~35 Zeilen  · Limit .sh 800 → Budget ~765)
scripts/vda/ticket/_ticket-core.sh              (Ist 188 · nicht-baselined · Limit .sh 800 → Budget 612)
scripts/sdlc/health-gate.sh                     (Ist 103 · nicht-baselined · Limit .sh 800 → Budget 697)
taskfiles/Taskfile.sdlc.yml                     (Ist 249 · kein S1-Limit für .yml)
docs/superpowers/references/gotchas-footguns.md (Ist 285 · kein S1-Limit für .md)
tests/spec/sdlc-isolation/kubelet-cert-guard.bats (bereits im Branch, RED)
```

Alle Budgets sind komfortabel; kein Split nötig. Neue Dateien liegen weit unter
dem `.sh`-Limit von 800.

_Ticket: T002999_

## Task 1 — RED: der failing Test liegt bereits im Branch

Die Testdatei ist im Stage-Commit dieses Branches enthalten und beschreibt den
Vertrag aller folgenden Tasks. Sie ist stub-basiert (`kubectl`, `docker`,
`openssl` als PATH-Stubs) und braucht weder Docker noch einen laufenden Cluster,
läuft also auch in CI. Vor der Umsetzung bestätigen, dass sie rot ist:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-isolation/kubelet-cert-guard.bats
# expected: FAIL (9 Tests rot — weder Skript noch Hint-Bibliothek existieren)
```

## Task 2 — Detektor `scripts/sdlc/kubelet-cert-check.sh`

Zieldateien: `scripts/sdlc/kubelet-cert-check.sh`

Vertrag (vom Test festgelegt):

```
kubelet-cert-check.sh [--context <ctx>] [--repair] [--help]
```

- `--help` beendet mit Exit `0` und nennt `--repair` im Text.
- Default-Kontext `k3d-mentolder-dev`, überschreibbar per `--context`.
- Vorbedingungen zuerst: fehlt `kubectl`, `docker` oder `openssl` im PATH, oder
  antwortet der Kontext nicht, Exit `2` mit benannter Ursache. Diese Trennung ist
  bindend — der Test unterscheidet Exit 2 (Vorbedingung) von Exit 1 (Befund).
- Node-Liste und IP über `kubectl --context "$CTX" get nodes` beziehen; pro Zeile
  Node-Name und IPv4-`InternalIP`.
- SAN je Node: `docker exec "$node" cat /var/lib/rancher/k3s/agent/serving-kubelet.crt`
  in ein host-seitiges `openssl x509 -noout -text` pipen und die
  `IP Address:`-Einträge aus dem SAN-Block ziehen. Das Parsen MUSS auf dem Host
  passieren — der k3s-Container hat kein `openssl` (nachgemessen, siehe `design.md`).
- Pro Node eine Zeile `OK`/`FAIL` mit Node-Name, Node-IP und den SAN-IPs. Die
  FAIL-Ausgabe MUSS zusätzlich den Reparaturbefehl mit `--repair` nennen.
- Exit `0` wenn jede Node-IP in ihrer SAN-Liste steht, sonst `1`.
- IPv6-Adressen im SAN ignorieren; verglichen wird die IPv4-`InternalIP`. Der
  beobachtete Defekt betrifft ausschließlich die IPv4-Adresse.

Zwischenprüfung:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-isolation/kubelet-cert-guard.bats
# Tests 1-6 grün, Tests 7-9 weiterhin rot
```

## Task 3 — Reparaturmodus `--repair`

Zieldateien: `scripts/sdlc/kubelet-cert-check.sh`

- Läuft nur für Nodes, die im Prüflauf als `FAIL` erkannt wurden.
- Reihenfolge ist bindend und der eigentliche Kern des Tickets: erst
  `serving-kubelet.crt` und `serving-kubelet.key` im Node-Container löschen,
  **dann** den Container neu starten. Ein Neustart ohne vorheriges Löschen
  schreibt die Datei zwar neu, stellt sie aber nicht neu aus — der SAN bleibt
  alt. Diese Reihenfolge gehört als Kommentar in den Code, nicht nur in den Plan.
- Nach dem Neustart auf die Erreichbarkeit des Kontexts warten und den Prüflauf
  wiederholen; Exit-Code des zweiten Laufs ist der Exit-Code des Aufrufs.
- `--repair` wird von keinem anderen Kommando implizit ausgelöst. Ein
  Container-Neustart als Nebenwirkung eines fremden Vorgangs reißt jede parallele
  Session mit.

Diese Task wird nicht durch den stub-basierten Test abgedeckt (er stubt `docker`).
Nachweis manuell gegen den lokalen Cluster:

```bash
bash scripts/sdlc/kubelet-cert-check.sh
# erwartet: Exit 0 im gesunden Zustand, eine OK-Zeile je Node
```

## Task 4 — Hinweis-Bibliothek `scripts/lib/kubelet-cert-hint.sh`

Zieldateien: `scripts/lib/kubelet-cert-hint.sh`

- Sourcebare Datei ohne Seiteneffekte beim Sourcen; definiert
  `_kubelet_cert_hint <text>`.
- Erkennungsmuster: der Text enthält `x509` **und** `certificate is valid for`.
  An der Fehlersemantik ankern, nicht am exakten Wortlaut der kubectl-Meldung
  [T002716].
- Bei Treffer: mehrzeiliger Hinweis auf stderr, der `kubelet` nennt, erklärt,
  dass die Meldung trotz `psql`-Erwähnung nicht die Datenbank betrifft, und
  `scripts/sdlc/kubelet-cert-check.sh` als nächsten Schritt angibt.
- Ohne Treffer: keine Ausgabe, Rückgabewert `0`.
- Eigene Datei statt Funktion in `_ticket-core.sh`, damit die vier weiteren
  `_pgpod`-Kopien (`scripts/factory/lib.sh`, `scripts/factory/conflict-check.sh`,
  `scripts/mishap-categorize.sh`, `scripts/batch-gap-analysis.sh`, siehe T002386)
  sie ohne Umbau übernehmen können. Ihr Nachziehen ist bewusst nicht Teil dieses
  Fixes.

## Task 5 — Einbindung in den gemeinsamen Ticket-Exec-Pfad

Zieldateien: `scripts/vda/ticket/_ticket-core.sh`

- Die Hinweis-Bibliothek relativ zum Skriptverzeichnis sourcen, nicht über einen
  vom Arbeitsverzeichnis abhängigen Pfad.
- In `_exec_sql` die stderr-Ausgabe von `kubectl exec` erfassen, unverändert
  weiterreichen und anschließend `_kubelet_cert_hint` darauf anwenden. Der
  ursprüngliche Exit-Code MUSS erhalten bleiben — der Hinweis ergänzt, er ersetzt
  nichts.
- Der bestehende BATS-Guard aus `_ticket-core.sh` (Sentinel-Kontext unter BATS,
  T002224) bleibt unangetastet.

Zwischenprüfung:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-isolation/kubelet-cert-guard.bats
# erwartet: 9 von 9 grün
```

## Task 6 — Health-Gate und Task-Eintrag

Zieldateien: `scripts/sdlc/health-gate.sh`, `taskfiles/Taskfile.sdlc.yml`

- In `scripts/sdlc/health-gate.sh` direkt nach dem bestehenden
  `cluster`-Erreichbarkeitsblock den Detektor aufrufen und sein Ergebnis über die
  vorhandenen `pass`/`fail`-Helfer als Komponente `kubelet-cert` melden. Exit `2`
  des Detektors (Vorbedingung fehlt) ist eine Warnung, kein Gate-Fehlschlag —
  sonst scheitert das Gate auf Maschinen ohne `openssl` an der eigenen
  Ausstattung statt am Cluster.
- Der Aufruf gehört vor die Deployment-Prüfungen: `kubectl rollout status` läuft
  über den API-Server und bleibt grün, während jedes `kubectl exec` scheitert.
- In `taskfiles/Taskfile.sdlc.yml` den Task `sdlc:cert:check` ergänzen, der das
  Skript aufruft und `--repair` durchreicht.

Zwischenprüfung:

```bash
task --list-all | grep -F 'sdlc:cert:check'
bash scripts/sdlc/health-gate.sh --timeout 30
```

## Task 7 — Gotchas-Eintrag

Zieldateien: `docs/superpowers/references/gotchas-footguns.md`

Unter Ops & Infra einen Eintrag ergänzen, der die drei nicht offensichtlichen
Punkte festhält: die Meldung nennt `psql` und zeigt damit auf das falsche
Subsystem; der Ausfall trifft alle drei Ticket-Werkzeuge gleichzeitig, weil sie
denselben Exec-Pfad teilen; ein Neustart ohne vorheriges Löschen der
Zertifikatsdateien repariert nicht. Mit Verweis auf `sdlc:cert:check`.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Vor Task 2 bestätigen, dass die bereits
      committete Testdatei rot ist:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-isolation/kubelet-cert-guard.bats
# expected: FAIL (9 rot — Detektor und Hint-Bibliothek fehlen noch)
```

- [ ] **Fix-Step (GREEN).** Nach Task 5 müssen alle Tests derselben Datei grün
      sein:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/sdlc-isolation
```

- [ ] **Reale Gegenprobe.** Der Detektor läuft gegen den echten lokalen Cluster
      und meldet den gesunden Zustand:

```bash
bash scripts/sdlc/kubelet-cert-check.sh
```

- [ ] **Final Verification.** Die drei verbindlichen CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
