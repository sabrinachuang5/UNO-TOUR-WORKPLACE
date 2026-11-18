const KEY = "uno-tour-op-v1";
const $ = (selector, root = document) => root.querySelector(selector);

// 使用台灣本地日期，避免 UTC 造成日期差一天。
function localISO(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
const today = () => localISO();
function addDays(date, amount) {
  if (!date) return "";
  const [y, m, d] = date.split("-").map(Number);
  const result = new Date(y, m - 1, d);
  result.setDate(result.getDate() + amount);
  return localISO(result);
}
function fmt(date) {
  if (!date) return "—";
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("zh-TW", { month: "2-digit", day: "2-digit" });
}
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

function loadDB() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
    return {
      groups: Array.isArray(saved.groups) ? saved.groups.map(item => ({ ...item, id: item.id || uid(), deadlineDone: item.deadlineDone && typeof item.deadlineDone === "object" ? item.deadlineDone : {} })) : [],
      cards: Array.isArray(saved.cards) ? saved.cards.map(item => ({ ...item, id: item.id || uid() })) : [],
      remits: Array.isArray(saved.remits) ? saved.remits.map(item => ({ ...item, id: item.id || uid() })) : [],
      wallets: Array.isArray(saved.wallets) ? saved.wallets.map(item => ({ ...item, id: item.id || uid() })) : [],
      fxRates: saved.fxRates && typeof saved.fxRates === "object" ? saved.fxRates : { EUR: 37, NOK: 3.5, SEK: 3.3, DKK: 4.9, ISK: 0.27 },
      fxUpdatedAt: saved.fxUpdatedAt || "",
      tools: Array.isArray(saved.tools) ? saved.tools.map(item => ({ ...item, id: item.id || uid() })) : []
    };
  } catch {
    return { groups: [], cards: [], remits: [], wallets: [], fxRates: { EUR: 37, NOK: 3.5, SEK: 3.3, DKK: 4.9, ISK: 0.27 }, fxUpdatedAt: "", tools: [] };
  }
}
let db = loadDB();
let view = "dashboard";

function save() {
  localStorage.setItem(KEY, JSON.stringify(db));
  render();
}
function isActive(group) {
  return !["已結團", "取消"].includes(group.status || "準備中");
}
function deadlineItems(group) {
  if (!isActive(group) || !group.depart) return [];
  const done = group.deadlineDone || {};
  return [
    { key: "qtn", name: "QTN", date: group.qtn || addDays(group.depart, -20) },
    { key: "meetingDocs", name: "說明會資料", date: group.meetingDocs || addDays(group.depart, -7) },
    { key: "itin", name: "初版 ITIN", date: group.itin || addDays(group.depart, -6) },
    { key: "groupSheet", name: "團支表", date: group.groupSheet || addDays(group.depart, -4) },
    { key: "handover", name: "交接", date: group.handover || addDays(group.depart, -1) }
  ].map(item => ({ ...item, done: Boolean(done[item.key]) }));
}
function pageTitle(page) {
  return ({
    dashboard: "工作總覽", groups: "團體總表", deadlines: "Deadline 管理",
    cards: "虛擬卡記帳", remits: "共同匯款紀錄", toolbox: "工作工具箱", backup: "資料備份"
  })[page] || "工作總覽";
}

