"""scripts/devflow — Devflow-Sandbox als llm-proxy-Tool (T901630).

Python-Backend (SSOT der Logik) fuer die Proxy-Routen
POST /tools/devflow/<verb>. Einziger Einstieg: `python3 -m devflow <verb>`
(siehe cli.py); Aufrufkontext ist der Repo-Root mit PYTHONPATH=scripts.
Stdlib-only, keine neuen Dependencies.
"""
