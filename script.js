'use strict';
const KEY = 'dailyExpenseManagerV1';
const CATS = ['Office Expenses','Purchase','Transport','Food','Loading / Unloading','Labour Payment','Stationery','Electricity','Repair & Maintenance','Other'];
const TITLES = {dashboard:'Dashboard',expense:'Add Expense',money:'Add Money Received',history:'Transaction History',reports:'Reports',export:'Excel Export',settings:'Settings'};
let S = load(), editId = null, view = 'dashboard', rKey = 'today', chart = null;

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const todayIso = () => iso(new Date());
const dmy = s => s ? s.slice(8, 10) + '-' + s.slice(5, 7) + '-' + s.slice(0, 4) : '';
const r2 = n => Math.round(n * 100) / 100;
const fmt = n => (n < 0 ? '-' : '') + '₹' + Math.abs(n).toLocaleString('en-IN', {maximumFractionDigits: 2});
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cls = n => n < 0 ? 'neg' : 'pos';

function load() {
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && Array.isArray(d.tx)) return d; } catch (e) {}
  return {opening: null, tx: [], nextId: 1};
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { toast('Could not save data. Browser storage may be full or blocked.', 'err'); }
}
function toast(msg, type) {
  const t = document.createElement('div'); t.className = 'toast ' + (type || ''); t.textContent = msg;
  $('#toasts').appendChild(t); setTimeout(() => t.remove(), 3500);
}
function ask(msg, okLabel, cb) {
  $('#mMsg').textContent = msg; $('#mOk').textContent = okLabel || 'Confirm'; $('#modal').classList.add('on');
  $('#mOk').onclick = () => { $('#modal').classList.remove('on'); cb(); };
  $('#mNo').onclick = () => $('#modal').classList.remove('on');
}

/* ---------- accounting ---------- */
function ledger() {
  let b = S.opening ? S.opening.amount : 0;
  return [...S.tx].sort((x, y) => x.date < y.date ? -1 : x.date > y.date ? 1 : x.id - y.id)
    .map((t, i) => { b = r2(b + (t.type === 'Received' ? t.amount : -t.amount)); return {...t, sn: i + 1, bal: b}; });
}
function totals(list) {
  const open = S.opening ? S.opening.amount : 0;
  const rec = r2(list.filter(t => t.type === 'Received').reduce((s, t) => s + t.amount, 0));
  const exp = r2(list.filter(t => t.type === 'Expense').reduce((s, t) => s + t.amount, 0));
  const funds = r2(open + rec);
  return {open, rec, funds, exp, remaining: r2(funds - exp), pocket: Math.max(0, r2(exp - funds)), count: list.length};
}

