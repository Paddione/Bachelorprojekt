---
title: "p2 — Trace-Recorder als Proxy je Rolle"
ticket_id: T900561
domains: [llm-local-dev]
status: active
---

# p2 — Trace-Recorder als Proxy je Rolle

Files: `scripts/llm/agent-bench/lib/recorder.mjs` (neu; disjunkt zu p1, p3–p9).

## Task 2.1: Proxy starten und stoppen

`startRecorder({ upstream, role, traceFile, imageDir, port = 0 })` startet einen `node:http`-Server
auf `127.0.0.1` (Port 0 = frei wählen) und liefert `{ url, port, close() }`.

- Jede Anfrage wird unverändert an `upstream` weitergereicht (Methode, Pfad, Header ohne `host`,
  Body). Streaming-Antworten (`text/event-stream`) werden durchgereicht und für den Trace zu einer
  Gesamtantwort zusammengesetzt (`content`, `reasoning_content`, `tool_calls`, `usage`).
- Nach jeder abgeschlossenen `/v1/chat/completions`-Anfrage wird eine JSON-Zeile an `traceFile`
  angehängt: `{ ts, role, request: { messages, tools, model, params }, response: { message, finish_reason, usage }, ms }`.
- Andere Pfade (`/v1/models`, `/health`) werden durchgereicht, aber nicht protokolliert.

## Task 2.2: Bilder als Dateien

Content-Parts `{ type: 'image_url', image_url: { url: 'data:<mime>;base64,<b64>' } }` im Request
werden vor dem Schreiben ersetzt durch `{ type: 'image_ref', sha256, mime }`; die Bytes landen unter
`imageDir/<sha256>.<ext>` (nur schreiben, wenn nicht vorhanden). Der Trace enthält kein Base64.

## Task 2.3: Secret-Schwärzung

`redact(text)` portiert `SECRET_PATTERNS` aus `scripts/finetune/collect_factory_traces.py`
(Zeilen 50–66) nach JavaScript und ersetzt Treffer durch `[REDACTED:<muster-name>]`. Angewendet auf
alle String-Felder des Trace-Eintrags (rekursiv), bevor geschrieben wird. Jeder Eintrag bekommt
`redactions: <anzahl>`.

## Task 2.4: Rollen-Zuordnung

Ein Recorder gehört genau einer Rolle; der Harness (p4) startet je Rolle und Lauf einen eigenen
Recorder und übergibt dem Rollen-Client dessen `url`. Dadurch sind `opencode`-Worker ohne eigene
Kennung eindeutig zugeordnet.

Akzeptanz: `node --check`; p9-Tests "Secret is redacted in the trace", "Image is stored by content
hash" und "Recorder attributes requests to its role" laufen gegen einen Fake-Upstream.
