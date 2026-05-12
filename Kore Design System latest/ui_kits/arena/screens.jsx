// Arena UI kit — screens.jsx — Home / Lobby / Game / Results / CharacterPicker

const { useState: useS } = React;

function HomeScreen({ onCreate, onJoin }) {
  const [code, setCode] = useS("");
  const lobbies = [
    { code: "ZK4M9X", players: 3, max: 6, bestOf: 3, host: "polly_42" },
    { code: "QH2WLD", players: 5, max: 6, bestOf: 1, host: "noir.cloud" },
    { code: "BX7TVN", players: 2, max: 4, bestOf: 5, host: "alex.k" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 48 }}>
      <section>
        <Eyebrow>[ 01 ]&nbsp;&nbsp; ARENA · BATTLE ROYALE</Eyebrow>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 64, lineHeight: 1.02, letterSpacing: "-.02em", margin: "16px 0 14px" }}>
          A small, fast match. <em style={{ color: "var(--lime-2)" }}>Best of three.</em>
        </h1>
        <p className="lede" style={{ maxWidth: 560 }}>
          Two HP, one armor. Gun does one damage, melee is instant. Items spawn every sixty seconds. The zone shrinks if you let it.
        </p>
        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <Btn kind="primary" size="lg" onClick={onCreate}>Create lobby</Btn>
          <Btn kind="secondary" size="lg">World campaign</Btn>
          <Btn kind="ghost" size="lg">Loadout · store</Btn>
        </div>
        <div style={{ marginTop: 48 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingBottom: 14, borderBottom: "1px solid var(--line)" }}>
            <span className="eyebrow" style={{ color: "var(--mute)" }}>OPEN LOBBIES &nbsp;· {lobbies.length}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--mute)", letterSpacing: ".16em" }}>REFRESH · 10S</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
            {lobbies.map((l) => (
              <div key={l.code} style={{
                display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 16, alignItems: "center",
                padding: "14px 18px", background: "rgba(255,255,255,.03)",
                border: "1px solid var(--line)", borderRadius: "var(--radius-md)",
              }}>
                <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, letterSpacing: ".2em", fontSize: 14, color: "var(--lime)" }}>{l.code}</div>
                <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--fg-soft)" }}>
                  hosted by <b style={{ color: "var(--fg)", fontWeight: 500 }}>{l.host}</b>
                  <span style={{ color: "var(--mute)" }}> · best of {l.bestOf}</span>
                </div>
                <Pill tone={l.players >= l.max ? "fail" : "lime"} dot>{l.players}/{l.max}</Pill>
                <Btn kind="secondary" size="sm">Join</Btn>
              </div>
            ))}
          </div>
        </div>
      </section>
      <aside>
        <Panel>
          <Eyebrow>JOIN BY CODE</Eyebrow>
          <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="Lobby code">
              <Input code value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6} placeholder="ZK4M9X" />
            </Field>
            <Btn kind="primary" full onClick={() => onJoin(code)}>Join lobby</Btn>
          </div>
        </Panel>
        <Panel style={{ marginTop: 16 }}>
          <Eyebrow>SEASON 04 · STANDING</Eyebrow>
          <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 48, lineHeight: 1 }}>1,284</div>
              <div className="small" style={{ color: "var(--fg-soft)", marginTop: 4 }}>RESPECT</div>
            </div>
            <Pill tone="teal" dot>+ 84 today</Pill>
          </div>
          <div style={{ marginTop: 14, height: 4, background: "var(--ink-800)", borderRadius: 999, overflow: "hidden" }}>
            <div style={{ width: "62%", height: "100%", background: "var(--lime)" }} />
          </div>
          <div className="small" style={{ color: "var(--mute)", marginTop: 8, fontFamily: "var(--font-mono)", letterSpacing: ".12em" }}>
            ELITE · 716 / 1500 TO ASCENDED
          </div>
        </Panel>
      </aside>
    </div>
  );
}

