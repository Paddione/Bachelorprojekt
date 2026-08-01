#!/usr/bin/env python3
"""Baut den Request-Payload fuer health-goals-llm-fill.sh [T002501].

Usage: python3 health-goals-payload.py <model> <gid>   # Kontext auf stdin

Eigene Datei statt inline `python3 -c`: der Payload lag mitten in der
Kandidaten-Schleife und war ohne goals.md, ohne Kontext und ohne laufenden
Server nicht erreichbar — also auch nicht offline testbar. Nebeneffekt:
Modell und Goal-ID kommen jetzt ueber argv statt per Shell-Interpolation in
den Python-Quelltext; ein Anfuehrungszeichen in einer Goal-ID kann den Code
nicht mehr zerlegen.
"""
import json
import sys


def build_payload(model: str, gid: str, context: str) -> dict:
    prompt = (
        f'Du bekommst ein Health-Goal aus .claude/lib/goals.md. Liefere eine '
        f'strukturierte Bewertung als JSON. Goal-ID: {gid}. Kontext: {context}. '
        f'Antworte NUR als JSON: {{"id":"{gid}","value":"<aktueller Wert>",'
        f'"unit":"<Einheit>","confidence":0.0,"evidence":"<Begründung>",'
        f'"reproducible_cmd_suggestion":"<reproduzierbarer Messbefehl>"}}'
    )
    return {
        'model': model,
        'messages': [{'role': 'user', 'content': prompt}],
        'response_format': {'type': 'json_object'},
        'max_tokens': 300,
        # Ohne dies bleibt content LEER, bis das Denken fertig ist. Gemessen am
        # laufenden Server: bei max_tokens 300 gehen ~1070 Zeichen ins
        # reasoning_content, content bleibt '', finish_reason ist 'length'.
        # Das Skript parst das leere content dann als JSON, faengt die Exception
        # und protokolliert JEDES Goal als "unfillable (Parse-Fehler)" — eine
        # 100-Prozent-Fehlerquote, die wie eine ehrliche Messung aussieht.
        'chat_template_kwargs': {'enable_thinking': False},
    }


def main() -> int:
    if len(sys.argv) != 3:
        print('usage: health-goals-payload.py <model> <gid>', file=sys.stderr)
        return 2
    context = sys.stdin.read().strip()
    print(json.dumps(build_payload(sys.argv[1], sys.argv[2], context)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
