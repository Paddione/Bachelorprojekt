---
title: "G-DOC04: Architektur-ADRs anlegen (0→≥5)"
ticket_id: T001298
domains: ["docs","architecture"]
status: plan_staged
---

# g-doc04-architecture-adrs — Implementation Plan

## File Structure

| Datei | Aktion |
|-------|--------|
| `docs/adr/ADR-001-fleet-konsolidierung.md` | NEU |
| `docs/adr/ADR-002-push-basiertes-deploy.md` | NEU |
| `docs/adr/ADR-003-brand-namespace-split.md` | NEU |
| `docs/adr/ADR-004-llm-fail-closed.md` | NEU |
| `docs/adr/ADR-005-merge-equals-abschluss.md` | NEU |

---

## Task 0: Baseline messen (RED)

Verifizieren, dass aktuell kein `docs/adr/`-Verzeichnis und keine ADR-Dateien existieren.

- [ ] Measure-Command ausführen:
  ```bash
  find docs -ipath '*adr*' -name '*.md' 2>/dev/null | wc -l
  ```
  expected: FAIL (aktueller Wert: 0 ADRs — kein docs/adr/ Verzeichnis — over target: ≥5 ADRs in docs/adr/)

---

## Task 1: ADR-001 — Fleet-Konsolidierung Phase 3

Erstellt `docs/adr/ADR-001-fleet-konsolidierung.md` im Nygard-Format. Dokumentiert die Entscheidung, die drei eigenständigen Cluster (mentolder-standalone, korczewski-standalone, devc) zu einem einzigen Fleet-k3s-Cluster mit drei Control-Plane-Nodes (pk-hetzner-4/6/8) und drei Worker-Nodes (gekko-hetzner-2/3/4) zusammenzuführen (2026-05-31).

Inhalt der Datei (vollständig):

```markdown
# ADR-001: Fleet-Konsolidierung — Zusammenführung aller Marken-Cluster (Phase 3)

**Status:** Accepted  
**Datum:** 2026-05-31  
**Ticket:** T001298

## Kontext

Bis Mai 2026 betrieb das Projekt drei separate k3s-Cluster:

- `mentolder-standalone` auf gekko-hetzner-2/3/4
- `korczewski-standalone` auf pk-hetzner-4/6/8 (später dekommissioniert in Phase 2)
- `k3s-1` (Einzelknoten, permanent ausgefallen: Speicherfehler 2026-05-31)

Drei getrennte Cluster bedeuteten dreifachen Betriebsaufwand: separate Sealed-Secrets-Controller, separate cert-manager-Installationen, separate Keycloak-Instanzen und getrennte Deployments für jede Aktualisierung. Der k3s-1-Ausfall beschleunigte die Entscheidung.

## Entscheidung

Alle Workloads werden in einem einzigen Fleet-Cluster konsolidiert. Der Cluster besteht aus drei Control-Plane-Nodes (pk-hetzner-4/6/8) und drei Worker-Nodes (die ehemaligen mentolder-standalone-Knoten gekko-hetzner-2/3/4). Beide Marken (mentolder, korczewski) laufen als getrennte Namespaces (`workspace`, `workspace-korczewski`) im selben Cluster. Lokale Entwicklung erfolgt weiterhin via k3d (`k3d-mentolder-dev`).

## Konsequenzen

**Positive Konsequenzen:**
- Betriebsaufwand halbiert: ein Sealed-Secrets-Controller, ein cert-manager, eine Traefik-Instanz.
- Ressourcennutzung verbessert: Worker-Nodes aus dem dekomiissionierten mentolder-Cluster sind vollständig nutzbar.
- Einfachere Wartung: eine kubeconfig (`fleet`), ein Deployment-Kontext.

**Negative Konsequenzen:**
- Stärkere Kopplung: ein Cluster-Ausfall betrifft beide Marken gleichzeitig.
- Cross-brand-Isolation nur auf Namespace-Ebene, nicht auf Cluster-Ebene.
- LiveKit muss per `nodeAffinity` auf pk-hetzner-4 gepinnt werden (hostNetwork + stabile IP).

**Tote Kontexte (nie mehr verwenden):** `mentolder`, `korczewski` (alle kubeconfigs außer `fleet` und `k3d-mentolder-dev` sind ungültig).
```

- [ ] Verzeichnis `docs/adr/` anlegen und Datei `ADR-001-fleet-konsolidierung.md` mit obigem Inhalt erstellen.

---

