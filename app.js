/* FinFlow — Direct Open App with Supabase (No Auth) */

// ============================================
// CONSTANTS
// ============================================
const CATEGORY_EMOJIS = { 'Food & Dining':'🍔','Transportation':'🚗','Shopping':'🛍️','Entertainment':'🎬','Bills & Utilities':'💡','Health':'❤️','Education':'📚','Travel':'✈️','Salary':'💼','Freelance':'💻','Investment':'📈','Other':'📦' };
const CATEGORY_COLORS = { 'Food & Dining':'#f97316','Transportation':'#3b82f6','Shopping':'#a855f7','Entertainment':'#ec4899','Bills & Utilities':'#f59e0b','Health':'#ef4444','Education':'#6366f1','Travel':'#06b6d4','Salary':'#10b981','Freelance':'#8b5cf6','Investment':'#14b8a6','Other':'#64748b' };
const CURRENCY_SYMBOLS = { USD:'$', EUR:'€', GBP:'£', INR:'₹', JPY:'¥' };

// ============================================
// STATE
// ============================================
let state = {
  transactions: [],
  budgets: [],
  settings: { name:'User', currency:'INR', darkMode:true, web3formsKey:'', alertEmail:'', budgetAlerts:false }
};

// ============================================
// SUPABASE DATA LAYER (no auth)
// ============================================
async function loadState() {
  try {
    // Load transactions
    const { data: txns, error: txnErr } = await supabase.from('transactions').select('*').order('date', { ascending: false });
    if (txnErr) { console.error('Txn load error:', txnErr); showToast('DB Error: ' + txnErr.message, 'error'); }
    state.transactions = (txns || []).map(t => ({
      id: t.id, type: t.type, amount: parseFloat(t.amount), description: t.description,
      category: t.category, date: t.date, notes: t.notes || '', createdAt: new Date(t.created_at).getTime()
    }));
    // Load budgets
    const { data: bdgs, error: bdgErr } = await supabase.from('budgets').select('*');
    if (bdgErr) { console.error('Budget load error:', bdgErr); showToast('DB Error: ' + bdgErr.message, 'error'); }
    state.budgets = (bdgs || []).map(b => ({ id: b.id, category: b.category, limit: parseFloat(b.budget_limit) }));
    // Load settings
    const { data: sett, error: settErr } = await supabase.from('app_settings').select('*').eq('id', 1).maybeSingle();
    if (settErr) { console.error('Settings load error:', settErr); showToast('DB Error: ' + settErr.message, 'error'); }
    if (sett) {
      state.settings = {
        name: sett.name || 'User', currency: sett.currency || 'INR', darkMode: sett.dark_mode ?? true,
        web3formsKey: sett.web3forms_key || '', alertEmail: sett.alert_email || '', budgetAlerts: sett.budget_alerts ?? false
      };
    }
    console.log('loadState done:', state.transactions.length, 'txns,', state.budgets.length, 'budgets');
  } catch (err) {
    console.error('loadState EXCEPTION:', err);
    showToast('Failed to load data: ' + err.message, 'error');
  }
}

async function saveSettingsDB() {
  await supabase.from('app_settings').upsert({
    id: 1, name: state.settings.name, currency: state.settings.currency,
    dark_mode: state.settings.darkMode, web3forms_key: state.settings.web3formsKey,
    alert_email: state.settings.alertEmail, budget_alerts: state.settings.budgetAlerts
  });
}

