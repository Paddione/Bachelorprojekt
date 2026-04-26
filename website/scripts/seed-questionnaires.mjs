// website/scripts/seed-questionnaires.mjs
// Run: node --experimental-strip-types scripts/seed-questionnaires.mjs
// (or: npx tsx scripts/seed-questionnaires.mjs)
// Idempotent: skips templates that already exist by title.

import pg from 'pg';
import { resolve4 } from 'dns';

const DB_URL = process.env.SESSIONS_DATABASE_URL
  || 'postgresql://website:devwebsitedb@shared-db.workspace.svc.cluster.local:5432/website';

function nodeLookup(hostname, _opts, cb) {
  resolve4(hostname, (err, addrs) => cb(err ?? null, addrs?.[0] ?? '', 4));
}
const pool = new pg.Pool({ connectionString: DB_URL, lookup: nodeLookup });

async function seedIfAbsent(title, seedFn) {
  const existing = await pool.query(
    `SELECT id FROM questionnaire_templates WHERE title = $1`, [title],
  );
  if (existing.rows.length > 0) {
    console.log(`  ✓ "${title}" already exists, skipping.`);
    return;
  }
  await seedFn();
  console.log(`  ✓ Seeded "${title}".`);
}

// ── Thomas/Kilmann ────────────────────────────────────────────────
// 30 A/B-choice questions, 5 dimensions (no thresholds — higher = stronger tendency).
// Scoring matrix transcribed from instrument PDF.

