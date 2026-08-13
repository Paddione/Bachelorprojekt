---
title: "sandbox-egress — Egress-Allowlist der Factory-Sandbox"
ticket_id: T003871
domains: [security, test, infra]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# sandbox-egress — Implementation Plan

_Ticket: T003871_

## File Structure

```
scripts/factory/sandbox-run.sh                       (M — Egress-Mechanik: internal nets + Proxy, --cap-add weg)
scripts/factory/sandbox-proxy.Dockerfile             (A — Squid-Proxy-Image, lokal gebaut)
tests/spec/software-factory/sandbox-egress.bats      (A — RED/GREEN-Tests, im Stage-Commit bereits enthalten)
tests/spec/mishap-docker-wsl-T002250.bats            (M — --dns-1.1.1.1-Grep zielt auf die Proxy-Sicherstellung)
openspec/changes/sandbox-egress/specs/software-factory.md (A — Spec-Delta, bereits geschrieben)
```

S1-Notation: alle Dateien „nicht-baselined" (`docs/code-quality/baseline.json`), Größen klein
(sandbox-run.sh 176, mishap-docker-wsl 62 Zeilen) — kein Budget-Druck; die Erweiterung von
sandbox-run.sh bleibt unter 240 Zeilen netto.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** `tests/spec/software-factory/sandbox-egress.bats`
      reproduziert den Bug auf dem Bestandscode: der Sandbox-Container erreicht
      `example.com` (ERREICHT statt BLOCKIERT) und das Netz ist nicht internal
      (`{{.Internal}}` = false). Beide Tests sind rot; der manuelle Probe-Lauf
      zeigt `ERREICHT` + `internal=false` (Reproducer aus dem Ticket).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/sandbox-egress.bats
# expected: FAIL — auf dem Bestandscode rot (kein Proxy, Netz nicht internal, Egress offen)
```

- [ ] **Fix-Step (GREEN).** Die Tasks 1–3 implementieren die strukturelle
      default-deny-Egress-Policy. Danach sind beide Tests grün.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/sandbox-egress.bats
# expected: PASS
```

- [ ] **Final Verification.** Die drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusätzlich (Repo-Konvention): `task test:inventory` — die neue BATS-Datei muss in
`website/src/data/test-inventory.json` auftauchen; Regenerat committen.

## Tasks

### Task 1: Squid-Proxy-Image (`scripts/factory/sandbox-proxy.Dockerfile`, neu)

Baue ein kleines, lokal gebautes Proxy-Image nach dem Muster der bestehenden
Sandbox-Images (`sandbox.Dockerfile`/`sandbox-agent.Dockerfile` — Build via
`docker build -f sandbox-proxy.Dockerfile "${REPO}/scripts/factory"`):

- `FROM alpine:3.20`, `apk add --no-cache squid` (Domänen-Allowlist für CONNECT/HTTPS
  kann tinyproxy nicht — Squid `dstdomain`-ACL matcht den CONNECT-Target).
- Cache-Verzeichnis vorbereiten (`mkdir -p /var/spool/squid`, `squid -z` einmal im
  Build), Start als `squid -N -f /etc/squid/squid.conf` — die Config kommt zur
  Laufzeit per Bind-Mount (sie wird pro Allowlist-Stand generiert).

### Task 2: `scripts/factory/sandbox-run.sh` — strukturelle default-deny-Egress-Policy

2.1 **`ensure_network` erweitern:** Netz mit `--internal` anlegen (`docker network
    create --internal "$net"`). Existiert das Netz bereits OHNE internal (Bestand aus
    dem fehlerhaften Code), wird es neu angelegt: erst den Proxy-Container vom Netz
    trennen (`docker network disconnect`), dann `docker network rm` + `create
    --internal`. Die Funktion bleibt idempotent für den Grün-Pfad.

