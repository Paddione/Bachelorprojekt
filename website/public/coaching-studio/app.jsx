/* eslint-disable */
// App-Shell — Navigation, RTL-Umschaltung, Screen-Routing.

function TopBar({ screen, onNav, rtl, setRtl }){
  const navItems = [
    { id:"dashboard", label:"Übersicht" },
  ];
  return (
    <header className="topbar">
      <div className="brand-row">
        <BrandMark size={30}/>
        <span className="name">mentolder<span className="dot">.</span></span>
      </div>
      <span className="brand-sub">Coaching Sessions</span>
      <nav className="topnav" aria-label="Hauptnavigation">
        {navItems.map(n=> (
          <button key={n.id} className={(screen===n.id ? "is-active":"")} onClick={()=> onNav(n.id)}>{n.label}</button>
        ))}
        <button onClick={()=> window.location.href = "/admin/coaching/sessions"}>Sessions-Liste</button>
      </nav>
      <span className="spacer"/>
      <div className="topbar-tools">
        <button className={"icon-btn"+(rtl?" is-on":"")} onClick={()=> setRtl(!rtl)} aria-pressed={rtl} title="RTL-Layout umschalten (Farsi/Arabisch)"><Icon.rtl/></button>
        <button className="btn btn-primary btn-sm" onClick={()=> onNav("workspace", CUSTOMERS[0])}><Icon.plus width="14" height="14"/>Session</button>
      </div>
    </header>
  );
}

function App(){
  const [route, setRoute] = useState({ screen:"dashboard", customer:CUSTOMERS[0] });
  const [rtl, setRtl] = useState(false);

  useEffect(()=> { document.documentElement.dir = rtl ? "rtl" : "ltr"; }, [rtl]);

  const onNav = (screen, customer)=> {
    setRoute(r=> ({ screen, customer: customer || r.customer }));
    window.scrollTo(0,0);
  };

  const { screen, customer } = route;
  let view;
  if(screen==="dashboard") view = <Dashboard onNav={onNav}/>;
  else if(screen==="akte") view = <Kundenakte customer={customer} onNav={onNav}/>;
  else if(screen==="profile") view = <ProfileEditor customer={customer} onNav={onNav}/>;
  else if(screen==="workspace") view = <Workspace customer={customer} onNav={onNav}/>;
  else if(screen==="compare") view = <CompareView customer={customer} onNav={onNav}/>;
  else if(screen==="admin") view = <AdminArea onNav={onNav}/>;
  else view = <Dashboard onNav={onNav}/>;

  return (
    <div className="app">
      <TopBar screen={screen} onNav={onNav} rtl={rtl} setRtl={setRtl}/>
      {view}
    </div>
  );
}

window.__studioRoot = window.__studioRoot || ReactDOM.createRoot(document.getElementById("root"));
window.__studioRoot.render(<App/>);
