
const KEY = "uno-tour-op-v1";
const $ = (selector, root = document) => root.querySelector(selector);

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

function addOneMonth(date) {
  if (!date) return "";
  const [y, m, d] = date.split("-").map(Number);
  const targetMonth = new Date(y, m, 1);
  const lastDay = new Date(
    targetMonth.getFullYear(),
    targetMonth.getMonth() + 1,
    0
  ).getDate();

  return localISO(
    new Date(
      targetMonth.getFullYear(),
      targetMonth.getMonth(),
      Math.min(d, lastDay)
    )
  );
}

function fmt(date) {
  if (!date) return "—";
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("zh-TW", {
    month: "2-digit",
    day: "2-digit"
  });
}

const esc = value =>
  String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));

const uid = () =>
  crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const money = value =>
  Number(value || 0).toLocaleString("en-US", {
    maximumFractionDigits: 2
  });

const twd = value => `NT$${money(value)}`;

// ========================================
// 匯率自動換算
// ========================================

const fxRateCache = {};

async function convertToTWD(currency, amount) {
  const code = String(currency || "").toUpperCase();

  if (!Number.isFinite(Number(amount))) {
    throw new Error("金額不正確");
  }

  if (code === "TWD") return Math.round(Number(amount));

  const supported = [
    "EUR", "USD", "GBP", "JPY",
    "AUD", "CAD", "CHF"
  ];

  if (!supported.includes(code)) {
    throw new Error("此幣別暫不支援自動換算");
  }

  const key = code.toLowerCase();

  if (!fxRateCache[key]) {
    const response = await fetch(
      `https://api.frankfurter.dev/v2/rate/${key}/twd`
    );

    if (!response.ok) {
      throw new Error("匯率查詢失敗");
    }

    const data = await response.json();

    if (!data.rate || !Number.isFinite(Number(data.rate))) {
      throw new Error("匯率資料不正確");
    }

    fxRateCache[key] = Number(data.rate);
  }

  return Math.round(Number(amount) * fxRateCache[key]);
}

// ========================================
// 資料讀取與儲存
// ========================================

function migrateCards(savedCards) {
  if (!Array.isArray(savedCards)) return [];

  if (savedCards.every(card => Array.isArray(card.transactions))) {
    return savedCards.map(card => ({
      ...card,
      id: card.id || uid(),
      transactions: card.transactions.map(tx => ({
        ...tx,
        id: tx.id || uid()
      }))
    }));
  }

  const grouped = new Map();

  savedCards.forEach(old => {
    const label = String(old.card || "").trim() || "未指定卡片";

    if (!grouped.has(label)) {
      grouped.set(label, {
        id: uid(),
        card: label,
        limitTwd: "",
        opened: "",
        expires: "",
        transactions: []
      });
    }

    grouped.get(label).transactions.push({
      id: old.id || uid(),
      date: old.date || "",
      group: old.group || "",
      merchant: old.merchant || "",
      purpose: old.purpose || "",
      currency: old.currency || "EUR",
      amount: old.amount ?? "",
      twdEstimate: old.twd || "",
      twdActual: old.twd || "",
      notes: old.notes || ""
    });
  });

  return [...grouped.values()];
}

function loadDB() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}");

    return {
      groups: Array.isArray(saved.groups)
        ? saved.groups.map(item => ({
            ...item,
            id: item.id || uid()
          }))
        : [],
      cards: migrateCards(saved.cards),
      remits: Array.isArray(saved.remits)
        ? saved.remits.map(item => ({
            ...item,
            id: item.id || uid()
          }))
        : [],
      toolsLink:
        typeof saved.toolsLink === "string"
          ? saved.toolsLink
          : ""
    };
  } catch {
    return {
      groups: [],
      cards: [],
      remits: [],
      toolsLink: ""
    };
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

  return [
    { name: "QTN", date: group.qtn || addDays(group.depart, -20) },
    { name: "說明會資料", date: group.meetingDocs || addDays(group.depart, -7) },
    { name: "初版 ITIN", date: group.itin || addDays(group.depart, -6) },
    { name: "團表表", date: group.groupSheet || addDays(group.depart, -4) },
    { name: "交接", date: group.handover || addDays(group.depart, -1) }
  ];
}

function pageTitle(page) {
  return ({
    dashboard: "工作總覽",
    groups: "團體總表",
    deadlines: "Deadline 管理",
    cards: "虛擬卡記帳",
    remits: "共同匯款紀錄",
    tools: "工作工具",
    backup: "資料備份"
  })[page] || "工作總覽";
}

// ========================================
// 頁面顯示
// ========================================

