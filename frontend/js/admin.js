'use strict';
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const peso=n=>'₱'+Number(n).toLocaleString('en-PH',{maximumFractionDigits:2});
const DAY=864e5;
const pad=n=>String(n).padStart(2,'0');


const UNITS=['per kilo','per piece'];
const services=[
  {id:1,name:'Wash and fold',       unit:'per kilo', price:65, active:true},
  {id:2,name:'Wash, dry and fold',  unit:'per kilo', price:85, active:true},
  {id:3,name:'Dry cleaning (suit)', unit:'per piece',price:350,active:true},
  {id:4,name:'Comforter / bedsheet',unit:'per piece',price:250,active:true},
  {id:5,name:'Ironing only',        unit:'per kilo', price:50, active:false}
];
let nextSvcId=6;


function rng(seed){return()=>(seed=(seed*1664525+1013904223)%4294967296)/4294967296}
const R=rng(20261008);
const NAMES=['Delo Santos','R. Bandala','A. Reyes','A. Jerez','C. Cayton','M. Dela Cruz','L. Garcia','K. Mendoza','J. Ramos','P. Santos','E. Villanueva','B. Aquino','T. Flores','D. Castillo','N. Torres','S. Lim','G. Pascual','H. Ocampo'];
const now=new Date();
const startOfDay=d=>new Date(d.getFullYear(),d.getMonth(),d.getDate());
const today0=startOfDay(now);
const orders=[];
for(let i=0;i<260;i++){
  const daysAgo=Math.floor(Math.pow(R(),1.1)*100);
  const created=new Date(today0.getTime()-daysAgo*DAY+(7+R()*13)*36e5);
  const sv=services[Math.floor(R()*4)];                                   
  const qty=sv.unit==='per kilo'?Math.round((2+R()*8)*2)/2:1+Math.floor(R()*3);   
  
  const o={name:NAMES[Math.floor(R()*NAMES.length)],svc:sv.name,price:Math.round(sv.price*qty),created,status:'Completed',completed:null};
  const r=R();
  if(daysAgo>=1){
    o.status=r<.94?'Completed':'Cancelled';
    if(o.status==='Completed')o.completed=new Date(created.getTime()+(4+R()*20)*36e5);
  }else{
    o.status=['Received','Washing','Folding','Ready for pickup','Completed','Completed'][Math.floor(R()*6)];
    if(o.status==='Completed')o.completed=new Date(Math.min(now.getTime(),created.getTime()+(1+R()*6)*36e5));
  }
  if(o.completed&&o.completed>now)o.completed=new Date(now.getTime()-R()*36e5);
  if(o.created>now)o.created=new Date(now.getTime()-R()*36e5*3);
  orders.push(o);
}

[[3,'Ready for pickup'],[3,'Washing'],[4,'Folding'],[6,'Ready for pickup']].forEach(([daysAgo,status])=>{
  const sv=services[Math.floor(R()*4)];
  const qty=sv.unit==='per kilo'?Math.round((2+R()*8)*2)/2:1+Math.floor(R()*3);
  orders.push({name:NAMES[Math.floor(R()*NAMES.length)],svc:sv.name,price:Math.round(sv.price*qty),
    created:new Date(today0.getTime()-daysAgo*DAY+(8+R()*10)*36e5),status,completed:null});
});
orders.sort((a,b)=>a.created-b.created).forEach((o,i)=>o.id='LDR-'+String(i+1).padStart(4,'0'));
orders.reverse();   


function getCompletedOrders(start,end){
  return orders.filter(o=>o.status==='Completed'&&o.completed&&o.completed>=start&&o.completed<end);
}
const inProgress=()=>orders.filter(o=>['Received','Washing','Folding','Ready for pickup'].includes(o.status)).length;


