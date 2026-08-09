---
ticket_id: T002999
plan_ref: openspec/changes/fix-k3d-kubelet-cert-T002999/tasks.md
status: active
date: 2026-08-09
---

# Design: k3d-Kubelet-Zertifikat nach Docker-IP-Tausch

_Ticket: T002999 · Branch: `fix/k3d-kubelet-cert-T002999`_

## Symptom vs. Hypothese [T002448-M5]

Die Trennung ist hier wichtig, weil die Fehlermeldung in die falsche Richtung zeigt.

| | Aussage | Status |
|---|---|---|
| **Symptom (Fakt)** | Am 2026-08-09 ~12:55Z brachen `ticket.sh`, `ticket-mcp` und `factory-mcp` gleichzeitig ab. Die Meldung nennt `psql`, den Pod `shared-db-…` und einen x509-Fehler: `certificate is valid for 127.0.0.1, ::1, 172.23.0.3, …, not 172.23.0.4`. | beobachtet |
| **Hypothese (zu belegen)** | Nicht DB/Ticket, sondern das Kubelet-Serving-Zertifikat auf `k3d-mentolder-dev-server-0` war auf eine alte Docker-IP ausgestellt. | **belegt**, siehe unten |

### Beleg der Ursache

Alle drei Werkzeuge laufen durch **denselben** Exec-Pfad
(`scripts/vda/ticket/_ticket-core.sh` → `_pgpod` + `_exec_sql` → `kubectl exec`).
`kubectl exec` spricht das Kubelet auf Port 10250 **direkt per IP** an und
verifiziert dessen Serving-Zertifikat. Damit erklärt eine einzige
Zertifikatsabweichung den gleichzeitigen Ausfall aller drei Werkzeuge — eine
DB- oder Ticket-Ursache täte das nicht (die DB war erreichbar, nur der Weg
dorthin nicht).

Nachgemessen im aktuellen (bereits reparierten) Zustand:

```
kubectl get nodes   → k3d-mentolder-dev-server-0  172.23.0.4
docker inspect      → k3d-mentolder-dev-server-0  172.23.0.4
serving-kubelet.crt → SAN: … IP Address:172.23.0.4 …
```

Alle drei stimmen nach der manuellen Reparatur überein; im Fehlerfall wich
genau der dritte Wert ab. Der Vergleich `Node-InternalIP ∈ SAN-IP-Liste` ist
damit die **entscheidbare Invariante** — und sie ist host-seitig berechenbar.

Zwei Randbefunde, die die Umsetzung binden:

1. **`openssl` fehlt im k3s-Container** (`command -v openssl` → nichts). Das
   Zertifikat muss also per `docker exec … cat` herausgereicht und auf dem
   **Host** geparst werden.
2. **Ein Container-Neustart allein repariert nicht.** k3s schrieb die Datei neu
   (mtime aktuell), stellte sie aber nicht neu aus — der SAN blieb alt. Erst
   `rm` von `serving-kubelet.crt`/`.key` **vor** dem Neustart erzwingt die
   Neuausstellung. Genau dieser Schritt ist der nicht offensichtliche Teil und
   der eigentliche Grund für dieses Ticket.

## Was gebaut wird

Drei Bausteine, bewusst getrennt nach *erkennen*, *erklären*, *reparieren*.

### 1. Detektor + Reparatur: `scripts/sdlc/kubelet-cert-check.sh`

Vertrag:

```
kubelet-cert-check.sh [--context <ctx>] [--repair] [--help]
```

- Ohne `--repair`: rein lesend. Pro Node Zeile `OK`/`FAIL` mit Node-Name,
  Node-IP und SAN-IPs.
- Exit **0** = alle Nodes stimmig · **1** = mindestens ein veralteter SAN
  (Befund) · **2** = Vorbedingung fehlt (`kubectl`/`docker`/`openssl` nicht im
  PATH, Kontext nicht erreichbar, Usage-Fehler).
  Die Trennung 1 vs. 2 ist nicht kosmetisch: „Befund" und „Werkzeug fehlt"
  müssen für Aufrufer (health-gate, CI) unterscheidbar bleiben.
- Mit `--repair`: löscht `serving-kubelet.crt`/`.key` im betroffenen
  Node-Container, startet ihn neu, prüft danach erneut und meldet das Ergebnis.

### 2. Fehlerpfad-Übersetzung: `scripts/lib/kubelet-cert-hint.sh`

Eine sourcebare Funktion `_kubelet_cert_hint <stderr-text>`, die den x509-SAN-
Fehler erkennt und auf stderr einen Hinweis ausgibt, der `kubelet` und den
Reparaturbefehl nennt. Bei unverwandten Fehlern schweigt sie.

Eingebunden wird sie in `_exec_sql`/`_pgpod` in
`scripts/vda/ticket/_ticket-core.sh` — dem gemeinsamen Exec-Pfad aller
Ticket-Subkommandos.

### 3. Vorfeld-Prüfung: `scripts/sdlc/health-gate.sh`

Der Detektor läuft direkt nach dem bestehenden `cluster`-Reachability-Check.
`kubectl get nodes` geht über den API-Server und ist von der Kubelet-
Zertifikatslage **nicht** betroffen — der bestehende Check kann grün sein,
während jedes `kubectl exec` scheitert. Genau diese Lücke schließt der Schritt.

## Verworfene Alternativen

| Alternative | Warum verworfen |
|---|---|
| Automatische Selbstheilung im Exec-Pfad | Ein Container-Neustart als Nebenwirkung eines Ticket-Writes ist nicht vertretbar — er reißt jede parallele Session mit. Der Nutzer bekommt den Befehl genannt und entscheidet. |
| Nur Doku in `gotchas-footguns.md` | Trifft den Kern nicht: die Meldung führt in die falsche Richtung, man *sucht* nicht in der Kubelet-Doku. Der Eintrag kommt zusätzlich, nicht statt. |
| Hinweis in allen fünf `_pgpod`-Implementierungen | `factory/lib.sh`, `conflict-check.sh`, `mishap-categorize.sh` und `batch-gap-analysis.sh` halten eigene Kopien (T002386). Der Hinweis kommt als **sourcebare Datei**, damit sie ihn übernehmen können; das Nachziehen ist bewusst nicht Teil dieses Fixes (eigener Vorgang, eigene Prüfung). |
| `kubectl exec` durch Portforward ersetzen | Ändert die Architektur aller Ticket-Werkzeuge wegen eines lokalen Dev-Defekts. Unverhältnismäßig. |

## Abgrenzung

Ausschließlich lokale k3d-Dev-Umgebung (`k3d-mentolder-dev`). Keine
Produktions-Manifeste, keine `prod-fleet/*`-Overlays, kein `fleet`-Kontext,
kein Cluster-Reset.

## Prozess-Hinweis

Diese Session lief nicht-interaktiv (Welle-1-Dispatch). Das Brainstorming ist
hier schriftlich geführt statt im Dialog; die Scope-Vorgabe (Erkennung/Reparatur
statt einmaligem Eingriff) kam aus dem Dispatch. Ein Lavish-Board wurde nicht
geöffnet — ohne Zustimmung des Users [T002523-M3].