function render() {
  const title = $("#pageTitle");
  const content = $("#content");

  if (!title || !content) return;

  title.textContent = pageTitle(view);

  document.querySelectorAll(".nav").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.view === view
    );
  });

  if (view === "dashboard") {
    const activeGroups = db.groups.filter(isActive);

    const allDeadlines = activeGroups.flatMap(group =>
      deadlineItems(group).map(item => ({
        ...item,
        group
      }))
    ).filter(item => item.date);

    const upcoming = allDeadlines
      .filter(item => item.date >= today())
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 8);

    const dueSoon = allDeadlines.filter(
      item => item.date >= today() && item.date <= addDays(today(), 7)
    ).length;

    const overdue = allDeadlines.filter(
      item => item.date < today()
    ).length;

    content.innerHTML = `
      <div class="grid">
        <div class="stat">
          <span>管理中團體</span>
          <strong>${activeGroups.length}</strong>
        </div>
        <div class="stat">
          <span>即將到期項目（7天內）</span>
          <strong>${dueSoon}</strong>
        </div>
        <div class="stat">
          <span>逾期項目</span>
          <strong class="due">${overdue}</strong>
        </div>
        <div class="stat">
          <span>使用中虛擬卡</span>
          <strong>${db.cards.filter(card => !isCardExpired(card)).length}</strong>
        </div>
      </div>

      <div class="panel">
        <div class="row between">
          <h2>近期 Deadline</h2>
          <button class="btn light" data-go="deadlines">查看全部</button>
        </div>
        ${deadlineTable(upcoming)}
      </div>

      <div class="panel">
        <div class="row between">
          <h2>近期出發團體</h2>
          <button class="btn light" data-go="groups">團體總表</button>
        </div>
        ${groupTable(
          [...activeGroups]
            .sort((a, b) => (a.depart || "").localeCompare(b.depart || ""))
            .slice(0, 8)
        )}
      </div>
    `;
  }

  if (view === "groups") {
    const years = [
      ...new Set(
        db.groups.map(group => (group.depart || "").slice(0, 4)).filter(Boolean)
      )
    ].sort();

    content.innerHTML = `
      <div class="panel">
        <div class="row between">
          <h2>團體總表</h2>
          <button class="btn" id="addGroup">＋ 新增團體</button>
        </div>

        <div class="toolbar">
          <input id="search" placeholder="搜尋團號／分類／負責人">
          <select id="year">
            <option value="">全部年份</option>
            ${years.map(year => `<option value="${year}">${year}</option>`).join("")}
          </select>
        </div>

        <div id="groupRows">${groupTable(db.groups)}</div>
      </div>
    `;
  }

  if (view === "deadlines") {
    const list = db.groups
      .flatMap(group =>
        deadlineItems(group).map(item => ({ ...item, group }))
      )
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

    content.innerHTML = `
      <div class="panel">
        <h2>所有團體期限</h2>
        <p class="muted">
          預設規則：QTN 出發前 20 天、
          說明會資料前 7 天、
          初版 ITIN 前 6 天、
          團表表前 4 天、
          交接前 1 天。
          可在團體資料中個別調整。
          已結團及取消團體不列入。
        </p>
        ${deadlineTable(list)}
      </div>
    `;
  }

  if (view === "cards") {
    content.innerHTML = `
      <div class="panel">
        <div class="row between">
          <div>
            <h2>虛擬卡管理</h2>
            <p class="muted">
              每張卡獨立設定台幣額度及效期；
              外幣消費以每筆台幣估算加總，
              僅供對帳及掌握剩餘額度參考。
            </p>
          </div>
          <button class="btn" id="addCardAccount">＋ 新增虛擬卡</button>
        </div>
        ${cardAccountsView()}
      </div>
    `;
  }

  if (view === "remits") {
    content.innerHTML = `
      <div class="panel">
        <div class="row between">
          <div>
            <h2>共同匯款歷史紀錄</h2>
            <p class="muted">每次匯款以獨立明細表呈現，可直接截圖留存。</p>
          </div>
          <button class="btn" id="addRemit">＋ 新增匯款紀錄</button>
        </div>
        ${remitTable()}
      </div>
    `;
  }

  if (view === "tools") {
    const hasLink = /^https:\/\//i.test(db.toolsLink || "");

    content.innerHTML = `
      <div class="panel">
        <div class="row between">
          <div>
            <h2>工作工具箱</h2>
            <p class="muted">
              保留原本 Google Sheets 的 DL 計算工具，不重做既有公式。
            </p>
          </div>
          <span class="pill">Google Sheets</span>
        </div>

        <section class="panel" style="margin-top:14px">
          <div class="row between">
            <div>
              <h2 style="margin:0">DL 日期計算工具</h2>
              <p class="muted" style="margin:7px 0 0">
                開票日、入住日、提前天數、補修時數、幣別及時差等常用計算。
              </p>
            </div>
            ${
              hasLink
                ? `<a class="btn" href="${esc(db.toolsLink)}" target="_blank" rel="noopener">開啟原始試算表 ↗</a>`
                : '<span class="pill">尚未設定連結</span>'
            }
          </div>

          <p class="muted" style="margin:12px 0 0">
            請貼上公司核准可使用的 Google Sheets 分享連結。
          </p>

          <form id="toolsLinkForm" style="margin-top:12px">
            <label class="field">
              Google Sheets 連結
              <input
                name="toolsLink"
                type="url"
                placeholder="https://docs.google.com/spreadsheets/d/..."
                value="${esc(db.toolsLink || "")}"
              >
            </label>
            <div class="modal-actions">
              <button class="btn" type="submit">儲存連結</button>
            </div>
          </form>
        </section>
      </div>
    `;
  }

  if (view === "backup") {
    content.innerHTML = `
      <div class="panel">
        <h2>資料備份</h2>
        <p>
          資料只存在目前使用的瀏覽器。
          請定期匯出 JSON，並妥善保存備份檔。
        </p>

        <div class="row">
          <button class="btn" id="export">匯出完整備份</button>
          <label class="btn light">
            匯入備份
            <input id="import" type="file" accept=".json,application/json" hidden>
          </label>
        </div>

        <p class="muted">
          備份包含團體資料、虛擬卡及其刷卡明細、共同匯款紀錄。
        </p>
      </div>
    `;
  }
}

