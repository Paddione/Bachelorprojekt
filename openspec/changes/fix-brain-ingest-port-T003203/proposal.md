# Proposal: fix-brain-ingest-port-T003203

## Why

`scripts/brain-ingest.sh` schickt seine Chat-Completions per Default an `localhost:8093`. Dort
lauscht seit T002551 der kubectl-Port-Forward auf `svc/llm-gateway-rerank`. Reproduziert am
2026-08-10:

```
POST http://127.0.0.1:8093/v1/chat/completions
→ 500  "the current context does not logits computation. skipping"
```

Das ist kein blockierter Start, sondern ein aktiver Fehlerpfad: Wer das Skript ohne gesetztes
`LM_STUDIO_URL` aufruft, spricht mit einem Reranker, der keine Logits berechnet.

Port 8093 trägt zwei Bedeutungen, beide für sich begründet, keine kannte die andere. Historisch
war er der „Bonsai"-llama-server auf dem Windows-GPU-Host — Reste davon sind das Loadout
`brain-ingest`, das Backend `llamacpp-bonsai` und der Default in `brain-ingest.sh:43`. Seit
T002551 belegt ihn der Rerank-Forward, dessen Unit die Wahl ausdrücklich begründet: „Lokal 8093
und NICHT 8082: 8082 ist auf dem Windows-Host von einem svchost belegt."

**Die Fehlerklasse wiederholt sich.** `scripts/factory/provider-register-local.sh:7-8` hält
fest, dass schon einmal ein Factory-Provider fälschlich auf 8093 zeigte — „Port 8093 serviert
seit T002551 den bge-Reranker". `brain-ingest` ist der zweite Fall; ein dritter ist unten
notiert. Die Ursache ist nicht Unsorgfalt, sondern das Fehlen einer gemeinsamen Sicht auf die
lokale Portbelegung.

## What

- Das Loadout `brain-ingest` zieht von Port 8093 auf **8100**. Der Rerank-Forward bleibt, wo er
  ist: er läuft produktiv und hängt an `bge-mcp` (`LLM_RERANKER_URL`).
- Der Default in `scripts/brain-ingest.sh:43` zieht mit. Damit rücken die beiden Ingest-Skripte
  wieder zusammen — `brain-ingest-transform.sh` hat seinen Default aus demselben Grund bereits
  entfernt (T002533).
- Eine Migration zieht `llamacpp-bonsai.base_url` nach; `enabled` bleibt **`false`**.
- Ein BATS-Guard sichert zwei Invarianten: kein Loadout-Port ist zugleich lokale Seite eines
  Port-Forwards, und `brain-ingest` nennt in allen drei Deklarationen denselben Port.

**8100 und nicht 8097:** Auf 8097 registriert `scripts/factory/provider-register-gptoss.sh:31`
einen Provider. Der Block 8089–8099 ist bis auf 8097 vollständig durch Loadouts belegt.

**`enabled` bleibt `false`:** Der llm-proxy meldet bereits dauerhaft `ready: false`, weil sechs
`priority=1`-Backends derselben `exclusiveGroup` nie gleichzeitig healthy sein können. Dieser
Widerspruch ist als **T003202** erfasst; ein weiteres dauer-degradiertes Backend würde das
Signal nur zusätzlich verwässern. `brain-ingest.sh` spricht den Port ohnehin direkt an.

### Warum der Guard keine Laufzeitprüfung ist

Naheliegend wäre, die echte Portbelegung per `ss` zu lesen. In CI läuft aber kein
kubectl-Forward; der Test würde dort skippen und damit die Ausstattung des Runners messen statt
den Zustand des Codes (T002716). Geprüft werden deshalb ausschließlich Repo-Artefakte:
`loadouts.json` per `jq`, die `^ExecStart`-Zeilen der Unit-Dateien, der Skript-Default und die
Migrationszeile. Der `^ExecStart`-Anker schließt zugleich die Historien-Kommentare aus, die
denselben Port nennen.

Ausdrücklich **kein** Guard der Form „jeder Port genau einmal": Loadouts derselben
`exclusiveGroup` dürfen sich einen Port teilen, weil sie nie gleichzeitig laufen — die
Begründung steht in `tests/spec/local-llm-proxy/qwen3-coder-loadout.bats`. Geprüft wird nur
Loadout **gegen** Port-Forward; diese beiden können nie koexistieren.

Eine separate Port-Registry wurde verworfen: `openspec/specs/divergence-guard.md:136` hält
fest, dass die Begründung neben dem Eintrag stehen soll „rather than in a separate allowlist
that drifts from it".

### Was nicht Teil dieses Change ist

- **T003202** — der Readiness-Widerspruch des llm-proxy.
- **T003204** — Messreihe qwen3-coder gegen gptoss-context, Abschaltung von
  `devstral-quality`, A/B der Ingest-Modellwahl. Die Modellwahl des Loadouts (`gpt-oss-20b`,
  `parallel: 4`, `reasoning: "auto"`) bleibt hier unberührt; dieser Change verschiebt nur den
  Port.
- **bge in den llm-proxy holen** (Vorgang 3) — noch kein Ticket.
- `scripts/llm-host-setup.sh` nennt 8093 viermal, meint aber
  `${LLM_HOST_IP:-192.168.100.10}:8093`, den Windows-Host über `wg-mesh`. Kein lokaler
  Anspruch, keine Kollision, keine Änderung.

### Bekannte Auslassung

`scripts/factory/provider-register-gptoss.sh:31` registriert einen Provider auf `:8097`,
während `gptoss-context` auf `:8098` läuft — der dritte Fall derselben Fehlerklasse. Der Guard
dieses Change erfasst ihn nicht, weil er Loadouts gegen Port-Forwards prüft und nicht
Factory-Provider gegen Loadouts. Eine Erweiterung wäre möglich und gehört in einen eigenen
Vorgang.

_Ticket: T003203_