const fmtD=(d,o)=>d.toLocaleDateString('en-PH',o);
const fmtDT=d=>d.toLocaleString('en-PH',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
function toast(m){const t=document.createElement('div');t.className='toast';t.setAttribute('role','status');t.textContent=m;document.body.append(t);setTimeout(()=>t.remove(),2200)}


let animStats=true;

function countUp(el){
  const to=+el.dataset.to,money=el.dataset.money==='1';
  const fmt=v=>money?peso(v):String(v);
  if(!to||matchMedia('(prefers-reduced-motion: reduce)').matches){el.textContent=fmt(to);return}
  const t0=performance.now(),D=900;
  (function f(t){
    const p=Math.min((t-t0)/D,1),e=1-Math.pow(1-p,3);
    el.textContent=fmt(Math.round(to*e));
    if(p<1)requestAnimationFrame(f);
  })(t0);
}

$$('.seg').forEach(s=>{
  const p=document.createElement('span');
  p.className='pill';p.setAttribute('aria-hidden','true');
  s.prepend(p);
});
function syncPills(snap){
  $$('.seg').forEach(seg=>{
    const p=seg.querySelector('.pill'),b=seg.querySelector('[aria-pressed="true"]');
    if(!p||!b||!seg.offsetWidth)return;
    if(snap)p.classList.remove('ready');
    p.style.width=b.offsetWidth+'px';
    p.style.transform='translateX('+b.offsetLeft+'px)';
    if(!p.classList.contains('ready')){void p.offsetWidth;p.classList.add('ready')}
  });
}
new MutationObserver(()=>syncPills()).observe(document.body,{subtree:true,attributes:true,attributeFilter:['aria-pressed']});
addEventListener('resize',()=>syncPills(true));
if(document.fonts)document.fonts.ready.then(()=>syncPills(true));


let view='sales',prevView='sales';
function showView(v){
  if(v!=='accounts')prevView=v;
  view=v;
  if(v==='sales')animStats=true;
  ['sales','services','history','accounts'].forEach(x=>$('#v-'+x).hidden=x!==v);
  $$('#tabSeg button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===v));
  syncPills();
  window.scrollTo(0,0);
  ({sales:renderSales,services:renderServices,history:renderHistory,accounts:renderAccounts})[v]();
}
$('#tabSeg').addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.v==='accounts')gateAccounts();else showView(b.dataset.v);
});


let type='weekly',metric='earnings';
const toInput=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const fromInput=s=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s);return m?new Date(+m[1],+m[2]-1,+m[3]):null};
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
function getRange(t,d){
  if(t==='daily')return{start:d,end:addDays(d,1)};
  if(t==='weekly'){const s=addDays(d,-((d.getDay()+6)%7));return{start:s,end:addDays(s,7)}}   // Mon–Sun
  const s=new Date(d.getFullYear(),d.getMonth(),1);return{start:s,end:new Date(d.getFullYear(),d.getMonth()+1,1)};
}
function niceMax(max){if(max<=0)return 4;const raw=max/4,p=Math.pow(10,Math.floor(Math.log10(raw))),f=raw/p;return(f<=1?1:f<=2?2:f<=5?5:10)*p*4}

function chartAxis(metric,t,max){
  if(metric==='earnings'){
    if(t==='daily'){ 
      if(max<=800)return{top:800,step:200};
      const step=[250,500,1000,2000,2500,5000,10000,20000,50000,100000].find(x=>Math.ceil(max/x)<=4);
      if(step)return{top:Math.ceil(max/step)*step,step};
    }
    const top=niceMax(max);return{top,step:top/4};
  }
  const base={daily:{top:2,step:1},weekly:{top:4,step:1},monthly:{top:8,step:2}}[t];
  if(max<=base.top)return base;
  const step=[1,2,5,10,20,50,100,200,500,1000].find(x=>Math.ceil(max/x)<=4);
  if(step)return{top:Math.ceil(max/step)*step,step};
  const top=niceMax(max);return{top,step:top/4};
}

