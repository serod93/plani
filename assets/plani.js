(function(){
const MIN=5, KEY='distribucion-taller-v2';
const KINDS={expo:'Expositiva',part:'Participativa',prac:'Práctica',pausa:'Pausa'};
const $=s=>document.querySelector(s);
const p2=n=>String(n).padStart(2,'0');
const hm=t=>p2(Math.floor(t/60))+':'+p2(((t%60)+60)%60);
const parse=v=>{const m=/^(\d{1,2}):(\d{2})/.exec(v||'');return m?(+m[1])*60+(+m[2]):null};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=o=>JSON.parse(JSON.stringify(o));
const sortMods=a=>a.slice().sort((x,y)=>x.start-y.start||x.end-y.end);
const infoOf=m=>({resp:(m.resp||'').trim(),desc:(m.desc||'').trim(),res:(m.res||'').split('\n').map(x=>x.trim()).filter(Boolean)});
const clave=s=>String(s).trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const setRes=(m,arr)=>{m.res=arr.join('\n')};
const hasInfo=m=>{const i=infoOf(m);return !!(i.resp||i.desc||i.res.length)};
const openIds=new Set(), cardOpen=new Set();

function seed(){return {ws:{start:540,end:780},nid:1,unit:'min',title:'',date:'',mods:[]}}

function load(){
  try{
    const o=JSON.parse(localStorage.getItem(KEY)||'null');
    if(o&&o.ws&&Array.isArray(o.mods)&&o.mods.every(m=>KINDS[m.kind]&&Number.isFinite(m.start)&&Number.isFinite(m.end))) return o;
  }catch(e){}
  return seed();
}
function save(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}

let S=load(); S.trans=Array.isArray(S.trans)?S.trans:[];  S.vocab=Array.isArray(S.vocab)?S.vocab:[]; S.mods=sortMods(S.mods); S.unit=S.unit==='h'?'h':'min'; S.nid=S.nid||(Math.max(0,...S.mods.map(m=>m.id))+1); S.title=S.title||''; S.date=S.date||'';
let sel=null, pv=null, ppm=4, undo=[], refocus=null, toastT=0;

/* unidades */
const nf=new Intl.NumberFormat('es-CL',{minimumFractionDigits:2,maximumFractionDigits:2});
const fd=m=>S.unit==='h'?nf.format(m/60)+' h':m+' min';
const fl=m=>S.unit==='h'?m+' min':Math.floor(m/60)+' h '+p2(m%60)+' min';

/* lógica de bordes */
function plan(mods,id,edge,t){
  const c=sortMods(clone(mods)), i=c.findIndex(m=>m.id===id), m=c[i];
  let conflict=null;
  if(edge==='end'){
    t=Math.max(t,m.start+MIN); m.end=t;
    const n=c[i+1];
    if(n&&t>n.start) conflict={side:'end',other:n.id,overlap:t-n.start,canTrim:n.end-t>=MIN,t};
  }else{
    t=Math.min(t,m.end-MIN); m.start=t;
    const p=c[i-1];
    if(p&&t<p.end) conflict={side:'start',other:p.id,overlap:p.end-t,canTrim:t-p.start>=MIN,t};
  }
  return {mods:c,conflict,id};
}
function resolve(base,id,edge,t,how){
  const p=plan(base,id,edge,t), c=p.mods, i=c.findIndex(m=>m.id===id), k=p.conflict;
  if(!k) return c;
  if(how==='trim'){const o=c.find(m=>m.id===k.other); if(k.side==='end')o.start=k.t; else o.end=k.t;}
  else if(k.side==='end'){for(let j=i+1;j<c.length;j++){c[j].start+=k.overlap;c[j].end+=k.overlap}}
  else{for(let j=0;j<i;j++){c[j].start-=k.overlap;c[j].end-=k.overlap}}
  return sortMods(c);
}
function snapState(){return {ws:clone(S.ws),mods:clone(S.mods),nid:S.nid,trans:clone(S.trans)}}
function pushUndo(){undo.push(JSON.stringify(snapState()));if(undo.length>60)undo.shift()}
function mutate(fn,opt){
  pushUndo(); fn(); S.mods=sortMods(S.mods); pv=null; save(); renderAll();
}
function commit(mods){
  if(JSON.stringify(sortMods(mods))===JSON.stringify(S.mods)){pv=null;renderAll();return}
  mutate(()=>{S.mods=mods});
}
function doUndo(){
  const s=undo.pop(); if(!s)return;
  const o=JSON.parse(s); S.ws=o.ws;S.mods=sortMods(o.mods);S.nid=o.nid;S.trans=o.trans||[]; pv=null; save(); renderAll();
}

/* vista */
function computeView(mods){
  let lo=S.ws.start,hi=S.ws.end;
  mods.forEach(m=>{lo=Math.min(lo,m.start);hi=Math.max(hi,m.end)});
  return {start:Math.floor((lo-30)/30)*30,end:Math.ceil((hi+30)/30)*30};
}
function stats(){
  const total=S.ws.end-S.ws.start; let covered=0,excess=0; const by={expo:0,part:0,prac:0,pausa:0};
  S.mods.forEach(m=>{const d=m.end-m.start;by[m.kind]+=d;const c=Math.max(0,Math.min(m.end,S.ws.end)-Math.max(m.start,S.ws.start));covered+=c;excess+=d-c});
  return {total,covered,excess,free:Math.max(0,total-covered),by,assigned:covered+excess};
}
function gaps(){
  const out=[];let cur=S.ws.start;
  for(const m of S.mods){ if(m.start>cur&&cur<S.ws.end) out.push([cur,Math.min(m.start,S.ws.end)]); cur=Math.max(cur,m.end) }
  if(cur<S.ws.end) out.push([cur,S.ws.end]);
  return out.filter(g=>g[1]-g[0]>=MIN);
}

/* render */
function renderTop(){
  $('#ws-start').value=hm(S.ws.start); $('#ws-end').value=hm(S.ws.end);
  const t=S.ws.end-S.ws.start;
  $('#total').innerHTML=`<span class="lbl">Duración del taller</span><b class="num">${fd(t)}</b><span class="num">${fl(t)}</span>`;
  const tm=window.PlaniTema?PlaniTema.get():'auto'; ['auto','claro','oscuro'].forEach(k=>{const b=$('#tema-'+k); if(b)b.setAttribute('aria-pressed',tm===k)});
  $('#u-min').setAttribute('aria-pressed',S.unit==='min'); $('#u-h').setAttribute('aria-pressed',S.unit==='h');
  $('#undo').disabled=!undo.length;
}
function renderSummary(){
  const s=stats(), den=Math.max(1,s.total+s.excess);
  const segs=Object.keys(KINDS).filter(k=>s.by[k]>0).map(k=>`<i style="width:${s.by[k]/den*100}%;background:var(--k-${k})" title="${KINDS[k]}: ${s.by[k]} min"></i>`).join('')
    +(s.free>0?`<i class="free" style="width:${s.free/den*100}%" title="Sin asignar: ${s.free} min"></i>`:'');
  const leg=Object.keys(KINDS).map(k=>`<li><span class="sw" style="background:var(--k-${k})"></span>${KINDS[k]} <b class="num">${fd(s.by[k])}</b></li>`).join('')
    +`<li><span class="sw free"></span>Sin asignar <b class="num">${fd(s.free)}</b></li>`;
  const chip=s.excess>0?`<span class="chip warn">Excede el horario por ${fd(s.excess)}</span>`
    :s.free>0?`<span class="chip">${fd(s.free)} sin asignar</span>`:`<span class="chip ok">Horario completo</span>`;
  const exp=s.by.expo, par=s.by.part+s.by.prac, work=exp+par;
  const mix=work?`Exposición ${fd(exp)} · Trabajo de participantes ${fd(par)} (${Math.round(par/work*100)} % del tiempo de trabajo, sin contar pausas).`:'Aún no hay tiempo de trabajo asignado.';
  $('#summary').innerHTML=`<div class="sum-main"><span class="lbl">Asignado</span><div class="big num">${fd(s.assigned)}</div><div class="sub num">de ${fd(Math.max(0,s.total))} del taller</div>${chip}</div>
    <div><div class="stack">${segs}</div><ul class="legend">${leg}</ul><p class="mix">${mix}</p></div>`;
}

function renderSelInfo(){
  const el=$('#sel-info'); if(!el)return; const m=S.mods.find(x=>x.id===sel);
  el.innerHTML=m?`<span><b>${esc(m.name)}</b> · ${hm(m.start)}–${hm(m.end)} · ${fd(m.end-m.start)}</span><button type="button" class="btn sug-b" data-edit="${m.id}">Editar</button>`:'Toca un módulo para ver su detalle.';
}
function renderLane(){
  const track=$('#track'), wrap=$('#scroll');
  const pl=pv?plan(pv.base,pv.id,pv.edge,pv.t):null;
  const mods=pl?pl.mods:S.mods, conflict=pl&&pl.conflict;
  const view=pv?pv.view:computeView(S.mods);
  const ajuste=wrap.clientWidth/(view.end-view.start);
  if(pv) ppm=pv.ppm; else ppm=Math.max(innerWidth<=720?6:3.4,ajuste);
  const X=t=>(t-view.start)*ppm, W=(view.end-view.start)*ppm;
  track.style.width=W+'px';
  let h='';
  h+=`<div class="lane"></div><div class="ws-fill" style="left:${X(S.ws.start)}px;width:${X(S.ws.end)-X(S.ws.start)}px"></div>`;
  let ticks='';
  for(let t=Math.ceil(view.start/15)*15;t<=view.end;t+=15){
    const hr=t%60===0;
    if(!hr&&ppm<3.8&&t%30)continue;
    ticks+=`<div class="tick${hr?' h':''}" style="left:${X(t)}px">${hr?`<em>${hm(t)}</em>`:''}</div>`;
    if(hr) h+=`<div class="gl" style="left:${X(t)}px"></div>`;
  }
  h+=`<div class="ruler">${ticks}</div>`;
  h+=`<div class="flag s" style="left:${X(S.ws.start)}px"><span>Inicio ${hm(S.ws.start)}</span></div><div class="flag e" style="left:${X(S.ws.end)}px"><span>Término ${hm(S.ws.end)}</span></div>`;
  if(!pv) gaps().forEach(g=>{const gw=X(g[1])-X(g[0]);h+=`<button type="button" class="gap" data-g0="${g[0]}" data-g1="${g[1]}" style="left:${X(g[0])}px;width:${gw}px" aria-label="Agregar módulo de ${g[1]-g[0]} min a las ${hm(g[0])}"><span class="gap-in"><b>+</b>${gw>=90?`<span class="mono">${g[1]-g[0]} min</span>`:''}</span></button>`});
  mods.forEach(m=>{
    const w=(m.end-m.start)*ppm, isD=pv&&pv.id===m.id, hit=conflict&&conflict.other===m.id;
    h+=`<div class="mod k-${m.kind}${sel===m.id?' sel':''}${isD?' drag':''}${isD&&conflict?' conflict':''}${hit?' hit':''}${w<110?' tiny':''}${w<64?' s1':''}${w<48?' s2':''}" data-id="${m.id}" style="left:${X(m.start)}px;width:${w}px" title="${esc(m.name)} · ${hm(m.start)}–${hm(m.end)} · ${m.end-m.start} min">
      <button type="button" class="h hl" data-edge="start" aria-label="Inicio de ${esc(m.name)}: ${hm(m.start)}. Flechas izquierda y derecha para mover"></button>
      <div class="nm">${esc(m.name)}</div><div class="du">${fd(m.end-m.start)}</div><div class="tm">${hm(m.start)}–${hm(m.end)}</div>
      <button type="button" class="h hr" data-edge="end" aria-label="Término de ${esc(m.name)}: ${hm(m.end)}. Flechas izquierda y derecha para mover"></button></div>`;
  });
  if(pv){
    const m=mods.find(x=>x.id===pv.id), t=pv.edge==='end'?m.end:m.start;
    h+=`<div class="bubble${conflict?' warn':''}" style="left:${X(t)}px">${hm(t)} · ${fd(m.end-m.start)}${conflict?' · se superpone '+conflict.overlap+' min':''}</div>`;
  }
  track.innerHTML=h; renderSelInfo();
  if(refocus){const el=track.querySelector(`[data-id="${refocus.id}"] [data-edge="${refocus.edge}"]`);if(el)el.focus();refocus=null}
}

function renderRows(){
  const body=$('#rows');
  if(!S.mods.length){body.innerHTML=`<tr><td colspan="8" class="empty">No hay módulos. Agrega el primero con el botón de arriba o toca un espacio vacío de la línea de tiempo.</td></tr>`;return}
  const inH=S.unit==='h';
  body.innerHTML=S.mods.map((m,i)=>{
    const d=m.end-m.start, op=openIds.has(m.id), ab=cardOpen.has(m.id);
    let h=`<tr data-id="${m.id}" class="k-${m.kind}${sel===m.id?' sel':''}${ab?' abierto':''}">
      <td class="m-sum"><button type="button" class="m-toggle" data-card="${m.id}" aria-expanded="${ab}"><i class="m-k"></i><span class="m-num">${i+1}</span><span class="m-txt"><b class="m-nom">${esc(m.name)}</b><span class="m-meta">${hm(m.start)}–${hm(m.end)} · ${fd(d)}</span></span><span class="m-chev" aria-hidden="true">${ab?'▾':'▸'}</span></button></td>
      <td class="n">${i+1}</td>
      <td class="c-name" data-label="Módulo"><input type="text" id="nm-${m.id}" data-f="name" value="${esc(m.name)}" aria-label="Nombre del módulo ${i+1}"></td>
      <td class="c-tipo" data-label="Tipo"><select id="kd-${m.id}" data-f="kind" class="k-${m.kind}" aria-label="Tipo del módulo ${i+1}">${Object.keys(KINDS).map(k=>`<option value="${k}"${k===m.kind?' selected':''}>${KINDS[k]}</option>`).join('')}</select></td>
      <td class="c-start" data-label="Inicio"><input type="time" step="300" id="st-${m.id}" data-f="start" value="${hm(m.start)}" aria-label="Inicio del módulo ${i+1}"></td>
      <td class="c-end" data-label="Término"><input type="time" step="300" id="en-${m.id}" data-f="end" value="${hm(m.end)}" aria-label="Término del módulo ${i+1}"></td>
      <td class="c-dur" data-label="Duración"><input type="number" id="du-${m.id}" data-f="dur" min="${inH?0.1:MIN}" step="${inH?0.25:5}" value="${inH?+(d/60).toFixed(2):d}" aria-label="Duración del módulo ${i+1}"><span class="u">${inH?'h':'min'}</span></td>
      <td class="c-ficha"><button type="button" class="tg${hasInfo(m)?' has':''}" data-tg="${m.id}" aria-expanded="${op}" aria-controls="dt-${m.id}">${op?'▾':'▸'} Ficha</button></td>
      <td class="c-del"><button type="button" class="del" data-del="${m.id}" aria-label="Eliminar ${esc(m.name)}">×</button></td></tr>`;
    if(op) h+=`<tr class="detail${sel===m.id?' sel':''}" id="dt-${m.id}" data-id="${m.id}"><td colspan="8"><div class="card">
      <div class="field"><label for="ds-${m.id}">Descripción</label><textarea id="ds-${m.id}" data-f="desc" rows="4" placeholder="Qué se hace en este módulo y qué se espera lograr">${esc(m.desc||'')}</textarea></div>
      <div class="field"><label for="rp-${m.id}">Responsable</label><input type="text" id="rp-${m.id}" data-f="resp" value="${esc(m.resp||'')}" placeholder="Quién conduce este módulo"></div>
      <div class="field"><label for="rt-${m.id}">Recursos de este módulo</label>${tagsHTML('m:'+m.id,infoOf(m).res,'Escribe un recurso y presiona Enter','rt-'+m.id,S.trans)}${S.trans.length?`<p class="tag-nota">Ya disponibles en todo el taller: ${esc(S.trans.join(', '))}.</p>`:''}</div></div></td></tr>`;
    return h;
  }).join('');
}
/* ---- recursos como etiquetas ---- */
function vocabulario(){
  const seen=new Set(), out=[], add=r=>{const k=clave(r);if(k&&!seen.has(k)){seen.add(k);out.push(r)}};
  S.trans.forEach(add); S.mods.forEach(m=>infoOf(m).res.forEach(add)); S.vocab.forEach(add); return out;
}
function recordar(r){S.vocab=[r,...S.vocab.filter(x=>clave(x)!==clave(r))].slice(0,150)}
function candidatos(){
  const c={}; S.mods.forEach(m=>infoOf(m).res.forEach(r=>{const k=clave(r);(c[k]=c[k]||{n:r,v:0}).v++}));
  return Object.values(c).filter(x=>x.v>=2).sort((a,b)=>b.v-a.v);
}
function checklist(){
  const out=[], vistos=new Set();
  S.trans.forEach(r=>{const k=clave(r);if(!vistos.has(k)){vistos.add(k);out.push({n:r,t:true,m:[]})}});
  const por={}, orden=[];
  sortMods(S.mods).forEach(m=>infoOf(m).res.forEach(r=>{const k=clave(r);if(vistos.has(k))return;
    if(!por[k]){por[k]={n:r,t:false,m:[]};orden.push(k)} if(!por[k].m.includes(m.name))por[k].m.push(m.name)}));
  return out.concat(orden.map(k=>por[k]));
}
function agregarRecurso(id,texto){
  const n=String(texto).trim(); if(!n)return 'vacio'; const k=clave(n);
  if(S.trans.some(r=>clave(r)===k))return 'trans';
  const m=S.mods.find(x=>x.id===id); if(!m)return 'vacio';
  const cur=infoOf(m).res; if(cur.some(r=>clave(r)===k))return 'dup';
  pushUndo(); setRes(m,[...cur,n]); recordar(n); save(); return 'ok';
}
function agregarTrans(texto){
  const n=String(texto).trim(); if(!n)return 'vacio'; const k=clave(n);
  if(S.trans.some(r=>clave(r)===k))return 'dup';
  pushUndo(); S.trans.push(n); S.mods.forEach(m=>setRes(m,infoOf(m).res.filter(r=>clave(r)!==k))); recordar(n); save(); return 'ok';
}
function quitarRecurso(id,nombre){const m=S.mods.find(x=>x.id===id); if(!m)return; pushUndo(); setRes(m,infoOf(m).res.filter(r=>r!==nombre)); save()}
function quitarTrans(nombre){pushUndo(); S.trans=S.trans.filter(r=>r!==nombre); save()}
function sugHTML(excluidas,q){
  const usadas=new Set(excluidas.map(clave)), qq=clave(q);
  const s=vocabulario().filter(r=>{const k=clave(r);return !usadas.has(k)&&(!qq||k.includes(qq))}).slice(0,8);
  return s.length?`<span class="sug-l">Usados antes:</span>`+s.map(r=>`<button type="button" class="btn sug-b" data-sug="${esc(r)}">${esc(r)}</button>`).join(''):'';
}
function tagsHTML(owner,lista,placeholder,idInput,excluir){
  const chips=lista.map(r=>`<span class="rtag">${esc(r)}<button type="button" class="rtag-x" data-rm="${esc(r)}" aria-label="Quitar ${esc(r)}">×</button></span>`).join('');
  return `<div class="tags" data-owner="${owner}" data-excl="${esc(JSON.stringify(excluir||[]))}"><div class="rtags">${chips}</div>`
    +`<input type="text" class="tag-in" id="${idInput}" placeholder="${placeholder}" autocomplete="off">`
    +`<p class="tag-aviso" role="status"></p><div class="sug">${sugHTML(lista.concat(excluir||[]),'')}</div></div>`;
}
function renderTrans(){
  const cand=candidatos();
  $('#trans').innerHTML=tagsHTML('t',S.trans,'Por ejemplo: proyector, plumones, papelógrafos','rt-t',[])
    +(cand.length?`<div class="cand"><p class="hint">Se repiten en varios módulos. ¿Los hacemos transversales?</p>${cand.map(c=>`<button type="button" class="btn sug-b" data-cand="${esc(c.n)}">${esc(c.n)} · ${c.v} módulos</button>`).join('')}</div>`:'');
}
function renderRes(foco){renderTop();renderRows();renderTrans();if(foco){const i=document.getElementById(foco);if(i)i.focus()}}
function inputDe(t){return t.dataset.owner==='t'?'rt-t':'rt-'+t.dataset.owner.slice(2)}
function avisar(t,r,texto){
  const a=t.querySelector('.tag-aviso'); if(!a)return; const n=String(texto).trim();
  a.textContent=r==='trans'?`«${n}» ya es un recurso de todo el taller.`:`«${n}» ya está en la lista.`;
  clearTimeout(a._t); a._t=setTimeout(()=>{a.textContent=''},3500);
}
function anadir(t,texto){
  const o=t.dataset.owner, r=o==='t'?agregarTrans(texto):agregarRecurso(+o.slice(2),texto);
  if(r==='ok')renderRes(inputDe(t)); else if(r!=='vacio')avisar(t,r,texto);
}
document.addEventListener('keydown',e=>{
  const inp=e.target.closest&&e.target.closest('.tag-in'); if(!inp||e.key!=='Enter')return;
  e.preventDefault(); anadir(inp.closest('.tags'),inp.value);
});
document.addEventListener('input',e=>{
  const inp=e.target.closest&&e.target.closest('.tag-in'); if(!inp)return;
  const t=inp.closest('.tags'), o=t.dataset.owner;
  const lista=o==='t'?S.trans:infoOf(S.mods.find(m=>m.id===+o.slice(2))||{}).res;
  t.querySelector('.sug').innerHTML=sugHTML(lista.concat(JSON.parse(t.dataset.excl||'[]')),inp.value);
});
document.addEventListener('click',e=>{
  const cdt=e.target.closest&&e.target.closest('[data-card]'), ed=e.target.closest&&e.target.closest('[data-edit]');
  if(cdt){const id=+cdt.dataset.card; if(cardOpen.has(id))cardOpen.delete(id); else cardOpen.add(id); sel=id; renderRows(); renderLane(); return}
  if(ed){const id=+ed.dataset.edit; cardOpen.add(id); sel=id; renderRows(); renderLane(); const r=document.querySelector('#rows tr[data-id="'+id+'"]'); if(r)r.scrollIntoView({block:'center',behavior:'smooth'}); return}
  const rm=e.target.closest&&e.target.closest('[data-rm]'), sg=e.target.closest&&e.target.closest('[data-sug]'), cd=e.target.closest&&e.target.closest('[data-cand]');
  if(rm){const t=rm.closest('.tags'),o=t.dataset.owner; if(o==='t')quitarTrans(rm.dataset.rm); else quitarRecurso(+o.slice(2),rm.dataset.rm); renderRes(inputDe(t)); return}
  if(sg){const t=sg.closest('.tags'); anadir(t,sg.dataset.sug); return}
  if(cd){agregarTrans(cd.dataset.cand); renderRes(); return}
});
function renderAll(){renderTop();renderSummary();renderLane();renderRows();renderTrans()}

/* diálogo de conflicto */
function openDialog(){
  const p=plan(pv.base,pv.id,pv.edge,pv.t), k=p.conflict; if(!k){cancel();return}
  const me=p.mods.find(m=>m.id===pv.id), ot=p.mods.find(m=>m.id===k.other), i=p.mods.findIndex(m=>m.id===pv.id);
  const otLen=ot.end-ot.start, nm=`<b>${esc(me.name)}</b>`, on=`<b>${esc(ot.name)}</b>`;
  let intro, trimT, trimD, shiftD;
  if(k.side==='end'){
    intro=`Si ${nm} termina a las <b class="mono">${hm(k.t)}</b>, se superpone <b>${k.overlap} min</b> con ${on}, que parte a las ${hm(ot.start)}.`;
    const newLen=otLen-k.overlap;
    trimD=k.canTrim?`${esc(ot.name)} pasa de ${fd(otLen)} a ${fd(newLen)} y parte a las ${hm(k.t)}. El resto del cronograma no se mueve.`:`No alcanza: ${esc(ot.name)} quedaría con menos de ${MIN} min.`;
    const rest=p.mods.slice(i+1), last=Math.max(...rest.map(m=>m.end))+k.overlap;
    shiftD=`Todo lo que sigue se corre ${fd(k.overlap)} hacia más tarde y cada duración se mantiene. El último módulo terminaría a las ${hm(last)}${last>S.ws.end?`, ${fd(last-S.ws.end)} después del término fijado`:''}.`;
    trimT=`Recortar ${ot.name}`;
  }else{
    intro=`Si ${nm} empieza a las <b class="mono">${hm(k.t)}</b>, se superpone <b>${k.overlap} min</b> con ${on}, que termina a las ${hm(ot.end)}.`;
    const newLen=otLen-k.overlap;
    trimD=k.canTrim?`${esc(ot.name)} pasa de ${fd(otLen)} a ${fd(newLen)} y termina a las ${hm(k.t)}. El resto del cronograma no se mueve.`:`No alcanza: ${esc(ot.name)} quedaría con menos de ${MIN} min.`;
    const rest=p.mods.slice(0,i), first=Math.min(...rest.map(m=>m.start))-k.overlap;
    shiftD=`Todo lo anterior se corre ${fd(k.overlap)} hacia más temprano y cada duración se mantiene. El primer módulo empezaría a las ${hm(first)}${first<S.ws.start?`, ${fd(S.ws.start-first)} antes del inicio fijado`:''}.`;
    trimT=`Recortar ${ot.name}`;
  }
  const d=$('#dlg');
  d.innerHTML=`<div class="box"><h3 id="dlg-t">Este cambio choca con otro módulo</h3><p>${intro}</p>
    <div class="opts">
      <button type="button" class="opt" data-how="trim"${k.canTrim?'':' disabled'}><b>${esc(trimT)}</b><span>${trimD}</span></button>
      <button type="button" class="opt" data-how="shift"><b>Desplazar el cronograma</b><span>${shiftD}</span></button>
    </div>
    <button type="button" class="btn cancel" data-how="cancel">Cancelar</button></div>`;
  d.hidden=false; pv.drag=false; renderLane();
  const first=d.querySelector('.opt:not(:disabled)'); if(first)first.focus();
}
function closeDialog(){const d=$('#dlg');d.hidden=true;d.innerHTML=''}
function cancel(){pv=null;closeDialog();renderAll()}
$('#dlg').addEventListener('click',e=>{
  const pr=e.target.closest('[data-preset]'); if(pr){applyPreset(pr.dataset.preset);return}
  const b=e.target.closest('[data-how]');
  if(!b){ if(e.target.id==='dlg')cancel(); return }
  const how=b.dataset.how; if(how==='cancel'){cancel();return}
  if(how==='pdf'){const o=readExportOpts();S.pdf=o;save();closeDialog();exportPdf(o);return}
  if(!pv)return;
  const mods=resolve(pv.base,pv.id,pv.edge,pv.t,how); closeDialog(); commit(mods);
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#dlg').hidden)cancel()});

/* solicitar cambio de borde (tabla, teclado) */
function requestEdge(id,edge,t){
  const m=S.mods.find(x=>x.id===id); if(!m)return;
  t=Math.max(0,Math.min(1440,Math.round(t)));
  const p=plan(S.mods,id,edge,t);
  if(!p.conflict){commit(p.mods);return}
  const view=computeView(S.mods); view.end+=60;
  pv={id,edge,base:clone(S.mods),t,view,ppm};
  sel=id; openDialog();
}

/* arrastre */
const track=$('#track');
track.addEventListener('pointerdown',e=>{
  const h=e.target.closest('.h'); if(!h||pv)return;
  e.preventDefault();
  const id=+h.closest('.mod').dataset.id, edge=h.dataset.edge, m=S.mods.find(x=>x.id===id);
  const view=computeView(S.mods); view.end+=60;
  pv={id,edge,base:clone(S.mods),t:edge==='end'?m.end:m.start,view,ppm,drag:true,moved:false,pid:e.pointerId};
  sel=id; try{track.setPointerCapture(e.pointerId)}catch(_){}
  renderLane(); renderRows();
});
track.addEventListener('pointermove',e=>{
  if(!pv||!pv.drag||e.pointerId!==pv.pid)return;
  const r=track.getBoundingClientRect();
  let t=pv.view.start+(e.clientX-r.left)/pv.ppm; t=Math.round(t/5)*5; t=Math.max(pv.view.start,Math.min(pv.view.end,t));
  if(t!==pv.t){pv.t=t;pv.moved=true;renderLane()}
});
function endDrag(e,ok){
  if(!pv||!pv.drag||e.pointerId!==pv.pid)return;
  try{track.releasePointerCapture(e.pointerId)}catch(_){}
  if(!ok||!pv.moved){pv=null;renderLane();return}
  const p=plan(pv.base,pv.id,pv.edge,pv.t);
  if(p.conflict){openDialog()}else commit(p.mods);
}
track.addEventListener('pointerup',e=>endDrag(e,true));
track.addEventListener('pointercancel',e=>endDrag(e,false));
track.addEventListener('keydown',e=>{
  const h=e.target.closest('.h'); if(!h||pv)return;
  if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;
  e.preventDefault();
  const id=+h.closest('.mod').dataset.id, edge=h.dataset.edge, m=S.mods.find(x=>x.id===id);
  refocus={id,edge};
  requestEdge(id,edge,(edge==='end'?m.end:m.start)+(e.key==='ArrowRight'?MIN:-MIN));
});
track.addEventListener('click',e=>{
  const g=e.target.closest('.gap');
  if(g){addMod(+g.dataset.g0,+g.dataset.g1);return}
  const mo=e.target.closest('.mod'); if(mo&&!e.target.closest('.h')){sel=+mo.dataset.id;renderLane();renderRows()}
});

/* tabla */
const rows=$('#rows');
rows.addEventListener('focusin',e=>{
  const tr=e.target.closest('tr[data-id]'); if(!tr)return; const id=+tr.dataset.id;
  if(sel!==id){sel=id;rows.querySelectorAll('tr').forEach(r=>r.classList.toggle('sel',+r.dataset.id===id));renderLane()}
});
rows.addEventListener('input',e=>{
  const el=e.target,f=el.dataset.f; if(!f)return;
  const id=+el.closest('tr').dataset.id, m=S.mods.find(x=>x.id===id); if(!m)return;
  if(f==='name'){m.name=el.value;const sm=el.closest('tr').querySelector('.m-nom');if(sm)sm.textContent=el.value;renderLane();return}
  if(f==='desc'||f==='resp'){m[f]=el.value;save();const b=rows.querySelector(`[data-tg="${id}"]`);if(b)b.classList.toggle('has',hasInfo(m))}
});
rows.addEventListener('change',e=>{
  const el=e.target,f=el.dataset.f; if(!f)return;
  const id=+el.closest('tr').dataset.id, m=S.mods.find(x=>x.id===id); if(!m)return;
  if(f==='desc'||f==='resp'){save();return}
  if(f==='name'){m.name=el.value.trim()||'Sin nombre';save();renderAll();return}
  if(f==='kind'){mutate(()=>{m.kind=el.value});return}
  if(f==='start'||f==='end'){const t=parse(el.value); if(t==null){renderRows();return} requestEdge(id,f,t);renderRows();return}
  if(f==='dur'){
    let v=parseFloat(String(el.value).replace(',','.')); if(!(v>0)){renderRows();return}
    const d=Math.max(MIN,Math.round(S.unit==='h'?v*60:v)); requestEdge(id,'end',m.start+d);renderRows();return
  }
});
rows.addEventListener('click',e=>{
  const tg=e.target.closest('[data-tg]');
  if(tg){const id=+tg.dataset.tg; if(openIds.has(id))openIds.delete(id); else openIds.add(id); renderRows();
    const el=openIds.has(id)?$('#ds-'+id):rows.querySelector(`[data-tg="${id}"]`); if(el)el.focus(); return}
  const b=e.target.closest('[data-del]'); if(!b)return;
  const id=+b.dataset.del, m=S.mods.find(x=>x.id===id); if(!m)return;
  mutate(()=>{S.mods=S.mods.filter(x=>x.id!==id)});
  if(sel===id)sel=null; renderAll();
  toast(`Módulo eliminado: ${m.name}`,'Deshacer',doUndo);
});

/* acciones */
function addMod(a,b){
  const len=a!=null?b-a:15; let st=a;
  if(st==null){
    const g=gaps().find(g=>g[1]-g[0]>=15);
    st=g?g[0]:Math.max(S.ws.start,...S.mods.map(m=>m.end),S.ws.start);
  }
  const id=S.nid;
  mutate(()=>{S.nid++;S.mods.push({id,name:'Nuevo módulo',kind:'part',desc:'',resp:'',res:'',start:st,end:st+(a!=null?len:15)})});
  sel=id; cardOpen.add(id); renderAll();
  const inp=$('#nm-'+id); if(inp){inp.focus();inp.select()}
}
$('#add').addEventListener('click',()=>addMod());
$('#undo').addEventListener('click',doUndo);
$('#reset').addEventListener('click',()=>{if(!S.mods.length)return;mutate(()=>{S.mods=[]});sel=null;renderAll();toast('Se vaciaron los módulos','Deshacer',doUndo)});
$('#u-min').addEventListener('click',()=>{S.unit='min';save();renderAll()});
$('#u-h').addEventListener('click',()=>{S.unit='h';save();renderAll()});
document.querySelectorAll('[data-tema]').forEach(b=>b.addEventListener('click',()=>{if(window.PlaniTema)PlaniTema.set(b.dataset.tema);renderTop()}));
function wsChange(){
  const a=parse($('#ws-start').value), b=parse($('#ws-end').value);
  if(a==null||b==null||b<=a){toast('El término debe ser posterior al inicio');renderTop();return}
  mutate(()=>{S.ws={start:a,end:b}});
}
$('#ws-start').addEventListener('change',wsChange);$('#ws-end').addEventListener('change',wsChange);

function fmtDate(iso){const d=new Date(iso+'T12:00:00');return isNaN(d)?iso:d.toLocaleDateString('es-CL',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}
function scheduleText(){
  const s=stats(), head=(S.title.trim()||'Distribución del taller')+(S.date?' · '+fmtDate(S.date):'');
  return `${head}\nHorario: ${hm(S.ws.start)} a ${hm(S.ws.end)} (${s.total} min)`+(S.trans.length?`\nRecursos de todo el taller: ${S.trans.join('; ')}`:'')+`\n\n`
    +S.mods.map(m=>{let t=`${hm(m.start)}–${hm(m.end)} · ${m.name} · ${m.end-m.start} min · ${KINDS[m.kind]}`; const i=infoOf(m);
      if(i.resp)t+=`\n    Responsable: ${i.resp}`; if(i.desc)t+=`\n    Descripción: ${i.desc.replace(/\s*\n\s*/g,' ')}`; if(i.res.length)t+=`\n    Recursos: ${i.res.join('; ')}`; return t}).join('\n')
    +`\n\nAsignado: ${s.assigned} min · Sin asignar: ${s.free} min`+(s.excess?` · Fuera del horario: ${s.excess} min`:'');
}
$('#copy').addEventListener('click',async()=>{
  const txt=scheduleText();
  try{await navigator.clipboard.writeText(txt);toast('Cronograma copiado')}
  catch(e){
    const d=$('#dlg'); pv=null;
    d.innerHTML=`<div class="box"><h3 id="dlg-t">Copia el cronograma</h3><p>Tu navegador no permitió copiar automáticamente. Selecciona el texto y cópialo.</p><textarea class="copybox" readonly id="cp">${esc(txt)}</textarea><button type="button" class="btn cancel" data-how="cancel">Cerrar</button></div>`;
    d.hidden=false; const ta=$('#cp'); ta.focus(); ta.select();
  }
});

/* exportación */
let DL=null;
const MIMES={pdf:'application/pdf',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',json:'application/json',plani:'application/json'};
/* Fuera de claude.ai no existe la capacidad de descargas: se baja el archivo con el navegador. */
function descargaNavegador(){
  return {nativo:true,async save({filename,data}){
    const ext=filename.split('.').pop().toLowerCase();
    const url=URL.createObjectURL(new Blob([data],{type:MIMES[ext]||'application/octet-stream'}));
    const a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),4000);
    return {status:'saved'};
  }};
}
(async()=>{try{DL=await (window.claude&&window.claude.use?window.claude.use('downloads'):null)}catch(e){DL=null}
  if(!DL)DL=descargaNavegador();
  ['#x-pdf','#x-xls','#x-plani'].forEach(q=>{$(q).hidden=false})})();
const KRGB={expo:[163,182,255],part:[255,138,61],prac:[198,242,61],pausa:[216,205,189]};
const fhm=m=>Math.floor(m/60)+' h '+p2(m%60)+' min';
function fileBase(){
  const t=(S.title.trim()||'cronograma').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'cronograma';
  return t+(S.date?'-'+S.date:'');
}
async function saveFile(name,data){
  try{await DL.save({filename:name,data});toast('Archivo guardado: '+name)}
  catch(e){if(e&&e.code==='declined')return;toast('No se pudo guardar el archivo')}
}
function exportXls(){
  if(!window.XLSX){toast('No se cargó el generador de Excel');return}
  const s=stats(), title=S.title.trim()||'Distribución del taller';
  const xc=[['Responsable','resp'],['Descripción','desc'],['Recursos','res']].filter(c=>S.mods.some(m=>(m[c[1]]||'').trim()));
  const aoa=[[title],[S.date?fmtDate(S.date):''],['Horario',hm(S.ws.start)+' a '+hm(S.ws.end),'Duración del taller (min)',s.total],...(S.trans.length?[['Recursos de todo el taller',S.trans.join('; ')]]:[]),[],
    ['N°','Inicio','Término','Duración (min)','Duración (h)','Módulo','Tipo',...xc.map(c=>c[0])]];
  S.mods.forEach((m,i)=>{const d=m.end-m.start;aoa.push([i+1,hm(m.start),hm(m.end),d,+(d/60).toFixed(2),m.name,KINDS[m.kind],...xc.map(c=>c[1]==='res'?infoOf(m).res.join('; '):(m[c[1]]||'').trim())])});
  aoa.push([],['','','Total asignado',s.assigned,+(s.assigned/60).toFixed(2)],['','','Sin asignar',s.free,+(s.free/60).toFixed(2)]);
  if(s.excess)aoa.push(['','','Fuera del horario',s.excess,+(s.excess/60).toFixed(2)]);
  const w1=XLSX.utils.aoa_to_sheet(aoa); w1['!cols']=[{wch:6},{wch:9},{wch:24},{wch:15},{wch:13},{wch:62},{wch:15},...xc.map(c=>({wch:c[1]==='resp'?22:50}))];
  const res=[['Tipo','Minutos','Horas','% del asignado']];
  Object.keys(KINDS).forEach(k=>res.push([KINDS[k],s.by[k],+(s.by[k]/60).toFixed(2),s.assigned?+(s.by[k]/s.assigned*100).toFixed(1):0]));
  const w2=XLSX.utils.aoa_to_sheet(res); w2['!cols']=[{wch:16},{wch:10},{wch:10},{wch:16}];
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,w1,'Cronograma'); XLSX.utils.book_append_sheet(wb,w2,'Resumen por tipo');
  const cl=checklist();
  if(cl.length){const rr=[['Recurso','Alcance','Usado en','Listo'],...cl.map(i=>[i.n,i.t?'Todo el taller':'Módulos',i.m.join('; '),''])];
    const w3=XLSX.utils.aoa_to_sheet(rr); w3['!cols']=[{wch:32},{wch:16},{wch:60},{wch:8}]; XLSX.utils.book_append_sheet(wb,w3,'Recursos')}
  saveFile(fileBase()+'.xlsx',XLSX.write(wb,{bookType:'xlsx',type:'array'}));
}
const PDF_DEF={tl:true,type:true,dur:true,desc:true,resp:true,res:true,tot:true,chk:true};
function pdfDetails(doc,m,o,w){
  const i=infoOf(m), out=[]; doc.setFontSize(8.5);
  if(o.resp&&i.resp){doc.setFont('helvetica','bold');const lw=doc.getTextWidth('Responsable: ');doc.setFont('helvetica','normal');
    const lines=doc.splitTextToSize(i.resp,w-lw-2);out.push({inline:true,label:'Responsable',lw,lines,h:lines.length*3.9+0.8})}
  if(o.desc&&i.desc){doc.setFont('helvetica','normal');const lines=doc.splitTextToSize(i.desc,w);out.push({label:'Descripción',lines,h:3.9+lines.length*3.9+0.8})}
  if(o.res&&i.res.length){doc.setFont('helvetica','normal');const lines=i.res.flatMap(r=>doc.splitTextToSize('- '+r,w).map((l,k)=>k?'  '+l:l));out.push({label:'Recursos',lines,h:3.9+lines.length*3.9+0.8})}
  return out;
}
/* Hoja aparte e independiente: se ajusta en columnas para que quepa en una sola página. */
function paginaChecklist(doc,title,W,H,M){
  const items=checklist(); if(!items.length)return;
  doc.addPage();
  doc.setFont('helvetica','bold');doc.setFontSize(20);doc.setTextColor(20,18,16);doc.text('Checklist de recursos',M,M+6);
  doc.setFont('helvetica','normal');doc.setFontSize(10.5);doc.setTextColor(95,87,78);
  doc.text([title,S.date?fmtDate(S.date):null].filter(Boolean).join('   ·   '),M,M+13);
  doc.setFontSize(9.5);doc.text('Marca cada recurso cuando ya lo tengas listo.',M,M+19);
  const top=M+27, disp=H-M-12-top, gap=8;
  const grupos=[['Todo el taller',items.filter(i=>i.t)],['Por módulo',items.filter(i=>!i.t)]].filter(g=>g[1].length);
  const configs=[{cols:2,fs:11.5,box:5},{cols:3,fs:10.5,box:4.6},{cols:4,fs:9.5,box:4.2}];
  const medir=cfg=>{
    const colW=(W-2*M-(cfg.cols-1)*gap)/cfg.cols, tx=cfg.box+3, out=[];
    grupos.forEach(([nombre,lista])=>{
      out.push({g:nombre,h:9});
      lista.forEach(it=>{
        doc.setFont('helvetica','normal');doc.setFontSize(cfg.fs);
        const nl=doc.splitTextToSize(it.n,colW-tx); let ul=[];
        if(it.m.length){doc.setFontSize(cfg.fs-2.5);ul=doc.splitTextToSize('Usado en: '+it.m.join(', '),colW-tx)}
        out.push({it,nl,ul,h:nl.length*cfg.fs*0.42+ul.length*(cfg.fs-2.5)*0.4+(ul.length?1.4:0)+4.5});
      });
    });
    return {out,colW,tx};
  };
  const colocar=(cfg,m,paginar)=>{
    let col=0,yy=0,pg=0; const pl=[];
    for(const e of m.out){
      const lim=pg>0?H-M-12-(M+14):disp;
      if(yy+e.h>lim){col++;yy=0}
      if(col>=cfg.cols){ if(!paginar)return null; pg++;col=0;yy=0 }
      pl.push({e,col,yy,pg}); yy+=e.h;
    }
    return pl;
  };
  let cfg=configs[configs.length-1], m=null, pl=null;
  for(const c of configs){const mm=medir(c),p=colocar(c,mm,false);if(p){cfg=c;m=mm;pl=p;break}}
  if(!pl){m=medir(cfg);pl=colocar(cfg,m,true)}
  let pgActual=0;
  pl.forEach(p=>{
    if(p.pg>pgActual){doc.addPage();pgActual=p.pg;doc.setFont('helvetica','bold');doc.setFontSize(14);doc.setTextColor(20,18,16);doc.text('Checklist de recursos (continuación)',M,M+6)}
    const x=M+p.col*(m.colW+gap), y0=(p.pg>0?M+14:top)+p.yy;
    if(p.e.g){doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(95,87,78);doc.text(p.e.g.toUpperCase(),x,y0+5);return}
    doc.setDrawColor(20,18,16);doc.setLineWidth(.4);doc.rect(x,y0+0.6,cfg.box,cfg.box);
    doc.setFont('helvetica','normal');doc.setFontSize(cfg.fs);doc.setTextColor(20,18,16);doc.text(p.e.nl,x+m.tx,y0+cfg.box*0.85);
    if(p.e.ul.length){doc.setFontSize(cfg.fs-2.5);doc.setTextColor(95,87,78);doc.text(p.e.ul,x+m.tx,y0+cfg.box*0.85+p.e.nl.length*cfg.fs*0.42+0.4)}
  });
}
function exportPdf(o){
  const J=window.jspdf&&window.jspdf.jsPDF; if(!J){toast('No se cargó el generador de PDF');return}
  const doc=new J({orientation:'landscape',unit:'mm',format:'a4'}), W=297,H=210,M=14, s=stats();
  const title=S.title.trim()||'Distribución del taller';
  doc.setFont('helvetica','bold');doc.setFontSize(20);doc.setTextColor(19,35,46);
  const tl=doc.splitTextToSize(title,W-2*M).slice(0,2); doc.text(tl,M,M+6);
  let y=M+6+(tl.length-1)*8+7;
  doc.setFont('helvetica','normal');doc.setFontSize(10.5);doc.setTextColor(86,104,116);
  doc.text([S.date?fmtDate(S.date):null,`${hm(S.ws.start)} a ${hm(S.ws.end)}`,`${fhm(s.total)} (${s.total} min)`].filter(Boolean).join('   ·   '),M,y);
  y+=8;
  if(o.res&&S.trans.length){doc.setFont('helvetica','normal');doc.setFontSize(9.5);doc.setTextColor(40,55,66);
    const tr=doc.splitTextToSize('Recursos de todo el taller: '+S.trans.join(', '),W-2*M);doc.text(tr,M,y-1);y+=tr.length*4.2+4}
  if(o.tl){
    const lo=Math.floor(Math.min(S.ws.start,...S.mods.map(m=>m.start))/60)*60, hi=Math.ceil(Math.max(S.ws.end,...S.mods.map(m=>m.end))/60)*60;
    const sc=(W-2*M)/(hi-lo), X=t=>M+(t-lo)*sc, bh=24;
    doc.setFillColor(233,238,242); doc.rect(X(S.ws.start),y,(S.ws.end-S.ws.start)*sc,bh,'F');
    doc.setLineWidth(.4);
    S.mods.forEach(m=>{
      const x=X(m.start), w=(m.end-m.start)*sc, d=m.end-m.start;
      doc.setFillColor(...KRGB[m.kind]); doc.setDrawColor(255,255,255); doc.rect(x,y,w,bh,'FD');
      if(w>=9){
        doc.setTextColor(20,18,16); doc.setFont('helvetica','bold'); doc.setFontSize(6.5);
        doc.text(doc.splitTextToSize(m.name,w-2.4).slice(0,6),x+1.2,y+3.4);
        if(o.dur){doc.setFont('helvetica','normal'); doc.text(w>=14?d+' min':String(d),x+1.2,y+bh-1.6)}
      }
    });
    doc.setDrawColor(150,165,175); doc.setLineWidth(.2); doc.setFontSize(7); doc.setTextColor(86,104,116);
    for(let t=lo;t<=hi;t+=60){doc.line(X(t),y+bh,X(t),y+bh+2);doc.text(hm(t),X(t),y+bh+5.5,{align:t===lo?'left':t===hi?'right':'center'})}
    y+=bh+13;
  }else y+=4;
  const wM=(W-2*M)-34-(o.type?35:0)-(o.dur?50:0), wt=wM-6;
  const cx=[M,M+34,M+34+wM,M+34+wM+(o.type?35:0)], typeX=cx[2], durX=o.type?cx[3]:cx[2];
  const head=()=>{doc.setFillColor(233,238,242);doc.rect(M,y,W-2*M,7,'F');doc.setFont('helvetica','bold');doc.setFontSize(8.5);doc.setTextColor(86,104,116);
    doc.text('HORARIO',cx[0]+2,y+4.8);doc.text('MÓDULO',cx[1]+2,y+4.8);
    if(o.type)doc.text('TIPO',typeX+2,y+4.8); if(o.dur)doc.text('DURACIÓN',durX+2,y+4.8); y+=7};
  head();
  doc.setFontSize(9.5);
  if(!S.mods.length){doc.setFont('helvetica','normal');doc.setTextColor(86,104,116);doc.text('Sin módulos.',cx[0]+2,y+5);y+=8}
  S.mods.forEach(m=>{
    const d=m.end-m.start; doc.setFont('helvetica','normal'); doc.setFontSize(9.5);
    const lines=doc.splitTextToSize(m.name,wt), mainH=lines.length*4.4+3.4;
    const blocks=pdfDetails(doc,m,o,wt), dH=blocks.reduce((a,b)=>a+b.h,0), rh=mainH+(dH?dH+1.6:0);
    if(y+rh>H-M-18){doc.addPage();y=M;head();}
    doc.setFont('helvetica','normal'); doc.setFontSize(9.5); doc.setTextColor(19,35,46);
    doc.text(hm(m.start)+' - '+hm(m.end),cx[0]+2,y+5);
    doc.text(lines,cx[1]+2,y+5);
    if(o.type){doc.setFillColor(...KRGB[m.kind]); doc.rect(typeX+2,y+2.2,3.2,3.2,'F'); doc.text(KINDS[m.kind],typeX+7,y+5)}
    if(o.dur)doc.text(d+' min ('+nf.format(d/60)+' h)',durX+2,y+5);
    let dy=y+mainH-1.2; doc.setFontSize(8.5);
    blocks.forEach(b=>{
      doc.setFont('helvetica','bold'); doc.setTextColor(86,104,116);
      if(b.inline){
        doc.text(b.label+':',cx[1]+2,dy+3);
        doc.setFont('helvetica','normal'); doc.setTextColor(40,55,66); doc.text(b.lines,cx[1]+2+b.lw,dy+3);
      }else{
        doc.text(b.label,cx[1]+2,dy+3);
        doc.setFont('helvetica','normal'); doc.setTextColor(40,55,66); doc.text(b.lines,cx[1]+2,dy+3+3.9);
      }
      dy+=b.h;
    });
    doc.setDrawColor(211,220,227);doc.setLineWidth(.2);doc.line(M,y+rh,W-M,y+rh); y+=rh;
  });
  if(o.tot){
    if(y>H-M-24){doc.addPage();y=M}
    y+=7; doc.setFont('helvetica','bold');doc.setFontSize(9.5);doc.setTextColor(19,35,46);
    doc.text(`Asignado: ${s.assigned} min (${nf.format(s.assigned/60)} h)   ·   Sin asignar: ${s.free} min`+(s.excess?`   ·   Fuera del horario: ${s.excess} min`:''),M,y);
    y+=6; doc.setFont('helvetica','normal');doc.setFontSize(9);
    let x=M;
    Object.keys(KINDS).forEach(k=>{
      const txt=`${KINDS[k]} ${s.by[k]} min`; doc.setFillColor(...KRGB[k]); doc.rect(x,y-2.8,3,3,'F'); doc.setTextColor(19,35,46); doc.text(txt,x+4.5,y); x+=doc.getTextWidth(txt)+14;
    });
  }
  if(o.chk)paginaChecklist(doc,title,W,H,M);
  const n=doc.getNumberOfPages();
  for(let i=1;i<=n;i++){doc.setPage(i);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(120,135,145);doc.text(title,M,H-7);doc.text(i+' / '+n,W-M,H-7,{align:'right'})}
  saveFile(fileBase()+'.pdf',doc.output('arraybuffer'));
}
const PDF_ROWS=[
  ['grp','Estructura'],
  ['tl','Línea de tiempo','Franja de colores con todos los módulos'],
  ['type','Tipo de módulo','Expositiva, participativa, práctica o pausa'],
  ['dur','Duración','En minutos y en horas'],
  ['grp','Ficha de cada módulo'],
  ['desc','Descripción','Qué se hace y qué se espera lograr'],
  ['resp','Responsable','Quién conduce el módulo'],
  ['res','Recursos','Los de cada módulo y los de todo el taller'],
  ['grp','Cierre'],
  ['tot','Resumen','Minutos asignados, sin asignar y por tipo'],
  ['chk','Checklist de recursos','Hoja aparte con todos los recursos para ir marcando lo que ya tienes']];
function openExport(){
  const has={desc:S.mods.some(m=>infoOf(m).desc),resp:S.mods.some(m=>infoOf(m).resp),res:checklist().length>0,chk:checklist().length>0};
  const o=Object.assign({},PDF_DEF,S.pdf||{});
  const cks=PDF_ROWS.map(r=>{
    if(r[0]==='grp')return `<div class="grp-l">${r[1]}</div>`;
    const ok=has[r[0]]!==false;
    return `<label class="ck${ok?'':' off'}"><input type="checkbox" data-ok="${r[0]}"${o[r[0]]&&ok?' checked':''}${ok?'':' disabled'}><span><b>${r[1]}</b><em>${ok?r[2]:'Ningún módulo tiene este dato'}</em></span></label>`;
  }).join('');
  const d=$('#dlg'); pv=null;
  d.innerHTML=`<div class="box"><h3 id="dlg-t">Exportar PDF</h3><p>Elige qué componentes incluir. El nombre, la fecha, el horario y el nombre de cada módulo siempre van. Los campos vacíos no se imprimen.</p>
    <div class="presets"><button type="button" class="btn" data-preset="full">Guion de facilitación</button><button type="button" class="btn" data-preset="client">Versión para cliente</button></div>
    <div class="cks">${cks}</div>
    <div class="btns"><button type="button" class="btn" data-how="cancel">Cancelar</button><button type="button" class="btn primary" data-how="pdf">Exportar PDF</button></div></div>`;
  d.hidden=false; d.querySelector('[data-how="pdf"]').focus();
}
function readExportOpts(){
  const o=Object.assign({},PDF_DEF,S.pdf||{});
  document.querySelectorAll('#dlg [data-ok]').forEach(c=>{if(!c.disabled)o[c.dataset.ok]=c.checked});
  return o;
}
function applyPreset(k){
  const on=k==='full'?['tl','type','dur','desc','resp','res','tot','chk']:['tl','type','dur'];
  document.querySelectorAll('#dlg [data-ok]').forEach(c=>{if(!c.disabled)c.checked=on.includes(c.dataset.ok)});
}
$('#x-pdf').addEventListener('click',openExport);
$('#x-xls').addEventListener('click',exportXls);
function exportPlani(){
  const tipo={expo:'expositiva',part:'participativa',prac:'practica',pausa:'pausa'};
  const doc={formato:'plani',version:1,creadoCon:'Artefacto web',exportado:new Date().toISOString(),
    taller:{titulo:S.title.trim(),fecha:S.date||null,inicio:S.ws.start,termino:S.ws.end,...(S.trans.length?{recursosTransversales:S.trans}:{}),
      modulos:sortMods(S.mods).map(m=>{const i=infoOf(m);const o={nombre:m.name,tipo:tipo[m.kind]||'participativa',inicio:m.start,fin:m.end};
        if(i.desc)o.descripcion=i.desc;if(i.resp)o.responsable=i.resp;if(i.res.length)o.recursos=i.res;return o})}};
  saveFile(fileBase()+(DL&&DL.nativo?'.plani':'.plani.json'),JSON.stringify(doc,null,2));
}
$('#x-plani').addEventListener('click',exportPlani);
function importarPlani(texto){
  let d; try{d=JSON.parse(texto)}catch(e){toast('El archivo no se pudo leer.');return}
  if(!d||d.formato!=='plani'||!d.taller){toast('El archivo no es un taller de Plani.');return}
  if((d.version||1)>1){toast('El archivo es de una versión más nueva del formato.');return}
  const t=d.taller;
  if(!(t.inicio>=0&&t.termino<=1440&&t.termino>t.inicio)){toast('El horario del archivo no es válido.');return}
  const kinds={expositiva:'expo',participativa:'part',practica:'prac','práctica':'prac',pausa:'pausa'};
  const trans=(t.recursosTransversales||[]).map(x=>String(x).trim()).filter(Boolean);
  let id=1,omit=0; const mods=[];
  (t.modulos||[]).forEach(m=>{
    if(!(m.fin>m.inicio&&m.inicio>=0&&m.fin<=2880)){omit++;return}
    const kind=kinds[String(m.tipo||'').toLowerCase()]||'part';
    const vistos=new Set(), res=[...(m.recursos||[])].map(x=>String(x).trim())
      .filter(r=>{const k=r.toLowerCase();if(!r||vistos.has(k))return false;vistos.add(k);return true});
    mods.push({id:id++,name:String(m.nombre||'Módulo'),kind,start:m.inicio,end:m.fin,desc:m.descripcion||'',resp:m.responsable||'',res:res.join('\n')});
  });
  const tv=new Set(), tr=trans.filter(r=>{const k=clave(r);if(tv.has(k))return false;tv.add(k);return true});
  mods.forEach(m=>setRes(m,infoOf(m).res.filter(r=>!tv.has(clave(r)))));
  pushUndo(); S.ws={start:t.inicio,end:t.termino}; S.mods=sortMods(mods); S.nid=id; S.trans=tr; [...tr,...mods.flatMap(m=>infoOf(m).res)].forEach(recordar);
  S.title=String(t.titulo||''); S.date=/^\d{4}-\d{2}-\d{2}$/.test(t.fecha||'')?t.fecha:'';
  sel=null; pv=null; save(); ti.value=S.title; dt.value=S.date; renderAll();
  toast('Taller importado'+(omit?` (${omit} módulo(s) omitidos por horas inválidas)`:''),'Deshacer',doUndo);
}
$('#x-imp').addEventListener('click',()=>$('#f-imp').click());
$('#f-imp').addEventListener('change',async e=>{const f=e.target.files[0];e.target.value='';if(f)importarPlani(await f.text())});
const ti=$('#title'), dt=$('#ws-date'); ti.value=S.title; dt.value=S.date;
ti.addEventListener('input',()=>{S.title=ti.value;save()});
dt.addEventListener('change',()=>{S.date=dt.value;save()});

function toast(msg,label,fn){
  const t=$('#toast'); t.innerHTML=`<span>${esc(msg)}</span>`;
  if(label){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>{t.hidden=true;fn()};t.appendChild(b)}
  t.hidden=false; clearTimeout(toastT); toastT=setTimeout(()=>{t.hidden=true},5000);
}

let rz=0; window.addEventListener('resize',()=>{cancelAnimationFrame(rz);rz=requestAnimationFrame(()=>{if(!pv)renderLane()})});
function cargarEjemplo(){
  pushUndo();
  const m=(id,name,kind,start,end,extra)=>Object.assign({id,name,kind,start,end,desc:'',resp:'',res:''},extra||{});
  S.ws={start:540,end:780}; S.trans=['Proyector','Plumones'];
  S.mods=[
    m(1,'Bienvenida y objetivos','part',540,555),
    m(2,'Exposición: ideas clave','expo',555,595,{desc:'Presentación breve con ejemplos y espacio para preguntas.',resp:'Quien facilita',res:'Clicker'}),
    m(3,'Trabajo en grupos','part',595,645,{res:'Papelógrafos'}),
    m(4,'Pausa','pausa',645,660),
    m(5,'Práctica con casos','prac',660,735,{res:'Notebooks'}),
    m(6,'Cierre y próximos pasos','part',735,765,{res:'Papelógrafos'})];
  S.trans.forEach(recordar);
  S.nid=7; if(!S.title.trim()){S.title='Taller de ejemplo';ti.value=S.title}
  sel=null;pv=null;save();renderAll();
  toast('Cargué un ejemplo para que practiques.','Deshacer',doUndo);
}
window.PlaniApp={cargarEjemplo,hayModulos:()=>S.mods.length>0};
renderAll();
})();
