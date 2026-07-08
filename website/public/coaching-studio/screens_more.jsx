/* eslint-disable */
// Vergleichsansicht (Alt vs Neu) · Admin-Bereich

// =====================================================================
// 5 · VERGLEICHSANSICHT — Split (Vorlage links · neue Session rechts)
// =====================================================================
function CompareView({ customer, onNav }){
  const diffs = { 2:true, 5:true, 8:true, 9:true };
  return (
    <div className="screen"><div className="wrap">
      <button className="btn btn-quiet btn-sm" style={{marginBottom:14, paddingInline:0}} onClick={()=> onNav("workspace", k)}><Icon.back width="14" height="14"/>Zurück zur Session</button>
      <div className="page-head">
        <div className="eyebrow">Vergleich · Alt vs. Neu</div>
        <div className="between" style={{alignItems:"flex-end"}}>
          <h1>Vorlage gegen <em>neue Session</em></h1>
          <div className="row gap-sm">
            <span className="pill"><span className="dot dot-fertig"/>{Object.keys(diffs).length} Abweichungen</span>
            <button className="btn btn-ghost btn-sm"><Icon.printer width="13" height="13"/>Export</button>
          </div>
        </div>
      </div>

      <div className="compare">
        <div className="cmp-col alt">
          <div className="cmp-head">
            <span className="badge">Vorlage · Alt</span>
            <span className="kicker">Session 03 · abgeschlossen</span>
          </div>
          <div className="cmp-body">
            {LEVELS.map((l,i)=> (
              <div key={l.no} className={"cmp-lvl" + (diffs[i] ? " diff" : "")}>
                <div className="ch">{l.no} — {l.name}</div>
                <div className="cp">{LOREM[i % LOREM.length]}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="cmp-col neu">
          <div className="cmp-head">
            <span className="badge">Neue Session</span>
            <span className="kicker">{k.name} · in Arbeit</span>
          </div>
          <div className="cmp-body">
            {LEVELS.map((l,i)=> (
              <div key={l.no} className={"cmp-lvl" + (diffs[i] ? " diff" : "")}>
                <div className="ch">{l.no} — {l.name} {diffs[i] && <span style={{color:"var(--brass)"}}>· geändert</span>}</div>
                <div className="cp">{LOREM[(i+2) % LOREM.length]}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div></div>
  );
}

// =====================================================================
// 8 · ADMIN — Standard-Profilfragen + 10 Ebenen-Standard-Prompts
// =====================================================================
function AdminArea({ onNav }){
  const [tab, setTab] = useState("ebenen");
  return (
    <div className="screen"><div className="wrap">
      <button className="btn btn-quiet btn-sm" style={{marginBottom:14, paddingInline:0}} onClick={()=> onNav("dashboard")}><Icon.back width="14" height="14"/>Übersicht</button>
      <div className="page-head">
        <div className="eyebrow">Admin</div>
        <h1>Standards &amp; <em>Vorlagen</em></h1>
      </div>

      <div className="admin-tabs" role="tablist">
        <button role="tab" aria-selected={tab==="ebenen"} className={"admin-tab"+(tab==="ebenen"?" is-active":"")} onClick={()=> setTab("ebenen")}>10 Ebenen · Standard-Prompts</button>
        <button role="tab" aria-selected={tab==="fragen"} className={"admin-tab"+(tab==="fragen"?" is-active":"")} onClick={()=> setTab("fragen")}>Standard-Profilfragen</button>
      </div>

      {tab==="ebenen" ? <AdminLevels/> : <AdminQuestions/>}
    </div></div>
  );
}

function AdminLevels(){
  const [levels, setLevels] = useState(()=> LEVELS.map(l=> ({...l})));
  const edit = (i, field, v)=> setLevels(ls=> ls.map((l,j)=> j===i ? {...l, [field]:v} : l));
  return (
    <div className="admin-list">
      <div className="profile-hint">
        <Icon.info/>
        <p>Diese Standard-Prompts werden in jeder neuen Session pro Ebene vorgeladen. Coaches können sie pro Session überschreiben und mit dem Reset-Schalter wieder auf diesen Standard zurücksetzen.</p>
      </div>
      {levels.map((l,i)=> (
        <div key={l.no} className="admin-item">
          <div className="ai-head">
            <div className="row gap-sm">
              <span className="ai-grip"><Icon.grip width="16" height="16"/></span>
              <span className="ai-no">EBENE {l.no}</span>
              <input className="input" style={{width:260}} value={l.name} onChange={(e)=> edit(i,"name",e.target.value)} aria-label={`Name Ebene ${l.no}`}/>
            </div>
            <button className="btn btn-quiet btn-sm" aria-label="Ebene entfernen"><Icon.trash width="14" height="14"/></button>
          </div>
          <div className="field">
            <label>Ziel</label>
            <input className="input" value={l.goal} onChange={(e)=> edit(i,"goal",e.target.value)}/>
          </div>
          <div className="field">
            <label>Standard-Prompt</label>
            <textarea className="textarea" value={l.prompt} onChange={(e)=> edit(i,"prompt",e.target.value)} rows={3} spellCheck="false"/>
          </div>
        </div>
      ))}
      <div className="between admin-add">
        <button className="btn btn-ghost"><Icon.plus width="14" height="14"/>Ebene hinzufügen</button>
        <button className="btn btn-primary">Standards speichern</button>
      </div>
    </div>
  );
}

function AdminQuestions(){
  const [fields, setFields] = useState(()=> PROFILE_FIELDS.map(f=> ({...f})));
  const edit = (i, field, v)=> setFields(fs=> fs.map((f,j)=> j===i ? {...f, [field]:v} : f));
  return (
    <div className="admin-list">
      <div className="profile-hint">
        <Icon.info/>
        <p>Diese Felder bilden das Standard-KI-Profil für neue Klient:innen — inhaltlich und strukturell. Typ und Pflichtstatus bestimmen, wie das Feld im Profil-Editor erscheint.</p>
      </div>
      {fields.map((f,i)=> (
        <div key={f.key} className="admin-item">
          <div className="ai-head">
            <div className="row gap-sm">
              <span className="ai-grip"><Icon.grip width="16" height="16"/></span>
              <input className="input" style={{width:300}} value={f.label} onChange={(e)=> edit(i,"label",e.target.value)} aria-label="Feldname"/>
            </div>
            <button className="btn btn-quiet btn-sm" aria-label="Feld entfernen"><Icon.trash width="14" height="14"/></button>
          </div>
          <div className="field">
            <label>Standardwert / Platzhalter</label>
            <input className="input" value={f.value} onChange={(e)=> edit(i,"value",e.target.value)}/>
          </div>
          <div className="meta-row">
            <div className="row gap-sm">
              <span className="kicker">Typ</span>
              <div className="seg">
                <button className={f.type==="text"?"is-active":""} onClick={()=> edit(i,"type","text")}>Text</button>
                <button className={f.type==="textarea"?"is-active":""} onClick={()=> edit(i,"type","textarea")}>Mehrzeilig</button>
              </div>
            </div>
            <label className="row gap-sm" style={{cursor:"pointer"}}>
              <span className="cbx">
                <input type="checkbox" checked={f.required} onChange={()=> edit(i,"required",!f.required)} aria-label="Pflichtfeld"/>
                <span className="box"><Icon.check/></span>
              </span>
              <span className="kicker">Pflichtfeld</span>
            </label>
            <label className="row gap-sm" style={{cursor:"pointer"}}>
              <span className="cbx">
                <input type="checkbox" checked={f.active} onChange={()=> edit(i,"active",!f.active)} aria-label="Standardmäßig aktiv"/>
                <span className="box"><Icon.check/></span>
              </span>
              <span className="kicker">Standardmäßig aktiv</span>
            </label>
          </div>
        </div>
      ))}
      <div className="between admin-add">
        <button className="btn btn-ghost"><Icon.plus width="14" height="14"/>Frage hinzufügen</button>
        <button className="btn btn-primary">Standards speichern</button>
      </div>
    </div>
  );
}

window.CompareView = CompareView;
window.AdminArea = AdminArea;