function renderSales(){
  const dateEl=$('#date');
  let d=fromInput(dateEl.value);
  if(!d||d>today0){d=today0;dateEl.value=toInput(d)}
  const {start,end}=getRange(type,d);
  const list=getCompletedOrders(start,end);
  const earn=list.reduce((s,o)=>s+o.price,0);

  const last=addDays(end,-1);
  $('#rangeLabel').textContent=type==='daily'?fmtD(start,{weekday:'long',month:'long',day:'numeric',year:'numeric'})
    :type==='weekly'?`Week of ${fmtD(start,{month:'short',day:'numeric'})} – ${fmtD(last,{month:'short',day:'numeric',year:'numeric'})}`
    :fmtD(start,{month:'long',year:'numeric'});

  $('#stats').innerHTML=
    `<div class="card stat"><span class="ico teal"><svg class="ic"><use href="#i-coins"/></svg></span><div><div class="lbl">Total earnings</div><div class="val" data-to="${earn}" data-money="1">${peso(earn)}</div></div></div>
     <div class="card stat violet"><span class="ico violet"><svg class="ic"><use href="#i-clip"/></svg></span><div><div class="lbl">Completed orders</div><div class="val" data-to="${list.length}">${list.length}</div></div></div>`;
  if(animStats){$$('#stats .val').forEach(countUp);animStats=false}

  let n,lab,idx,showEvery;
  if(type==='daily'){n=24;lab=i=>(i%12||12)+(i<12?'a':'p');idx=o=>o.completed.getHours();showEvery=3}
  else if(type==='weekly'){n=7;lab=i=>fmtD(addDays(start,i),{weekday:'short'});idx=o=>Math.round((startOfDay(o.completed)-start)/DAY);showEvery=1}
  else{n=Math.round((end-start)/DAY);lab=i=>String(i+1);idx=o=>o.completed.getDate()-1;showEvery=n>20?5:2}
  const fullLab=i=>type==='daily'?`${lab(i)} – ${(((i+1)%12)||12)+((i+1)%24<12?'a':'p')}`:fmtD(addDays(start,i),{weekday:'short',month:'short',day:'numeric'});
  const earnV=Array(n).fill(0),cntV=Array(n).fill(0);
  list.forEach(o=>{const i=idx(o);earnV[i]+=o.price;cntV[i]++});
  const vals=metric==='earnings'?earnV:cntV;
  const fmtV=v=>metric==='earnings'?peso(v):v+(v===1?' order':' orders');

  $('#readout').textContent=list.length?'Hover or tap a bar for details':'No completed orders in this range.';
  const W=960,H=280,pl=56,pb=30,pt=24,{top,step:yStep}=chartAxis(metric,type,Math.max(...vals));
  const bw=(W-pl)/n,gap=Math.min(10,bw*.22);
  let s=`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${metric==='earnings'?'Earnings':'Completed orders'} chart, total ${esc(metric==='earnings'?peso(earn):list.length)}"><defs><linearGradient id="barG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#58f3de"/><stop offset="1" stop-color="#12b3a3"/></linearGradient></defs>`;
  const lines=Math.round(top/yStep);
  for(let g=0;g<=lines;g++){const v=yStep*g,y=pt+(H-pt-pb)*(1-v/top);
    s+=`<line x1="${pl}" x2="${W}" y1="${y}" y2="${y}" stroke="rgba(200,205,255,${g?.18:.45})"${g?' stroke-dasharray="4 6"':''}/><text x="${pl-8}" y="${y+4}" text-anchor="end">${metric==='earnings'?'₱':''}${v>=1000?(v/1000)+'k':Math.round(v)}</text>`}
  vals.forEach((v,i)=>{
    const h=(H-pt-pb)*v/top,x=pl+i*bw+gap/2,hh=Math.max(h,3);
    s+=`<rect class="bar-r ${v?'':'zero'}" tabindex="0" x="${x}" y="${H-pb-hh}" width="${bw-gap}" height="${hh}" rx="4" data-i="${i}" aria-label="${esc(fullLab(i))}: ${esc(fmtV(v))}"><title>${esc(fullLab(i))}: ${esc(fmtV(v))}</title></rect>`;
    if(v>0&&bw>=22){
      const short=bw<30;
      const txt=metric==='earnings'?(short?(v>=1000?(Math.round(v/100)/10)+'k':String(Math.round(v))):peso(v)):String(v);
      s+=`<text class="bar-val" data-i="${i}" x="${x+(bw-gap)/2}" y="${H-pb-hh-5}" text-anchor="middle" font-weight="700" pointer-events="none"${short?' style="font-size:10px"':''}>${esc(txt)}</text>`;
    }
    if(i%showEvery===0)s+=`<text x="${x+(bw-gap)/2}" y="${H-8}" text-anchor="middle">${esc(lab(i))}</text>`;
  });
  s+='</svg>';
  $('#chart').innerHTML=s;
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches)
    $$('#chart .bar-val').forEach(t=>t.animate([{opacity:0},{opacity:1}],{duration:250,delay:500+(+t.dataset.i)*70,fill:'backwards',easing:'ease-out'}));
  $$('#chart .bar-r').forEach(r=>{
    const show=()=>{const i=+r.dataset.i;$('#readout').innerHTML=`<b>${esc(fullLab(i))}</b> · ${peso(earnV[i])} from ${cntV[i]} completed order${cntV[i]===1?'':'s'}`};
    r.addEventListener('mouseenter',show);r.addEventListener('focus',show);r.addEventListener('click',show);
  });
  const ip=inProgress();
  $('#ruleTxt').textContent=`Only orders marked Completed (picked up) are counted. ${ip} order${ip===1?' is':'s are'} still in progress and not included.`;
  renderBreakdown(list,earn);
  renderStuck();
}

