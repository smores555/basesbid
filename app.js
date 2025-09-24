// app.js — Seniority Cascade (No BPL) with tolerant capacities parsing
// Expects DOM ids present in index.html: status, mode, qBase, qSeat, qAmt, qApply,
// capGrid, autoRun, btnReset, q, fltMove, fltBase, fltSeat, btnClear, btnCSV, results

const $ = id => document.getElementById(id);
const asInt = v => (v==null||v==='')?0:(Number(v)||0);
const keyBaseSeat = (base, seat) => `${String(base).toUpperCase()}|${String(seat).toUpperCase()}`;

// fetch with fallback (capacities.json OR capacities.json.txt)
async function fetchJSON(paths){
  for (const p of paths){
    try{ const r = await fetch(p, {cache:'no-store'}); if (r.ok) return r.json(); }catch(e){}
  }
  throw new Error('Failed to load: '+paths.join(', '));
}

let CAP=[], ROST=[], PREF_DETAILS=new Map(), RESULTS=[];

function setStatus(t, ok){ const s=$('status'); if(!s) return; s.textContent=t; s.classList.remove?.('err','ok'); s.classList.add?.(ok?'ok':'err'); }

// ✅ handle both OBJECT and ARRAY capacities; accept keys like "SEA|CA", "SEA CA", etc.
function normalizeCaps(raw){
  const out=[];
  if (Array.isArray(raw)){
    for (const c of raw){
      const base=String(c.base||'').toUpperCase();
      const seat=String(c.seat||'').toUpperCase();
      const inc=asInt(c.startCapacity ?? c.incumbents ?? 0);
      const targ = asInt(c.target ?? (c.delta!=null ? inc + asInt(c.delta) : inc));
      if (base && seat) out.push({base, seat, incumbents:inc, delta:targ-inc});
    }
  } else {
    for (const [k,obj] of Object.entries(raw||{})){
      const tokens = String(k).split(/[\|\s\/\-_]+/).filter(Boolean);
      const seat = (tokens.length>=1? tokens[tokens.length-1]: '').toUpperCase();
      const base = (tokens.length>=2? tokens[tokens.length-2]: '').toUpperCase();
      const inc  = asInt(obj?.incumbents ?? obj?.startCapacity ?? 0);
      const targ = asInt(obj?.target ?? (obj?.delta!=null ? inc + asInt(obj.delta) : inc));
      if (base && seat) out.push({base, seat, incumbents:inc, delta:targ-inc});
    }
  }
  out.sort((a,b)=> a.base.localeCompare(b.base)||a.seat.localeCompare(b.seat));
  return out;
}

function normalizeRoster(raw){
  if (!Array.isArray(raw)) return [];
  return raw.map(r=>({sen:asInt(r.sen ?? r.seniority ?? r.Sen),
                      name:String(r.name||''),
                      currentBase:String(r.current?.base||'').toUpperCase(),
                      currentSeat:String(r.current?.seat||'').toUpperCase()}))
            .filter(r=>r.sen>0 && r.currentBase && r.currentSeat)
            .sort((a,b)=>a.sen-b.sen);
}

function parsePrefString(s){
  const t=String(s||'').trim().toUpperCase();
  if(!t) return null;
  if(t==='0') return {stay:true};
  const parts=t.split(/[\s\/\-\_]+/).filter(Boolean);
  if(parts.length>=2){ return {base:parts[parts.length-2], seat:parts[parts.length-1]}; }
  return null;
}

function normalizePrefs(raw){
  const map=new Map();
  const values = Array.isArray(raw) ? raw : Object.values(raw||{});
  for (const obj of values){
    const sen=asInt(obj.sen ?? obj.seniority ?? obj.Sen);
    const arr = Array.isArray(obj.preferences)? [...obj.preferences] : (Array.isArray(obj.prefs)? [...obj.prefs] : []);
    arr.sort((a,b)=> (asInt(a.order) - asInt(b.order)));
    const rows = arr.map(x=>{
      if (typeof x === 'string' || typeof x === 'number'){ const p=parsePrefString(x); return p||null; }
      if (x && (x.stay || x.base || x.seat)){
        return { stay: !!x.stay, base:String(x.base||'').toUpperCase(), seat:String(x.seat||'').toUpperCase() };
      }
      return null;
    }).filter(Boolean);
    map.set(sen, rows);
  }
  return map;
}

