// website/src/lib/questionnaire-display.ts
// getDisplayScores — reads DB state for an assignment and produces the
// DimensionScore[] used by admin pages. Lives here (not in compute-scores.ts)
// to keep the pure scorer free of DB imports and avoid import cycles between
// the questionnaire-db submodules and compute-scores.

import type { QAssignment } from './questionnaire-db/types.ts';
import { computeScores, type DimensionScore } from './compute-scores';
import { listQDimensions, listQAnswerOptionsForTemplate, listQAnswers } from './questionnaire-db/queries';
import { listArchivedScores } from './questionnaire-db/scoring';

export async function getDisplayScores(assignment: QAssignment): Promise<DimensionScore[]> {
  if (assignment.status === 'archived') {
    const snap = await listArchivedScores(assignment.id);
    return snap.map((s) => ({
      dimension_id: s.dimension_id,
      name: s.dimension_name,
      position: 0,
      raw_score: s.final_score,
      final_score: s.final_score,
      threshold_mid: s.threshold_mid,
      threshold_high: s.threshold_high,
      level: s.level,
    }));
  }
  const [dims, opts, answers] = await Promise.all([
    listQDimensions(assignment.template_id),
    listQAnswerOptionsForTemplate(assignment.template_id),
    listQAnswers(assignment.id),
  ]);
  return computeScores(dims, opts, answers);
}