const BRK_COLORS=['#33e3cb','#a98bf5','#ffd47a','#ff8fb1','#7ec8ff'];
function renderBreakdown(list,earn){
  const m=new Map();
  list.forEach(o=>{const r=m.get(o.svc)||{name:o.svc,rev:0,n:0};r.rev+=o.price;r.n++;m.set(o.svc,r)});
  const rows=[...m.values()].sort((a,b)=>b.rev-a.rev);
  if(!rows.length){
    $('#brk').innerHTML='<div class="brk-empty">No completed orders in this range.</div>';
    $('#brkNote').textContent='';
    return;
  }
  const top=rows[0].rev||1;
  $('#brk').innerHTML=rows.map((r,i)=>
    `<div><div class="brk-h"><span>${esc(r.name)}</span><span>${peso(r.rev)} · ${r.n} order${r.n===1?'':'s'}</span></div>
      <div class="brk-track"><div class="brk-fill" style="width:${Math.max(r.rev/top*100,3)}%;background:${BRK_COLORS[i%BRK_COLORS.length]}"></div></div></div>`).join('');
  $('#brkNote').textContent=`Top earner: ${rows[0].name} (${Math.round(rows[0].rev/earn*100)}% of revenue)`;
}

const STUCK_DAYS=2,STUCK_SHOW=2;
let stuckAll=false;
function renderStuck(){
  const nowT=Date.now();
  const list=orders
    .filter(o=>o.status!=='Completed'&&o.status!=='Cancelled'&&nowT-o.created>=STUCK_DAYS*DAY)
    .sort((a,b)=>a.created-b.created);
  const n=list.length;
  $('#stuckSub').textContent=`Orders not completed after ${STUCK_DAYS} days · ${n} need${n===1?'s':''} attention`;
  const shown=stuckAll?list:list.slice(0,STUCK_SHOW);
  $('#stuckBody').innerHTML=shown.map(o=>{
    const days=Math.floor((nowT-o.created)/DAY);
    return `<tr>
      <td data-l="Customer"><b>${esc(o.name)}</b></td>
      <td data-l="Service">${esc(o.svc)}</td>
      <td data-l="Price" class="num"><b>${peso(o.price)}</b></td>
      <td data-l="Status"><span class="badge ${o.status==='Ready for pickup'?'b-ready':'b-pending'}">${esc(o.status)}</span></td>
      <td data-l="Waiting"><span class="badge ${days>=4?'d-late':'d-warn'}">${days} day${days===1?'':'s'}</span></td></tr>`;
  }).join('');
  $('#stuckWrap').hidden=!n;
  const em=$('#stuckEmpty');
  em.hidden=n>0;
  em.textContent=n?'':'No stuck orders. Everything is moving on time.';
  const tg=$('#stuckToggle');
  tg.hidden=n<=STUCK_SHOW;
  tg.textContent=stuckAll?'Show less':`Show all (${n})`;
}
$('#stuckToggle').addEventListener('click',()=>{stuckAll=!stuckAll;renderStuck()});