function buildSeatIndex(roster){
  const m=new Map();
  for (const r of roster){
    const k=keyBaseSeat(r.currentBase, r.currentSeat);
    if(!m.has(k)) m.set(k, []);
    m.get(k).push(r.sen);
  }
  for (const arr of m.values()) arr.sort((a,b)=>a-b);
  return m;
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
    const seen=new Set(); const ordered=[];
    for (const p of prefs){
      if (p.stay){ ordered.push({base:r.currentBase, seat:r.currentSeat, stay:true}); continue; }
      if (!p.base || !p.seat) continue;
      const bs=keyBaseSeat(p.base,p.seat);
      if (seen.has(bs)) continue; seen.add(bs);
      ordered.push({base:p.base, seat:p.seat, stay:false});
    }

    let awardedBase=r.currentBase, awardedSeat=r.currentSeat, prefNum=0, moved=false, upgrade=false, note='Stayed';

    for (let i=0;i<ordered.length;i++){
      const p=ordered[i];
      const bk=keyBaseSeat(p.base,p.seat);
      const fromK=keyBaseSeat(r.currentBase, r.currentSeat);

      if (p.stay || (p.base===r.currentBase && p.seat===r.currentSeat)){
        prefNum=i+1; note='Stayed (listed)'; break;
      }
      let bf=backfill.get(bk)||0, sd=seeded.get(bk)||0;
      if (bf<=0 && sd<=0) continue;

      if (sd>0 && p.seat==='CA' && mode==='upgrades' && r.currentSeat!=='FO'){
        if (bf<=0) continue;
      }

      if (bf>0) backfill.set(bk, bf-1); else seeded.set(bk, sd-1);
      backfill.set(fromK, (backfill.get(fromK)||0)+1);

      const oArr=seatIndex.get(fromK)||[]; seatIndex.set(fromK, oArr.filter(sen=>sen!==r.sen));
      const dArr=seatIndex.get(bk)||[]; let j=0; while(j<dArr.length && dArr[j]<r.sen) j++; dArr.splice(j,0,r.sen); seatIndex.set(bk,dArr);

      awardedBase=p.base; awardedSeat=p.seat; prefNum=i+1; moved=true; upgrade=(r.currentSeat==='FO' && p.seat==='CA');
      note = upgrade ? 'Upgrade' : 'Lateral';
      r.currentBase=p.base; r.currentSeat=p.seat;
      break;
    }
    awards.push({sen:r.sen, name:r.name, from:`${r.currentBase} ${r.currentSeat}`, to:`${awardedBase} ${awardedSeat}`, pref:prefNum, moved, upgrade, note});
  }
  return {awards, backfill};
}

function buildUI(){
  const bases=[...new Set(CAP.map(c=>c.base))].sort();
  const qb=$('qBase'), fb=$('fltBase');
  if(qb) qb.innerHTML = bases.map(b=>`<option>${b}</option>`).join('');
  if(fb) fb.innerHTML = '<option value="">Awarded Base: All</option>' + bases.map(b=>`<option>${b}</option>`).join('');

  const holder=$('capGrid'); if(!holder) return; holder.innerHTML='';
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
    minus.onclick=()=>{ c.delta--; input.value=String(c.delta); if ($('autoRun')?.checked) cascadeAndRender(); };
    plus.onclick=()=>{ c.delta++; input.value=String(c.delta); if ($('autoRun')?.checked) cascadeAndRender(); };
    input.oninput=()=>{ c.delta=asInt(input.value); if ($('autoRun')?.checked) cascadeAndRender(); };
    const seededCell=document.createElement('td'); wrap.appendChild(minus); wrap.appendChild(input); wrap.appendChild(plus); seededCell.appendChild(wrap);

    const backfillCell=document.createElement('td'); const pill=document.createElement('span'); pill.className='pill'; pill.textContent='0'; backfillCell.appendChild(pill);

    row.appendChild(seededCell); row.appendChild(backfillCell); tbody.appendChild(row);
    c._backfillPill=pill;
  });
}

