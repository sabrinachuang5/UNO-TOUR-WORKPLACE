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
      remits: Array.isArray(saved.remits) ? saved.remits.map(item => ({ ...item, id: item.id || uid() })) : []
    };
  } catch {
    return { groups: [], cards: [], remits: [] };
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
    { key: "groupSheet", name: "團表表", date: group.groupSheet || addDays(group.depart, -4) },
    { key: "handover", name: "交接", date: group.handover || addDays(group.depart, -1) }
  ].map(item => ({ ...item, done: Boolean(done[item.key]) }));
}
function pageTitle(page) {
  return ({
    dashboard: "工作總覽", groups: "團體總表", deadlines: "Deadline 管理",
    cards: "虛擬卡記帳", remits: "共同匯款紀錄", backup: "資料備份"
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
        <div class="toolbar"><input id="search" placeholder="搜尋團號／分類"><select id="year"><option value="">全部年份</option>${years.map(year => `<option value="${year}">${year}</option>`).join("")}</select></div>
        <div id="groupRows">${groupTable(db.groups)}</div>
      </div>`;
  }

  if (view === "deadlines") {
    const list = db.groups.flatMap(group => deadlineItems(group).map(item => ({ ...item, group })))
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    content.innerHTML = `<div class="panel"><h2>所有團體期限</h2>
      <p class="muted">預設規則：QTN 出發前 20 天、說明會資料前 7 天、初版 ITIN 前 6 天、團表表前 4 天、交接前 1 天。可在團體資料中個別調整。已結團及取消團體不列入。</p>
      ${deadlineTable(list)}</div>`;
  }

  if (view === "cards") {
    content.innerHTML = `<div class="panel"><div class="row between"><h2>虛擬卡刷卡紀錄</h2><button class="btn" id="addCard">＋ 新增刷卡</button></div>${cardTable()}</div>`;
  }

  if (view === "remits") {
    content.innerHTML = `<div class="panel"><div class="row between"><h2>共同匯款歷史紀錄</h2><button class="btn" id="addRemit">＋ 新增匯款紀錄</button></div>
      <p class="muted">記錄不同同事的團一起匯給同一供應商；單純留存紀錄，不追蹤其他同事的工作流程。</p>${remitTable()}</div>`;
  }

  if (view === "backup") {
    content.innerHTML = `<div class="panel"><h2>資料備份</h2>
      <p>資料只存在目前使用的瀏覽器。請定期匯出 JSON，並妥善保存備份檔。</p>
      <div class="row"><button class="btn" id="export">匯出完整備份</button><label class="btn light">匯入備份<input id="import" type="file" accept=".json,application/json" hidden></label></div>
      <p class="muted">備份包含團體資料、虛擬卡紀錄及共同匯款紀錄；Google Sheets／Excel 正式文件仍以原始連結為準。</p></div>`;
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

function cardTable() {
  if (!db.cards.length) return '<div class="empty">尚無刷卡紀錄。</div>';
  return `<div class="table-wrap"><table><thead><tr><th>日期</th><th>團號</th><th>商家</th><th>用途</th><th>原幣金額</th><th>台幣實際扣款</th><th>卡片</th><th>操作</th></tr></thead><tbody>
    ${db.cards.map(card => `<tr><td>${fmt(card.date)}</td><td>${esc(card.group)}</td><td>${esc(card.merchant)}</td><td>${esc(card.purpose)}</td><td>${esc(card.currency)} ${esc(card.amount)}</td><td>${esc(card.twd)}</td><td>${esc(card.card)}</td>
      <td><button class="linkbtn" data-edit-card="${esc(card.id)}">編輯</button> <button class="linkbtn danger" data-delete-card="${esc(card.id)}">刪除</button></td></tr>`).join("")}
    </tbody></table></div>`;
}

function remitTable() {
  if (!db.remits.length) return '<div class="empty">尚無共同匯款紀錄。</div>';
  return `<div class="table-wrap"><table><thead><tr><th>供應商</th><th>送單日</th><th>匯款日</th><th>團號／負責人／金額</th><th>Bank fee</th><th>Total</th><th>操作</th></tr></thead><tbody>
    ${db.remits.map(remit => `<tr><td>${esc(remit.vendor)}</td><td>${fmt(remit.sent)}</td><td>${fmt(remit.paid)}</td>
      <td>${(remit.items || []).map(item => `${esc(item.group)} / ${esc(item.owner)} / ${esc(item.amount)}`).join("<br>")}</td>
      <td>${esc(remit.currency)} ${esc(remit.fee)}</td><td><b>${esc(remit.currency)} ${esc(remit.total)}</b></td>
      <td><button class="linkbtn" data-edit-remit="${esc(remit.id)}">編輯</button> <button class="linkbtn danger" data-delete-remit="${esc(remit.id)}">刪除</button></td></tr>`).join("")}
    </tbody></table></div>`;
}

function openModal(html) {
  $("#modalRoot").innerHTML = `<div class="modal-back"><div class="modal">${html}</div></div>`;
}
function closeModal() { $("#modalRoot").innerHTML = ""; }
function field(label, name, value = "", required = false, type = "text", options = []) {
  const control = type === "select"
    ? `<select name="${name}" ${required ? "required" : ""}>${options.map(option => `<option value="${esc(option)}" ${option === value ? "selected" : ""}>${esc(option)}</option>`).join("")}</select>`
    : `<input name="${name}" type="${type}" value="${esc(value || "")}" ${required ? "required" : ""}>`;
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
  openModal(`<h2>${card.id ? "編輯" : "新增"}虛擬卡刷卡</h2><form id="cardForm"><div class="formgrid">
    ${field("刷卡日期", "date", card.date || today(), true, "date")}
    ${field("團號", "group", card.group)}
    ${field("商家", "merchant", card.merchant)}
    ${field("用途", "purpose", card.purpose)}
    ${field("幣別", "currency", card.currency || "EUR")}
    ${field("原幣金額", "amount", card.amount)}
    ${field("台幣實際扣款", "twd", card.twd)}
    ${field("卡片識別", "card", card.card)}
  </div><div class="modal-actions"><button type="button" class="btn light" id="cancel">取消</button><button class="btn">儲存</button></div></form>`);
  $("#cancel").onclick = closeModal;
  $("#cardForm").onsubmit = event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    data.id = card.id || uid();
    db.cards = db.cards.filter(item => item.id !== data.id).concat(data);
    closeModal();
    save();
  };
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
  if (event.target.id === "search" || event.target.id === "year") {
    const query = $("#search")?.value.toLowerCase() || "";
    const year = $("#year")?.value || "";
    const list = db.groups.filter(group =>
      (!year || (group.depart || "").startsWith(year)) &&
      [group.code, group.category].join(" ").toLowerCase().includes(query)
    );
    const rows = $("#groupRows");
    if (rows) rows.innerHTML = groupTable(list);
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
          db = { groups: imported.groups.map(item => ({ ...item, deadlineDone: item.deadlineDone && typeof item.deadlineDone === "object" ? item.deadlineDone : {} })), cards: imported.cards, remits: imported.remits };
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
