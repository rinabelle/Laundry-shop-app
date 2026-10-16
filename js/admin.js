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
orders.sort((a,b)=>a.created-b.created).forEach((o,i)=>o.id='LDR-'+String(i+1).padStart(4,'0'));
orders.reverse();   


function getCompletedOrders(start,end){
  return orders.filter(o=>o.status==='Completed'&&o.completed&&o.completed>=start&&o.completed<end);
}
const inProgress=()=>orders.filter(o=>['Received','Washing','Folding','Ready for pickup'].includes(o.status)).length;


const fmtD=(d,o)=>d.toLocaleDateString('en-PH',o);
const fmtDT=d=>d.toLocaleString('en-PH',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
function toast(m){const t=document.createElement('div');t.className='toast';t.setAttribute('role','status');t.textContent=m;document.body.append(t);setTimeout(()=>t.remove(),2200)}


let view='sales';
function showView(v){
  view=v;
  ['sales','services','employees','history'].forEach(x=>$('#v-'+x).hidden=x!==v);
  $$('#tabSeg button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===v));
  window.scrollTo(0,0);
  ({sales:renderSales,services:renderServices,employees:()=>window.renderEmployees&&window.renderEmployees(),history:renderHistory})[v]();
}
$('#tabSeg').addEventListener('click',e=>{const b=e.target.closest('button');if(b)showView(b.dataset.v)});


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
    `<div class="card stat"><div class="lbl">Total earnings</div><div class="val">${peso(earn)}</div></div>
     <div class="card stat"><div class="lbl">Completed orders</div><div class="val">${list.length}</div></div>`;

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
  const W=640,H=240,pl=44,pb=26,pt=10,top=niceMax(Math.max(...vals));
  const bw=(W-pl)/n,gap=Math.min(10,bw*.22);
  let s=`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${metric==='earnings'?'Earnings':'Completed orders'} chart, total ${esc(metric==='earnings'?peso(earn):list.length)}">`;
  for(let g=0;g<=4;g++){const v=top*g/4,y=pt+(H-pt-pb)*(1-g/4);
    s+=`<line x1="${pl}" x2="${W}" y1="${y}" y2="${y}" stroke="rgba(255,255,255,.1)"/><text x="${pl-8}" y="${y+4}" text-anchor="end">${v>=1000?(v/1000)+'k':Math.round(v)}</text>`}
  vals.forEach((v,i)=>{
    const h=(H-pt-pb)*v/top,x=pl+i*bw+gap/2,hh=Math.max(h,3);
    s+=`<rect class="bar-r ${v?'':'zero'}" tabindex="0" x="${x}" y="${H-pb-hh}" width="${bw-gap}" height="${hh}" rx="4" data-i="${i}" aria-label="${esc(fullLab(i))}: ${esc(fmtV(v))}"><title>${esc(fullLab(i))}: ${esc(fmtV(v))}</title></rect>`;
    if(i%showEvery===0)s+=`<text x="${x+(bw-gap)/2}" y="${H-8}" text-anchor="middle">${esc(lab(i))}</text>`;
  });
  s+='</svg>';
  $('#chart').innerHTML=s;
  $$('#chart .bar-r').forEach(r=>{
    const show=()=>{const i=+r.dataset.i;$('#readout').innerHTML=`<b>${esc(fullLab(i))}</b> · ${peso(earnV[i])} from ${cntV[i]} completed order${cntV[i]===1?'':'s'}`};
    r.addEventListener('mouseenter',show);r.addEventListener('focus',show);r.addEventListener('click',show);
  });
  const ip=inProgress();
  $('#ruleTxt').textContent=`Only orders marked Completed (picked up) are counted. ${ip} order${ip===1?' is':'s are'} still in progress and not included.`;
}

$('#typeSeg').addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;type=b.dataset.t;
  $$('#typeSeg button').forEach(x=>x.setAttribute('aria-pressed',x===b));renderSales();
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


let hLimit=12;
function histFiltered(){
  const q=$('#hq').value.trim().toLowerCase(),f=$('#hf').value;
  return orders.filter(o=>{
    if(q&&!o.name.toLowerCase().includes(q))return false;
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
function renderHistory(){
  const f=histFiltered(),shown=f.slice(0,hLimit);
  $('#histT').innerHTML=shown.length
    ?`<thead><tr><th>Name</th><th>Service</th><th class="num">Price</th><th>Date</th><th>Picked up</th></tr></thead><tbody>`+
      shown.map(o=>`<tr>
        <td data-l="Name"><b>${esc(o.name)}</b></td>
        <td data-l="Service">${esc(o.svc)}</td>
        <td data-l="Price" class="num"><b>${peso(o.price)}</b></td>
        <td data-l="Date">${esc(fmtDT(o.created))}</td>
        <td data-l="Picked up?">${pickupCell(o)}</td></tr>`).join('')+'</tbody>'
    :'<tbody><tr><td class="empty">No orders match your search.</td></tr></tbody>';
  $('#histMore').innerHTML=f.length>shown.length
    ?`<span>Showing ${shown.length} of ${f.length}</span><button class="btn sm" id="hMore" type="button">Show more</button>`
    :`<span>${f.length} order${f.length===1?'':'s'}</span>`;
  const m=$('#hMore');if(m)m.onclick=()=>{hLimit+=12;renderHistory()};
}
['hq','hf'].forEach(id=>$('#'+id).addEventListener('input',()=>{hLimit=12;renderHistory()}));

const outDlg=$('#outDlg');
const EMPLOYEE_PAGE='login_signup.html';
$('#logoutBtn').addEventListener('click',()=>outDlg.showModal());
$('#outCancel').addEventListener('click',()=>outDlg.close());
$('#outOk').addEventListener('click',()=>{outDlg.close();window.location.href=EMPLOYEE_PAGE});

showView('sales');