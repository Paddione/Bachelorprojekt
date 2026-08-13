# Proposal: sandbox-egress — Egress-Allowlist der Factory-Sandbox (T003871)

## Why

**Symptom (beobachtet, reproduzierbar):** Sandboxed Factory-Agenten haben unbeschränkten
Netzzugang, obwohl Code und Spec (`openspec/specs/software-factory.md`) eine
default-deny-Egress-Allowlist behaupten. Reproducer (Ticket T003871, 2026-08-11): Ein
Container auf dem Sandbox-Netz erreicht `https://example.com` (nicht-allowlistet) problemlos.

**Ursachen-Hypothese (im Ticket):** Die iptables-Regeln aus `enforce_egress()` greifen nicht,
weil (a) alpine:latest kein iptables enthält und (b) die Regeln im falschen Netzwerk-Namespace
gesetzt werden.

**Verifikation:** (a) bestätigt durch Reproducer (`sh: iptables: not found`, Exit 0).
(b) ist aus dem Docker-Modell ableitbar und durch die Architektur belegt — der
Alpine-Container stirbt mit `--rm`; OUTPUT-Regeln gelten nur in seinem eigenen netns.
Zusätzlich belegt durch Code-Inspektion: `--cap-add=${AGENT_MODE:+NET_ADMIN}` expandiert auch
im One-shot-Modus, und der One-shot-Pfad ruft `enforce_egress` gar nicht auf. Beide Befunde
sind unabhängig von der iptables-Frage wirksam — der Fix adressiert alle drei Pfade.

## What

Der Docker-Backend-Pfad von `scripts/factory/sandbox-run.sh` setzt die Egress-Allowlist
**strukturell** durch, statt sie per iptables-Befehl zu behaupten:

1. Alle Sandbox-Netze werden mit `docker network create --internal` angelegt — Container
   darauf haben per Konstruktion keinen externen Ausgang (default-deny auf Netzebene).
2. Ein Egress-Proxy-Container (`factory-sandbox-proxy`, neues lokales Image
   `sandbox-proxy.Dockerfile` mit Squid) ist der einzige Pfad nach außen; seine
   Domänen-Allowlist wird aus der bestehenden `egress_allowlist()`-Funktion generiert
   (single source of truth) und filtert HTTP wie HTTPS-CONNECT.
3. Sandbox-Container erhalten `HTTP_PROXY`/`HTTPS_PROXY`; `--cap-add` entfällt vollständig
   (behebt den NET_ADMIN-Expansion-Bug), der WSL-`--dns`-Workaround wandert zum Proxy.
4. Die wirkungslose `enforce_egress()`-Funktion und die Marker-Logik werden durch
   idempotente Netz-/Proxy-Sicherstellung ersetzt.

Design-Entscheidung und Alternativenbewertung (A vs. B `--network none` vs. C iptables im
Image): `openspec/changes/sandbox-egress/design.md`.

_Ticket: T003871_
