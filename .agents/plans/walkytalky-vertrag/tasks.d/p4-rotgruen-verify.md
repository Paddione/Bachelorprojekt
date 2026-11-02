# p4 — Rot→Grün-Test + finaler Verify

Ziel: Profil per failing Test absichern (STRUCT2), dann Voll-Verifikation (STRUCT3).

## Tasks

- [ ] Rot-Test in `tests/py/spec/native_ported/spec/agent-skills/test_interaction_contract.py` ergänzen (bestehende Datei erweitern): assertet WalkyTalky-Profil-Anker in `AGENTS.md` (Überschrift + „Weiter"/„Details" + `(Recommended)`-Verweis).
  - Step: `python3 -m pytest tests/py/spec/native_ported/spec/agent-skills/test_interaction_contract.py -q` — expected: FAIL (neue Tests rot, alle bestehenden grün).
- [ ] Nach Umsetzung (dev-flow-execute): derselbe Pytest-Lauf ist grün; Vollvertrag-Tests unverändert grün (Regression).
- [ ] Finaler Verify-Task (letzter Task, STRUCT3):
  ```bash
  task test:changed
  task freshness:regenerate
  task freshness:check
  ```
- [ ] Eigner-Aktion (nicht in diesem Branch): `plan_refs: [.agents/plans/walkytalky-vertrag/tasks.md]` in `.agents/goals/walkytalky-vertrag/GOAL.md` nachtragen.

## Target files

- `tests/py/spec/native_ported/spec/agent-skills/test_interaction_contract.py` (erweitern, `.py`-Limit 800)