function getCurrencySymbol() { return CURRENCY_SYMBOLS[state.settings.currency] || '₹'; }
function formatCurrency(amount) { return `${getCurrencySymbol()}${Math.abs(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function formatDate(ds) { return new Date(ds).toLocaleDateString('en-IN', { month:'short', day:'numeric', year:'numeric' }); }

// ============================================
// NAVIGATION & MODALS
// ============================================
function switchSection(name) {
  document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const sec = document.getElementById(`section-${name}`);
  const nav = document.querySelector(`.nav-item[data-section="${name}"]`);
  if(sec) sec.classList.add('active');
  if(nav) nav.classList.add('active');
  document.getElementById('sidebar').classList.remove('open');
  refreshAll();
}
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function showToast(message, type='success') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span class="toast-message">${message}</span>`;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ============================================
// TRANSACTION CRUD — Supabase
// ============================================
async function handleAddTransaction(e) {
  e.preventDefault();
  const type = document.getElementById('txn-type').value;
  const amount = parseFloat(document.getElementById('txn-amount').value);
  const description = document.getElementById('txn-description').value.trim();
  const category = document.getElementById('txn-category').value;
  const date = document.getElementById('txn-date').value;
  const notes = (document.getElementById('txn-notes').value || '').trim();
  if(!amount||!description||!category||!date){showToast('Please fill in all required fields.','error');return;}

  const { data, error } = await supabase.from('transactions').insert({ type, amount, description, category, date, notes }).select().single();
  if (error) { showToast('Failed to add: ' + error.message, 'error'); return; }

  const newTxn = { id: data.id, type, amount, description, category, date, notes, createdAt: Date.now() };
  state.transactions.unshift(newTxn);
  document.getElementById('transaction-form').reset();
  document.getElementById('txn-date').value = new Date().toISOString().split('T')[0];
  closeModal('add-transaction-modal');
  showToast('Transaction added successfully!');
  refreshAll();
  if (type === 'expense') { checkBudgetLimitsAndAlert(category, newTxn); }
}

async function deleteTransaction(id) {
  await supabase.from('transactions').delete().eq('id', id);
  state.transactions = state.transactions.filter(t => t.id !== id);
  showToast('Transaction deleted.', 'info');
  refreshAll();
}

// ============================================
// BUDGET CRUD — Supabase
// ============================================
async function handleAddBudget(e) {
  e.preventDefault();
  const category = document.getElementById('budget-category').value;
  const limit = parseFloat(document.getElementById('budget-limit').value);
  if(!category||!limit){showToast('Please fill in all fields.','error');return;}

  const existing = state.budgets.find(b => b.category === category);
  if (existing) {
    await supabase.from('budgets').update({ budget_limit: limit }).eq('id', existing.id);
    existing.limit = limit;
    showToast(`Budget for ${category} updated!`);
  } else {
    const { data, error } = await supabase.from('budgets').insert({ category, budget_limit: limit }).select().single();
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    state.budgets.push({ id: data.id, category, limit });
    showToast(`Budget for ${category} created!`);
  }
  document.getElementById('budget-form').reset();
  closeModal('add-budget-modal');
  refreshAll();
}

async function deleteBudget(id) {
  await supabase.from('budgets').delete().eq('id', id);
  state.budgets = state.budgets.filter(b => b.id !== id);
  showToast('Budget removed.', 'info');
  refreshAll();
}

// ============================================
// SETTINGS
// ============================================
async function saveSettings() {
  state.settings.name = document.getElementById('settings-name').value.trim() || 'User';
  state.settings.currency = document.getElementById('settings-currency').value;
  await saveSettingsDB();
  showToast('Settings saved!');
  updateSidebarUser();
  refreshAll();
}

function applySettings() {
  document.getElementById('settings-name').value = state.settings.name;
  document.getElementById('settings-email').value = '';
  document.getElementById('settings-currency').value = state.settings.currency;
  document.getElementById('toggle-dark-mode').checked = state.settings.darkMode;
  document.getElementById('toggle-notifications').checked = true;
  document.getElementById('toggle-weekly-report').checked = false;
  document.getElementById('settings-web3forms-key').value = state.settings.web3formsKey || '';
  document.getElementById('settings-alert-email').value = state.settings.alertEmail || '';
  document.getElementById('toggle-budget-alerts').checked = !!state.settings.budgetAlerts;
  document.body.classList.toggle('light-mode', !state.settings.darkMode);
  updateSidebarUser();
}

function updateSidebarUser() {
  const name = state.settings.name || 'User';
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2) || 'U';
  document.getElementById('sidebar-avatar').textContent = initials;
  document.getElementById('sidebar-user-name').textContent = name;
  const greeting = document.getElementById('dashboard-greeting');
  if(greeting) greeting.textContent = `Welcome back, ${name.split(' ')[0]}! Here's your financial overview.`;
}

