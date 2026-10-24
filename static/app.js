const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let S=null,tab='dashboard',tt;
async function api(m,u,b){
  const r=await fetch(u,{method:m,headers:{'Content-Type':'application/json','X-Requested-With':'fetch'},body:b?JSON.stringify(b):undefined});
  const j=await r.json().catch(()=>({}));
  if(r.status===401){location.href='/';throw new Error('Signed out')}
  if(!r.ok)throw new Error(j.error||'Something went wrong');return j}
function toast(t,ok){const e=$('#toast');e.textContent=t;e.className='show'+(ok?' ok':'');clearTimeout(tt);tt=setTimeout(()=>e.className='',3200)}
const fmt=n=>`${S.settings.base} ${Number(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const today=()=>new Date().toISOString().slice(0,10);
const opt=(a,sel)=>a.map(x=>`<option${x===sel?' selected':''}>${esc(x)}</option>`).join('');
const curOpts=()=>opt([...new Set([S.settings.base,S.settings.second])]);
const mname=m=>new Date(m+'-15').toLocaleString(undefined,{month:'short'});
const empty=t=>`<p class="empty">${t}</p>`;

const PAL=['#6B5BE0','#E2703A','#4FB0D0','#B24A7A','#7FB069','#3F5FAC','#8E9BAA','#0C4F4A'];
const n0=n=>Number(n).toLocaleString(undefined,{maximumFractionDigits:0});
let vc=(()=>{try{return localStorage.getItem('vcur')}catch(e){return null}})();
const openAcc=new Set();
const vcur=()=>vc===S.settings.second?vc:S.settings.base;
const dv=n=>vcur()===S.settings.second&&S.settings.second!==S.settings.base?n/S.settings.rate:n;
const mfmt=(n,c)=>`${c} ${Number(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const fv=n=>mfmt(dv(n),vcur());
const toBase=t=>t.currency===S.settings.second&&S.settings.second!==S.settings.base?t.amount*S.settings.rate:t.amount;
function donut(by,total){
  let rows=Object.entries(by).sort((a,b)=>b[1]-a[1]);
  if(rows.length>8){const rest=rows.slice(7).reduce((s,r)=>s+r[1],0);rows=[...rows.slice(0,7),['Other',rest]]}
  let acc=0;const stops=rows.map(([c,v],i)=>{const a=acc/total*100;acc+=v;return `${PAL[i]} ${a}% ${acc/total*100}%`}).join(',');
  return `<div class="donutwrap"><div class="donut" style="background:conic-gradient(${stops})" role="img" aria-label="Spending by category"><div class="hole"><span><b>${n0(dv(total))}</b>${esc(vcur())} spent</span></div></div>
  <ul class="legend2">${rows.map(([c,v],i)=>`<li><i class="sw" style="background:${PAL[i]}"></i>${esc(c)}<em>${(v/total*100).toFixed(0)}%</em></li>`).join('')}</ul></div>`}
function segs(m){const base=Math.max(m.income,m.expense,1);let rows=Object.entries(m.by_cat).sort((a,b)=>b[1]-a[1]);
  if(rows.length>8){const r=rows.slice(7).reduce((t,x)=>t+x[1],0);rows=[...rows.slice(0,7),['Other',r]]}
  return {bar:rows.map(([c,v],i)=>`<i style="width:${v/base*100}%;background:${PAL[i]}" title="${esc(c)} ${esc(fv(v))}"></i>`).join(''),
   leg:rows.slice(0,3).map(([c,v],i)=>`<span><i class="sw" style="background:${PAL[i]}"></i>${esc(c)} ${(v/base*100).toFixed(0)}%</span>`).join('')}}
function acc(k,title,amt,inner){return `<details class="acc" data-k="${k}"${openAcc.has(k)?' open':''}><summary><span>${title}</span><b>${fv(amt)}</b></summary><div class="accb">${inner}</div></details>`}
function vDash(){
  const m=S.summary,left=m.income-m.expense,h=new Date().getHours(),g=h<12?'Good morning':h<18?'Good afternoon':'Good evening';
  const pct=m.income?Math.min(m.expense/m.income*100,100):(m.expense?100:0),n=S.tips.filter(t=>t.level!=='good').length;
  const mx=Math.max(m.income,m.expense,1),sc=m.score,col=sc>=75?'var(--good)':sc>=50?'var(--gold)':'var(--bad)';
  const lab=sc>=75?'Strong':sc>=50?'Steady':sc>=30?'Needs care':'At risk',tm=Math.max(...m.trend.flatMap(t=>[t.income,t.expense]),1);
  const bud=Object.entries(S.budgets).map(([c,b])=>[c,m.by_cat[c]||0,b]).sort((a,b)=>b[1]/b[2]-a[1]/a[2]).slice(0,3);
  const sg=segs(m),cs=[...new Set([S.settings.base,S.settings.second])],li=(a,b)=>`<div class="row2"><span>${a}</span><b>${b}</b></div>`;
  const goalsSaved=S.goals.reduce((s,x)=>s+x.saved,0),recs=S.recurring.filter(r=>r.type==='expense'),recTotal=recs.reduce((s,r)=>s+toBase(r),0);
  const incs=S.transactions.filter(t=>t.type==='income'&&t.date.slice(0,7)===m.month).slice(0,6);
  const catRows=Object.entries(m.by_cat).sort((a,b)=>b[1]-a[1]),all=['inc','exp','goal','rec'].every(k=>openAcc.has(k));
  return `<section class="card hero"><div class="htop"><div class="hgreet"><span class="lbl">${g}, ${esc(S.username)}</span><p class="headline">${esc(m.headline)}</p></div>
   <div class="hctl"><div class="cswitch" role="group" aria-label="Show amounts in">${cs.map(c=>`<button data-vc="${esc(c)}" class="${c===vcur()?'on':''}">${esc(c)}</button>`).join('')}</div>
   <button class="btn gold sm" data-open="sugg">Suggestions <span class="count">${n}</span></button></div></div>
   <div class="hbody"><div class="hamt"><span class="lbl">Left this month</span><h1 class="${left<0?'neg':''}">${fv(left)}</h1></div>
    <div class="hbar"><div class="seg2" role="img" aria-label="How your income was spent">${sg.bar}</div>
     <div class="flowkey"><span>Spent ${fv(m.expense)} (${pct.toFixed(0)}%)</span><span>Left ${fv(Math.max(left,0))}</span></div><div class="hleg">${sg.leg}</div></div>
    <div class="stats"><div class="stat"><small>Safe per day</small><b>${fv(m.safe_per_day)}</b></div><div class="stat"><small>Projected</small><b>${fv(m.projected)}</b></div>
     <div class="stat"><small>Savings rate</small><b>${m.income?(left/m.income*100).toFixed(0)+'%':'-'}</b></div></div></div></section>
  <div class="grid">
   <div class="card"><h2>Spending by category</h2>${m.expense?donut(m.by_cat,m.expense):empty('No spending yet this month. Add an expense and your breakdown appears here.')}</div>
   <div class="card"><h2>Money health</h2>${sc===null?empty('Add your income to get a score.'):`<div class="donutwrap"><div class="ring" style="--p:${sc};--c:${col}"><b>${sc}</b></div>
     <div><h3>${lab}</h3><p class="mute" style="margin:.3rem 0 0;max-width:24ch">Scored on your savings rate, budgets, spending pace and goals.</p></div></div>`}</div>
   <div class="card"><h2>Income vs spending</h2>
    <div class="cmp"><span>Income</span><div class="bar"><i class="inc" style="width:${m.income/mx*100}%"></i></div><b>${fv(m.income)}</b></div>
    <div class="cmp"><span>Spent</span><div class="bar"><i class="out" style="width:${m.expense/mx*100}%"></i></div><b>${fv(m.expense)}</b></div>
    <div class="trend">${m.trend.map(t=>`<div><span><i style="height:${t.income/tm*100}%"></i><i class="e" style="height:${t.expense/tm*100}%"></i></span>${mname(t.month)}</div>`).join('')}</div>
    <p class="legend"><span><b></b>Income</span><span><b style="background:var(--bad)"></b>Spending</span><span>Last month spent ${fv(m.prev_expense)}</span></p></div>
   <div class="card"><h2>Watchlist</h2><h3>Compared with your usual</h3>${m.movers.length?m.movers.map(x=>`<div class="row2"><span>${esc(x.cat)}</span><b class="${x.diff>0?'neg':'pos'}">${x.diff>0?'+':'-'}${fv(Math.abs(x.diff))}</b></div>`).join(''):empty('No big changes yet. This fills in after a few weeks of data.')}
    <h3 style="margin-top:1rem">Budgets</h3>${bud.length?bud.map(([c,s,b])=>{const p=s/b*100;return `<div class="row"><span>${esc(c)}</span><div class="bar"><i class="${p>100?'over':p>=80?'gold':''}" style="width:${Math.min(p,100)}%"></i></div><b>${p.toFixed(0)}%</b></div>`}).join(''):`<p class="empty">No budgets yet.</p><button class="btn sm" data-go="budgets">Set budgets</button>`}</div>
  </div>
  <div class="exprow"><button class="linkbtn" id="expall">${all?'Collapse':'Expand'}</button><span class="mute">This month</span></div>
  ${acc('inc','Income',m.income,incs.length?incs.map(t=>li(`${esc(t.note||'Income')} <small class="mute">${esc(t.date)}</small>`,fv(toBase(t)))).join(''):empty('No income logged this month.'))}
  ${acc('exp','Spending',m.expense,catRows.length?catRows.map(([c,v])=>`<div class="row"><span>${esc(c)}</span><div class="bar"><i class="out" style="width:${v/m.expense*100}%"></i></div><b>${fv(v)}</b></div>`).join(''):empty('No spending logged this month.'))}
  ${acc('goal','Saved in goals',goalsSaved,S.goals.length?S.goals.map(x=>li(esc(x.name),`${fv(x.saved)} of ${fv(x.target)}`)).join(''):empty('No goals yet.'))}
  ${acc('rec','Monthly bills',recTotal,recs.length?recs.map(r=>li(`${esc(r.note||r.category)} <small class="mute">day ${r.day}</small>`,fv(toBase(r)))).join(''):empty('No recurring bills yet.'))}`}
const GO={budgets:'Set a limit',goals:'Open goals',recurring:'Review bills',transactions:'View transactions'};
function drawerSug(){return S.tips.map(t=>`<div class="sug ${t.level}"><p>${esc(t.text)}</p>${t.level!=='good'?`<button class="btn sm" data-go="${t.go||'budgets'}">${GO[t.go||'budgets']}</button>`:''}</div>`).join('')}
function drawerWhat(){const names=[...new Set([...Object.keys(S.summary.by_cat),...Object.keys(S.summary.avg3)])];
  return names.length?`<label>Category<select id="wc">${opt(names)}</select></label><label>Cut by <b id="wv"></b><input id="wp" type="range" min="5" max="100" step="5" value="20"></label><p id="wo"></p>`:empty('Once you have some spending, you can test cuts here.')}
function bindWhatIf(){const s=$('#wc'),r=$('#wp');if(!s)return;
  const go=()=>{const ref=S.summary.avg3[s.value]||S.summary.by_cat[s.value]||0,mo=ref*r.value/100;$('#wv').textContent=r.value+'%';
   $('#wo').innerHTML=`Cutting <b>${esc(s.value)}</b> by ${r.value}% saves about <b>${fmt(mo)}</b> a month, or <b>${fmt(mo*12)}</b> a year.`};
  s.onchange=r.oninput=go;go()}
function setPane(p){document.querySelectorAll('#drawer [data-pane]').forEach(b=>b.classList.toggle('on',b.dataset.pane===p));$('#dbody').innerHTML=p==='s'?drawerSug():drawerWhat();if(p==='w')bindWhatIf()}
function openDrawer(){$('#scrim').hidden=$('#drawer').hidden=false;setPane('s')}
function closeDrawer(){$('#scrim').hidden=$('#drawer').hidden=true}
function txForm(url,btn,extra){return `<form class="card" data-do="POST ${url}"><h2>${btn}</h2><div class="f">
  <label>Type<select name="type"><option value="expense">Expense</option><option value="income">Income</option></select></label>
  <label>Amount<input name="amount" type="number" step="0.01" min="0.01" required inputmode="decimal"></label>
  <label>Currency<select name="currency">${curOpts()}</select></label>
  <label>Category<select name="category">${opt(S.categories)}</select></label>${extra}
  <label>Note<input name="note" maxlength="80" placeholder="Optional"></label><button class="btn">${btn}</button></div></form>`}
function vTx(){return txForm('/api/tx','Add transaction',`<label>Date<input name="date" type="date" value="${today()}" required></label>`)+
  `<div class="card" style="margin-top:1.25rem"><h2>Recent transactions</h2>${S.transactions.length?`<ul class="list">${S.transactions.map(t=>`<li><div class="m">${esc(t.category)}<small>${esc(t.date)}${t.note?' - '+esc(t.note):''}</small></div>
   <b class="${t.type==='income'?'pos':'neg'}">${t.type==='income'?'+':'-'}${esc(t.currency)} ${t.amount.toFixed(2)}</b><button class="del" data-do="DELETE /api/tx/${t.id}" aria-label="Delete transaction">Delete</button></li>`).join('')}</ul>`:empty('Nothing here yet. Add your first income or expense above.')}</div>`}

function vBud(){const by=S.summary.by_cat;return `<form data-do="PUT /api/budgets" class="card"><h2>Monthly budgets</h2><p class="hint" style="margin-top:-.4rem">Limit per category in ${esc(S.settings.base)}. Leave blank for no limit.</p>
  <div class="budgrid">${S.categories.map(c=>{const sp=by[c]||0,b=S.budgets[c],p=b?sp/b*100:0;
  return `<div class="brow"><div class="bn"><b>${esc(c)}</b><small>${fmt(sp)} spent${b?`, ${p.toFixed(0)}% used`:''}</small></div>
  <div class="bar"><i class="${p>100?'over':p>=80?'gold':''}" style="width:${Math.min(p,100)}%"></i></div>
  <input name="${esc(c)}" type="number" step="0.01" min="0" value="${b||''}" placeholder="No limit" aria-label="Limit for ${esc(c)}"></div>`}).join('')}</div>
  <button class="btn" style="margin-top:1rem">Save budgets</button></form>`}
function vGoals(){return `<form class="card" data-do="POST /api/goals"><h2>New savings goal</h2><div class="f"><label>Name<input name="name" maxlength="40" required placeholder="Emergency fund"></label>
  <label>Target (${esc(S.settings.base)})<input name="target" type="number" step="0.01" min="1" required></label><label>Deadline<input name="deadline" type="date"></label><button class="btn">Add goal</button></div></form>
  <div class="bg" style="margin-top:1.25rem">${S.goals.length?S.goals.map(g=>{const p=Math.min(g.saved/g.target*100,100);return `<div class="card"><h3><span>${esc(g.name)}</span><button class="del" data-do="DELETE /api/goals/${g.id}">Delete</button></h3>
  <div class="bar" style="margin:.6rem 0"><i class="${p>=100?'':'gold'}" style="width:${p}%"></i></div><p class="mute" style="margin:0">${fmt(g.saved)} of ${fmt(g.target)} (${p.toFixed(0)}%)${g.deadline?' by '+esc(g.deadline):''}</p>
  ${p<100?`<form class="mini" data-do="POST /api/goals/${g.id}/add"><input name="amount" type="number" step="0.01" min="0.01" required placeholder="Amount saved"><button class="btn">Add savings</button></form>`:'<p class="pos"><b>Goal reached.</b></p>'}</div>`}).join(''):empty('No goals yet. Set a target above and track your progress.')}</div>`}

function vRec(){return txForm('/api/recurring','Add recurring item',`<label>Day of month<input name="day" type="number" min="1" max="31" value="1" required></label>`)+
  `<div class="card" style="margin-top:1.25rem"><h2>Repeats every month</h2>${S.recurring.length?`<ul class="list">${S.recurring.map(r=>`<li><div class="m">${esc(r.category)}<small>Day ${r.day}${r.note?' - '+esc(r.note):''}</small></div>
  <b class="${r.type==='income'?'pos':'neg'}">${r.type==='income'?'+':'-'}${esc(r.currency)} ${r.amount.toFixed(2)}</b><button class="del" data-do="DELETE /api/recurring/${r.id}">Stop</button></li>`).join('')}</ul>`:empty('Add rent, subscriptions or salary once and they are logged for you each month.')}</div>`}

function vSet(){const s=S.settings;return `<form class="card" data-do="PUT /api/settings"><h2>Currencies</h2><div class="f"><label>Main currency<select name="base">${opt(S.currencies,s.base)}</select></label>
  <label>Second currency<select name="second">${opt(S.currencies,s.second)}</select></label><label>1 second = ? main<input name="rate" type="number" step="any" min="0.0001" value="${s.rate}" required></label><button class="btn">Save</button></div>
  <p class="hint">Totals are shown in your main currency. Update the rate when the exchange rate changes.</p></form>
  <div class="card" style="margin-top:1.25rem"><h2>Categories</h2><div class="chips">${S.categories.map(c=>`<span class="chip">${esc(c)}<button class="del" data-do="DELETE /api/categories/${encodeURIComponent(c)}" aria-label="Remove ${esc(c)}">x</button></span>`).join('')}</div>
  <form class="mini" data-do="POST /api/categories"><input name="name" maxlength="24" required placeholder="New category"><button class="btn">Add</button></form></div>
  <p class="mute" style="margin-top:1.25rem">Signed in as <b>${esc(S.username)}</b></p>`}

const TITLES={dashboard:'Overview',transactions:'Transactions',budgets:'Budgets',goals:'Savings goals',recurring:'Recurring',settings:'Settings'};
function view(){$('#view').innerHTML=({dashboard:vDash,transactions:vTx,budgets:vBud,goals:vGoals,recurring:vRec,settings:vSet})[tab]();$('#title').textContent=TITLES[tab];renderBell();
  document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('on',b.dataset.tab===tab));if(tab==='dashboard')bindWhatIf();
  const t=$('select[name=type]');if(t)t.onchange=()=>{$('select[name=category]').disabled=t.value==='income'}}
async function run(el,ev){ev.preventDefault();const[m,u]=el.dataset.do.split(' ');
  try{const f=el.tagName==='FORM';const j=await api(m,u,f?Object.fromEntries(new FormData(el)):undefined);
   if(u.endsWith('/logout')){location.href='/';return}S=j;view();if(f||m==='DELETE')toast(m==='DELETE'?'Removed':'Saved',true)}catch(e){toast(e.message)}}
document.addEventListener('submit',e=>{if(e.target.dataset.do)run(e.target,e)});
document.addEventListener('click',e=>{const b=e.target.closest('button[data-do]');if(b&&!b.closest('form[data-do]'))run(b,e);
  const n=e.target.closest('nav button');if(n){tab=n.dataset.tab;view();scrollTo(0,0)}});
api('GET','/api/data').then(j=>{S=j;view()}).catch(e=>toast(e.message));

/* theme */
const SUN='<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON='<svg class="i" viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>';
function paintTheme(){$('#theme').innerHTML=document.documentElement.dataset.theme==='dark'?SUN:MOON}
$('#theme').onclick=()=>{const t=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=t;try{localStorage.setItem('theme',t)}catch(e){}paintTheme()};
paintTheme();
/* notifications: every tip is a notification; unread ones count on the badge */
const seenKey=()=>'seen_'+S.username;
const seen=()=>{try{return JSON.parse(localStorage.getItem(seenKey())||'[]')}catch(e){return[]}};
function renderBell(){const sn=seen(),n=S.tips.filter(t=>t.level!=='good'&&!sn.includes(t.text)).length,b=$('#badge');
  b.hidden=!n;b.textContent=n;$('#notes').innerHTML=S.tips.map(t=>`<li class="${t.level}${sn.includes(t.text)?' read':''}">${esc(t.text)}</li>`).join('')}
function closePanel(){$('#panel').hidden=true;$('#bell').setAttribute('aria-expanded','false')}
$('#bell').onclick=e=>{e.stopPropagation();const p=$('#panel');p.hidden=!p.hidden;$('#bell').setAttribute('aria-expanded',String(!p.hidden));
  if(!p.hidden){try{localStorage.setItem(seenKey(),JSON.stringify(S.tips.map(t=>t.text)))}catch(x){}$('#badge').hidden=true}};
document.addEventListener('click',e=>{if(!e.target.closest('#panel'))closePanel()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closePanel()});

/* suggestions drawer and shortcuts */
document.addEventListener('click',e=>{
  if(e.target.closest('[data-open]')){closePanel();openDrawer();return}
  const g=e.target.closest('[data-go]');if(g){tab=g.dataset.go;closeDrawer();closePanel();view();scrollTo(0,0);return}
  if(e.target.closest('#dclose')||e.target.id==='scrim')closeDrawer();
  const p=e.target.closest('#drawer [data-pane]');if(p)setPane(p.dataset.pane)});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDrawer()});

/* currency switch, expandable rows, collapsible sidebar, quick add */
document.addEventListener('click',e=>{
  const c=e.target.closest('[data-vc]');if(c){vc=c.dataset.vc;try{localStorage.setItem('vcur',vc)}catch(x){}view();return}
  if(e.target.closest('#expall')){const k=['inc','exp','goal','rec'];if(k.every(x=>openAcc.has(x)))openAcc.clear();else k.forEach(x=>openAcc.add(x));view()}});
document.addEventListener('toggle',e=>{const k=e.target.dataset&&e.target.dataset.k;if(k){e.target.open?openAcc.add(k):openAcc.delete(k)}},true);
$('#menu').onclick=()=>{const d=document.documentElement,v=d.dataset.nav==='min'?'':'min';d.dataset.nav=v;try{localStorage.setItem('nav',v)}catch(e){}};
$('#add').onclick=()=>{tab='transactions';view();scrollTo(0,0);const a=$('input[name=amount]');if(a)a.focus()};
document.querySelectorAll('nav button').forEach(b=>b.title=b.textContent.trim());