/* ---------- navigation ---------- */
function go(v) {
  view = v;
  $$('section').forEach(s => s.classList.toggle('on', s.id === 'v-' + v));
  $$('#side button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  $('#title').textContent = TITLES[v];
  $('#side').classList.remove('open'); $('#shade').classList.remove('open');
  if (v === 'expense' || v === 'money') resetForm(v === 'expense' ? '#fExp' : '#fMon');
  render();
  window.scrollTo(0, 0);
}
function render() {
  if (view === 'dashboard') renderDash();
  if (view === 'history') renderHist();
  if (view === 'reports') renderReport();
  if (view === 'settings') renderSettings();
}
function setupForm() {
  return '<form class="setup row wrap"><label>Opening balance (₹)<input type="number" name="amt" min="0" step="0.01" required></label>' +
    '<button class="btn">Save opening balance</button></form><p><small>This can be entered only once. Add later company money with Add Money.</small></p>';
}
function renderDash() {
  const T = totals(S.tx);
  $('#setup').innerHTML = S.opening ? '' : '<div class="card"><h3>Set up your account</h3>' + setupForm() + '</div>';
  $('#warn').innerHTML = T.pocket > 0 ? `<div class="alert">You have spent ${fmt(T.pocket)} from your personal pocket.</div>` : '';
  const c = (l, v, k) => `<div class="card"><small>${l}</small><b class="${k || ''}">${fmt(v)}</b></div>`;
  $('#cards').innerHTML = c('Opening Balance', T.open) + c('Total Money Received', T.rec, 'pos') + c('Total Expenses', T.exp, 'neg') +
    c('Remaining Balance', T.remaining, cls(T.remaining)) + c('Personal Pocket Money Used', T.pocket, T.pocket > 0 ? 'neg' : 'pos') +
    `<div class="card"><small>Total Transactions</small><b>${T.count}</b></div>`;
}
function renderSettings() {
  $('#setOpen').innerHTML = '<h3>Opening balance</h3>' + (S.opening
    ? `<p><b>${fmt(S.opening.amount)}</b> (set on ${dmy(S.opening.date)}). It is locked; add more company money as separate Received entries.</p>`
    : setupForm());
}

/* ---------- forms ---------- */
function resetForm(sel) {
  editId = null; const f = $(sel); f.reset(); f.date.value = todayIso();
  f.querySelector('.btn:not(.ghost)').textContent = sel === '#fExp' ? 'Save expense' : 'Save money received';
}
function bindForm(sel, type) {
  $(sel).onsubmit = e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target)); d.amount = r2(parseFloat(d.amount));
    if (!(d.amount > 0) || !d.date) { toast('Enter a valid date and amount', 'err'); return; }
    Object.keys(d).forEach(k => { if (typeof d[k] === 'string') d[k] = d[k].trim(); });
    if (type === 'Received') { d.desc = d.remarks || 'Money received'; d.category = ''; }
    d.type = type;
    if (editId != null) { Object.assign(S.tx.find(t => t.id === editId), d); toast('Transaction updated', 'ok'); const wasEdit = true; editId = null; save(); go('history'); return; }
    S.tx.push({id: S.nextId++, ...d}); save();
    toast(type === 'Expense' ? 'Expense saved and deducted' : 'Money received added', 'ok');
    resetForm(sel); 
  };
}
function editTx(id) {
  const t = S.tx.find(x => x.id === id); if (!t) return;
  const sel = t.type === 'Expense' ? '#fExp' : '#fMon';
  go(t.type === 'Expense' ? 'expense' : 'money');
  const f = $(sel); Object.keys(t).forEach(k => { if (f.elements[k]) f.elements[k].value = t[k]; });
  editId = id; f.querySelector('.btn:not(.ghost)').textContent = 'Update transaction';
}

/* ---------- history ---------- */
function filtered() {
  const q = $('#hq').value.toLowerCase(), f = $('#hf').value, t = $('#ht').value, c = $('#hc').value, ty = $('#hty').value;
  const L = ledger().filter(x => (!q || [x.desc, x.party, x.category, x.bill, x.remarks, x.mode, x.amount].join(' ').toLowerCase().includes(q)) &&
    (!f || x.date >= f) && (!t || x.date <= t) && (!c || x.category === c) && (!ty || x.type === ty));
  return $('#hs').value === 'new' ? L.reverse() : L;
}
function renderHist() {
  const L = filtered();
  if (!L.length) { $('#tbl').innerHTML = '<tr><td class="empty">No transactions found. Add an expense or money received to begin.</td></tr>'; return; }
  $('#tbl').innerHTML = '<tr><th>S.No.</th><th>Date</th><th>Type</th><th>Description</th><th>Category</th><th>Paid To / Received From</th><th class="num">Amount</th><th>Mode</th><th class="num">Running Balance</th><th>Action</th></tr>' +
    L.map(t => `<tr><td>${t.sn}</td><td>${dmy(t.date)}</td><td><span class="tag ${t.type[0]}">${t.type}</span></td><td>${esc(t.desc)}${t.bill ? ' <small>(Bill ' + esc(t.bill) + ')</small>' : ''}</td><td>${esc(t.category) || '-'}</td><td>${esc(t.party)}</td>` +
      `<td class="num ${t.type === 'Received' ? 'pos' : 'neg'}">${t.type === 'Received' ? '+' : '-'}${fmt(t.amount)}</td><td>${esc(t.mode)}</td><td class="num ${cls(t.bal)}">${fmt(t.bal)}</td>` +
      `<td><button class="btn ghost sm" data-edit="${t.id}">Edit</button> <button class="btn red sm" data-del="${t.id}">Delete</button></td></tr>`).join('');
}

