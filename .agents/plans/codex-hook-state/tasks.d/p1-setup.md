# p1 — setup-harnesses.sh

Target files: `scripts/langfuse/setup-harnesses.sh`.

### Task 1: hooks.state für den Langfuse-Stop-Hook

Im `codex)`-Zweig nach dem Plugin-Eintrag: die Sektion
`[hooks.state."tracing@codex-observability-plugin:hooks/hooks.json:stop:0:0"]` samt ihrer Schlüssel
(bis zur nächsten Zeile mit `[`) per `awk` entfernen und neu anhängen mit `enabled = true` und
`trusted_hash = "sha256:69a05cbfa6984ec5f1433343b45480d5239c119e7332ae863f9865edc2efec74"`.
Hash als Variable neben der gepinnten Version `v0.4.0`, Kommentar: Hash gilt nur für diese Version,
ein Plugin-Update erzwingt erneute Freigabe in codex.
