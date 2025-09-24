// Clean-sheet seniority cascade
const $ = id => document.getElementById(id);
const asInt = v => (v==null||v==='')?0:(Number(v)||0);
const seatKey3 = (equip, base, seat) => `${String(equip||'').toUpperCase()}|${String(base).toUpperCase()}|${String(seat).toUpperCase()}`;
const keyBaseSeat = (base, seat) => `${String(base).toUpperCase()}|${String(seat).toUpperCase()}`;

let CAP=[], ROST=[], PREF_DETAILS=new Map(), RESULTS=[];

async function fetchJSON(url){ const r=await fetch(url,{cache:'no-store'}); if(!r.ok) throw new Error(url+' '+r.status); return r.json(); }

function normalizeCaps(raw){
  // Accept object keys "equip|BASE|SEAT" or "BASE|SEAT" (equip ignored for gating)
  if (Array.isArray(raw)) throw new Error('capacities.json must be an OBJECT (not array).');
  const out = [];
  for (const [k,obj] of Object.entries(raw||{})){
    const parts = String(k).split('|').filter(Boolean);
    const seat = (parts.length>=1? parts[parts.length-1]: '').toUpperCase();
    const base = (parts.length>=2? parts[parts.length-2]: '').toUpperCase();
    const equip= (parts.length>=3? parts[0]: '').toUpperCase();
    const inc = asInt(obj?.incumbents ?? obj?.startCapacity ?? 0);
    const targ = asInt(obj?.target ?? inc);
    out.push({equip, base, seat, incumbents:inc, delta:targ-inc});
  }
  out.sort((a,b)=> a.base.localeCompare(b.base)||a.seat.localeCompare(b.seat)||a.equip.localeCompare(b.equip));
  return out;
}

function normalizeRoster(raw){
  if (!Array.isArray(raw)) throw new Error('roster.json must be an ARRAY.');
  const out = raw.map(r=>{
    const sen = asInt(r.sen ?? r.seniority ?? r.Sen);
    const name = String(r.name||'');
    const cur = r.current||{};
    const base = String(cur.base||'').toUpperCase();
    const seat = String(cur.seat||'').toUpperCase();
    const equip= String(cur.equip||'').toUpperCase();
    if (!sen || !base || !seat) throw new Error(`Roster row for "${name}" missing sen/base/seat`);
    return {sen, name, current:{equip, base, seat}};
  }).sort((a,b)=>a.sen-b.sen);
  return out;
}

function normalizePrefs(raw){
  if (Array.isArray(raw)) throw new Error('preferences.json must be an OBJECT keyed by any id.');
  const map = new Map();
  for (const obj of Object.values(raw||{})){
    const sen = asInt(obj.sen ?? obj.seniority ?? obj.Sen);
    const arr = Array.isArray(obj.preferences)? [...obj.preferences]: [];
    arr.sort((a,b)=> (a.order??0)-(b.order??0));
    const rows = arr.map(x=>({
      order: asInt(x.order),
      stay: !!x.stay,
      equip: String(x.equip||'').toUpperCase(),
      base: String(x.base||'').toUpperCase(),
      seat: String(x.seat||'').toUpperCase(),
      bpl_min: asInt(x.bpl_min || x.bpl || 0),
    }));
    map.set(sen, rows);
  }
  return map;
}

function buildSeatIndex(roster){
  const m=new Map();
  for (const r of roster){
    const k=keyBaseSeat(r.current.base, r.current.seat);
    if(!m.has(k)) m.set(k, []);
    m.get(k).push(r.sen);
  }
  for (const arr of m.values()) arr.sort((a,b)=>a-b);
  return m;
}
function projectRank(seatIndex, base, seat, sen){
  const k=keyBaseSeat(base, seat);
  const arr=seatIndex.get(k)||[];
  let i=0; while(i<arr.length && arr[i]<sen) i++;
  return i+1;
}