function LobbyScreen() {
  const players = [
    { name: "alex.k",     ready: true,  host: true,  char: "warrior" },
    { name: "polly_42",   ready: true,  char: "rogue" },
    { name: "noir.cloud", ready: false, char: "mage" },
    { name: "stray.bit",  ready: false, char: "tank" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 32 }}>
      <section>
        <Eyebrow>LOBBY · ZK4M9X</Eyebrow>
        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 40, margin: "12px 0 24px" }}>
          Waiting on <em style={{ color: "var(--lime-2)" }}>2 of 4</em> ready.
        </h2>
        <Panel padded={false}>
          {players.map((p, i) => (
            <div key={p.name} style={{
              display: "grid", gridTemplateColumns: "44px 1fr auto auto", gap: 16, alignItems: "center",
              padding: "14px 20px", borderTop: i === 0 ? "none" : "1px solid var(--line)",
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 8, overflow: "hidden",
                background: "var(--ink-800)", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <img src={`../../assets/arena/${p.char}-stand-00.png`} style={{ width: "100%", height: "100%", imageRendering: "pixelated" }} alt="" />
              </div>
              <div>
                <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--fg)" }}>
                  {p.name} {p.host && <span style={{ color: "var(--lime)", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".18em", marginLeft: 8 }}>HOST</span>}
                </div>
                <div className="small" style={{ color: "var(--mute)", textTransform: "capitalize" }}>{p.char}</div>
              </div>
              <Pill tone={p.ready ? "lime" : "neutral"} dot>{p.ready ? "ready" : "idle"}</Pill>
              {p.host ? <Btn kind="ghost" size="sm">Edit</Btn> : <span style={{ width: 36 }} />}
            </div>
          ))}
        </Panel>
      </section>
      <aside style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Panel>
          <Eyebrow>HOST SETTINGS</Eyebrow>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 14 }}>
            <Field label="Best of"><div style={{ display: "flex", gap: 6 }}>{[1, 3, 5].map((n) => (
              <button key={n} style={{
                flex: 1, padding: "8px 0", background: n === 3 ? "var(--lime-tint)" : "var(--ink-800)",
                color: n === 3 ? "var(--lime)" : "var(--fg-soft)",
                border: "1px solid " + (n === 3 ? "var(--lime)" : "var(--line-2)"), borderRadius: 8,
                fontFamily: "var(--font-mono)", fontSize: 12,
              }}>{n}</button>
            ))}</div></Field>
            <Field label="Zone shrink"><div style={{ display: "flex", gap: 6 }}>{["off", "slow", "fast"].map((z) => (
              <button key={z} style={{
                flex: 1, padding: "8px 0", background: z === "slow" ? "var(--lime-tint)" : "var(--ink-800)",
                color: z === "slow" ? "var(--lime)" : "var(--fg-soft)",
                border: "1px solid " + (z === "slow" ? "var(--lime)" : "var(--line-2)"), borderRadius: 8,
                fontFamily: "var(--font-mono)", fontSize: 12, textTransform: "uppercase", letterSpacing: ".1em",
              }}>{z}</button>
            ))}</div></Field>
            <Field label="Item spawn (s)"><Input value="60" onChange={() => {}} /></Field>
          </div>
        </Panel>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Btn kind="primary" full size="lg">Start match</Btn>
          <Btn kind="ghost" full>Leave lobby</Btn>
        </div>
      </aside>
    </div>
  );
}