const TK_QUESTIONS = [
  { pos: 1, text: 'A. Es gibt Zeiten, in denen ich anderen die Verantwortung gebe, das Problem zu lösen.\nB. Ich betone Gemeinsamkeiten eher, als dass ich die Dinge verhandle, bei denen wir nicht einig sind.' },
  { pos: 2, text: 'A. Ich versuche eine Kompromisslösung zu finden.\nB. Ich versuche die Wünsche der anderen genauso zu berücksichtigen wie meine eigenen.' },
  { pos: 3, text: 'A. Ich bin normaler Weise hart, wenn ich meine Ziele verfolge.\nB. Ich versuche die Gefühle der anderen zu verschonen und die gute Beziehung aufrecht zu erhalten.' },
  { pos: 4, text: 'A. Ich versuche einen Kompromiss zu finden.\nB. Ich stelle meine eigenen Wünsche zu Gunsten der Wünsche der anderen Person zurück.' },
  { pos: 5, text: 'A. Ich hole mir grundsätzlich die Unterstützung der anderen Partei bei der Lösungssuche.\nB. Ich tue alles, was nötig ist, um unnötige Spannungen zu vermeiden.' },
  { pos: 6, text: 'A. Ich versuche unangenehme Situationen von vornherein zu vermeiden.\nB. Ich versuche meine Position durchzusetzen.' },
  { pos: 7, text: 'A. Ich versuche ein Thema zu verschieben, um Zeit zu bekommen, genau darüber nachzudenken.\nB. Ich gebe bei einigen Punkten nach, wenn ich dafür andere durchsetzen kann.' },
  { pos: 8, text: 'A. Ich bin normaler Weise hart, wenn ich meine Ziele verfolge.\nB. Ich versuche alle Sorgen und Themen sofort offen auf den Tisch zu bekommen.' },
  { pos: 9, text: 'A. Ich glaube, dass es sich nicht immer lohnt, sich über Meinungsverschiedenheiten Gedanken zu machen.\nB. Ich strenge mich an, damit ich bekomme, was ich will.' },
  { pos: 10, text: 'A. Ich bin normaler Weise hart, wenn ich meine Ziele verfolge.\nB. Ich versuche einen Kompromiss zu finden.' },
  { pos: 11, text: 'A. Ich versuche alle Sorgen und Themen sofort offen auf den Tisch zu bekommen.\nB. Ich versuche Gefühle der anderen zu schonen und die gute Beziehung aufrecht zu erhalten.' },
  { pos: 12, text: 'A. Ich vermeide es manchmal Positionen zu beziehen, die umstritten sind.\nB. Ich gebe bei einigen Punkten nach, wenn ich dafür andere durchsetzen kann.' },
  { pos: 13, text: 'A. Ich schlage eine Lösung vor, die allen entgegenkommt.\nB. Ich mache Druck, damit meine Meinung gehört wird.' },
  { pos: 14, text: 'A. Ich teile mit anderen Personen meine Ideen und frage nach ihren Ideen.\nB. Ich versuche den anderen die Logik und Vorteile hinter meiner Meinung aufzuzeigen.' },
  { pos: 15, text: 'A. Ich versuche die Gefühle der anderen zu schonen und die guten Beziehungen aufrecht zu erhalten.\nB. Ich tue alles, was nötig ist, um unnötige Spannungen zu vermeiden.' },
  { pos: 16, text: 'A. Ich versuche andere nicht zu verletzen.\nB. Ich versuche den anderen von den Vorteilen meiner Position zu überzeugen.' },
  { pos: 17, text: 'A. Ich bin normalerweise hart, wenn ich meine Ziele verfolge.\nB. Ich tue alles was nötig ist, um unnötige Spannungen zu vermeiden.' },
  { pos: 18, text: 'A. Wenn es andere glücklich macht, dann gestehe ich ihnen ihre Meinung zu.\nB. Ich gebe bei einigen Punkten nach, wenn ich dafür andere durchsetzen kann.' },
  { pos: 19, text: 'A. Ich versuche alle Sorgen und Themen sofort auf den Tisch zu bekommen.\nB. Ich versuche ein Thema zu verschieben, um Zeit zu bekommen, genau darüber nachzudenken.' },
  { pos: 20, text: 'A. Ich versuche alle Differenzen sofort zu beseitigen.\nB. Ich versuche es zu erreichen, dass die Gewinne und Verluste auf beiden Seiten fair verteilt sind.' },
  { pos: 21, text: 'A. Bei technischen Dingen versuche ich, die Wünsche der anderen Seite einzubeziehen.\nB. Ich bin dafür, ein Problem immer sofort auszudiskutieren.' },
  { pos: 22, text: 'A. Ich versuche eine Position zu finden, die zwischen meiner und der anderen Person liegt.\nB. Ich setze meine Wünsche durch.' },
  { pos: 23, text: 'A. Ich sorge mich oft darum, dass die Wünsche aller erfüllt sind.\nB. Es gibt Zeiten, in denen ich anderen die Verantwortung gebe, das Problem zu lösen.' },
  { pos: 24, text: 'A. Wenn jemandem seine Position sehr wichtig erscheint, dann würde ich versuchen, seine Wünsche zu erfüllen.\nB. Ich versuche einen Kompromiss zu finden.' },
  { pos: 25, text: 'A. Ich versuche den anderen die Logik und Vorteile hinter meiner Meinung aufzuzeigen.\nB. Bei technischen Dingen versuche ich, die Wünsche der anderen Seite einzubeziehen.' },
  { pos: 26, text: 'A. Ich schlage eine Lösung vor, die allen entgegen kommt.\nB. Mir ist es fast immer wichtig, dass die Wünsche aller erfüllt sind.' },
  { pos: 27, text: 'A. Ich vermeide es manchmal Positionen zu beziehen, die umstritten sind.\nB. Wenn es andere glücklich macht, dann gestehe ich ihnen ihre Meinung zu.' },
  { pos: 28, text: 'A. Ich bin normalerweise hart, wenn ich meine Ziele verfolge.\nB. Ich hole mir grundsätzlich die Unterstützung der anderen Partei bei der Lösungssuche.' },
  { pos: 29, text: 'A. Ich schlage eine Lösung vor, die allen entgegenkommt.\nB. Ich glaube, dass es sich lohnt, sich über Meinungsverschiedenheiten Gedanken zu machen.' },
  { pos: 30, text: 'A. Ich versuche andere nicht zu verletzen.\nB. Ich bespreche das Problem mit der anderen Person, damit wir es lösen können.' },
];

