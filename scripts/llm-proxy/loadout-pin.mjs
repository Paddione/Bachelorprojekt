// scripts/llm-proxy/loadout-pin.mjs
// Loadout-Pin: waehrend ein Pin gehalten wird, duerfen nur sein Besitzer
// Loadouts starten und stoppen. Gedacht fuer lange Laeufe (Brain-Ingest), die
// sonst mitten drin ihr Backend verlieren, weil ein UI-Klick oder eine andere
// Session das Loadout wechselt.  [T013593]
//
// ABGRENZUNG ZU gpu-lock.mjs: der GPU-Lock sagt "die GPU ist fuer ein Training
// belegt, alle lokalen GPU-Backends sind tabu" und nimmt sie per drainingKinds
// aus dem Routing. Der Pin aendert das Routing NICHT — er regelt nur, wer
// wechseln darf. Die Liveness-Regeln sind bewusst kopiert statt geteilt: ein
// gemeinsamer Helper muesste beide Bedeutungen tragen und waere genau dort
// missverstaendlich, wo Fail-closed-Verhalten eindeutig sein muss.
import { readFileSync, existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const DEFAULT_PIN_FILE = '/tmp/loadout-pin.json';

/** Gibt den Pin-Datei-Pfad zurueck (ueberschreibbar fuer Tests). */
export function pinFilePath() {
  return process.env.GPU_PIN_FILE || DEFAULT_PIN_FILE;
}

function pinError(status, code, message) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

/**
 * Pin-Zustand: { held, slug, pid, reason, started_at, token }.
 *
 * Fail-closed: unlesbare/unparsbare Datei oder fehlende PID → held=true.
 * Tote PID → Pin verworfen und Datei entfernt, sonst friert ein abgestuerzter
 * Ingest die Modellwahl dauerhaft ein.
 */
export function evaluatePin(pinFile = pinFilePath()) {
  try {
    if (!existsSync(pinFile)) return { held: false };

    let data;
    try {
      data = JSON.parse(readFileSync(pinFile, 'utf8'));
    } catch {
      console.warn(`[loadout-pin] ${pinFile} nicht parsbar — gilt als gehalten (fail-closed).`);
      return { held: true, unreadable: true };
    }

    const pid = data?.pid;
    if (!pid || typeof pid !== 'number') {
      console.warn(`[loadout-pin] ${pinFile} ohne gueltige PID — gilt als gehalten (fail-closed).`);
      return { held: true, invalidPid: true };
    }

    try {
      process.kill(pid, 0);
    } catch (err) {
      // Nur ESRCH heisst tot. EPERM bedeutet: der Prozess EXISTIERT, gehoert
      // nur nicht uns — ein lebender Pin, der fail-open verworfen wuerde.
      if (err?.code === 'ESRCH') {
        console.log(`[loadout-pin] Pin-PID ${pid} nicht mehr aktiv — Pin verworfen.`);
        try { unlinkSync(pinFile); } catch { /* Rennbedingung mit release ok */ }
        return { held: false };
      }
      console.warn(`[loadout-pin] Pin-PID ${pid} nicht pruefbar (${err?.code ?? err?.message}) — gilt als gehalten.`);
      return { held: true, unverifiedPid: true };
    }

    return {
      held: true,
      slug: data.slug || '?',
      pid,
      reason: data.reason || '?',
      started_at: data.started_at || '?',
      token: data.token || null,
    };
  } catch (err) {
    console.warn(`[loadout-pin] ${pinFile} nicht lesbar: ${err.message} — gilt als gehalten (fail-closed).`);
    return { held: true, unreadable: true };
  }
}

/**
 * Darf diese Anfrage ein Loadout starten oder stoppen?
 * → { allowed:true } oder { allowed:false, status:423, code, message, slug, pid }
 *
 * Die Meldung nennt Slug und Besitzer-PID: der Operator muss sehen, WER haelt,
 * nicht nur DASS etwas haelt.
 */
export function pinGuard(pin, providedToken) {
  if (!pin?.held) return { allowed: true };
  if (pin.token && providedToken && providedToken === pin.token) return { allowed: true };

  const who = pin.unreadable || pin.invalidPid
    ? 'ein unlesbarer Pin'
    : `'${pin.slug}' (pid ${pin.pid})`;
  return {
    allowed: false,
    status: 423,
    code: 'locked_by_pin',
    message: `Loadout-Wechsel gesperrt: ${who} haelt den Pin. `
      + `Der Besitzer loest ihn mit DELETE /admin/loadouts/pin.`,
    slug: pin.slug ?? null,
    pid: pin.pid ?? null,
  };
}

/**
 * Pin setzen. Haelt bereits ein fremder lebender Pin, wirft die Funktion mit
 * status 409; ein toter Pin steht dem Erwerb nicht im Weg.
 */
export function acquirePin(pinFile, { slug, pid, reason }) {
  const current = evaluatePin(pinFile);
  if (current.held) {
    throw pinError(409, 'pin_held',
      `Ein Pin auf '${current.slug ?? '?'}' (pid ${current.pid ?? '?'}) wird bereits gehalten.`);
  }
  const entry = {
    slug, pid, reason: reason || '?',
    started_at: new Date().toISOString(),
    token: randomUUID(),
  };
  writeFileSync(pinFile, JSON.stringify(entry));
  return entry;
}

/** Pin loesen. Ohne passendes Token 423; ohne Pin ein No-op. */
export function releasePin(pinFile, token) {
  const current = evaluatePin(pinFile);
  if (!current.held) return;
  if (current.token && token !== current.token) {
    throw pinError(423, 'locked_by_pin', 'Falsches Pin-Token — der Pin bleibt bestehen.');
  }
  try { unlinkSync(pinFile); } catch { /* schon weg ist auch gut */ }
}
