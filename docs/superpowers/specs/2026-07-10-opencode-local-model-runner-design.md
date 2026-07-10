---
ticket_id: T001780
plan_ref: openspec/changes/opencode-local-model-runner/tasks.md
status: active
date: 2026-07-10
---

# opencode-local-model-runner — Design Spec

## Kontext

`.github/workflows/opencode.yml` triggert opencode via PR-/Issue-Kommentar (`/oc`, `/opencode`)
und läuft aktuell auf `ubuntu-latest`, nutzt das Cloud-Modell `opencode/big-pickle` mit
`OPENCODE_API_KEY` (PR #2732, T001778 — noch kein Secret-Wert gesetzt). Der User möchte
stattdessen ein bereits lokal betriebenes Modell nutzen (LM Studio / `llama-server.exe`
auf dem Windows-GPU-Host, siehe Memory `REFERENCE-LLM-CONFIG.md`), das nur via
`wg-gpu`-WireGuard-Tunnel unter `192.168.100.10:1234` erreichbar ist — kein öffentlicher
Netzwerkpfad, also kein Zugriff von GitHub-gehosteten Runnern.

## Entscheidungen (Brainstorming, per AskUserQuestion geklärt)

1. **Runner-Standort: Fleet-Node** (gekko-hetzner-2/3/4). Diese sind bereits `wg-gpu`-Peers
   und erreichen `192.168.100.10:1234` direkt — kein zusätzlicher Netzwerk-Hop, immer online
   (im Gegensatz zum WSL-Host des Users, der nur läuft wenn der Rechner an ist).
   Trade-off akzeptiert: der Runner-Prozess läuft auf produktiver Hetzner-Infra und führt
   PR-Kommentar-getriggerten Code aus — größerer Blast-Radius bei Kompromittierung als ein
   isolierter Dev-Rechner.
2. **Fork-Schutz: Same-Repo-Pflicht.** Zusätzlich zum bestehenden `author_association`-Gate
   (OWNER/MEMBER/COLLABORATOR) wird der Workflow um eine Bedingung ergänzt, die PRs aus
   externen Forks komplett blockiert — unabhängig davon, wer kommentiert. Grund: das
   Auth-Gate schützt nur davor, dass ein *Fremder* triggert, nicht davor, dass ein
   *vertrauenswürdiger* Kollaborator versehentlich `/oc` auf einer Fork-PR kommentiert und
   damit `actions/checkout` den fremden PR-HEAD auf dem Fleet-Runner auscheckt und ausführt.

## Scope dieses Change

- `.github/workflows/opencode.yml`: `runs-on` auf ein Self-Hosted-Label (z.B.
  `[self-hosted, fleet-gpu]`) umstellen; Same-Repo-Bedingung ergänzen; `model:` auf den
  lokalen Provider/Modellnamen aus `.opencode/opencode.jsonc` (`llamacpp-mtp/gemma-4-12B-it-qat-UD-Q4_K_XL.gguf`)
  umstellen; `OPENCODE_API_KEY`-Secret-Env entfernen (nicht mehr nötig — lokal, kein
  Cloud-Auth) bzw. durch die Base-URL des lokalen Providers ersetzen, falls die Action das
  benötigt.
- **Runner-Provisionierung** (Infrastruktur, kein reiner Code-Change): Registrierung eines
  GitHub Actions Self-Hosted Runners auf einem Fleet-Node. Das ist ein manueller
  Infra-Schritt (Registrierungs-Token von GitHub, `./config.sh` auf dem Node, systemd-Unit
  für den Runner-Daemon) — **außerhalb des automatisierten Plans**, da er echten Zugriff auf
  die Hetzner-Node und ein frisches GitHub-Registrierungs-Token braucht, das nicht im Repo
  vorliegen darf. Der Plan dokumentiert die Schritte, führt sie aber nicht selbst aus.
- Kein Ändern von `.opencode/opencode.jsonc` nötig — der lokale Provider ist dort bereits
  konfiguriert und dient nur als Referenz für den Modellnamen im Workflow.

## Out of Scope

- Kein automatisches Provisionieren/Registrieren des Runners durch dieses Change (Secrets/
  Registrierungs-Token außerhalb der Repo-Automatisierung).
- Kein Wechsel der `ai-review.yml`-Pipeline (DeepSeek Cloud) — nur `opencode.yml` betroffen.
- Kein Entfernen des `OPENCODE_API_KEY`-Secrets aus den Repo-Settings (falls der User es
  parallel für andere Zwecke behalten will) — nur der Verweis im Workflow entfällt.

## Risiken

- Self-Hosted Runner auf einem produktiven Fleet-Node erweitert die Angriffsfläche dieses
  Nodes (geteiltes Netz mit Workspace-Pods). Mitigation: Same-Repo-Gate + bestehendes
  Auth-Gate; Runner-Prozess sollte mit minimalen Rechten laufen (kein root, kein
  Kubeconfig-Zugriff im Runner-User-Kontext).
- Der Fleet-Node muss dauerhaft für den Runner-Daemon reserviert werden (Ressourcen-Overhead,
  auch wenn `/oc` selten getriggert wird).
