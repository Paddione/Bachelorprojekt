"""llm-proxy-Registry ohne tickets-Referenz (F2: Poller gegen retirtes Schema).

Der Ticket-Retirement (2026-10-14) hat das `tickets`-Schema aus der Dev-DB
entfernt; der Registry-Poller in scripts/llm-proxy/ fragt es aber weiter alle
30 s ab — jeder Poll bricht mit
`relation "tickets.llm_proxy_backends" does not exist` ab und treibt den
Rollback-Zaehler der website-DB (5,4 % Rollback-Rate, 60/62 ERRORs im
30-min-Fenster sind dieser Poller).

RED: Referenz vorhanden. GREEN: Poller liest keine `tickets.`-Relation mehr
(neue Registry-Heimat oder Env-Bypass).
"""

from pathlib import Path

POLLER_DATEIEN = [
    "scripts/llm-proxy/backends.mjs",
    "scripts/llm-proxy/server.mjs",
    "scripts/llm-proxy/bge-routes.mjs",
]

# Nur funktionale Registry-Referenzen (FROM-Abfragen, Tabellennamen).
# Historische Kommentare ueber andere retirte Tabellen (z. B.
# tickets.llm_proxy_request_log in server.mjs) bleiben erlaubt.
VERBOTENE_MUSTER = ["FROM tickets.", "tickets.llm_proxy_backends"]


def test_registry_poll_ohne_tickets_referenz(repo_root: Path):
    funde = [
        f"{rel}: {muster}"
        for rel in POLLER_DATEIEN
        for muster in VERBOTENE_MUSTER
        if muster in (repo_root / rel).read_text()
    ]
    assert not funde, (
        f"Registry-Poller referenziert retirtes tickets-Schema: {funde}"
    )
