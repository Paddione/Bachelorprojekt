# p2 — Dispatch-Recall + Size-Tier im plan-runner

Target files: `scripts/llm/plan-runner/workers.mjs`, `scripts/llm/plan-runner/plan.mjs`.

### Task 1: Recall in buildWorkerPrompt

- In `buildWorkerPrompt` (`plan.mjs`) vor dem Prompt-Aufbau einen Recall aufrufen: `task context:retrieve -- --task-prompt '<partial-text>' --role bachelorprojekt-run --budget 1500 --corpora specs_plans` als Subprozess (Muster: bestehende `execFile`-Aufrufe im Runner; Exit != 0 oder leere Antwort = Recall ohne Block übernehmen, nie den Dispatch blockieren).
- Die top-k Treffer (Partial-Snippets fremder Pläne) als kompakten `Ähnliche Partials`-Abschnitt in den Worker-Prompt übernehmen; bei null Treffern Abschnitt weglassen.
- `decideTrack`-Signatur bleibt rückwärtskompatibel (`{ ready, freeSlots }` weiter gültig).

### Task 2: Size-Hint plumbing mit Heavy-Tier-Extension-Point

- Partial-Frontmatter/Manifest um optionales `size: s|m|l` erweitern (Default `m` wenn fehlend): `s` = Microtask (tool-frei), `m` = Standard (4B-Worker), `l` = groß/unterspezifiziert (heute: Selbstaufruf, künftig: schweres Modell auf :1919).
- `decideTrack` nimmt optional `sizes` entgegen und gibt zusätzlich zum Track den Size-Hint zurück; Rückgabe bleibt String-kompatibel für bestehende Aufrufer (`worker`/`self`/`idle` — kein neues Verhalten ohne Heavy-Modell).
- Als Extension-Point dokumentieren (Kommentar in `workers.mjs`): sobald ein schweres Modell (z. B. gpt-oss-20B) auf :1919 deployt ist, wird `l` auf einen neuen Track `heavy` geroutet, ohne `decideTrack`-Aufrufer anzufassen. Kein Modell-Deploy in diesem Partial (nur :1919 passt ein schweres Modell, das verdrängt Qwen3.8-27B — eigene Entscheidung).
- CPU-Tier (0.8B/2B) bewusst nicht verdrahten: 4B ist Minimum für Tool-Loops; `s` läuft weiter auf dem 4B-Pool.
