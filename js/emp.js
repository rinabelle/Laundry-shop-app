'use strict';

const EMP_ROLES=['Cashier','Laundry attendant','Delivery rider','Manager'];
const EMP_KEY='fnk_employees';
const employees=(()=>{
  try{
    const saved=JSON.parse(localStorage.getItem(EMP_KEY));
    if(Array.isArray(saved))return saved;
  }catch(e){}
  return [
    {id:1,name:'Juan Dela Cruz',username:'juan.dc',phone:'',role:'Manager',active:true},
    {id:2,name:'Ana Reyes',username:'ana.reyes',phone:'',role:'Cashier',active:true}
  ];
})();
let nextEmpId=employees.reduce((m,e)=>Math.max(m,e.id),0)+1;

function saveEmployees(){
  try{localStorage.setItem(EMP_KEY,JSON.stringify(employees))}catch(e){}
}
const initials=n=>{
  const p=n.trim().split(/\s+/);
  return ((p[0]||'?')[0]+(p.length>1?p[p.length-1][0]:'')).toUpperCase();
};

function renderEmployees(){
  $('#empT').innerHTML=employees.length
    ?`<thead><tr><th>Employee</th><th>Role</th><th>Phone</th><th>Status</th><th></th></tr></thead><tbody>`+
      employees.map(e=>`<tr>
        <td data-l="Employee"><div class="emp"><span class="av" aria-hidden="true">${esc(initials(e.name))}</span><span><b>${esc(e.name)}</b><small>@${esc(e.username)}</small></span></div></td>
        <td data-l="Role" class="muted-t">${esc(e.role)}</td>
        <td data-l="Phone" class="muted-t">${esc(e.phone||'—')}</td>
        <td data-l="Status"><button type="button" class="chip-btn" data-tog="${e.id}" aria-label="${e.active?'Disable':'Enable'} ${esc(e.name)}"><span class="chip ${e.active?'active':'hidden'}">${e.active?'Active':'Disabled'}</span></button></td>
        <td class="act"><button class="icon-btn danger" type="button" data-rm="${e.id}" aria-label="Remove ${esc(e.name)}">${ICON_DEL}</button></td>
      </tr>`).join('')+'</tbody>'
    :'<tbody><tr><td class="empty">No employees yet. Click “+ Add employee”.</td></tr></tbody>';
  const n=employees.length;
  $('#empCount').textContent=`${n} employee${n===1?'':'s'}`;
}
window.renderEmployees=renderEmployees;


const empDlg=$('#empDlg');
function openEmp(){
  $('#empForm').reset();
  $('#empErr').textContent='';
  ['ePw','ePw2'].forEach(id=>$('#'+id).type='password');
  $('#ePwShow').textContent='Show';
  empDlg.showModal();$('#eName').focus();
}
$('#addEmp').addEventListener('click',openEmp);
$('#empCancel').addEventListener('click',()=>empDlg.close());


$('#ePhone').addEventListener('input',()=>{
  const el=$('#ePhone');
  el.value=el.value.replace(/\D/g,'').slice(0,11);
});

$('#ePwShow').addEventListener('click',()=>{
  const show=$('#ePw').type==='password';
  ['ePw','ePw2'].forEach(id=>$('#'+id).type=show?'text':'password');
  $('#ePwShow').textContent=show?'Hide':'Show';
});
$('#ePwGen').addEventListener('click',()=>{
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const buf=new Uint32Array(10);crypto.getRandomValues(buf);
  const pw=[...buf].map(n=>chars[n%chars.length]).join('');
  $('#ePw').value=pw;$('#ePw2').value=pw;
  ['ePw','ePw2'].forEach(id=>$('#'+id).type='text');
  $('#ePwShow').textContent='Hide';
});

$('#empForm').addEventListener('submit',ev=>{
  ev.preventDefault();
  const name=$('#eName').value.trim().replace(/\s+/g,' ');
  const username=$('#eUser').value.trim().toLowerCase();
  const phone=$('#ePhone').value.trim();
  const role=$('#eRole').value;
  const pw=$('#ePw').value,pw2=$('#ePw2').value;
  let m='';
  if(name.length<2||name.length>60)m='Full name must be 2–60 characters.';
  else if(!/^[a-z0-9._]{3,20}$/.test(username))m='Username must be 3–20 characters: letters, numbers, dot or underscore.';
  else if(employees.some(e=>e.username===username))m='That username is already taken.';
  else if(phone&&!/^09\d{9}$/.test(phone))m='Phone number must be 11 digits and start with 09 (e.g. 09123456789).';
  else if(!EMP_ROLES.includes(role))m='Choose a valid role.';
  else if(pw.length<8)m='Password must be at least 8 characters.';
  else if(pw!==pw2)m='Passwords do not match.';
  if(m){$('#empErr').textContent=m;return}


  employees.push({id:nextEmpId++,name,username,phone,role,active:true});
  saveEmployees();
  empDlg.close();renderEmployees();toast('Employee account created');
});

$('#ePwClear').addEventListener('click',()=>{
  $('#ePw').value='';$('#ePw2').value='';
  ['ePw','ePw2'].forEach(id=>$('#'+id).type='password');
  $('#ePwShow').textContent='Show';
  $('#ePw').focus();
});


const empDelDlg=$('#empDelDlg');
let removing=null;
$('#empT').addEventListener('click',ev=>{
  const tg=ev.target.closest('[data-tog]'),rm=ev.target.closest('[data-rm]');
  if(tg){
    const e=employees.find(x=>x.id===+tg.dataset.tog);
    if(e){e.active=!e.active;saveEmployees();renderEmployees();toast(e.active?'Account enabled':'Account disabled')}
  }
  if(rm){
    removing=employees.find(x=>x.id===+rm.dataset.rm);if(!removing)return;
    $('#empDelTxt').textContent=`“${removing.name}” (@${removing.username}) will no longer be able to log in. Their past orders stay in History.`;
    empDelDlg.showModal();
  }
});
$('#empDelCancel').addEventListener('click',()=>empDelDlg.close());
$('#empDelOk').addEventListener('click',()=>{
  const i=employees.indexOf(removing);
  if(i>-1){employees.splice(i,1);saveEmployees();toast('Employee removed')}
  removing=null;empDelDlg.close();renderEmployees();
});