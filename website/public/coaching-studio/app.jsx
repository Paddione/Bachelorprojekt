/* eslint-disable */
// App-Shell — Navigation, RTL-Umschaltung, Screen-Routing, Kunden-State.

const CUSTOMERS_LS_KEY = "coaching-studio-customers";

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

function UndoToast({ undo, onUndo }){
  if(!undo) return null;
  return (
    <div className="undo-toast" role="status" aria-live="polite">
      <span>{undo.customer.name} gelöscht</span>
      <button className="btn btn-quiet btn-sm" onClick={onUndo}>Rückgängig</button>
    </div>
  );
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

function App(){
  const [customers, setCustomers] = useState(loadCustomers);
  const [route, setRoute] = useState({ screen:"dashboard", customer: undefined });
  const [rtl, setRtl] = useState(false);
  const [undo, setUndo] = useState(null);

  useEffect(()=> { document.documentElement.dir = rtl ? "rtl" : "ltr"; }, [rtl]);
  useEffect(()=> { try { localStorage.setItem(CUSTOMERS_LS_KEY, JSON.stringify(customers)); } catch(e){} }, [customers]);
  useEffect(()=> { if(!undo) return; const t = setTimeout(()=> setUndo(null), 5000); return ()=> clearTimeout(t); }, [undo]);

  const onNav = (screen, customer)=> {
    if(screen === "dashboard") { setRoute(r=> ({ screen: "dashboard", customer: undefined })); return; }
    setRoute(r=> ({ screen, customer: customer || r.customer }));
    window.scrollTo(0,0);
  };

  const onDelete = (id)=> {
    const idx = customers.findIndex(c => c.id === id);
    if(idx < 0) return;
    const deleted = customers[idx];
    setCustomers(cs=> cs.filter((_, i) => i !== idx));
    setUndo({ customer: deleted, index: idx });
  };

  const onUndo = ()=> {
    if(!undo || undo.customer === undefined) return;
    const cs = [...customers];
    cs.splice(undo.index, 0, undo.customer);
    setCustomers(cs);
    setUndo(null);
  };

  const { screen, customer } = route;
  let view;
  
  if(screen==="dashboard") {
    if(customers.length === 0) {
      view = <div className="screen"><div className="wrap">
        <button className="btn btn-quiet btn-sm" style={{marginBottom:14, paddingInline:0}} onClick={()=> onNav("dashboard")}><Icon.back width="14" height="14"/>Übersicht</button>
        <div className="empty-state kicker">Keine Klient:innen vorhanden — lege eine neue Session an, sobald Daten existieren.</div>
      </div></div>;
    } else {
      view = <Dashboard onNav={onNav} customers={customers} onDelete={onDelete}/>;
    }
  } else if(screen==="akte") {
    view = <Kundenakte customer={customer} onNav={onNav} onDelete={onDelete}/>;
  } else if(screen==="profile") {
    view = <ProfileEditor customer={customer} onNav={onNav}/>;
  } else if(screen==="workspace") {
    view = <Workspace customer={customer} onNav={onNav}/>;
  } else if(screen==="compare") {
    view = <CompareView customer={customer} onNav={onNav}/>;
  } else if(screen==="admin") {
    view = <AdminArea onNav={onNav}/>;
  } else {
    view = <Dashboard onNav={onNav}/>;
  }

  return (
    <div className="app">
      <TopBar screen={screen} onNav={onNav} rtl={rtl} setRtl={setRtl} customers={customers}/>
      <UndoToast undo={undo} onUndo={onUndo}/>
      {view}
    </div>
  );
}

window.__studioRoot = window.__studioRoot || ReactDOM.createRoot(document.getElementById("root"));
window.__studioRoot.render(<App/>);
EOF && echo "✅ app.jsx written"
