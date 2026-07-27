---
title: "ticket-pgpod-running-pod-selector — Implementation Plan"
ticket_id: T002307
domains: [infra, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# ticket-pgpod-running-pod-selector — Implementation Plan

## File Structure

```
scripts/vda/ticket/_ticket-core.sh            (geändert) — _pgpod: Running-Filter + Diagnose
.claude/skills/references/mcp-tool-guide.md   (geändert) — pods_exec/pods_run, ALTER ROLE, psql()-Helper
openspec/specs/mcp-gateway.md                 (geändert) — Architektur-Notiz richtigstellen
tests/spec/ticket-system.bats                 (im Stage-Commit, RED) — 2 Tests für _pgpod
```

**S1-Budgets (wirksame Schwelle − aktuelle Zeilen):**

| Datei | Ist | Budget |
|---|---|---|
| `scripts/vda/ticket/_ticket-core.sh` | 96 | 404 |

`.claude/skills/references/mcp-tool-guide.md`, `openspec/specs/mcp-gateway.md` und
`tests/spec/ticket-system.bats` werden vom S1-Gate nicht gemessen — für sie wird bewusst
kein Zahlenbudget behauptet. Kein Verkleinerungsschritt nötig: der einzige gemessene Pfad
hat 404 Zeilen Luft und wächst hier um höchstens 6.

## Kontext für den Implementer

Die Ursachenklärung steht in `proposal.md` und ist **nicht** neu zu erheben. Kurz:

- Nur **Eintrag 1** des Mishap-Bundles ist ein Bug.
- **Eintrag 2** (`pods/exec` verweigert) und **Eintrag 3** (`mcp-postgres` read-only) sind
  gewollte Schutzschichten. Es wird **keine** RBAC-Regel ergänzt und **kein**
  read-only-Zwang gelockert — beide Einträge werden ausschließlich dokumentiert.

**Abgrenzung zu parallel laufender Arbeit — nicht anfassen:**

- `scripts/ticket.sh` bleibt in diesem Change **unverändert**. Die BRAND-/Namespace-
  Auflösung dort wird gerade unter T002280 umgebaut. Der Fix gehört nach
  `scripts/vda/ticket/_ticket-core.sh`; alle rund 25 Call-Sites laufen ohnehin durch
  `_pgpod`, ein Eingriff in `ticket.sh` ist weder nötig noch erlaubt.
- Die Brand-Topologie von `mcp-postgres` (T002278) bleibt unangetastet. Die Doku-Edits
  betreffen nur die read-only-Eigenschaft, nicht welche Brand-DB angebunden ist.

## Tasks

- [ ] **1. RED bestätigen.** Die beiden Tests aus dem Stage-Commit gegen den ungefixten
      Stand laufen lassen und verifizieren, dass sie aus dem richtigen Grund fallen:
      der erste liefert `pod/shared-db-completed` statt `pod/shared-db-live`, der zweite
      findet den Field-Selector nicht.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system.bats
# expected: FAIL — "T002307: _pgpod skips a completed shared-db pod ..." und
# "T002307: _pgpod asks the API server for Running pods only" sind rot,
# die sieben Alt-Tests bleiben gruen.
```

- [ ] **2. GREEN — `_pgpod` auf Running filtern.** In
      `scripts/vda/ticket/_ticket-core.sh` den `kubectl get pod`-Aufruf in `_pgpod()`
      (Zeile 32) um `--field-selector status.phase=Running` erweitern. Der Label-Selektor
      `-l 'app in (shared-db, shared-db-dev)'`, das nachgelagerte `| head -1` und die
      Signatur des Helpers bleiben unverändert — nur der Filter kommt hinzu.

      Zusätzlich die Fehlerdiagnose schärfen: Liefert die gefilterte Abfrage nichts,
      einmal ungefiltert nachfragen und die Meldung danach unterscheiden zwischen
      "gar kein shared-db-Pod im Namespace" und "Pods vorhanden, aber keiner Running"
      (im zweiten Fall die gefundenen Pods nennen). Der Exit-Code bleibt in beiden Fällen
      1. Die Nachfrage darf nur im Fehlerpfad laufen, damit der Normalfall genau einen
      API-Call behält.

      Der BATS-Guard oben in der Datei (`CTX="bats-no-cluster-t002224"`) bleibt
      unangetastet.

- [ ] **3. GREEN prüfen.** Dieselbe Suite erneut laufen lassen; alle neun Tests grün.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system.bats
```

- [ ] **4. Doku: `pods_exec`/`pods_run` als bewusst verweigert benennen.** In
      `.claude/skills/references/mcp-tool-guide.md`, Abschnitt `mcp-kubernetes`, die
      Aufzählung "Mutations bleiben kubectl" um `pods_exec` und `pods_run` ergänzen und
      einen Satz anfügen, der die Ursache belegt: Der Server läuft in-cluster unter der
      SA `claude-code-agent` (`k3d/default/claude-code-agent-clusterrole.yaml`, nur
      `get`/`list`/`watch`), erreichbar über `kubectl port-forward` auf
      `svc/claude-code-mcp-monolith` in `default`. Ein "cannot create resource pods/exec"
      ist damit das erwartete Ergebnis und **keine** Fehlkonfiguration; der Weg ist
      `kubectl exec`. Prüfbefehl, den der Text nennen soll:
      `kubectl --context fleet auth can-i create pods/exec --as=system:serviceaccount:default:claude-code-agent -n workspace`.

- [ ] **5. Doku: read-only-Invariante von `mcp-postgres` präzisieren.** In derselben Datei
      die globale Invariante "Writes/DDL/Superuser bleiben kubectl" um die konkreten
      Statements ergänzen, die dort auflaufen — `ALTER USER`, `ALTER ROLE`, `GRANT` —
      inklusive des Fehlerwortlauts "cannot execute … in a read-only transaction" und des
      Hinweises, dass der Server jede Query in eine `READ ONLY`-Transaktion klammert. Der
      read-only-Zwang selbst wird **nicht** angetastet.

      Im selben Zug den dort dokumentierten `psql()`-Helper (Abschnitt `mcp-postgres`,
      "Fallback (Reads) & Pflichtweg für Writes") auf denselben Filter ziehen wie
      `_pgpod`, damit die Doku nicht weiter den Completed-Pod anleitet:
      `kubectl get pod -n workspace --context fleet -l app=shared-db --field-selector status.phase=Running -o name | head -1`.

- [ ] **6. SSOT `openspec/specs/mcp-gateway.md` richtigstellen.** Die Architektur-Notiz
      behauptet, `claude-code-mcp-monolith` sei dekommissioniert und alle MCP-Server
      liefen als CLI-Prozesse auf dem WSL-Host. Für `mcp-kubernetes` (`:18080`) und
      `mcp-postgres` (`:13001`) stimmt das nicht: Beide sind Port-Forwards auf das
      Deployment `claude-code-mcp-monolith` in `default`, das unverändert läuft. Die Notiz
      auf diesen Stand bringen und die wirksame Identität (SA `claude-code-agent`,
      read-only) benennen. Die Aussage über die übrigen, tatsächlich host-seitigen Server
      bleibt bestehen — nur die pauschale Formulierung wird korrigiert.

- [ ] **7. Ticket-Einordnung dokumentieren.** Einen Kommentar an T002307 hängen, der je
      Bundle-Eintrag festhält: 1 = gefixt, 2 = kein Bug (Least Privilege, nur Doku),
      3 = kein Bug (gewollter read-only-Zwang, nur Doku). So wird derselbe Mishap nicht
      erneut als Bug gemeldet.

```bash
bash scripts/ticket.sh add-comment --id T002307 --body "<Einordnung je Bundle-Eintrag>"
```

- [ ] **8. Final Verification.** Die drei verbindlichen CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
