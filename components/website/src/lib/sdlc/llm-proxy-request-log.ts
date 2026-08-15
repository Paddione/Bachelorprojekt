// Lesezugriff auf den Dispatch-Mitschnitt (tickets.llm_proxy_request_log, T003277).
// Reine DB-Schicht ohne Importe aus API-/Route-Modulen (S2-safe).
//
// DIE TRENNUNG VON LISTE UND DETAIL IST HIER DER GANZE PUNKT: die Liste waehlt
// die Body-Spalten NICHT aus. Ein Panel-Refresh ueber wenige Dutzend Zeilen
// zoege sonst zweistellige MB, weil jede Zeile bis zu 2x 256 KiB Text traegt.
import { pool } from '../website-db';

/** Kopfdaten eines Mitschnitts — alles ausser den Bodies. */
export interface DispatchHead {
  id: number;
  ts: string;
  backend: string;
  requested_model: string | null;
  served_model: string | null;
  subpath: string;
  http_status: number | null;
  duration_ms: number | null;
  queue_wait_ms: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  streamed: boolean;
  stream_incomplete: boolean;
  truncated: boolean;
  original_bytes: number | null;
  slot_id: number | null;
  dispatch_ticket: string | null;
  dispatch_partial: string | null;
}

/** Ein Mitschnitt mit den vollen Bodies — nur fuer die Detailansicht. */
export interface DispatchDetail extends DispatchHead {
  request_body: string | null;
  response_body: string | null;
}

/** Spalten der Liste. Bewusst einzeln benannt statt `*`: ein Stern haette die
 *  Bodies mitgezogen, und genau das ist der teure Fehler. */
const HEAD_COLS = `id, ts, backend, requested_model, served_model, subpath, http_status,
  duration_ms, queue_wait_ms, prompt_tokens, completion_tokens, streamed, stream_incomplete,
  truncated, original_bytes, slot_id, dispatch_ticket, dispatch_partial`;

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

export interface ListOptions {
  limit?: number;
  /** Nur Mitschnitte dieses Vorgangs. */
  ticket?: string | null;
}

export interface ListResult {
  items: DispatchHead[];
  /** Die tatsaechlich angewandte Obergrenze — damit die Anzeige eine gekappte
   *  Liste als solche kennzeichnen kann statt sie fuer vollstaendig zu halten. */
  limit: number;
}

export async function listDispatches(opts: ListOptions = {}): Promise<ListResult> {
  const limit = Math.min(Math.max(Number(opts.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const ticket = opts.ticket?.trim() || null;

  const { rows } = await pool.query(
    `SELECT ${HEAD_COLS}
       FROM tickets.llm_proxy_request_log
      WHERE ($1::text IS NULL OR dispatch_ticket = $1)
      ORDER BY ts DESC, id DESC
      LIMIT $2`,
    [ticket, limit],
  );
  return { items: rows as DispatchHead[], limit };
}

export async function getDispatch(id: number): Promise<DispatchDetail | null> {
  const { rows } = await pool.query(
    `SELECT ${HEAD_COLS}, request_body, response_body
       FROM tickets.llm_proxy_request_log
      WHERE id = $1`,
    [id],
  );
  return (rows[0] as DispatchDetail) ?? null;
}
