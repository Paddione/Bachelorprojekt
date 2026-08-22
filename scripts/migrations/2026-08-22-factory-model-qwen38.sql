-- Schwenkt das lokale Factory-Routing auf das Loadout qwen38-220k [T013434].
--
-- BEFUND, der diese Migration ausgeloest hat: tickets.provider_config fuehrte
-- fuer provider='llamacpp' ausschliesslich Zeilen mit model_id='gemma12-vision'
-- (source='*' fuer haiku/sonnet/cheap/flash sowie factory-implement/sonnet,
-- alle enabled, priority 0, updated_at 2026-08-18). scripts/factory/
-- route-provider.sh liest diese Tabelle und gewinnt damit gegen den Pin in
-- scripts/llm/loadouts.json (factory.model). Der Pin stand seinerseits auf
-- gemma26-throughput. Beide Modelle teilen mit qwen38-220k die exclusiveGroup
-- 'chat-gpu': jeder Factory-Dispatch stoppte also das Loadout, das die Factory
-- eigentlich nutzen soll, und factory_ask meldete 'no healthy backend',
-- solange qwen38 lief.
--
-- KONTEXT REICHT: groesster je protokollierter Prompt in
-- tickets.llm_proxy_request_log ist 6445 Token; das abgeloeste
-- gemma26-throughput fuhr gemessene 118016 ctx, qwen38-220k fuehrt 114688.
--   SELECT max(prompt_tokens) FROM tickets.llm_proxy_request_log;
--
-- Idempotent, gezielt nur auf die aktiven llamacpp-Zeilen. Andere Provider
-- (deepseek, anthropic, lmstudio) bleiben unberuehrt.
BEGIN;

UPDATE tickets.provider_config
   SET model_id   = 'qwen38-220k',
       base_url   = 'http://127.0.0.1:18235',
       updated_at = now()
 WHERE provider = 'llamacpp'
   AND enabled
   AND model_id <> 'qwen38-220k';

COMMIT;
