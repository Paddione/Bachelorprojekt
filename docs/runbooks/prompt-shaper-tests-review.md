# Prompt-Shaper Tests & Review (decision-train)

Stand: 2026-10-13. Geprüfter Stand: unsloth-boxes-Branch
`feature/prompt-shaper`, Worktree
`~/.worktrees/unsloth-boxes-52268da5/feature/prompt-shaper`
(sauber, keine offenen TODOs). Prüfgegenstand:
`decision-train/src/prompt_shaper.py`,
`decision-train/src/dispatch.py`,
`decision-train/src/sandbox_guard.py`,
`decision-train/src/test_prompt_shaper.py`.

## Tests laufen lassen

`test_router_guard.py` braucht `unsloth` (GPU-Env) und ist auf CPU
nicht sammelbar — erwartet, kein Fehler. Alle anderen laufen:

```
cd decision-train/src
python -m pytest test_prompt_shaper.py test_auto_label.py \
  test_calibrate_decisions.py test_server_batch.py -q
```

Zuletzt: 80 bestanden, 1 übersprungen (`test_prompt_shaper.py`
allein: 64 bestanden).

Hinweis: Die decision-train-`.venv` enthält derzeit weder pytest
noch httpx. Bis ein Test-Extra im Projekt existiert, braucht es
eine Env mit `"pytest>=8,<10"` und `"httpx>=0.27,<1"`.

## Befunde

- `dispatch.py:161` — `call.body["model"] = target_model` ist tot:
  `LlmCall.body` baut pro Zugriff ein frisches Dict, die Zuweisung
  wird verworfen (per Probe belegt). Nur
  `session.params["model"]` greift. Zeile streichen.
- `dispatch.py:159-163` — `target_url` / `worker_url` /
  `target_model` sind undeklarierte dynamische Attribute an
  Dataclasses. Funktioniert, ist aber fragil. Als Felder
  deklarieren oder kapseln.
- `prompt_shaper.py:211` (`priority()`) — kann `-50` liefern
  (critical + blocker). Klären, ob vLLM negative Prioritäten
  akzeptiert, sonst auf 0 klemmen.

## Suite-Qualität

Gut: parametrisierte Guard-Bypass-Liste, Copy-Semantik-Tests gegen
interne Mutation, append-only Session-Tests. Negativkontrolle
bestanden (`subprocess`-Bypass abgewiesen, harmloser Code erlaubt).
Kein always-green-Risiko erkennbar.

## Fix-Reihenfolge

1. Tote Zeile `dispatch.py:161` entfernen.
2. Dynamische Attribute deklarieren.
3. Priority-Klemmung klären.
