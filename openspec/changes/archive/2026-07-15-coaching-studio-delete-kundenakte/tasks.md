---
title: "Kundenakte löschen (coaching-studio Prototyp)"
ticket_id: "T001563"
domains: [website]
status: completed
---

# coaching-studio-delete-kundenakte — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Klient:innen im coaching-studio-Admin-Prototyp aus Dashboard-Kachel und Detailansicht löschbar machen — mit zweistufiger Bestätigung, Sessions-Warnhinweis, Undo-Toast (5 s) und `localStorage`-Persistenz, ohne den State-losen `CUSTOMERS`-Zugriff crashen zu lassen, wenn die Liste leer wird.

**Architektur:** Der Prototyp (`website/public/coaching-studio/`) ist reines Client-Side-React über `<script type="text/babel">` (Babel-Standalone via CDN), **ohne Modulsystem** — kein `import`/`export`, geteilter State ausschließlich über `window`-Globals (`Object.assign(window, {...})` in `data.jsx:130`). `CUSTOMERS` wird zu echtem React State in `App` gehoben (`useState`, initialisiert aus `localStorage` mit Fallback auf das statische Array) und via Prop-Drilling an `Dashboard`/`Kundenakte` durchgereicht. Kein Context, kein Modal-System.

**Tech Stack:** React 18 (UMD/CDN), Babel-Standalone (In-Browser-Transpile), reines JSX ohne Build-Step, `localStorage` für Persistenz.

## Global Constraints

- **Kein Modulsystem:** Neue Funktionen/Komponenten werden über `window` exponiert bzw. leben in derselben Datei; keine `import`/`export`-Statements. Jedes Babel-`<script>` hat eigenen Scope — Cross-File-Zugriff nur über `window`-Globals.
- **Ladereihenfolge (fix, siehe `studio.astro:19-23`):** `data.jsx` → `workspace.jsx` → `screens_core.jsx` → `screens_more.jsx` → `app.jsx`. `app.jsx` lädt zuletzt, daher ist `CUSTOMERS` (aus `data.jsx`) dort zur `useState`-Init-Zeit definiert.
- **Keine Server-/DB-Persistenz** — rein clientseitig (`localStorage`-Key `coaching-studio-customers`).
- **Rules of Hooks:** Alle `useState`/`useEffect`/`useRef`-Aufrufe stehen unbedingt am Funktionsanfang; jeder Empty-State-`return` steht NACH allen Hook-Aufrufen.
- **S1-Zeilenbudget (Limit `.jsx` = 600, keine Datei baselined):** `app.jsx` 59 → ~120, `screens_core.jsx` 212 → ~300, `workspace.jsx` 274 → ~285, `screens_more.jsx` 174 → ~185, `app.css` 476 → ~495 (`.css` ist nicht S1-gated). Alle Dateien bleiben klar unter Budget — kein Split nötig.
- **Keine automatisierte Testabdeckung** für `coaching-studio/*.jsx` (kein Build-Step, keine Vitest/BATS). Verifikation ist zwingend manuell im Dev-Server-Browser.

## File Structure

- **Modify** `website/public/coaching-studio/app.jsx` — State-Lifting (`customers`-`useState` + `localStorage`-Sync-`useEffect`), Undo-Toast-State + `UndoToast`-Komponente, `onDeleteCustomer`/`onUndoDelete`-Handler, Prop-Drilling an `Dashboard`/`Kundenakte`, `TopBar`-`customers[0]`-Guard.
- **Modify** `website/public/coaching-studio/screens_core.jsx` — `Dashboard` auf `customers`-Prop umstellen + Empty-State, neue `KundeCard`-Komponente (Karten-Root `<button>`→`<div role="button">`, Trash-Button, zweistufige Inline-Bestätigung, Sessions-Warnhinweis), `Kundenakte` Lösch-Action + Nav-zurück + Empty-State, `ProfileEditor` Empty-State.
- **Modify** `website/public/coaching-studio/workspace.jsx` — `CUSTOMERS[0]`-Fallback (Zeile 94) durch `undefined`-sicheren Empty-State ersetzen.
- **Modify** `website/public/coaching-studio/screens_more.jsx` — `CompareView` `CUSTOMERS[0]`-Fallback (Zeile 8) durch Empty-State ersetzen.
- **Modify** `website/public/coaching-studio/app.css` — Minimal-Styling für `.confirm-del`, `.empty-state`, `.undo-toast`, `.kunde-card[role="button"]` (rein kosmetisch, funktionsunabhängig).
- **Unverändert** `website/public/coaching-studio/data.jsx` (statisches `CUSTOMERS`-Array bleibt Fallback-Quelle), `website/src/pages/admin/coaching/studio.astro` (Script-Ladeliste unverändert).