function render() {
  const title = $("#pageTitle");
  const content = $("#content");
  if (!title || !content) return;
  title.textContent = pageTitle(view);
  document.querySelectorAll(".nav").forEach(button => {
    button.classList.toggle("active", button.dataset.view === view);
  });

  if (view === "dashboard") {
    const activeGroups = db.groups.filter(isActive);
    const allDeadlines = activeGroups.flatMap(group =>
      deadlineItems(group).map(item => ({ ...item, group }))
    ).filter(item => item.date && !item.done);
    const upcoming = allDeadlines
      .filter(item => item.date >= today())
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 8);
    const dueSoon = allDeadlines.filter(item => item.date >= today() && item.date <= addDays(today(), 7)).length;
    const overdue = allDeadlines.filter(item => item.date < today()).length;

    content.innerHTML = `
      <div class="grid">
        <div class="stat"><span>管理中團體</span><strong>${activeGroups.length}</strong></div>
        <div class="stat"><span>即將到期項目（7天內）</span><strong>${dueSoon}</strong></div>
        <div class="stat"><span>逾期項目</span><strong class="due">${overdue}</strong></div>
        <div class="stat"><span>虛擬卡紀錄</span><strong>${db.cards.length}</strong></div>
      </div>
      <div class="panel"><div class="row between"><h2>近期 Deadline</h2><button class="btn light" data-go="deadlines">查看全部</button></div>${deadlineTable(upcoming)}</div>
      <div class="panel"><div class="row between"><h2>近期出發團體</h2><button class="btn light" data-go="groups">團體總表</button></div>${groupTable([...activeGroups].sort((a, b) => (a.depart || "").localeCompare(b.depart || "")).slice(0, 8))}</div>`;
  }

  if (view === "groups") {
    const years = [...new Set(db.groups.map(group => (group.depart || "").slice(0, 4)).filter(Boolean))].sort();
    content.innerHTML = `
      <div class="panel">
        <div class="row between"><h2>團體總表</h2><button class="btn" id="addGroup">＋ 新增團體</button></div>
        <div class="toolbar"><input id="search" placeholder="搜尋團號／分類"><select id="year"><option value="">全部年份</option>${years.map(year => `<option value="${year}">${year}</option>`).join("")}</select><select id="month"><option value="">全部月份</option>${Array.from({length:12},(_,i)=>`<option value="${String(i+1).padStart(2,"0")}">${i+1} 月</option>`).join("")}</select></div>
        <p class="muted">團體依出發日期由近到遠排列，可用年份及月份篩選。</p>
        <div id="groupRows">${groupTable([...db.groups].sort((a,b)=>(a.depart||"9999-99-99").localeCompare(b.depart||"9999-99-99")))}</div>
      </div>`;
  }

  if (view === "deadlines") {
    const list = db.groups.flatMap(group => deadlineItems(group).map(item => ({ ...item, group })))
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    content.innerHTML = `<div class="panel"><h2>所有團體期限</h2>
      <p class="muted">預設規則：QTN 出發前 20 天、說明會資料前 7 天、初版 ITIN 前 6 天、團支表前 4 天、交接前 1 天。可在團體資料中個別調整。已結團及取消團體不列入。</p>
      ${deadlineTable(list)}</div>`;
  }

  if (view === "cards") {
    content.innerHTML = `<div class="panel"><div class="row between"><h2>虛擬卡刷卡紀錄</h2><div class="row"><button class="btn light" id="manageWallets">管理虛擬卡額度</button><button class="btn" id="addCard">＋ 新增刷卡</button></div></div>
      <div class="panel" style="margin:12px 0;padding:14px;background:#f8faf9"><div class="row between"><b>參考匯率（約 NT$）</b><div class="row"><small class="muted">${db.fxUpdatedAt ? `最後更新：${esc(db.fxUpdatedAt)}` : "尚未更新，使用預設值"}</small><button class="btn light" id="refreshRates">更新匯率</button><button class="btn light" id="editRates">設定匯率</button></div></div><div class="grid">${Object.entries(db.fxRates).map(([c,r])=>`<div class="stat"><span>${esc(c)}</span><strong>NT$ ${Number(r).toLocaleString("en-US",{maximumFractionDigits:4})}</strong></div>`).join("")}</div><p class="muted">匯率為外部參考資料估算，非 Google 官方報價或銀行實際扣款；可手動調整。</p></div>
      <div id="walletSummary">${walletSummary()}</div>
      <div class="toolbar"><input id="cardSearch" placeholder="搜尋團號／項目／商家／卡片"></div><div id="cardSummary">${cardSummary(db.cards)}</div><div id="cardRows">${cardTable(db.cards)}</div></div>`;
  }

  if (view === "remits") {
    content.innerHTML = `<div class="panel"><div class="row between"><h2>共同匯款歷史紀錄</h2><button class="btn" id="addRemit">＋ 新增匯款紀錄</button></div>
      <p class="muted">依供應商分筆記錄送單日、匯款日、團號、負責同事（TO）、Bank fee 與 Total。</p>
      <div class="toolbar"><input id="remitSearch" placeholder="搜尋供應商／團號／負責 OP"><select id="remitCurrency"><option value="">全部幣別</option>${[...new Set(db.remits.map(x=>x.currency).filter(Boolean))].map(c=>`<option>${esc(c)}</option>`).join("")}</select></div><div id="remitRows">${remitTable(db.remits)}</div></div>`;
  }

  if (view === "toolbox") {
    content.innerHTML = `<div class="panel"><div class="row between"><h2>工作工具箱</h2><button class="btn" id="addTool">＋ 新增捷徑</button></div><p class="muted">放置常用 Google Sheets 或其他工作連結，可自行新增、修改及刪除。</p><div id="toolRows">${toolTable(db.tools)}</div></div>`;
  }

  if (view === "backup") {
    content.innerHTML = `<div class="panel"><h2>資料備份</h2>
      <p>資料只存在目前使用的瀏覽器。請定期匯出 JSON，並妥善保存備份檔。</p>
      <div class="row"><button class="btn" id="export">匯出完整備份</button><label class="btn light">匯入備份<input id="import" type="file" accept=".json,application/json" hidden></label></div>
      <p class="muted">備份包含團體資料、刷卡紀錄、虛擬卡額度、匯率、共同匯款紀錄及工作工具箱捷徑；Google Sheets／Excel 正式文件仍以原始連結為準。</p></div>`;
  }
}

