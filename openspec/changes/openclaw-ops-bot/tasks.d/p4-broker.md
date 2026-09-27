---
title: "p4 — Broker: openclaw-ask.sh und Registry-Eintrag"
ticket_id: T900538
domains: [agent-tooling, llm-local-dev]
status: active
---

# p4 — Broker

Files: `scripts/openclaw-ask.sh` (neu, ausführbar), `docs/agent-guide/registry/capabilities.yaml`
(ein Eintrag ergänzt). Disjunkt zu p1–p3, p5. Keine anderen Dateien ändern.

Vertrag: `openspec/changes/openclaw-ops-bot/design.md`, Komponente 4. Die p5-Tests prüfen genau
diese Exit-Codes: 2 = kein Token, 3 = Gateway nicht erreichbar, 4 = HTTP-Fehler oder Antwort ohne
`.choices[0].message.content`. Exit 1 ist ein Usage-Fehler (falsche Argumente).

S1: `scripts/openclaw-ask.sh` ist neu (112 Zeilen, `.sh`-Limit 800). `capabilities.yaml` hat
kein S1-Limit. S4: Das Skript wird aus `capabilities.yaml` (Task 4.3) und aus
`docs/runbooks/openclaw-ops-bot.md` (p3) referenziert.

Alle Befehle laufen im Repo-Root. Sie brauchen kein Netzwerk und kein laufendes Gateway.

## Task 4.1: Skript `scripts/openclaw-ask.sh` anlegen

Lege die Datei `scripts/openclaw-ask.sh` mit exakt diesem Inhalt an. Nichts umformulieren, nichts
ergänzen. Danach das Ausführungsrecht setzen.

