---
title: "cockpit-auth-schnitt — Entwurfsentscheidung"
ticket_id: T002463
domains: [cockpit, website, security]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: T002458
depends_on_plans: []
---

# cockpit-auth-schnitt — Entwurfsentscheidung

_Ticket: T002463 (K4) · betrifft zusätzlich T002465 (K6)_

## Was dieser Change ist — und was nicht

Er trägt eine **Entscheidung**, keine Implementierung. Kein Code, keine Tests,
keine Dateien. Er hält fest, wie die Auth-Frage von K4 und K6 aufgelöst wird,
damit beide Kinder planbar werden; die Umsetzung erfolgt in ihren eigenen
Plänen.

Er bleibt bis dahin **offen**, nicht archiviert: nur so liest `plan-context.sh`
ihn und injiziert die Entscheidung in den Kontext jedes Agenten, der an K4 oder
K6 arbeitet. Archiviert wird er, wenn K4 umgesetzt ist — dann wandert das Delta
in die SSOT `openspec/specs/sdlc-cockpit.md`.

## Die Entscheidung in drei Sätzen

1. Schreibaktionen, die im Cluster laufen können (Ticket-Status, PR mergen),
   laufen über die **bestehende** Admin-Auth der Website. Kein neuer Mechanismus.
2. Schreibaktionen, die nur lokal laufen können (Agent killen, Worktree
   entfernen, Lock brechen, Terminal), bleiben vorerst der Kommandozeile
   vorbehalten. Nicht aus Schwierigkeit, sondern weil es keinen Netzwerkweg vom
   Cluster zu einem Entwicklerrechner gibt.
3. Brain wird **cluster-intern** gelesen, nicht durch den `oauth2-proxy` und
   nicht vom lokalen Daemon.

Begründung und Belege: siehe `proposal.md`. Die verbindlichen Zusagen stehen in
`specs/sdlc-cockpit.md`.

## Parallelität von K4 und K6

Beide sind **unabhängig planbar und umsetzbar**. Das war nicht selbstverständlich
und ist das Ergebnis von zwei Klärungen:

**1. Keiner der beiden hängt am K7-Rest.** Der Adapter braucht keine globale
Basis-Umschaltung, sondern eine Karte pro Endpunkt (siehe `specs/`). K4 und K6
tragen ihre neuen Endpunkte einfach als „Website" ein. Ob `agents` und `models`
je auf die Website wandern, bleibt davon unberührt — sie können es nicht, weil
sie lokalen Zustand lesen.

**2. K6s Blocker ist identifiziert.** Es fehlt eine NetworkPolicy nach dem
gelebten Muster; kein Entwurfsproblem.

### Geteilte Dateien — die eine echte Kollisionsstelle

| Datei | K4 | K6 | Kollision |
|---|---|---|---|
| `website/src/pages/api/admin/cockpit/` | neue Schreib-Endpunkte | `brain.ts` | keine — verschiedene Dateien |
| `k3d/network-policies.yaml` | — | brain-Policy | keine |
| `.lavish/kit/panel.js` | Aktions-Slot (D4) | Kontext-Slot | möglich, verschiedene Funktionen |
| **`.lavish/kit/adapter.js`** | Schreibmethoden + Endpunkt-Karte | `brain()` | **ja** |

Die Kollision in `adapter.js` liegt an genau zwei Stellen: dem Funktionsblock
und der Zeile im `return`-Objekt. Sie ist **bekannt, klein und trivial
auflösbar** — beide Blöcke behalten. Genau dieser Konflikt trat bei K5 und K9
auf und war in Minuten gelöst.

Sie wird bewusst **nicht** durch Vorziehen eines gemeinsamen Vorlaufs vermieden:
das würde eine Abhängigkeit zwischen zwei sonst unabhängigen Kindern schaffen,
um einen Zweizeilen-Konflikt zu sparen. Wer zuerst merged, gewinnt; der zweite
rebased.

> `file_locks` im Plan-Frontmatter hilft hier **nicht** — das Feld wird zwar
> geschrieben und beim Frontmatter-Setzen geprüft, aber von keinem Scheduler
> ausgewertet. Es dokumentiert, es koordiniert nicht.

