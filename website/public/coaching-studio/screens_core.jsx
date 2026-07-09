/* eslint-disable */
// Dashboard (Kundenliste) · Kundenakte · KI-Profil-Editor

function ConfirmDelete({ show, customer, onConfirm, onAbort }){
  if(!show) return null;
  const activeSessions = customer.aktiv + customer.pausiert;
  return (
    <div className="confirm-overlay" onClick={onAbort}>
      <div className="confirm-modal" onClick={(e)=> e.stopPropagation()}>
        <Icon.trash width={32} height={32}/>
        <h3>Kundenakte löschen</h3>
        <p>Sind Sie sicher, dass Sie "{customer.name}" löschen möchten?</p>
        {activeSessions > 0 && (
          <div className="confirm-del">
            <span className="warn-q">Warnung:</span>
            <span className="warn-sessions">{activeSessions} aktive/pausierte Session{activeSessions > 1 ? "en" : ""}</span>
          </div>
        )}
        <div className="confirm-actions">
          <button className="btn btn-quiet" onClick={onAbort}>Abbrechen</button>
          <button className="btn btn-danger" onClick={onConfirm}>Ja, löschen</button>
        </div>
      </div>
    </div>
  );
}

function KundenakteCard({ customer, onNav, onDelete }){
  const [showDelete, setShowDelete] = useState(false);
  const activeSessions = customer.aktiv + customer.pausiert;

  return (
    <button key={customer.id} className="card kunde-card" onClick={()=> onNav("akte", customer)}>
      <div className="head">
        <span className="avatar">{customer.initials}</span>
        <div>
          <div className="name">{customer.name}</div>
          <div className="sub">{customer.category} · {customer.lang} · seit {customer.since}</div>
        </div>
      </div>
      <div className="sess-count">
        <div className="c"><b>{customer.aktiv}</b><span>Aktiv</span></div>
        <div className="c"><b>{customer.pausiert}</b><span>Pausiert</span></div>
        <div className="c"><b>{customer.fertig}</b><span>Fertig</span></div>
      </div>
      <div className="meta">
        {customer.aktiv>0 && <span className="pill pill-aktiv"><span className="dot dot-aktiv pulse"/>Aktiv</span>}
        {customer.pausiert>0 && <span className="pill pill-pausiert"><span className="dot dot-pausiert"/>Pausiert</span>}
        {customer.aktiv===0 && customer.pausiert===0 && <span className="pill pill-fertig"><span className="dot dot-fertig"/>Ruht</span>}
      </div>
      {activeSessions === 0 && (
        <button 
          className="btn btn-quiet" 
          style={{position:"absolute", top:8, right:8}}
          onClick={(e)=>{ e.stopPropagation(); setShowDelete(true); }}
          aria-label={customer.name + " löschen"}
        >
          <Icon.trash width="14" height="14"/>
        </button>
      )}
    </button>
  );
}

