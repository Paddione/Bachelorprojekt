-- Patch: Entfernt alle konkreten Preisangaben aus service_config.
-- Betrifft: pricing.unit "statt X €" und pricing.price-Felder mit Eurobeträgen.
-- Idempotent: WHERE-Bedingungen verhindern no-op-Schreibzugriffe.

-- (1) "statt X €" aus unit-Feldern entfernen
UPDATE service_config
SET services_json = replace(services_json::text, '"statt 300 €"', '""')::jsonb,
    updated_at    = now()
WHERE brand = 'mentolder'
  AND services_json::text LIKE '%statt 300 €%';

UPDATE service_config
SET services_json = replace(services_json::text, '"statt 900 €"', '""')::jsonb,
    updated_at    = now()
WHERE brand = 'mentolder'
  AND services_json::text LIKE '%statt 900 €%';

-- (2) Konkrete Eurobeträge in price-Feldern auf "nach Vereinbarung" setzen
UPDATE service_config
SET
  services_json = replace(
    replace(
      replace(
        replace(services_json::text,
          '"price": "150 €"',   '"price": "nach Vereinbarung"'),
        '"price": "800 €"',     '"price": "nach Vereinbarung"'),
      '"price": "500 €"',       '"price": "nach Vereinbarung"'),
    '"price": "Ab 150 €"',      '"price": "nach Vereinbarung"')::jsonb,
  updated_at = now()
WHERE brand = 'mentolder'
  AND services_json::text ~ '"price": "(150|800|500|Ab 150) €"';