/* ---------- reports ---------- */
function range(k) {
  const t = new Date(), d = n => iso(new Date(t.getFullYear(), t.getMonth(), t.getDate() + n));
  if (k === 'today') return [d(0), d(0)];
  if (k === 'yesterday') return [d(-1), d(-1)];
  if (k === 'week') return [d(-((t.getDay() + 6) % 7)), d(0)];
  if (k === 'month') return [iso(new Date(t.getFullYear(), t.getMonth(), 1)), d(0)];
  return [$('#rFrom').value, $('#rTo').value];
}
function renderReport() {
  const [a, b] = range(rKey);
  if (!a || !b || a > b) { $('#rOut').innerHTML = '<div class="card empty">Choose a valid from and to date.</div>'; return; }
  const all = ledger(), L = all.filter(t => t.date >= a && t.date <= b), T = totals(L);
  const upto = all.filter(t => t.date <= b), bal = upto.length ? upto[upto.length - 1].bal : (S.opening ? S.opening.amount : 0);
  const cat = {}; L.filter(t => t.type === 'Expense').forEach(t => cat[t.category] = r2((cat[t.category] || 0) + t.amount));
  const days = {}; L.forEach(t => { const d = days[t.date] = days[t.date] || {r: 0, e: 0}; t.type === 'Received' ? d.r += t.amount : d.e += t.amount; });
  const c = (l, v, k) => `<div class="card"><small>${l}</small><b class="${k}">${fmt(v)}</b></div>`;
  $('#rOut').innerHTML = `<p><b>${dmy(a)}</b> to <b>${dmy(b)}</b></p><div class="cards">${c('Total Received', T.rec, 'pos')}${c('Total Expenses', T.exp, 'neg')}${c('Net for period', r2(T.rec - T.exp), cls(T.rec - T.exp))}${c('Balance at end of period', bal, cls(bal))}</div><br>` +
    `<div class="card"><h3>Category-wise expenses</h3>${T.exp ? '<div class="cw"><canvas id="cv"></canvas></div>' : '<p class="empty">No expenses in this period.</p>'}<div class="tw"><table><tr><th>Category</th><th class="num">Amount</th><th class="num">Share</th></tr>` +
    Object.entries(cat).sort((x, y) => y[1] - x[1]).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${fmt(v)}</td><td class="num">${(v / T.exp * 100).toFixed(1)}%</td></tr>`).join('') + '</table></div></div>' +
    `<div class="card"><h3>Daily report</h3><div class="tw"><table><tr><th>Date</th><th class="num">Received</th><th class="num">Expenses</th><th class="num">Net</th></tr>` +
    Object.keys(days).sort().map(k => `<tr><td>${dmy(k)}</td><td class="num pos">${fmt(r2(days[k].r))}</td><td class="num neg">${fmt(r2(days[k].e))}</td><td class="num ${cls(days[k].r - days[k].e)}">${fmt(r2(days[k].r - days[k].e))}</td></tr>`).join('') + '</table></div></div>';
  if (chart) { chart.destroy(); chart = null; }
  if (T.exp && window.Chart) chart = new Chart($('#cv'), {type: 'doughnut', data: {labels: Object.keys(cat), datasets: [{data: Object.values(cat), backgroundColor: ['#0b2545','#1d5fd1','#14833b','#c62828','#f29f05','#7b4fd1','#12a4b8','#8d99ae','#d1478f','#5c7a29']}]}, options: {plugins: {legend: {position: 'bottom'}}}});
}

/* ---------- Excel ---------- */
function exportXlsx() {
  if (typeof XLSX === 'undefined') { toast('Excel library did not load. Check your internet connection.', 'err'); return; }
  const all = ledger(), list = $('#xf').checked ? filtered().sort((p, q) => p.sn - q.sn) : all;
  const T = totals(list), open = T.open, n = list.length;
  const ser = d => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 864e5 + 25569;
  const TX = "'All Transactions'", SM = "'Expense Summary'";
  const bd = {style: 'thin', color: {rgb: 'BBBBBB'}}, B = {top: bd, bottom: bd, left: bd, right: bd};
  const H = {font: {bold: true, color: {rgb: 'FFFFFF'}}, fill: {fgColor: {rgb: '0B2545'}}, border: B, alignment: {horizontal: 'center'}};
  const INR = '"₹"#,##0.00', COL = '[Color10]"₹"#,##0.00;[Red]-"₹"#,##0.00', DT = 'dd-mm-yyyy';
  const c = (v, s, z, f) => { const o = {v, t: typeof v === 'number' ? 'n' : 's', s: {border: B, ...(s || {})}}; if (z) o.z = z; if (f) o.f = f; return o; };
  const h = a => a.map(x => ({v: x, t: 's', s: H}));
  const fin = (ws, widths, rows) => { ws['!cols'] = widths.map(w => ({wch: w})); return ws; };

  // Sheet 1: summary
  const items = [
    ['Opening Balance', open, null],
    ['Additional Money Received', T.rec, `SUMIF(${TX}!B:B,"Received",${TX}!F:F)`],
    ['Total Company Funds', T.funds, 'Opening_Balance+Additional_Received'],
    ['Total Expenses', T.exp, `SUMIF(${TX}!B:B,"Expense",${TX}!F:F)`],
    ['Remaining Company Balance', T.remaining, 'Total_Company_Funds-Total_Expenses'],
    ['Personal Pocket Money Used', T.pocket, 'MAX(0,Total_Expenses-Total_Company_Funds)']];
  const sRows = [[{v: 'Company Expense Summary', t: 's', s: {font: {bold: true, sz: 14}}}], []]
    .concat(items.map((it, i) => [c(it[0], {font: {bold: true}}), c(it[1], {font: {bold: true}}, i === 4 ? COL : INR, it[2])]));
  sRows.push([], [{v: 'Generated on ' + dmy(todayIso()) + (list === all ? '' : ' (filtered export)'), t: 's'}]);
  const ws1 = fin(XLSX.utils.aoa_to_sheet(sRows), [32, 20]);

  // Sheet 2: transactions
  let run = open;
  const rows2 = [h(['Date', 'Type', 'Description', 'Category', 'Paid To / Received From', 'Amount', 'Payment Mode', 'Running Balance'])];
  list.forEach((t, i) => {
    const r = i + 2; run = r2(run + (t.type === 'Received' ? t.amount : -t.amount));
    const prev = i === 0 ? `${SM}!$B$3` : `H${r - 1}`;
    rows2.push([c(ser(t.date), {alignment: {horizontal: 'center'}}, DT), c(t.type), c(t.desc), c(t.category || '-'), c(t.party),
      c(t.amount, {font: {color: {rgb: t.type === 'Received' ? '14833B' : 'C62828'}}}, INR),
      c(t.mode), c(run, {font: {bold: true}}, COL, `${prev}+IF(B${r}="Received",F${r},-F${r})`)]);
  });
  const ws2 = fin(XLSX.utils.aoa_to_sheet(rows2), [12, 11, 34, 22, 26, 15, 15, 18]);
  ws2['!autofilter'] = {ref: 'A1:H' + (n + 1)};
  ws2['!freeze'] = {xSplit: 0, ySplit: 1, topLeftCell: 'A2', state: 'frozen'};

  // Sheet 3: daily summary
  const dates = [...new Set(list.map(t => t.date))];
  const rows3 = [h(['Date', 'Opening Balance', 'Money Received', 'Total Expenses', 'Closing Balance', 'Personal Pocket Money Used'])];
  let bal = open;
  dates.forEach((d, i) => {
    const r = i + 2, day = list.filter(t => t.date === d);
    const rc = r2(day.filter(t => t.type === 'Received').reduce((s, t) => s + t.amount, 0));
    const ex = r2(day.filter(t => t.type === 'Expense').reduce((s, t) => s + t.amount, 0));
    const op = bal; bal = r2(bal + rc - ex);
    const sum = ty => `SUMIFS(${TX}!$F:$F,${TX}!$A:$A,A${r},${TX}!$B:$B,"${ty}")`;
    rows3.push([c(ser(d), {alignment: {horizontal: 'center'}}, DT), c(op, {}, COL, i === 0 ? `${SM}!$B$3` : `E${r - 1}`),
      c(rc, {font: {color: {rgb: '14833B'}}}, INR, sum('Received')), c(ex, {font: {color: {rgb: 'C62828'}}}, INR, sum('Expense')),
      c(bal, {font: {bold: true}}, COL, `B${r}+C${r}-D${r}`), c(Math.max(0, -bal), {}, INR, `MAX(0,-E${r})`)]);
  });
  const ws3 = fin(XLSX.utils.aoa_to_sheet(rows3), [12, 18, 18, 18, 18, 26]);
  ws3['!autofilter'] = {ref: 'A1:F' + (dates.length + 1)};
  ws3['!freeze'] = {xSplit: 0, ySplit: 1, topLeftCell: 'A2', state: 'frozen'};

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, 'Expense Summary');
  XLSX.utils.book_append_sheet(wb, ws2, 'All Transactions');
  XLSX.utils.book_append_sheet(wb, ws3, 'Daily Summary');
  wb.Workbook = {CalcPr: {fullCalcOnLoad: true}, Names: [
    ['Opening_Balance', 3], ['Additional_Received', 4], ['Total_Company_Funds', 5], ['Total_Expenses', 6], ['Remaining_Balance', 7], ['Pocket_Money_Used', 8]
  ].map(([Name, r]) => ({Name, Ref: `${SM}!$B$${r}`}))};
  try { XLSX.writeFile(wb, 'Expense_Report_' + todayIso() + '.xlsx'); toast('Excel file downloaded', 'ok'); }
  catch (e) { console.error(e); toast('Excel export failed', 'err'); }
}

/* ---------- backup / restore ---------- */
function backup() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], {type: 'application/json'}));
  a.download = 'expense_backup_' + todayIso() + '.json'; a.click(); URL.revokeObjectURL(a.href);
  toast('Backup downloaded', 'ok');
}
function restore(file) {
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const d = JSON.parse(rd.result);
      if (!d || !Array.isArray(d.tx) || d.tx.some(t => !t.date || !(t.amount > 0) || !['Received', 'Expense'].includes(t.type))) throw 0;
      ask('Restore this backup? It replaces all current data (' + d.tx.length + ' transactions in the file).', 'Restore', () => {
        d.nextId = Math.max(d.nextId || 1, ...d.tx.map(t => t.id || 0)) + 1; d.tx.forEach((t, i) => { if (!t.id) t.id = d.nextId + i; });
        S = {opening: d.opening || null, tx: d.tx, nextId: d.nextId + d.tx.length}; save(); toast('Backup restored', 'ok'); go('dashboard');
      });
    } catch (e) { toast('This is not a valid backup file', 'err'); }
  };
  rd.readAsText(file);
}

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.v) go(t.dataset.v);
  else if (t.dataset.edit) editTx(+t.dataset.edit);
  else if (t.dataset.del) { const id = +t.dataset.del; ask('Delete this transaction? All balances will be recalculated.', 'Delete', () => { S.tx = S.tx.filter(x => x.id !== id); save(); toast('Transaction deleted', 'ok'); render(); }); }
  else if (t.dataset.r) { rKey = t.dataset.r; renderReport(); }
  else if (t.hasAttribute('data-cancel')) { editId = null; go('history'); }
});
document.addEventListener('submit', e => {
  if (!e.target.classList.contains('setup')) return;
  e.preventDefault();
  if (S.opening) { toast('Opening balance is already set', 'err'); return; }
  const a = r2(parseFloat(e.target.amt.value));
  if (!(a >= 0)) { toast('Enter a valid amount', 'err'); return; }
  S.opening = {amount: a, date: todayIso()}; save(); toast('Opening balance saved', 'ok'); render();
});
$('#menu').onclick = () => { $('#side').classList.toggle('open'); $('#shade').classList.toggle('open'); };
$('#shade').onclick = () => { $('#side').classList.remove('open'); $('#shade').classList.remove('open'); };
['#hq', '#hf', '#ht', '#hc', '#hty', '#hs'].forEach(s => { $(s).oninput = renderHist; });
$('#hreset').onclick = () => { ['#hq', '#hf', '#ht', '#hc', '#hty'].forEach(s => $(s).value = ''); $('#hs').value = 'new'; renderHist(); };
$('#xBtn').onclick = exportXlsx;
$('#bk').onclick = backup;
$('#rs').onclick = () => $('#rsf').click();
$('#rsf').onchange = e => { if (e.target.files[0]) restore(e.target.files[0]); e.target.value = ''; };
$('#clr').onclick = () => ask('Delete ALL data (opening balance and every transaction)? This cannot be undone.', 'Delete everything', () => {
  S = {opening: null, tx: [], nextId: 1}; save(); toast('All data cleared', 'ok'); go('dashboard');
});

/* ---------- init ---------- */
$('#catSel').innerHTML = CATS.map(c => `<option>${esc(c)}</option>`).join('');
$('#hc').innerHTML = '<option value="">All categories</option>' + CATS.map(c => `<option>${esc(c)}</option>`).join('');
$('#today').textContent = dmy(todayIso());
$('#rFrom').value = $('#rTo').value = todayIso();
bindForm('#fExp', 'Expense'); bindForm('#fMon', 'Received');
go('dashboard');
