import * as path from 'path';
import { existsSync } from 'fs';

/**
 * Bestimmt die Repo-Wurzel — gemeinsame Quelle für Scan-Routen.
 * `REPO_ROOT` hat Vorrang (Tests/Container), sonst Aufwärtsuche nach
 * einem `.agents/plans/`-Verzeichnis, zuletzt die Container-Konvention `../../..`.
 */
export function findRepoRoot(): string {
  if (process.env.REPO_ROOT) {
    return process.env.REPO_ROOT;
  }
  let current = process.cwd();
  while (current !== path.dirname(current)) {
    if (existsSync(path.join(current, '.agents', 'plans'))) {
      return current;
    }
    current = path.dirname(current);
  }
  return path.resolve(process.cwd(), '../../..');
}
