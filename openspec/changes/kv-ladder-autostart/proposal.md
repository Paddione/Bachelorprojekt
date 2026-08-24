# Proposal: kv-ladder-autostart

## Why

Seit #5170 liegt der KV-Ladder (`freetoken-kv-ladder.sh`) im Repo, aber nach jedem
FreeToken-Restart musste der Operator ihn von Hand starten — sonst advertisierten Sessions mehr
Kontext, als der Server KV-Seiten bereitstellte, und Anfragen überflowten ab ~131k
(`Input sequence length exceeds`). Der Patch schließt die Lücke automatisiert: Restart startet
den Ladder selbst, das Plugin advertise die 200000er-Decke nur unter Guard-Bedingungen. Er
existierte als ungeticketer Hauptcheckout-Patch (Session-Ende-Sicherung) und wird mit diesem
Change auf einen eigenen Branch gezogen.

_Ticket: T016416_

## What

- **`restart-freetoken.ps1`:** nach Server-Bereitschaft Start des Kadders als detached
  WSL-Hintergrundprozess (`nohup … >> /tmp/opencode/kv-ladder.log`); beim Stoppen wird ein
  alter Zombie-Poller mitgekillt; neuer Switch `-NoLadder`.
- **`.opencode/agent-models.jsonc`:** `limit.context` für `Qwen3.6-35B-A3B-NVFP4`
  131072 → **200000** (= `LADDER_CEILING`).
- **`.opencode/plugin/freetoken-active.ts`:** advertise bis `SDLC_CONTEXT_CEILING`
  (Default 200000) statt des kalibrierten Werts — nur bei laufender Engine UND kalibriert
  ≥ 100000 (trifft nur Qwen3.6-35B-offload; gpt-oss/Gemma behalten ihr sicheres Limit);
  Daemon nicht erreichbar ⇒ Kalibrierung bleibt.

## Impact

Kein Verhalten im Cluster, keine Deploy-Pfade. Risiko ohne den Operator-Anteil: advertise 200k,
während der Server bei 131072 steht (z. B. nach manuellem `-NoLadder`) — Overflow-Fehler ab
~131k; der Plugin-Guard mildert, hebelt aber nicht aus. Der Vertrag
„`limit.context` == `LADDER_CEILING`, KV-Mitwachsen operator-seitig via `ft ctl cache --kv`"
ist im Delta-Spec festgeschrieben.
