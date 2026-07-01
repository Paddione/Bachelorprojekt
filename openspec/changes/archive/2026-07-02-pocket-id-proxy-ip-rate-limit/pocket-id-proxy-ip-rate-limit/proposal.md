# Proposal: pocket-id-proxy-ip-rate-limit

## Why

Pocket-ID logs and rate-limits by the cluster-internal proxy IP (10.42.x.x Pod-CIDR) instead of the real browser client IP. This causes `429 Too Many Requests from your network` errors fleet-wide when multiple users behind the same cluster see a single rate-limit bucket. The symptom was discovered during the T001326 incident.

Root cause: the Traefik ingress forwards traffic to the Pocket-ID pod, but the real client IP from `X-Forwarded-For` is not picked up by Pocket-ID, even though `TRUST_PROXY=true` is set.

## What

Identify the missing link in the proxy-chain and ensure the real client IP reaches Pocket-ID's rate-limiter and audit log:
1. Verify `TRUST_PROXY` handling in Pocket-ID — does it read `X-Forwarded-For` from the trusted proxy correctly?
2. Ensure the Traefik ingress middleware strips the previous hop and only leaves the real client IP.
3. If needed, set `TRUST_PROXY=true` with the correct trusted-proxy CIDR (cluster Pod-CIDR + service-CIDR).
4. Deploy and verify that audit logs show real browser IPs and rate-limiter buckets per-client-IP instead of per-pod-IP.

_Ticket: T001328_