function render(awards, backfill){
  CAP.forEach(c=>{ const k=keyBaseSeat(c.base,c.seat); if (c._backfillPill) c._backfillPill.textContent=String(backfill.get(k)||0); });

  const holder=$('results'); if(!holder){ return; }
  holder.innerHTML='';
  if (!awards.length){ holder.innerHTML='<div class="empty">No awards yet.</div>'; return; }
  const q=$('q')?.value?.trim().toLowerCase()||'', mv=$('fltMove')?.value||'all', fb=$('fltBase')?.value||'', fs=$('fltSeat')?.value||'';
  let rows=awards.slice();
  if (q) rows=rows.filter(r=> String(r.sen).includes(q) || (r.name||'').toLowerCase().includes(q));
  if (mv==='movers') rows=rows.filter(r=>r.moved);
  if (mv==='upgrades') rows=rows.filter(r=>r.upgrade);
  if (fb) rows=rows.filter(r=> (r.to||'').startsWith(fb+' '));
  if (fs) rows=rows.filter(r=> (r.to||'').endsWith(' '+fs));

  const shown=$('shown'), total=$('total'), upCnt=$('upCnt'), mvCnt=$('mvCnt');
  if (shown) shown.textContent=rows.length;
  if (total) total.textContent=awards.length;
  if (upCnt) upCnt.textContent=awards.filter(r=>r.upgrade).length;
  if (mvCnt) mvCnt.textContent=awards.filter(r=>r.moved).length;

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
  const btn=$('btnCSV'); if (btn) btn.disabled = rows.length===0;
}

function cascadeAndRender(){
  try{
    const mode=$('mode')?.value || 'upgrades';
    const {awards, backfill} = runCascade(mode);
    RESULTS=awards;
    render(awards, backfill);
    setStatus(`Loaded & cascaded • ${ROST.length} pilots`, true);
  }catch(e){
    setStatus('Cascade failed', false);
    const r=$('results'); if(r) r.innerHTML = `<div class="empty">Cascade error: ${e.message||e}</div>`;
  }
}

async function init(){
  try{
    const base = new URL('data/', document.baseURI);
    const caps = await fetchJSON([new URL('capacities.json', base), new URL('capacities.json.txt', base)]);
    const rost = await fetchJSON([new URL('roster.json', base)]);
    const prefs= await fetchJSON([new URL('preferences.json', base)]);

    CAP=normalizeCaps(caps);
    ROST=normalizeRoster(rost);
    PREF_DETAILS=normalizePrefs(prefs);

    buildUI();
    cascadeAndRender();
  }catch(e){
    setStatus('Load failed', false);
    const r=$('results'); if(r) r.innerHTML = `<div class="empty">Couldn’t auto-load /data/*.json. ${e.message||e}</div>`;
  }
}

// events
window.addEventListener('DOMContentLoaded', init);

['mode'].forEach(id=> $(id)?.addEventListener('change', cascadeAndRender));
$('qApply')?.addEventListener('click', ()=>{
  const b=$('qBase')?.value, s=$('qSeat')?.value, amt=asInt($('qAmt')?.value)||0;
  CAP.forEach(c=>{ if (c.base===b && c.seat===s) c.delta += amt; });
  buildUI(); if ($('autoRun')?.checked) cascadeAndRender();
});
document.addEventListener('click', (e)=>{
  const btn=e.target.closest?.('button[data-nudge]'); if(!btn) return;
  const n=asInt(btn.getAttribute('data-nudge')); CAP.forEach(c=> c.delta += n);
  buildUI(); if ($('autoRun')?.checked) cascadeAndRender();
});
$('btnReset')?.addEventListener('click', ()=>{
  CAP.forEach(c=> c.delta=0);
  buildUI(); if ($('autoRun')?.checked) cascadeAndRender();
});
['q','fltMove','fltBase','fltSeat'].forEach(id=>{
  const el=$(id); if(!el) return;
  el.addEventListener('input', ()=>render(RESULTS, new Map()));
  el.addEventListener('change', ()=>render(RESULTS, new Map()));
});
$('btnClear')?.addEventListener('click', ()=>{
  if ($('q')) $('q').value='';
  if ($('fltMove')) $('fltMove').value='all';
  if ($('fltBase')) $('fltBase').value='';
  if ($('fltSeat')) $('fltSeat').value='';
  render(RESULTS,new Map());
});

$('btnCSV')?.addEventListener('click', ()=>{
  const headers=['Seniority','Pilot_Name','From','Awarded','Pref_Num','Moved','Upgrade','Note'];
  const esc=s=>`"${String(s??'').replace(/"/g,'""')}"`;
  const csv=[headers.join(',')].concat(RESULTS.map(r=>[r.sen,r.name,r.from,r.to,r.pref,r.moved?'Y':'',r.upgrade?'Y':'',r.note||''].map(esc).join(','))).join('
');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}), url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='awards.csv'; document.body.appendChild(a); a.click(); URL.revokeObjectURL(url); a.remove();
});