function groupTable(list) {
  if (!list.length) return '<div class="empty">尚無團體資料，請新增第一個團體。</div>';
  return `<div class="table-wrap"><table><thead><tr>
    <th>團號</th><th>出發日期</th><th>分類</th><th>Local／自操</th><th>Go 團</th><th>人數</th><th>狀態</th><th>說明會日期</th><th>Google 小表</th><th>英文 ITIN</th><th>操作</th>
    </tr></thead><tbody>${list.map(group => `<tr>
      <td><b>${esc(group.code)}</b></td><td>${fmt(group.depart)}</td><td>${esc(group.category)}</td><td>${esc(group.type)}</td>
      <td>${fmt(group.go)}</td><td>${esc(group.pax)}</td><td>${esc(group.status || "準備中")}</td>
      <td>${fmt(group.meeting)}</td>
      <td>${group.sheet ? `<a href="${esc(group.sheet)}" target="_blank" rel="noopener">開啟 ↗</a>` : "—"}</td>
      <td>${group.itinLink ? `<a href="${esc(group.itinLink)}" target="_blank" rel="noopener">開啟 ↗</a>` : "—"}</td>
      <td><button class="linkbtn" data-edit-group="${esc(group.id)}">編輯</button> <button class="linkbtn danger" data-delete-group="${esc(group.id)}">刪除</button></td>
    </tr>`).join("")}</tbody></table></div>`;
}