$('#typeSeg').addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;type=b.dataset.t;
  $$('#typeSeg button').forEach(x=>x.setAttribute('aria-pressed',x===b));
  animStats=true;renderSales();
});
$('#metricSeg').addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;metric=b.dataset.m;
  $$('#metricSeg button').forEach(x=>x.setAttribute('aria-pressed',x===b));renderSales();
});
$('#date').max=toInput(today0);
$('#date').value=toInput(today0);
$('#date').addEventListener('change',renderSales);


const ICON_EDIT='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>';
const ICON_DEL='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>';

function renderServices(){
  $('#svcT').innerHTML=services.length
    ?`<thead><tr><th>Service</th><th>Unit</th><th>Price</th><th>Status</th><th></th></tr></thead><tbody>`+
      services.map(s=>`<tr>
        <td data-l="Service"><b>${esc(s.name)}</b></td>
        <td data-l="Unit" class="muted-t">${esc(s.unit)}</td>
        <td data-l="Price"><b>${peso(s.price)}</b></td>
        <td data-l="Status"><span class="chip ${s.active?'active':'hidden'}">${s.active?'Active':'Hidden'}</span></td>
        <td class="act">
          <button class="icon-btn" type="button" data-edit="${s.id}" aria-label="Edit ${esc(s.name)}">${ICON_EDIT}</button>
          <button class="icon-btn danger" type="button" data-del="${s.id}" aria-label="Remove ${esc(s.name)}">${ICON_DEL}</button>
        </td></tr>`).join('')+'</tbody>'
    :'<tbody><tr><td class="empty">No services yet. Click “+ Add service”.</td></tr></tbody>';
  const n=services.length;
  $('#svcCount').textContent=`${n} service${n===1?'':'s'}`;
}


const svcDlg=$('#svcDlg');
let editingSvc=null;
function openSvc(s){
  editingSvc=s||null;
  $('#svcTitle').textContent=s?'Edit service':'Add service';
  $('#sName').value=s?s.name:'';
  $('#sUnit').value=s?s.unit:UNITS[0];
  $('#sPrice').value=s?s.price:'';
  $('#sStatus').value=s&&!s.active?'hidden':'active';
  $('#svcErr').textContent='';
  svcDlg.showModal();$('#sName').focus();
}
$('#addSvc').addEventListener('click',()=>openSvc(null));
$('#svcCancel').addEventListener('click',()=>svcDlg.close());
$('#svcForm').addEventListener('submit',e=>{
  e.preventDefault();
  const name=$('#sName').value.trim().replace(/\s+/g,' ');
  const unit=$('#sUnit').value,price=Number($('#sPrice').value),active=$('#sStatus').value==='active';
  let m='';
  if(name.length<2||name.length>60)m='Service name must be 2–60 characters.';
  else if(services.some(s=>s!==editingSvc&&s.name.toLowerCase()===name.toLowerCase()))m='A service with that name already exists.';
  else if(!UNITS.includes(unit))m='Choose a valid unit.';
  else if(!Number.isFinite(price)||price<=0||price>100000)m='Price must be a number above 0 (max ₱100,000).';
  if(m){$('#svcErr').textContent=m;return}
  const price2=Math.round(price*100)/100;
  if(editingSvc){Object.assign(editingSvc,{name,unit,price:price2,active});toast('Service updated')}
  else{services.push({id:nextSvcId++,name,unit,price:price2,active});toast('Service added')}
  svcDlg.close();renderServices();
});