function exportData() {
  const blob = new Blob([JSON.stringify({transactions:state.transactions,budgets:state.budgets,settings:state.settings,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `finflow_export_${new Date().toISOString().split('T')[0]}.json`; a.click();
  URL.revokeObjectURL(a.href); showToast('Data exported!');
}

async function clearAllData() {
  if(!confirm('⚠️ Delete all your data? This cannot be undone.')) return;
  await supabase.from('transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('budgets').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  state.transactions = []; state.budgets = [];
  showToast('All data cleared.', 'info');
  refreshAll();
}

async function saveAlertSettings() {
  const key = document.getElementById('settings-web3forms-key').value.trim();
  const email = document.getElementById('settings-alert-email').value.trim();
  const enabled = document.getElementById('toggle-budget-alerts').checked;
  if (enabled && !key) { showToast('Please enter your Web3Forms access key.', 'error'); return; }
  if (enabled && !email) { showToast('Please enter an alert email address.', 'error'); return; }
  state.settings.web3formsKey = key;
  state.settings.alertEmail = email;
  state.settings.budgetAlerts = enabled;
  await saveSettingsDB();
  showToast(enabled ? '📧 Budget email alerts enabled!' : 'Email alerts saved (currently disabled).');
}

function handleChangePassword() { showToast('No login required — app works directly!', 'info'); }
function switchToUser() { closeModal('switch-user-modal'); }
function handleLogin(e) { e.preventDefault(); }
function handleRegister(e) { e.preventDefault(); }
function handleLogout() {}

// ============================================
// COMPUTATIONS
// ============================================
function getCurrentMonthTransactions() {
  const now=new Date(), m=now.getMonth(), y=now.getFullYear();
  return state.transactions.filter(t=>{const d=new Date(t.date);return d.getMonth()===m&&d.getFullYear()===y;});
}
function computeSummary() {
  const txns=getCurrentMonthTransactions();
  const totalIncome=txns.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const totalExpenses=txns.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  return {totalIncome,totalExpenses,balance:totalIncome-totalExpenses,savings:totalIncome>0?totalIncome-totalExpenses:0};
}
function computeCategoryExpenses() {
  const txns=getCurrentMonthTransactions().filter(t=>t.type==='expense');
  const m={};txns.forEach(t=>{m[t.category]=(m[t.category]||0)+t.amount;});
  return Object.entries(m).map(([category,amount])=>({category,amount})).sort((a,b)=>b.amount-a.amount);
}

// ============================================
// RENDER FUNCTIONS
// ============================================
function renderSummaryCards() {
  const {totalIncome,totalExpenses,balance,savings}=computeSummary();
  document.getElementById('total-balance').textContent=formatCurrency(balance);
  document.getElementById('total-income').textContent=formatCurrency(totalIncome);
  document.getElementById('total-expenses').textContent=formatCurrency(totalExpenses);
  document.getElementById('total-savings').textContent=formatCurrency(savings);
}

function renderTransactionItem(txn) {
  const emoji=CATEGORY_EMOJIS[txn.category]||'📦', sign=txn.type==='income'?'+':'-';
  return `<div class="transaction-item" data-id="${txn.id}">
    <div class="txn-icon ${txn.type}">${emoji}</div>
    <div class="txn-details"><div class="txn-description">${txn.description}</div><div class="txn-meta"><span class="txn-category-badge">${txn.category}</span><span>${formatDate(txn.date)}</span></div></div>
    <span class="txn-amount ${txn.type}">${sign}${formatCurrency(txn.amount)}</span>
    <button class="txn-delete-btn" onclick="deleteTransaction('${txn.id}')" aria-label="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
  </div>`;
}

function renderRecentTransactions() {
  const list=document.getElementById('recent-transactions-list');
  const sorted=[...state.transactions].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,5);
  list.innerHTML = sorted.length===0 ? '<div class="empty-state"><p>No transactions yet. Add your first!</p></div>' : sorted.map(renderTransactionItem).join('');
}

function renderAllTransactions() {
  const list=document.getElementById('all-transactions-list');
  let txns=[...state.transactions];
  const tf=document.getElementById('filter-type').value, cf=document.getElementById('filter-category').value;
  const sf=document.getElementById('filter-sort').value, sq=document.getElementById('filter-search').value.toLowerCase().trim();
  if(tf!=='all') txns=txns.filter(t=>t.type===tf);
  if(cf!=='all') txns=txns.filter(t=>t.category===cf);
  if(sq) txns=txns.filter(t=>t.description.toLowerCase().includes(sq)||t.category.toLowerCase().includes(sq)||(t.notes||'').toLowerCase().includes(sq));
  switch(sf){case 'date-desc':txns.sort((a,b)=>new Date(b.date)-new Date(a.date));break;case 'date-asc':txns.sort((a,b)=>new Date(a.date)-new Date(b.date));break;case 'amount-desc':txns.sort((a,b)=>b.amount-a.amount);break;case 'amount-asc':txns.sort((a,b)=>a.amount-b.amount);break;}
  list.innerHTML = txns.length===0 ? '<div class="empty-state"><p>No transactions found.</p></div>' : txns.map(renderTransactionItem).join('');
}

function populateFilterCategories() {
  const sel=document.getElementById('filter-category');
  const cats=[...new Set(state.transactions.map(t=>t.category))];
  sel.innerHTML='<option value="all">All Categories</option>'+cats.map(c=>`<option value="${c}">${CATEGORY_EMOJIS[c]||'📦'} ${c}</option>`).join('');
}

function renderBudgets() {
  const grid=document.getElementById('budgets-grid');
  const catExp=computeCategoryExpenses();
  if(state.budgets.length===0){grid.innerHTML='<div class="card empty-state" style="grid-column:1/-1;"><p>No budgets set. Start by adding one!</p></div>';return;}
  grid.innerHTML=state.budgets.map(b=>{
    const spent=catExp.find(c=>c.category===b.category)?.amount||0;
    const pct=Math.min((spent/b.limit)*100,100);
    const cls=pct>=90?'danger':pct>=70?'warning':'';
    return `<div class="card budget-card"><div class="budget-header"><div class="budget-category"><span class="budget-emoji">${CATEGORY_EMOJIS[b.category]||'📦'}</span><span class="budget-cat-name">${b.category}</span></div><button class="budget-delete-btn" onclick="deleteBudget('${b.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div><div class="budget-amounts"><span class="budget-spent">${formatCurrency(spent)} spent</span><span class="budget-limit">of ${formatCurrency(b.limit)}</span></div><div class="budget-progress-bar"><div class="budget-progress-fill ${cls}" style="width:${pct}%"></div></div><span class="budget-percentage">${pct.toFixed(1)}% used</span></div>`;
  }).join('');
}

// ============================================
// CANVAS CHARTS
// ============================================
function drawSpendingChart() {
  const canvas=document.getElementById('spending-chart');if(!canvas)return;
  const ctx=canvas.getContext('2d'),dpr=window.devicePixelRatio||1;
  const rect=canvas.parentElement.getBoundingClientRect();const w=rect.width-48,h=260;
  canvas.width=w*dpr;canvas.height=h*dpr;canvas.style.width=w+'px';canvas.style.height=h+'px';ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);
  const pad={top:20,right:20,bottom:40,left:60},cW=w-pad.left-pad.right,cH=h-pad.top-pad.bottom;
  const days=[],amounts=[];
  for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const ds=d.toISOString().split('T')[0];days.push(d.toLocaleDateString('en-IN',{weekday:'short'}));amounts.push(state.transactions.filter(t=>t.type==='expense'&&t.date===ds).reduce((s,t)=>s+t.amount,0));}
  const maxV=Math.max(...amounts,1)*1.2;
  ctx.strokeStyle='rgba(255,255,255,0.04)';ctx.lineWidth=1;
  for(let i=0;i<=4;i++){const y=pad.top+(cH/4)*i;ctx.beginPath();ctx.moveTo(pad.left,y);ctx.lineTo(w-pad.right,y);ctx.stroke();ctx.fillStyle='rgba(255,255,255,0.3)';ctx.font='11px Inter';ctx.textAlign='right';ctx.fillText(getCurrencySymbol()+Math.round(maxV-(maxV/4)*i),pad.left-8,y+4);}
  const pts=amounts.map((v,i)=>({x:pad.left+(cW/(amounts.length-1))*i,y:pad.top+cH-(v/maxV)*cH}));
  const grad=ctx.createLinearGradient(0,pad.top,0,h-pad.bottom);grad.addColorStop(0,'rgba(99,102,241,0.2)');grad.addColorStop(1,'rgba(99,102,241,0)');
  ctx.beginPath();ctx.moveTo(pts[0].x,h-pad.bottom);pts.forEach((p,i)=>{if(i===0)ctx.lineTo(p.x,p.y);else{const prev=pts[i-1],cpx=(prev.x+p.x)/2;ctx.bezierCurveTo(cpx,prev.y,cpx,p.y,p.x,p.y);}});ctx.lineTo(pts[pts.length-1].x,h-pad.bottom);ctx.closePath();ctx.fillStyle=grad;ctx.fill();
  const lg=ctx.createLinearGradient(pad.left,0,w-pad.right,0);lg.addColorStop(0,'#6366f1');lg.addColorStop(1,'#a855f7');
  ctx.beginPath();pts.forEach((p,i)=>{if(i===0)ctx.moveTo(p.x,p.y);else{const prev=pts[i-1],cpx=(prev.x+p.x)/2;ctx.bezierCurveTo(cpx,prev.y,cpx,p.y,p.x,p.y);}});ctx.strokeStyle=lg;ctx.lineWidth=2.5;ctx.stroke();
  pts.forEach(p=>{ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fillStyle='#6366f1';ctx.fill();ctx.beginPath();ctx.arc(p.x,p.y,2,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();});
  days.forEach((l,i)=>{ctx.fillStyle='rgba(255,255,255,0.3)';ctx.font='11px Inter';ctx.textAlign='center';ctx.fillText(l,pad.left+(cW/(days.length-1))*i,h-pad.bottom+24);});
}

function drawCategoryChart() {
  const canvas=document.getElementById('category-chart');if(!canvas)return;
  const ctx=canvas.getContext('2d'),dpr=window.devicePixelRatio||1,size=220;
  canvas.width=size*dpr;canvas.height=size*dpr;canvas.style.width=size+'px';canvas.style.height=size+'px';ctx.scale(dpr,dpr);ctx.clearRect(0,0,size,size);
  const catExp=computeCategoryExpenses(),total=catExp.reduce((s,c)=>s+c.amount,0);const cx=size/2,cy=size/2;
  if(total===0){ctx.fillStyle='rgba(255,255,255,0.06)';ctx.beginPath();ctx.arc(cx,cy,80,0,Math.PI*2);ctx.fill();ctx.fillStyle='rgba(255,255,255,0.2)';ctx.font='13px Inter';ctx.textAlign='center';ctx.fillText('No expenses',cx,cy+4);return;}
  let sa=-Math.PI/2;catExp.forEach(cat=>{const sl=(cat.amount/total)*Math.PI*2;ctx.beginPath();ctx.arc(cx,cy,80,sa,sa+sl);ctx.arc(cx,cy,50,sa+sl,sa,true);ctx.closePath();ctx.fillStyle=CATEGORY_COLORS[cat.category]||'#64748b';ctx.fill();sa+=sl;});
  ctx.fillStyle='rgba(255,255,255,0.8)';ctx.font='bold 16px Inter';ctx.textAlign='center';ctx.fillText(formatCurrency(total),cx,cy-2);ctx.fillStyle='rgba(255,255,255,0.35)';ctx.font='11px Inter';ctx.fillText('Total',cx,cy+16);
  document.getElementById('category-legend').innerHTML=catExp.map(c=>`<div class="legend-item"><span class="legend-color" style="background:${CATEGORY_COLORS[c.category]||'#64748b'}"></span><span>${c.category}</span></div>`).join('');
}

function roundedRect(ctx,x,y,w,h,r){if(h<=0){ctx.beginPath();return;}r=Math.min(r,h/2,w/2);ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h);ctx.lineTo(x,y+h);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();}

function drawMonthlyTrendChart() {
  const canvas=document.getElementById('monthly-trend-chart');if(!canvas)return;
  const ctx=canvas.getContext('2d'),dpr=window.devicePixelRatio||1;
  const rect=canvas.parentElement.getBoundingClientRect(),w=rect.width-48,h=280;
  canvas.width=w*dpr;canvas.height=h*dpr;canvas.style.width=w+'px';canvas.style.height=h+'px';ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);
  const pad={top:20,right:20,bottom:40,left:60},cW=w-pad.left-pad.right,cH=h-pad.top-pad.bottom;
  const months=[],incD=[],expD=[];
  for(let i=5;i>=0;i--){const d=new Date();d.setMonth(d.getMonth()-i);const m=d.getMonth(),y=d.getFullYear();months.push(d.toLocaleDateString('en-IN',{month:'short'}));const mt=state.transactions.filter(t=>{const td=new Date(t.date);return td.getMonth()===m&&td.getFullYear()===y;});incD.push(mt.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0));expD.push(mt.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0));}
  const maxV=Math.max(...incD,...expD,1)*1.2,bw=cW/months.length*0.3,gw=cW/months.length;
  ctx.strokeStyle='rgba(255,255,255,0.04)';ctx.lineWidth=1;
  for(let i=0;i<=4;i++){const y=pad.top+(cH/4)*i;ctx.beginPath();ctx.moveTo(pad.left,y);ctx.lineTo(w-pad.right,y);ctx.stroke();ctx.fillStyle='rgba(255,255,255,0.3)';ctx.font='11px Inter';ctx.textAlign='right';ctx.fillText(getCurrencySymbol()+Math.round(maxV-(maxV/4)*i),pad.left-8,y+4);}
  months.forEach((mo,i)=>{const gx=pad.left+gw*i+gw/2;const ih=(incD[i]/maxV)*cH;const ig=ctx.createLinearGradient(0,pad.top+cH-ih,0,pad.top+cH);ig.addColorStop(0,'#10b981');ig.addColorStop(1,'rgba(16,185,129,0.3)');roundedRect(ctx,gx-bw-2,pad.top+cH-ih,bw,ih,4);ctx.fillStyle=ig;ctx.fill();const eh=(expD[i]/maxV)*cH;const eg=ctx.createLinearGradient(0,pad.top+cH-eh,0,pad.top+cH);eg.addColorStop(0,'#ef4444');eg.addColorStop(1,'rgba(239,68,68,0.3)');roundedRect(ctx,gx+2,pad.top+cH-eh,bw,eh,4);ctx.fillStyle=eg;ctx.fill();ctx.fillStyle='rgba(255,255,255,0.3)';ctx.font='11px Inter';ctx.textAlign='center';ctx.fillText(mo,gx,h-pad.bottom+24);});
}

