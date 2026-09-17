---
ticket_id: T900220
plan_ref: openspec/changes/opencode-system-message-merge/tasks.md
status: active
date: 2026-09-17
---

# Design: opencode-system-message-merge

## Goals

- `llamacpp-local`-Anfragen tragen höchstens eine `system`-Nachricht an Position 0.
- Keine Wirkung auf andere Provider.

## Non-Goals

- Engine-Umschaltung, Modell-Aliase, Proxy.

## Decisions

1. **fetch-Wrap im `config`-Hook statt `experimental.chat.system.transform`.**
   Belegt mit opencode 1.18.31: Der Transform-Hook sah `n=1`, auf der Leitung
   standen trotzdem `system,system,user`. Der fetch-Wrap wirkt auf den
   tatsächlich gesendeten Body. Mit ihm antwortete `opencode run --agent
   qwen38-primary` im Repo korrekt.
2. **Zusammenführen statt Umbenennen zu `user`.** Der alte Proxy wandelte
   spätere `system`-Nachrichten in `user` um. Zusammenführen erhält die
   System-Semantik. Kosten: Eine `system`-Nachricht mitten im Verlauf verliert
   ihre Position. Laut Log schickt opencode nur Nachrichten am Anfang
   (Nutzerentscheidung 2026-09-17).
3. **Nur der Provider-Key `llamacpp-local`.** Er ist per Spec die einzige
   Definitionsstelle für FreeToken.
4. **Durchreichen bei allem Unerwarteten:** kein String-Body, kein JSON, kein
   `messages`-Array oder schon regelkonform. Das Plugin wirft nie selbst.
5. **Nur ein Modul-Export.** opencode behandelt jeden exportierten
   Funktionswert als Plugin, deshalb bleiben die Hilfsfunktionen intern.

## Testing

`tests/spec/llm-local-dev/system-message-merge.bats` lädt das Plugin per
`node --experimental-strip-types`, führt den `config`-Hook mit einem Stub-fetch
aus und prüft den gesendeten Body (Output-Verifikation). Live-Nachweis:
`opencode run --agent qwen38-primary` im Repo nach dem Sync.