const delDlg=$('#delDlg');
let deleting=null;
$('#svcT').addEventListener('click',e=>{
  const ed=e.target.closest('[data-edit]'),dl=e.target.closest('[data-del]');
  if(ed){const s=services.find(x=>x.id===+ed.dataset.edit);if(s)openSvc(s)}
  if(dl){
    deleting=services.find(x=>x.id===+dl.dataset.del);if(!deleting)return;
    $('#delTxt').textContent=`“${deleting.name}” will no longer be offered. Orders already in History keep their service name and price.`;
    delDlg.showModal();
  }
});
$('#delCancel').addEventListener('click',()=>delDlg.close());
$('#delOk').addEventListener('click',()=>{
  const i=services.indexOf(deleting);
  if(i>-1){services.splice(i,1);toast('Service removed')}
  deleting=null;delDlg.close();renderServices();
});


const PAGE=10;
let hPage=1;
function histFiltered(){
  const q=$('#hq').value.trim().toLowerCase(),f=$('#hf').value;
  const day=fromInput($('#hdate').value);
  return orders.filter(o=>{
    if(q&&!o.name.toLowerCase().includes(q))return false;
    if(day&&startOfDay(o.created).getTime()!==day.getTime())return false;
    if(f==='picked')return o.status==='Completed';
    if(f==='notyet')return o.status!=='Completed'&&o.status!=='Cancelled';
    if(f==='cancelled')return o.status==='Cancelled';
    return true;
  });
}
function pickupCell(o){
  if(o.status==='Completed')return `<span class="chip done">Picked up</span><small>${esc(fmtD(o.completed,{month:'short',day:'numeric'}))}</small>`;
  if(o.status==='Cancelled')return '<span class="chip cancelled">Cancelled</span>';
  return `<span class="chip wait">Not yet</span><small>${esc(o.status)}</small>`;
}
function pageList(cur,last){
  if(last<=7)return Array.from({length:last},(_,i)=>i+1);
  if(cur<=4)return [1,2,3,4,5,'gap',last];
  if(cur>=last-3)return [1,'gap',last-4,last-3,last-2,last-1,last];
  return [1,'gap',cur-1,cur,cur+1,'gap',last];
}
function renderHistory(){
  const f=histFiltered();
  const pages=Math.max(1,Math.ceil(f.length/PAGE));
  hPage=Math.min(Math.max(hPage,1),pages);
  const from=(hPage-1)*PAGE,shown=f.slice(from,from+PAGE);
  $('#histT').innerHTML=shown.length
    ?`<thead><tr><th>Name</th><th>Service</th><th class="num">Price</th><th>Date</th><th>Picked up</th></tr></thead><tbody>`+
      shown.map(o=>`<tr>
        <td data-l="Name"><b>${esc(o.name)}</b></td>
        <td data-l="Service">${esc(o.svc)}</td>
        <td data-l="Price" class="num"><b>${peso(o.price)}</b></td>
        <td data-l="Date">${esc(fmtDT(o.created))}</td>
        <td data-l="Picked up?">${pickupCell(o)}</td></tr>`).join('')+'</tbody>'
    :`<tbody><tr><td class="empty">${$('#hdate').value?'No orders on this date.':'No orders match your search.'}</td></tr></tbody>`;
  const info=f.length?`Showing ${from+1}–${from+shown.length} of ${f.length}`:'0 orders';
  const nav=pages>1
    ?`<nav class="pg-nav" aria-label="History pages">
        <button class="pg-btn" type="button" data-p="${hPage-1}" aria-label="Previous page" ${hPage===1?'disabled':''}>‹</button>`+
        pageList(hPage,pages).map(p=>p==='gap'?'<span class="pg-gap" aria-hidden="true">…</span>'
          :`<button class="pg-btn" type="button" data-p="${p}" aria-label="Page ${p}" ${p===hPage?'aria-current="page"':''}>${p}</button>`).join('')+
        `<button class="pg-btn" type="button" data-p="${hPage+1}" aria-label="Next page" ${hPage===pages?'disabled':''}>›</button>
      </nav>`
    :'';
  $('#histMore').innerHTML=`<span>${info}</span>${nav}`;
}
$('#histMore').addEventListener('click',e=>{
  const b=e.target.closest('[data-p]');if(!b||b.disabled)return;
  hPage=+b.dataset.p;renderHistory();
  window.scrollTo({top:0});
});
['hq','hf','hdate'].forEach(id=>$('#'+id).addEventListener('input',()=>{hPage=1;renderHistory()}));
$('#hdate').max=toInput(today0);
const outDlg=$('#outDlg');
const EMPLOYEE_PAGE='employee.html';
$('#logoutBtn').addEventListener('click',()=>outDlg.showModal());
$('#outCancel').addEventListener('click',()=>outDlg.close());
$('#outOk').addEventListener('click',()=>{
  try{sessionStorage.removeItem(KEY_NAME)}catch(_){}
  outDlg.close();window.location.href=EMPLOYEE_PAGE;
});

