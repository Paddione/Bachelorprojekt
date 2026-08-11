## Task 3: write-guard-Besitzmodell — SID-Parität + Meldung mit Quelle (T003131)

**Purpose:** Der SID-basierte Besitz im worktree-write-guard wird in opencode-Sessions
korrekt aufgelöst (SID-Parität zu agent-lock.sh) und die Besitz-Meldung sagt, WOHER der
Besitz stammt, damit sie nicht als Eigenbesitz des aufrufenden Akteurs gelesen wird. Die
Grenze des Modells (Subagenten einer Session sind nicht unterscheidbar) bleibt bewusste
Gegenentscheidung — wird aber präzise benannt und per Test abgesichert.

**Files:**
- `scripts/hooks/worktree-write-guard.sh`
- `scripts/agent-lock.sh`

**Steps:**

### Step 1: `_my_sid`-Parität in `scripts/hooks/worktree-write-guard.sh`

- `_my_sid` (Zeile 89-97): die Env-Reihenfolge von `scripts/agent-lock.sh::_my_sid`
  (Zeile 22-41) spiegeln — `CLAUDE_CODE_SESSION_ID`, `CLAUDE_SESSION_ID`,
  **`OPENCODE_SESSION_ID`** (fehlt aktuell im Guard!), dann `AGENT_LOCK_SID`, dann der
  `ps -o sess=`-Fallback mit WARNUNG.
- Wirkung: In opencode-Sessions (setzen `OPENCODE_SESSION_ID`) erkennt der Guard eigene
  Claims wieder, statt auf den driftenden Unix-SID-Fallback zu fallen und die eigenen
  Worktrees als fremd zu melden.

### Step 2: Besitz-Meldung mit Quellenangabe

- Die Meldezeile (Zeile 167): "Dieser Session (SID $SID) gehoeren — ggf. ueber Subagenten:"
  → "Claims mit SID $SID (eigene Session UND deren Subagenten) — Besitz aus
  agent-locks/*.json (owner_sid):" — die Quelle (Lock-Dateien, owner_sid-Match) steht in
  der Meldung, nicht nur der SID-Wert.
- Erklär-Kommentar über Regel 2 (Zeile 153-157) bleibt als bewusste Gegenentscheidung zu
  T002412 stehen; er nennt zusätzlich T003102 als dieselbe Annahme ("eine Session = eine
  SID") und die hier gewählte Grenze (Schutz gegen fremde Sessions, nicht gegen parallele
  Subagenten einer Session).
- Dedup (Zeile 138-145, aus T003116) NICHT anfassen — nur per Test absichern (P4).

### Step 3: `scripts/agent-lock.sh` — keine Verhaltensänderung, Konsistenz festigen

- Kein Logik-Eingriff: `owner_sid`-Schreibpfad und `_my_sid` (Zeile 22-41) sind SSOT und
  korrekt; der Guard wird an sie angeglichen (Step 1), nicht umgekehrt.
- Nur falls der Diff aus Step 1 eine Inkompatibilität zeigt (z. B. unterschiedliche
  Default-Reihenfolge): Kommentar-Zeiger in beiden Dateien aufeinander richten
  ("SID-Parität: Änderungen hier in scripts/hooks/worktree-write-guard.sh spiegeln").

**Verify:**
1. `OPENCODE_SESSION_ID=test-session bash -c 'source scripts/hooks/worktree-write-guard.sh
   2>/dev/null; _my_sid'`-Analogie: Guard und agent-lock.sh liefern für dieselbe Env
   dieselbe SID (Vergleich über den Lock-Schreibpfad: claim → guard erkennt eigenen
   Worktree als eigen, schreibt ohne Block)
2. Fixture: branch- + worktree-Scope-Lock auf denselben Pfad, fremder TARGET außerhalb →
   Meldung enthält "Claims mit SID" + "agent-locks/*.json" + den Worktree genau EINMAL
3. WORKTREE_GUARD_BYPASS=1 bleibt der Notausgang (unverändert)
4. `bash scripts/plan-lint.sh openspec/changes/batch-git-worktree-integrity/tasks.md` → PASS
5. `task test:changed` grün (bestehende write-guard-/agent-lock-Suite)
