---
title: "p3-guard-test"
ticket_id: T015248
domains: [llm, finetune, tests]
status: active
---

# Partial p3 — Guard-Test (STRUCT2-Träger)

Struktureller Guard gegen beide Deliverables. Der Test ist zuerst ROT
(Artefakte fehlen), nach p1/p2 GRÜN.

### Task 1: BATS-Test schreiben

**Files:** `tests/spec/finetune-tandem-eval.bats`

Verfügbarkeits-Guards in die Rotphase (T002820): `command -v python3`,
`command -v jq` — sonst `skip`.

Assertionen (python3+json bzw. jq):

1. `docs/finetune/tandem-candidates.json` existiert und ist valides JSON.
2. Die Rollen-Schlüssel `draft`, `router`, `worker` existieren in JEDEM
   Kandidat-Eintrag und jede Rolle hat ≥ 1 Kandidaten mit fit-Wert ungleich
   `excluded`.
3. Jeder Kandidat erfüllt: `params_b <= 8`, `gguf_exportable == true`,
   `qlora_vram_fit_16gb_shared == true`.
4. Jeder Kandidat mit `roles.draft.fit == "recommended"` hat
   `tokenizer_match_with_resident == true`.
5. `docs/finetune/tandem-model-evaluation.md` existiert und enthält die
   Abschnitte „Empfehlung je Rolle" und „Trainingsplan" (grep auf Überschriften).
6. Kein `TBD`/`TODO` in beiden Artefakten.

### Task 2: RED-verifizieren vor p1/p2 (Reihenfolge-Hinweis)

Der STRUCT2-Failing-Step in `tasks.md` dokumentiert den Rot-Nachweis. Da die
Factory p1→p2→p3 ausführt, verifiziert p3 den Grün-Zustand; der Rot-Zustand
ist durch die Assertionen 1/5 definiert (Artefakte fehlen → Test scheitert).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/finetune-tandem-eval.bats
# expected: FAIL (red, solange docs/finetune/-Artefakte fehlen)
```
