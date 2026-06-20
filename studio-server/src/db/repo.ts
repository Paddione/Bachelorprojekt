import type { Pool, PoolClient } from 'pg';

export interface ClientRow {
  id: string;
  name: string;
  initials: string;
  since: string;
  lang: string;
  category: string;
  created_at: string;
}

export interface ProfileField {
  key: string;
  label: string;
  value: string;
  type: 'text' | 'textarea';
  required: boolean;
  active: boolean;
}

export interface SessionRow {
  id: string;
  client_id: string;
  title: string;
  status: 'aktiv' | 'pausiert' | 'fertig';
  current_level: number;
  template_of: string | null;
  lang: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  paused_at: string | null;
}

export interface LevelRow {
  session_id: string;
  level_no: number;
  prompt: string;
  prompt_is_default: boolean;
  answer: string | null;
  notes: string | null;
  done: boolean;
  clipboard: Array<{ id: string; text: string }>;
  generated_at: string | null;
}

export interface StandardLevel {
  level_no: number;
  name: string;
  goal: string;
  prompt: string;
}

export interface StandardProfileField extends ProfileField {
  sort: number;
}

export function makeRepo(pool: Pool) {
  return {
    async listClients(): Promise<ClientRow[]> {
      const { rows } = await pool.query(
        `SELECT id, name, initials, since, lang, category, created_at
         FROM studio.clients ORDER BY created_at DESC`,
      );
      return rows;
    },

    async getClient(id: string): Promise<ClientRow | null> {
      const { rows } = await pool.query(
        `SELECT id, name, initials, since, lang, category, created_at
         FROM studio.clients WHERE id = $1`, [id],
      );
      return rows[0] ?? null;
    },

    async createClient(input: { name: string; initials: string; since: string; lang: string; category: string }): Promise<ClientRow> {
      const { rows } = await pool.query(
        `INSERT INTO studio.clients (name, initials, since, lang, category)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id, name, initials, since, lang, category, created_at`,
        [input.name, input.initials, input.since, input.lang, input.category],
      );
      return rows[0];
    },

    async updateClient(id: string, input: Partial<{ name: string; initials: string; since: string; lang: string; category: string }>): Promise<ClientRow | null> {
      const fields: string[] = [];
      const vals: any[] = [];
      let i = 1;
      for (const k of ['name', 'initials', 'since', 'lang', 'category'] as const) {
        if (input[k] !== undefined) {
          fields.push(`${k} = $${i++}`);
          vals.push(input[k]);
        }
      }
      if (fields.length === 0) return this.getClient(id);
      vals.push(id);
      const { rows } = await pool.query(
        `UPDATE studio.clients SET ${fields.join(', ')} WHERE id = $${i}
         RETURNING id, name, initials, since, lang, category, created_at`,
        vals,
      );
      return rows[0] ?? null;
    },

    async getProfile(clientId: string): Promise<ProfileField[] | null> {
      const { rows } = await pool.query(
        `SELECT fields FROM studio.profiles WHERE client_id = $1`, [clientId],
      );
      if (!rows[0]) return null;
      return Array.isArray(rows[0].fields) ? rows[0].fields : [];
    },

    async upsertProfile(clientId: string, fields: ProfileField[]): Promise<ProfileField[]> {
      const { rows } = await pool.query(
        `INSERT INTO studio.profiles (client_id, fields) VALUES ($1, $2::jsonb)
         ON CONFLICT (client_id) DO UPDATE SET fields = EXCLUDED.fields, updated_at = now()
         RETURNING fields`,
        [clientId, JSON.stringify(fields)],
      );
      return Array.isArray(rows[0].fields) ? rows[0].fields : [];
    },

    async listSessions(clientId?: string): Promise<SessionRow[]> {
      const { rows } = clientId
        ? await pool.query(
            `SELECT id, client_id, title, status, current_level, template_of, lang,
                    created_at, updated_at, completed_at, paused_at
             FROM studio.sessions WHERE client_id = $1 ORDER BY updated_at DESC`, [clientId],
          )
        : await pool.query(
            `SELECT id, client_id, title, status, current_level, template_of, lang,
                    created_at, updated_at, completed_at, paused_at
             FROM studio.sessions ORDER BY updated_at DESC`,
          );
      return rows;
    },

    async getSession(id: string): Promise<{ session: SessionRow; levels: LevelRow[] } | null> {
      const { rows: srows } = await pool.query(
        `SELECT id, client_id, title, status, current_level, template_of, lang,
                created_at, updated_at, completed_at, paused_at
         FROM studio.sessions WHERE id = $1`, [id],
      );
      if (!srows[0]) return null;
      const { rows: lrows } = await pool.query(
        `SELECT session_id, level_no, prompt, prompt_is_default, answer, notes, done, clipboard, generated_at
         FROM studio.session_levels WHERE session_id = $1 ORDER BY level_no ASC`, [id],
      );
      return { session: srows[0], levels: lrows };
    },

    async createSession(input: { clientId: string; title: string; lang: string; fromTemplate?: string }): Promise<{ id: string; session: SessionRow; levels: LevelRow[] }> {
      const c: PoolClient = await pool.connect();
      try {
        await c.query('BEGIN');
        const { rows } = await c.query(
          `INSERT INTO studio.sessions (client_id, title, lang, template_of)
           VALUES ($1,$2,$3,$4)
           RETURNING id, client_id, title, status, current_level, template_of, lang,
                     created_at, updated_at, completed_at, paused_at`,
          [input.clientId, input.title, input.lang, input.fromTemplate ?? null],
        );
        const session = rows[0];
        if (input.fromTemplate) {
          await c.query(
            `INSERT INTO studio.session_levels (session_id, level_no, prompt, prompt_is_default, answer, notes, done, clipboard)
             SELECT $1, level_no, prompt, prompt_is_default, answer, notes, done, clipboard
             FROM studio.session_levels WHERE session_id = $2`,
            [session.id, input.fromTemplate],
          );
        } else {
          const { rows: stds } = await c.query(
            `SELECT level_no, prompt FROM studio.standard_levels ORDER BY level_no`,
          );
          for (const s of stds) {
            await c.query(
              `INSERT INTO studio.session_levels (session_id, level_no, prompt, prompt_is_default)
               VALUES ($1, $2, $3, true)
               ON CONFLICT (session_id, level_no) DO NOTHING`,
              [session.id, s.level_no, s.prompt],
            );
          }
        }
        await c.query('COMMIT');
        const full = await this.getSession(session.id);
        return { id: session.id, session: full!.session, levels: full!.levels };
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      } finally {
        c.release();
      }
    },

    async updateSessionStatus(id: string, status: 'aktiv' | 'pausiert' | 'fertig'): Promise<SessionRow | null> {
      const { rows } = await pool.query(
        `UPDATE studio.sessions
         SET status = $2,
             paused_at = CASE WHEN $2 = 'pausiert' THEN now() ELSE NULL END,
             completed_at = CASE WHEN $2 = 'fertig' THEN now() ELSE NULL END,
             updated_at = now()
         WHERE id = $1
         RETURNING id, client_id, title, status, current_level, template_of, lang,
                   created_at, updated_at, completed_at, paused_at`,
        [id, status],
      );
      return rows[0] ?? null;
    },

    async upsertLevel(sessionId: string, levelNo: number, input: Partial<{
      prompt: string; promptIsDefault: boolean; answer: string; notes: string;
      done: boolean; clipboard: Array<{ id: string; text: string }>;
    }>): Promise<LevelRow | null> {
      const fields: string[] = [];
      const vals: any[] = [];
      let i = 1;
      if (input.prompt !== undefined) { fields.push(`prompt = $${i++}`); vals.push(input.prompt); }
      if (input.promptIsDefault !== undefined) { fields.push(`prompt_is_default = $${i++}`); vals.push(input.promptIsDefault); }
      if (input.answer !== undefined) { fields.push(`answer = $${i++}`); vals.push(input.answer); }
      if (input.notes !== undefined) { fields.push(`notes = $${i++}`); vals.push(input.notes); }
      if (input.done !== undefined) { fields.push(`done = $${i++}`); vals.push(input.done); }
      if (input.clipboard !== undefined) { fields.push(`clipboard = $${i++}::jsonb`); vals.push(JSON.stringify(input.clipboard)); }
      if (fields.length === 0) {
        const { rows } = await pool.query(
          `SELECT session_id, level_no, prompt, prompt_is_default, answer, notes, done, clipboard, generated_at
           FROM studio.session_levels WHERE session_id = $1 AND level_no = $2`,
          [sessionId, levelNo],
        );
        return rows[0] ?? null;
      }
      fields.push('generated_at = CASE WHEN $' + i + "::text = 'answer' THEN now() ELSE generated_at END");
      vals.push(input.answer !== undefined ? 'answer' : '');
      vals.push(sessionId); vals.push(levelNo);
      const { rows } = await pool.query(
        `UPDATE studio.session_levels SET ${fields.join(', ')}
         WHERE session_id = $${i++} AND level_no = $${i++}
         RETURNING session_id, level_no, prompt, prompt_is_default, answer, notes, done, clipboard, generated_at`,
        vals,
      );
      return rows[0] ?? null;
    },

    async getStandardLevels(): Promise<StandardLevel[]> {
      const { rows } = await pool.query(
        `SELECT level_no, name, goal, prompt FROM studio.standard_levels ORDER BY level_no`,
      );
      return rows.map((r: any) => ({ ...r, no: String(r.level_no).padStart(2, '0') }));
    },

    async setStandardLevels(rows: StandardLevel[]): Promise<StandardLevel[]> {
      const c: PoolClient = await pool.connect();
      try {
        await c.query('BEGIN');
        await c.query('DELETE FROM studio.standard_levels');
        for (const r of rows) {
          await c.query(
            `INSERT INTO studio.standard_levels (level_no, name, goal, prompt) VALUES ($1,$2,$3,$4)`,
            [r.level_no, r.name, r.goal, r.prompt],
          );
        }
        await c.query('COMMIT');
        return this.getStandardLevels();
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      } finally {
        c.release();
      }
    },

    async getStandardProfileFields(): Promise<StandardProfileField[]> {
      const { rows } = await pool.query(
        `SELECT key, label, value, type, required, active, sort FROM studio.standard_profile_fields ORDER BY sort, key`,
      );
      return rows;
    },

    async setStandardProfileFields(rows: StandardProfileField[]): Promise<StandardProfileField[]> {
      const c: PoolClient = await pool.connect();
      try {
        await c.query('BEGIN');
        await c.query('DELETE FROM studio.standard_profile_fields');
        for (const r of rows) {
          await c.query(
            `INSERT INTO studio.standard_profile_fields (key, label, value, type, required, active, sort) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [r.key, r.label, r.value, r.type, r.required, r.active, r.sort],
          );
        }
        await c.query('COMMIT');
        return this.getStandardProfileFields();
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      } finally {
        c.release();
      }
    },
  };
}

export type Repo = ReturnType<typeof makeRepo>;
