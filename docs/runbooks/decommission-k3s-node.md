# Runbook: k3s-Node dekommissionieren (Fall: gekko-hetzner-2)

**Kontext:** Node fehlt seit Join vor 85 d, ping-bar (10.20.0.4), Longhorn
READY=False, Prometheus-PVC (~38 GB) robustness=degraded.
**Entscheidung Operator 2026-08-24:** Dekommissionieren, kein Rejoin.
**Ticket:** T016425 · Epic T016422 · ADR-007

> ⚠ **Ausführungsgrenze:** Schritte mit **MANUELL — Operator** dürfen nicht
> vom autonomen Factory-Tick ausgeführt werden. Alles andere ist lesend.

## 1. Vorprüfung (lesend)

```bash
# Hängt noch Workload an der Node?
kubectl get pods -A -o wide --field-selector spec.nodeName=gekko-hetzner-2
# Lokale PVs/Replicas auf der Node?
kubectl -n longhorn-system get replicas.longhorn.io -o wide | grep hetzner-2
```

Erwartung: keine laufenden Pods; Longhorn-Replicas auf der Node sind die,
die danach neu gebaut werden.

## 2. Node entfernen — **MANUELL — Operator**

```bash
kubectl delete node gekko-hetzner-2
```

(Drain entfällt — Node ist seit 85 d nicht Teil des Schedulers.)

## 3. Longhorn-Rebuild beobachten (lesend)

```bash
watch -n 30 'kubectl -n longhorn-system get volumes.longhorn.io -o custom-columns=NAME:.metadata.name,STATE:.status.state,ROBUSTNESS:.status.robustness'
```

Ziel: alle Volumes `attached` + `robustness=healthy`; Replicas laufen nur
noch auf hetzner-3/-4.

## 4. Prometheus-PVC verifizieren (lesend)

```bash
kubectl -n monitoring get pvc
kubectl -n longhorn-system get volumes.longhorn.io | grep monitoring
```

Ziel: PVC `robustness=healthy`, kein degraded mehr.

## 5. Verifikationsskript

```bash
bash scripts/factory/verify-decommission.sh gekko-hetzner-2   # Exit 0 = sauber
```

## 6. Infrastruktur-Rückbau — **MANUELL — Operator**

- Hetzner-Server gekko-hetzner-2 über Cloud-Konsole kündigen/löschen
- WireGuard-Peer + DNS-Einträge für 10.20.0.4 aus dem Mesh ziehen
- Eintrag in der Inventar-Doku anpassen
