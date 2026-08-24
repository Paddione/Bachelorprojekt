# P6 — ADR-007 Supersession + eol-Guard

```yaml
title: "P6 docs-adr-supersession"
ticket_id: T016422
domains: [docs,infra]
status: active
target_files:
  - docs/adr/ADR-007-wsl-exit-fleet-native.md
  - .gitattributes
```

Ziel: Die Architektur-Entscheidung dokumentieren und den CRLF-Fußschuss für die
Windows-Ära entschärfen.

## Tasks

- [ ] **T6.1** `docs/adr/ADR-007-wsl-exit-fleet-native.md` schreiben mit:
  - Status: Supersedes ADR-006 (Verweis + ein Absatz „was von ADR-006 bleibt":
    Unsloth-in-WSL-Begründung entfällt; ComfyUI/Whisper-GPU-Pfade bleiben Windows-nativ).
  - Kontext: Messwerte aus Explore (MemFree 122 MB bei 10-GB-Limit,
    FreeToken ~20 GB Experten-RAM, Worker-RAM 85 %/112 %).
  - Entscheidung: A+C — Fleet-native Factory (single-replica Runner, D1–D3),
    Windows-native Dev; verwerfungen B/Thin-Client/llm-proxy-Migration mit Gründen.
  - Konsequenzen: P0-Spikes als Gate; E17-Write-Authority-Diskussion
    (Credentials bündeln sich jetzt im Runner) mit Gegenmaßnahme SealedSecrets +
    enge RBAC-Role; FreeToken = best-effort für Night-Ticks.
  - Operator-Anhang (Runbook): gekko-hetzner-2 Rejoin oder saubere Dekommissionierung
    inkl. Longhorn-Replikat-Rebuild für die degradierte Prometheus-PVC;
    WSL-Docker-Cleanup (`docker rm -f gitlab-registry-cache`); kubeseal-Prozess für
    T2.7; k3d-Teardown-Reihenfolge; `wsl --shutdown` als letzter Schritt.

- [ ] **T6.2** In ADR-006 Kopf ergänzen: `> **SUPERSEDED by ADR-007 (2026-08-24)**`
  — eine Zeile, kein Umbau der Datei.

- [ ] **T6.3** `.gitattributes` anhängen (73 Zeilen Ist · nicht gebaselined → Budget ok):

      ```
      # T016422: Windows-native Dev — Shell-Skripte strikt LF
      *.sh   text eol=lf
      *.bats text eol=lf
      ```

      Kein globales `* text=auto` (Renormalisierungswelle vermeiden).

## Verify

```bash
grep -c 'eol=lf' .gitattributes                          # expect >= 2
grep -l 'SUPERSEDED' docs/adr/ADR-006-sdlc-isolation-dev-host.md
```
