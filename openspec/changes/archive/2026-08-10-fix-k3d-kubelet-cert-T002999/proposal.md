# Proposal: fix-k3d-kubelet-cert-T002999

## Why

Tauschen die Docker-Container des lokalen k3d-Dev-Clusters bei einem Neustart
ihre IPs, bleibt das Kubelet-Serving-Zertifikat auf dem alten SAN stehen. Jedes
`kubectl exec` gegen den betroffenen Node scheitert dann mit einem x509-Fehler —
und damit **alle** Ticket-Werkzeuge gleichzeitig (`ticket.sh`, `ticket-mcp`,
`factory-mcp`), weil sie denselben Exec-Pfad benutzen.

Zwei Eigenschaften machen den Ausfall teuer:

1. **Die Meldung führt in die falsche Richtung.** Sie nennt `psql` und den
   `shared-db`-Pod, klingt also nach DB- oder Ticket-Problem. Die Ursache liegt
   eine Ebene tiefer im Kubelet.
2. **Ein Cluster-Neustart repariert nicht.** k3s schreibt die Zertifikatsdatei
   neu, stellt sie aber nicht neu aus. Erst das Löschen von
   `serving-kubelet.crt`/`.key` **vor** dem Neustart erzwingt die Neuausstellung.

Erschwerend: der Ausfall trifft genau die Werkzeuge, mit denen man ihn
dokumentieren würde.

Symptom-/Hypothesen-Trennung und der Beleg der Ursache stehen in `design.md`.

## What

- **Neu** `scripts/sdlc/kubelet-cert-check.sh` — vergleicht pro Node die
  Kubernetes-`InternalIP` mit den IP-Einträgen im SAN des Kubelet-Serving-
  Zertifikats. Exit 0 = stimmig, 1 = veralteter SAN, 2 = Vorbedingung fehlt.
  `--repair` löscht Zertifikat und Schlüssel, startet den Node-Container neu und
  prüft erneut.
- **Neu** `scripts/lib/kubelet-cert-hint.sh` — sourcebare Funktion, die den
  x509-SAN-Fehler erkennt und in einen Kubelet-Hinweis samt Reparaturbefehl
  übersetzt.
- **Geändert** `scripts/vda/ticket/_ticket-core.sh` — bindet den Hinweis in den
  gemeinsamen Exec-Pfad ein.
- **Geändert** `scripts/sdlc/health-gate.sh` — prüft die Zertifikatslage direkt
  nach der Cluster-Erreichbarkeit. `kubectl get nodes` läuft über den API-Server
  und bleibt grün, während jedes `kubectl exec` scheitert; diese Lücke schließt
  der Schritt.
- **Geändert** `taskfiles/Taskfile.sdlc.yml` — Task `sdlc:cert:check`.
- **Geändert** `docs/superpowers/references/gotchas-footguns.md` — Eintrag unter
  Ops & Infra.
- **Neu** `tests/spec/sdlc-isolation/kubelet-cert-guard.bats` — stub-basiert,
  läuft ohne Docker und ohne laufenden Cluster.

Ausschließlich lokale Dev-Umgebung. Keine Produktions-Manifeste, kein
`fleet`-Kontext, kein Cluster-Reset.

_Ticket: T002999_
