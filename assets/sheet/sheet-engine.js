/* Character sheet engine.
   Renders any character from a "build" (see BUILD-FORMAT.md) using the Cedric sheet design.
   Usage: const sheet = SheetEngine.mount(el, {build, state, readonly, onChange});
          sheet.setState(remoteState)   // apply a change that came from elsewhere
          sheet.getState()
   State is plain JSON so it can be saved anywhere (Firestore, localStorage). */
(function(global){
'use strict';

const ABILS=['STR','DEX','CON','INT','WIS','CHA'];
const ABIL_NAMES={STR:'Strength',DEX:'Dexterity',CON:'Constitution',INT:'Intelligence',WIS:'Wisdom',CHA:'Charisma'};
const SKILLS=[['Acrobatics','DEX'],['Animal Handling','WIS'],['Arcana','INT'],['Athletics','STR'],['Deception','CHA'],['History','INT'],['Insight','WIS'],['Intimidation','CHA'],['Investigation','INT'],['Medicine','WIS'],['Nature','INT'],['Perception','WIS'],['Performance','CHA'],['Persuasion','CHA'],['Religion','INT'],['Sleight of Hand','DEX'],['Stealth','DEX'],['Survival','WIS']];
const CONDS=['Blinded','Charmed','Deafened','Frightened','Grappled','Incapacitated','Invisible','Paralyzed','Poisoned','Prone','Restrained','Stunned','Unconscious'];
const EXH=['','Disadvantage on ability checks','Speed halved','Disadvantage on attacks and saves','HP maximum halved','Speed reduced to 0','Death'];
const TAGK={act:'act',action:'act',bonus:'bonus','bonus action':'bonus',free:'free',reaction:'free'};

/* ---------- helpers ---------- */
const sg=n=>(n>=0?'+':'')+n;
const rnd=s=>1+Math.floor(Math.random()*s);
const modOf=score=>Math.floor((score-10)/2);
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
/* Escaped text with **bold** and *italic* allowed. */
function rich(s){return esc(s).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/\*(.+?)\*/g,'<i>$1</i>');}
function clone(o){return JSON.parse(JSON.stringify(o));}
function profBonus(level){return 2+Math.floor((Math.max(1,level||1)-1)/4);}

/* Damage/roll parts: either an array of {n,s,type,nocrit}/{flat,type}, or a string like "1d8+7 slashing + 1d8 thunder". */
function parts(p){
  if(!p)return [];
  if(Array.isArray(p))return p;
  const out=[];
  String(p).replace(/(\d)\s*-\s*(\d)/g,'$1+-$2').split('+').map(t=>t.trim()).filter(Boolean).forEach(t=>{
    let m=/^(\d*)\s*d\s*(\d+)\s*(.*)$/i.exec(t);
    if(m){out.push({n:parseInt(m[1]||'1',10),s:parseInt(m[2],10),type:m[3]||''});return;}
    m=/^(-?\d+)\s*(.*)$/.exec(t);
    if(m)out.push({flat:parseInt(m[1],10),type:m[2]||''});
  });
  return out;
}
function tagHtml(t){
  if(!t)return '';
  const [label,kind]=Array.isArray(t)?t:[t,t];
  const k=TAGK[String(kind).toLowerCase()]||'';
  return `<span class="tag ${k}">${esc(label)}</span>`;
}

/* ---------- build normalisation ---------- */
function normalise(b){
  b=clone(b||{});
  b.name=b.name||'Unnamed adventurer';
  b.level=b.level||1;
  b.maxHp=b.maxHp||10;
  b.ac=b.ac||10;
  b.speed=b.speed==null?30:b.speed;
  b.abilities=Object.assign({STR:10,DEX:10,CON:10,INT:10,WIS:10,CHA:10},b.abilities||{});
  b.prof=b.prof||profBonus(b.level);
  b.saveProf=(b.saveProf||[]).map(x=>String(x).toUpperCase().slice(0,3));
  b.skillProf=b.skillProf||[];b.skillExpertise=b.skillExpertise||[];
  b.skillBonus=b.skillBonus||{};
  b.acToggles=b.acToggles||[];
  b.slots=(b.slots||[]).map((s,i)=>Object.assign({id:'slot'+i,reset:'long'},s));
  b.hitDice=b.hitDice||[{die:8,count:b.level}];
  b.riders=b.riders||[];
  b.attacks=b.attacks||[];
  b.resources=(b.resources||[]).map((r,i)=>Object.assign({id:'res'+i,max:1,reset:'long'},r));
  b.spells=b.spells||null;
  b.traits=b.traits||[];
  b.inventory=b.inventory||[];
  b.coins=Object.assign({pp:0,gp:0,sp:0,cp:0},b.coins||{});
  return b;
}
function mods(b){const m={};ABILS.forEach(k=>m[k]=modOf(b.abilities[k]));return m;}
function saveMod(b,k){return modOf(b.abilities[k])+(b.saveProf.includes(k)?b.prof:0)+((b.saveBonus||{})[k]||0);}
function skillMod(b,name,ab){
  const exp=b.skillExpertise.includes(name),pr=exp||b.skillProf.includes(name);
  return modOf(b.abilities[ab])+(exp?b.prof*2:pr?b.prof:0)+(b.skillBonus[name]||0);
}
function fresh(b){
  const st={hp:b.maxHp,temp:0,dsS:0,dsF:0,slots:{},res:{},active:{},hd:{},conc:'',conds:[],exh:0,insp:0,ac:{},
    prep:(b.spells&&b.spells.prepared&&b.spells.prepared.default)||[],
    inv:clone(b.inventory),coins:clone(b.coins),notes:''};
  b.slots.forEach(s=>st.slots[s.id]=0);
  b.resources.forEach(r=>{st.res[r.id]=0;});
  b.hitDice.forEach(h=>st.hd[h.die]=(st.hd[h.die]||0)+h.count);
  return st;
}
/* Fill gaps when a build changes under an existing state. */
function reconcile(b,st){
  const f=fresh(b);
  const out=Object.assign(f,st||{});
  ['slots','res','active','hd','ac'].forEach(k=>{out[k]=Object.assign({},f[k],(st||{})[k]||{});});
  b.slots.forEach(s=>out.slots[s.id]=Math.min(s.count,out.slots[s.id]||0));
  b.resources.forEach(r=>{out.res[r.id]=Math.min(r.max,out.res[r.id]||0);});
  const hdMax={};b.hitDice.forEach(h=>hdMax[h.die]=(hdMax[h.die]||0)+h.count);
  Object.keys(out.hd).forEach(d=>{if(!(d in hdMax))delete out.hd[d];else out.hd[d]=Math.min(hdMax[d],out.hd[d]);});
  out.hp=Math.min(b.maxHp,out.hp);
  return out;
}

/* ---------- markup ---------- */
function shell(b){
  const hasSpells=!!(b.spells&&((b.spells.groups||[]).length||b.spells.prepared));
  const hasSlots=b.slots.length>0;
  const init=b.initiative!=null?b.initiative:modOf(b.abilities.DEX);
  const perc=skillMod(b,'Perception','WIS');
  return `
<div class="wrap">
  <div class="ro-banner" id="roBanner" hidden></div>
  <section class="top">
    <div class="ident">
      <div class="lbl">${esc(b.tagline||'')}</div>
      <h1>${esc(b.name)}</h1>
      <p>${esc(b.classLine||'')}</p>
      <div class="rests">
        <button id="shortRest" type="button">Short rest</button>
        <button id="longRest" type="button" class="primary">Long rest</button>
        <button id="copyStatus" type="button" title="Copy a text summary of this sheet to paste to the DM">Copy for DM</button>
      </div>
      <div id="restMsg" class="note" aria-live="polite"></div>
    </div>
    <div class="vitals">
      <div class="stats">
        <div class="stat"><span class="lbl">AC</span><span class="num" id="acVal">${b.ac}</span>${b.acToggles.map(t=>`<button type="button" class="tog" data-actog="${esc(t.id)}" aria-pressed="false" title="${esc(t.title||'')}">${esc(t.label)}</button>`).join('')}</div>
        <div class="stat"><span class="lbl">Initiative</span><span class="num">${sg(init)}</span><button type="button" class="tog" data-roll="Initiative|${init}">Roll</button></div>
        <div class="stat"><span class="lbl">Speed</span><span class="num" id="spdVal">${b.speed}</span><span class="note" id="flyNote">feet</span></div>
        <div class="stat"><span class="lbl">Prof · Perc</span><span class="num">${sg(b.prof)}</span><span class="note">passive ${10+perc}</span></div>
        <div class="stat"><span class="lbl">Inspiration</span><button type="button" class="tog" id="inspTog" aria-pressed="false">None</button></div>
      </div>
      <div class="hpbox">
        <div>
          <div class="lbl">Hit points</div>
          <div class="hpread"><span id="hpCur"></span><span id="hpMax"></span></div>
          <div class="temp" id="tempRead">Temp HP 0</div>
          <div class="bar"><i id="hpBar" style="width:100%"></i></div>
        </div>
        <div class="hpside">
          <div class="hpctl">
            <input id="hpAmt" type="number" min="0" value="5" inputmode="numeric" aria-label="Amount">
            <button type="button" id="dmgBtn" class="danger">Damage</button>
            <button type="button" id="healBtn">Heal</button>
            <button type="button" id="tempBtn">Temp HP</button>
          </div>
          <div class="ds" id="dsBox">
            <span class="lbl">Death saves</span>
            <span class="pips" id="dsS"></span>
            <span class="pips" id="dsF"></span>
            <button type="button" class="tog" data-roll="Death save|0">Roll</button>
          </div>
        </div>
      </div>
      <div class="slots">
        ${b.slots.map(s=>`<div class="slot"><span class="lbl">${esc(s.label||s.id)}</span><div class="pips" id="slot_${esc(s.id)}"></div></div>`).join('')}
        <div class="conc" id="concBox">
          <span class="lbl">Concentrating</span>
          <b id="concName">Nothing</b>
          <button type="button" class="tog" id="concDrop" hidden>Drop</button>
          <button type="button" class="tog" id="concSave" hidden title="Con save: DC 10 or half the damage taken, whichever is higher">Con save</button>
        </div>
      </div>
    </div>
  </section>

  <div class="rollbar">
    <div class="mode" role="group" aria-label="Roll mode for d20 rolls">
      <button type="button" id="normTog" aria-pressed="true">Normal</button>
      <button type="button" id="advTog" aria-pressed="false">Advantage</button>
      <button type="button" id="disTog" aria-pressed="false">Disadvantage</button>
    </div>
    <label class="keep" for="keepMode"><input type="checkbox" id="keepMode"> Keep for every roll</label>
    <div class="lastline"><span class="lbl">Last roll</span><span id="lastRoll" class="muted">Nothing rolled yet.</span></div>
    <button type="button" class="tog" id="histTog" aria-expanded="false" aria-controls="histBox">History (last 8)</button>
    <div class="hist" id="histBox" hidden>
      <div class="log" id="log" aria-live="polite"><div class="muted">Rolls appear here.</div></div>
      <button type="button" id="clearLog" class="tog">Clear history</button>
    </div>
  </div>

  <nav class="tabs" role="tablist" aria-label="Sheet sections">
    <button type="button" role="tab" data-tab="combat" aria-selected="true">Combat</button>
    ${hasSpells?'<button type="button" role="tab" data-tab="spells" aria-selected="false">Spells</button>':''}
    <button type="button" role="tab" data-tab="char" aria-selected="false">Character</button>
    <button type="button" role="tab" data-tab="gear" aria-selected="false">Gear &amp; notes</button>
  </nav>

  <div class="pane" data-pane="combat">
    <div class="col">
      <section>
        <h2>Attacks <small>roll mode is set in the bar above</small></h2>
        <div class="toggles">
          ${b.riders.map(r=>`<button type="button" class="tog" data-rider="${esc(r.id)}" aria-pressed="false" title="${esc(r.title||'')}">${esc(r.label)}</button>`).join('')}
          <button type="button" class="tog" id="critTog" aria-pressed="false" title="Force damage rolls to be critical (e.g. paralyzed target)">Crit damage</button>
        </div>
        ${b.attacks.map((a,ai)=>`<div class="atk">
          ${a.name?`<div class="atk-h"><b>${esc(a.name)} ${(a.tags||[]).map(tagHtml).join(' ')}</b><span class="num muted">${esc(a.summary||'')}</span></div>`:''}
          ${a.note?`<div class="note">${rich(a.note)}</div>`:''}
          <div class="btns">${(a.buttons||[]).map((bt,bi)=>`<button type="button" data-atk="${ai}|${bi}" class="${bt.primary?'primary':''}" title="${esc(bt.title||'')}">${esc(bt.label)}</button>`).join('')}<span class="note" id="ammo_${ai}"></span></div>
        </div>`).join('')}
        <div class="atk">
          <div class="btns">
            <b>Free roll</b>
            <input id="freeExpr" value="1d20+${b.prof}" aria-label="Dice expression" style="width:100px">
            <button type="button" id="freeRoll">Roll</button>
            <span class="note">e.g. 2d6+1</span>
          </div>
        </div>
      </section>
    </div>
    <div class="col">
      ${b.resources.length?`<section>
        <h2>Class resources <small>tags show what each one costs</small></h2>
        <div id="resources"></div>
      </section>`:''}
      <section>
        <h2>Hit dice &amp; conditions</h2>
        <div id="hdBox"></div>
        <div class="res"><div><b>Exhaustion</b> <span class="note" id="exhNote"></span></div>
          <div class="stepper"><button type="button" id="exhDn" aria-label="Lower exhaustion">−</button><span class="num" id="exh">0</span><button type="button" id="exhUp" aria-label="Raise exhaustion">+</button></div></div>
        <div class="conds" id="conds"></div>
      </section>
    </div>
  </div>

  ${hasSpells?`<div class="pane" data-pane="spells" hidden>
    <div class="col">
      <section>
        <h2>Cantrips <small>at will · no slot</small></h2>
        <div id="cantrips"></div>
      </section>
      <section>
        <h2>Spells <small>${esc(b.spells.header||'')}</small></h2>
        <div id="spells"></div>
      </section>
    </div>
    ${b.spells.prepared?`<div class="col">
      <section>
        <h2>${esc(b.spells.prepared.name||'Spellbook')} <small id="prepCount"></small></h2>
        <div class="note">${rich(b.spells.prepared.note||'Tap to prepare or unprepare after a long rest.')}</div>
        <div class="list chips" id="prepList"></div>
      </section>
    </div>`:''}
  </div>`:''}

  <div class="pane" data-pane="char" hidden>
    <div class="col">
      <section>
        <h2>Abilities &amp; saves <small>tap a score for a check</small></h2>
        <div class="abil" id="abil"></div>
      </section>
      ${b.traits.length?`<section>
        <h2>Traits &amp; features</h2>
        <ul class="traits">${b.traits.map(t=>`<li>${rich(t)}</li>`).join('')}</ul>
      </section>`:''}
      ${b.backstory?`<section><h2>Backstory</h2><div class="note" style="font-size:.9rem;color:var(--ink)">${rich(b.backstory).replace(/\n/g,'<br>')}</div></section>`:''}
    </div>
    <div class="col">
      <section>
        <h2>Skills <small>${esc(b.skillNote||'tap to roll')}</small></h2>
        <div class="list skills" id="skills"></div>
      </section>
    </div>
  </div>

  <div class="pane" data-pane="gear" hidden>
    <div class="col">
      <section>
        <h2>Equipment</h2>
        <div class="coins">
          <label>PP<input id="c_pp" type="number" min="0" class="num"></label>
          <label>GP<input id="c_gp" type="number" min="0" class="num"></label>
          <label>SP<input id="c_sp" type="number" min="0" class="num"></label>
          <label>CP<input id="c_cp" type="number" min="0" class="num"></label>
        </div>
        <div class="inv" id="inv"></div>
        <form class="add" id="addForm">
          <input id="addName" placeholder="Add an item" aria-label="New item name">
          <input id="addQty" type="number" value="1" min="1" style="width:60px" aria-label="Quantity">
          <input id="addDesc" placeholder="What it does (optional)" aria-label="New item description" class="add-desc">
          <button type="submit">Add</button>
        </form>
      </section>
    </div>
    <div class="col">
      <section>
        <h2>Notes</h2>
        <textarea id="notes" rows="8" placeholder="NPCs, clues, quest leads..."></textarea>
      </section>
      <section>
        <h2>Backup &amp; reset</h2>
        <div class="note" id="bkNote">Copy a backup now and then, and paste it back to restore.</div>
        <textarea id="backup" rows="2" aria-label="Backup text"></textarea>
        <div class="btns">
          <button type="button" id="copyBk">Copy backup</button>
          <button type="button" id="loadBk">Restore from text</button>
          <button type="button" id="resetBtn" class="danger">Reset sheet</button>
        </div>
        <div class="confirm" id="resetConfirm" hidden>Reset everything to the starting sheet? <button type="button" id="resetYes" class="danger">Yes, reset</button><button type="button" id="resetNo">Cancel</button></div>
        <div class="note" id="bkMsg" aria-live="polite"></div>
      </section>
      <div id="extraGear"></div>
    </div>
  </div>
</div>`;
}

/* ---------- mount ---------- */
function mount(root,opts){
  const b=normalise(opts.build);
  const M=mods(b);
  let S=reconcile(b,opts.state);
  let readonly=!!opts.readonly;
  const onChange=opts.onChange||function(){};
  const prefKey='sheet-ui-'+(opts.uiKey||b.name);
  root.innerHTML=shell(b);
  const $=id=>root.querySelector('#'+id);
  const all=sel=>root.querySelectorAll(sel);
  const riderOn={};let editI=-1;let OPEN=new Set();

  /* dice & log */
  const logEl=$('log');let logStarted=false;
  function log(html){const lr=$('lastRoll');lr.className='';lr.innerHTML=html;if(!logStarted){logEl.innerHTML='';logStarted=true;}const d=document.createElement('div');d.innerHTML=html;logEl.prepend(d);while(logEl.children.length>8)logEl.lastChild.remove();}
  function dice(n,s){const a=[];for(let i=0;i<n;i++)a.push(rnd(s));return a;}
  function d20(){const adv=pressed('advTog'),dis=pressed('disTog');
    let a=rnd(20),c=null,k=a,mode='';
    if(adv&&!dis){c=rnd(20);k=Math.max(a,c);mode='adv';}else if(dis&&!adv){c=rnd(20);k=Math.min(a,c);mode='dis';}
    return {k,txt:c===null?`${a}`:`${a}, ${c} (${mode})`};}
  function pressed(id){const el=$(id);return !!el&&el.getAttribute('aria-pressed')==='true';}
  function setPressed(el,v){if(el)el.setAttribute('aria-pressed',v?'true':'false');}
  function setMode(m){[['normTog','n'],['advTog','a'],['disTog','d']].forEach(([id,k])=>setPressed($(id),k===m));}
  function clearAdv(){if(!$('keepMode').checked)setMode('n');}
  function check(label,mod){const x=d20();const t=x.k+mod;
    const cls=x.k===20?' <span class="crit">natural 20</span>':x.k===1?' <span class="fumble">natural 1</span>':'';
    log(`<b>${esc(label)}</b>: d20 [${x.txt}] ${sg(mod)} = <span class="tot">${t}</span>${cls}`);clearAdv();return x;}
  function critMin(){let m=b.critMin||20;b.riders.forEach(r=>{if(riderOn[r.id]&&r.critMin)m=Math.min(m,r.critMin);});return m;}
  function attack(label,mod){const x=d20();const t=x.k+mod;
    let tag='';if(x.k>=critMin()){tag=' <span class="crit">CRITICAL HIT</span>';setPressed($('critTog'),true);}else if(x.k===1)tag=' <span class="fumble">miss (natural 1)</span>';
    log(`<b>${esc(label)}</b> attack: d20 [${x.txt}] ${sg(mod)} = <span class="tot">${t}</span>${tag}`);clearAdv();return x;}
  function roll(label,ps,opt){opt=opt||{};const crit=!opt.nocrit&&pressed('critTog');let total=0;const bits=[];
    ps.forEach(p=>{if(p.n){const n=crit&&!p.nocrit?p.n*2:p.n;const rl=dice(n,p.s);const s=rl.reduce((a,c)=>a+c,0);total+=s;bits.push(`${n}d${p.s} [${rl.join(', ')}]${p.type?' '+esc(p.type):''}`);}
      else if(p.flat!=null){total+=p.flat;bits.push(`${sg(p.flat)}${p.type?' '+esc(p.type):''}`);}});
    log(`<b>${esc(label)}</b>${crit?' <span class="crit">(crit)</span>':''}: ${bits.join(' ')} = <span class="tot">${total}</span>`);return total;}
  /* Extra damage from toggled riders and active resources, for a given kind of damage ("hit" by default). */
  function extras(kind){const out=[];
    b.riders.forEach(r=>{if(riderOn[r.id]&&(r.kind||r.applies||'hit')===kind)out.push(...parts(r.damage));});
    if(kind==='hit')b.resources.forEach(r=>{if(r.type==='toggle'&&S.active[r.id]&&r.activeDamage)out.push(...parts(r.activeDamage));});
    return out;}

  /* static render */
  $('abil').innerHTML=ABILS.map(k=>{const sv=saveMod(b,k),pr=b.saveProf.includes(k);return `<div class="ab"><span class="lbl">${k}</span><button type="button" class="abm" data-roll="${k} check|${M[k]}"><span class="num">${sg(M[k])}</span><span class="note">${b.abilities[k]}</span></button><button type="button" class="tog sv ${pr?'pr':''}" data-roll="${ABIL_NAMES[k]} save|${sv}" title="${pr?'Proficient':''}">Save ${sg(sv)}</button></div>`;}).join('');
  $('skills').innerHTML=SKILLS.map(([n,ab])=>{const v=skillMod(b,n,ab),pr=b.skillProf.includes(n)||b.skillExpertise.includes(n);return `<button type="button" class="row" data-roll="${n}|${v}"><span class="nm"><i class="p ${pr?'on':''}"></i>${n} <span class="note" style="margin-left:5px">${ab}${b.skillExpertise.includes(n)?' · expertise':''}</span></span><span class="num">${sg(v)}</span></button>`;}).join('');
  $('conds').innerHTML=CONDS.map(c=>`<button type="button" class="tog" data-cond="${c}" aria-pressed="false">${c}</button>`).join('');

  /* spells */
  const SP=b.spells||{};const groups=SP.groups||[];const PREP=SP.prepared||null;
  const spellIndex={};
  groups.forEach((g,gi)=>(g.spells||[]).forEach((s,si)=>spellIndex[s.n]=s));
  if(PREP)(PREP.spells||[]).forEach(s=>spellIndex[s.n]=s);
  function spellRow(s){
    const acts=(s.c||(s.actions||[]).length)?`<div class="btns">${s.c?`<button type="button" class="tog" data-conc="${esc(s.n)}">Start concentrating</button>`:''}${(s.actions||[]).map((a,i)=>`<button type="button" class="tog" data-spact="${esc(s.n)}|${i}">${esc(a.label)}</button>`).join('')}</div>`:'';
    return `<details class="sp" data-n="${esc(s.n)}" ${OPEN.has(s.n)?'open':''}><summary class="sp-h"><b>${esc(s.n)}</b><span class="tags">${s.lvl?`<span class="tag lv">${esc(s.lvl)}</span>`:''}${s.c?'<span class="tag">Conc.</span>':''}${s.t?`<span class="tag">${esc(s.t)}</span>`:''}</span></summary><div class="note">${rich(s.d||'')}${s.up?' <b>'+rich(s.up)+'</b>':''}${s.uses?` <i>Uses: ${esc(s.uses)}.</i>`:''}</div>${acts}</details>`;}
  function renderSpells(){
    if(!$('spells'))return;
    OPEN=new Set([...all('details.sp[open]')].map(d=>d.dataset.n));
    const cg=groups.filter(g=>g.cantrip),og=groups.filter(g=>!g.cantrip);
    $('cantrips').innerHTML=cg.map(g=>(g.spells||[]).map(spellRow).join('')).join('')||'<div class="note">No cantrips.</div>';
    let html=og.map(g=>`<div class="sub">${esc(g.name||'')}</div>`+(g.spells||[]).map(spellRow).join('')).join('');
    if(PREP){const pp=(PREP.spells||[]).filter(s=>S.prep.includes(s.n));
      html+=`<div class="sub">${esc(PREP.groupLabel||'Prepared')} (${pp.length} / ${PREP.max})</div>`+(pp.length?pp.map(spellRow).join(''):`<div class="note">Nothing prepared yet. Choose spells in the ${esc(PREP.name||'spellbook')}.</div>`);
      $('prepCount').textContent=`${S.prep.length} / ${PREP.max} prepared`;
      $('prepList').innerHTML=(PREP.spells||[]).map(s=>{const on=S.prep.includes(s.n);const full=!on&&S.prep.length>=PREP.max;
        return `<button type="button" class="row book" data-prep="${esc(s.n)}" aria-pressed="${on?'true':'false'}" ${full?'disabled':''}><span class="bk-h"><span class="nm"><i class="p ${on?'on':''}"></i><b>${esc(s.n)}</b></span><span class="tags">${s.lvl?`<span class="tag lv">${esc(s.lvl)}</span>`:''}${s.c?'<span class="tag">Conc.</span>':''}</span></span><span class="note">${s.t?esc(s.t)+'. ':''}${rich(s.d||'')}${s.up?' '+rich(s.up):''}</span></button>`;}).join('');}
    $('spells').innerHTML=html||'<div class="note">No spells.</div>';
  }

  /* dynamic render */
  function pipsHtml(key,max,used,gold){let h='';for(let i=0;i<max;i++){const spent=i>=max-used;h+=`<button type="button" class="pip ${gold?'gold':''}" aria-pressed="${spent?'true':'false'}" data-pip="${esc(key)}" aria-label="${esc(key)} ${i+1} ${spent?'spent':'available'}"></button>`;}return h;}
  function acNow(){let ac=b.ac;b.acToggles.forEach(t=>{if(S.ac[t.id])ac+=t.bonus||0;});return ac;}
  function speedNow(){if(S.exh>=5)return 0;return S.exh>=2?Math.floor(b.speed/2):b.speed;}
  function hdMod(h){return h.mod!=null?h.mod:M.CON;}
  function render(skipSave){
    renderSpells();
    $('hpCur').textContent=S.hp;$('hpMax').textContent=' / '+b.maxHp;
    const pct=Math.max(0,Math.min(100,S.hp/b.maxHp*100));$('hpBar').style.width=pct+'%';
    $('hpBar').style.background=pct>50?'var(--good)':pct>25?'var(--gold)':'var(--bad)';
    $('tempRead').textContent='Temp HP '+S.temp;
    $('dsBox').style.opacity=S.hp===0?1:.55;
    $('dsS').innerHTML=[0,1,2].map(i=>`<button type="button" class="pip gold" aria-pressed="${i<S.dsS?'false':'true'}" data-ds="S" data-i="${i}" aria-label="Success ${i+1}"></button>`).join('');
    $('dsF').innerHTML=[0,1,2].map(i=>`<button type="button" class="pip" style="border-color:var(--bad);background:${i<S.dsF?'var(--bad)':'transparent'}" data-ds="F" data-i="${i}" aria-label="Failure ${i+1}"></button>`).join('');
    b.slots.forEach(s=>{const el=$('slot_'+s.id);if(el)el.innerHTML=pipsHtml('slot:'+s.id,s.count,S.slots[s.id]||0,s.gold);});
    $('acVal').textContent=acNow();
    all('[data-actog]').forEach(el=>setPressed(el,S.ac[el.dataset.actog]));
    setPressed($('inspTog'),S.insp);$('inspTog').textContent=S.insp?'Inspired':'None';
    $('spdVal').textContent=speedNow();
    const fly=b.resources.find(r=>r.type==='toggle'&&S.active[r.id]&&r.activeNote);
    $('flyNote').textContent=fly?fly.activeNote:'feet';
    const cb=$('concBox');cb.classList.toggle('on',!!S.conc);$('concName').textContent=S.conc||'Nothing';$('concDrop').hidden=!S.conc;$('concSave').hidden=!S.conc;
    /* attack buttons that spend slots or ammo */
    b.attacks.forEach((a,ai)=>{let ammo='';(a.buttons||[]).forEach((bt,bi)=>{const el=root.querySelector(`[data-atk="${ai}|${bi}"]`);if(!el)return;let dis=false;
      if(bt.spend){const sl=b.slots.find(s=>s.id===bt.spend);const rs=b.resources.find(r=>r.id===bt.spend);
        if(sl)dis=(S.slots[sl.id]||0)>=sl.count;else if(rs)dis=rs.type==='pool'?resLeft(rs)<(bt.cost||1):(S.res[rs.id]||0)>=rs.max;}
      if(bt.consume){const it=findItem(bt.consume);ammo=it?it.q+' left':'none left';dis=!it||!it.q;}
      el.disabled=dis;});
      const am=$('ammo_'+ai);if(am)am.textContent=ammo;});
    /* resources */
    if($('resources'))$('resources').innerHTML=b.resources.map(r=>{
      const head=`<b>${esc(r.name)}</b> ${tagHtml(r.tag)}${r.note?`<div class="note">${rich(r.note)}</div>`:''}`;
      const used=S.res[r.id]||0,left=r.max-used,out=r.type!=='pool'&&left<=0;
      const acts=(r.actions||[]).length?`<div class="btns" style="margin-top:4px">${r.actions.map((a,i)=>`<button type="button" class="tog" data-resact="${esc(r.id)}|${i}" ${out?'disabled':''}>${esc(a.label)}</button>`).join('')}</div>`:'';
      if(r.type==='pool')return `<div class="res"><div>${head}</div><div class="stepper"><button type="button" data-pool="${esc(r.id)}|-1" aria-label="Spend 1">−</button><span class="num">${resLeft(r)}</span><button type="button" data-pool="${esc(r.id)}|1" aria-label="Restore 1">+</button>${r.healSelf?`<button type="button" data-poolheal="${esc(r.id)}" title="Heal yourself from the pool using the Amount box">Heal self</button>`:''}</div></div>`;
      if(r.type==='toggle'){const on=!!S.active[r.id];return `<div class="res"><div>${head}</div><div class="btns"><button type="button" class="tog" data-toggle="${esc(r.id)}" aria-pressed="${on?'true':'false'}" ${out&&!on?'disabled':''}>${on?esc(r.onLabel||'Active · end'):out?'Used':esc(r.offLabel||'Use')}</button></div></div>`;}
      return `<div class="res"><div>${head}${acts}</div><div class="pips">${pipsHtml('res:'+r.id,r.max,used,r.gold)}</div></div>`;
    }).join('');
    /* hit dice */
    const hdTotals={};b.hitDice.forEach(h=>hdTotals[h.die]=(hdTotals[h.die]||0)+h.count);
    $('hdBox').innerHTML=Object.keys(hdTotals).sort((x,y)=>y-x).map(d=>{const h=b.hitDice.find(x=>String(x.die)===String(d));const m=hdMod(h);return `<div class="res"><div><b>d${d}</b> <span class="note">${esc(h.label||'')}${h.label?' · ':''}1d${d}${m?sg(m):''}</span></div><div class="stepper"><span class="num">${S.hd[d]||0}</span><span class="muted">/ ${hdTotals[d]}</span><button type="button" data-hd="${d}" ${!S.hd[d]||S.hp>=b.maxHp?'disabled':''}>Spend</button></div></div>`;}).join('');
    all('[data-cond]').forEach(el=>setPressed(el,S.conds.includes(el.dataset.cond)));
    $('exh').textContent=S.exh;$('exhNote').textContent=S.exh?EXH.slice(1,S.exh+1).join(' · '):'none';
    /* inventory */
    $('inv').innerHTML=S.inv.map((it,i)=>`<div class="it"><div class="itn"><span>${esc(it.n)}${it.eq?'<span class="eq">equipped</span>':''}</span>${editI===i?`<input class="desc-in" data-desc="${i}" value="${esc(it.d||'')}" placeholder="What does it do? Press Enter to save" aria-label="Description for ${esc(it.n)}">`:(it.d?`<div class="note">${rich(it.d)}</div>`:'')}</div><div class="stepper"><button type="button" class="edit" data-edit="${i}" aria-label="Edit description" title="Edit description">✎</button>${it.potion?`<button type="button" data-drink="${i}" ${it.q?'':'disabled'}>Drink</button>`:''}${it.eq?`<button type="button" data-eq="${i}" title="Unequip" aria-label="Unequip">⇩</button>`:`<button type="button" data-q="${i}|-1" aria-label="Use one">−</button><span class="num">${it.q}</span><button type="button" data-q="${i}|1" aria-label="Add one">+</button><button type="button" data-del="${i}" aria-label="Remove item" title="Remove">×</button>`}</div></div>`).join('');
    ['pp','gp','sp','cp'].forEach(c=>{const el=$('c_'+c);if(document.activeElement!==el)el.value=S.coins[c]||0;});
    if(document.activeElement!==$('notes'))$('notes').value=S.notes||'';
    if(!skipSave)save();
  }
  function save(){if(!readonly)onChange(clone(S));}
  function resLeft(r){return r.type==='pool'?(r.max-(S.res[r.id]||0)):r.max-(S.res[r.id]||0);}
  function findItem(name){const k=String(name).toLowerCase();return S.inv.find(it=>it.n.toLowerCase()===k)||S.inv.find(it=>it.n.toLowerCase().includes(k));}

  /* HP */
  function amt(){return Math.max(0,parseInt($('hpAmt').value,10)||0);}
  function heal(n,src){const was=S.hp;S.hp=Math.min(b.maxHp,S.hp+n);if(was===0&&S.hp>0){S.dsS=0;S.dsF=0;}log(`<b>${esc(src||'Healed')}</b>: +${S.hp-was} HP (now ${S.hp})`);render();}
  function damage(n){let left=n;const fromTemp=Math.min(S.temp,left);S.temp-=fromTemp;left-=fromTemp;const was=S.hp;S.hp=Math.max(0,S.hp-left);
    let msg=`<b>Took ${n} damage</b>${fromTemp?` (${fromTemp} absorbed by temp HP)`:''}: HP ${was} → ${S.hp}`;
    if(S.conc&&n>0)msg+=` · <span class="crit">Concentration check DC ${Math.max(10,Math.floor(n/2))}</span>`;
    if(S.hp===0&&was>0)msg+=' · <span class="fumble">Down! Roll death saves</span>';
    log(msg);render();}
  $('dmgBtn').onclick=()=>damage(amt());
  $('healBtn').onclick=()=>heal(amt());
  $('tempBtn').onclick=()=>{const n=amt();if(n>S.temp)S.temp=n;log(`<b>Temp HP</b> set to ${S.temp} (temp HP doesn't stack)`);render();};

  function spendFrom(id,cost){cost=cost||1;const sl=b.slots.find(s=>s.id===id);if(sl){if((S.slots[id]||0)>=sl.count)return false;S.slots[id]++;return true;}
    const rs=b.resources.find(r=>r.id===id);if(rs){if(resLeft(rs)<cost)return false;S.res[id]=(S.res[id]||0)+cost;return true;}return true;}

  /* clicks: in read-only mode only browsing controls work */
  const RO_OK=new Set(['histTog','copyStatus','normTog','advTog','disTog','clearLog','copyBk']);
  root.addEventListener('click',e=>{if(!readonly)return;const t=e.target.closest('button');if(!t)return;
    if(t.dataset.tab||RO_OK.has(t.id))return;e.stopImmediatePropagation();e.preventDefault();},true);
  root.addEventListener('submit',e=>{if(readonly){e.preventDefault();e.stopImmediatePropagation();}},true);
  root.addEventListener('click',e=>{
    const t=e.target.closest('button');if(!t||!root.contains(t))return;
    const d=t.dataset;
    if(d.roll){const [l,m]=d.roll.split('|');
      if(l==='Death save'){const x=d20();let res;if(x.k===20){S.hp=1;S.dsS=0;S.dsF=0;res='<span class="crit">Natural 20, back up with 1 HP</span>';}else if(x.k===1){S.dsF=Math.min(3,S.dsF+2);res='<span class="fumble">Natural 1, two failures</span>';}else if(x.k>=10){S.dsS=Math.min(3,S.dsS+1);res='Success';}else{S.dsF=Math.min(3,S.dsF+1);res='Failure';}
        if(S.dsS>=3&&S.hp===0)res+=' · <span class="crit">Stable</span>';if(S.dsF>=3)res+=` · <span class="fumble">${esc(b.name)} has died</span>`;
        log(`<b>Death save</b>: d20 [${x.txt}] · ${res}`);clearAdv();render();return;}
      check(l,parseInt(m,10));return;}
    if(d.pip){const [kind,id]=d.pip.split(':');const spent=t.getAttribute('aria-pressed')==='true';
      if(kind==='slot'){const sl=b.slots.find(s=>s.id===id);S.slots[id]=Math.max(0,Math.min(sl.count,(S.slots[id]||0)+(spent?-1:1)));}
      else{const r=b.resources.find(x=>x.id===id);S.res[id]=Math.max(0,Math.min(r.max,(S.res[id]||0)+(spent?-1:1)));
        if(!spent&&r.activates){riderOn[r.activates]=true;setPressed(root.querySelector(`[data-rider="${r.activates}"]`),true);}}
      render();return;}
    if(d.ds){const k='ds'+d.ds,i=+d.i;S[k]=S[k]===i+1?i:i+1;render();return;}
    if(d.rider){riderOn[d.rider]=!riderOn[d.rider];setPressed(t,riderOn[d.rider]);return;}
    if(d.actog){S.ac[d.actog]=S.ac[d.actog]?0:1;const at=b.acToggles.find(x=>x.id===d.actog);if(S.ac[d.actog])log(`<b>${esc(at.label)}</b>: AC ${acNow()}`);render();return;}
    if(d.atk){const [ai,bi]=d.atk.split('|').map(Number);const a=b.attacks[ai],bt=a.buttons[bi];
      if(bt.consume){const it=findItem(bt.consume);if(!it||!it.q)return;it.q--;}
      if(bt.spend&&!spendFrom(bt.spend,bt.cost))return;
      const label=bt.rollLabel||((a.name||bt.label)+(bt.attack!=null?'':' · '+bt.label));
      if(bt.attack!=null){const times=bt.times||1;if(times>1){const keep=$('keepMode').checked;$('keepMode').checked=true;for(let i=1;i<=times;i++)attack(`${label} ${i}`,bt.attack);$('keepMode').checked=keep;clearAdv();}else attack(label,bt.attack);}
      if(bt.damage){const kind=bt.kind||bt.apply||'hit';const ps=parts(bt.damage);roll(label,bt.riders===false?ps:ps.concat(extras(kind)),{nocrit:bt.nocrit});if(kind==='hit')setPressed($('critTog'),false);}
      if(bt.log)log(`<b>${esc(a.name||bt.label)}</b>: ${rich(bt.log)}`);
      render();return;}
    if(d.resact){const [id,i]=d.resact.split('|');const r=b.resources.find(x=>x.id===id);const a=r.actions[+i];
      if(!spendFrom(id,a.cost))return;
      if(a.roll){const total=roll(`${r.name}${a.label&&a.label!=='Use'?' · '+a.label:''}`,parts(a.roll),{nocrit:true});if(a.healSelf)heal(total,r.name);}
      if(a.log)log(`<b>${esc(a.label||r.name)}</b>: ${rich(a.log)}`);
      if(r.activates){riderOn[r.activates]=true;setPressed(root.querySelector(`[data-rider="${r.activates}"]`),true);}
      render();return;}
    if(d.pool){const [id,dd]=d.pool.split('|');const r=b.resources.find(x=>x.id===id);S.res[id]=Math.max(0,Math.min(r.max,(S.res[id]||0)-(+dd)));render();return;}
    if(d.poolheal){const r=b.resources.find(x=>x.id===d.poolheal);const n=Math.min(amt(),resLeft(r),b.maxHp-S.hp);if(!n)return;S.res[r.id]=(S.res[r.id]||0)+n;heal(n,r.name);return;}
    if(d.toggle){const r=b.resources.find(x=>x.id===d.toggle);if(S.active[r.id]){S.active[r.id]=0;log(`<b>${esc(r.name)}</b> ends`);}else{if((S.res[r.id]||0)>=r.max)return;S.active[r.id]=1;S.res[r.id]=(S.res[r.id]||0)+1;log(`<b>${esc(r.name)}</b>${r.activeLog?': '+rich(r.activeLog):' starts'}`);}render();return;}
    if(d.hd){const dd=+d.hd;if(!S.hd[dd])return;S.hd[dd]--;const h=b.hitDice.find(x=>+x.die===dd);const m=hdMod(h);const v=rnd(dd);const total=Math.max(0,v+m);log(`<b>Hit die d${dd}</b>: [${v}] ${sg(m)} = <span class="tot">${total}</span>`);heal(total,'Hit die');return;}
    if(d.prep){const n=d.prep;if(S.prep.includes(n))S.prep=S.prep.filter(x=>x!==n);else if(S.prep.length<PREP.max)S.prep=[...S.prep,n];render();return;}
    if(d.conc){S.conc=d.conc;log(`<b>Concentrating</b> on ${esc(d.conc)}`);render();return;}
    if(d.spact){const [n,i]=d.spact.split('|');const s=spellIndex[n];const a=s&&s.actions[+i];if(!a)return;
      if(a.spend&&!spendFrom(a.spend))return;
      if(a.roll){const total=roll(`${s.n}${a.label?' · '+a.label:''}`,parts(a.roll),{nocrit:!(s.actions||[]).some(x=>x.attack!=null)});if(a.healSelf)heal(total,s.n);}
      if(a.attack!=null)attack(s.n,a.attack);
      if(a.tempHp){if(a.tempHp>S.temp)S.temp=a.tempHp;log(`<b>${esc(s.n)}</b>: ${a.tempHp} temp HP`);}
      if(a.acToggle){S.ac[a.acToggle]=S.ac[a.acToggle]?0:1;if(S.ac[a.acToggle])log(`<b>${esc(s.n)}</b>: AC ${acNow()}`);}
      if(a.log)log(`<b>${esc(s.n)}</b>: ${rich(a.log)}`);
      render();return;}
    if(d.cond){const c=d.cond;S.conds=S.conds.includes(c)?S.conds.filter(x=>x!==c):[...S.conds,c];render();return;}
    if(d.q){const [i,dd]=d.q.split('|').map(Number);S.inv[i].q=Math.max(0,S.inv[i].q+dd);render();return;}
    if(d.eq!==undefined){const it=S.inv[+d.eq];it.eq=0;render();return;}
    if(d.edit!==undefined){const i=+d.edit;editI=editI===i?-1:i;render(true);if(editI===i){const el=root.querySelector('[data-desc="'+i+'"]');if(el)el.focus();}return;}
    if(d.del){S.inv.splice(+d.del,1);render();return;}
    if(d.drink){const it=S.inv[+d.drink];if(!it.q)return;it.q--;const h=roll(it.n,parts(it.potion),{nocrit:true});heal(h,it.n);return;}
  });
  $('normTog').onclick=()=>setMode('n');$('advTog').onclick=()=>setMode('a');$('disTog').onclick=()=>setMode('d');
  $('histTog').onclick=()=>{const bx=$('histBox');bx.hidden=!bx.hidden;$('histTog').setAttribute('aria-expanded',bx.hidden?'false':'true');try{localStorage.setItem(prefKey+'-hist',bx.hidden?'0':'1');}catch(e){}};
  try{if(localStorage.getItem(prefKey+'-hist')==='1'){$('histBox').hidden=false;$('histTog').setAttribute('aria-expanded','true');}}catch(e){}
  $('critTog').addEventListener('click',()=>setPressed($('critTog'),!pressed('critTog')));
  $('inspTog').onclick=()=>{if(readonly)return;S.insp=S.insp?0:1;render();};

  $('freeRoll').onclick=()=>{const m=/^\s*(\d*)d(\d+)\s*([+-]\s*\d+)?\s*$/i.exec($('freeExpr').value);
    if(!m){log('<b>Free roll</b>: use a form like 2d6+1');return;}const n=Math.min(100,parseInt(m[1]||'1',10)),s=parseInt(m[2],10),f=m[3]?parseInt(m[3].replace(/\s/g,''),10):0;
    const rl=dice(n,s);log(`<b>${esc($('freeExpr').value)}</b>: [${rl.join(', ')}] ${f?sg(f):''} = <span class="tot">${rl.reduce((a,c)=>a+c,0)+f}</span>`);};
  $('clearLog').onclick=()=>{logEl.innerHTML='<div class="muted">Rolls appear here.</div>';logStarted=false;};

  /* concentration */
  $('concDrop').onclick=()=>{if(readonly)return;log(`<b>Concentration</b> on ${esc(S.conc)} ended`);S.conc='';render();};
  $('concSave').onclick=()=>check('Concentration (Con save)',saveMod(b,'CON'));

  /* rests */
  function endActive(kind){b.resources.forEach(r=>{if(r.type==='toggle'&&S.active[r.id])S.active[r.id]=0;});
    b.riders.forEach(r=>{if(r.clearOnRest!==false){riderOn[r.id]=false;setPressed(root.querySelector(`[data-rider="${r.id}"]`),false);}});
    S.ac={};}
  $('shortRest').onclick=()=>{if(readonly)return;const names=[];
    b.slots.forEach(s=>{if(s.reset==='short'){S.slots[s.id]=0;names.push(s.label||s.id);}});
    b.resources.forEach(r=>{if(r.reset==='short'){S.res[r.id]=0;names.push(r.name);}});
    endActive('short');
    $('restMsg').textContent='Short rest: '+(names.length?names.join(', ')+' restored. ':'')+'Spend hit dice below to heal.';log('<b>Short rest</b> taken');render();};
  $('longRest').onclick=()=>{if(readonly)return;
    const total=b.hitDice.reduce((a,h)=>a+h.count,0);let regain=Math.max(1,Math.floor(total/2));
    const hdTotals={};b.hitDice.forEach(h=>hdTotals[h.die]=(hdTotals[h.die]||0)+h.count);
    Object.keys(hdTotals).sort((x,y)=>y-x).forEach(dd=>{const g=Math.min(regain,hdTotals[dd]-(S.hd[dd]||0));S.hd[dd]=(S.hd[dd]||0)+g;regain-=g;});
    b.slots.forEach(s=>S.slots[s.id]=0);b.resources.forEach(r=>S.res[r.id]=0);
    endActive('long');
    Object.assign(S,{hp:b.maxHp,temp:0,dsS:0,dsF:0,conc:'',exh:Math.max(0,S.exh-1)});
    $('restMsg').textContent=`Long rest: HP, slots and features restored, ${Math.max(1,Math.floor(total/2))} hit dice regained, exhaustion reduced by 1.`;log('<b>Long rest</b> taken');render();};

  /* conditions, inventory, notes */
  $('exhUp').onclick=()=>{if(readonly)return;S.exh=Math.min(6,S.exh+1);render();};$('exhDn').onclick=()=>{if(readonly)return;S.exh=Math.max(0,S.exh-1);render();};
  root.addEventListener('change',e=>{const el=e.target;if(el.dataset&&el.dataset.desc!==undefined){S.inv[+el.dataset.desc].d=el.value.trim();editI=-1;render();}});
  $('addForm').addEventListener('submit',e=>{e.preventDefault();if(readonly)return;const n=$('addName').value.trim();if(!n)return;const dsc=$('addDesc').value.trim();const it={n,q:Math.max(1,parseInt($('addQty').value,10)||1)};if(dsc)it.d=dsc;S.inv.push(it);$('addName').value='';$('addDesc').value='';$('addQty').value=1;render();});
  ['pp','gp','sp','cp'].forEach(c=>$('c_'+c).addEventListener('input',e=>{S.coins[c]=Math.max(0,parseInt(e.target.value,10)||0);save();}));
  $('notes').addEventListener('input',e=>{S.notes=e.target.value;save();});

  /* backup */
  $('copyBk').onclick=()=>{const txt=JSON.stringify(S);$('backup').value=txt;copyText(txt,'Backup copied.',$('bkMsg'),$('backup'));};
  $('loadBk').onclick=()=>{if(readonly)return;try{const o=JSON.parse($('backup').value);S=reconcile(b,o);render();$('bkMsg').textContent='Sheet restored from backup.';}catch(e){$('bkMsg').textContent='That text isn\'t a valid backup. Paste the full text from Copy backup.';}};
  $('resetBtn').onclick=()=>{if(readonly)return;$('resetConfirm').hidden=false;};
  $('resetNo').onclick=()=>{$('resetConfirm').hidden=true;};
  $('resetYes').onclick=()=>{S=fresh(b);$('resetConfirm').hidden=true;$('bkMsg').textContent='Sheet reset to starting values.';render();};
  function copyText(txt,okMsg,msgEl,selEl){
    const fallback=()=>{if(selEl){selEl.value=txt;selEl.select();}if(msgEl)msgEl.textContent='Selected. Copy it with your keyboard.';};
    try{navigator.clipboard.writeText(txt).then(()=>{if(msgEl)msgEl.textContent=okMsg;},fallback);}catch(e){fallback();}}

  /* status summary for the DM */
  function statusText(){
    const L=[];
    L.push(`${b.name} — ${b.classLine||''}`.trim());
    L.push(`HP ${S.hp}/${b.maxHp}${S.temp?` (+${S.temp} temp)`:''} · AC ${acNow()} · Speed ${speedNow()}${S.insp?' · Inspired':''}`);
    if(b.slots.length)L.push('Slots: '+b.slots.map(s=>`${s.label||s.id} ${s.count-(S.slots[s.id]||0)}/${s.count}`).join(' · '));
    if(b.resources.length)L.push('Resources: '+b.resources.map(r=>r.type==='toggle'?`${r.name} ${S.active[r.id]?'ACTIVE':((S.res[r.id]||0)>=r.max?'used':'ready')}`:`${r.name} ${resLeft(r)}/${r.max}`).join(' · '));
    const hdT={};b.hitDice.forEach(h=>hdT[h.die]=(hdT[h.die]||0)+h.count);
    L.push('Hit dice: '+Object.keys(hdT).map(d=>`d${d} ${S.hd[d]||0}/${hdT[d]}`).join(' · '));
    if(S.conc)L.push('Concentrating: '+S.conc);
    if(S.conds.length||S.exh)L.push('Conditions: '+[...S.conds,...(S.exh?['Exhaustion '+S.exh]:[])].join(', '));
    if(S.hp===0)L.push(`Death saves: ${S.dsS} successes, ${S.dsF} failures`);
    if(PREP)L.push('Prepared: '+(S.prep.join(', ')||'none'));
    L.push('Inventory: '+S.inv.filter(i=>i.eq||i.q).map(i=>i.n+(i.q>1?` ×${i.q}`:'')).join(', '));
    const c=S.coins;L.push(`Coins: ${c.pp||0} pp, ${c.gp||0} gp, ${c.sp||0} sp, ${c.cp||0} cp`);
    return L.join('\n');
  }
  $('copyStatus').onclick=()=>copyText(statusText(),'Status copied. Paste it to the DM.',$('restMsg'),null);

  /* tabs */
  const tabs=[...all('[data-tab]')].map(x=>x.dataset.tab);
  function showTab(tb){all('[data-pane]').forEach(p=>{p.hidden=p.dataset.pane!==tb;});all('[data-tab]').forEach(x=>x.setAttribute('aria-selected',x.dataset.tab===tb?'true':'false'));try{localStorage.setItem(prefKey+'-tab',tb);}catch(e){}}
  all('[data-tab]').forEach(x=>x.addEventListener('click',()=>showTab(x.dataset.tab)));
  let tab0='combat';try{tab0=localStorage.getItem(prefKey+'-tab')||'combat';}catch(e){}
  showTab(tabs.includes(tab0)?tab0:'combat');

  function applyReadonly(){root.classList.toggle('ro',readonly);const bn=$('roBanner');bn.hidden=!readonly;bn.textContent=readonly?(opts.readonlyText||`Viewing ${b.name}'s sheet. Only the owner (or the DM) can change it.`):'';}
  applyReadonly();
  render(true);

  return {
    getState:()=>clone(S),
    setState(st){const active=document.activeElement;const typing=active&&root.contains(active)&&/INPUT|TEXTAREA/.test(active.tagName);S=reconcile(b,st);render(true);if(typing)active.focus();},
    setReadonly(v){readonly=!!v;applyReadonly();},
    statusText,
    build:b,
    extraGear:$('extraGear')
  };
}

global.SheetEngine={mount,normalise,fresh,reconcile,parts};
})(window);
