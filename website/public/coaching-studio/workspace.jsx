/* eslint-disable */
// Session-Workspace — Herzstück.
// 10-Ebenen-Navigation · Pro-Ebene Prompt-Editor (Standard + Reset-Schalter) ·
// Zwischenablage · Eingabe + Mic-Zustände · Transkriptions-Review ·
// KI-Antwort · Übersetzungs-Panel (DE ∥ Zielsprache, TTS).

function Waveform({ active, bars=34 }){
  const hs = useRef(Array.from({length:bars}, (_,i)=> 5 + Math.abs(Math.sin(i*1.3))*16 )).current;
  return (
    <div className="waveform" aria-hidden="true">
      {hs.map((h,i)=> <i key={i} style={{height:`${active ? h : Math.max(4,h*0.4)}px`, opacity: active?1:.5}}/>) }
    </div>
  );
}

function ResetSwitch({ isDefault, onReset }){
  return (
    <button
      className={"switch" + (isDefault ? " on" : "")}
      onClick={()=> { if(!isDefault) onReset(); }}
      aria-pressed={isDefault}
      title={isDefault ? "Standard-Prompt aktiv" : "Auf Standard-Prompt zurücksetzen"}
    >
      <span className="track"><span className="knob"/></span>
      <span>{isDefault ? "Standard" : "Zurücksetzen"}</span>
    </button>
  );
}

function ClipboardPanel({ items, onAdd, onRemove }){
  return (
    <div className="aux-sec">
      <div className="block-head">
        <div className="bl"><span className="bt">Zwischenablage</span></div>
        <span className="kicker">{items.length} · leert n. Senden</span>
      </div>
      <div className="clip">
        {items.length === 0 && (
          <div className="clip-empty">Leer — Notizen sammeln sich hier, bis Sie senden oder die Ebene wechseln</div>
        )}
        {items.map((it)=> (
          <div className="clip-item" key={it.id}>
            <span>{it.text}</span>
            <button onClick={()=> onRemove(it.id)} aria-label="Aus Zwischenablage entfernen"><Icon.x/></button>
          </div>
        ))}
        <button className="clip-add" onClick={onAdd}>+ Notiz aus Eingabe ablegen</button>
      </div>
    </div>
  );
}

function TranslationPanel(){
  const [lang, setLang] = useState(TARGET_LANGS[0]);
  const [playing, setPlaying] = useState(null);
  const play = (which)=> { setPlaying(which); setTimeout(()=> setPlaying(null), 1600); };
  return (
    <div className="aux-sec">
      <div className="block-head">
        <div className="bl"><Icon.globe width="14" height="14" style={{color:"var(--mute)"}}/><span className="bt">Übersetzung</span></div>
      </div>
      <div className="tl-langs" role="tablist" aria-label="Zielsprache">
        {TARGET_LANGS.map(l=> (
          <button key={l.code} role="tab" aria-selected={l.code===lang.code}
            className={"tl-lang" + (l.code===lang.code ? " is-active" : "")}
            onClick={()=> setLang(l)}>{l.label}{l.rtl ? " ·rtl" : ""}</button>
        ))}
      </div>
      <div className="tl-pair">
        <div className="tl-col">
          <div className="tl-top">
            <span className="tl-lab">Deutsch · Original</span>
            <button className={"tts"+(playing==="de"?" playing":"")} onClick={()=> play("de")}>
              <Icon.speaker/>{playing==="de" ? "Spricht…" : "Vorlesen"}
            </button>
          </div>
          <div className="tl-text">{SOURCE_DE}</div>
        </div>
        <div className={"tl-col" + (lang.rtl ? " rtl" : "")}>
          <div className="tl-top">
            <span className="tl-lab">{lang.label}{lang.rtl ? " · RTL" : ""}</span>
            <button className={"tts"+(playing==="t"?" playing":"")} onClick={()=> play("t")}>
              <Icon.speaker/>{playing==="t" ? "Spricht…" : "Vorlesen"}
            </button>
          </div>
          <div className="tl-text" dir={lang.rtl ? "rtl" : "ltr"} lang={lang.code}>{lang.sample}</div>
        </div>
      </div>
    </div>
  );
}