function GameScreen() {
  return (
    <div>
      <Eyebrow>IN MATCH · ROUND 2 OF 3</Eyebrow>
      <Panel padded={false} style={{ marginTop: 14, position: "relative", overflow: "hidden", padding: 0 }}>
        {/* Arena board */}
        <div style={{
          position: "relative", aspectRatio: "16/9", background:
            "radial-gradient(60% 60% at 50% 50%, #2C2240 0%, #1A1326 60%, #120D1C 100%)",
          backgroundSize: "cover",
        }}>
          {/* zone */}
          <div style={{ position: "absolute", inset: "8% 12%", borderRadius: "50%", border: "1px dashed rgba(200,247,106,.4)", boxShadow: "inset 0 0 80px rgba(200,247,106,.06)" }} />
          {/* grid */}
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: .15 }}>
            <defs><pattern id="g" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="#fff" strokeWidth=".5"/></pattern></defs>
            <rect width="100%" height="100%" fill="url(#g)"/>
          </svg>
          {/* cover */}
          <img src="../../arena-assets/crate-00.png" style={{ position: "absolute", left: "30%", top: "40%", width: 56, imageRendering: "pixelated" }} alt="" />
          <img src="../../arena-assets/bush-00.png" style={{ position: "absolute", left: "55%", top: "55%", width: 56, imageRendering: "pixelated" }} alt="" />
          <img src="../../arena-assets/pillar-00.png" style={{ position: "absolute", left: "70%", top: "30%", width: 56, imageRendering: "pixelated" }} alt="" />
          {/* you */}
          <img src="../../arena-assets/warrior-stand-00.png" style={{ position: "absolute", left: "44%", top: "48%", width: 64, imageRendering: "pixelated", filter: "drop-shadow(0 0 8px rgba(200,247,106,.6))" }} alt="" />
          <img src="../../arena-assets/rogue-stand-00.png"   style={{ position: "absolute", left: "62%", top: "62%", width: 64, imageRendering: "pixelated" }} alt="" />
          <img src="../../arena-assets/mage-stand-00.png"    style={{ position: "absolute", left: "26%", top: "30%", width: 64, imageRendering: "pixelated" }} alt="" />

          {/* HUD top */}
          <div style={{ position: "absolute", top: 18, left: 24, right: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".18em", color: "var(--mute)" }}>HP / ARMOR</span>
              <div style={{ display: "flex", gap: 6 }}>
                <span style={{ width: 28, height: 8, background: "var(--fail)", borderRadius: 2 }} />
                <span style={{ width: 28, height: 8, background: "var(--fail)", borderRadius: 2 }} />
                <span style={{ width: 28, height: 8, background: "var(--teal)", borderRadius: 2 }} />
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 36, lineHeight: 1 }}>01:24</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".18em", color: "var(--mute)", marginTop: 4 }}>ROUND 2 / 3</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".18em", color: "var(--mute)" }}>ALIVE</span>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 28 }}>3</div>
            </div>
          </div>

          {/* kill feed */}
          <div style={{ position: "absolute", top: 18, right: 24, marginTop: 80, display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-soft)", background: "rgba(0,0,0,.3)", padding: "4px 10px", borderRadius: 6 }}>
              <b style={{ color: "var(--lime)" }}>polly_42</b> &nbsp;→&nbsp; stray.bit
            </div>
          </div>

          {/* mini-map */}
          <div style={{ position: "absolute", bottom: 18, right: 18, width: 120, height: 120, background: "rgba(0,0,0,.4)", border: "1px solid var(--line-2)", borderRadius: 8, padding: 6 }}>
            <div style={{ position: "relative", width: "100%", height: "100%", background: "rgba(0,0,0,.3)" }}>
              <span style={{ position: "absolute", left: "44%", top: "48%", width: 6, height: 6, background: "var(--lime)", borderRadius: 999 }} />
              <span style={{ position: "absolute", left: "62%", top: "62%", width: 6, height: 6, background: "var(--fg-soft)", borderRadius: 999 }} />
              <span style={{ position: "absolute", left: "26%", top: "30%", width: 6, height: 6, background: "var(--fg-soft)", borderRadius: 999 }} />
            </div>
          </div>
        </div>
      </Panel>
      <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 10 }}>
          <Pill tone="lime" dot>connected · 24ms</Pill>
          <Pill tone="teal">item · armor in 22s</Pill>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn kind="ghost" size="sm" kbd="Tab">Scoreboard</Btn>
          <Btn kind="ghost" size="sm" kbd="V">Emote</Btn>
          <Btn kind="danger" size="sm">Forfeit</Btn>
        </div>
      </div>
    </div>
  );
}

