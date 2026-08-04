#!/usr/bin/env python3
"""Erzeugt Eval-Fixtures aus einem OpenAI-kompatiblen Endpunkt (T002634).

WARUM DIESES SKRIPT EXISTIERT
    `eval_harness.py --adapter` laedt Basismodell und PEFT-Adapter ueber
    transformers/peft. Fuer ein Modell, das nur als GGUF vorliegt — etwa ein
    fremder Merge wie yuxinlu1/gemma-4-12B-agentic-fable5-composer2.5-v2-3.5x-tau2 —
    ist dieser Pfad nicht anwendbar: es gibt keinen Adapter, und der Harness
    weigert sich ausdruecklich, gegen ein geratenes Basismodell zu vergleichen
    (`read_base_model_id`). Der Fixture-Modus des Harness ist die vorgesehene
    Umgehung: Generierung ausserhalb, Bewertung drinnen.

    Dieses Skript uebernimmt nur die Generierung. Die Bewertungsregeln aus
    `eval_scoring.py` bleiben unberuehrt — genau das ist der Punkt.

WARUM `build_prompt` IMPORTIERT UND NICHT KOPIERT WIRD
    Der Harness garantiert "an identical prompt path" fuer Base und Tuned. Eine
    kopierte Prompt-Konstruktion wuerde diese Garantie beim ersten Edit
    unbemerkt brechen und der Vergleich waere still ungueltig — beide Seiten
    saehen andere Prompts als der Referenzlauf. Der Import macht die Kopplung
    hart: aendert sich `build_prompt`, aendern sich beide Fixtures.

WARUM RAW COMPLETION STATT CHAT COMPLETION (Default)
    `ModelBackend.generate` tokenisiert den Prompt roh und ruft `generate(...)`
    ohne Chat-Template auf. `/v1/completions` bildet das ab, `/v1/chat/completions`
    nicht — llama-server legte dort das Template des Modells darum. Fuer die
    Vergleichbarkeit MIT dem Harness-Referenzpfad ist roh richtig.

    `--mode chat` ist trotzdem vorhanden: es ist naeher an der tatsaechlichen
    Nutzung durch die Factory. Fair ist beides, solange BEIDE Seiten denselben
    Modus verwenden — deshalb steht der Modus im Fixture-Report und wird beim
    Vergleich geprueft. Was NICHT fair waere: Basis roh gegen Tuned im Chat-Modus.

WARUM greedy UND DAS IMPORTIERTE TOKEN-BUDGET
    Spiegelt `ModelBackend.generate` exakt: `do_sample=False` -> temperature 0,
    `max_new_tokens` -> max_tokens. Der Wert wird aus `eval_harness` IMPORTIERT,
    nicht kopiert — abweichende Budgets machen die Fixtures mit einem echten
    Adapter-Lauf unvergleichbar, und bei Reasoning-Modellen entscheidet das
    Budget darueber, ob ueberhaupt eine Antwort statt nur Denktext entsteht.

BEISPIEL
    # Loadout starten, dann:
    python3 scripts/finetune/gen_fixtures.py \
      --testset scripts/finetune/testsets/agent-actions.jsonl \
      --model gemma4-base --output /tmp/fx-base.json
    python3 scripts/finetune/gen_fixtures.py \
      --testset scripts/finetune/testsets/agent-actions.jsonl \
      --model gemma4-tuned --output /tmp/fx-tuned.json
    task finetune-eval:run FIXTURE_BASE=/tmp/fx-base.json FIXTURE_TUNED=/tmp/fx-tuned.json
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from eval_harness import MAX_NEW_TOKENS, build_prompt  # noqa: E402  (nach sys.path-Anpassung)

DEFAULT_ENDPOINT = "http://127.0.0.1:18235/v1"
# Aus dem Harness importiert statt dupliziert: ein abweichendes Budget macht die
# Fixtures mit einem echten Adapter-Lauf unvergleichbar (T002634).
MAX_TOKENS = MAX_NEW_TOKENS


def build_payload(case: dict, model: str, mode: str, max_tokens: int = MAX_TOKENS) -> dict:
    """Baut den Request-Body. Greedy in beiden Modi (temperature 0)."""
    prompt = build_prompt(case)
    common = {"model": model, "temperature": 0, "max_tokens": max_tokens}
    if mode == "chat":
        return {**common, "messages": [{"role": "user", "content": prompt}]}
    return {**common, "prompt": prompt}


def extract_text(response: dict, mode: str) -> str:
    """Zieht den Rohtext aus der Antwort.

    Leerer Text ist ein GUELTIGES Ergebnis — `parse_action_output` liest ihn als
    "keine Aktion", was fuer die no_action-Partition der erwartete Fall ist. Er
    darf deshalb nicht als Fehler behandelt werden.
    """
    choices = response.get("choices") or []
    if not choices:
        raise ValueError(f"Antwort ohne choices: {json.dumps(response)[:200]}")
    choice = choices[0]
    if mode == "chat":
        # T002277: llama.cpp legt bei Reasoning-Modellen den Denkteil in
        # reasoning_content und laesst content leer, bis das Denken fertig ist.
        # Ein leeres content bei finish_reason=length ist deshalb KEINE
        # "keine Aktion", sondern ein zu knappes Token-Budget.
        if choice.get("finish_reason") == "length" and not (choice.get("message") or {}).get("content"):
            raise ValueError(
                "leerer content bei finish_reason=length — max_tokens zu klein "
                "fuer ein Reasoning-Modell; das waere still als 'keine Aktion' gewertet worden"
            )
        return (choice.get("message") or {}).get("content") or ""
    return choice.get("text") or ""


def post_json(url: str, payload: dict, timeout: int) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def read_testset(path: str) -> list:
    with open(path, encoding="utf-8") as fh:
        return [json.loads(line) for line in fh if line.strip()]


def generate_all(cases: list, model: str, endpoint: str, mode: str, timeout: int,
                 max_tokens: int = MAX_TOKENS, transport=post_json) -> dict:
    """Generiert sequentiell. Der llm-proxy serialisiert ohnehin (max_inflight=1);
    Nebenlaeufigkeit brachte nur Queue-Timeouts."""
    path = "/chat/completions" if mode == "chat" else "/completions"
    url = f"{endpoint.rstrip('/')}{path}"
    out = {}
    for i, case in enumerate(cases, 1):
        payload = build_payload(case, model, mode, max_tokens)
        out[case["id"]] = extract_text(transport(url, payload, timeout), mode)
        print(f"  [{i}/{len(cases)}] {case['id']}", file=sys.stderr)
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--testset", required=True)
    ap.add_argument("--model", required=True, help="Loadout-Slug bzw. Modellname am Endpunkt")
    ap.add_argument("--output", required=True)
    ap.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    ap.add_argument("--mode", choices=("completion", "chat"), default="completion",
                    help="completion spiegelt ModelBackend (Default); chat ist naeher an der Factory-Nutzung")
    ap.add_argument("--timeout", type=int, default=600)
    ap.add_argument("--max-tokens", type=int, default=MAX_TOKENS,
                    help=f"Default {MAX_TOKENS} spiegelt ModelBackend.max_new_tokens. Reasoning-Modelle "
                         "brauchen mehr, weil der Denkteil aus demselben Budget geht — dann MUSS der Wert "
                         "auf beiden Seiten gleich sein.")
    args = ap.parse_args(argv)

    cases = read_testset(args.testset)
    print(f"{len(cases)} Faelle gegen {args.model} ({args.mode}) an {args.endpoint}", file=sys.stderr)
    try:
        outputs = generate_all(cases, args.model, args.endpoint, args.mode, args.timeout, args.max_tokens)
    except urllib.error.URLError as err:
        print(f"FEHLER: Endpunkt nicht erreichbar ({err}) — laeuft das Loadout?", file=sys.stderr)
        return 2
    Path(args.output).write_text(json.dumps(outputs, ensure_ascii=False, indent=2), encoding="utf-8")
    empty = sum(1 for v in outputs.values() if not v.strip())
    print(f"{len(outputs)} Fixtures nach {args.output} ({empty} leer = 'keine Aktion')", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