function drawIncomeExpenseChart() {
  const canvas=document.getElementById('income-expense-chart');if(!canvas)return;
  const ctx=canvas.getContext('2d'),dpr=window.devicePixelRatio||1;
  const rect=canvas.parentElement.getBoundingClientRect(),w=rect.width-48,h=280;
  canvas.width=w*dpr;canvas.height=h*dpr;canvas.style.width=w+'px';canvas.style.height=h+'px';ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);
  const pad={top:20,right:20,bottom:40,left:60},cW=w-pad.left-pad.right,cH=h-pad.top-pad.bottom;
  const months=[],netD=[];
  for(let i=5;i>=0;i--){const d=new Date();d.setMonth(d.getMonth()-i);const m=d.getMonth(),y=d.getFullYear();months.push(d.toLocaleDateString('en-IN',{month:'short'}));const mt=state.transactions.filter(t=>{const td=new Date(t.date);return td.getMonth()===m&&td.getFullYear()===y;});netD.push(mt.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0)-mt.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0));}
  const maxV=Math.max(...netD.map(Math.abs),1)*1.3;
  ctx.strokeStyle='rgba(255,255,255,0.04)';ctx.lineWidth=1;for(let i=0;i<=4;i++){const y=pad.top+(cH/4)*i;ctx.beginPath();ctx.moveTo(pad.left,y);ctx.lineTo(w-pad.right,y);ctx.stroke();}
  ctx.strokeStyle='rgba(255,255,255,0.1)';ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(pad.left,pad.top+cH/2);ctx.lineTo(w-pad.right,pad.top+cH/2);ctx.stroke();ctx.setLineDash([]);
  const pts=netD.map((v,i)=>({x:pad.left+(cW/(netD.length-1))*i,y:pad.top+cH/2-(v/maxV)*(cH/2)}));
  const ag=ctx.createLinearGradient(0,pad.top,0,pad.top+cH);ag.addColorStop(0,'rgba(16,185,129,0.15)');ag.addColorStop(0.5,'rgba(16,185,129,0)');ag.addColorStop(0.5,'rgba(239,68,68,0)');ag.addColorStop(1,'rgba(239,68,68,0.15)');
  ctx.beginPath();ctx.moveTo(pts[0].x,pad.top+cH/2);pts.forEach((p,i)=>{if(i===0)ctx.lineTo(p.x,p.y);else{const prev=pts[i-1],cpx=(prev.x+p.x)/2;ctx.bezierCurveTo(cpx,prev.y,cpx,p.y,p.x,p.y);}});ctx.lineTo(pts[pts.length-1].x,pad.top+cH/2);ctx.closePath();ctx.fillStyle=ag;ctx.fill();
  ctx.beginPath();pts.forEach((p,i)=>{if(i===0)ctx.moveTo(p.x,p.y);else{const prev=pts[i-1],cpx=(prev.x+p.x)/2;ctx.bezierCurveTo(cpx,prev.y,cpx,p.y,p.x,p.y);}});const lg2=ctx.createLinearGradient(pad.left,0,w-pad.right,0);lg2.addColorStop(0,'#10b981');lg2.addColorStop(1,'#6366f1');ctx.strokeStyle=lg2;ctx.lineWidth=2.5;ctx.stroke();
  pts.forEach(p=>{ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fillStyle=p.y<pad.top+cH/2?'#10b981':'#ef4444';ctx.fill();ctx.beginPath();ctx.arc(p.x,p.y,2,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();});
  months.forEach((l,i)=>{ctx.fillStyle='rgba(255,255,255,0.3)';ctx.font='11px Inter';ctx.textAlign='center';ctx.fillText(l,pad.left+(cW/(months.length-1))*i,h-pad.bottom+24);});
}