function deadlineTable(list) {
  if (!list.length) return '<div class="empty">目前沒有期限資料。</div>';
  return `<div class="table-wrap"><table><thead><tr><th>完成</th><th>Deadline</th><th>工作項目</th><th>團號</th><th>出發日</th></tr></thead><tbody>
    ${list.map(item => `<tr class="${item.done ? "deadline-done" : ""}" style="${item.done ? "background:#eef0ed;color:#7d8580;" : ""}">
      <td><input type="checkbox" aria-label="標記${esc(item.name)}完成" data-deadline-group="${esc(item.group.id)}" data-deadline-key="${esc(item.key)}" ${item.done ? "checked" : ""}></td>
      <td class="${!item.done && item.date < today() ? "due" : ""}">${fmt(item.date)}</td><td>${esc(item.name)}</td><td>${esc(item.group.code)}</td><td>${fmt(item.group.depart)}</td>
    </tr>`).join("")}
    </tbody></table></div>`;
}
function money(value, digits = 2) {
  return Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: digits });
}
function rateFor(currency) { return Number(db.fxRates?.[currency]) || 0; }
function estimatedTWD(card) {
  const rate = rateFor(card.currency || "EUR");
  return (Number(card.amount) || 0) * rate;
}
function walletName(card) { return card.walletId ? (db.wallets.find(w => w.id === card.walletId)?.name || card.card || "未指定") : (card.card || "未指定"); }
function walletSummary() {
  if (!db.wallets.length) return `<div class="empty" style="margin:10px 0">尚未設定虛擬卡額度。請先點選「管理虛擬卡額度」新增卡片；舊刷卡紀錄仍會保留。</div>`;
  const cards = db.wallets.map(wallet => {
    const used = db.cards.filter(card => card.walletId === wallet.id || (!card.walletId && card.card === wallet.name)).reduce((sum, card) => sum + estimatedTWD(card), 0);
    const limit = Number(wallet.limit) || 0;
    const remain = limit - used;
    const pct = limit > 0 ? Math.min(100, Math.max(0, used / limit * 100)) : 0;
    return `<div class="stat" style="min-width:220px"><div class="row between"><b>${esc(wallet.name)}</b><small>到期：${fmt(wallet.expiry)}</small></div><span>台幣額度</span><strong>NT$ ${money(limit)}</strong><span>已使用（估算）</span><strong>NT$ ${money(used)}</strong><span>剩餘額度</span><strong style="color:${remain < 0 ? '#c0392b' : '#16834a'}">NT$ ${money(remain)}</strong><div style="height:8px;background:#e7ece9;border-radius:20px;overflow:hidden"><div style="height:8px;width:${pct}%;background:${remain < 0 ? '#c0392b' : '#239b62'}"></div></div><small>${pct.toFixed(0)}% 已使用</small><div><button class="linkbtn" data-edit-wallet="${esc(wallet.id)}">編輯額度</button> <button class="linkbtn danger" data-delete-wallet="${esc(wallet.id)}">刪除卡片</button></div></div>`;
  }).join("");
  const totalLimit = db.wallets.reduce((s,w)=>s+(Number(w.limit)||0),0);
  const totalUsed = db.wallets.reduce((s,w)=>s+db.cards.filter(c=>c.walletId===w.id || (!c.walletId && c.card===w.name)).reduce((a,c)=>a+estimatedTWD(c),0),0);
  return `<div class="grid">${cards}<div class="stat"><span>所有虛擬卡合計額度</span><strong>NT$ ${money(totalLimit)}</strong><span>預估已使用</span><strong>NT$ ${money(totalUsed)}</strong><span>預估剩餘</span><strong style="color:#16834a">NT$ ${money(totalLimit-totalUsed)}</strong></div></div>`;
}
function cardSummary(list) {
  const twd = list.reduce((sum, card) => sum + estimatedTWD(card), 0);
  const currencies = {};
  list.forEach(card => { const currency = card.currency || "未填幣別"; currencies[currency] = (currencies[currency] || 0) + (Number(card.amount) || 0); });
  const foreign = Object.entries(currencies).map(([currency, amount]) => `${esc(currency)} ${money(amount)}`).join(" ／ ") || "—";
  return `<div class="grid"><div class="stat"><span>刷卡筆數</span><strong>${list.length}</strong></div><div class="stat"><span>台幣預估金額</span><strong>NT$ ${money(twd)}</strong></div><div class="stat"><span>原幣金額（依幣別分開）</span><strong style="font-size:1rem">${foreign}</strong></div></div>`;
}
function cardTable(list = db.cards) {
  if (!list.length) return '<div class="empty">沒有符合的刷卡紀錄。</div>';
  return `<div class="table-wrap"><table><thead><tr><th>團號</th><th>刷卡日</th><th>項目／商家</th><th>金額</th><th>幣別</th><th>匯率</th><th>台幣估算</th><th>虛擬卡</th><th>操作</th></tr></thead><tbody>
    ${list.map(card => `<tr><td>${esc(card.group)}</td><td>${fmt(card.date)}</td><td>${esc(card.merchant || card.purpose)}</td><td>${money(card.amount)}</td><td>${esc(card.currency)}</td><td>${rateFor(card.currency).toLocaleString("en-US",{maximumFractionDigits:4})}</td><td>NT$ ${money(estimatedTWD(card))}</td><td>${esc(walletName(card))}</td><td><button class="linkbtn" data-edit-card="${esc(card.id)}">編輯</button> <button class="linkbtn danger" data-delete-card="${esc(card.id)}">刪除</button></td></tr>`).join("")}
    </tbody></table></div>`;
}
function remitTable(list = db.remits) {
  if (!list.length) return '<div class="empty">沒有符合的共同匯款紀錄。</div>';
  return `<div style="display:grid;gap:14px">${list.slice().sort((a,b)=>(b.sent||"").localeCompare(a.sent||"")).map(remit => {
    const items = remit.items || [];
    const subtotal = items.reduce((sum,item)=>sum+(Number(item.amount)||0),0);
    const total = Number(remit.total ?? (subtotal + (Number(remit.fee)||0)));
    return `<section class="panel" style="margin:0;padding:14px;border:1px solid #dfe7e2"><div class="row between" style="flex-wrap:wrap"><div><h3 style="margin:0 0 6px">${esc(remit.vendor)}</h3><small class="muted">送單：${fmt(remit.sent)}　匯款：${fmt(remit.paid)}　｜　幣別：${esc(remit.currency || "EUR")}</small></div><div><button class="linkbtn" data-edit-remit="${esc(remit.id)}">編輯</button> <button class="linkbtn danger" data-delete-remit="${esc(remit.id)}">刪除</button></div></div>
      <div class="table-wrap"><table><thead><tr><th>NO</th><th>GROUP NO.</th><th>AMOUNT</th><th>TO</th></tr></thead><tbody>${items.map((item,i)=>`<tr><td>${i+1}</td><td>${esc(item.group)}</td><td>${esc(remit.currency||"EUR")} ${money(item.amount)}</td><td>${esc(item.owner)}</td></tr>`).join("")}</tbody></table></div>
      <div class="row between" style="margin-top:8px;flex-wrap:wrap"><span>Bank fee：${esc(remit.currency||"EUR")} ${money(remit.fee)}</span><b>Total：${esc(remit.currency||"EUR")} ${money(total)}</b></div></section>`;
  }).join("")}</div>`;
}
function toolTable(list = db.tools) {
  if (!list.length) return '<div class="empty">尚無工具捷徑。點選「新增捷徑」，加入常用 Google Sheets 網址。</div>';
  return `<div class="grid">${list.map(tool=>`<div class="stat"><div class="row between"><strong>${esc(tool.name)}</strong><span>↗</span></div><p class="muted" style="word-break:break-all">${esc(tool.url)}</p><div class="row"><a class="btn" href="${esc(tool.url)}" target="_blank" rel="noopener">開啟連結 ↗</a><button class="linkbtn" data-edit-tool="${esc(tool.id)}">編輯</button><button class="linkbtn danger" data-delete-tool="${esc(tool.id)}">刪除</button></div></div>`).join("")}</div>`;
}