function Dashboard({ onNav, customers, onDelete }){
  const [q, setQ] = useState("");
  const list = customers.filter(k=> k.name.toLowerCase().includes(q.toLowerCase()) || k.category.toLowerCase().includes(q.toLowerCase()));
  const sum = customers.reduce((a,k)=> ({ aktiv:a.aktiv+k.aktiv, pausiert:a.pausiert+k.pausiert, fertig:a.fertig+k.fertig }), {aktiv:0,pausiert:0,fertig:0});

  return (
    <div className="screen"><div className="wrap">
      <div className="page-head">
        <div className="eyebrow">Übersicht</div>
        <div className="between" style={{alignItems:"flex-end"}}>
          <h1>Klient:innen &amp; <em>Sessions</em></h1>
          <button className="btn btn-primary" onClick={()=> onNav("workspace", customers[0])} disabled={!customers[0]}><Icon.plus width="15" height="15"/>Neue Session</button>
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

      {list.length > 0 ? (
        <div className="kunden-grid">
          {list.map(customer=> (
            <KundenakteCard 
              key={customer.id} 
              customer={customer} 
              onNav={onNav} 
              onDelete={onDelete} 
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <Icon.people width={48} height={48}/>
          <h3>Keine Klient:innen</h3>
          <p>Erstelle die erste Session, um Klient:innen anzulegen.</p>
        </div>
      )}

      <ConfirmDelete 
        show={showDelete} 
        customer={list[0]}
        onConfirm={()=> onDelete(list[0].id)}
        onAbort={()=> setShowDelete(false)}
      />
    </div></div>
  );
}

// =====================================================================
// 2 · KUNDENAKTE
// =====================================================================
const STATUS_LABEL = { aktiv:"Aktiv", pausiert:"Pausiert", fertig:"Abgeschlossen" };
  const activeProfile = PROFILE_FIELDS.filter(f=> f.active);

  return (
    <div className="screen"><div className="wrap">
      <button className="btn btn-quiet btn-sm" style={{marginBottom:14, paddingInline:0}} onClick={()=> onNav("dashboard")}><Icon.back width="14" height="14"/>Übersicht</button>
      <div className="page-head" style={{borderBottom:"none", marginBottom:8, paddingBottom:0}}>
        <div className="eyebrow">Kundenakte</div>
        {activeSessions > 0 && (
          <div className="warning-badge">Warnung: {activeSessions} aktive/pausierte Session{activeSessions > 1 ? "en" : ""}</div>
        )}
      </div>

      <div className="akte-grid">
        <aside className="akte-aside">
          <div className="card akte-id">
            <div className="head">
              <span className="avatar" style={{width:54,height:54,fontSize:20}}>{k.initials}</span>
              <div>
                <div className="name">{k.name}</div>
                <div className="kicker" style={{marginTop:4}}>Seit {k.since} · {k.lang}</div>
              </div>
            </div>
            <div className="data-list">
              <div className="r"><span className="k">Kategorie</span><span className="v">{k.category}</span></div>
              <div className="r"><span className="k">Sprache</span><span className="v">{k.lang}</span></div>
              <div className="r"><span className="k">Format</span><span className="v">Online · 60 Min</span></div>
              <div className="r"><span className="k">Kontakt</span><span className="v">platzhalter@e-mail</span></div>
              <div className="r"><span className="k">Sessions</span><span className="v">{k.aktiv+k.pausiert+k.fertig} gesamt</span></div>
            </div>
          </div>

          <div className="card profile-pin">
            <div className="ttl">
              <span className="bt mono" style={{fontSize:10,letterSpacing:".14em",textTransform:"uppercase",color:"var(--mute)"}}>KI-Profil · genau 1</span>
              <button className="btn btn-ghost btn-sm" onClick={()=> onNav("profile", k)}>Bearbeiten</button>
            </div>
            <div className="mini">
              {PROFILE_FIELDS.map(f=> (
                <div key={f.key} className={"r" + (f.active ? "" : " off")}>
                  <span className="k">{f.label}</span>
                  <span className="v" style={{flex:1}}>{f.active ? <span className="chk">✓ </span> : ""}{String(f.value).slice(0,28)}{String(f.value).length>28?"…":""}</span>
                </div>
              ))}
            </div>
            <div className="kicker" style={{marginTop:6}}>{activeProfile.length} von {PROFILE_FIELDS.length} aktiv für Session</div>
          </div>

          <button 
            className="btn btn-danger" 
            onClick={()=> onDelete(k.id)}
            disabled={activeSessions > 0}
          >
            {activeSessions > 0 ? "Löschen deaktiviert ("+activeSessions+" Sessions)" : "Kundenakte löschen"}
          </button>
        </aside>

        <div>
          <div className="between" style={{marginBottom:18}}>
            <div className="row gap-sm">
              <span className="serif" style={{fontSize:24,letterSpacing:"-.01em"}}>Sessions</span>
              <span className="kicker">{k.sessions.length} Einträge</span>
            </div>
            <button className="btn btn-primary btn-sm" onClick={()=> onNav("workspace", k)}><Icon.plus width="14" height="14"/>Neue Session</button>
          </div>

          <div className="sessions">
            {k.sessions.map(s=> (
              <div key={s.id} className="session-row">
                <div className="num">{s.no}</div>
                <div>
                  <div className="ttl">{s.title}</div>
                  <div className="sub">
                    <span className={"pill pill-"+s.status} style={{padding:"2px 0", border:"none"}}>
                      <span className={"dot dot-"+s.status}/> {STATUS_LABEL[s.status]}
                    </span>
                    {"  ·  Ebene "+s.level+"/10  ·  "+s.lang+"  ·  "+s.updated}
                  </div>
                </div>
                <div className="acts">
                  <button className="btn btn-primary btn-sm" onClick={()=> onNav("workspace", k)} title="Session fortsetzen">{s.status==="fertig"?"Ansehen":"Fortsetzen"} <Icon.arrow width="13" height="13"/></button>
                  <button className="btn btn-ghost btn-sm" title="Als Vorlage kopieren"><Icon.copy width="13" height="13"/>Vorlage</button>
                  <button className="btn btn-ghost btn-sm" title="Exportieren"><Icon.printer width="13" height="13"/>Export</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div></div>
  );
}

// =====================================================================
// 3 · KI-PROFIL-EDITOR
// =====================================================================
function ProfileEditor({ customer, onNav }){
  if(!customer) return <div className="empty-state">Keine Klient:innen vorhanden</div>;
  
  const k = customer;
  const [fields, setFields] = useState(()=> PROFILE_FIELDS.map(f=> ({...f})));
  const toggle = (i)=> setFields(fs=> fs.map((f,j)=> j===i ? {...f, active:!f.active} : f));
        <div className="eyebrow">KI-Profil · {k.name}</div>
        <div className="between" style={{alignItems:"flex-end"}}>
          <h1>Profil für die <em>KI-Anfrage</em></h1>
          <span className="pill pill-aktiv"><span className="dot dot-activ"/>{activeCount} aktiv</span>
        </div>
      </div>

      <div className="profile-editor">
        <div className="profile-hint">
          <Icon.info/>
          <p>Jeder Profilwert hat ein Kontrollkästchen. <b>Nur markierte Werte</b> werden in die KI-Anfrage übernommen — inaktive Felder bleiben in der Akte, fließen aber nicht in die Session ein. Fragen sind im Admin-Bereich erweiterbar.</p>
        </div>

        {fields.map((f,i)=> (
          <div key={f.key} className={"pq " + (f.active ? "on" : "off")}>
            <label className="cbx">
              <input type="checkbox" checked={f.active} onChange={()=> toggle(i)} aria-label={`${f.label} für Session aktivieren`}/>
              <span className="box"><Icon.check/></span>
            </label>
            <div>
              <div className="q">{f.label} {f.required && <span className="req">· Pflicht</span>}</div>
              {f.type==="textarea"
                ? <textarea className="textarea ed" value={f.value} onChange={(e)=> edit(i,e.target.value)} rows={2}/>
                : <input className="input ed" value={f.value} onChange={(e)=> edit(i,e.target.value)}/>}
              <div className="pq-foot">
                <span className="state-label">{f.active ? "● Aktiv für Session" : "○ Inaktiv — nicht in KI-Anfrage"}</span>
              </div>
            </div>
          </div>
        ))}

        <div className="between admin-add">
          <button className="btn btn-ghost"><Icon.plus width="14" height="14"/>Profilfeld hinzufügen</button>
          <div className="row gap-sm">
            <button className="btn btn-ghost" onClick={()=> onNav("akte", k)}>Abbrechen</button>
            <button className="btn btn-primary" onClick={()=> onNav("akte", k)}>Profil speichern</button>
          </div>
        </div>
      </div>
    </div></div>
  );
}

// Export module components (not to global window - prevents XSS exposure)
export { Dashboard, Kundenakte, ProfileEditor };
EOF && echo "✅ screens_core.jsx written"
