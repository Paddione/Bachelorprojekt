#!/usr/bin/env python3
"""scripts/finetune/collect_teacher_traces.py — Teacher-Traces zu Trainingskorpus rendern.

Zeichnet Episoden von einem Teacher-Modell auf (OpenAI-kompatible Chat-Completions-API)
und schreibt sie ins Korpusformat, das measure_corpus.py/train.py erwarten:
JSONL, eine Episode pro Zeile als {"messages": [...], "meta": {...}}.

Anders als collect_factory_traces.py (passiv: DB-Laeufe -> Korpus) ist dies der
aktive Pfad: Szenarien werden an einen konfigurierbaren Teacher geschickt und die
Antworten aufgezeichnet. Unterstuetzt einstufige Episoden sowie Tool-Loops mit
kannisierten Tool-Ergebnissen (Teacher schlaegt tool_call vor, Szenario liefert
das Script-Ergebnis, Episode laeuft weiter bis zur Finalantwort).

Aufbau eines Szenarios (--scenarios JSON-Liste):
    {
      "id": "weather-berlin",                  # Pflicht, fuer Dedupe/Meta
      "system": "...",                          # Pflicht
      "user": "...",                            # Pflicht
      "tools": [ <openai function schemas> ],   # optional; loest Tool-Loop aus
      "tool_results": {                         # optional; Kannit-Ergebnisse je Funktionsname
        "get_weather": "{\"temperature\": 14}"
      },
      "max_hops": 4                             # optional, Default 4 (Tool-Loop-Schutz)
    }

Filter und Schutz (gleiche Philosophie wie collect_factory_traces.py):
  - Secret-Redaction ueber identische Muster — jeder Teacher-Output wird vor dem
    Schreiben gescrubbt (Teacher koennen Prompt-Injection-Opfer gewesen sein).
  - Dedupe auf Nachrichten-Fingerprint; Duplikate werden uebersprungen.
  - Leere/refusalierte Antworten (leerer Content ohne tool_calls) werden verworfen.
  - Keine eingebauten Cloud-Credentials: --api-key-env nennt den Namen einer
    Umgebungsvariable; das Skript liest Keys nie aus Dateien.

Beispiele:
    # lokal gegen FreeToken (:1919, Windows-Host):
    python collect_teacher_traces.py \
        --scenarios data/scenarios.json --out data/teacher_traces.jsonl \
        --base-url http://localhost:1919/v1 --model gemma12

    # Cloud-Teacher via ENV-Key:
    TEACHER_KEY=sk-... python collect_teacher_traces.py ... \
        --base-url https://api.example.com/v1 --model teacher-x --api-key-env TEACHER_KEY
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

# Identische Muster wie collect_factory_traces.py — bewusst konservativ.
SECRET_PATTERNS = [
    re.compile(r"gh[pousr]_[A-Za-z0-9]{20,}"),
    re.compile(r"sk-[A-Za-z0-9]{20,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}"),
    re.compile(r"(?i)(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*\S+"),
    re.compile(r"[A-Za-z0-9+/]{40,}={0,2}"),
]

DEFAULT_MAX_HOPS = 4


def redact(text: str) -> str:
    out = text
    for pattern in SECRET_PATTERNS:
        out = pattern.sub("[REDACTED]", out)
    return out


def load_scenarios(path: str) -> list[dict]:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        raise SystemExit("FEHLER: --scenarios muss eine JSON-Liste sein.")
    seen_ids: set[str] = set()
    for i, s in enumerate(raw):
        for field in ("id", "system", "user"):
            if not s.get(field):
                raise SystemExit(f"FEHLER: Szenario[{i}] fehlt '{field}'.")
        if s["id"] in seen_ids:
            raise SystemExit(f"FEHLER: doppelte Szenario-ID '{s['id']}'.")
        seen_ids.add(s["id"])
    return raw


def chat(base_url: str, model: str, api_key: str | None, payload: dict,
         timeout: int, retries: int = 2) -> dict:
    """Ein Chat-Completions-Call mit einfachem Retry bei 429/5xx."""
    url = base_url.rstrip("/") + "/chat/completions"
    body = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    last_err: Exception | None = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, data=body, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            last_err = e
            if e.code in (429, 500, 502, 503, 504) and attempt < retries:
                time.sleep(2 ** attempt * 2)
                continue
            raise SystemExit(f"FEHLER: Teacher-API {e.code}: {e.reason}") from e
        except urllib.error.URLError as e:
            raise SystemExit(
                f"FEHLER: Teacher nicht erreichbar unter {url}: {e.reason}") from e
    raise SystemExit(f"FEHLER: Teacher-API nach Retries gescheitert: {last_err}")


def assistant_message(choice: dict) -> dict | None:
    """Normalisiert einen Choice zum messages-Eintrag; None bei leer/refusal."""
    msg = choice.get("message") or {}
    content = str(msg.get("content") or "")
    tool_calls = msg.get("tool_calls") or []
    if not content.strip() and not tool_calls:
        return None
    entry: dict = {"role": "assistant", "content": content}
    if tool_calls:
        entry["tool_calls"] = [
            {
                "type": "function",
                "function": {
                    "name": tc["function"]["name"],
                    "arguments": tc["function"].get("arguments"),
                },
            }
            for tc in tool_calls
            if isinstance(tc, dict) and isinstance(tc.get("function"), dict)
        ]
    return entry


def run_episode(scenario: dict, base_url: str, model: str, api_key: str | None,
                timeout: int) -> dict | None:
    """Fuehrt ein Szenario aus und rendert die Episode; None bei Verwerfen."""
    messages: list[dict] = [
        {"role": "system", "content": scenario["system"]},
        {"role": "user", "content": scenario["user"]},
    ]
    tools = scenario.get("tools") or []
    tool_results = scenario.get("tool_results") or {}
    max_hops = int(scenario.get("max_hops") or DEFAULT_MAX_HOPS)

    payload: dict = {"model": model, "messages": messages}
    if tools:
        payload["tools"] = tools

    hops = 0
    while True:
        resp = chat(base_url, model, api_key, payload, timeout)
        choices = resp.get("choices") or []
        if not choices:
            return None
        assistant = assistant_message(choices[0])
        if assistant is None:
            return None
        messages.append(assistant)

        calls = assistant.get("tool_calls") or []
        pending = [tc for tc in calls
                   if isinstance(tc.get("function"), dict)
                   and tc["function"]["name"] in tool_results]
        if not pending or hops >= max_hops:
            break

        # Kannit-Ergebnisse einspeisen und weiterdrehen (Tool-Loop).
        for tc in pending:
            name = tc["function"]["name"]
            result = tool_results[name]
            messages.append({
                "role": "tool",
                "content": result if isinstance(result, str) else json.dumps(result),
            })
        hops += 1

    # Meta: Modell, Szenario, Zeitstempel — Redaction greift erst beim Schreiben.
    return {
        "messages": messages,
        "meta": {
            "scenario_id": scenario["id"],
            "teacher": model,
            "hops": hops,
            "collected_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        },
    }


def fingerprint(episode: dict) -> str:
    canonical = json.dumps(episode["messages"], sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        description=(__doc__ or "Teacher-Traces zu Trainingskorpus rendern").splitlines()[0])
    parser.add_argument("--scenarios", required=True,
                        help="JSON-Datei mit Szenarienliste (siehe Docstring)")
    parser.add_argument("--out", required=True, help="Zielpfad der JSONL-Korpusdatei")
    parser.add_argument("--base-url", default="http://localhost:1919/v1",
                        help="OpenAI-kompatible Basis-URL (Default: FreeToken lokal)")
    parser.add_argument("--model", required=True, help="Teacher-Modellname")
    parser.add_argument("--api-key-env", default=None,
                        help="Name der ENV-Variable mit dem Bearer-Key (optional)")
    parser.add_argument("--timeout", type=int, default=120,
                        help="Request-Timeout in Sekunden (Default 120)")
    args = parser.parse_args(argv)

    api_key = None
    if args.api_key_env:
        import os
        api_key = os.environ.get(args.api_key_env)
        if not api_key:
            raise SystemExit(
                f"FEHLER: ENV '{args.api_key_env}' ist nicht gesetzt.")

    scenarios = load_scenarios(args.scenarios)
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    kept = skipped_dup = skipped_empty = 0
    seen: set[str] = set()
    with out_path.open("w", encoding="utf-8") as fh:
        for scenario in scenarios:
            try:
                episode = run_episode(scenario, args.base_url, args.model,
                                      api_key, args.timeout)
            except SystemExit:
                raise
            if episode is None:
                skipped_empty += 1
                print(f"  verworfen (leer/refusal): {scenario['id']}")
                continue
            fp = fingerprint(episode)
            if fp in seen:
                skipped_dup += 1
                print(f"  verworfen (Duplikat): {scenario['id']}")
                continue
            seen.add(fp)
            # Redaction erst hier — auf dem fertigen Serialisat, inkl. Meta.
            line = json.dumps(episode, ensure_ascii=False)
            line = redact(line)
            fh.write(line + "\n")
            kept += 1
            print(f"  aufgezeichnet: {scenario['id']} ({len(episode['messages'])} Turns)")

    print(f"Korpus geschrieben: {out_path} ({kept} Episoden, "
          f"{skipped_dup} Duplikate, {skipped_empty} leer verworfen).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