```bash
#!/usr/bin/env bash
# scripts/openclaw-ask.sh — synchroner Broker-Aufruf an einen OpenClaw-Agenten. [T900538]
#
# Schickt eine Aufgabe per POST /v1/chat/completions an das lokale OpenClaw-Gateway
# (Agent-Default: task-runner) und gibt die Antwort des Agenten auf stdout aus.
# Vertrag: openspec/changes/openclaw-ops-bot/design.md, Komponente 4.
#
# Verwendung:
#   openclaw-ask.sh [--agent <id>] [--timeout <sekunden>] "<aufgabe>"
#
# Umgebung:
#   OPENCLAW_GATEWAY_TOKEN  Bearer-Token. Fehlt es, liest das Skript nur diese eine
#                           Variable aus ~/.openclaw/.env (kein source der Datei).
#   OPENCLAW_GATEWAY_URL    Basis-URL des Gateways (Default http://127.0.0.1:18789).
#
# Exit: 0 = Antwort auf stdout · 1 = Usage-Fehler · 2 = kein Token
#       · 3 = Gateway nicht erreichbar (curl 7/28) · 4 = HTTP-Fehler oder Antwort ohne Inhalt.
set -euo pipefail

DEFAULT_URL="http://127.0.0.1:18789"

usage() {
  echo "Usage: ${0##*/} [--agent <id>] [--timeout <sekunden>] \"<aufgabe>\"" >&2
  exit 1
}

# Liest OPENCLAW_GATEWAY_TOKEN aus der Umgebung, sonst die letzte passende Zeile aus
# ~/.openclaw/.env. Gibt einen leeren String aus, wenn nichts gefunden wird.
read_token() {
  if [ -n "${OPENCLAW_GATEWAY_TOKEN:-}" ]; then
    printf '%s' "$OPENCLAW_GATEWAY_TOKEN"
    return 0
  fi
  local env_file="${HOME}/.openclaw/.env" line
  [ -r "$env_file" ] || return 0
  line="$(grep -E '^[[:space:]]*(export[[:space:]]+)?OPENCLAW_GATEWAY_TOKEN=' "$env_file" | tail -n 1 || true)"
  line="${line#*=}"
  line="${line%$'\r'}"
  line="${line#\"}"
  line="${line%\"}"
  line="${line#\'}"
  line="${line%\'}"
  printf '%s' "$line"
}

agent="task-runner"
timeout_s=300
while [ $# -gt 0 ]; do
  case "$1" in
    --agent)   [ $# -ge 2 ] || usage; agent="$2"; shift 2 ;;
    --timeout) [ $# -ge 2 ] || usage; timeout_s="$2"; shift 2 ;;
    --)        shift; break ;;
    -*)        usage ;;
    *)         break ;;
  esac
done
[ $# -eq 1 ] || usage
task="$1"
[ -n "$task" ] || usage
[ -n "$agent" ] || usage
[[ "$timeout_s" =~ ^[1-9][0-9]*$ ]] || usage

token="$(read_token)"
if [ -z "$token" ]; then
  echo "FEHLER: OPENCLAW_GATEWAY_TOKEN fehlt (weder in der Umgebung noch in ~/.openclaw/.env) — Abhilfe: task openclaw:configure." >&2
  exit 2
fi

base_url="${OPENCLAW_GATEWAY_URL:-$DEFAULT_URL}"
base_url="${base_url%/}"
endpoint="${base_url}/v1/chat/completions"

body="$(jq -n \
  --arg model "openclaw/${agent}" \
  --arg user "conv:openclaw-ask-$$" \
  --arg task "$task" \
  '{model: $model, user: $user, messages: [{role: "user", content: $task}]}')"

resp_file="$(mktemp)"
trap 'rm -f "$resp_file"' EXIT

# Der Token geht per stdin an curl (-H @-), damit er nicht in der Prozessliste steht.
curl_rc=0
http_code="$(printf 'Authorization: Bearer %s\n' "$token" \
  | curl -s --max-time "$timeout_s" \
      -o "$resp_file" -w '%{http_code}' \
      -H @- -H 'Content-Type: application/json' \
      --data-binary "$body" "$endpoint")" || curl_rc=$?

if [ "$curl_rc" -eq 7 ] || [ "$curl_rc" -eq 28 ]; then
  echo "FEHLER: OpenClaw-Gateway unter ${base_url} nicht erreichbar (curl-Exit ${curl_rc}) — Abhilfe: task openclaw:status." >&2
  exit 3
fi
if [ "$curl_rc" -ne 0 ]; then
  echo "FEHLER: Anfrage an ${endpoint} fehlgeschlagen (curl-Exit ${curl_rc})." >&2
  exit 4
fi

if [ "$http_code" != "200" ]; then
  err_text="$(jq -r '.error.message // .error // empty' "$resp_file" 2>/dev/null || true)"
  [ -n "$err_text" ] || err_text="$(head -c 500 "$resp_file")"
  echo "FEHLER: HTTP ${http_code} von ${endpoint}: ${err_text}" >&2
  exit 4
fi

content="$(jq -r '.choices[0].message.content // empty' "$resp_file" 2>/dev/null || true)"
if [ -z "$content" ]; then
  echo "FEHLER: Antwort von ${endpoint} ohne .choices[0].message.content: $(head -c 500 "$resp_file")" >&2
  exit 4
fi

printf '%s\n' "$content"
```

Danach:

```bash
chmod +x scripts/openclaw-ask.sh
```

Hinweise zum Verständnis (nicht ändern):

- Der Token wird nie per `source` geladen. `read_token` liest nur die Zeile
  `OPENCLAW_GATEWAY_TOKEN=` aus `~/.openclaw/.env` und entfernt umschließende Anführungszeichen.
- Der Token geht per stdin an curl (`-H @-`), damit er nicht in der Prozessliste steht.
- `-w '%{http_code}'` schreibt den Status nach stdout, der Body landet über `-o` in einer
  Temp-Datei. Beides bleibt getrennt.
- curl-Exit 7 (Verbindung abgelehnt) und 28 (Timeout) ergeben Exit 3 mit der URL in der Meldung.

