import type { QDimension, QAnswerOption, QAnswer, QAssignment } from './questionnaire-db.ts';

export interface DimensionScore {
  dimension_id: string;
  name: string;
  position: number;
  raw_score: number;
  final_score: number;
  threshold_mid: number | null;
  threshold_high: number | null;
  level: 'förderlich' | 'mittel' | 'kritisch' | null;
}

export function computeScores(
  dimensions: QDimension[],
  allOptions: QAnswerOption[],
  answers: Pick<QAnswer, 'question_id' | 'option_key'>[],
): DimensionScore[] {
  const answerMap = new Map(answers.map(a => [a.question_id, a.option_key]));

  return dimensions.map(dim => {
    let raw = 0;

    for (const opt of allOptions) {
      if (opt.dimension_id !== dim.id) continue;
      const chosen = answerMap.get(opt.question_id);
      if (chosen !== opt.option_key) continue;

      const numericKey = Number(opt.option_key);
      if (!Number.isNaN(numericKey)) {
        raw += numericKey * opt.weight;
      } else {
        raw += opt.weight;
      }
    }

    const final = raw * dim.score_multiplier;
    let level: DimensionScore['level'] = null;
    if (dim.threshold_mid !== null && dim.threshold_high !== null) {
      if (final < dim.threshold_mid) level = 'förderlich';
      else if (final < dim.threshold_high) level = 'mittel';
      else level = 'kritisch';
    }

    return {
      dimension_id: dim.id,
      name: dim.name,
      position: dim.position,
      raw_score: raw,
      final_score: final,
      threshold_mid: dim.threshold_mid,
      threshold_high: dim.threshold_high,
      level,
    };
  }).sort((a, b) => a.position - b.position);
}

export async function getDisplayScores(assignment: QAssignment): Promise<DimensionScore[]> {
  const {
    listArchivedScores, listQDimensions, listQAnswerOptionsForTemplate, listQAnswers,
  } = await import('./questionnaire-db');

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
