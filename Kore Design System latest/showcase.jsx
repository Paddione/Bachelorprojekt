/* global React, Glock, Deagle, M4A1, Shotgun, MP5, Sniper, Knife, FragGrenade, RPG, Molotov,
   MuzzleFlash, BulletHit, BloodSplat, BloodPool, SkullMarker, LootCrate, Bullet, Shell,
   HealthPack, MedSyringe, ArmorPlate, AmmoBox, Keycard, RespectCoin,
   PowerShield, PowerSpeed, PowerDamage, PowerEMP, PowerCloak,
   RedBarrel, Sandbags, Vending, Terminal, ServerRack, Streetlight, Cone, Locker,
   FloorConcrete, FloorGrate, WallBlock, Door, Vent, CoverWall,
   BulletHole, Scorch, BloodSmear, Footprint, Graffiti,
   SpawnPoint, CapturePoint, SupplyDrop, ExitMarker, ZoneRing,
   Explosion, SmokePuff, EMPBurst, HealAura, ShieldBubble,
   Turret, Drone, Merchant, TopDownBody */
// =====================================================================
//  showcase.jsx — Spec-sheet asset gallery. Sections of cards.
// =====================================================================

const { useState, useEffect } = React;

/* ---------- Re-usable asset card -------------------------------- */
function ACard({ index, label, hint, children, big = false, dark = false }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: dark ? 'var(--ink-900)' : 'var(--ink-850)',
        border: `1px solid ${hover ? 'var(--line-2)' : 'var(--line)'}`,
        boxShadow: hover ? 'var(--shadow-2)' : 'none',
        borderRadius: 'var(--r-card)',
        padding: big ? 'var(--s-8)' : 'var(--s-6)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--s-4)',
        minHeight: big ? 260 : 200,
        transition: 'border-color var(--dur) var(--ease), box-shadow var(--dur) var(--ease)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--s-4)' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.18em', color: 'var(--mute)', textTransform: 'uppercase' }}>{`[ ${index} ]`}</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.18em', color: 'var(--mute-2)', textTransform: 'uppercase' }}>{hint}</span>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 100, position: 'relative' }}>
        {children}
      </div>
      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 'var(--s-3)', fontFamily: 'var(--sans)', fontSize: 13, lineHeight: 1.4, color: 'var(--fg-soft)' }}>
        {label}
      </div>
    </div>
  );
}

