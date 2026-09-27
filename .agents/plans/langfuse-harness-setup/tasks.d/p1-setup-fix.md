# p1 — setup-harnesses.sh reparieren

Target files: `scripts/langfuse/setup-harnesses.sh`.

Kontext: `design.md` D1 und D2. RED-Tests: `tests/spec/langfuse-agent-tracing.bats`, Filter `T900690`.

### Task 1: codex-Hooks in bestehender `[features]`-Sektion (D1)

Im `codex)`-Zweig die Zeile `grep -q '^\[features\]' "$config" || printf ...` ersetzen:

- Sektion fehlt → wie bisher `\n[features]\nhooks = true\n` anhängen.
- Sektion vorhanden, darin `hooks = false` → per `awk` auf `hooks = true` setzen.
- Sektion vorhanden, keine `hooks`-Zeile → per `awk` `hooks = true` direkt nach der Header-Zeile
  einfügen. Sektionsgrenze ist die nächste Zeile, die mit `[` beginnt.
- Schreiben über `"$config.tmp"` + `mv`, wie im opencode-Zweig.

### Task 2: pi-Installation verifizieren (D2)

Im `pi)`-Zweig `>/dev/null` hinter `pi install` entfernen. Danach:

```bash
pi list 2>/dev/null | grep -q '@langfuse/pi-observability-plugin' \
  || { echo "pi: @langfuse/pi-observability-plugin missing after pi install" >&2; exit 1; }
```