function renderTopCategories() {
  const list=document.getElementById('top-categories-list'),catExp=computeCategoryExpenses().slice(0,6),mx=catExp.length>0?catExp[0].amount:1;
  if(catExp.length===0){list.innerHTML='<div class="empty-state"><p>No expense data yet.</p></div>';return;}
  list.innerHTML=catExp.map((c,i)=>`<div class="top-category-item"><span class="top-cat-rank">${i+1}</span><div class="top-cat-info"><div class="top-cat-name">${CATEGORY_EMOJIS[c.category]||'📦'} ${c.category}</div><div class="top-cat-bar"><div class="top-cat-bar-fill" style="width:${(c.amount/mx)*100}%;background:${CATEGORY_COLORS[c.category]||'#64748b'};"></div></div></div><span class="top-cat-amount">${formatCurrency(c.amount)}</span></div>`).join('');
}

function renderSavingsRate() {
  const {totalIncome,savings}=computeSummary();
  const rate=totalIncome>0?(savings/totalIncome)*100:0,cr=Math.max(0,Math.min(rate,100));
  document.getElementById('savings-ring-value').textContent=`${Math.round(cr)}%`;
  const circle=document.getElementById('savings-ring-progress'),circ=2*Math.PI*52;
  circle.style.strokeDashoffset=circ-(cr/100)*circ;
  circle.style.transition='stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1)';
}