function runCascade(mode){
  const seeded=new Map(), backfill=new Map();
  for (const c of CAP){
    const k=keyBaseSeat(c.base,c.seat);
    seeded.set(k,(seeded.get(k)||0)+Math.max(0, asInt(c.delta)));
    if(!backfill.has(k)) backfill.set(k,0);
  }

  const pilots = ROST.map(r=>({...r}));
  const seatIndex = buildSeatIndex(pilots);
  const awards = [];

  for (const r of pilots){
    const prefs = PREF_DETAILS.get(r.sen) || [];
    const ordered=[]; const seen=new Set();
    for (const row of prefs){
      if (row.stay){ ordered.push({base:r.current.base, seat:r.current.seat, stay:true, bpl_min:0}); continue; }
      if (!row.base || !row.seat) continue;
      const bs=keyBaseSeat(row.base,row.seat);
      if (seen.has(bs)) continue; seen.add(bs);
      ordered.push({base:row.base, seat:row.seat, stay:false, bpl_min:row.bpl_min||0});
    }
    let awarded={base:r.current.base, seat:r.current.seat, prefNum:0, moved:false, upgrade:false, note:'Stayed'};

    for (let i=0;i<ordered.length;i++){
      const p=ordered[i];
      const bk=keyBaseSeat(p.base,p.seat);
      const fromK=keyBaseSeat(r.current.base, r.current.seat);
      if (p.stay || (p.base===r.current.base && p.seat===r.current.seat)){ awarded={base:r.current.base, seat:r.current.seat, prefNum:i+1, moved:false, upgrade:false, note:'Stayed (listed)'}; break; }
      let bf=backfill.get(bk)||0, sd=seeded.get(bk)||0;
      if (bf<=0 && sd<=0) continue;

      if (p.bpl_min>0){
        const rank=projectRank(seatIndex, p.base, p.seat, r.sen);
        if (rank>p.bpl_min) continue;
      }
      if (sd>0 && p.seat==='CA' && mode==='upgrades' && r.current.seat!=='FO'){
        if (bf<=0) continue;
      }

      if (bf>0) backfill.set(bk, bf-1); else seeded.set(bk, sd-1);
      backfill.set(fromK, (backfill.get(fromK)||0)+1);

      // update live seat index
      const oArr=seatIndex.get(fromK)||[]; seatIndex.set(fromK, oArr.filter(sen=>sen!==r.sen));
      const dArr=seatIndex.get(bk)||[]; let j=0; while(j<dArr.length && dArr[j]<r.sen) j++; dArr.splice(j,0,r.sen); seatIndex.set(bk,dArr);

      const isUp = (r.current.seat==='FO' && p.seat==='CA');
      awarded={base:p.base, seat:p.seat, prefNum:i+1, moved:true, upgrade:isUp, note:isUp?'Upgrade':'Lateral'};
      r.current.base=p.base; r.current.seat=p.seat;
      break;
    }
    awards.push({sen:r.sen, name:r.name, from:`${r.current.base} ${r.current.seat}`, to:`${awarded.base} ${awarded.seat}`, pref:awarded.prefNum, moved:awarded.moved, upgrade:awarded.upgrade, note:awarded.note});
  }
  return {awards, seeded, backfill};
}

function buildUI(){
  const bases=[...new Set(CAP.map(c=>c.base))].sort();
  $('qBase').innerHTML = bases.map(b=>`<option>${b}</option>`).join('');
  $('fltBase').innerHTML = '<option value=\"\">Awarded Base: All</option>' + bases.map(b=>`<option>${b}</option>`).join('');

  const holder=$('capGrid'); holder.innerHTML='';
  let cur=null, tbl=null, tbody=null;
  CAP.forEach(c=>{
    if (c.base!==cur){
      cur=c.base; tbl=document.createElement('table'); const thead=document.createElement('thead'); const tr=document.createElement('tr');
      ['Base','Seat','Seeded Δ','Backfill Vacancies (dynamic)'].forEach(h=>{ const th=document.createElement('th'); th.textContent=h; tr.appendChild(th); });
      thead.appendChild(tr); tbl.appendChild(thead); tbody=document.createElement('tbody'); tbl.appendChild(tbody); holder.appendChild(tbl);
    }
    const row=document.createElement('tr');
    const cell=t=>{ const td=document.createElement('td'); td.textContent=t; return td; };
    row.appendChild(cell(c.base)); row.appendChild(cell(c.seat));

    const wrap=document.createElement('div'); wrap.className='row';
    const minus=document.createElement('button'); minus.className='ghost'; minus.textContent='–';
    const input=document.createElement('input'); input.type='number'; input.style.width='90px'; input.value=String(c.delta);
    const plus=document.createElement('button'); plus.className='ghost'; plus.textContent='+';
    minus.onclick=()=>{ c.delta--; input.value=String(c.delta); if ($('autoRun').checked) cascadeAndRender(); };
    plus.onclick=()=>{ c.delta++; input.value=String(c.delta); if ($('autoRun').checked) cascadeAndRender(); };
    input.oninput=()=>{ c.delta=asInt(input.value); if ($('autoRun').checked) cascadeAndRender(); };
    const seededCell=document.createElement('td'); wrap.appendChild(minus); wrap.appendChild(input); wrap.appendChild(plus); seededCell.appendChild(wrap);

    const backfillCell=document.createElement('td'); const pill=document.createElement('span'); pill.className='pill'; pill.textContent='0'; backfillCell.appendChild(pill);

    row.appendChild(seededCell); row.appendChild(backfillCell); tbody.appendChild(row);
    c._backfillPill=pill;
  });
}

