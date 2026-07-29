// website/src/lib/tickets/migrate-type-vocabulary.ts
// Teil B des Epics T002326: `tickets.type` bekommt das Conventional-Commit-Vokabular.
// Ausgelagert aus migrations.ts (dort nur noch Import + Aufruf), weil die Datei mit
// 576/600 Zeilen am S1-Budget steht — T002329.
import type { Pool, PoolClient } from 'pg';

// Dual-Vokabular: der CHECK akzeptiert die zehn neuen Werte UND die drei Altwerte.
// Das entkoppelt DB-Migration (reist im Website-Image) und Skript-Deploy (kommt mit
// dem Merge sofort auf dem Host an) — die beiden Zeitpunkte fallen zwangsläufig
// auseinander, und solange beide Namensräume gültig sind, ist das Fenster folgenlos.
// Die Altwerte fallen in Teil D (T002331) aus dem Constraint.
const NEW_TYPES = ['fix', 'feat', 'chore', 'project', 'incident', 'docs', 'refactor', 'perf', 'test', 'ci', 'build'] as const;
const LEGACY_TYPES = ['bug', 'feature', 'task'] as const;

export const TICKET_TYPES = [...NEW_TYPES, ...LEGACY_TYPES] as const;

/**
 * Setzt den benannten type-Constraint und schreibt die Bestandsdaten um.
 *
 * Die Reihenfolge ist zwingend: der erweiterte Constraint muss VOR dem UPDATE
 * stehen, sonst verletzt das UPDATE den noch geltenden alten CHECK.
 *
 * Idempotent — der WHERE-Filter trifft ab dem zweiten Lauf null Zeilen. Läuft bei
 * jedem Pod-Boot erneut und erreicht dadurch beide Brand-Datenbanken ohne
 * gesonderten Anstoß.
 */
export async function applyTypeVocabularyMigration(pool: Pool | PoolClient): Promise<void> {
  // Benannter Constraint statt inline — sonst lässt er sich später nicht droppen.
  // Gleiches Muster wie tickets_status_check und tickets_effort_check.
  await pool.query(`ALTER TABLE tickets.tickets DROP CONSTRAINT IF EXISTS tickets_type_check`);
  await pool.query(`
    ALTER TABLE tickets.tickets ADD CONSTRAINT tickets_type_check
      CHECK (type IN ('fix','feat','chore','project','incident',
                       'docs','refactor','perf','test','ci','build',
                       'bug','feature','task'))
  `);
  await pool.query(`
    UPDATE tickets.tickets SET type = CASE type
        WHEN 'bug'     THEN 'fix'
        WHEN 'feature' THEN 'feat'
        WHEN 'task'    THEN 'chore'
      END
     WHERE type IN ('bug','feature','task')
  `);
}