// ============================================
// WEB3FORMS — BUDGET ALERT EMAIL
// ============================================
function checkBudgetLimitsAndAlert(category, newTxn) {
  if (!state.settings.budgetAlerts || !state.settings.web3formsKey || !state.settings.alertEmail) return;
  const budget = state.budgets.find(b => b.category === category);
  if (!budget) return;
  const catData = computeCategoryExpenses().find(c => c.category === category);
  const totalSpent = catData ? catData.amount : 0;
  if (totalSpent > budget.limit) {
    const overBy = totalSpent - budget.limit;
    const pct = ((totalSpent / budget.limit) * 100).toFixed(1);
    sendBudgetAlertEmail(category, budget.limit, totalSpent, overBy, pct, newTxn);
  }
}

async function sendBudgetAlertEmail(category, limit, spent, overBy, pct, txn) {
  const sym = getCurrencySymbol();
  const f = (v) => sym + v.toLocaleString('en-IN', {minimumFractionDigits:2});
  const msg = `⚠️ BUDGET LIMIT EXCEEDED\n\nYour "${category}" spending exceeded the budget!\n\n${CATEGORY_EMOJIS[category]||'📦'} Category: ${category}\n💰 Limit: ${f(limit)}\n🔴 Spent: ${f(spent)}\n📈 Over by: ${f(overBy)} (${pct}%)\n\n💳 Latest: ${txn.description} — ${f(txn.amount)} on ${formatDate(txn.date)}\n\n— FinFlow`;
  try {
    const res = await fetch('https://api.web3forms.com/submit', {
      method:'POST', headers:{'Content-Type':'application/json','Accept':'application/json'},
      body: JSON.stringify({ access_key:state.settings.web3formsKey, subject:`⚠️ Budget Alert: ${category} exceeded! (${pct}%)`, from_name:'FinFlow', to:state.settings.alertEmail, message:msg })
    });
    const r = await res.json();
    if(r.success) showToast(`📧 Alert sent for ${category}!`,'info');
    else showToast(`Alert failed: ${r.message}`,'error');
  } catch(err) { showToast('Failed to send alert.','error'); }
}

