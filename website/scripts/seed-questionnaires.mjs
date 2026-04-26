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

// ── Riemann-Thomann ───────────────────────────────────────────────
// 48 Ja/Nein questions, 4 personality axes.
// Only "Ja" answers contribute to dimension score.

const RT_DIM_NAMES = ['Distanz', 'Nähe', 'Dauer', 'Wechsel'];
// Questions that map to each dimension (Ja = +1, Nein = null)
const RT_DIM_QUESTIONS = {
  'Distanz': [1, 4, 11, 12, 22, 25, 29, 30, 35, 38, 45, 48],
  'Nähe':    [3, 8, 9, 16, 19, 23, 26, 32, 37, 43, 44, 46],
  'Dauer':   [2, 7, 10, 14, 17, 18, 24, 28, 34, 39, 41, 47],
  'Wechsel': [5, 6, 13, 15, 20, 21, 27, 31, 33, 36, 40, 42],
};

const RT_QUESTIONS = [
  { pos: 1,  text: 'Ich bleibe lieber innerlich distanziert zu anderen Menschen.' },
  { pos: 2,  text: 'Ich mache gern eine Aufgabe zu Ende.' },
  { pos: 3,  text: 'Ich kann gut mit Anderen mitfühlen.' },
  { pos: 4,  text: 'Ich bin ein guter Beobachter.' },
  { pos: 5,  text: 'Mir kommen häufig neue Ideen, ich bin gedanklich beweglich.' },
  { pos: 6,  text: 'Ich lasse mich schnell ablenken.' },
  { pos: 7,  text: 'Ich freue mich, wenn alles so bleibt, wie es ist.' },
  { pos: 8,  text: 'Es fällt mir leicht, für Andere da zu sein, ich bin dann nicht so wichtig.' },
  { pos: 9,  text: 'Ich höre gern zu und habe ein offenes Ohr für Andere.' },
  { pos: 10, text: 'Ich bin sehr verlässlich und gewissenhaft.' },
  { pos: 11, text: 'Ich nehme auch kleine Unterschiede und Zwischentöne wahr.' },
  { pos: 12, text: 'Ich fühle mich wohl und sicherer, wenn ich allein bin.' },
  { pos: 13, text: 'Schnell wechselnde, intensive Gefühle mag ich.' },
  { pos: 14, text: 'Bevor ich entscheide und handle, denke ich lange darüber nach.' },
  { pos: 15, text: 'Beschränkungen und Eingrenzungen mag ich nicht.' },
  { pos: 16, text: 'Aus Angst, andere zu verlieren, stimme ich häufig zu und sage ja.' },
  { pos: 17, text: 'Ich kontrolliere lieber als dass ich vertraue.' },
  { pos: 18, text: 'Aufträge erledige ich zuverlässig und hundertprozentig.' },
  { pos: 19, text: 'Ich setze mich nicht so gern durch gegen Andere.' },
  { pos: 20, text: 'Ich bin spontan, charmant und lebensfroh.' },
  { pos: 21, text: 'Meine Meinung kann ich schnell neuen Erfordernissen anpassen.' },
  { pos: 22, text: 'Fakten sind mir wichtiger als Bauchentscheidungen.' },
  { pos: 23, text: 'Ich lasse mich eher ausnutzen als mich durchzusetzen.' },
  { pos: 24, text: 'Auf mich kann man sich immer verlassen.' },
  { pos: 25, text: 'Ich bin öfter grüblerisch oder schlechter Stimmung.' },
  { pos: 26, text: 'Ich kann schnell Vertrauen aufbauen.' },
  { pos: 27, text: 'Ich habe keine Geduld und warte ungern.' },
  { pos: 28, text: 'Ich vermeide wenn möglich, unvorbereitet in Situationen zu gehen.' },
  { pos: 29, text: 'Ich fühle mich häufiger unsicher und bin ängstlich.' },
  { pos: 30, text: 'Sicher ist sicher – ist ein Motto von mir.' },
  { pos: 31, text: 'Ich lasse mich ungern auf eine Aussage "festnageln".' },
  { pos: 32, text: 'Wenn ich allein bin, fehlt mir die Nähe zu Anderen.' },
  { pos: 33, text: 'Ich bin eine Stimmungskanone, kann gut Andere unterhalten.' },
  { pos: 34, text: 'Ich werde ärgerlich, wenn sich Andere nicht an Regeln halten.' },
  { pos: 35, text: 'Ich bin guter Analytiker und erfasse schnell Zusammenhänge.' },
  { pos: 36, text: 'Ich mag es, wenn es erotisch "knistert".' },
  { pos: 37, text: 'Ich fühle mich eher schwermütig als locker und gut gelaunt.' },
  { pos: 38, text: 'Ich entscheide lieber rational als aus dem "Bauch heraus".' },
  { pos: 39, text: 'Ich bin sehr belastbar und halte Stress gut aus.' },
  { pos: 40, text: 'Ich bin in meiner Aufmerksamkeit eher sprunghaft.' },
  { pos: 41, text: 'Unklare und unsichere Situationen machen mich unsicher.' },
  { pos: 42, text: 'Ich freue mich mehr über Neues und Spannendes als über Routine.' },
  { pos: 43, text: 'Mich können Andere schnell auf ihre Seite ziehen.' },
  { pos: 44, text: 'Ich mag, wenn man in Harmonie miteinander ist.' },
  { pos: 45, text: 'Immer in Kontakt zu sein strengt mich an.' },
  { pos: 46, text: 'Auseinandersetzungen meide ich eher.' },
  { pos: 47, text: 'Ich bin zuverlässig und halte Versprechen wenn möglich ein.' },
  { pos: 48, text: 'Ich komme besser mit mir allein zurecht, als mit anderen.' },
];