function openModal(html) {
  $("#modalRoot").innerHTML = `<div class="modal-back"><div class="modal">${html}</div></div>`;
}
function closeModal() { $("#modalRoot").innerHTML = ""; }
function field(label, name, value = "", required = false, type = "text", options = []) {
  const control = type === "select"
    ? `<select name="${name}" ${required ? "required" : ""}>${options.map(option => `<option value="${esc(option)}" ${option === value ? "selected" : ""}>${esc(option)}</option>`).join("")}</select>`
    : `<input name="${name}" type="${type}" value="${esc(value || "")}" ${type === "number" ? 'step="0.01"' : ""} ${required ? "required" : ""}>`;
  return `<label class="field">${label}${control}</label>`;
}

function groupForm(group = {}) {
  const oldDepart = group.depart || "";
  const defaults = {
    qtn: group.qtn || addDays(oldDepart, -20),
    meetingDocs: group.meetingDocs || addDays(oldDepart, -7),
    itin: group.itin || addDays(oldDepart, -6),
    groupSheet: group.groupSheet || addDays(oldDepart, -4),
    handover: group.handover || addDays(oldDepart, -1)
  };
  openModal(`<h2>${group.id ? "編輯" : "新增"}團體</h2><form id="groupForm"><div class="formgrid">
    ${field("團號", "code", group.code, true)}
    ${field("出發日期", "depart", group.depart, true, "date")}
    ${field("分類", "category", group.category)}
    ${field("Local／自操", "type", group.type || "Local", false, "select", ["Local", "自操"])}
    ${field("Go 團日期", "go", group.go, false, "date")}
    ${field("人數", "pax", group.pax)}
    ${field("團體狀態", "status", group.status || "準備中", true, "select", ["準備中", "進行中", "已結團", "取消"])}
    ${field("Google 小表連結", "sheet", group.sheet)}
    ${field("英文 ITIN 正式檔案連結", "itinLink", group.itinLink)}
    ${field("說明會日期（手動填寫）", "meeting", group.meeting, false, "date")}
    ${field("QTN 日期（預設出發前 20 天）", "qtn", defaults.qtn, false, "date")}
    ${field("說明會資料期限（預設前 7 天）", "meetingDocs", defaults.meetingDocs, false, "date")}
    ${field("初版 ITIN（預設前 6 天）", "itin", defaults.itin, false, "date")}
    ${field("團表表（預設前 4 天）", "groupSheet", defaults.groupSheet, false, "date")}
    ${field("交接（預設前 1 天）", "handover", defaults.handover, false, "date")}
  </div><div class="modal-actions"><button type="button" class="btn light" id="cancel">取消</button><button class="btn">儲存團體</button></div></form>`);

  const form = $("#groupForm");
  $("#cancel").onclick = closeModal;
  let previousDepart = oldDepart;
  const offsets = { qtn: -20, meetingDocs: -7, itin: -6, groupSheet: -4, handover: -1 };
  $("[name=depart]", form).addEventListener("change", event => {
    const nextDepart = event.target.value;
    Object.entries(offsets).forEach(([name, offset]) => {
      const input = $(`[name="${name}"]`, form);
      const previousDefault = addDays(previousDepart, offset);
      if (!input.dataset.manual && (!input.value || input.value === previousDefault)) {
        input.value = addDays(nextDepart, offset);
      }
    });
    previousDepart = nextDepart;
  });
  Object.keys(offsets).forEach(name => {
    $(`[name="${name}"]`, form).addEventListener("input", event => { event.target.dataset.manual = "1"; });
  });

  form.onsubmit = event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    data.id = group.id || uid();
    db.groups = db.groups.filter(item => item.id !== data.id).concat(data);
    closeModal();
    save();
  };
}