2.2 **`ensure_egress_proxy` (neu):** sichert pro Sandbox-Netz (shared + Slot-Netze)
    einen einzelnen Proxy-Container `factory-sandbox-proxy`:
    - Proxy-Image bauen, falls nicht vorhanden (Muster `build_image`).
    - Squid-Config aus `egress_allowlist()` generieren (single source of truth — die
      Funktion bleibt die eine Quelle, keine zweite Allowlist inline):
      ```
      http_port 3128
      acl allowed_domains dstdomain api.anthropic.com opencode.ai api.deepseek.com registry.npmjs.org github.com codeload.github.com <PROD_DOMAIN> staging.<PROD_DOMAIN>
      acl CONNECT method CONNECT
      acl SSL_ports port 443
      http_access allow CONNECT SSL_ports allowed_domains
      http_access allow allowed_domains
      http_access deny all
      ```
    - Config in ein Host-Verzeichnis (`/tmp/factory-sandbox-proxy/squid.conf`)
      schreiben und per `-v`-Mount einhängen; ändert sich die Config (z. B. neuer
      PROD_DOMAIN), Container mit `docker restart` neu starten (mit `cmp` auf die
      Datei vergleichen — kein blindes Restart bei jedem Aufruf).
    - Container starten mit `--network "$net"` und anschließend
      `docker network connect bridge <container>` — der Default-Bridge ist der
      EINZIGE externe Pfad; die Sandbox-Netze selbst sind `--internal`.
    - **WSL-DNS-Workaround (T002250) wandert HIERHER:** bei gesetztem
      `WSL_DISTRO_NAME` bekommt der PROXY `--dns 1.1.1.1` — nicht mehr die
      Sandbox-Container (dort wäre 1.1.1.1 im internalen Netz unerreichbar und würde
      die Proxy-Hostname-Auflösung brechen).
    - Idempotent: Container existiert bereits → nur fehlende Netz-Connects
      nachziehen; Marker-Dateien (`/tmp/.sandbox-net-*`) entfallen ersatzlos.

2.3 **`run_docker` umbauen:**
    - `--cap-add="${AGENT_MODE:+NET_ADMIN}"` **vollständig entfernen** — behebt den
      Expansion-Bug aus dem Ticket (AGENT_MODE='false' ist nicht-leer → NET_ADMIN an
      jeden Container); der Proxy-Ansatz braucht nirgends eine Capability.
    - `docker_dns` (die `--dns 1.1.1.1`-Option) aus dem Sandbox-Container-Aufruf
      entfernen (gehört jetzt zu Task 2.2).
    - Proxy-Umgebung injizieren: `-e HTTP_PROXY=http://factory-sandbox-proxy:3128
      -e HTTPS_PROXY=http://factory-sandbox-proxy:3128
      -e NO_PROXY=localhost,127.0.0.1` plus die Lowercase-Varianten
      (`http_proxy`/`https_proxy`/`no_proxy`).
    - One-shot- UND Agent-Pfad rufen jetzt `ensure_network` + `ensure_egress_proxy`
      auf (vorher: One-shot gar keine Restriktion, Agent nur die tote
      `enforce_egress`).

2.4 **`enforce_egress` löschen** (inkl. der `iptables`-Zeilen und des
    alpine-`docker run`-Aufrufs) — die Funktion ist der Kern des Bugs; Reste würden
    den Fehler als „alternativen Pfad" konservieren. Die `egress_allowlist()`-Funktion
    bleibt als Quelle für die Squid-ACLs bestehen.

### Task 3: `tests/spec/mishap-docker-wsl-T002250.bats` anpassen

Der Test „T002250-M2: sandbox-run.sh runs docker with --dns 1.1.1.1 in WSL" greppt
`--dns 1.1.1.1` in sandbox-run.sh. Nach Task 2 taucht das Flag nur noch in der
Proxy-Sicherstellung auf. Den Test umbauen (M2-Modus, Source-Verifikation bleibt —
das Flag manifestiert sich nur im Quelltext):

- Positiv-Anker zuerst [T002356-M1]: `--dns 1.1.1.1` ist in der Proxy-Sicherstellung
  vorhanden (der Workaround lebt weiter).
- Negativ: das Flag taucht NICHT mehr im Sandbox-Container-`docker run`-Aufruf auf
  (Bezug auf den `run_docker`-Teil — z. B. Grep nur im Bereich der
  Container-Invokation statt in der ganzen Datei, sonst matcht der Proxy-Teil).

### Task 4: GREEN-Lauf + Regenerate

- `tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/sandbox-egress.bats`
  grün stellen (dazu ggf. das Alt-Netz `factory-sandbox-egress` einmalig löschen —
  `ensure_network` aus Task 2.1 macht das selbst, ein vorhandenes Alt-Netz wird
  neu angelegt).
- `tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/catalog-eval-telemetry.bats`
  — die FA-SF-SANDBOX-Guards (Mounts, Main-Checkout-Refusal) müssen grün bleiben.
- `tests/unit/lib/bats-core/bin/bats tests/spec/mishap-docker-wsl-T002250.bats`
  — der umgebaute M2-Test grün.
- `task test:inventory` regenerieren und das geänderte
  `website/src/data/test-inventory.json` committen.

## Verify (Abschluss)

- [ ] **Final Verification.**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] `tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/sandbox-egress.bats`
      ist grün (GREEN-Beleg aus Task 4).