function Workspace({ customer, onNav }){
  const cust = customer || CUSTOMERS[0] || EMPTY_CUSTOMER;
  const [active, setActive] = useState(0);
  const [prompts, setPrompts] = useState(()=> LEVELS.map(l=> l.prompt));
  const [done, setDone] = useState(()=> LEVELS.map(()=> false));
  const [clip, setClip] = useState([]);
  const [input, setInput] = useState("");
  const [mic, setMic] = useState("idle");
  const [transcript, setTranscript] = useState("");
  const [answer, setAnswer] = useState(()=> LEVELS.map(()=> null));
  const railRef = useRef(null);

  const lvl = LEVELS[active];
  const isDefault = prompts[active] === lvl.prompt;

  const switchLevel = (i)=> {
    if(i===active) return;
    setActive(i); setClip([]); setMic("idle"); setTranscript(""); setInput("");
  };

  const editPrompt = (v)=> setPrompts(p=> p.map((x,i)=> i===active ? v : x));
  const resetPrompt = ()=> setPrompts(p=> p.map((x,i)=> i===active ? LEVELS[i].prompt : x));

  const send = ()=> {
    setAnswer(a=> a.map((x,i)=> i===active ? lorem(2) : x));
    setClip([]); setInput(""); setMic("idle"); setTranscript("");
    setDone(d=> d.map((x,i)=> i===active ? true : x));
  };

  const addClip = ()=> {
    const text = input.trim() || "Notiz – Platzhalter";
    setClip(c=> [...c, { id:Date.now()+Math.random(), text }]);
  };
  const removeClip = (id)=> setClip(c=> c.filter(x=> x.id!==id));

  const micClick = ()=> {
    if(mic==="idle") setMic("recording");
    else if(mic==="recording"){ setMic("review"); setTranscript("Transkription (Platzhalter): aufgenommener Sprachbeitrag, vor dem Absenden frei editierbar."); }
    else setMic("idle");
  };
  const acceptTranscript = ()=> { setInput(t=> (t ? t+" " : "") + transcript); setMic("idle"); setTranscript(""); };

  const railKey = (e)=> {
    if(e.key==="ArrowDown"){ e.preventDefault(); switchLevel(Math.min(LEVELS.length-1, active+1)); }
    if(e.key==="ArrowUp"){ e.preventDefault(); switchLevel(Math.max(0, active-1)); }
  };

  const ans = answer[active];

  return (
    <div className="ws">
      {/* ---------- Linke Ebenen-Navigation ---------- */}
      <nav className="ws-rail hide-sc" aria-label="Gesprächsverlauf · 10 Ebenen" ref={railRef} onKeyDown={railKey}>
        <div className="rail-head">
          <div className="t">Gesprächsverlauf</div>
        </div>
        {LEVELS.map((l,i)=> (
          <button key={l.no}
            className={"lvl" + (i===active ? " is-active" : "") + (done[i] ? " done" : "")}
            aria-current={i===active ? "step" : undefined}
            tabIndex={i===active ? 0 : -1}
            onClick={()=> switchLevel(i)}>
            <span className="lvl-no">{done[i] ? <Icon.check width="13" height="13"/> : l.no}</span>
            <span className="lvl-name">{l.name}</span>
          </button>
        ))}
      </nav>

      {/* mobile horizontal rail */}
      <div className="ws-railbar hide-sc" aria-hidden="true">
        {LEVELS.map((l,i)=> (
          <button key={l.no} className={"chip"+(i===active?" is-active":"")} onClick={()=> switchLevel(i)}>
            <span className="mono">{l.no}</span> {l.name}
          </button>
        ))}
      </div>

      {/* ---------- Hauptbereich ---------- */}
      <main className="ws-main hide-sc">
        <header className="ws-mhead">
          <div>
            <div className="lno">Ebene {lvl.no} — {cust.name}</div>
            <h2>{lvl.name}</h2>
            <p className="goal">{lvl.goal}</p>
          </div>
          <div className="who">
            <div className="nm serif">{cust.name}</div>
            <div className="rl">{cust.category} · {cust.lang}</div>
            <div className="row" style={{justifyContent:"flex-end", marginTop:10, gap:8}}>
              <button className="btn btn-ghost btn-sm" onClick={()=> onNav && onNav("compare", cust)} title="Alt vs. Neu vergleichen"><Icon.split width="14" height="14"/>Vergleich</button>
              <button className="btn btn-ghost btn-sm" onClick={()=> window.open("Export.html","_blank")} title="Export / Druck"><Icon.printer width="14" height="14"/>Export</button>
            </div>
          </div>
        </header>

        {/* Prompt-Editor */}
        <section className="block">
          <div className="block-head">
            <div className="bl"><span className="bt">Prompt · Ebene {lvl.no}</span></div>
            <div className="actions">
              <span className="prompt-meta">{isDefault ? "Standard geladen" : <span className="edited-tag">bearbeitet</span>}</span>
              <ResetSwitch isDefault={isDefault} onReset={resetPrompt}/>
            </div>
          </div>
          <div className={"prompt-box" + (isDefault ? "" : " edited")}>
            <textarea className="textarea" value={prompts[active]} onChange={(e)=> editPrompt(e.target.value)}
              aria-label={`Prompt für Ebene ${lvl.no}`} spellCheck="false"/>
          </div>
        </section>

        {/* Eingabe + Mic */}
        <section className="block">
          <div className="block-head">
            <div className="bl"><span className="bt">Eingabe</span></div>
            <span className="kicker">Tastatur + Coach-Mic</span>
          </div>
          <div className="input-dock">
            <textarea className="textarea" value={input} onChange={(e)=> setInput(e.target.value)}
              placeholder="Beitrag eingeben — oder über das Mikrofon aufnehmen…" aria-label="Eingabefeld"/>
            <div className="dock-foot">
              <div className="left">
                <button className={"mic-btn" + (mic==="recording" ? " rec" : "")} onClick={micClick}
                  aria-pressed={mic!=="idle"} aria-label={mic==="idle"?"Aufnahme starten":mic==="recording"?"Aufnahme beenden":"Aufnahme verwerfen"} title="Coach-Mikrofon (Zustände)">
                  {mic==="recording" ? <Icon.pause/> : <Icon.mic/>}
                </button>
                {mic==="recording"
                  ? <div className="row gap-sm"><Waveform active={true}/><span className="hint">Aufnahme … tippen zum Beenden</span></div>
                  : <span className="hint">{mic==="review" ? "Transkription prüfen" : "Bereit"}</span>}
              </div>
              <button className="btn btn-primary" onClick={send} disabled={mic==="recording"}>
                Senden <Icon.send width="14" height="14"/>
              </button>
            </div>
          </div>

          {/* Transkriptions-Review */}
          {mic==="review" && (
            <div className="transcript">
              <div className="tr-head">
                <span className="lab">Transkription · Review</span>
                <Waveform active={false} bars={28}/>
                <div className="tr-acts">
                  <button className="btn btn-ghost btn-sm" title="Abspielen"><Icon.play width="13" height="13"/>Abspielen</button>
                  <button className="btn btn-ghost btn-sm" onClick={()=> setMic("recording")} title="Neu aufnehmen"><Icon.replace width="13" height="13"/>Ersetzen</button>
                  <button className="btn btn-ghost btn-sm" onClick={()=> { setMic("idle"); setTranscript(""); }} title="Löschen"><Icon.trash width="13" height="13"/>Löschen</button>
                </div>
              </div>
              <textarea className="textarea" value={transcript} onChange={(e)=> setTranscript(e.target.value)} aria-label="Transkription bearbeiten"/>
              <div className="row" style={{justifyContent:"flex-end"}}>
                <button className="btn btn-primary btn-sm" onClick={acceptTranscript}>In Eingabe übernehmen <Icon.arrow width="13" height="13"/></button>
              </div>
            </div>
          )}
        </section>

        {/* KI-Antwort */}
        <section className="block">
          <div className="block-head">
            <div className="bl"><span className="bt">KI-Antwort</span></div>
          </div>
          <div className={"answer" + (ans ? "" : " empty")}>
            <div className="a-head">
              <span className="lab"><span className="dot dot-aktiv"/>Antwort · Ebene {lvl.no}</span>
              {ans && <button className="btn btn-quiet btn-sm" onClick={addClip}><Icon.copy width="13" height="13"/>In Zwischenablage</button>}
            </div>
            <div className="a-body">
              {ans ? ans.map((p,i)=> <p key={i}>{p}</p>) : <p>Noch keine Antwort — Eingabe senden, um eine Antwort für diese Ebene zu erzeugen.</p>}
            </div>
          </div>
        </section>
      </main>

      {/* ---------- Rechte Spalte: Zwischenablage + Übersetzung ---------- */}
      <aside className="ws-aux hide-sc" aria-label="Zwischenablage und Übersetzung">
        <ClipboardPanel items={clip} onAdd={addClip} onRemove={removeClip}/>
        <TranslationPanel/>
      </aside>
    </div>
  );
}

window.Workspace = Workspace;