const API='';
const KEY_NAME='fnk_admin_key';
let accounts=[],accLoaded=false,accErr='',accDeleting=null;

async function api(path,opts={},keyOverride){
  const key=keyOverride||sessionStorage.getItem(KEY_NAME);
  if(!key){const e=new Error('Admin key is required.');e.status=401;throw e}
  let res;
  try{
    res=await fetch(API+path,{...opts,headers:{'Content-Type':'application/json','x-admin-key':key,...(opts.headers||{})}});
  }catch(_){
    throw new Error('Cannot reach the server. Make sure the backend is running.');
  }
  const data=await res.json().catch(()=>({}));
  if(res.status===401){
    sessionStorage.removeItem(KEY_NAME);
    const e=new Error(data.error||'Wrong admin key.');e.status=401;throw e;
  }
  if(!res.ok)throw new Error(data.error||(res.status===404?'Cannot reach the employee server. Open this page through the backend.':'Request failed.'));
  sessionStorage.setItem(KEY_NAME,key);
  return data;
}

const keyDlg=$('#keyDlg');
function openKeyDlg(msg){
  $('#keyForm').reset();
  $('#keyErr').textContent=msg||'';
  keyDlg.showModal();$('#kInput').focus();
}
function gateAccounts(){
  if(sessionStorage.getItem(KEY_NAME))showView('accounts');
  else openKeyDlg();
}
function lockAccounts(){
  accDlg.close();accDelDlg.close();
  accounts=[];accLoaded=false;
  showView(prevView);
  openKeyDlg('That admin key was not accepted. Please enter it again.');
}
$('#keyCancel').addEventListener('click',()=>keyDlg.close());
$('#keyForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const key=$('#kInput').value.trim();
  if(!key){$('#keyErr').textContent='Please enter the admin key.';return}
  const btn=$('#keyForm button[type="submit"]');
  btn.disabled=true;$('#keyErr').textContent='';
  try{
    const d=await api('/api/admin/employees',{},key);
    accounts=d.employees||[];accLoaded=true;accErr='';
    keyDlg.close();
    showView('accounts');
  }catch(err){
    $('#keyErr').textContent=err.message||'Could not verify the admin key.';
    $('#kInput').select();
  }finally{btn.disabled=false}
});

function drawAccounts(){
  let body;
  if(accErr)body=`<tbody><tr><td class="empty">${esc(accErr)}</td></tr></tbody>`;
  else if(!accLoaded)body='<tbody><tr><td class="empty">Loading employees…</td></tr></tbody>';
  else if(!accounts.length)body='<tbody><tr><td class="empty">No employee accounts yet. Click “+ Add employee”.</td></tr></tbody>';
  else body=`<thead><tr><th>Name</th><th>Email</th><th>Date</th><th></th></tr></thead><tbody>`+
    accounts.map(a=>`<tr>
      <td data-l="Name"><b>${esc(a.full_name)}</b></td>
      <td data-l="Email" class="muted-t">${esc(a.email)}</td>
      <td data-l="Date">${esc(a.created_at?fmtD(new Date(a.created_at),{month:'short',day:'numeric',year:'numeric'}):'—')}</td>
      <td class="act"><button class="icon-btn danger" type="button" data-accdel="${esc(a.id)}" aria-label="Remove ${esc(a.full_name)}">${ICON_DEL}</button></td>
    </tr>`).join('')+'</tbody>';
  $('#accT').innerHTML=body;
  const n=accounts.length;
  $('#accCount').textContent=accLoaded&&!accErr?`${n} employee${n===1?'':'s'}`:'';
}