function render(awards, seeded, backfill){
  // update backfill pills
  CAP.forEach(c=>{ const k=keyBaseSeat(c.base,c.seat); if (c._backfillPill) c._backfillPill.textContent=String(backfill.get(k)||0); });

  const holder=$('results'); holder.innerHTML='';
  if (!awards.length){ holder.innerHTML='<div class="empty">No awards yet.</div>'; return; }
  const q=$('q').value.trim().toLowerCase(), mv=$('fltMove').value, fb=$('fltBase').value, fs=$('fltSeat').value;
  let rows=awards.slice();
  if (q) rows=rows.filter(r=> String(r.sen).includes(q) || (r.name||'').toLowerCase().includes(q));
  if (mv==='movers') rows=rows.filter(r=>r.moved);
  if (mv==='upgrades') rows=rows.filter(r=>r.upgrade);
  if (fb) rows=rows.filter(r=> (r.to||'').startsWith(fb+' '));
  if (fs) rows=rows.filter(r=> (r.to||'').endsWith(' '+fs));

  $('shown').textContent=rows.length; $('total').textContent=awards.length; $('upCnt').textContent=awards.filter(r=>r.upgrade).length; $('mvCnt').textContent=awards.filter(r=>r.moved).length;

  const tbl=document.createElement('table'); const thead=document.createElement('thead'); const tr=document.createElement('tr');
  ['Seniority','Pilot','From','Awarded','Pref#','Tags','Note'].forEach(h=>{ const th=document.createElement('th'); th.textContent=h; tr.appendChild(th); });
  thead.appendChild(tr); tbl.appendChild(thead);
  const tbody=document.createElement('tbody');
  rows.forEach(r=>{
    const tags=[]; if (r.moved) tags.push('<span class="tag tag-move">moved</span>'); if (r.upgrade) tags.push('<span class="tag tag-up">upgrade</span>'); if (!r.moved && !r.upgrade) tags.push('<span class="tag tag-stay">no change</span>');
    const row=document.createElement('tr'); const td=t=>{ const d=document.createElement('td'); d.innerHTML=t; return d; };
    row.appendChild(td(String(r.sen))); row.appendChild(td(r.name||'')); row.appendChild(td(r.from||'')); row.appendChild(td(r.to||''));
    row.appendChild(td(String(r.pref||0))); row.appendChild(td(tags.join(' '))); row.appendChild(td(r.note||'')); tbody.appendChild(row);
  });
  tbl.appendChild(tbody); holder.appendChild(tbl);
  $('btnCSV').disabled = rows.length===0;
}

function cascadeAndRender(){
  try{
    const mode=$('mode').value;
    const {awards, seeded, backfill} = runCascade(mode);
    RESULTS=awards;
    render(awards, seeded, backfill);
    setStatus(`Loaded & cascaded • ${ROST.length} pilots`, true);
  }catch(e){
    setStatus('Cascade failed', false);
    $('results').innerHTML = `<div class="empty">Cascade error: ${e.message||e}</div>`;
  }
}

function setStatus(t, ok){ const s=$('status'); s.textContent=t; s.classList.remove('err','ok'); s.classList.add(ok?'ok':'err'); }

async function init(){
  try{
    const base=new URL('data/', document.baseURI);
    const [caps, rost, prefs] = await Promise.all([
      fetchJSON(new URL('capacities.json', base)),
      fetchJSON(new URL('roster.json', base)),
      fetchJSON(new URL('preferences.json', base)),
    ]);
    CAP=normalizeCaps(caps); ROST=normalizeRoster(rost); PREF_DETAILS=normalizePrefs(prefs);
    buildUI(); cascadeAndRender();
  }catch(e){
    setStatus('Load failed', false);
    $('results').innerHTML = `<div class="empty">Couldn’t auto-load /data/*.json. ${e.message||e}</div>`;
  }
}

// events
['mode'].forEach(id=> $(id).addEventListener('change', cascadeAndRender));
$('qApply').addEventListener('click', ()=>{
  const b=$('qBase').value, s=$('qSeat').value, amt=asInt($('qAmt').value)||0;
  CAP.forEach(c=>{ if (c.base===b && c.seat===s) c.delta += amt; });
  buildUI(); if ($('autoRun').checked) cascadeAndRender();
});
document.addEventListener('click', (e)=>{
  const btn=e.target.closest('button[data-nudge]'); if(!btn) return;
  const n=asInt(btn.getAttribute('data-nudge')); CAP.forEach(c=> c.delta += n);
  buildUI(); if ($('autoRun').checked) cascadeAndRender();
});
$('btnReset').addEventListener('click', ()=>{
  CAP.forEach(c=> c.delta=0);
  buildUI(); if ($('autoRun').checked) cascadeAndRender();
});
['q','fltMove','fltBase','fltSeat'].forEach(id=>{ $(id).addEventListener('input', ()=>render(RESULTS, new Map(), new Map())); $(id).addEventListener('change', ()=>render(RESULTS, new Map(), new Map())); });
$('btnClear').addEventListener('click', ()=>{ $('q').value=''; $('fltMove').value='all'; $('fltBase').value=''; $('fltSeat').value=''; render(RESULTS,new Map(),new Map()); });

$('btnCSV').addEventListener('click', ()=>{
  const headers=['Seniority','Pilot_Name','From','Awarded','Pref_Num','Moved','Upgrade','Note'];
  const esc=s=>`"${String(s??'').replace(/"/g,'""')}"`;
  const csv=[headers.join(',')].concat(RESULTS.map(r=>[r.sen,r.name,r.from,r.to,r.pref,r.moved?'Y':'',r.upgrade?'Y':'',r.note||''].map(esc).join(','))).join('\\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}), url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='awards.csv'; document.body.appendChild(a); a.click(); URL.revokeObjectURL(url); a.remove();
});

document.addEventListener('DOMContentLoaded', init);
