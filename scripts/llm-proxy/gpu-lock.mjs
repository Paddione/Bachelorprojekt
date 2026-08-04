// scripts/llm-proxy/gpu-lock.mjs
// Liest die GPU-Lock-Datei (von scripts/gpu-lock.sh geschrieben),
// prueft PID-Liveness und exportiert eine Funktion fuer discovery.mjs
// und server.mjs.  [T002628]
import { readFileSync, existsSync, unlinkSync } from 'node:fs';

const DEFAULT_LOCK_FILE = '/tmp/gpu-training-lock.json';

/**
 * Lock-Zustand: { held: true/false, pid, reason, started_at, drainingKinds }
 * drainingKinds: welche Backend-Kinds von diesem Lock betroffen sind.
 *
 * Fail-closed: unlesbare/unparsbare Datei → held=true.
 * Tote PID → Lock verworfen, Datei entfernt.
 */
export function evaluateLock(lockFile = DEFAULT_LOCK_FILE) {
  try {
    if (!existsSync(lockFile)) return { held: false };

    const raw = readFileSync(lockFile, 'utf8');
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      console.warn(`[gpu-lock] Lock-Datei ${lockFile} nicht parsbar — gilt als gehalten (fail-closed).`);
      return { held: true, unreadable: true };
    }

    const pid = data?.pid;
    if (!pid || typeof pid !== 'number') {
      console.warn(`[gpu-lock] Lock-Datei ${lockFile} ohne gueltige PID — gilt als gehalten (fail-closed).`);
      return { held: true, invalidPid: true };
    }

    // PID-Liveness pruefen
    try {
      process.kill(pid, 0);
    } catch (err) {
      // Nur ESRCH (kein solcher Prozess) heisst "tot". EPERM bedeutet: der
      // Prozess EXISTIERT, gehoert nur nicht uns — ein lebender Lock, der
      // fail-open verworfen wuerde (T002628 fail-closed-Philosophie). [P1-1]
      if (err?.code === 'ESRCH') {
        console.log(`[gpu-lock] Lock-PID ${pid} nicht mehr aktiv — Lock verworfen.`);
        try { unlinkSync(lockFile); } catch { /* Rennbedingung mit release ok */ }
        return { held: false };
      }
      console.warn(`[gpu-lock] Lock-PID ${pid} nicht pruefbar (${err?.code ?? err?.message}) — gilt als gehalten (fail-closed).`);
      return { held: true, unverifiedPid: true };
    }

    return {
      held: true,
      pid,
      reason: data.reason || '?',
      started_at: data.started_at || '?',
      // Betroffen sind lokale GPU-Backends (llamacpp) und LM Studio.
      // Entscheidung ueber kind, nicht ueber Namen (T002628-spec).
      drainingKinds: ['llamacpp', 'lmstudio'],
    };
  } catch (err) {
    // Datei nicht lesbar (Rechte, defekter Symlink, ...) → fail-closed
    console.warn(`[gpu-lock] Lock-Datei ${lockFile} nicht lesbar: ${err.message} — gilt als gehalten (fail-closed).`);
    return { held: true, unreadable: true };
  }
}

/** Gibt den Lock-Datei-Pfad zurueck (fuer server.mjs /admin/state). */
export function lockFilePath() {
  return process.env.GPU_LOCK_FILE || DEFAULT_LOCK_FILE;
}