async function loadAccounts(){
  try{
    const d=await api('/api/admin/employees');
    accounts=d.employees||[];accLoaded=true;accErr='';
  }catch(e){
    if(e.status===401){lockAccounts();return}
    accErr=(e.message||'Could not load employees.')+' Open this tab again to retry.';
  }
  drawAccounts();
}

function renderAccounts(){
  accErr='';
  drawAccounts();
  loadAccounts();
}

const accDlg=$('#accDlg'),accDelDlg=$('#accDelDlg');
$('#addAcc').addEventListener('click',()=>{
  $('#accForm').reset();
  $('#accErr').textContent='';
  accDlg.showModal();$('#aName').focus();
});
$('#accCancel').addEventListener('click',()=>accDlg.close());
$('#accX').addEventListener('click',()=>accDlg.close());
$('#accForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const full_name=$('#aName').value.trim().replace(/\s+/g,' ');
  const email=$('#aUser').value.trim().toLowerCase();
  const password=$('#aPass').value,pw2=$('#aPass2').value;
  let m='';
  if(full_name.length<2||full_name.length>60)m='Full name must be 2–60 characters.';
  else if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))m='Please enter a valid email address.';
  else if(password.length<6)m='Password must be at least 6 characters.';
  else if(password!==pw2)m='Passwords do not match.';
  if(m){$('#accErr').textContent=m;return}

  const btn=$('#accForm button[type="submit"]');
  btn.disabled=true;$('#accErr').textContent='';
  try{
    await api('/api/admin/employees',{method:'POST',body:JSON.stringify({full_name,email,password})});
    accDlg.close();
    toast('Employee account added');
    await loadAccounts();
  }catch(err){
    if(err.status===401){lockAccounts();return}
    $('#accErr').textContent=err.message||'Could not add the employee.';
  }finally{btn.disabled=false}
});

const fmtAdded=v=>v?fmtD(new Date(v),{month:'short',day:'numeric',year:'numeric'}):'—';
function fillAccDel(a){
  const set=(id,text)=>{const el=$(id);el.textContent=text;el.title=text};
  set('#accDelName',a.full_name);
  set('#accDelNameV',a.full_name);
  set('#accDelEmail',a.email);
  set('#accDelAdded',fmtAdded(a.created_at));
}
$('#accT').addEventListener('click',e=>{
  const b=e.target.closest('[data-accdel]');if(!b)return;
  accDeleting=accounts.find(a=>String(a.id)===b.dataset.accdel);if(!accDeleting)return;
  fillAccDel(accDeleting);
  accDelDlg.showModal();
  $('#accDelCancel').focus();
  requestAnimationFrame(()=>$('#accDelCancel').focus());
});
$('#accDelCancel').addEventListener('click',()=>accDelDlg.close());
$('#accDelOk').addEventListener('click',async()=>{
  if(!accDeleting)return;
  const id=accDeleting.id;
  accDeleting=null;
  accDelDlg.close();
  try{
    await api('/api/admin/employees/'+encodeURIComponent(id),{method:'DELETE'});
    toast('Account removed');
  }catch(err){
    if(err.status===401){lockAccounts();return}
    toast(err.message||'Could not remove the account');
  }
  await loadAccounts();
});

showView('sales');

const runBars = () =>
  $$('#chart .bar-r').forEach((r, i) => (r.style.animationDelay = i * 70 + 'ms'));
new MutationObserver(runBars).observe($('#chart'), { childList: true });
runBars();