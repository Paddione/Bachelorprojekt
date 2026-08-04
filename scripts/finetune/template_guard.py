#!/usr/bin/env python3
"""scripts/finetune/template_guard.py — Byte-Gleichheits-Verifikation des Chat-Templates.

Rendert Hub-Template und gepatchtes Template ueber den vollstaendigen Korpus. Eine
Abweichung an einer einzigen Zeile bedeutet Exit ungleich null, mit Ausgabe der ersten
abweichenden Zeichenposition und beider Kontexte.

Zwei Fallen aus dem Vorversuch, die dieser Guard absichert:

  1. Der Assistant-Header gehoert AUSSERHALB des Generation-Blocks. Beim Inference erzeugt
     ihn `add_generation_prompt`; das Modell generiert erst danach. Wird er eingeschlossen,
     verschiebt sich die Maske um die Laenge des Headers.
  2. Der Generation-Marker braucht Whitespace-Kontrolle des umgebenden Templates
     (`{%- generation %}`, NICHT `{% generation %}`). Ohne sie entsteht ein zusaetzlicher
     Zeilenumbruch — eine einzelne Byte-Abweichung, die Trainings- und Serving-Format
     auseinanderlaufen laesst.

Referenz ist immer das HUB-Template (vom Hugging Face Hub geladen), NICHT das vom
Trainings-Framework in ein Adapterverzeichnis geschriebene Template — im Vorversuch
unterschieden sich beide um mehr als tausend Zeichen. `--hub-template` nimmt eine lokale
Datei entgegen (kein Netzwerkzugriff durch dieses Skript); die Aufruferseite ist dafuer
verantwortlich, dort tatsaechlich den Hub-Stand abzulegen (siehe README).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import jinja2

CONTEXT_CHARS = 40


def _load_corpus(path: Path) -> list[dict]:
    rows = []
    with path.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
    return rows


def _render_all(template_text: str, rows: list[dict]) -> list[str]:
    env = jinja2.Environment(trim_blocks=True, lstrip_blocks=False)
    template = env.from_string(template_text)
    rendered = []
    for row in rows:
        for add_gen in (False, True):
            rendered.append(
                template.render(messages=row["messages"], add_generation_prompt=add_gen)
            )
    return rendered


def _first_diff(a: str, b: str) -> int | None:
    for i, (ca, cb) in enumerate(zip(a, b)):
        if ca != cb:
            return i
    if len(a) != len(b):
        return min(len(a), len(b))
    return None


def _lint_generation_marker(template_text: str) -> list[str]:
    """Statische Zusatzpruefung fuer Falle 2: `{% generation %}` ohne Whitespace-Kontrolle."""
    warnings = []
    if "{% generation %}" in template_text and "{%- generation %}" not in template_text:
        warnings.append(
            "WARNUNG: '{% generation %}' ohne Whitespace-Kontrolle gefunden — "
            "erwartet wird '{%- generation %}' (Falle 2, siehe Docstring)."
        )
    return warnings


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--hub-template", required=True, help="Lokale Datei mit dem HUB-Template (Referenz)")
    parser.add_argument("--patched-template", required=True, help="Lokale Datei mit dem zu pruefenden Template")
    parser.add_argument("--corpus", required=True, help="JSONL-Korpus, gegen den beide Templates gerendert werden")
    args = parser.parse_args(argv)

    hub_path = Path(args.hub_template)
    patched_path = Path(args.patched_template)
    corpus_path = Path(args.corpus)

    for p, label in ((hub_path, "--hub-template"), (patched_path, "--patched-template"), (corpus_path, "--corpus")):
        if not p.is_file():
            print(f"FEHLER: {label} nicht gefunden: {p}", file=sys.stderr)
            return 2

    if "adapter" in str(patched_path.parent).lower():
        print(
            "WARNUNG: --patched-template liegt in einem 'adapter'-Verzeichnis — pruefe, ob "
            "--hub-template wirklich vom Hub stammt und nicht versehentlich vertauscht wurde.",
            file=sys.stderr,
        )

    hub_text = hub_path.read_text(encoding="utf-8")
    patched_text = patched_path.read_text(encoding="utf-8")

    for w in _lint_generation_marker(patched_text):
        print(w, file=sys.stderr)

    rows = _load_corpus(corpus_path)
    if not rows:
        print("FEHLER: Korpus ist leer.", file=sys.stderr)
        return 2

    hub_rendered = _render_all(hub_text, rows)
    patched_rendered = _render_all(patched_text, rows)

    for idx, (a, b) in enumerate(zip(hub_rendered, patched_rendered)):
        diff_pos = _first_diff(a, b)
        if diff_pos is not None:
            start = max(0, diff_pos - CONTEXT_CHARS)
            print(f"FEHLER: Abweichung bei Zeile {idx}, Position {diff_pos}.", file=sys.stderr)
            print(f"  Hub-Kontext:     ...{a[start:diff_pos + CONTEXT_CHARS]!r}...", file=sys.stderr)
            print(f"  Patched-Kontext: ...{b[start:diff_pos + CONTEXT_CHARS]!r}...", file=sys.stderr)
            return 1

    print(f"OK: {len(rows)} Korpuszeilen (je 2 Renderings) sind byte-identisch.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