// ========================================
// 團體表格
// ========================================

function groupTable(list) {
  if (!list.length) {
    return '<div class="empty">尚無團體資料，請新增第一個團體。</div>';
  }

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>團號</th>
            <th>出發日期</th>
            <th>分類</th>
            <th>Local／自操</th>
            <th>Go 團</th>
            <th>人數</th>
            <th>負責 OP</th>
            <th>狀態</th>
            <th>說明會日期</th>
            <th>Google 小表</th>
            <th>英文 ITIN</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${list.map(group => `
            <tr>
              <td><b>${esc(group.code)}</b></td>
              <td>${fmt(group.depart)}</td>
              <td>${esc(group.category)}</td>
              <td>${esc(group.type)}</td>
              <td>${fmt(group.go)}</td>
              <td>${esc(group.pax)}</td>
              <td>${esc(group.op)}</td>
              <td>${esc(group.status || "準備中")}</td>
              <td>${fmt(group.meeting)}</td>
              <td>
                ${
                  group.sheet
                    ? `<a href="${esc(group.sheet)}" target="_blank" rel="noopener">開啟 ↗</a>`
                    : "—"
                }
              </td>
              <td>
                ${
                  group.itinLink
                    ? `<a href="${esc(group.itinLink)}" target="_blank" rel="noopener">開啟 ↗</a>`
                    : "—"
                }
              </td>
              <td>
                <button class="linkbtn" data-edit-group="${esc(group.id)}">編輯</button>
                <button class="linkbtn danger" data-delete-group="${esc(group.id)}">刪除</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

// ========================================
// Deadline 表格
// ========================================

function deadlineTable(list) {
  if (!list.length) {
    return '<div class="empty">目前沒有期限資料。</div>';
  }

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Deadline</th>
            <th>工作項目</th>
            <th>團號</th>
            <th>出發日</th>
            <th>負責 OP</th>
          </tr>
        </thead>
        <tbody>
          ${list.map(item => `
            <tr>
              <td class="${item.date < today() ? "due" : ""}">${fmt(item.date)}</td>
              <td>${esc(item.name)}</td>
              <td>${esc(item.group.code)}</td>
              <td>${fmt(item.group.depart)}</td>
              <td>${esc(item.group.op)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

// ========================================
// 虛擬卡
// ========================================

function isCardExpired(card) {
  return Boolean(card.expires && card.expires < today());
}

// 已使用額度只加總台幣估算金額
function transactionTwd(tx) {
  const estimate = Number(tx.twdEstimate);

  return (
    tx.twdEstimate !== "" &&
    tx.twdEstimate != null &&
    Number.isFinite(estimate)
  ) ? estimate : 0;
}

function cardUsed(card) {
  return (card.transactions || []).reduce(
    (sum, tx) => sum + transactionTwd(tx),
    0
  );
}

function cardTransactionsTable(card) {
  const transactions = card.transactions || [];

  if (!transactions.length) {
    return '<div class="empty">這張卡尚無刷卡紀錄。</div>';
  }

  return `
    <div class="table-wrap">
      <table style="min-width:850px">
        <thead>
          <tr>
            <th>日期</th>
            <th>團號</th>
            <th>商家</th>
            <th>用途</th>
            <th>原幣金額</th>
            <th>台幣估算</th>
            <th>備註</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${transactions
            .slice()
            .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
            .map(tx => `
              <tr>
                <td>${fmt(tx.date)}</td>
                <td>${esc(tx.group)}</td>
                <td>${esc(tx.merchant)}</td>
                <td>${esc(tx.purpose)}</td>
                <td>${esc(tx.currency)} ${esc(tx.amount)}</td>
                <td>
                  ${
                    tx.twdEstimate !== "" && tx.twdEstimate != null
                      ? twd(tx.twdEstimate)
                      : "—"
                  }
                </td>
                <td>${esc(tx.notes || "—")}</td>
                <td>
                  <button class="linkbtn"
                    data-edit-tx="${esc(tx.id)}"
                    data-card-id="${esc(card.id)}">編輯</button>
                  <button class="linkbtn danger"
                    data-delete-tx="${esc(tx.id)}"
                    data-card-id="${esc(card.id)}">刪除</button>
                </td>
              </tr>
            `).join("")}

          <tr>
            <td colspan="5"><b>此卡台幣估算累計</b></td>
            <td colspan="3"><b>${twd(cardUsed(card))}</b></td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

function cardAccountsView() {
  if (!db.cards.length) {
    return '<div class="empty">尚無虛擬卡，請新增第一張卡片。</div>';
  }

  const active = db.cards.filter(card => !isCardExpired(card));
  const expired = db.cards.filter(isCardExpired);

  const renderAccount = card => {
    const used = cardUsed(card);
    const limit = Number(card.limitTwd) || 0;
    const remaining = limit - used;

    const ratio = limit > 0
      ? Math.min(100, Math.max(0, used / limit * 100))
      : 0;

    const expiredNow = isCardExpired(card);

    return `
      <section class="panel" style="margin-top:14px;border-left:4px solid ${expiredNow ? "#b8b8b8" : "#39845d"}">
        <div class="row between">
          <div>
            <div class="row" style="gap:8px">
              <h2 style="margin:0">卡片 ${esc(card.card || "未命名")}</h2>
              <span class="pill">${expiredNow ? "已過期" : "使用中"}</span>
            </div>
            <p class="muted" style="margin:7px 0 0">
              開卡日：${fmt(card.opened)}
             　到期日：${fmt(card.expires)}
             　刷卡筆數：${(card.transactions || []).length}
            </p>
          </div>

          <div class="row">
            <button class="btn light" data-add-tx="${esc(card.id)}">＋ 新增刷卡</button>
            <button class="linkbtn" data-edit-card-account="${esc(card.id)}">編輯卡片</button>
            <button class="linkbtn danger" data-delete-card-account="${esc(card.id)}">刪除</button>
          </div>
        </div>

        <div class="grid" style="grid-template-columns:repeat(3,minmax(0,1fr));margin:16px 0 10px">
          <div class="stat">
            <span>卡片額度</span>
            <strong style="font-size:20px">${limit ? twd(limit) : "尚未設定"}</strong>
          </div>
          <div class="stat">
            <span>已使用（台幣估算）</span>
            <strong style="font-size:20px">${twd(used)}</strong>
          </div>
          <div class="stat">
            <span>剩餘額度</span>
            <strong style="font-size:20px" class="${remaining < 0 ? "due" : "good"}">
              ${limit ? twd(remaining) : "—"}
            </strong>
          </div>
        </div>

        ${
          limit > 0
            ? `
              <div style="height:9px;background:#edf0eb;border-radius:99px;overflow:hidden;margin:8px 0 5px">
                <div style="height:100%;width:${ratio}%;background:${ratio >= 90 ? "#b85c48" : "#39845d"};border-radius:99px"></div>
              </div>
              <p class="muted" style="margin:0 0 14px">
                額度使用率：${ratio.toFixed(1)}%
                ${
                  remaining < 0
                    ? " · 已超過設定額度"
                    : ratio >= 80
                      ? " · 剩餘額度低於 20%，請留意"
                      : ""
                }
              </p>
            `
            : '<p class="muted">請編輯卡片並設定台幣額度，系統才能計算剩餘額度。</p>'
        }

        ${
          (card.transactions || []).some(
            tx => tx.twdEstimate === "" || tx.twdEstimate == null
          )
            ? '<p class="due" style="font-size:12px">提醒：有刷卡明細尚未填台幣估算，卡片累計可能低估。</p>'
            : ""
        }

        ${cardTransactionsTable(card)}
      </section>
    `;
  };

  return `
    ${active.map(renderAccount).join("")}
    ${
      expired.length
        ? `
          <details style="margin-top:18px">
            <summary style="cursor:pointer;padding:12px;color:var(--muted);font-weight:700">
              已過期卡片（${expired.length}）— 展開查看歷史紀錄
            </summary>
            ${expired.map(renderAccount).join("")}
          </details>
        `
        : ""
    }
  `;
}

// ========================================
// 共同匯款
// ========================================

function remitTotal(remit) {
  return (
    (remit.items || []).reduce(
      (sum, item) => sum + (Number(item.amount) || 0),
      0
    ) + (Number(remit.fee) || 0)
  );
}

function remitTable() {
  if (!db.remits.length) {
    return '<div class="empty">尚無共同匯款紀錄。</div>';
  }

  return db.remits
    .slice()
    .sort((a, b) => (b.sent || "").localeCompare(a.sent || ""))
    .map(remit => {
      const currency = remit.currency || "EUR";
      const items = remit.items || [];

      return `
        <section class="panel" style="margin-top:14px">
          <div class="row between">
            <div>
              <h2 style="margin:0">${esc(remit.vendor)}</h2>
              <p class="muted" style="margin:6px 0 0">
                ${items.length} 筆團體明細 · ${esc(currency)}
              </p>
            </div>
            <div class="row">
              <button class="linkbtn" data-edit-remit="${esc(remit.id)}">編輯</button>
              <button class="linkbtn danger" data-delete-remit="${esc(remit.id)}">刪除</button>
            </div>
          </div>

          <div class="table-wrap">
            <table style="min-width:620px;margin-top:12px">
              <thead>
                <tr>
                  <th>NO.</th>
                  <th>GROUP NO.</th>
                  <th>AMOUNT（${esc(currency)}）</th>
                  <th>TO</th>
                </tr>
              </thead>
              <tbody>
                ${items.map((item, index) => `
                  <tr>
                    <td>${index + 1}</td>
                    <td><b>${esc(item.group)}</b></td>
                    <td>${money(item.amount)}</td>
                    <td>${esc(item.owner)}</td>
                  </tr>
                `).join("")}

                ${
                  Number(remit.fee)
                    ? `
                      <tr>
                        <td colspan="2">Bank fee</td>
                        <td>${money(remit.fee)}</td>
                        <td>—</td>
                      </tr>
                    `
                    : ""
                }

                <tr>
                  <td colspan="2"><b>Total</b></td>
                  <td><b>${money(remitTotal(remit))} ${esc(currency)}</b></td>
                  <td>—</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="row" style="justify-content:flex-end;gap:22px;margin-top:12px">
            <span class="muted">
              送單日：<b style="color:var(--ink)">${fmt(remit.sent)}</b>
            </span>
            <span class="muted">
              匯款日：<b style="color:var(--ink)">${fmt(remit.paid)}</b>
            </span>
          </div>
        </section>
      `;
    })
    .join("");
}

// ========================================
// 彈出視窗與欄位
// ========================================

function openModal(html) {
  $("#modalRoot").innerHTML = `
    <div class="modal-back">
      <div class="modal">${html}</div>
    </div>
  `;
}

function closeModal() {
  $("#modalRoot").innerHTML = "";
}

function field(
  label,
  name,
  value = "",
  required = false,
  type = "text",
  options = []
) {
  const control = type === "select"
    ? `
      <select name="${name}" ${required ? "required" : ""}>
        ${options.map(option => `
          <option value="${esc(option)}" ${option === value ? "selected" : ""}>
            ${esc(option)}
          </option>
        `).join("")}
      </select>
    `
    : `
      <input
        name="${name}"
        type="${type}"
        value="${esc(value ?? "")}"
        ${required ? "required" : ""}
      >
    `;

  return `<label class="field">${label}${control}</label>`;
}

// ========================================
// 團體新增／編輯
// ========================================

function groupForm(group = {}) {
  const oldDepart = group.depart || "";

  const defaults = {
    qtn: group.qtn || addDays(oldDepart, -20),
    meetingDocs: group.meetingDocs || addDays(oldDepart, -7),
    itin: group.itin || addDays(oldDepart, -6),
    groupSheet: group.groupSheet || addDays(oldDepart, -4),
    handover: group.handover || addDays(oldDepart, -1)
  };

  openModal(`
    <h2>${group.id ? "編輯" : "新增"}團體</h2>

    <form id="groupForm">
      <div class="formgrid">
        ${field("團號", "code", group.code, true)}
        ${field("出發日期", "depart", group.depart, true, "date")}
        ${field("分類", "category", group.category)}
        ${field("Local／自操", "type", group.type || "Local", false, "select", ["Local", "自操"])}
        ${field("Go 團日期", "go", group.go, false, "date")}
        ${field("人數", "pax", group.pax)}
        ${field("負責 OP", "op", group.op)}
        ${field("團體狀態", "status", group.status || "準備中", true, "select", ["準備中", "進行中", "已結團", "取消"])}
        ${field("Google 小表連結", "sheet", group.sheet)}
        ${field("英文 ITIN 正式檔案連結", "itinLink", group.itinLink)}
        ${field("說明會日期（手動填寫）", "meeting", group.meeting, false, "date")}
        ${field("QTN 日期（預設出發前 20 天）", "qtn", defaults.qtn, false, "date")}
        ${field("說明會資料期限（預設前 7 天）", "meetingDocs", defaults.meetingDocs, false, "date")}
        ${field("初版 ITIN（預設前 6 天）", "itin", defaults.itin, false, "date")}
        ${field("團表表（預設前 4 天）", "groupSheet", defaults.groupSheet, false, "date")}
        ${field("交接（預設前 1 天）", "handover", defaults.handover, false, "date")}
      </div>

      <div class="modal-actions">
        <button type="button" class="btn light" id="cancel">取消</button>
        <button class="btn">儲存團體</button>
      </div>
    </form>
  `);

  const form = $("#groupForm");
  $("#cancel").onclick = closeModal;

  let previousDepart = oldDepart;

  const offsets = {
    qtn: -20,
    meetingDocs: -7,
    itin: -6,
    groupSheet: -4,
    handover: -1
  };

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
    $(`[name="${name}"]`, form).addEventListener("input", event => {
      event.target.dataset.manual = "1";
    });
  });

  form.onsubmit = event => {
    event.preventDefault();

    const data = Object.fromEntries(new FormData(form));
    data.id = group.id || uid();

    db.groups = db.groups
      .filter(item => item.id !== data.id)
      .concat(data);

    closeModal();
    save();
  };
}

// ========================================
// 虛擬卡新增／編輯
// ========================================

function cardAccountForm(card = {}) {
  const opened = card.opened || today();
  const expires = card.expires || addOneMonth(opened);

  openModal(`
    <h2>${card.id ? "編輯" : "新增"}虛擬卡</h2>

    <p class="muted">
      額度請填新台幣。到期日預設為開卡日加一個月，可依實際情況修改。
    </p>

    <form id="cardAccountForm">
      <div class="formgrid">
        ${field("卡片識別（末四碼或代號）", "card", card.card === "未指定卡片" ? "" : card.card, true)}
        ${field("卡片額度（TWD）", "limitTwd", card.limitTwd, true, "number")}
        ${field("開卡日", "opened", opened, true, "date")}
        ${field("到期日", "expires", expires, true, "date")}
      </div>

      <div class="modal-actions">
        <button type="button" class="btn light" id="cancel">取消</button>
        <button class="btn">儲存卡片</button>
      </div>
    </form>
  `);

  const form = $("#cardAccountForm");
  $("#cancel").onclick = closeModal;

  $("[name=opened]", form).addEventListener("change", event => {
    const exp = $("[name=expires]", form);

    if (!exp.dataset.manual) {
      exp.value = addOneMonth(event.target.value);
    }
  });

  $("[name=expires]", form).addEventListener("input", event => {
    event.target.dataset.manual = "1";
  });

  form.onsubmit = event => {
    event.preventDefault();

    const data = Object.fromEntries(new FormData(form));
    data.limitTwd = Number(data.limitTwd) || 0;
    data.id = card.id || uid();
    data.transactions = card.transactions || [];

    db.cards = db.cards
      .filter(item => item.id !== data.id)
      .concat(data);

    closeModal();
    save();
  };
}

// ========================================
// 新增／編輯刷卡明細（含自動換匯）
// ========================================

function transactionForm(card, tx = {}) {
  openModal(`
    <h2>${tx.id ? "編輯" : "新增"}刷卡明細</h2>

    <p class="muted">
      所屬卡片：${esc(card.card)}。
      輸入幣別及原幣金額後，系統會自動換算台幣估算。
    </p>

    <form id="transactionForm">
      <div class="formgrid">
        ${field("刷卡日期", "date", tx.date || today(), true, "date")}
        ${field("團號", "group", tx.group)}
        ${field("商家", "merchant", tx.merchant)}
        ${field("用途", "purpose", tx.purpose)}
        ${field(
          "原幣幣別",
          "currency",
          tx.currency || "EUR",
          true,
          "select",
          ["EUR", "NOK", "SEK", "DKK", "ISK", "USD"]
        )}
        ${field("原幣金額", "amount", tx.amount, true, "number")}
        ${field("台幣估算金額（TWD）", "twdEstimate", tx.twdEstimate, true, "number")}

        <label class="field full">
          備註
          <input name="notes" value="${esc(tx.notes || "")}" placeholder="選填">
        </label>
      </div>

      <div class="modal-actions">
        <button type="button" class="btn light" id="cancel">取消</button>
        <button class="btn">儲存刷卡明細</button>
      </div>
    </form>
  `);

  const form = $("#transactionForm");
  $("#cancel").onclick = closeModal;

  const currencyInput = $("[name=currency]", form);
  const amountInput = $("[name=amount]", form);
  const estimateInput = $("[name=twdEstimate]", form);

  const status = document.createElement("p");
  status.className = "muted";
  status.style.fontSize = "12px";
  status.textContent = "輸入幣別及金額後，系統會自動換算台幣估算。";

  estimateInput.parentElement.appendChild(status);

  let requestId = 0;
  let manuallyEdited = false;

  estimateInput.addEventListener("input", () => {
    manuallyEdited = true;
  });

  async function autoConvert() {
    const id = ++requestId;
    const currency = currencyInput.value;
    const amount = Number(amountInput.value);

    if (!amountInput.value || !Number.isFinite(amount)) {
      status.textContent = "請先輸入原幣金額。";
      return;
    }

    status.textContent = "正在查詢匯率⋯";

    try {
      const result = await convertToTWD(currency, amount);

      if (id !== requestId) return;

      estimateInput.value = result;
      manuallyEdited = false;

      status.textContent =
        `參考匯率換算：約 NT$${result.toLocaleString("zh-TW")}。可自行修改估算金額。`;
    } catch (error) {
      if (id !== requestId) return;

      status.textContent =
        "匯率查詢失敗或幣別不支援，請手動輸入台幣估算。";
    }
  }

  currencyInput.addEventListener("change", autoConvert);
  amountInput.addEventListener("change", autoConvert);

  // 新增時自動換算；編輯舊資料時保留原本估算。
  if (!tx.id && amountInput.value) {
    autoConvert();
  }

  form.onsubmit = event => {
    event.preventDefault();

    const data = Object.fromEntries(new FormData(form));

    data.amount = Number(data.amount) || 0;
    data.twdEstimate =
      data.twdEstimate === "" ? "" : Number(data.twdEstimate);

    data.id = tx.id || uid();

    card.transactions = card.transactions || [];

    card.transactions = card.transactions
      .filter(item => item.id !== data.id)
      .concat(data);

    closeModal();
    save();
  };
}

// ========================================
// 共同匯款新增／編輯
// ========================================

function remitForm(remit = {}) {
  const lines = (remit.items || [])
    .map(item => `${item.group},${item.owner},${item.amount}`)
    .join("\n");

  openModal(`
    <h2>${remit.id ? "編輯" : "新增"}共同匯款紀錄</h2>

    <p class="muted">
      每行輸入一個團體，格式：團號,負責 OP,金額。
      儲存後會自動整理成逐列明細表。
    </p>

    <form id="remitForm">
      <div class="formgrid">
        ${field("供應商", "vendor", remit.vendor, true)}
        ${field("幣別", "currency", remit.currency || "EUR", true, "select", ["EUR", "USD", "GBP", "JPY", "TWD", "其他"])}

        <label class="field full">
          團體明細（每行一筆：團號,負責 OP,金額）
          <textarea name="items" rows="6" required placeholder="POR11TK261022A,Shirley,4396
POR11TK261106A,Sabrina,1884">${esc(lines)}</textarea>
        </label>

        ${field("Bank fee", "fee", remit.fee ?? "0", false, "number")}
        ${field("送單日期", "sent", remit.sent || today(), false, "date")}
        ${field("匯款日期", "paid", remit.paid, false, "date")}
      </div>

      <div class="modal-actions">
        <button type="button" class="btn light" id="cancel">取消</button>
        <button class="btn">儲存紀錄</button>
      </div>
    </form>
  `);

  $("#cancel").onclick = closeModal;

  $("#remitForm").onsubmit = event => {
    event.preventDefault();

    const data = Object.fromEntries(new FormData(event.target));

    data.items = data.items
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const [group = "", owner = "", amount = "0"] = line.split(",");

        return {
          group: group.trim(),
          owner: owner.trim(),
          amount: Number(amount.trim()) || 0
        };
      });

    data.fee = Number(data.fee) || 0;
    data.total = remitTotal(data);
    data.id = remit.id || uid();

    db.remits = db.remits
      .filter(item => item.id !== data.id)
      .concat(data);

    closeModal();
    save();
  };
}

// ========================================
// 匯出備份
// ========================================

function exportBackup() {
  const blob = new Blob(
    [JSON.stringify(db, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `uno-tour-backup-${today()}.json`;
  link.click();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ========================================
// 複製文字
// ========================================

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";

      document.body.appendChild(area);
      area.select();

      const ok = document.execCommand("copy");
      area.remove();

      if (!ok) throw new Error("copy failed");
    }

    alert("已複製，可以貼到 Email 或 Google Sheets 了！");
  } catch {
    alert("瀏覽器未能自動複製，請稍後再試，或手動選取明細。");
  }
}

// ========================================
// 導覽與操作
// ========================================

$("#nav")?.addEventListener("click", event => {
  const button = event.target.closest("[data-view]");

  if (button) {
    view = button.dataset.view;
    render();
  }
});

$("#quickAdd")?.addEventListener("click", () => groupForm());

$("#content")?.addEventListener("click", event => {
  const target = event.target.closest("button");

  if (!target) return;

  if (target.id === "addGroup") groupForm();
  if (target.id === "addCardAccount") cardAccountForm();
  if (target.id === "addRemit") remitForm();
  if (target.id === "export") exportBackup();

  if (target.dataset.go) {
    view = target.dataset.go;
    render();
  }

  if (target.dataset.editGroup) {
    const group = db.groups.find(item => item.id === target.dataset.editGroup);
    if (group) groupForm(group);
  }

  if (target.dataset.deleteGroup && confirm("確定要刪除這筆團體資料嗎？")) {
    db.groups = db.groups.filter(item => item.id !== target.dataset.deleteGroup);
    save();
  }

  if (target.dataset.editCardAccount) {
    const card = db.cards.find(item => item.id === target.dataset.editCardAccount);
    if (card) cardAccountForm(card);
  }

  if (
    target.dataset.deleteCardAccount &&
    confirm("確定刪除這張卡及其所有刷卡明細嗎？建議先確認已備份。")
  ) {
    db.cards = db.cards.filter(item => item.id !== target.dataset.deleteCardAccount);
    save();
  }

  if (target.dataset.addTx) {
    const card = db.cards.find(item => item.id === target.dataset.addTx);
    if (card) transactionForm(card);
  }

  if (target.dataset.editTx) {
    const card = db.cards.find(item => item.id === target.dataset.cardId);
    const tx = card?.transactions?.find(item => item.id === target.dataset.editTx);
    if (card && tx) transactionForm(card, tx);
  }

  if (
    target.dataset.deleteTx &&
    confirm("確定刪除這筆刷卡明細嗎？")
  ) {
    const card = db.cards.find(item => item.id === target.dataset.cardId);

    if (card) {
      card.transactions = card.transactions.filter(
        item => item.id !== target.dataset.deleteTx
      );
      save();
    }
  }

  if (target.dataset.editRemit) {
    const remit = db.remits.find(item => item.id === target.dataset.editRemit);
    if (remit) remitForm(remit);
  }

  if (
    target.dataset.deleteRemit &&
    confirm("確定要刪除這筆共同匯款紀錄嗎？")
  ) {
    db.remits = db.remits.filter(item => item.id !== target.dataset.deleteRemit);
    save();
  }
});

// ========================================
// 團體搜尋
// ========================================

$("#content")?.addEventListener("input", event => {
  if (event.target.id === "search" || event.target.id === "year") {
    const query = $("#search")?.value.toLowerCase() || "";
    const year = $("#year")?.value || "";

    const list = db.groups.filter(group =>
      (!year || (group.depart || "").startsWith(year)) &&
      [group.code, group.category, group.op]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );

    const rows = $("#groupRows");
    if (rows) rows.innerHTML = groupTable(list);
  }
});

// ========================================
// 工具連結儲存
// ========================================

$("#content")?.addEventListener("submit", event => {
  if (event.target.id === "toolsLinkForm") {
    event.preventDefault();

    const value = new FormData(event.target)
      .get("toolsLink")
      .trim();

    if (value && !/^https:\/\//i.test(value)) {
      alert("請輸入 https:// 開頭的 Google Sheets 連結。");
      return;
    }

    db.toolsLink = value;
    save();

    alert(value ? "DL 工具連結已儲存！" : "已清除 DL 工具連結。");
  }
});

// ========================================
// 匯入備份
// ========================================

$("#content")?.addEventListener("change", event => {
  if (event.target.id === "import" && event.target.files?.[0]) {
    const reader = new FileReader();

    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result);

        if (
          !Array.isArray(imported.groups) ||
          !Array.isArray(imported.cards) ||
          !Array.isArray(imported.remits)
        ) {
          throw new Error("備份格式不正確");
        }

        if (
          confirm(
            "匯入備份會取代目前這個瀏覽器內的工作資料，建議先匯出舊資料。確定要繼續嗎？"
          )
        ) {
          db = {
            groups: imported.groups,
            cards: migrateCards(imported.cards),
            remits: imported.remits,
            toolsLink: imported.toolsLink || ""
          };

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

// ========================================
// 啟動網站
// ========================================

render();
