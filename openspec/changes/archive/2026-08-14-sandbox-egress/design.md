---
title: Design: sandbox-egress — Egress-Allowlist der Factory-Sandbox (T003871)
ticket_id: null
domains: [website, infra, test]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Design: sandbox-egress — Egress-Allowlist der Factory-Sandbox (T003871)

## Kontext

`scripts/factory/sandbox-run.sh` soll laut SSOT-Spec (`openspec/specs/software-factory.md`,
„Sandboxed Command Execution for the Implement Phase" und „Agent-Session-Containerisierung")
für Factory-Agenten eine **default-deny-Egress-Policy mit Allowlist** durchsetzen
(Anthropic-API, npm-Registry, GitHub, Staging-/Prod-Endpunkte). Die aktuelle Implementierung
ist wirkungslos.

## Root-Cause (verifiziert, Stand 2026-08-11 im Ticket mit Reproducer belegt)

1. **Falscher Ort, fehlendes Binary:** `enforce_egress()` startet einen separaten
   `alpine:latest`-Container mit `--cap-add=NET_ADMIN --rm` und setzt dort iptables-Regeln.
   Alpine enthält kein iptables → `sh: iptables: not found`; stderr wird mit `2>/dev/null`
   verworfen, der Exit-Code ist der des abschließenden `echo` (0) — die Funktion meldet
   Erfolg. Selbst mit installiertem iptables gilt eine OUTPUT-Regel nur im Netzwerk-Namespace
   des setzenden Containers; der Alpine-Container stirbt mit `--rm`, die Agenten-Container
   haben eigene netns.
2. **Capability-Leak:** `--cap-add=${AGENT_MODE:+NET_ADMIN}` expandiert auch im One-shot-Modus
   (`AGENT_MODE=false` ist ein nicht-leerer String) — jeder Sandbox-Container bekommt
   NET_ADMIN.
3. **One-shot ohne Schutz:** Der One-shot-Modus ruft `enforce_egress` gar nicht erst auf
   (nur Agent-Modus, marker-gesteuert) — dort existiert keinerlei Restriktion.

## Alternativen (Brainstorming-Ergebnis)

### A. Egress-Proxy-Container als einziger Ausgang — GEWÄHLT

Alle Sandbox-Netze (`factory-sandbox-egress`, `factory-sandbox-slot-N`) werden mit
`docker network create --internal` angelegt: Container darauf haben per Konstruktion keine
externe Route (default-deny auf Netzebene, kein iptables, keine Capabilities, kein
NET_ADMIN an irgendeiner Stelle). Ein einziger Proxy-Container (`factory-sandbox-proxy`,
lokales Image aus neuem `scripts/factory/sandbox-proxy.Dockerfile`, Alpine + Squid) hängt an
jedem Sandbox-Netz plus dem Default-Bridge als einzigem externen Pfad. Die Squid-ACLs werden
aus derselben `egress_allowlist()`-Funktion generiert (single source of truth); Squid
filtert sowohl CONNECT (HTTPS) als auch HTTP nach `dstdomain`. Sandbox-Container bekommen
`HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY` injiziert; `--cap-add` entfällt vollständig. Der
WSL-DNS-Workaround (`--dns 1.1.1.1`, T002250) wandert vom Sandbox-Container zum
Proxy-Container (dort wird er gebraucht, im internen Netz ist er unerreichbar und würde die
Proxy-Hostname-Auflösung brechen).

**Begründung:** Domänen-Semantik Ende-zu-Ende (Squid `dstdomain` matcht den CONNECT-Target
bzw. den Host-Header), keine Capabilities nötig, default-deny ist strukturell — selbst ein
Agent, der den Proxy ignoriert, hat keinen direkten Ausgang. Bestehender Code behauptet
genau diese Allowlist; die Funktion `egress_allowlist()` bleibt die eine Quelle.

### B. `--network none` + expliziter Proxy — VERWORFEN

Nicht implementierbar wie beschrieben: Ein Container auf `--network none` hat keine
Netzwerkschnittstelle und kann auch den Proxy nicht erreichen (nur über Netns-Sharing-Hacks).
Das `--internal`-Netz aus A ist die tragfähige Variante desselben Gedankens und streng
besser: Container-zu-Container-Kommunikation und der eingebettete Docker-DNS bleiben
erhalten.

### C. iptables/nft im Agenten-Image mit Regeln beim Start — VERWORFEN

Die Regeln lägen dann im korrekten netns, aber: (1) iptables matcht IPs, die Allowlist ist
domänenbasiert — `github.com`, `codeload.github.com`, `api.anthropic.com` bedienen jeweils
mehrere IPs, eine einzelne `-d <host>`-Regel resolved genau einmal und droppt die übrigen
Adressen (latenter Fehler, der auch im Bestandscode steckt); (2) NET_ADMIN ist beim Start
nötig plus ein sorgfältiger Capability-Drop (capsh/setpriv) in beiden Dockerfiles, damit der
Agent die Regeln nicht selbst aufhebt; (3) Bildgewicht und DNS-Edge-Cases. Der Proxy erhält
die Domänen-Semantik Ende-zu-Ende und braucht null Capabilities.

## Prior Art

`docs/superpowers/specs/2026-07-14-factory-qa-sandbox-design.md` (Ursprungs-Design der
Sandbox) lässt den Mechanismus explizit offen: „`--network`-Setup mit Egress-Allowlist
(z. B. dockereigenes Netz + iptables/Proxy oder `--network none` + explizite Proxy-Env)".
Option A ist einer der zwei dort vorgeschlagenen Pfade — keine Umkehr einer getroffenen
Entscheidung.

## Scope

- **In Scope:** Docker-Backend von `sandbox-run.sh` (One-shot- und Agent-Modus), neues
  Proxy-Image `sandbox-proxy.Dockerfile`, BATS-Tests
  (`tests/spec/software-factory/sandbox-egress.bats`), Spec-Delta, Anpassung des
  T002250-M2-Tests (der `--dns 1.1.1.1`-Grep wandert mit dem Workaround zum Proxy).
- **Out of Scope:** k8s-Backend (`sandbox-job.yaml` hat keine Egress-Policy; k3d-Dev-Cluster
  ohne NetworkPolicy-fähiges CNI — Parität ist ein eigenes Ticket), `FACTORY_SANDBOX=off`
  (bewusst unsandboxed, Warnung + Telemetrie laut Spec).
