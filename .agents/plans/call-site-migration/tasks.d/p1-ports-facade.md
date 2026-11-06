# p1 — website/ports-Fassade (Impl, auth-adjacent zuerst)

## Ziel
`components/website/src/lib/ports/` als einzige erlaubte Import-Quelle für
externe Caller (`scripts/*`): Session/policy/content dahinter, DB- und
 seiten-Interna bleiben unsichtbar. Keine Verhaltensänderung — reine
Re-Export-Schicht über den W2-A-Seams (`auth.ts:260-420`).

## Schritte
1. `ports/session.ts`: `export type { SessionResolver }`,
   `DbSessionResolver`-Re-Export + `getSessionWithResolver`-Passthrough
   (per-request, bewusst OHNE Cache — wie W2-A-Seam definiert).
   KEIN DB-Pool-Export, KEIN `ensureSessionsTable`.
2. `ports/policy.ts`: `export { DefaultAdminPolicy }`,
   `AdminPolicy`-Typ + `isAdmin(session)`-Passthrough.
3. `ports/content.ts`: Re-Exports für P2-Bedarf —
   `chunkText` (chunking), `embedBatch` (embeddings),
   `classifyChunk/CLASSIFIER_VERSION/DEFAULT_MODEL` (coaching-classifier),
   `insertDraft` (coaching-db), `validateJsonEntries/ingestJsonChunks`
   (ingest-json-core), Merge-Helper (coaching-merge). Nur was P0 als
   Prod-Site bestätigt; kein Vorrats-Export.
4. `ports/index.ts`: Sammel-Re-Export + Doc-Kommentar (Verwendungsregel:
   externe Caller importieren AUSSCHLIESSLICH `lib/ports`, nie `lib/*`
   direkt — der Boundary-Test in p5 prüft exakt das).
5. Negativ-Test-Gedanke für p5 vormerken (nicht hier implementieren):
   `ports/session.ts` darf `db-pool` NICHT direkt importieren, nur Typen +
   `auth.ts`-Seams (statischer Assert im Boundary-Test).

## Gates (p1Done)
- `npm run typecheck` (Root, `tsc --build`) grün.
- `node` Smoke: `import('components/website/src/lib/ports/index.ts')`
  löst alle Exporte auf (je nach Runner via bestehender Website-Test-Konvention).
- `task test:changed` grün (keine Bestands-Tests gebrochen).
- S1: jede neue Datei < 900 Zeilen `.ts` (de facto < 100 erwartet).
