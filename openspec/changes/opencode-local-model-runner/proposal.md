# Proposal: opencode-local-model-runner

## Why

`.github/workflows/opencode.yml` triggert opencode via PR-/Issue-Kommentar und läuft auf
`ubuntu-latest` mit dem Cloud-Modell `opencode/big-pickle` (Secret `OPENCODE_API_KEY`, noch
nicht gesetzt, siehe T001778/PR #2732). Der User betreibt für die interaktive CLI-Session
bereits ein lokales Modell (LM Studio / `llama-server.exe` auf dem Windows-GPU-Host, siehe
Memory `REFERENCE-LLM-CONFIG.md`), erreichbar nur via `wg-gpu`-WireGuard-Tunnel
(`192.168.100.10:1234`) von Fleet-Pods aus — kein öffentlicher Netzwerkpfad, also für
GitHub-gehostete Runner unerreichbar. Ziel: den `/oc`-Workflow ohne Cloud-API-Kosten auf
dasselbe lokale Modell umstellen.

## What

- `runs-on` in `opencode.yml` auf ein Self-Hosted-Runner-Label umstellen; Runner läuft auf
  einem Fleet-Node (gekko-hetzner-2/3/4), da diese bereits `wg-gpu`-Peers sind (immer online,
  kein zusätzlicher Netzwerk-Hop) — Trade-off gegen den WSL-Host des Users bewusst akzeptiert
  (Details: Design-Spec).
- Trigger-Bedingung um eine **Same-Repo-Pflicht** ergänzen (PR muss aus diesem Repo stammen,
  keine Forks) zusätzlich zum bestehenden `author_association`-Gate — schließt die Lücke,
  dass ein vertrauenswürdiger Kollaborator versehentlich `/oc` auf einer Fork-PR kommentiert
  und damit fremden Code auf dem Fleet-Runner ausführt.
- `model:` auf den lokalen Provider (`llamacpp-mtp/gemma-4-12B-it-qat-UD-Q4_K_XL.gguf` aus
  `.opencode/opencode.jsonc`) umstellen; `OPENCODE_API_KEY`-Secret-Referenz aus dem Workflow
  entfernen.
- Runner-Registrierung selbst (GitHub-Token, `config.sh` auf dem Fleet-Node, systemd-Unit)
  ist manueller Infra-Schritt außerhalb dieses automatisierten Plans — wird im Plan als
  Runbook dokumentiert, nicht ausgeführt (kein Registrierungs-Token im Repo).

Design-Spec: `docs/superpowers/specs/2026-07-10-opencode-local-model-runner-design.md`

_Ticket: T001780_
