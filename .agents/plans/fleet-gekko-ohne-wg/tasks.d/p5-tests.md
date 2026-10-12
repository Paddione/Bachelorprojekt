# p5 — RED-Guard: fleet ohne WireGuard

Rolle: tests. Laeuft zuerst (keine Abhaengigkeit), damit der Ist-Zustand
rot belegt ist, bevor p1/p2 etwas veraendern.

## Task 1 — Guard-Test schreiben und RED bestaetigen

- Step: Neuen Test `tests/py/spec/native_ported/spec/fleet-operations/test_fleet_no_wireguard.py` schreiben. Er durchsucht prod, prod-fleet, die cloud-init-Dateien und scripts nach den Mustern wg-fleet, der alten WG-Adressierung (10.20.0.x) und WG_MESH-Secret-Namen und schlaegt bei Treffern fehl. Ausgenommen ist der devmesh-Kontext (k3s-internes flannel-wg bleibt).
- Step: `python3 -m pytest tests/py/spec/native_ported/spec/fleet-operations/test_fleet_no_wireguard.py -q` — expected: FAIL, weil der WG-Mesh heute noch in cloud-init, scripts und wireguard/ referenziert ist.
- Acceptance: Test ist rot aus dem richtigen Grund (Trefferliste benennt die Alt-Referenzen). Gruen wird er erst durch p4; die Schlusspruefung steht im Verify-Task des Index.