async function seedRiemannThomann() {
  const tpl = await pool.query(
    `INSERT INTO questionnaire_templates (title, description, instructions, status)
     VALUES ($1,$2,$3,'published') RETURNING id`,
    [
      'Selbsteinschätzung nach Riemann-Thomann',
      'Misst Persönlichkeitsachsen in 4 Dimensionen: Distanz, Nähe, Dauer, Wechsel.',
      'Lesen Sie die Sätze durch und entscheiden Sie so spontan wie möglich, ob die Aussage auf Sie zutrifft (Ja) oder nicht (Nein). Fühlen Sie, wie Sie Situationen erleben — nicht danach, was attraktiv erscheint.',
    ],
  );
  const tplId = tpl.rows[0].id;

  const dimIdsByName = {};
  for (let i = 0; i < RT_DIM_NAMES.length; i++) {
    const d = await pool.query(
      `INSERT INTO questionnaire_dimensions (template_id, name, position) VALUES ($1,$2,$3) RETURNING id`,
      [tplId, RT_DIM_NAMES[i], i],
    );
    dimIdsByName[RT_DIM_NAMES[i]] = d.rows[0].id;
  }

  // Build a reverse lookup: question position → dimension id (for Ja option)
  const qPosToDimId = {};
  for (const [dimName, positions] of Object.entries(RT_DIM_QUESTIONS)) {
    for (const pos of positions) {
      qPosToDimId[pos] = dimIdsByName[dimName];
    }
  }

  for (const q of RT_QUESTIONS) {
    const r = await pool.query(
      `INSERT INTO questionnaire_questions (template_id, position, question_text, question_type)
       VALUES ($1,$2,$3,'ja_nein') RETURNING id`,
      [tplId, q.pos, q.text],
    );
    const qId = r.rows[0].id;
    await pool.query(
      `INSERT INTO questionnaire_answer_options (question_id, option_key, label, dimension_id, weight)
       VALUES ($1,'Ja','Ja',$2,1), ($1,'Nein','Nein',NULL,1)`,
      [qId, qPosToDimId[q.pos] ?? null],
    );
  }
}

// ── Inneres Funktionsmodell ───────────────────────────────────────
// 50 Likert-5 questions, 5 "Antreiber" dimensions.
// score = sum(answers) × 2. Thresholds: 60 = mittel, 80 = kritisch.

const IFM_DIM_NAMES = ['Sei perfekt!', 'Beeil dich!', 'Streng dich an!', 'Mach es allen recht!', 'Sei stark!'];
const IFM_DIM_QUESTIONS = {
  'Sei perfekt!':          [1, 8, 11, 13, 23, 24, 33, 38, 43, 47],
  'Beeil dich!':           [3, 12, 14, 19, 21, 27, 32, 39, 42, 48],
  'Streng dich an!':       [5, 6, 10, 18, 25, 29, 34, 37, 44, 50],
  'Mach es allen recht!':  [2, 7, 15, 17, 28, 30, 35, 36, 45, 46],
  'Sei stark!':            [4, 9, 16, 20, 22, 26, 31, 40, 41, 49],
};

