// tests/unit/cockpit-daemon-injection.test.ts
// Ticket: T002505 — unauthentifizierte Command Injection im Cockpit-Daemon
//
// Pruefmodus (Test-Resultats-Konvention T002448-M4): ERGEBNIS-basiert. Die Tests
// rufen exec() und die Source-Funktionen wirklich auf und pruefen, WAS
// herauskommt — kein grep nach 'execFile' im Quelltext. Ob eine Shell im Spiel
// ist, laesst sich am Ergebnis ablesen: eine Shell expandiert `$(...)`, execFile
// reicht es als Literal durch.
//
// Hintergrund: `exec()` war ein Wrapper um child_process.exec, also /bin/sh.
// Zwei Sinks interpolierten Query-Parameter direkt in den Kommandostring:
//   sources/kubectl.ts     `-n ${namespace}`   <- ?namespace= von /api/admin/cluster/pods-list
//   sources/ticket-mcp.ts  `get ${extId}`      <- ?extId=     von /api/admin/cockpit/feature
// Beide Routen haengen an KEINER Auth-Middleware (nur die zwei POST-Stubs sind
// token-geschuetzt), die Injection brauchte also kein Token. Ausgefuehrt wurde
// mit cwd = Repo-Root und verfuegbaren `kubectl --context fleet`-Credentials.

// Bewusst KEIN Import von server.ts: der Daemon zieht `hono` und
// `@hono/node-server`, und beide sind in keiner package.json des Repos
// deklariert — er wird ad hoc per `npx tsx` gestartet. Ein Import haette diese
// Suite in CI unlauffaehig gemacht. Die Route-Ebene deckt deshalb
// tests/spec/sdlc-cockpit/daemon-token-endpoint-removed.bats ab.
import { describe, it, expect } from 'vitest';
import { exec } from '../../.lavish/kit/daemon/lib/exec';
import { buildPodsArgs, isValidNamespace } from '../../.lavish/kit/daemon/sources/kubectl';
import { isValidExtId } from '../../.lavish/kit/daemon/sources/ticket-mcp';

describe('exec() startet keine Shell', () => {
  it('reicht Shell-Metazeichen als Literal durch, statt sie zu expandieren', async () => {
    // POSITIV-ANKER: der gewoehnliche Fall muss funktionieren. Waere exec()
    // schlicht kaputt, wuerde die Negativ-Aussage unten trivial gelten.
    const plain = await exec('echo', ['hallo']);
    expect(plain.ok).toBe(true);
    expect(plain.stdout).toBe('hallo');

    // Der eigentliche Gegenstand: eine Shell wuerde $(id) ausfuehren und die
    // uid-Zeile liefern. execFile reicht die Zeichen unveraendert weiter.
    const injected = await exec('echo', ['$(id)']);
    expect(injected.ok).toBe(true);
    expect(injected.stdout).toBe('$(id)');
    expect(injected.stdout).not.toMatch(/uid=\d+/);
  });

  it('behandelt ein Semikolon als Datenzeichen, nicht als Kommandotrenner', async () => {
    const r = await exec('echo', ['workspace; id']);
    expect(r.ok).toBe(true);
    expect(r.stdout).toBe('workspace; id');
    expect(r.stdout).not.toMatch(/uid=\d+/);
  });
});

describe('Namespace-Validierung (Sink 1: /api/admin/cluster/pods-list)', () => {
  it('akzeptiert gueltige Kubernetes-Namespaces', () => {
    // Positiv-Anker vor der Negativliste: die echten Namespaces des Repos.
    for (const ns of ['workspace', 'workspace-korczewski', 'kube-system', 'flux-system']) {
      expect(isValidNamespace(ns), ns).toBe(true);
    }
  });

  it('lehnt Shell-Metazeichen und Ueberlaenge ab', () => {
    for (const bad of [
      'workspace; id',
      'workspace$(id)',
      'workspace`id`',
      'workspace|id',
      'workspace && id',
      '../etc',
      'Workspace',            // Grossbuchstaben sind in K8s-Namen nicht zulaessig
      'a'.repeat(64),         // > 63 Zeichen
      '',
    ]) {
      expect(isValidNamespace(bad), JSON.stringify(bad)).toBe(false);
    }
  });

  it('baut argv mit dem Namespace als eigenem Element, nie interpoliert', () => {
    const withNs = buildPodsArgs('workspace');
    const i = withNs.indexOf('-n');
    expect(i).toBeGreaterThanOrEqual(0);
    // Eigenes argv-Element — kein '-n workspace' als ein String.
    expect(withNs[i + 1]).toBe('workspace');
    expect(withNs).not.toContain('-n workspace');

    // Ohne Namespace: -A, und kein leeres -n.
    const all = buildPodsArgs(undefined);
    expect(all).toContain('-A');
    expect(all).not.toContain('-n');
  });
});

describe('extId-Validierung (Sink 2: /api/admin/cockpit/feature)', () => {
  it('akzeptiert echte Ticket-IDs', () => {
    for (const id of ['T002505', 'T000001', 'T999999']) {
      expect(isValidExtId(id), id).toBe(true);
    }
  });

  it('lehnt alles ab, was keine Ticket-ID ist', () => {
    for (const bad of ['T002505; id', 'T002505$(id)', '../../etc/passwd', 'T2505', 'x'.repeat(40), '']) {
      expect(isValidExtId(bad), JSON.stringify(bad)).toBe(false);
    }
  });
});

describe('die Sink-Aufrufer bauen argv, keine Kommandostrings', () => {
  it('kubectl-argv enthaelt kein einziges Element mit einem Leerzeichen im Flag-Teil', () => {
    // Ein Element wie '-n workspace' waere das Symptom einer Interpolation:
    // execFile uebergibt es als EINEN Parameter, kubectl versteht ihn nicht,
    // und beim Zurueckbauen auf eine Shell waere es wieder injizierbar.
    for (const args of [buildPodsArgs('workspace'), buildPodsArgs(undefined)]) {
      const flagsWithSpaces = args.filter((a) => a.startsWith('-') && a.includes(' '));
      expect(flagsWithSpaces, JSON.stringify(args)).toEqual([]);
    }
  });
});
