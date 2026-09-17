# Proposal: embed-hook-live-backend

## Why

**Symptom (Fakt):** Jeder Commit, der `openspec/changes/*/tasks.md` berührt, blockiert im
post-commit-Hook `[openspec-embed]`: `scripts/openspec-embed-local.sh` probt
`http://127.0.0.1:18235/v1/embeddings`, scheitert mit curl 7, und der Hook wiederholt den
Wrapper dreimal (bis zu 30s Budget plus 5s Pause je Versuch).

**Ursache (belegt 2026-09-17):**

```bash
ss -ltnp | grep -E ':(8081|18235)\b'              # 18235: kein Lauscher
systemctl --user status devmesh-forward.service   # Unit nicht installiert
kubectl --context devmesh -n workspace port-forward svc/llm-services 28235:18235 &
curl -s -XPOST -H 'content-type: application/json' -d '{"model":"bge-m3","input":["ping"]}' \
  http://127.0.0.1:28235/v1/embeddings            # {"error":{"code":"unauthorized"}}
```

1. Die lokale Unit `llm-proxy.service` ist stillgelegt (ADR-007). Seit T900191 läuft der Proxy
   im devmesh-Pod `llm-services`, lokal gehalten durch `devmesh-forward.service`. Die Unit ist
   auf diesem Host nicht installiert, :18235 hat keinen Lauscher.
2. Der devmesh-Proxy lauscht auf `0.0.0.0` und sperrt deshalb jede Anfrage ohne
   `LLM_PROXY_ADMIN_TOKEN` (`scripts/llm-proxy/listeners.mjs`). Weder Probe noch
   `openspec-embed.mjs` senden einen Bearer.
3. Der Hook behandelt jeden Fehlschlag als transient. Ein fehlender Lauscher ist das nicht.

**Verworfen:** den Default auf `127.0.0.1:8081` umbiegen. Dort lauscht auf diesem Host zwar
`bge-forward-embed.service` (fleet `svc/llm-gateway-embed`), aber T900191/D7 hat diese Unit
aus dem Repo gelöscht, und `tests/spec/local-llm-proxy/gateway-consumer-lint.bats` verbietet
das Backend-Port-Literal im Wrapper absichtlich. Wer den Forward behält, setzt
`LLM_EMBED_URL`.

## What

- Probe mit `--connect-timeout` (Default 3s) getrennt vom 20s-Budget (T002659 bleibt gültig).
- Bearer aus `LLM_PROXY_ADMIN_TOKEN` in Probe und `defaultEmbed()`.
- Exit 3 für dauerhafte Probe-Fehlschläge (curl 6/7, HTTP 401/403/404), Diagnose nennt bei
  401/403 den Token; Remediation nennt `devmesh-forward.service`, Token und `LLM_EMBED_URL`.
- `.githooks/post-commit-embed` wiederholt nach Exit 3 nicht mehr.
- Default-URL (:18235) und Gateway-Lint bleiben unverändert.

_Ticket: T900209_