/* ---------- Section header (Kore standard) ---------------------- */
function Section({ num, title, kicker, mono, children }) {
  return (
    <section style={{ paddingTop: 'var(--s-12)' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '80px 1fr auto',
        alignItems: 'baseline',
        gap: 'var(--s-6)',
        paddingBottom: 'var(--s-6)',
        borderBottom: '1px solid var(--line)',
        marginBottom: 'var(--s-8)',
      }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.18em', color: 'var(--mute)', textTransform: 'uppercase' }}>{`[ ${num} ]`}</span>
        <h2 style={{ margin: 0, fontFamily: 'var(--serif)', fontSize: 'var(--fs-h2)', lineHeight: 1.1, color: 'var(--fg)' }}>
          {title} <em style={{ fontStyle: 'italic', color: 'var(--lime-2)' }}>{kicker}</em>
        </h2>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.18em', color: 'var(--mute-2)', textTransform: 'uppercase' }}>{mono}</span>
      </div>
      {children}
    </section>
  );
}

/* small floating loop helper */
function Float({ amp = 4, period = 2400, children }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf, start = performance.now();
    const tick = () => { setT((performance.now() - start) / 1000); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const y = Math.sin((t * 1000 / period) * Math.PI * 2) * amp;
  return <div style={{ transform: `translateY(${y}px)` }}>{children}</div>;
}

/* slow rotation helper */
function Spin({ period = 6000, children }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf, start = performance.now();
    const tick = () => { setT((performance.now() - start) / 1000); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const a = (t * 1000 / period) * 360;
  return <div style={{ transform: `rotate(${a}deg)` }}>{children}</div>;
}

/* ---------- Weapons grid (10 weapons) --------------------------- */
function WeaponsGrid() {
  const grid4 = { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--s-4)' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
      <div style={grid4}>
        <ACard index="01" label="Glock 17 — sidearm, low recoil" hint="9mm · 17 mag"><Glock size={120}/></ACard>
        <ACard index="02" label={<>Desert Eagle <em style={{fontStyle:'italic',color:'var(--lime-2)'}}>— two taps usually do it</em></>} hint=".50 ae · 7 mag"><Deagle size={150}/></ACard>
        <ACard index="03" label="M4A1 — assault rifle" hint="5.56 · 30 mag"><M4A1 size={180}/></ACard>
        <ACard index="04" label="Combat knife — quiet, close" hint="50 dmg · 1 swing"><Knife size={120}/></ACard>
      </div>
      <div style={grid4}>
        <ACard index="05" label="Shotgun — pump, eight rounds" hint="12-ga · 8 mag"><Shotgun size={180}/></ACard>
        <ACard index="06" label="MP5 — submachine, twitchy" hint="9mm · 30 mag"><MP5 size={150}/></ACard>
        <ACard index="07" label={<>Sniper rifle <em style={{fontStyle:'italic',color:'var(--lime-2)'}}>— one breath, one shot</em></>} hint=".338 · 5 mag · scope"><Sniper size={210}/></ACard>
        <ACard index="08" label="RPG-7 — opens a room" hint="rocket · 1 tube"><RPG size={190}/></ACard>
      </div>
      <div style={grid4}>
        <ACard index="09" label="Frag grenade — cooked at 3" hint="throwable · 4s fuse"><FragGrenade size={72}/></ACard>
        <ACard index="10" label="Molotov — spreads, lingers" hint="throwable · 8s pool"><Molotov size={86}/></ACard>
        <ACard index="11" label="Bullet · tracer round" hint="lime trail · 6 px"><Bullet size={28}/></ACard>
        <ACard index="12" label="Shell casing — ejection" hint="lime brass · 8 px"><Shell size={28}/></ACard>
      </div>
    </div>
  );
}

/* ---------- Pickups + Powerups ---------------------------------- */
function PickupsGrid() {
  const grid4 = { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--s-4)' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
      <div style={grid4}>
        <ACard index="13" label="Health pack — restores 2 HP" hint="ground pickup">
          <Float amp={3}><HealthPack size={90}/></Float>
        </ACard>
        <ACard index="14" label="Med-syringe — instant +1 HP" hint="single use">
          <Float amp={3} period={2000}><MedSyringe size={86}/></Float>
        </ACard>
        <ACard index="15" label={<>Armor plate <em style={{fontStyle:'italic',color:'var(--lime-2)'}}>— one extra hit</em></>} hint="adds shield slot">
          <Float amp={3} period={2800}><ArmorPlate size={90}/></Float>
        </ACard>
        <ACard index="16" label="Ammo box — refills equipped" hint="full mag · top up">
          <Float amp={3} period={3200}><AmmoBox size={86}/></Float>
        </ACard>
      </div>
      <div style={grid4}>
        <ACard index="17" label="Keycard — opens locked rooms" hint="map-specific">
          <Float amp={3} period={2400}><Keycard size={86}/></Float>
        </ACard>
        <ACard index="18" label={<>RESPECT coin <em style={{fontStyle:'italic',color:'var(--lime-2)'}}>— the only currency</em></>} hint="+25 R · per pickup">
          <Float amp={3} period={1800}><Spin period={4000}><RespectCoin size={82}/></Spin></Float>
        </ACard>
        <ACard index="19" label="Loot crate — drops on death" hint="ink-700 · &lt; stencil"><LootCrate size={84}/></ACard>
        <ACard index="20" label="Skull marker — death spot" hint="placeholder · 28 px"><SkullMarker size={48}/></ACard>
      </div>
    </div>
  );
}

function PowerupsGrid() {
  const grid5 = { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 'var(--s-4)' };
  return (
    <div style={grid5}>
      <ACard index="21" label="Shield — absorbs the next two" hint="12s · teal">
        <Float amp={3}><PowerShield size={90}/></Float>
      </ACard>
      <ACard index="22" label="Speed — 1.4× movement" hint="8s · lime">
        <Float amp={3} period={1600}><PowerSpeed size={90}/></Float>
      </ACard>
      <ACard index="23" label={<>Damage <em style={{fontStyle:'italic',color:'var(--lime-2)'}}>— hits land harder</em></>} hint="10s · ×1.5">
        <Float amp={3} period={2200}><PowerDamage size={90}/></Float>
      </ACard>
      <ACard index="24" label="EMP — disables turrets" hint="single-use · 5s">
        <Float amp={3} period={2600}><PowerEMP size={90}/></Float>
      </ACard>
      <ACard index="25" label="Cloak — gone, briefly" hint="6s · breaks on shoot">
        <Float amp={3} period={3000}><PowerCloak size={90}/></Float>
      </ACard>
    </div>
  );
}

/* ---------- Effects (FX 1 + 2 combined) ------------------------- */
function EffectsGrid() {
  const grid4 = { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--s-4)' };
  // explosion frame loop
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame(f => (f + 1) % 5), 220);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
      <div style={grid4}>
        <ACard index="26" label="Muzzle flash — 90 ms" hint="lime · 4-pt star"><MuzzleFlash size={90}/></ACard>
        <ACard index="27" label="Bullet hit — wall spark" hint="lime · 120 ms"><BulletHit size={70}/></ACard>
        <ACard index="28" label="Blood splat — flat red" hint="seeded · 96 px"><BloodSplat size={110} seed={7}/></ACard>
        <ACard index="29" label={<>Death pool <em style={{fontStyle:'italic',color:'var(--lime-2)'}}>— ragdoll slump</em></>} hint="120 × 90"><BloodPool size={130}/></ACard>
      </div>
      <div style={grid4}>
        <ACard index="30" label="Explosion — 5-frame burst" hint={`frame ${frame + 1} / 5`}>
          <Explosion size={140} frame={frame}/>
        </ACard>
        <ACard index="31" label="Smoke puff — drifts up" hint="grenade residue">
          <Float amp={4} period={3200}><SmokePuff size={100}/></Float>
        </ACard>
        <ACard index="32" label="EMP burst — concentric" hint="teal · 800 ms"><EMPBurst size={130}/></ACard>
        <ACard index="33" label="Healing aura — green ring" hint="health pack pulse"><HealAura size={130}/></ACard>
      </div>
    </div>
  );
}

