CREATE OR REPLACE VIEW tickets.v_central_dashboard AS
SELECT
    id,
    external_id,
    type,
    brand,
    title,
    status,
    priority,
    severity,
    component,
    updated_at
FROM tickets.tickets;