## Folgeschritte in den Kind-Tickets

**K4 (T002463)** — setzt Klasse A um:

- Website-API für die cluster-seitigen Schreibaktionen, Muster
  `admin/cockpit/feature-action.ts` (Session → `isAdmin` → sonst `403`)
- Bestätigungsabstufung nach Umkehrbarkeit (D5/D6) und mobile Sonderregel
- Audit-Log als Strom-Panel
- Aktions-Slot mit den vier Zuständen (D4)
- Entscheidung über die beiden Daemon-Write-Stubs: entfernen oder für Klasse B
  reservieren

**K6 (T002465)** — setzt die Brain-Anbindung um:

- Website-API liest `brain.workspace.svc.cluster.local`, erzwingt `isAdmin`
- Kontext-Slot der Panels mit Brain-Verweisen füllen
- **Erster Task: die fehlende NetworkPolicy.** Ursache geklärt — im
  `workspace`-Namespace wirkt `allow-intra-namespace-ingress` mit leerem
  `podSelector` als Default-Deny für alles von außerhalb. Für jeden Dienst, den
  die Website erreichen darf, existiert eine eigene Policy nach striktem Muster;
  für `brain` fehlt sie. Ergänzung in `k3d/network-policies.yaml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-website-to-brain-ingress
  namespace: workspace
spec:
  podSelector:
    matchLabels:
      app: brain
  policyTypes: [Ingress]
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: website
      ports:
        - port: 8787      # Container-Port; der Service mappt 80 -> 8787
          protocol: TCP
```

  Vorbild: `allow-website-to-vaultwarden-ingress` in derselben Datei. Der
  Service ist gesund (Endpoint `10.42.3.194:8787`, Selector passt, Pod 1/1) —
  es fehlt allein die Erlaubnis.

**K7-Nachtrag (T002466, bereits gemergt)** — der offene Punkt 4 zerfällt in zwei
Teile, und nur der kleinere gehört zu K4:

- **Endpunkt-Karte statt Basis-Konstante** (mit K4): der Adapter entscheidet pro
  Endpunkt, welcher Host ihn bedient. Klein, und Voraussetzung dafür, dass K4
  und K6 ihre neuen Website-Endpunkte überhaupt ansprechen können.
- **Fehlende Endpunkte auf der Website nachbauen** (eigener Vorgang, später):
  `epics`, `styles` und `ci` sind dort noch nicht vorhanden. Solange sie fehlen,
  bleiben sie in der Karte auf „Daemon". `agents` und `models` bleiben
  **dauerhaft** dort — sie lesen lokalen Zustand.

Die ursprüngliche Formulierung „der Adapter löst seine Basis-Adresse aus dem
Host-Kontext auf" war zu grob: die Website bedient heute nur drei der acht
Endpunkte. Ein globaler Umschalter hätte fünf Panels auf `404` gestellt.

## Verify

Dieser Change hat keinen Code und deshalb keinen RED→GREEN-Schritt. Prüfbar ist
allein die Konsistenz des Dokuments:

```bash
bash scripts/openspec.sh validate   # das fail-closed CI-Gate — muss OK sein
```

> **`plan-lint.sh` ist auf diesen Change NICHT anwendbar** und meldet
> erwartungsgemäß `STRUCT1/2/3`. Der Linter prüft *Implementierungspläne* auf
> File Structure, einen Failing-Test-Step und die drei CI-Gates — alles Dinge,
> die ein Entwurf ohne Code nicht haben kann. Ihn hier trotzdem zu fordern,
> hieße die Struktur pro forma zu füllen und ein grünes Ergebnis ohne
> Gegenstand zu erzeugen. Auf `main` liegen mindestens acht weitere Changes
> ohne `File Structure`; das CI-Gate ist `openspec validate`, nicht plan-lint.

Die Zusagen aus `specs/sdlc-cockpit.md` werden dort getestet, wo sie umgesetzt
werden — in K4 und K6.