Prüfung (muss ohne Ausgabe von shellcheck durchlaufen und `OK` drucken):

```bash
bash -n scripts/openclaw-ask.sh && shellcheck scripts/openclaw-ask.sh && test -x scripts/openclaw-ask.sh && echo OK
```

## Task 4.2: Exit-Codes offline prüfen

Nichts ändern, nur prüfen. Jeder Aufruf nutzt ein leeres Temp-`HOME`, damit eine echte
`~/.openclaw/.env` das Ergebnis nicht verfälscht. Port 1 hat lokal keinen Lauscher.

```bash
H="$(mktemp -d)"
rc=0; env -u OPENCLAW_GATEWAY_TOKEN HOME="$H" scripts/openclaw-ask.sh "status" || rc=$?
echo "ohne Token: rc=$rc (erwartet 2)"; [ "$rc" -eq 2 ]

mkdir -p "$H/.openclaw"; printf 'OPENCLAW_GATEWAY_TOKEN="abc"\n' > "$H/.openclaw/.env"
rc=0; out="$(env -u OPENCLAW_GATEWAY_TOKEN HOME="$H" OPENCLAW_GATEWAY_URL=http://127.0.0.1:1 scripts/openclaw-ask.sh "status" 2>&1)" || rc=$?
echo "Token aus .env, kein Lauscher: rc=$rc (erwartet 3)"; [ "$rc" -eq 3 ]
printf '%s\n' "$out" | grep -qF 'http://127.0.0.1:1'

rc=0; OPENCLAW_GATEWAY_TOKEN=abc scripts/openclaw-ask.sh || rc=$?
echo "ohne Aufgabe: rc=$rc (erwartet 1)"; [ "$rc" -eq 1 ]
rm -rf "$H"
```

Der zweite Block belegt zugleich, dass der Token aus `~/.openclaw/.env` gelesen wird: ohne ihn
käme Exit 2 statt 3. Erfolg (Exit 0) und falscher Token (Exit 4) prüft p5 gegen den Fake-Gateway.

## Task 4.3: Capability `ops-broker` in `capabilities.yaml` eintragen

Füge in `docs/agent-guide/registry/capabilities.yaml` im Block
`# ─── Betrieb & Infrastruktur ───` direkt nach dieser Zeile (sie kommt genau einmal vor) ein:

```yaml
      deep_ref: ".claude/skills/operations-management/SKILL.md"
```

Einzufügen ist eine Leerzeile, dann exakt dieser Block (zwei Leerzeichen Einzug vor
`ops-broker`, vier vor `cli:openclaw-ask`, sechs vor den Feldern). Die bestehende Leerzeile vor
`  gitops-wissen:` bleibt stehen.

```yaml

  ops-broker:
    cli:openclaw-ask:
      state: canonical
      use_when: "Vage Ops-Aufgabe synchron an OpenClaw task-runner geben: bash scripts/openclaw-ask.sh '<aufgabe>'."
      avoid_when: "mutierende Aktionen — OpenClaw empfiehlt nur"
      roles: [orchestrator]
      tier: safe
      deep_ref: "docs/runbooks/openclaw-ops-bot.md"
```

Danach sieht die Stelle so aus:

```yaml
      deep_ref: ".claude/skills/operations-management/SKILL.md"

  ops-broker:
    cli:openclaw-ask:
      ...
      deep_ref: "docs/runbooks/openclaw-ops-bot.md"

  gitops-wissen:
```

Prüfung (letzte Zeile muss `Toolset registry check passed.` sein, Exit 0; die Liste der
`unreviewed`-Skills davor ist Bestand und kein Fehler):

```bash
yq '.capabilities["ops-broker"]["cli:openclaw-ask"].state' docs/agent-guide/registry/capabilities.yaml
node scripts/toolset/check.mjs
```

Der `yq`-Befehl muss `canonical` ausgeben.
