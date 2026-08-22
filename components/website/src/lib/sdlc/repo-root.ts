import * as path from 'path';
import { existsSync } from 'fs';

/**
 * Bestimmt die Repo-Wurzel — gemeinsame Quelle für Scan- und OpenSpec-Routen.
 * `OPENSPEC_REPO_ROOT` hat Vorrang (Tests/Container), sonst Aufwärtsuche nach
 * einem `openspec/`-Verzeichnis, zuletzt die Container-Konvention `../../..`.
 */
export function findRepoRoot(): string {
  if (process.env.OPENSPEC_REPO_ROOT) {
    return process.env.OPENSPEC_REPO_ROOT;
  }
  let current = process.cwd();
  while (current !== path.dirname(current)) {
    if (existsSync(path.join(current, 'openspec'))) {
      return current;
    }
    current = path.dirname(current);
  }
  return path.resolve(process.cwd(), '../../..');
}