function ResultsScreen() {
  const rows = [
    { name: "polly_42",   k: 4, d: 1, place: 1, char: "rogue",   resp: "+ 120" },
    { name: "alex.k",     k: 2, d: 2, place: 2, char: "warrior", resp: "+ 60",  you: true },
    { name: "noir.cloud", k: 1, d: 3, place: 3, char: "mage",    resp: "+ 24" },
    { name: "stray.bit",  k: 0, d: 4, place: 4, char: "tank",    resp: "0" },
  ];
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "80px 1fr auto", gap: 24, alignItems: "baseline", paddingBottom: 18, borderBottom: "1px solid var(--line)" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".18em", color: "var(--lime)" }}>[ 03 / 03 ]</span>
        <h2 style={{ margin: 0, fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: 34, letterSpacing: "-.5px" }}>
          Match results <em style={{ color: "var(--lime-2)" }}>· polly_42 wins</em>
        </h2>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".18em", color: "var(--mute)" }}>BEST OF 3 · 7:42 ELAPSED</span>
      </div>
      <Panel padded={false} style={{ marginTop: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "60px 60px 1fr 80px 80px 100px", gap: 16, padding: "14px 24px", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".18em", color: "var(--mute)", textTransform: "uppercase", borderBottom: "1px solid var(--line)" }}>
          <span>RANK</span><span></span><span>PLAYER</span><span style={{ textAlign: "right" }}>K</span><span style={{ textAlign: "right" }}>D</span><span style={{ textAlign: "right" }}>RESPECT</span>
        </div>
        {rows.map((r) => (
          <div key={r.name} style={{
            display: "grid", gridTemplateColumns: "60px 60px 1fr 80px 80px 100px", gap: 16,
            padding: "16px 24px", alignItems: "center",
            borderBottom: "1px solid var(--line)",
            background: r.you ? "var(--lime-tint)" : "transparent",
          }}>
            <span style={{ fontFamily: "var(--font-serif)", fontSize: 28, color: r.place === 1 ? "var(--lime)" : "var(--fg)" }}>{r.place}</span>
            <img src={`../../assets/arena/${r.char}-stand-00.png`} style={{ width: 36, height: 36, imageRendering: "pixelated" }} alt="" />
            <div>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: 14 }}>{r.name}{r.you && <span style={{ marginLeft: 8, color: "var(--lime)", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".18em" }}>YOU</span>}</div>
              <div className="small" style={{ color: "var(--mute)", textTransform: "capitalize" }}>{r.char}</div>
            </div>
            <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--fg)" }}>{r.k}</span>
            <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--fg-soft)" }}>{r.d}</span>
            <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", color: r.resp.startsWith("+") ? "var(--lime)" : "var(--mute)" }}>{r.resp}</span>
          </div>
        ))}
      </Panel>
      <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <Btn kind="ghost">Back to home</Btn>
        <Btn kind="secondary">Share replay</Btn>
        <Btn kind="primary">Rematch</Btn>
      </div>
    </div>
  );
}

function CharacterPicker() {
  const cast = [
    { id: "warrior", name: "Warrior", role: "Sturdy melee · slow",       hp: "2 + 1" },
    { id: "rogue",   name: "Rogue",   role: "Light · fast · low cover",  hp: "2" },
    { id: "mage",    name: "Mage",    role: "Ranged · fragile",          hp: "2" },
    { id: "tank",    name: "Tank",    role: "Heavy · permanent armor",   hp: "2 + 1" },
    { id: "zombie",  name: "Zombie",  role: "Special · melee on kill",   hp: "2" },
  ];
  return (
    <div>
      <Eyebrow>CAST · 5 OF 5 + 3 PROPOSED</Eyebrow>
      <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 40, margin: "12px 0 24px" }}>
        Pick a body. <em style={{ color: "var(--lime-2)" }}>Same rules for all.</em>
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14 }}>
        {cast.map((c) => (
          <div key={c.id} style={{
            background: "var(--color-surface)", border: "1px solid " + (c.id === "warrior" ? "var(--lime)" : "var(--line)"),
            borderRadius: "var(--radius-lg)", padding: 18, display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
            boxShadow: c.id === "warrior" ? "0 0 0 4px var(--lime-tint), var(--shadow-1)" : "none",
            transition: "all var(--dur) var(--ease)",
          }}>
            <div style={{ width: "100%", aspectRatio: "1", background: "radial-gradient(circle at 50% 70%, #2C2240 0%, #120D1C 70%)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <img src={`../../assets/arena/${c.id}-stand-00.png`} style={{ width: "70%", height: "70%", imageRendering: "pixelated", objectFit: "contain" }} alt="" />
            </div>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 22 }}>{c.name}</div>
            <div className="small" style={{ color: "var(--mute)", textAlign: "center", lineHeight: 1.4 }}>{c.role}</div>
            <Pill tone="neutral">HP {c.hp}</Pill>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 32, padding: 24, background: "rgba(200,247,106,.04)", border: "1px dashed var(--lime-tint-2)", borderRadius: "var(--radius-lg)" }}>
        <Eyebrow>PROPOSED · NORMAL-PEOPLE CAST</Eyebrow>
        <p className="lede" style={{ marginTop: 8, marginBottom: 14 }}>Three drop-in alternates: a young woman, a middle-aged man, an older woman. Same hitboxes, different silhouettes.</p>
        <a href="../../characters/index.html" style={{ color: "var(--lime)", fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: ".16em", textTransform: "uppercase" }}>OPEN CHARACTER MOCKS &nbsp;→</a>
      </div>
    </div>
  );
}

Object.assign(window, { HomeScreen, LobbyScreen, GameScreen, ResultsScreen, CharacterPicker });
