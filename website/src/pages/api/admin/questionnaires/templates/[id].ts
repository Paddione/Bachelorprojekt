import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import {
  getQTemplate, updateQTemplate, deleteQTemplate,
  listQDimensions, upsertQDimension,
  listQQuestions, upsertQQuestion,
  replaceQAnswerOptions,
} from '../../../../../lib/questionnaire-db';

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const tpl = await getQTemplate(params.id!);
  if (!tpl) return new Response(JSON.stringify({ error: 'Nicht gefunden.' }), { status: 404 });
  const [dimensions, questions] = await Promise.all([
    listQDimensions(params.id!),
    listQQuestions(params.id!),
  ]);
  return new Response(JSON.stringify({ ...tpl, dimensions, questions }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const PUT: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const tpl = await getQTemplate(params.id!);
  if (!tpl) return new Response(JSON.stringify({ error: 'Nicht gefunden.' }), { status: 404 });
  if (tpl.is_system_test) {
    return new Response(JSON.stringify({ error: 'System-Testvorlagen können nicht bearbeitet werden.' }), { status: 409 });
  }
  if (tpl.status === 'published') {
    return new Response(JSON.stringify({ error: 'Veröffentlichte Vorlagen können nicht bearbeitet werden.' }), { status: 409 });
  }
  const body = await request.json() as {
    title?: string; description?: string; instructions?: string; status?: string;
    dimensions?: Array<{ id?: string; name: string; position: number; threshold_mid?: number | null; threshold_high?: number | null; score_multiplier?: number }>;
    questions?: Array<{
      id?: string; position: number; question_text: string; question_type: string;
      answer_options: Array<{ option_key: string; label: string; dimension_id: string | null; weight: number }>;
      test_expected_result?: string | null;
      test_function_url?: string | null;
      test_menu_path?: string | null;
      test_role?: 'admin' | 'user' | null;
    }>;
  };
  const updated = await updateQTemplate(params.id!, {
    title: body.title, description: body.description,
    instructions: body.instructions, status: body.status,
  });
  if (body.dimensions) {
    for (const d of body.dimensions) {
      await upsertQDimension({ id: d.id, templateId: params.id!, name: d.name, position: d.position,
        thresholdMid: d.threshold_mid, thresholdHigh: d.threshold_high, scoreMultiplier: d.score_multiplier });
    }
  }
  if (body.questions) {
    for (const q of body.questions) {
      const saved = await upsertQQuestion({
        id: q.id, templateId: params.id!, position: q.position,
        questionText: q.question_text,
        questionType: q.question_type as import('../../../../../lib/questionnaire-db').QuestionType,
        testExpectedResult: q.test_expected_result,
        testFunctionUrl: q.test_function_url,
        testMenuPath: q.test_menu_path,
        testRole: q.test_role,
      });
      if (q.question_type !== 'test_step' && q.answer_options) {
        await replaceQAnswerOptions(saved.id, q.answer_options.map(o => ({
          optionKey: o.option_key, label: o.label, dimensionId: o.dimension_id, weight: o.weight,
        })));
      }
    }
  }
  return new Response(JSON.stringify(updated), { headers: { 'Content-Type': 'application/json' } });
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  await deleteQTemplate(params.id!);
  return new Response(null, { status: 204 });
};