const IFM_QUESTIONS = [
  { pos: 1,  text: 'Wann immer ich eine Arbeit mache, mache ich sie gründlich.' },
  { pos: 2,  text: 'Ich fühle mich verantwortlich, dass diejenigen, die mit mir zu tun haben, sich wohl fühlen.' },
  { pos: 3,  text: 'Ich bin ständig auf Trab.' },
  { pos: 4,  text: 'Anderen gegenüber zeige ich meine Schwächen nicht gerne.' },
  { pos: 5,  text: 'Wenn ich raste, roste ich.' },
  { pos: 6,  text: 'Häufig gebrauche ich den Satz: „Es ist schwierig, etwas so genau zu sagen".' },
  { pos: 7,  text: 'Ich sage oft mehr, als eigentlich nötig wäre.' },
  { pos: 8,  text: 'Es fällt mir schwer, Leute zu akzeptieren, die nicht genau sind.' },
  { pos: 9,  text: 'Es fällt mir schwer, Gefühle zu zeigen.' },
  { pos: 10, text: '„Nur nicht lockerlassen", ist meine Devise.' },
  { pos: 11, text: 'Wenn ich eine Meinung äußere, begründe ich sie auch.' },
  { pos: 12, text: 'Wenn ich einen Wunsch habe, erfülle ich ihn mir schnell.' },
  { pos: 13, text: 'Ich liefere einen Bericht erst ab, wenn ich ihn mehrere Male überarbeitet habe.' },
  { pos: 14, text: 'Leute, die „herumtrödeln", regen mich auf.' },
  { pos: 15, text: 'Es ist mir wichtig, von den anderen akzeptiert zu werden.' },
  { pos: 16, text: 'Ich habe eher eine harte Schale, aber einen weichen Kern.' },
  { pos: 17, text: 'Ich versuche oft herauszufinden, was andere von mir erwarten, um mich danach zu richten.' },
  { pos: 18, text: 'Leute, die unbekümmert in den Tag hineinleben, kann ich nur schwer verstehen.' },
  { pos: 19, text: 'Bei Diskussionen unterbreche ich oft die anderen.' },
  { pos: 20, text: 'Ich löse meine Probleme selber.' },
  { pos: 21, text: 'Aufgaben erledige ich möglichst rasch.' },
  { pos: 22, text: 'Im Umgang mit anderen bin ich auf Distanz bedacht.' },
  { pos: 23, text: 'Ich sollte viele Aufgaben noch besser erledigen.' },
  { pos: 24, text: 'Ich kümmere mich persönlich auch um nebensächliche Dinge.' },
  { pos: 25, text: 'Erfolge fallen nicht vom Himmel; ich muss sie hart erarbeiten.' },
  { pos: 26, text: 'Für dumme Fehler habe ich wenig Verständnis.' },
  { pos: 27, text: 'Ich schätze es, wenn andere auf meine Fragen rasch und bündig antworten.' },
  { pos: 28, text: 'Es ist mir wichtig, von anderen zu erfahren, ob ich meine Sache gut gemacht habe.' },
  { pos: 29, text: 'Wenn ich eine Aufgabe einmal begonnen habe, führe ich sie auch zu Ende.' },
  { pos: 30, text: 'Ich stelle meine Wünsche und Bedürfnisse zugunsten anderer Personen zurück.' },
  { pos: 31, text: 'Ich bin anderen gegenüber oft hart, um von ihnen nicht verletzt zu werden.' },
  { pos: 32, text: 'Ich trommle oft ungeduldig mit den Fingern auf den Tisch.' },
  { pos: 33, text: 'Beim Erklären von Sachverhalten verwende ich gerne die klare Aufzählung: Erstens..., zweitens..., drittens...' },
  { pos: 34, text: 'Ich glaube, dass die meisten Dinge nicht so einfach sind, wie viele meinen.' },
  { pos: 35, text: 'Es ist mir unangenehm, andere Leute zu kritisieren.' },
  { pos: 36, text: 'Bei Diskussionen nicke ich häufig mit dem Kopf.' },
  { pos: 37, text: 'Ich strenge mich an, um meine Ziele zu erreichen.' },
  { pos: 38, text: 'Mein Gesichtsausdruck ist eher ernst.' },
  { pos: 39, text: 'Ich bin nervös.' },
  { pos: 40, text: 'So schnell kann mich nichts erschüttern.' },
  { pos: 41, text: 'Ich sage oft: „Macht mal vorwärts."' },
  { pos: 42, text: 'Ich sage oft: „Genau", „exakt", „klar", „logisch" o.Ä.' },
  { pos: 43, text: 'Ich sage oft: „Das verstehe ich nicht ..."' },
  { pos: 44, text: 'Ich sage eher: „Könnten Sie es nicht einmal versuchen?" als: „Versuchen Sie es einmal."' },
  { pos: 45, text: 'Ich bin diplomatisch.' },
  { pos: 46, text: 'Ich versuche, die an mich gestellten Erwartungen zu übertreffen.' },
  { pos: 47, text: 'Beim Telefonieren bearbeite ich nebenbei oft noch Akten o.Ä.' },
  { pos: 48, text: '„Auf die Zähne beißen" heißt meine Devise.' },
  { pos: 49, text: 'Ich komme besser mit mir allein zurecht, als mit anderen.' },
  { pos: 50, text: 'Trotz enormer Anstrengung will mir vieles einfach nicht gelingen.' },
];