function cardForm(card = {}) {
  const walletOptions = db.wallets.map(w=>w.name);
  const currentWallet = card.walletId ? db.wallets.find(w=>w.id===card.walletId)?.name : (card.card || "");
  const currencyOptions = ["EUR","NOK","SEK","DKK","ISK"];
  openModal(`<h2>${card.id ? "編輯" : "新增"}虛擬卡刷卡</h2><form id="cardForm"><div class="formgrid">
    ${field("團號", "group", card.group)}
    ${field("刷卡日期", "date", card.date || today(), true, "date")}
    ${field("項目／商家", "merchant", card.merchant || card.purpose)}
    ${field("金額", "amount", card.amount, true, "number")}
    ${field("幣別", "currency", card.currency || "EUR", true, "select", currencyOptions)}
    ${field("使用虛擬卡", "walletName", currentWallet, true, "select", walletOptions.length ? walletOptions : ["請先新增虛擬卡"])}
    <label class="field full">備註<textarea name="note" rows="3">${esc(card.note || "")}</textarea></label>
  </div><p class="muted">台幣金額依上方參考匯率自動估算；不代表銀行實際扣款。</p><div class="modal-actions"><button type="button" class="btn light" id="cancel">取消</button><button class="btn">儲存</button></div></form>`);
  $("#cancel").onclick = closeModal;
  $("#cardForm").onsubmit = event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    const wallet = db.wallets.find(w=>w.name===data.walletName);
    data.walletId = wallet?.id || "";
    data.card = data.walletName === "請先新增虛擬卡" ? (card.card || "") : data.walletName;
    delete data.walletName;
    data.twd = estimatedTWD({currency:data.currency,amount:data.amount}).toFixed(2);
    data.id = card.id || uid();
    db.cards = db.cards.filter(item => item.id !== data.id).concat(data);
    closeModal(); save();
  };
}
function walletForm(wallet = {}) {
  openModal(`<h2>${wallet.id ? "編輯" : "新增"}虛擬卡</h2><form id="walletForm"><div class="formgrid">
    ${field("卡片名稱／識別", "name", wallet.name, true)}
    ${field("台幣額度", "limit", wallet.limit ?? "", true, "number")}
    ${field("開卡日", "start", wallet.start || today(), false, "date")}
    ${field("到期日", "expiry", wallet.expiry || addDays(today(),30), false, "date")}
  </div><div class="modal-actions"><button type="button" class="btn light" id="cancel">取消</button><button class="btn">儲存卡片</button></div></form>`);
  $("#cancel").onclick=closeModal;
  $("#walletForm").onsubmit=event=>{event.preventDefault();const data=Object.fromEntries(new FormData(event.target));data.limit=Number(data.limit)||0;data.id=wallet.id||uid();db.wallets=db.wallets.filter(w=>w.id!==data.id).concat(data);closeModal();save();};
}
function manageWallets() {
  openModal(`<h2>虛擬卡額度管理</h2><p class="muted">每張卡獨立設定台幣額度及效期；刷卡明細仍共用同一張表。</p><div class="row between"><span>目前 ${db.wallets.length} 張卡</span><button type="button" class="btn" id="newWallet">＋ 新增虛擬卡</button></div><div class="table-wrap"><table><thead><tr><th>卡片</th><th>台幣額度</th><th>開卡日</th><th>到期日</th><th>操作</th></tr></thead><tbody>${db.wallets.map(w=>`<tr><td>${esc(w.name)}</td><td>NT$ ${money(w.limit)}</td><td>${fmt(w.start)}</td><td>${fmt(w.expiry)}</td><td><button class="linkbtn" data-modal-edit-wallet="${esc(w.id)}">編輯</button></td></tr>`).join("")||'<tr><td colspan="5">尚未新增虛擬卡</td></tr>'}</tbody></table></div><div class="modal-actions"><button type="button" class="btn light" id="cancel">關閉</button></div>`);
  $("#cancel").onclick=closeModal;
  $("#newWallet").onclick=()=>walletForm();
  $("[data-modal-edit-wallet]")?.addEventListener("click",e=>{const w=db.wallets.find(x=>x.id===e.currentTarget.dataset.modalEditWallet);if(w)walletForm(w);});
}
function rateForm() {
  openModal(`<h2>設定參考匯率</h2><p class="muted">輸入 1 單位外幣約等於多少新台幣。</p><form id="rateForm"><div class="formgrid">${["EUR","NOK","SEK","DKK","ISK"].map(c=>field(c,"rate_"+c,db.fxRates[c]||"",true,"number")).join("")}</div><div class="modal-actions"><button type="button" class="btn light" id="cancel">取消</button><button class="btn">儲存匯率</button></div></form>`);
  $("#cancel").onclick=closeModal;
  $("#rateForm").onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));["EUR","NOK","SEK","DKK","ISK"].forEach(c=>db.fxRates[c]=Number(d["rate_"+c])||db.fxRates[c]);db.fxUpdatedAt="手動設定："+new Date().toLocaleString("zh-TW");closeModal();save();};
}
async function refreshRates() {
  const button=$("#refreshRates"); if(button){button.disabled=true;button.textContent="更新中…";}
  try {
    // 公開匯率服務，非 Google 官方 API；以 TWD 為基準，反算每單位外幣的台幣價格。
    const response=await fetch("https://open.er-api.com/v6/latest/TWD",{cache:"no-store"});
    if(!response.ok) throw new Error("匯率服務暫時無法連線");
    const json=await response.json(); if(json.result!=="success") throw new Error("匯率資料格式不正確");
    ["EUR","NOK","SEK","DKK","ISK"].forEach(c=>{const foreignPerTwd=Number(json.rates?.[c]);if(foreignPerTwd>0)db.fxRates[c]=1/foreignPerTwd;});
    db.fxUpdatedAt=new Date().toLocaleString("zh-TW"); save();
  } catch(error) { alert("目前無法自動更新匯率，請稍後再試，或使用「設定匯率」手動輸入。\n"+error.message); if(button){button.disabled=false;button.textContent="更新匯率";} }
}
function toolForm(tool = {}) {
  openModal(`<h2>${tool.id?"編輯":"新增"}工作捷徑</h2><form id="toolForm"><div class="formgrid">${field("捷徑名稱", "name", tool.name, true)}${field("Google Sheets／其他網址", "url", tool.url, true, "url")}</div><div class="modal-actions"><button type="button" class="btn light" id="cancel">取消</button><button class="btn">儲存捷徑</button></div></form>`);
  $("#cancel").onclick=closeModal;
  $("#toolForm").onsubmit=e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));if(!/^https?:\/\//i.test(data.url)){alert("請輸入以 https:// 或 http:// 開頭的完整網址");return;}data.id=tool.id||uid();db.tools=db.tools.filter(x=>x.id!==data.id).concat(data);closeModal();save();};
}