/* ---------- Props -------------------------------------------------- */
function PropsGrid() {
  const grid4 = { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--s-4)' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
      <div style={grid4}>
        <ACard index="34" label={<>Red barrel <em style={{fontStyle:'italic',color:'var(--lime-2)'}}>— do not shoot</em></>} hint="explosive · 4 hp"><RedBarrel size={110}/></ACard>
        <ACard index="35" label="Sandbags — 60% cover" hint="three of them, sad"><Sandbags size={140}/></ACard>
        <ACard index="36" label="Vending — drops a coin" hint="punch to break"><Vending size={120}/></ACard>
        <ACard index="37" label="Terminal — captures point B" hint="hold E · 4s"><Terminal size={110}/></ACard>
      </div>
      <div style={grid4}>
        <ACard index="38" label="Server rack — destructible" hint="loot · respawn 30s"><ServerRack size={120}/></ACard>
        <ACard index="39" label="Streetlight — pool of warm" hint="ambient lighting"><Streetlight size={130}/></ACard>
        <ACard index="40" label="Traffic cone — moves" hint="kickable · funny"><Cone size={70}/></ACard>
        <ACard index="41" label="Locker — keycard required" hint="loot inside"><Locker size={110}/></ACard>
      </div>
    </div>
  );
}

/* ---------- Tiles + decals -------------------------------------- */
function EnvironmentGrid() {
  const grid4 = { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--s-4)' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
      <div style={grid4}>
        <ACard index="42" label="Concrete floor — base tile" hint="64 × 64 · tileable"><div style={{ borderRadius: 8, overflow: 'hidden' }}><FloorConcrete size={120}/></div></ACard>
        <ACard index="43" label="Metal grate — utility floor" hint="64 × 64 · tileable"><div style={{ borderRadius: 8, overflow: 'hidden' }}><FloorGrate size={120}/></div></ACard>
        <ACard index="44" label="Wall block — brick course" hint="120 × 24"><WallBlock width={140} height={28}/></ACard>
        <ACard index="45" label="Cover wall — low concrete" hint="60% cover · stencil"><CoverWall size={140}/></ACard>
      </div>
      <div style={grid4}>
        <ACard index="46" label="Door — closed, locked" hint="green-lit viewport"><Door size={100}/></ACard>
        <ACard index="47" label="Vent — crawlable" hint="screwed shut · pry open"><Vent size={110}/></ACard>
        <ACard index="48" label={<>Graffiti <em style={{fontStyle:'italic',color:'var(--lime-2)'}}>— Kore was here</em></>} hint="spray · &lt; tag"><Graffiti size={150}/></ACard>
        <ACard index="49" label="Scorch — explosion residue" hint="permanent decal"><Scorch size={100}/></ACard>
      </div>
      <div style={grid4}>
        <ACard index="50" label="Bullet hole — wall decal" hint="dark · radial cracks"><BulletHole size={48}/></ACard>
        <ACard index="51" label="Blood smear — drag trail" hint="directional"><BloodSmear size={130}/></ACard>
        <ACard index="52" label="Footprint — single boot" hint="tracking · fading"><Footprint size={56}/></ACard>
        <ACard index="53" label="Shield bubble — area buff" hint="hex pattern · teal"><ShieldBubble size={130}/></ACard>
      </div>
    </div>
  );
}