async function seedInneresFunktionsmodell() {
  const tpl = await pool.query(
    `INSERT INTO questionnaire_templates (title, description, instructions, status)
     VALUES ($1,$2,$3,'published') RETURNING id`,
    [
      'Inneres Funktionsmodell (Kahler/Caspers)',
      'Misst die Ausprägung von 5 inneren Antreibern auf einer Skala bis 100.',
      'Beantworten Sie die Aussagen mit Hilfe der Bewertungsskala 1–5, so wie Sie sich im Moment selbst sehen. Die Aussage trifft auf mich zu: 1 = gar nicht, 2 = kaum, 3 = etwas, 4 = ziemlich, 5 = voll und ganz. Bitte antworten Sie möglichst spontan und seien Sie ehrlich zu sich selbst.',
    ],
  );
  const tplId = tpl.rows[0].id;

  const dimIdsByName = {};
  for (let i = 0; i < IFM_DIM_NAMES.length; i++) {
    const d = await pool.query(
      `INSERT INTO questionnaire_dimensions
       (template_id, name, position, threshold_mid, threshold_high, score_multiplier)
       VALUES ($1,$2,$3,60,80,2) RETURNING id`,
      [tplId, IFM_DIM_NAMES[i], i],
    );
    dimIdsByName[IFM_DIM_NAMES[i]] = d.rows[0].id;
  }

  const qPosToDimId = {};
  for (const [dimName, positions] of Object.entries(IFM_DIM_QUESTIONS)) {
    for (const pos of positions) {
      qPosToDimId[pos] = dimIdsByName[dimName];
    }
  }

  for (const q of IFM_QUESTIONS) {
    const r = await pool.query(
      `INSERT INTO questionnaire_questions (template_id, position, question_text, question_type)
       VALUES ($1,$2,$3,'likert_5') RETURNING id`,
      [tplId, q.pos, q.text],
    );
    const qId = r.rows[0].id;
    for (const val of ['1','2','3','4','5']) {
      await pool.query(
        `INSERT INTO questionnaire_answer_options (question_id, option_key, label, dimension_id, weight)
         VALUES ($1,$2,$3,$4,1)`,
        [qId, val, val, qPosToDimId[q.pos] ?? null],
      );
    }
  }
}

// Main
(async () => {
  try {
    await seedIfAbsent('Konflikttypen-Fragebogen (Thomas/Kilmann)', seedThomasKilmann);
    await seedIfAbsent('Selbsteinschätzung nach Riemann-Thomann', seedRiemannThomann);
    await seedIfAbsent('Inneres Funktionsmodell (Kahler/Caspers)', seedInneresFunktionsmodell);
    console.log('\nAll instruments seeded successfully.');
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
