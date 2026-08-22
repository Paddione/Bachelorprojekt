# Proposal: rollup-loop-closure

## Why

Der Rollup schließt Einträge ab, ohne den Loop wirklich zu schließen. Drei nachweisliche Lecks:

1. **"kein Repo-Fix — Beobach­tungspunkt" ist ein schwarzes Loch.** Die Disposition terminiert den Eintrag permanent — nichts beobachtet weiter. Beispiel: der gemma12-MTP-Crash (Batch 08-19, #7) wurde als "transient, Workaround operativ" abgelegt; drei Tage später ist der Workaround noch der Live-Stand, ohne dass irgendein Mechanismus daran erinnert.
2. **Rezurrenz über Batches ist unsichtbar.** Der SCS-Embed-Fehler (`localhost:8081` unerreichbar) fiel in Batch 08-20 (#10) und erneut in Batch 08-22 (#6) — beide Male unkorreliert. Das Dedupe beim Melden prüft nur offene Tickets + Buffer, nie die Batch-Historie.
3. **Offene Boxen zirkulieren endlos ohne Konsequenz.** Der Carryover (T013108) trägt unerledigte Einträge in den Folgezyklus, aber ein Eintrag kann beliebig viele Zyklen überleben, ohne dass sich sein Status oder seine Priorität ändert.

## What

Drei Mechanismen, im Generator verankert (die Daten liegen alle bereits in `ticket_comments` der Container):

**A. Rezurrenz-Tag** — bei der Plan-Generierung durchsucht ein neuer Helper (`scripts/factory/rollup-recurrence.sh`) alle historischen Batch-Kommentare (auch geschlossener Container) nach gleichem Component + ähnlichem/gleichem Titel und rendert `×N` plus Verweise auf die Vorzyklen in den Eintragskopf. Macht Rezurrenz für den Executor sichtbar, auch wenn der Vorfall früher als "kein Repo-Fix" abgehakt wurde.

**B. Watchlist-Disposition** — vierte legale Disposition `beobachten (bis Zyklus <N>)` neben `gefixt | bereits gefixt | kein Repo-Fix`. "Kein Repo-Fix" wird damit entweder terminal begründet oder bekommt ein Ablaufdatum. Der Generator nimmt lebende Watchlist-Einträge (aus den Dispositionszeilen vergangener Pläne gelesen) automatisch in jeden neuen Batch auf, bis der Zyklus erreicht oder explizit geschlossen ist.

**C. Eskalationsregel** — ein Eintrag, der ≥ 2 Zyklen offen bleibt (Carryover-Zähler) oder dessen Watchlist-Zyklus abläuft, wird beim nächsten Generator-Lauf automatisch in ein eigenes Ticket promoted (`needs_human`) und verlässt die Rollup-Loop, statt zum Zombie zu werden.

Sequencing: Das ändert das Plan-Template-Vokabular — der Change sollte landen, wenn kein Rollup-Zyklus mid-flight ist (T013107 war bei Erstellung dieses Proposals gerade gestaged).

_Ticket: T013305_