function remitForm(remit = {}) {
  const lines = (remit.items || []).map(item => `${item.group},${item.owner},${item.amount}`).join("\n");
  openModal(`<h2>${remit.id ? "編輯" : "新增"}共同匯款紀錄</h2><form id="remitForm"><div class="formgrid">
    ${field("供應商", "vendor", remit.vendor, true)}
    ${field("幣別", "currency", remit.currency || "EUR")}
    ${field("送單日期", "sent", remit.sent || today(), false, "date")}
    ${field("匯款日期", "paid", remit.paid, false, "date")}
    <label class="field full">參與團體（每行一筆：團號,負責 OP,金額）<textarea name="items" rows="5" placeholder="POR11TK261022A,Shirley,4396&#10;POR11TK261106A,Sabrina,1884">${esc(lines)}</textarea></label>
    ${field("Bank fee", "fee", remit.fee ?? "0")}
  </div><div class="modal-actions"><button type="button" class="btn light" id="cancel">取消</button><button class="btn">儲存紀錄</button></div></form>`);
  $("#cancel").onclick = closeModal;
  $("#remitForm").onsubmit = event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    data.items = data.items.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
      const [groupCode = "", owner = "", amount = "0"] = line.split(",");
      return { group: groupCode.trim(), owner: owner.trim(), amount: Number(amount.trim()) || 0 };
    });
    data.fee = Number(data.fee) || 0;
    data.total = data.items.reduce((sum, item) => sum + item.amount, 0) + data.fee;
    data.id = remit.id || uid();
    db.remits = db.remits.filter(item => item.id !== data.id).concat(data);
    closeModal();
    save();
  };
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `uno-tour-backup-${today()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 側邊導覽與頁面操作
$("#nav")?.addEventListener("click", event => {
  const button = event.target.closest("[data-view]");
  if (button) { view = button.dataset.view; render(); }
});
$("#quickAdd")?.addEventListener("click", () => groupForm());

$("#content")?.addEventListener("click", event => {
  const target = event.target.closest("button");
  if (!target) return;
  if (target.id === "addGroup") groupForm();
  if (target.id === "addCard") cardForm();
  if (target.id === "addRemit") remitForm();
  if (target.id === "addTool") toolForm();
  if (target.id === "manageWallets") manageWallets();
  if (target.id === "editRates") rateForm();
  if (target.id === "refreshRates") refreshRates();
  if (target.id === "export") exportBackup();
  if (target.dataset.go) { view = target.dataset.go; render(); }

  if (target.dataset.editGroup) {
    const group = db.groups.find(item => item.id === target.dataset.editGroup);
    if (group) groupForm(group);
  }
  if (target.dataset.deleteGroup && confirm("確定要刪除這筆團體資料嗎？")) {
    db.groups = db.groups.filter(item => item.id !== target.dataset.deleteGroup);
    save();
  }
  if (target.dataset.editWallet) { const wallet=db.wallets.find(item=>item.id===target.dataset.editWallet); if(wallet) walletForm(wallet); }
  if (target.dataset.deleteWallet && confirm("刪除卡片設定？既有刷卡紀錄不會刪除。")) { db.wallets=db.wallets.filter(item=>item.id!==target.dataset.deleteWallet); save(); }
  if (target.dataset.editTool) { const tool=db.tools.find(item=>item.id===target.dataset.editTool); if(tool) toolForm(tool); }
  if (target.dataset.deleteTool && confirm("確定刪除這個捷徑嗎？")) { db.tools=db.tools.filter(item=>item.id!==target.dataset.deleteTool); save(); }
  if (target.dataset.editCard) {
    const card = db.cards.find(item => item.id === target.dataset.editCard);
    if (card) cardForm(card);
  }
  if (target.dataset.deleteCard && confirm("確定要刪除這筆刷卡紀錄嗎？")) {
    db.cards = db.cards.filter(item => item.id !== target.dataset.deleteCard);
    save();
  }
  if (target.dataset.editRemit) {
    const remit = db.remits.find(item => item.id === target.dataset.editRemit);
    if (remit) remitForm(remit);
  }
  if (target.dataset.deleteRemit && confirm("確定要刪除這筆共同匯款紀錄嗎？")) {
    db.remits = db.remits.filter(item => item.id !== target.dataset.deleteRemit);
    save();
  }
});

$("#content")?.addEventListener("input", event => {
  if (["search", "year", "month"].includes(event.target.id)) {
    const query = $("#search")?.value.toLowerCase() || "";
    const year = $("#year")?.value || "";
    const month = $("#month")?.value || "";
    const list = db.groups.filter(group =>
      (!year || (group.depart || "").startsWith(year)) &&
      (!month || (group.depart || "").slice(5, 7) === month) &&
      [group.code, group.category].join(" ").toLowerCase().includes(query)
    ).sort((a,b)=>(a.depart||"9999-99-99").localeCompare(b.depart||"9999-99-99"));
    const rows = $("#groupRows");
    if (rows) rows.innerHTML = groupTable(list);
  }
  if (event.target.id === "cardSearch") {
    const q = event.target.value.trim().toLowerCase();
    const list = db.cards.filter(card => [card.group, card.merchant, card.purpose, card.card, walletName(card), card.note].join(" ").toLowerCase().includes(q));
    const summary = $("#cardSummary"), rows = $("#cardRows");
    if (summary) summary.innerHTML = cardSummary(list);
    if (rows) rows.innerHTML = cardTable(list);
  }
  if (event.target.id === "remitSearch" || event.target.id === "remitCurrency") {
    const q = $("#remitSearch")?.value.trim().toLowerCase() || "";
    const currency = $("#remitCurrency")?.value || "";
    const list = db.remits.filter(remit => (!currency || remit.currency===currency) && [remit.vendor, ...(remit.items || []).flatMap(item => [item.group, item.owner])].join(" ").toLowerCase().includes(q));
    const rows = $("#remitRows"); if (rows) rows.innerHTML = remitTable(list);
  }
});

$("#content")?.addEventListener("change", event => {
  const deadlineCheckbox = event.target.closest("[data-deadline-group][data-deadline-key]");
  if (deadlineCheckbox) {
    const group = db.groups.find(item => item.id === deadlineCheckbox.dataset.deadlineGroup);
    if (group) {
      group.deadlineDone = group.deadlineDone || {};
      group.deadlineDone[deadlineCheckbox.dataset.deadlineKey] = deadlineCheckbox.checked;
      save();
    }
    return;
  }

  if (event.target.id === "import" && event.target.files?.[0]) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result);
        if (!Array.isArray(imported.groups) || !Array.isArray(imported.cards) || !Array.isArray(imported.remits)) {
          throw new Error("備份格式不正確");
        }
        if (confirm("匯入備份會取代目前這個瀏覽器內的工作資料，建議先匯出舊資料。確定要繼續嗎？")) {
          db = { groups: imported.groups.map(item => ({ ...item, deadlineDone: item.deadlineDone && typeof item.deadlineDone === "object" ? item.deadlineDone : {} })), cards: imported.cards, remits: imported.remits, wallets: Array.isArray(imported.wallets) ? imported.wallets : [], fxRates: imported.fxRates || { EUR:37,NOK:3.5,SEK:3.3,DKK:4.9,ISK:0.27 }, fxUpdatedAt: imported.fxUpdatedAt || "", tools: Array.isArray(imported.tools) ? imported.tools : [] };
          save();
          alert("備份匯入完成！");
        }
      } catch {
        alert("無法讀取備份，請確認選擇的是 UNO TOUR 匯出的 JSON 檔案。");
      }
      event.target.value = "";
    };
    reader.readAsText(event.target.files[0]);
  }
});

render();
