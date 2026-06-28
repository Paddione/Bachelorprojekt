// website/src/lib/questionnaire-db/types.ts
// TypeScript interfaces + type aliases for the questionnaire domain.
// Pure types only — no runtime code, no imports.

export type QuestionType = 'ab_choice' | 'ja_nein' | 'likert_5' | 'test_step';
export type TestStepResult = 'erfüllt' | 'teilweise' | 'nicht_erfüllt';
export type AssignmentStatus = 'pending' | 'in_progress' | 'submitted' | 'reviewed' | 'archived' | 'dismissed';

export const SYSTEM_TEST_DEFAULT_INSTRUCTIONS = [
  'Wenn dir etwas auffällt — auch nur tangential — schreib es auf.',
  'Verwirrung ist Signal. Lieber eine geschwätzige `teilweise`-Notiz mit',
  'Fragezeichen als ein sauberes `erfüllt`, das einen echten Defekt versteckt.',
  '',
  'AI-Tester: dasselbe gilt für dich. Wenn etwas anders aussieht als erwartet,',
  'das Testskript es aber nicht abdeckt, dokumentiere es im Notizfeld. Wenn',
  'dich eine Fehlermeldung verwirrt, beschreibe was verwirrend war. Halte dich',
  'nicht zurück.',
].join('\n');

export const ARCHIVABLE_STATUSES: AssignmentStatus[] = ['submitted', 'reviewed', 'archived'];

export interface QTemplate {
  id: string;
  title: string;
  description: string;
  instructions: string;
  status: 'draft' | 'published' | 'archived';
  is_system_test: boolean;
  dimension_count: number;
  created_at: string;
  updated_at: string;
}

export interface QDimension {
  id: string;
  template_id: string;
  name: string;
  position: number;
  threshold_mid: number | null;
  threshold_high: number | null;
  score_multiplier: number;
  created_at: string;
}

export interface QQuestion {
  id: string;
  template_id: string;
  position: number;
  question_text: string;
  question_type: QuestionType;
  test_expected_result: string | null;
  test_function_url: string | null;
  test_menu_path: string | null;
  test_role: 'admin' | 'user' | null;
  created_at: string;
}

export interface QAnswerOption {
  id: string;
  question_id: string;
  option_key: string;
  label: string;
  dimension_id: string | null;
  weight: number;
}

export interface QAssignment {
  id: string;
  customer_id: string;
  template_id: string;
  template_title: string;
  status: AssignmentStatus;
  coach_notes: string;
  assigned_at: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  archived_at: string | null;
  dismissed_at: string | null;
  dismiss_reason: string | null;
  project_id: string | null;
}

export interface QAnswer {
  id: string;
  assignment_id: string;
  question_id: string;
  option_key: string;
  details_text: string | null;
  saved_at: string;
}

export interface QTestStatus {
  question_id: string;
  template_id: string;
  template_title: string;
  question_text: string;
  test_expected_result: string | null;
  test_function_url: string | null;
  test_role: 'admin' | 'user' | null;
  position: number;
  last_result: TestStepResult | null;
  last_result_at: string | null;
  last_success_at: string | null;
}

export interface QArchivedScore {
  assignment_id: string;
  dimension_id: string;
  dimension_name: string;
  final_score: number;
  threshold_mid: number | null;
  threshold_high: number | null;
  level: 'förderlich' | 'mittel' | 'kritisch' | null;
  snapshot_at: string;
}

export interface QEvidenceForQuestion {
  question_id: string;
  latest_evidence_id: string;
  latest_attempt: number;
  evidence_count: number;
}