/* ---------- Markers --------------------------------------------- */
function MarkersGrid() {
  const grid4 = { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--s-4)' };
  return (
    <div style={grid4}>
      <ACard index="54" label="Spawn point — drop zone" hint="ground decal"><SpawnPoint size={130}/></ACard>
      <ACard index="55" label={<>Capture point <em style={{fontStyle:'italic',color:'var(--lime-2)'}}>— we own 65%</em></>} hint="contested · pie"><CapturePoint size={130} percent={0.65}/></ACard>
      <ACard index="56" label="Supply drop — falling crate" hint="lime stencil &lt;"><SupplyDrop size={130}/></ACard>
      <ACard index="57" label="Exit door — match end" hint="lime arrow"><ExitMarker size={130}/></ACard>
    </div>
  );
}

/* ---------- Enemies --------------------------------------------- */
function EnemiesGrid() {
  // turret slowly sweeps
  const [angle, setAngle] = useState(20);
  useEffect(() => {
    let raf, start = performance.now();
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      setAngle(Math.sin(t * 0.6) * 60);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const grid4 = { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--s-4)' };
  return (
    <div style={grid4}>
      <ACard index="58" label="Sentry turret — scanning" hint="auto · 35 dps"><Turret size={140} scanAngle={angle}/></ACard>
      <ACard index="59" label="Recon drone — quad-rotor" hint="hovers · spots you">
        <Float amp={3} period={1400}><Drone size={130}/></Float>
      </ACard>
      <ACard index="60" label={<>Merchant <em style={{fontStyle:'italic',color:'var(--lime-2)'}}>— exchange RESPECT</em></>} hint="neutral NPC"><Merchant size={120}/></ACard>
      <ACard index="61" label="Zone ring — closing storm" hint="teal · ticks"><ZoneRing size={130}/></ACard>
    </div>
  );
}

/* ---------- Master AssetCanvas ---------------------------------- */
function ShowcaseCanvas() {
  return (
    <>
      <Section num="01" title="Weapons —" kicker="ten of them, more later." mono="iso · top-down · lime rim">
        <WeaponsGrid/>
      </Section>
      <Section num="02" title="Pickups —" kicker="things you stoop to grab." mono="health · ammo · tags">
        <PickupsGrid/>
      </Section>
      <Section num="03" title="Powerups —" kicker="five flavours of unfair." mono="orb · 6–12 sec timer">
        <PowerupsGrid/>
      </Section>
      <Section num="04" title="Effects —" kicker="loud, brief, then quiet." mono="muzzle · explosion · aura">
        <EffectsGrid/>
      </Section>
      <Section num="05" title="Props —" kicker="furniture for the brawl." mono="cover · destructible · loot">
        <PropsGrid/>
      </Section>
      <Section num="06" title="Tiles & decals —" kicker="floor, walls, leftovers." mono="repeating · placeable">
        <EnvironmentGrid/>
      </Section>
      <Section num="07" title="Markers —" kicker="where to go, how it's going." mono="objective · pie · arrow">
        <MarkersGrid/>
      </Section>
      <Section num="08" title="Hostiles —" kicker="things that aren't you." mono="turret · drone · merchant">
        <EnemiesGrid/>
      </Section>
    </>
  );
}

Object.assign(window, { ShowcaseCanvas });