## Task 2: ADR-002 — Push-basiertes Deploy ohne GitOps-Reconciler

Erstellt `docs/adr/ADR-002-push-basiertes-deploy.md`. Dokumentiert die Entscheidung, keinen in-cluster GitOps-Reconciler (Flux, Argo CD) einzusetzen, sondern Deployments explizit via `task workspace:deploy ENV=<brand>` auszulösen.

Inhalt der Datei (vollständig):

```markdown
# ADR-002: Push-basiertes Deploy — kein GitOps-Reconciler im Cluster

**Status:** Accepted  
**Datum:** 2026-04-01  
**Ticket:** T001298

## Kontext

Kubernetes-Produktivumgebungen verwenden typischerweise einen GitOps-Reconciler (Flux CD, Argo CD), der Änderungen im Git-Repository automatisch auf den Cluster anwendet. Für dieses Projekt wurde diese Option evaluiert.

Rahmenbedingungen des Projekts:
- Bachelorarbeit-Kontext: überschaubare Komplexität, kein Teamfehler durch verpasste Deploys.
- Zwei Marken-Namespaces mit leicht unterschiedlichen Konfigurationen.
- Bestehende Taskfile-Infrastruktur (`task workspace:deploy`) bereits etabliert.
- Cluster-Ressourcen begrenzt (kein dedizierter Reconciler-Node).

## Entscheidung

Das Projekt verzichtet auf einen in-cluster GitOps-Reconciler. Deployments erfolgen ausschließlich push-basiert:

- `task workspace:deploy ENV=<brand>` — manuell oder via CI/CD nach Merge.
- `build-website*.yml` GitHub Actions — automatischer Push nach `website/**`-Änderungen auf main.
- Kein `flux-system`-Namespace, kein Argo-Controller auf dem Fleet-Cluster.

## Konsequenzen

**Positive Konsequenzen:**
- Keine Reconciler-Latenz: Änderungen werden sofort beim Deploy-Aufruf wirksam.
- Einfachere Fehlersuche: kein separates Reconciler-Logging, kein Drift-Detection-Overhead.
- Ressourcenschonung auf dem Cluster.
- Volle Kontrolle: kein automatisches Rollback durch einen Reconciler, der unerwünschte Zustände korrigiert.

**Negative Konsequenzen:**
- Kein automatischer Drift-Schutz: manuelle Änderungen am Cluster (`kubectl apply`, `kubectl edit`) werden nicht automatisch zurückgesetzt.
- Ein vergessener Deploy nach Merge führt zu einem Cluster-Zustand, der nicht dem main-Branch entspricht.
- Skaliert schlechter bei vielen simultanen Deployments.

**Mitigierung:** `task workspace:deploy` wird nach jedem Merge auf main explizit in der CI-Dokumentation und im CLAUDE.md-Gotchas-Abschnitt als Pflichtschritt dokumentiert.
```

- [ ] Datei `docs/adr/ADR-002-push-basiertes-deploy.md` mit obigem Inhalt erstellen.

---

## Task 3: ADR-003 — Brand-Namespace-Split

Erstellt `docs/adr/ADR-003-brand-namespace-split.md`. Dokumentiert die Entscheidung, die Marken-Isolation durch Kubernetes-Namespaces (`workspace` für mentolder, `workspace-korczewski` für korczewski) statt durch separate Cluster umzusetzen.

Inhalt der Datei (vollständig):

```markdown
# ADR-003: Brand-Namespace-Split — Multi-Mandanten via Kubernetes-Namespaces

**Status:** Accepted  
**Datum:** 2026-05-05  
**Ticket:** T001298

## Kontext

Das Projekt betreibt zwei voneinander getrennte Marken (mentolder.de, korczewski.de) auf derselben Plattform. Beide Marken haben eigene Keycloak-Realms, eigene Nextcloud-Instanzen, eigene Domains und eigene Secrets. Die Frage ist, auf welcher Abstraktionsebene die Isolation umgesetzt wird.

Optionen:
1. Separate Cluster pro Marke (höchste Isolation, höchster Betriebsaufwand).
2. Namespace-Trennung im selben Cluster (mittlere Isolation, niedrigerer Aufwand).
3. Ein Namespace mit Label-basierter Trennung (geringste Isolation, nicht gewählt).

## Entscheidung

Die Marken werden durch Kubernetes-Namespaces getrennt: `workspace` (mentolder) und `workspace-korczewski` (korczewski). Alle marken-sensitiven Tasks exportieren `WORKSPACE_NAMESPACE` und verwenden `${WORKSPACE_NAMESPACE:-workspace}` konsequent. Keine Ressource hardcodet `-n workspace`.

ENV-Aliase: `ENV=mentolder` = `ENV=fleet-mentolder`, `ENV=korczewski` = `ENV=fleet-korczewski` — beide zeigen auf den `fleet`-Kontext.

## Konsequenzen

**Positive Konsequenzen:**
- Ein einziger Fleet-Cluster statt zwei Cluster — Betriebsaufwand halbiert.
- Namespace-RBAC trennt Workloads: kein Pod aus `workspace-korczewski` kann direkt auf Secrets in `workspace` zugreifen.
- Cross-cutting-Ressourcen (shared-db, cert-manager, Sealed Secrets Controller) sind einmalig vorhanden.

**Negative Konsequenzen:**
- Namespace-Isolation ist schwächer als Cluster-Isolation: ein kompromittierter Cluster-Admin hat Zugriff auf beide Namespaces.
- Cross-cutting-Änderungen (DB-Passwort-Rotation, OIDC-Client-Anpassungen) müssen explizit in beiden Namespaces durchgeführt werden.
- `WORKSPACE_NAMESPACE` muss in jedem neuen Task und Skript explizit berücksichtigt werden.

**Implikation für DSGVO:** Daten beider Marken liegen physisch auf denselben Nodes. Die logische Trennung durch Namespaces ist dokumentiert; eine physische Trennung ist für das Bachelorprojekt nicht gefordert.
```

- [ ] Datei `docs/adr/ADR-003-brand-namespace-split.md` mit obigem Inhalt erstellen.

---

## Task 4: ADR-004 — LLM fail-closed ohne Cross-Space-Fallback

Erstellt `docs/adr/ADR-004-llm-fail-closed.md`. Dokumentiert die Entscheidung, dass Embedding-Anfragen bei Ausfall des zugeordneten Modells hart scheitern und nie auf ein Modell aus einem anderen Vektorraum ausweichen.

Inhalt der Datei (vollständig):

```markdown
# ADR-004: LLM-Embedding-Architektur — fail-closed, kein Cross-Space-Fallback

**Status:** Accepted  
**Datum:** 2026-05-01  
**Ticket:** T001298

## Kontext

Das Projekt betreibt zwei Embedding-Modelle mit inkompatiblen Vektorräumen:

- `bge-m3` (768 Dimensionen, via TEI auf dem GPU-Host, Retrieval-optimiert)
- `voyage-multilingual-2` (1024 Dimensionen, via Voyage AI API, kostenpflichtig)

Vektoren aus verschiedenen Embedding-Modellen sind mathematisch inkompatibel: Ein `bge-m3`-Query-Vektor kann nicht sinnvoll gegen `voyage-multilingual-2`-Dokumentvektoren mit `<=>` (pgvector Cosinus-Distanz) verglichen werden. Das Ergebnis wäre semantisch bedeutungslos (Garbage-Retrieval), ohne dass ein Fehler geworfen wird.

## Entscheidung

Jede Kollektion ist genau einem Embedding-Modell zugeordnet. Anfragen an eine Kollektion verwenden immer das zugeordnete Modell. Fällt das Modell aus, schlägt die Anfrage mit einem klar definierten Fehler fehl (`MixedEmbeddingModelError` oder Service-503). Es gibt keinen automatischen Fallback auf ein anderes Modell.

Multi-Kollektions-Anfragen, die beide Vektorraumtypen mischen würden, werden abgelehnt (`MixedEmbeddingModelError`).

## Konsequenzen

**Positive Konsequenzen:**
- Retrieval-Qualität ist garantiert: kein stiller Fehler durch Vektorraum-Mismatch.
- Deterministisches Verhalten: Entwickler und Nutzer wissen, welches Modell wann verwendet wird.
- Einfache Fehlersuche: ein Fehler zeigt präzise an, welches Modell nicht erreichbar ist.

**Negative Konsequenzen:**
- Ausfall des GPU-Hosts (RTX 5070 Ti) legt alle `bge-m3`-Kollektionen lahm — kein Cloud-Fallback.
- `voyage-multilingual-2`-Kollektionen sind von der Voyage-AI-API abhängig (externe Verfügbarkeit).
- Kein transparenter Degraded-Mode: Nutzer sehen einen Fehler, keine verschlechterten Ergebnisse.

**Bewusste Ablehnung:** Ein stiller Fallback wurde explizit verworfen, weil fehlerhafte Vektorraum-Mischung schlechtere Ergebnisse liefert als ein klarer Fehler. Die Entscheidung priorisiert Korrektheit über Verfügbarkeit.
```

- [ ] Datei `docs/adr/ADR-004-llm-fail-closed.md` mit obigem Inhalt erstellen.

---

## Task 5: ADR-005 — Merge = Abschluss im Ticketmodell

Erstellt `docs/adr/ADR-005-merge-equals-abschluss.md`. Dokumentiert die Entscheidung, dass ein erfolgreicher Auto-Merge nach main ein Ticket direkt schließt (`done · resolution=shipped`) ohne einen separaten `awaiting_deploy`-Status im Happy-Path (T001092).

Inhalt der Datei (vollständig):

```markdown
# ADR-005: Merge = Abschluss — Ticketmodell ohne awaiting_deploy-Happy-Path

**Status:** Accepted  
**Datum:** 2026-06-01  
**Ticket:** T001092 / T001298

## Kontext

Das Ticketsystem der Software Factory verwaltet den Lifecycle von Features, Fixes und Chores. Vor T001092 gab es einen `awaiting_deploy`-Status zwischen Merge und Produktiv-Deploy, da das Deployment entkoppelt (push-basiert) ist und nicht automatisch nach jedem Merge ausgelöst wird.

Probleme des alten Modells:
- `awaiting_deploy` akkumulierte Tickets, die nie manuell auf `done` gesetzt wurden.
- Der Factory-Floor zeigte eine nicht leergeräumte `awaiting_deploy`-Lane als Rauschen.
- Der Prod-Deploy ist entkoppelt und kann Minuten bis Stunden nach dem Merge folgen — eine Unterscheidung zwischen "gemergt" und "live" ist für ein Bachelorprojekt ohne SLA nicht relevant.

## Entscheidung

Ein grüner Auto-Merge nach main schließt ein Ticket direkt: Status `done`, `resolution=shipped`. Der Prod-Deploy ist entkoppelt und ändert den Ticket-Status nicht. `awaiting_deploy` und `qa_review` bleiben als gültige Enum-Werte (für Sonderfälle und historische Zeilen), sind aber aus dem Happy-Path entfernt.

Umsetzung:
- Factory-Pipeline (`pipeline.js`): nach Auto-Merge direkt auf `done` setzen.
- `dev-flow-execute`-Skill: nach Merge auf `done` setzen, kein `awaiting_deploy`-Zwischenzustand.
- Watchdog: Tickets mit Status `awaiting_deploy` älter als 24 Stunden werden als Anomalie markiert.
- Factory-Floor: `awaiting_deploy`-Lane wird nur noch bei manuell zurückgehaltenen Tickets angezeigt.

## Konsequenzen

**Positive Konsequenzen:**
- Klares, einfaches Modell: Merge = Fertig. Keine mehrdeutigen Zwischenzustände.
- Factory-Floor zeigt einen saubereren Zustand ohne Rauschen.
- Weniger manuelle Ticket-Pflege nach Merge.

**Negative Konsequenzen:**
- Kein Status-Tracking zwischen Merge und Prod-Live-Deployment.
- Für zukünftige Szenarien mit SLA oder separatem QA-Gate muss `qa_review` wieder in den Happy-Path aufgenommen werden.

**Quality-Gate-Erfassung:** Verify-Phase-Events werden weiterhin als `tickets.factory_phase_events` mit strukturiertem `detail` erfasst — unabhängig vom Ticketstatus.
```

- [ ] Datei `docs/adr/ADR-005-merge-equals-abschluss.md` mit obigem Inhalt erstellen.

---

## Task 6: Baseline erneut messen (GREEN)

Verifizieren, dass der Mess-Command jetzt `5` zurückgibt.

- [ ] Measure-Command erneut ausführen:
  ```bash
  find docs -ipath '*adr*' -name '*.md' 2>/dev/null | wc -l
  ```
  Erwarteter Wert: `5` (Ziel ≥5 erfüllt)

- [ ] Health-Goal-Check ausführen:
  ```bash
  bash scripts/health-goals-check.sh --only=G-DOC04
  ```
  Erwartetes Ergebnis: grün

---

## Task 7 (Verify): Quality Gates

- [ ] `bash scripts/health-goals-check.sh --only=G-DOC04` → Ziel-Status grün
- [ ] `task test:changed`
- [ ] `task freshness:regenerate`
- [ ] `task freshness:check`