async function sendTestAlert() {
  const key=document.getElementById('settings-web3forms-key').value.trim();
  const email=document.getElementById('settings-alert-email').value.trim();
  if(!key){showToast('Enter your Web3Forms key first.','error');return;}
  if(!email){showToast('Enter alert email first.','error');return;}
  showToast('Sending test…','info');
  try {
    const res=await fetch('https://api.web3forms.com/submit',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({access_key:key,subject:'✅ FinFlow Test Alert — Working!',from_name:'FinFlow',to:email,message:'Hello! Your FinFlow email alerts are working.\n\n— FinFlow'})});
    const r=await res.json();
    if(r.success) showToast('✅ Test email sent!','success');
    else showToast(`Failed: ${r.message}`,'error');
  } catch(err) { showToast('Failed to send.','error'); }
}

// ============================================
// REFRESH ALL
// ============================================
function refreshAll() {
  renderSummaryCards();renderRecentTransactions();renderAllTransactions();populateFilterCategories();
  renderBudgets();drawSpendingChart();drawCategoryChart();drawMonthlyTrendChart();drawIncomeExpenseChart();
  renderTopCategories();renderSavingsRate();
}

// ============================================
// INIT — App opens directly, no login
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
  // Hide auth screen, show app directly
  const authScreen = document.getElementById('auth-screen');
  const appWrapper = document.getElementById('app-wrapper');
  if (authScreen) authScreen.classList.add('hidden');
  if (appWrapper) appWrapper.classList.remove('hidden');

  // Load data from Supabase
  await loadState();
  applySettings();
  document.getElementById('txn-date').value = new Date().toISOString().split('T')[0];

  // Nav clicks
  document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => switchSection(btn.dataset.section)));
  // Mobile menu
  document.getElementById('menu-toggle').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
  document.addEventListener('click', e => {
    const sb=document.getElementById('sidebar'),tg=document.getElementById('menu-toggle');
    if(window.innerWidth<=768&&sb.classList.contains('open')&&!sb.contains(e.target)&&!tg.contains(e.target)) sb.classList.remove('open');
  });
  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(o => o.addEventListener('click', e => { if(e.target===o) o.classList.remove('open'); }));
  // Period selector
  document.querySelectorAll('.period-btn').forEach(b => b.addEventListener('click', () => { document.querySelectorAll('.period-btn').forEach(x=>x.classList.remove('active'));b.classList.add('active');drawSpendingChart(); }));
  // Filters
  ['filter-type','filter-category','filter-sort'].forEach(id => document.getElementById(id).addEventListener('change', renderAllTransactions));
  document.getElementById('filter-search').addEventListener('input', renderAllTransactions);
  // Settings toggles
  document.getElementById('toggle-dark-mode').addEventListener('change', e => { state.settings.darkMode=e.target.checked; saveSettingsDB(); applySettings(); });
  document.getElementById('toggle-notifications').addEventListener('change', () => {});
  document.getElementById('toggle-weekly-report').addEventListener('change', () => {});
  document.getElementById('toggle-budget-alerts').addEventListener('change', e => { state.settings.budgetAlerts=e.target.checked; });
  // Resize
  let rt;window.addEventListener('resize',()=>{clearTimeout(rt);rt=setTimeout(()=>{drawSpendingChart();drawCategoryChart();drawMonthlyTrendChart();drawIncomeExpenseChart();},200);});

  // Render everything
  refreshAll();
});