// [questionPos, optionKey, dimensionIndex]
// Dimensions: Konkurrieren=0, Zusammenarbeit=1, Kompromiss=2, Vermeiden=3, Entgegenkommen=4
const TK_DIM_NAMES = ['Konkurrieren', 'Zusammenarbeit', 'Kompromiss', 'Vermeiden', 'Entgegenkommen'];
const TK_SCORING = [
  [1,'A',3],[1,'B',4],  [2,'A',2],[2,'B',1],  [3,'A',0],[3,'B',4],
  [4,'A',2],[4,'B',4],  [5,'A',1],[5,'B',3],  [6,'A',3],[6,'B',0],
  [7,'A',3],[7,'B',2],  [8,'A',0],[8,'B',1],  [9,'A',3],[9,'B',0],
  [10,'A',0],[10,'B',2],[11,'A',1],[11,'B',4], [12,'A',3],[12,'B',2],
  [13,'A',2],[13,'B',0],[14,'A',1],[14,'B',0], [15,'A',4],[15,'B',3],
  [16,'A',4],[16,'B',0],[17,'A',0],[17,'B',3], [18,'A',4],[18,'B',2],
  [19,'A',1],[19,'B',3],[20,'A',1],[20,'B',2], [21,'A',4],[21,'B',1],
  [22,'A',2],[22,'B',0],[23,'A',1],[23,'B',3], [24,'A',4],[24,'B',2],
  [25,'A',0],[25,'B',4],[26,'A',2],[26,'B',1], [27,'A',3],[27,'B',4],
  [28,'A',0],[28,'B',1],[29,'A',2],[29,'B',3], [30,'A',4],[30,'B',1],
];

async function seedThomasKilmann() {
  const tpl = await pool.query(
    `INSERT INTO questionnaire_templates (title, description, instructions, status)
     VALUES ($1,$2,$3,'published')
     RETURNING id`,
    [
      'Konflikttypen-Fragebogen (Thomas/Kilmann)',
      'Misst den bevorzugten Konfliktstil in 5 Dimensionen.',
      'Lesen Sie jede Aussage und entscheiden Sie spontan, welche Aussage (A oder B) besser auf Sie zutrifft. Es gibt keine richtigen oder falschen Antworten.',
    ],
  );
  const tplId = tpl.rows[0].id;

  const dimIds = [];
  for (let i = 0; i < TK_DIM_NAMES.length; i++) {
    const d = await pool.query(
      `INSERT INTO questionnaire_dimensions (template_id, name, position) VALUES ($1,$2,$3) RETURNING id`,
      [tplId, TK_DIM_NAMES[i], i],
    );
    dimIds.push(d.rows[0].id);
  }

  const qIds = {};
  for (const q of TK_QUESTIONS) {
    const r = await pool.query(
      `INSERT INTO questionnaire_questions (template_id, position, question_text, question_type)
       VALUES ($1,$2,$3,'ab_choice') RETURNING id`,
      [tplId, q.pos, q.text],
    );
    qIds[q.pos] = r.rows[0].id;
  }

  for (const [pos, optKey, dimIdx] of TK_SCORING) {
    await pool.query(
      `INSERT INTO questionnaire_answer_options (question_id, option_key, label, dimension_id, weight)
       VALUES ($1,$2,$3,$4,1)`,
      [qIds[pos], optKey, optKey, dimIds[dimIdx]],
    );
  }
}

// Main
(async () => {
  try {
    await seedIfAbsent('Konflikttypen-Fragebogen (Thomas/Kilmann)', seedThomasKilmann);
    console.log('Thomas/Kilmann done.');
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