**Manuelle Verifikation — Vorbedingung (gilt für alle Tasks):** Dev-Server `cd website && pnpm dev` (http://localhost:4321). Die Seite `/admin/coaching/studio` verlangt eine authentifizierte Admin-Session (Redirect sonst via `studio.astro:5-7`) — als Admin einloggen (User `paddione`) bzw. lokale Dev-Session gemäß Projektpraxis setzen. Vor jedem manuellen Test in der DevTools-Konsole `localStorage.removeItem("coaching-studio-customers")` ausführen und neu laden, um einen definierten Ausgangszustand zu erhalten.

---

### Task 1: Rot-Zustand dokumentieren — kein Lösch-Pfad existiert

**Files:**
- Test (manuell): `website/src/pages/admin/coaching/studio.astro` (gerenderte Seite `/admin/coaching/studio`)

**Interfaces:**
- Consumes: nichts (Baseline vor jeder Änderung).
- Produces: nichts — dokumentiert nur den fehlenden Ausgangszustand (rot→grün-Anker).

- [ ] **Step 1: Manuellen Rot-Test ausführen**

Dev-Server starten (`cd website && pnpm dev`), `/admin/coaching/studio` als Admin öffnen. Eine Kundenkachel im Dashboard betrachten und versuchen, die Kundenakte zu löschen (Kachel öffnen → Detailansicht betrachten).

Run: manuell im Browser — Kachel anklicken, Detailansicht (`Kundenakte`) inspizieren.
Expected: FAIL — es existiert weder auf der Dashboard-Kachel noch im Detailkopf ein Lösch-Button/Trash-Icon, und kein State-Mutation-Pfad entfernt einen Kunden. Das Feature existiert noch nicht (roter Ausgangszustand bestätigt).

- [ ] **Step 2: Beobachtung festhalten**

Notiere: `CUSTOMERS` ist ein modul-globales statisches Array (`data.jsx:107`), keine Löschung möglich, `CUSTOMERS[0]`-Fallbacks würden bei leerem Array crashen (`workspace.jsx:94` → `cust.name`). Kein Commit (reine Beobachtung).

---

### Task 2: State-Lifting, Persistenz, Undo-Toast in `app.jsx`

**Files:**
- Modify: `website/public/coaching-studio/app.jsx` (komplette Datei — Neufassung von `TopBar` + `App`, neue `UndoToast`-Komponente)

**Interfaces:**
- Consumes: `CUSTOMERS` (global aus `data.jsx`), `Icon`, `useState`/`useEffect` (global aus `data.jsx`), `Dashboard`/`Kundenakte`/`ProfileEditor`/`Workspace`/`CompareView`/`AdminArea` (global).
- Produces: Props für spätere Tasks:
  - `Dashboard` erhält `{ onNav, customers, onDelete }` — `customers: Array<Customer>`, `onDelete(id: string): void`.
  - `Kundenakte` erhält `{ customer, onNav, onDelete }` — `onDelete(id: string): void`.
  - `onNav(screen: string, customer?: Customer): void` (Signatur unverändert).

- [ ] **Step 1: `app.jsx` neu schreiben (State-Lifting + Persistenz + Undo)**

Ersetze den gesamten Inhalt von `website/public/coaching-studio/app.jsx` durch:

```jsx
/* eslint-disable */
// App-Shell — Navigation, RTL-Umschaltung, Screen-Routing, Kunden-State.

const CUSTOMERS_LS_KEY = "coaching-studio-customers";

// Kundenliste initial aus localStorage laden; Fallback: statisches Array aus data.jsx.
function loadCustomers(){
  try {
    const raw = localStorage.getItem(CUSTOMERS_LS_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      if(Array.isArray(parsed)) return parsed;
    }
  } catch(e){ /* korrupt / Privatmodus → Fallback */ }
  return CUSTOMERS;
}

function TopBar({ screen, onNav, rtl, setRtl, customers }){
  const first = customers[0];
  const navItems = [
    { id:"dashboard", label:"Übersicht" },
  ];
  return (
    <header className="topbar">
      <div className="brand-row">
        <BrandMark size={30}/>
        <span className="name">mentolder<span className="dot">.</span></span>
      </div>
      <span className="brand-sub">Coaching Studio</span>
      <nav className="topnav" aria-label="Hauptnavigation">
        {navItems.map(n=> (
          <button key={n.id} className={(screen===n.id ? "is-active":"")} onClick={()=> onNav(n.id)}>{n.label}</button>
        ))}
      </nav>
      <span className="spacer"/>
      <div className="topbar-tools">
        <button className={"icon-btn"+(rtl?" is-on":"")} onClick={()=> setRtl(!rtl)} aria-pressed={rtl} title="RTL-Layout umschalten (Farsi/Arabisch)"><Icon.rtl/></button>
        <button className="btn btn-primary btn-sm" onClick={()=> first && onNav("workspace", first)} disabled={!first}><Icon.plus width="14" height="14"/>Session</button>
      </div>
    </header>
  );
}

function UndoToast({ undo, onUndo }){
  if(!undo) return null;
  return (
    <div className="undo-toast" role="status" aria-live="polite">
      <span>{undo.customer.name} gelöscht</span>
      <button className="btn btn-quiet btn-sm" onClick={onUndo}>Rückgängig</button>
    </div>
  );
}

function App(){
  const [customers, setCustomers] = useState(loadCustomers);
  const [route, setRoute] = useState({ screen:"dashboard", customer: undefined });
  const [rtl, setRtl] = useState(false);
  const [undo, setUndo] = useState(null); // { customer, index } | null

  useEffect(()=> { document.documentElement.dir = rtl ? "rtl" : "ltr"; }, [rtl]);

  // Jede Änderung der Kundenliste synchron nach localStorage schreiben.
  useEffect(()=> {
    try { localStorage.setItem(CUSTOMERS_LS_KEY, JSON.stringify(customers)); }
    catch(e){ /* Quota / Privatmodus → ignorieren */ }
  }, [customers]);

  // Undo-Fenster: 5s nach dem Löschen automatisch schließen.
  useEffect(()=> {
    if(!undo) return;
    const t = setTimeout(()=> setUndo(null), 5000);
    return ()=> clearTimeout(t);
  }, [undo]);

  const onNav = (screen, customer)=> {
    setRoute(r=> ({ screen, customer: customer || r.customer }));
    window.scrollTo(0,0);
  };

  const onDeleteCustomer = (id)=> {
    const index = customers.findIndex(c=> c.id===id);
    if(index < 0) return;
    setUndo({ customer: customers[index], index });
    setCustomers(cs=> cs.filter(c=> c.id!==id));
  };

  const onUndoDelete = ()=> {
    if(!undo) return;
    setCustomers(cs=> {
      const next = cs.slice();
      next.splice(Math.min(undo.index, next.length), 0, undo.customer);
      return next;
    });
    setUndo(null);
  };

  const { screen, customer } = route;
  let view;
  if(screen==="dashboard") view = <Dashboard onNav={onNav} customers={customers} onDelete={onDeleteCustomer}/>;
  else if(screen==="akte") view = <Kundenakte customer={customer} onNav={onNav} onDelete={onDeleteCustomer}/>;
  else if(screen==="profile") view = <ProfileEditor customer={customer} onNav={onNav}/>;
  else if(screen==="workspace") view = <Workspace customer={customer} onNav={onNav}/>;
  else if(screen==="compare") view = <CompareView customer={customer} onNav={onNav}/>;
  else if(screen==="admin") view = <AdminArea onNav={onNav}/>;
  else view = <Dashboard onNav={onNav} customers={customers} onDelete={onDeleteCustomer}/>;

  return (
    <div className="app">
      <TopBar screen={screen} onNav={onNav} rtl={rtl} setRtl={setRtl} customers={customers}/>
      {view}
      <UndoToast undo={undo} onUndo={onUndoDelete}/>
    </div>
  );
}

window.__studioRoot = window.__studioRoot || ReactDOM.createRoot(document.getElementById("root"));
window.__studioRoot.render(<App/>);
```

- [ ] **Step 2: Manuell verifizieren — Persistenz & Fallback (Requirement: Kundenliste als React State mit localStorage-Persistenz)**

Run: `localStorage.removeItem("coaching-studio-customers")` in DevTools-Konsole, dann Seite neu laden.
Expected: Dashboard zeigt die 6 statischen Kund:innen (Fallback greift). In DevTools → Application → Local Storage existiert danach der Key `coaching-studio-customers` mit dem serialisierten Array (Persistenz-`useEffect` hat geschrieben). Nach erneutem Reload werden die Daten aus `localStorage` geladen (kein Crash, gleiche Liste).

- [ ] **Step 3: Commit**

```bash
git add website/public/coaching-studio/app.jsx
git commit -m "feat(coaching-studio): lift CUSTOMERS to React state with localStorage + undo scaffolding"
```

---

### Task 3: Dashboard-Kachel — Lösch-Button, zweistufige Bestätigung, Sessions-Warnung, Empty-State

**Files:**
- Modify: `website/public/coaching-studio/screens_core.jsx` (Funktion `Dashboard`, neue Funktion `KundeCard`)

**Interfaces:**
- Consumes: `customers`, `onDelete(id)`, `onNav` (aus Task 2), `Icon`, `useState`.
- Produces: `KundeCard`-Komponente (dateilokal, kein `window`-Export nötig — nur von `Dashboard` in derselben Datei genutzt).

- [ ] **Step 1: `Dashboard` auf `customers`-Prop + Empty-State umbauen**

Ersetze in `website/public/coaching-studio/screens_core.jsx` die komplette Funktion `Dashboard` (aktuell Zeilen 7–62) durch:

```jsx
function Dashboard({ onNav, customers, onDelete }){
  const [q, setQ] = useState("");
  const list = customers.filter(k=> k.name.toLowerCase().includes(q.toLowerCase()) || k.category.toLowerCase().includes(q.toLowerCase()));
  const sum = customers.reduce((a,k)=> ({ aktiv:a.aktiv+k.aktiv, pausiert:a.pausiert+k.pausiert, fertig:a.fertig+k.fertig }), {aktiv:0,pausiert:0,fertig:0});
  const first = customers[0];

  return (
    <div className="screen"><div className="wrap">
      <div className="page-head">
        <div className="eyebrow">Übersicht</div>
        <div className="between" style={{alignItems:"flex-end"}}>
          <h1>Klient:innen &amp; <em>Sessions</em></h1>
          <button className="btn btn-primary" onClick={()=> first && onNav("workspace", first)} disabled={!first}><Icon.plus width="15" height="15"/>Neue Session</button>
        </div>
      </div>

      <div className="stat-strip">
        <div className="stat-cell"><div className="n">{customers.length}</div><div className="l">Klient:innen</div></div>
        <div className="stat-cell"><div className="n">{sum.aktiv}<em> ●</em></div><div className="l">Aktive Sessions</div></div>
        <div className="stat-cell"><div className="n">{sum.pausiert}</div><div className="l">Pausiert</div></div>
        <div className="stat-cell"><div className="n">{sum.fertig}</div><div className="l">Abgeschlossen</div></div>
      </div>

      <div className="toolbar">
        <div className="search">
          <Icon.search/>
          <input className="input" placeholder="Suche nach Name oder Kategorie…" value={q} onChange={(e)=> setQ(e.target.value)} aria-label="Klient:innen suchen"/>
        </div>
        <button className="btn btn-ghost" onClick={()=> onNav("admin")}>Admin</button>
      </div>

      {customers.length === 0 ? (
        <div className="empty-state kicker">Keine Klient:innen vorhanden — lege eine neue Session an, sobald Daten existieren.</div>
      ) : (
        <div className="kunden-grid">
          {list.map(k=> <KundeCard key={k.id} k={k} onNav={onNav} onDelete={onDelete}/>)}
        </div>
      )}
    </div></div>
  );
}
```

- [ ] **Step 2: `KundeCard`-Komponente einfügen**

Füge direkt VOR der Funktion `Dashboard` (also vor Zeile 7 / oberhalb des Dashboard-Kommentarblocks) diese neue Komponente ein:

```jsx
// Dashboard-Kachel mit Klick-zu-Navigieren (div role=button) + Lösch-Button.
// Karten-Root ist bewusst KEIN <button> mehr, damit der innere Trash-<button>
// kein verschachteltes Button-HTML erzeugt. Tastatur: Enter/Space navigieren,
// aber nur wenn das Event am Karten-Root selbst ausgelöst wurde (nicht auf einem
// inneren Button gebubbelt).
function KundeCard({ k, onNav, onDelete }){
  const [confirm, setConfirm] = useState(false);
  const nav = ()=> onNav("akte", k);
  const onKey = (e)=> {
    if(e.target !== e.currentTarget) return;
    if(e.key === "Enter" || e.key === " "){ e.preventDefault(); nav(); }
  };
  const running = k.aktiv + k.pausiert;
  return (
    <div className="card kunde-card" role="button" tabIndex={0} onClick={nav} onKeyDown={onKey}>
      <div className="head">
        <span className="avatar">{k.initials}</span>
        <div style={{flex:1}}>
          <div className="name">{k.name}</div>
          <div className="sub">{k.category} · {k.lang} · seit {k.since}</div>
        </div>
        <button className="btn btn-quiet btn-sm" aria-label="Kundenakte löschen"
          onClick={(e)=> { e.stopPropagation(); setConfirm(true); }}>
          <Icon.trash width="15" height="15"/>
        </button>
      </div>
      <div className="sess-count">
        <div className="c"><b>{k.aktiv}</b><span>Aktiv</span></div>
        <div className="c"><b>{k.pausiert}</b><span>Pausiert</span></div>
        <div className="c"><b>{k.fertig}</b><span>Fertig</span></div>
      </div>
      <div className="meta">
        {k.aktiv>0 && <span className="pill pill-aktiv"><span className="dot dot-aktiv pulse"/>Aktiv</span>}
        {k.pausiert>0 && <span className="pill pill-pausiert"><span className="dot dot-pausiert"/>Pausiert</span>}
        {k.aktiv===0 && k.pausiert===0 && <span className="pill pill-fertig"><span className="dot dot-fertig"/>Ruht</span>}
      </div>
      {confirm && (
        <div className="confirm-del" onClick={(e)=> e.stopPropagation()}>
          <span className="warn-q">Wirklich löschen?</span>
          {running > 0 && (
            <span className="warn-sessions">{k.aktiv} aktive, {k.pausiert} pausierte Session(s) werden ebenfalls gelöscht.</span>
          )}
          <div className="row gap-sm">
            <button className="btn btn-primary btn-sm" onClick={(e)=> { e.stopPropagation(); onDelete(k.id); }}>Ja</button>
            <button className="btn btn-ghost btn-sm" onClick={(e)=> { e.stopPropagation(); setConfirm(false); }}>Abbrechen</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Manuell verifizieren — Bestätigung, Propagation-Stop, Löschen, Abbrechen, Warnung (Requirement: Löschen einer Kundenakte mit Bestätigung)**

Run: `/admin/coaching/studio` neu laden, Dashboard betrachten.
Expected:
- Trash-Icon auf jeder Kachel sichtbar. Klick darauf zeigt die Inline-Bestätigung „Wirklich löschen? [Ja] [Abbrechen]" und öffnet NICHT die Detailansicht (Propagation gestoppt).
- Bei „M. Albrecht" (aktiv 1, pausiert 1) enthält die Bestätigung den Warnhinweis „1 aktive, 1 pausierte Session(s) werden ebenfalls gelöscht."; bei „R. Petrov" (aktiv 0, pausiert 2) „0 aktive, 2 pausierte …". Bei einem Kunden mit `aktiv===0 && pausiert===0` erscheint kein Warntext.
- Klick auf „Abbrechen" → Kachel bleibt unverändert erhalten. Klick auf „Ja" → Kachel verschwindet, Undo-Toast erscheint (aus Task 2). Klick irgendwo auf die Kachelfläche (außerhalb Trash) → Detailansicht öffnet. Tastatur: Kachel fokussieren (Tab), Enter/Space → Detailansicht öffnet.

- [ ] **Step 4: Commit**

```bash
git add website/public/coaching-studio/screens_core.jsx
git commit -m "feat(coaching-studio): dashboard delete button with inline confirm + session warning"
```

---

### Task 4: Kundenakte-Detailansicht — Lösch-Action, Nav zurück, Empty-States (Kundenakte + ProfileEditor)

**Files:**
- Modify: `website/public/coaching-studio/screens_core.jsx` (Funktionen `Kundenakte`, `ProfileEditor`)

**Interfaces:**
- Consumes: `customer`, `onNav`, `onDelete(id)` (aus Task 2), `Icon`, `PROFILE_FIELDS`, `useState`.
- Produces: nichts Neues (nur UI innerhalb bestehender Komponenten).

- [ ] **Step 1: `Kundenakte` — Lösch-Action + Empty-State + Nav-zurück**

Ersetze in `screens_core.jsx` den Funktionskopf und Header von `Kundenakte`. Konkret: die Zeilen von `function Kundenakte({ customer, onNav }){` bis inklusive des `<div className="page-head" …>`-Blocks mit dem `eyebrow "Kundenakte"` werden ersetzt durch:

```jsx
function Kundenakte({ customer, onNav, onDelete }){
  const [confirm, setConfirm] = useState(false);
  const k = customer;
  if(!k){
    return (
      <div className="screen"><div className="wrap">
        <button className="btn btn-quiet btn-sm" style={{marginBottom:14, paddingInline:0}} onClick={()=> onNav("dashboard")}><Icon.back width="14" height="14"/>Übersicht</button>
        <div className="empty-state kicker">Keine Klient:innen vorhanden — lege eine neue Session an, sobald Daten existieren.</div>
      </div></div>
    );
  }
  const activeProfile = PROFILE_FIELDS.filter(f=> f.active);
  const running = k.aktiv + k.pausiert;

  return (
    <div className="screen"><div className="wrap">
      <button className="btn btn-quiet btn-sm" style={{marginBottom:14, paddingInline:0}} onClick={()=> onNav("dashboard")}><Icon.back width="14" height="14"/>Übersicht</button>
      <div className="page-head" style={{borderBottom:"none", marginBottom:8, paddingBottom:0}}>
        <div className="between" style={{alignItems:"center"}}>
          <div className="eyebrow">Kundenakte</div>
          {!confirm ? (
            <button className="btn btn-quiet btn-sm" aria-label="Kundenakte löschen" onClick={()=> setConfirm(true)}><Icon.trash width="14" height="14"/>Löschen</button>
          ) : (
            <div className="confirm-del">
              <span className="warn-q">Wirklich löschen?</span>
              {running > 0 && (
                <span className="warn-sessions">{k.aktiv} aktive, {k.pausiert} pausierte Session(s) werden ebenfalls gelöscht.</span>
              )}
              <div className="row gap-sm">
                <button className="btn btn-primary btn-sm" onClick={()=> { onDelete(k.id); onNav("dashboard"); }}>Ja</button>
                <button className="btn btn-ghost btn-sm" onClick={()=> setConfirm(false)}>Abbrechen</button>
              </div>
            </div>
          )}
        </div>
      </div>
```

Der Rest der `Kundenakte`-Funktion (ab `<div className="akte-grid">`) bleibt unverändert. Wichtig: Es wird nur EIN öffnendes `return (` behalten — der bisherige `const k = customer || CUSTOMERS[0];` und das alte `<div className="page-head" …>` mit nur `eyebrow` entfallen vollständig, ersetzt durch obigen Block.

- [ ] **Step 2: `ProfileEditor` — Empty-State + Hook-Reihenfolge**

Ersetze in `screens_core.jsx` die ersten beiden Zeilen des `ProfileEditor`-Funktionskörpers (aktuell `const k = customer || CUSTOMERS[0];` gefolgt von `const [fields, setFields] = useState(…)`) so, dass der Hook zuerst kommt und danach der Empty-State-Guard greift:

```jsx
function ProfileEditor({ customer, onNav }){
  const [fields, setFields] = useState(()=> PROFILE_FIELDS.map(f=> ({...f})));
  const k = customer;
  if(!k){
    return (
      <div className="screen"><div className="wrap">
        <button className="btn btn-quiet btn-sm" style={{marginBottom:14, paddingInline:0}} onClick={()=> onNav("dashboard")}><Icon.back width="14" height="14"/>Übersicht</button>
        <div className="empty-state kicker">Keine Klient:innen vorhanden — lege eine neue Session an, sobald Daten existieren.</div>
      </div></div>
    );
  }
  const toggle = (i)=> setFields(fs=> fs.map((f,j)=> j===i ? {...f, active:!f.active} : f));
  const edit = (i,v)=> setFields(fs=> fs.map((f,j)=> j===i ? {...f, value:v} : f));
  const activeCount = fields.filter(f=> f.active).length;
```

Der Rest von `ProfileEditor` (ab `return (`) bleibt unverändert.

- [ ] **Step 3: Manuell verifizieren — Detail-Löschung + Nav zurück (Requirement: Delete button available in customer detail view / navigates back)**

Run: `/admin/coaching/studio` → eine Kachel öffnen (Detailansicht).
Expected:
- Im Seitenkopf neben „Kundenakte" ein „Löschen"-Button mit Trash-Icon. Klick → Inline-Bestätigung mit optionalem Sessions-Warnhinweis. „Abbrechen" → bleibt in der Akte. „Ja" → Kunde wird entfernt UND App navigiert zurück zum Dashboard (keine verwaiste Akte), Undo-Toast erscheint.

- [ ] **Step 4: Commit**

```bash
git add website/public/coaching-studio/screens_core.jsx
git commit -m "feat(coaching-studio): detail-view delete action + empty-states for Kundenakte/ProfileEditor"
```

---

### Task 5: `workspace.jsx` — `undefined`-sicherer Empty-State statt `CUSTOMERS[0]`

**Files:**
- Modify: `website/public/coaching-studio/workspace.jsx` (Funktion `Workspace`, Zeile 94 + Guard vor dem `return`)

**Interfaces:**
- Consumes: `customer`, `onNav`, `Icon`, `LEVELS` (alle bereits vorhanden).
- Produces: nichts Neues.

- [ ] **Step 1: `CUSTOMERS[0]`-Fallback entfernen und Guard nach den Hooks setzen**

In `Workspace` (`workspace.jsx`): Ändere Zeile 94 von

```jsx
  const cust = customer || CUSTOMERS[0];
```

zu

```jsx
  const cust = customer;
```

`const cust = customer;` bleibt an dieser Stelle (nach allen `useState`/`useRef`-Aufrufen ist ohnehin gegeben, da die Hooks direkt darunter stehen — verschiebe die Zeile NICHT vor die Hooks). Füge dann unmittelbar VOR dem großen `return (` (aktuell Zeile 142, direkt nach `const ans = answer[active];`) diesen Guard ein:

```jsx
  if(!cust){
    return (
      <div className="screen"><div className="wrap">
        <button className="btn btn-quiet btn-sm" style={{marginBottom:14, paddingInline:0}} onClick={()=> onNav && onNav("dashboard")}><Icon.back width="14" height="14"/>Übersicht</button>
        <div className="empty-state kicker">Keine Klient:innen vorhanden — lege eine neue Session an, sobald Daten existieren.</div>
      </div></div>
    );
  }
```

Hinweis zur Hook-Reihenfolge: `const cust = customer;` steht als erste Zeile der Funktion (vor den `useState`-Aufrufen). Da der Guard aber erst NACH allen Hooks (unmittelbar vor dem `return`) steht, werden alle Hooks bei jedem Render unbedingt aufgerufen — Rules of Hooks bleiben erfüllt.

- [ ] **Step 2: Manuell verifizieren — Workspace crasht nicht bei leerer Liste (Requirement: Sicherer Umgang mit leerer Kundenliste)**

Run: In DevTools-Konsole `localStorage.setItem("coaching-studio-customers","[]")`, Seite neu laden. Dann die „Session"-Buttons prüfen (Dashboard „Neue Session" / TopBar „Session" sind bei leerer Liste `disabled`). Um den Workspace-Empty-State direkt zu erzwingen: in der Konsole `window.__studioRoot` ist gerendert — alternativ vor dem Leeren eine Session öffnen, dann Liste leeren und den Workspace erneut rendern lassen.
Expected: Kein `TypeError: Cannot read properties of undefined (reading 'name')`. Der Workspace zeigt den Empty-State (statt `cust.name` zu dereferenzieren). Dashboard zeigt seinen Empty-State, „Neue Session"/„Session"-Buttons sind deaktiviert.

- [ ] **Step 3: Commit**

```bash
git add website/public/coaching-studio/workspace.jsx
git commit -m "fix(coaching-studio): undefined-safe empty-state in Workspace instead of CUSTOMERS[0]"
```

---

### Task 6: `screens_more.jsx` — `CompareView` `undefined`-sicherer Empty-State

**Files:**
- Modify: `website/public/coaching-studio/screens_more.jsx` (Funktion `CompareView`, Zeile 8)

**Interfaces:**
- Consumes: `customer`, `onNav`, `Icon`, `LEVELS`, `LOREM`.
- Produces: nichts Neues.

- [ ] **Step 1: Fallback durch Empty-State ersetzen**

In `CompareView` (`screens_more.jsx`): Ersetze Zeile 8

```jsx
  const k = customer || CUSTOMERS[0];
```

durch

```jsx
  const k = customer;
  if(!k){
    return (
      <div className="screen"><div className="wrap">
        <button className="btn btn-quiet btn-sm" style={{marginBottom:14, paddingInline:0}} onClick={()=> onNav("dashboard")}><Icon.back width="14" height="14"/>Übersicht</button>
        <div className="empty-state kicker">Keine Klient:innen vorhanden — lege eine neue Session an, sobald Daten existieren.</div>
      </div></div>
    );
  }
```

`CompareView` ruft keine Hooks auf — der Guard darf daher direkt am Funktionsanfang stehen. Der Rest der Funktion (ab `const diffs = …`) bleibt unverändert.

- [ ] **Step 2: Manuell verifizieren — CompareView crasht nicht ohne Kunden**

Run: In der Vergleichsansicht (`compare`-Screen) mit fehlendem `customer` (z.B. `onNav("compare")` ohne Kundenobjekt aufrufen, oder Liste leeren) prüfen.
Expected: Kein Crash bei `k.name` (`screens_more.jsx:43`) — stattdessen Empty-State mit „Übersicht"-Zurück-Button.

- [ ] **Step 3: Commit**

```bash
git add website/public/coaching-studio/screens_more.jsx
git commit -m "fix(coaching-studio): undefined-safe empty-state in CompareView instead of CUSTOMERS[0]"
```

---

### Task 7: Styling für Bestätigung, Empty-State, Undo-Toast + finale Verifikation

**Files:**
- Modify: `website/public/coaching-studio/app.css` (neuer CSS-Block ans Dateiende)

**Interfaces:**
- Consumes: die in Task 2–6 vergebenen Klassennamen (`confirm-del`, `warn-q`, `warn-sessions`, `empty-state`, `undo-toast`, `kunde-card[role="button"]`).
- Produces: nichts (rein kosmetisch).

- [ ] **Step 1: CSS-Block anhängen**

Füge am Ende von `website/public/coaching-studio/app.css` an (CSS-Variablen mit Fallback, damit unabhängig vom bestehenden Theme robust):

```css
/* ---------------------------------------------------------------------
   Kundenakte löschen — Bestätigung, Empty-State, Undo-Toast
   --------------------------------------------------------------------- */
.kunde-card[role="button"]{ cursor:pointer; }
.kunde-card[role="button"]:focus-visible{ outline:2px solid var(--brass, #b8860b); outline-offset:2px; }
.kunde-card .head .btn-quiet{ margin-inline-start:auto; }

.confirm-del{
  display:flex; flex-wrap:wrap; align-items:center; gap:8px;
  margin-top:10px; padding-top:10px;
  border-top:1px solid var(--line, rgba(0,0,0,.12));
}
.confirm-del .warn-q{ font-weight:600; }
.confirm-del .warn-sessions{ flex-basis:100%; font-size:12px; color:var(--brass, #b8860b); }

.empty-state{ padding:40px 0; text-align:center; }

.undo-toast{
  position:fixed; inset-block-end:24px; inset-inline:0;
  margin-inline:auto; width:max-content; max-width:90vw;
  display:flex; align-items:center; gap:14px;
  padding:12px 18px; border-radius:10px; z-index:1000;
  background:var(--ink, #1a1a1a); color:#fff;
  box-shadow:0 8px 30px rgba(0,0,0,.25);
}
.undo-toast .btn{ color:#fff; }
```

- [ ] **Step 2: Vollständiger manueller Szenario-Durchlauf (alle Spec-Scenarios)**

Dev-Server (`cd website && pnpm dev`), `/admin/coaching/studio`. Vor Start: `localStorage.removeItem("coaching-studio-customers")` + Reload. Klicke jedes Szenarien durch:
- Initial-Fallback: leerer localStorage → statische Liste erscheint; Key wird geschrieben.
- Persisted-Load: Reload → Liste kommt aus localStorage.
- Dashboard-Löschung mit Bestätigung + Propagation-Stop (Trash öffnet keine Akte).
- Sessions-Warnhinweis bei aktiv/pausiert > 0.
- „Abbrechen" behält Kunden; „Ja" entfernt ihn.
- Deletion-persists-across-reload: nach „Ja" Reload → gelöschter Kunde bleibt weg.
- Undo-Toast erscheint 5 s; „Rückgängig" stellt Kunde inkl. Sessions an Originalposition wieder her; nach 5 s verschwindet der Toast, Löschung endgültig.
- Detail-Löschung → Navigation zurück zum Dashboard.
- Empty-States: alle Kund:innen löschen → Dashboard-Empty-State, „Neue Session"/„Session"-Buttons disabled, kein Crash beim Öffnen von Workspace/Kundenakte/ProfileEditor/CompareView ohne Kunden.
- Tastaturnavigation der Dashboard-Kachel (Tab-Fokus, Enter/Space öffnet Akte; Fokus auf Trash-Button navigiert NICHT).

Expected: PASS — alle oben genannten Verhaltensweisen treten ein, keine Konsolenfehler (DevTools → Console leer von Errors).

- [ ] **Step 3: Mandatory CI-Äquivalent-Gates ausführen**

Diese drei Befehle sind für dieses Feature das CI-Äquivalent-Gate. Sie lösen für die `coaching-studio/*.jsx`-Dateien keine gezielten automatisierten Tests aus (es existiert keine Testabdeckung, siehe Global Constraints), müssen aber grün durchlaufen (Freshness-Artefakte, S1–S4-Quality-Ratchet, Baseline-Assertion):

```bash
task test:changed          # Gezielte Tests für geänderte Domains (hier: keine coaching-studio-spezifischen Tests, muss dennoch grün sein)
task freshness:regenerate  # generierte Artefakte aktualisieren (test-inventory, repo-index, …)
task freshness:check       # CI-Äquivalent: Freshness + quality:check (S1–S4-Ratchet) + Baseline-Assertion
```

Expected: alle drei Befehle beenden mit Exit-Code 0. Falls `freshness:regenerate` Artefakte ändert, diese mitcommitten.

- [ ] **Step 4: OpenSpec-Validierung**

```bash
task test:openspec   # oder: bash scripts/openspec.sh validate
```

Expected: `change 'coaching-studio-delete-kundenakte' is valid` (Exit-Code 0).

- [ ] **Step 5: Commit**

```bash
git add website/public/coaching-studio/app.css website/src/data/test-inventory.json
git commit -m "feat(coaching-studio): styling for delete confirm/empty-state/undo-toast + verify"
```

---

## Self-Review — Spec-Abdeckung

| Requirement (spec.md) | Abgedeckt in |
|---|---|
| Kundenliste als React State mit localStorage-Persistenz (Fallback, Persisted-Load, Deletion-persists) | Task 2 |
| Löschen mit Bestätigung — Dashboard-Button, Inline-Confirm, Propagation-Stop, Ja/Abbrechen, Sessions-Warnung | Task 3 |
| Löschen mit Bestätigung — Detail-View-Button, Nav zurück zum Dashboard | Task 4 |
| Rückgängig-Option (Undo-Toast 5 s, Restore inkl. Sessions, Fenster-Ablauf) | Task 2 (State/Toast) + Task 7 (Verify) |
| Sicherer Umgang mit leerer Liste — Dashboard | Task 3 |
| Sicherer Umgang mit leerer Liste — Kundenakte, ProfileEditor | Task 4 |
| Sicherer Umgang mit leerer Liste — Workspace | Task 5 |
| Sicherer Umgang mit leerer Liste — CompareView | Task 6 |
| TopBar/App `CUSTOMERS[0]`-Guard (app.jsx:23/30) | Task 2 |
