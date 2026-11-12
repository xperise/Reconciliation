/* ==========================================================================
   XPERISE — WORKSTREAM INTELLIGENCE v3.1  ·  app.js
   Lõi: cấu hình, công thức, trạng thái, bộ lọc, tóm tắt điều hành, CRUD.
   Không cần đăng nhập. Chạy thuần từ file:// (script cổ điển).
   ========================================================================== */

/* ==========================================================================
   1. CẤU HÌNH — điền 2 dòng này để nối vào dữ liệu thật.
   Để trống thì app chạy bằng dữ liệu mẫu.
   ========================================================================== */
const SUPABASE_URL = "https://eovueumhcjxfptezqado.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvdnVldW1oY2p4ZnB0ZXpxYWRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwNjI3MjEsImV4cCI6MjEwMTYzODcyMX0.KZ1ARr-sz-BkPaoiF_iDduvaNa_appDZUTSkKgLmB6w";

/* ==========================================================================
   2. THAM SỐ ĐIỀU CHỈNH ĐƯỢC
   Sửa ở đây là mọi nơi đổi theo, kể cả bảng giải thích công thức.
   ========================================================================== */

/* --- 2.1. Công thức chỉ số rủi ro (WRI) ---------------------------------
   Bốn thành phần cộng lại rồi giới hạn ở `cap`.

   LƯU Ý VỀ THÀNH PHẦN 4: ô "Bước tiếp theo" để trống KHÔNG bị phạt. Để trống
   là một cách ghi hợp lệ — nghĩa là việc chỉ còn chờ hoàn thiện nốt, không có
   nhánh nào phải quyết định thêm. Phạt nó sẽ ép người dùng bịa ra bước giả
   chỉ để hạ điểm, làm hỏng chính dữ liệu mà chỉ số dựa vào.
   ------------------------------------------------------------------------ */
const WRI = {
  schedule: {
    labelKey: "fSchedule",
    noDue:   { labelKey: "fNoDue",   points: 12 },
    overdue: { labelKey: "fOverdue", points: 45 },
    ladder: [
      { days: 3,  points: 38 },
      { days: 7,  points: 30 },
      { days: 14, points: 20 },
      { days: 30, points: 10 }
    ],
    beyond:  { labelKey: "fBeyond",  points: 4 }
  },
  priority: { labelKey: "fPriority", points: { "High": 25, "Medium": 14, "Low": 6 } },
  status:   { labelKey: "fStatus",   points: { "Open": 15, "In Progress": 8, "Done": 0 } },
  data: {
    labelKey: "fData",
    fields: [
      { key: "timeline_start", labelKey: "fMissStart", points: 4 },
      { key: "description",    labelKey: "fMissDesc",  points: 3 }
    ]
  },
  // Thành phần 5 — lệch tiến độ. CHỈ áp dụng cho đầu mục đã chia hạng mục nhỏ
  // và có đủ mốc thời gian. Không chia nhỏ thì không bị trừ điểm, để việc chia
  // nhỏ là tự nguyện chứ không thành hình phạt.
  drift: {
    labelKey: "fDrift",
    ladder: [
      { gap: 50, labelKey: "fDrift50", points: 20 },
      { gap: 30, labelKey: "fDrift30", points: 12 },
      { gap: 15, labelKey: "fDrift15", points: 6 }
    ],
    onTrack: { labelKey: "fDriftOk", points: 0 }
  },
  cap: 100
};

/* Tham số mặc định giữ nguyên một bản sao, để nút "khôi phục mặc định" dùng lại
   sau khi người dùng tự sửa bảng điểm. */
const WRI_DEFAULT = JSON.parse(JSON.stringify(WRI));
const THRESHOLD_DEFAULT_KEYS = ["dueSoonDays", "hhiConcentrated", "hhiTight", "dataThin"];

/** Trần điểm của từng thành phần được TÍNH RA từ bảng trên, không gõ tay —
    nên đổi bảng điểm là bảng giải thích tự khớp lại. */
function componentMax(name) {
  if (name === "schedule") {
    return Math.max(WRI.schedule.noDue.points, WRI.schedule.overdue.points,
                    WRI.schedule.beyond.points, ...WRI.schedule.ladder.map(l => l.points));
  }
  if (name === "priority") return Math.max(...Object.values(WRI.priority.points));
  if (name === "status")   return Math.max(...Object.values(WRI.status.points));
  if (name === "drift")    return Math.max(0, ...WRI.drift.ladder.map(l => l.points));
  return WRI.data.fields.reduce((s, f) => s + f.points, 0);
}

/* --- 2.2. Ngưỡng cảnh báo ----------------------------------------------- */
const BANDS = [
  { key: "critical", min: 70, color: "#E11D48", soft: "#FDE7EC" },
  { key: "high",     min: 50, color: "#EA8C0B", soft: "#FDF0DC" },
  { key: "watch",    min: 30, color: "#A855F7", soft: "#F3E8FF" },
  { key: "stable",   min: 0,  color: "#0D9488", soft: "#D6F1EC" }
];
function bandOf(score) { const b = BANDS.find(x => score >= x.min) || BANDS[BANDS.length-1]; return Object.assign({ label: t("bands." + b.key) }, b); }

const THRESHOLDS = {
  dueSoonDays: 7,
  hhiConcentrated: 1.35,  // so với mức chia đều 1/N
  hhiTight: 1.80,
  dataThin: 0.50
};

/* --- 2.3. Suy luận luồng chiến lược từ tiêu đề -------------------------- */
const STREAM_RULES = [
  { id: "product",  keys: ["product","platform","ai","merge","spendos","system","data","intelligence","app","api","nền","tảng","sản","phẩm","hệ","thống"] },
  { id: "partner",  keys: ["partner","partnership","survey","msb","bank","distribution","channel","đối","tác","phân","phối","khách","hàng"] },
  { id: "capital",  keys: ["fund","raising","investor","capital","vifc","insignia","pilot","vốn","đầu","tư","cổ","đông"] },
  { id: "presence", keys: ["office","event","market","sep","marina","operation","hiring","hiện","diện","vận","hành","văn","phòng","sự","kiện"] }
];

const STATUSES = ["Open", "In Progress", "Done"];
const STATUS_COLOR = { "Open": "#8A968F", "In Progress": "#A855F7", "Done": "#0D9488" };
const PRIORITIES = ["High", "Medium", "Low"];
const PRIORITY_COLOR = { "High": "#E11D48", "Medium": "#EA8C0B", "Low": "#8A968F" };
const AVATAR_COLORS = ["#7E22CE","#0D9488","#E11D48","#EA8C0B","#2563EB","#A855F7","#0F766E","#BE185D"];

const SQL_SUBTASKS = `create table if not exists public.subtasks (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title      text not null,
  done       boolean not null default false,
  owner      text,
  due        date,
  sort_order smallint not null default 0,
  created_at timestamptz default now()
);
create index if not exists subtasks_project_idx on public.subtasks(project_id);
alter table public.subtasks disable row level security;`;

const SQL_CONNECTED = `-- Xperise Workstream Intelligence — connected layer
-- An toan: chay lai nhieu lan cung khong sao, khong xoa du lieu cu.

create table if not exists public.subtasks (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title      text not null,
  done       boolean not null default false,
  owner      text,
  due        date,
  sort_order smallint not null default 0,
  created_at timestamptz default now()
);
create index if not exists subtasks_project_idx on public.subtasks(project_id);
alter table public.subtasks disable row level security;

alter table public.projects
  add column if not exists stream     text,
  add column if not exists blocked_by uuid[] default '{}',
  add column if not exists progress   smallint;

-- Bat dong bo tuc thoi, chi them neu chua co
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'projects'
  ) then
    alter publication supabase_realtime add table public.projects;
  end if;
end $$;

-- Cho phep app doc/ghi khong can dang nhap
alter table public.projects disable row level security;`;

/* ==========================================================================
   3. TRẠNG THÁI
   ========================================================================== */
const S = {
  sb: null,
  demo: false,
  hasStream: false, hasBlockedBy: false, hasProgress: false,
  channelOpen: false,   // đã mở được kênh đồng bộ
  realtime: false,      // đã NHẬN ĐƯỢC tín hiệu thật từ bảng
  all: [], view: [], links: [],
  customStreams: [],    // luồng do người dùng tự tạo
  hiddenStreams: [],    // luồng đã bị xóa khỏi danh sách chọn
  subs: {},             // hạng mục nhỏ, gom theo id đầu mục
  expanded: {},         // đầu mục nào đang mở rộng trong bảng Danh sách
  hasSubs: false,       // bảng subtasks đã tồn tại trên Supabase chưa
  tab: "overview",
  mode: "workstream",   // "workstream" | "performance"
  modalId: null,
  modal: null,          // GIỮ MỘT bản popup duy nhất — tạo mới mỗi lần sẽ khóa cuộn trang
  // Các ô lọc dạng danh sách giờ là MẢNG — rỗng nghĩa là không lọc (tất cả).
  filters: { q: "", pic: [], status: [], priority: [], stream: [], band: [], from: "", to: "", flags: [] },
  sort: []          // các bậc sắp xếp, kiểu Excel: [{col, dir}, ...]
};

const FLAGS = {
  overdue:  { test: p => p._wri.daysLeft !== null && p._wri.daysLeft < 0 && p.status !== "Done" },
  dueSoon:  { test: p => p._wri.daysLeft !== null && p._wri.daysLeft >= 0 && p._wri.daysLeft <= THRESHOLDS.dueSoonDays && p.status !== "Done" },
  critical: { test: p => p._wri.band.key === "critical" },
  highPrio: { test: p => p.priority === "High" },
  noStart:  { test: p => !p.timeline_start },
  noDue:    { test: p => !p.timeline_end && p.status !== "Done" },
  // --- bốn bộ lọc theo tiến độ, chỉ bắt các đầu mục đã chia nhỏ ---
  notStarted: { test: p => p._wri.progress.total > 0 && p._wri.progress.done === 0 && p.status !== "Done" },
  running:    { test: p => p._wri.progress.total > 0 && p._wri.progress.done > 0 && p._wri.progress.donePct < 100 },
  nearlyDone: { test: p => p._wri.progress.total > 0 && p._wri.progress.donePct >= 80 && p.status !== "Done" },
  drifting:   { test: p => p._wri.driftGap !== null && p._wri.driftGap >= minDriftGap() }
};
/** Bậc lệch nhẹ nhất trong bảng điểm — dùng làm ngưỡng "bắt đầu coi là lệch". */
function minDriftGap() {
  return WRI.drift.ladder.length ? WRI.drift.ladder[WRI.drift.ladder.length - 1].gap : 15;
}
function flagLabel(k) { return t("flags." + k); }

/* ==========================================================================
   4. TIỆN ÍCH
   ========================================================================== */
function esc(v) {
  if (v === null || v === undefined) return "";
  return String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
                  .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
function toDate(d) {
  if (!d) return null;
  const p = String(d).slice(0,10).split("-");
  if (p.length !== 3) return null;
  const dt = new Date(+p[0], +p[1]-1, +p[2]);
  return isNaN(dt) ? null : dt;
}
function today0() { const x = new Date(); return new Date(x.getFullYear(), x.getMonth(), x.getDate()); }
function fmtDate(d) { const x = toDate(d); return x ? String(x.getDate()).padStart(2,"0")+"/"+String(x.getMonth()+1).padStart(2,"0")+"/"+x.getFullYear() : ""; }
function daysBetween(a, b) { return Math.round((b - a) / 86400000); }
function pct(n, d) { return d ? Math.round(n / d * 100) : 0; }
function initials(n) {
  const w = String(n||"?").trim().split(/\s+/).filter(Boolean);
  if (!w.length) return "?";
  return w.length === 1 ? w[0].slice(0,2).toUpperCase() : (w[0][0]+w[w.length-1][0]).toUpperCase();
}
function colorFor(name) {
  let h = 0; for (const c of String(name||"")) h = (h*31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function picsOf(p) { return String(p.pic||"").split(",").map(s => s.trim()).filter(Boolean); }
function avatar(name, cls) {
  return `<span class="avatar ${cls||""}" style="background:${colorFor(name)}" title="${esc(name)}">${esc(initials(name))}</span>`;
}
function el(id) { return document.getElementById(id); }

function toast(msg, kind) {
  const n = document.createElement("div");
  n.className = "toast-note " + (kind||"");
  const ic = kind === "err" ? "bi-exclamation-circle" : kind === "ok" ? "bi-check-circle" : "bi-info-circle";
  n.innerHTML = `<i class="bi ${ic}"></i><span>${esc(msg)}</span>`;
  el("toastTray").appendChild(n);
  setTimeout(() => n.remove(), 3600);
}

/* ==========================================================================
   5. BỘ MÁY TÍNH CHỈ SỐ RỦI RO
   ========================================================================== */
function computeWRI(p) {
  const end = toDate(p.timeline_end);
  const daysLeft = end ? daysBetween(today0(), end) : null;

  if (p.status === "Done") {
    return { score: 0, daysLeft, band: bandOf(0), reasonKey: ["done"],
             parts: { schedule: 0, priority: 0, status: 0, data: 0, drift: 0 },
             missing: missingFields(p), progress: progressOf(p), driftGap: null };
  }

  let schedule, reasonKey;
  if (daysLeft === null) {
    schedule = WRI.schedule.noDue.points; reasonKey = ["noDue"];
  } else if (daysLeft < 0) {
    schedule = WRI.schedule.overdue.points; reasonKey = ["overdue", Math.abs(daysLeft)];
  } else {
    const step = WRI.schedule.ladder.find(s => daysLeft <= s.days);
    schedule = step ? step.points : WRI.schedule.beyond.points;
    reasonKey = daysLeft === 0 ? ["dueToday"] : ["left", daysLeft];
  }

  const priority = WRI.priority.points[p.priority] || 0;
  const status   = WRI.status.points[p.status] || 0;

  const missing = missingFields(p);
  let data = 0;
  WRI.data.fields.forEach(f => { if (missing.includes(f.key)) data += f.points; });

  // Lệch tiến độ — chỉ chấm khi đầu mục đã chia nhỏ VÀ có đủ mốc thời gian.
  const prog = progressOf(p);
  let drift = 0, driftGap = null;
  if (prog.total > 0 && prog.elapsedPct !== null) {
    driftGap = Math.round(prog.elapsedPct - prog.donePct);
    const step = WRI.drift.ladder.find(l => driftGap >= l.gap);
    drift = step ? step.points : WRI.drift.onTrack.points;
  }

  const score = Math.min(WRI.cap, schedule + priority + status + data + drift);
  return { score, daysLeft, band: bandOf(score), reasonKey,
           parts: { schedule, priority, status, data, drift },
           missing, progress: prog, driftGap };
}



/* ==========================================================================
   KHU NHẬP HẠNG MỤC NHỎ TRONG POPUP
   ========================================================================== */
function renderSubEditor() {
  const box = el("subList");
  if (!box) return;

  // Bảng subtasks chưa tồn tại: KHÔNG cho nhập. Trước đây vẫn cho thêm vào bộ
  // nhớ tạm nên nhìn như đã lưu, rồi biến mất ngay lần tải lại — im lặng mất dữ
  // liệu là kiểu hỏng tệ nhất, nên giờ chặn thẳng và nói rõ phải làm gì.
  if (!S.demo && !S.hasSubs) {
    box.innerHTML = `<div class="sub-blocked">
        <i class="bi bi-exclamation-triangle-fill"></i>
        <div><div>${esc(t("subNoTable"))}</div>
        <button type="button" class="link-btn" id="btnSubSql">${esc(t("subCopySql"))}</button></div>
      </div>`;
    el("subProgress").textContent = "";
    el("subNew").disabled = true; el("btnSubAdd").disabled = true;
    el("subHint").textContent = "";
    const b = el("btnSubSql");
    if (b) b.addEventListener("click", () => {
      navigator.clipboard.writeText(SQL_SUBTASKS).then(
        () => toast(t("sqlCopied"), "ok"),
        () => toast(t("sqlCopyFail"), "err"));
    });
    return;
  }

  // Đầu mục chưa lưu thì chưa có id để gắn hạng mục con vào.
  if (!S.modalId) {
    box.innerHTML = `<div class="sub-empty">${esc(t("subSaveFirst"))}</div>`;
    el("subProgress").textContent = "";
    el("subNew").disabled = true; el("btnSubAdd").disabled = true;
    el("subHint").textContent = "";
    return;
  }
  el("subNew").disabled = false; el("btnSubAdd").disabled = false;

  const p = S.all.find(x => String(x.id) === String(S.modalId));
  const list = S.subs[S.modalId] || [];
  const prog = p ? progressOf(p) : { total: 0, done: 0, donePct: 0, elapsedPct: null };

  el("subProgress").innerHTML = list.length
    ? `<span class="sub-count">${prog.done}/${prog.total}</span>
       <span class="sub-bar"><i style="width:${prog.donePct}%"></i></span>
       <span class="sub-pct">${prog.donePct}%</span>`
    : "";

  box.innerHTML = list.length
    ? list.map(s => `
        <div class="sub-row ${s.done ? "is-done" : ""}" data-sub="${esc(s.id)}">
          <button type="button" class="sub-check" data-act="toggle" aria-label="${esc(t("subToggle"))}">
            <i class="bi ${s.done ? "bi-check-square-fill" : "bi-square"}"></i>
          </button>
          <input class="sub-name" value="${esc(s.title)}" data-act="title" />
          <input class="sub-owner" value="${esc(s.owner || "")}" list="picList"
                 placeholder="${esc(t("subOwnerPh"))}" data-act="owner" />
          <input type="date" class="sub-due" value="${s.due ? String(s.due).slice(0,10) : ""}" data-act="due" />
          <button type="button" class="icon-btn danger" data-act="del" aria-label="${esc(t("subDelete"))}">
            <i class="bi bi-trash3"></i>
          </button>
        </div>`).join("")
    : `<div class="sub-empty">${esc(t("subNone"))}</div>`;

  // Nhắc khi thiếu ngày bắt đầu — không có nó thì không đo được lệch tiến độ.
  el("subHint").textContent = list.length && p && !p.timeline_start ? t("subNeedStart") : "";

  box.querySelectorAll(".sub-row").forEach(row => {
    const id = row.dataset.sub;
    row.querySelector('[data-act="toggle"]').addEventListener("click", () => {
      const s = (S.subs[S.modalId] || []).find(x => String(x.id) === String(id));
      updateSub(S.modalId, id, { done: !s.done });
    });
    row.querySelector('[data-act="del"]').addEventListener("click", () => deleteSub(S.modalId, id));
    row.querySelector('[data-act="title"]').addEventListener("change", e => {
      const v = e.target.value.trim();
      if (v) updateSub(S.modalId, id, { title: v }); else renderSubEditor();
    });
    row.querySelector('[data-act="owner"]').addEventListener("change", e =>
      updateSub(S.modalId, id, { owner: e.target.value.trim() || null }));
    row.querySelector('[data-act="due"]').addEventListener("change", e =>
      updateSub(S.modalId, id, { due: e.target.value || null }));
  });
}

let subAdding = false;      // chặn bấm/Enter dồn dập tạo ra bản ghi trùng

async function submitNewSub() {
  const input = el("subNew");
  const v = input.value.trim();
  if (!v || !S.modalId || subAdding) return;

  subAdding = true;
  input.value = "";                       // xóa ngay để không gửi lại cùng nội dung
  el("btnSubAdd").disabled = true;
  try {
    await addSub(S.modalId, v);
  } finally {
    subAdding = false;
    el("btnSubAdd").disabled = false;
    input.focus();
  }
}

/* ==========================================================================
   BẢNG ĐIỂM TỰ NHẬP
   Người dùng sửa số ngay trong tab "Dữ liệu & hệ thống"; mọi đầu mục được chấm
   lại tức thì. Đường dẫn kiểu "schedule.ladder.0.points" trỏ thẳng vào object
   WRI, nên không phải viết tay từng trường hợp — thêm dòng mới vào WRI là ô
   nhập tự có.
   ========================================================================== */
function getByPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
}
function setByPath(obj, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  const host = keys.reduce((o, k) => o[k], obj);
  host[last] = value;
}

/** Đổi một ô điểm rồi chấm lại toàn bộ danh mục. */
function setWeight(path, raw) {
  // Ô trống hoặc chữ bậy: giữ nguyên giá trị cũ thay vì tụt về 0.
  if (String(raw).trim() === "" || !isFinite(Number(raw))) { renderSystem(); return; }
  const n = Math.max(0, Math.min(100, Math.round(Number(raw))));
  setByPath(WRI, path, n);
  saveWeights();
  S.all = enrich(S.all);
  applyFilters();
}

/** Đổi một ngưỡng (số ngày, mức tập trung…). */
function setThreshold(key, raw) {
  const n = Number(raw);
  if (!isFinite(n) || n < 0) return;
  THRESHOLDS[key] = n;
  saveWeights();
  S.all = enrich(S.all);
  applyFilters();
}

/** Đổi mốc "bắt đầu coi là lệch": dịch cả ba bậc để giữ nguyên khoảng cách
    giữa chúng, thay vì bắt người dùng sửa từng bậc một. */
function setDriftGate(raw) {
  const n = Math.max(1, Math.min(99, Math.round(Number(raw))));
  if (!isFinite(n)) return;
  const last = WRI.drift.ladder.length - 1;
  const shift = n - WRI.drift.ladder[last].gap;
  WRI.drift.ladder.forEach(l => { l.gap = Math.max(1, Math.min(99, l.gap + shift)); });
  saveWeights();
  S.all = enrich(S.all);
  applyFilters();
}

function saveWeights() {
  try {
    localStorage.setItem("xp-weights", JSON.stringify({ wri: WRI, th: THRESHOLDS }));
  } catch (e) { /* mở bằng file:// có thể bị chặn — chỉ mất khi tải lại */ }
}

function loadWeights() {
  try {
    const raw = JSON.parse(localStorage.getItem("xp-weights") || "{}");
    if (raw.wri) mergeNumbers(WRI, raw.wri);   // nhận cả points lẫn gap
    if (raw.th) THRESHOLD_DEFAULT_KEYS.forEach(k => {
      if (typeof raw.th[k] === "number" && isFinite(raw.th[k])) THRESHOLDS[k] = raw.th[k];
    });
  } catch (e) { /* dữ liệu hỏng thì dùng mặc định */ }
}

/** Chỉ nhận lại các GIÁ TRỊ SỐ từ bản đã lưu, giữ nguyên cấu trúc hiện tại.
    Nhờ vậy bản lưu cũ không làm mất thành phần mới thêm vào sau này. */
function mergeNumbers(target, saved) {
  if (!saved || typeof saved !== "object") return;
  Object.keys(target).forEach(k => {
    if (typeof target[k] === "number" && typeof saved[k] === "number" && isFinite(saved[k])) {
      target[k] = saved[k];
    } else if (target[k] && typeof target[k] === "object") {
      mergeNumbers(target[k], saved[k]);
    }
  });
}

function resetWeights() {
  if (!confirm(t("weightResetConfirm"))) return;
  mergeNumbers(WRI, WRI_DEFAULT);
  THRESHOLDS.dueSoonDays = 7;
  THRESHOLDS.hhiConcentrated = 1.35;
  THRESHOLDS.hhiTight = 1.80;
  THRESHOLDS.dataThin = 0.50;
  saveWeights();
  S.all = enrich(S.all);
  applyFilters();
  toast(t("weightReset"), "ok");
}

/* ==========================================================================
   TIẾN ĐỘ TỪ HẠNG MỤC NHỎ
   donePct    — bao nhiêu phần khối lượng đã xong (đếm theo số hạng mục)
   elapsedPct — bao nhiêu phần thời gian đã trôi qua, null nếu thiếu mốc
   Hai con số này đặt cạnh nhau chính là thước đo "lệch tiến độ".
   ========================================================================== */
function progressOf(p) {
  const subs = S.subs[p.id] || [];
  const total = subs.length;
  const done = subs.filter(s => s.done).length;
  const donePct = total ? Math.round(done / total * 100) : (p.status === "Done" ? 100 : 0);

  let elapsedPct = null;
  const s = toDate(p.timeline_start), e = toDate(p.timeline_end);
  if (s && e && e >= s && p.status !== "Done") {
    const span = Math.max(1, daysBetween(s, e));
    elapsedPct = Math.min(100, Math.max(0, Math.round(daysBetween(s, today0()) / span * 100)));
  }
  return { total, done, donePct, elapsedPct,
           overdueSubs: subs.filter(x => !x.done && x.due && toDate(x.due) < today0()).length };
}

/** Các trường bị phạt khi thiếu. "Bước tiếp theo" cố ý KHÔNG nằm trong đây. */
function missingFields(p) {
  return WRI.data.fields.filter(f => !p[f.key] || !String(p[f.key]).trim()).map(f => f.key);
}

/** Diễn giải lý do sang chữ theo ngôn ngữ đang chọn. */
function reasonText(w) {
  const [k, n] = w.reasonKey;
  const v = t("reason." + k);
  return typeof v === "function" ? v(n) : v;
}

/* --- Luồng chiến lược --------------------------------------------------- */
function wordBag(s) {
  return " " + String(s||"").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).join(" ") + " ";
}
function streamLabel(id) {
  const built = t("streams." + id);
  return typeof built === "string" && built !== "streams." + id ? built : id;
}

/** Quy mọi cách ghi về một mã chuẩn.
    Dữ liệu cũ có thể lưu thẳng tên hiển thị ("Sản phẩm & Nền tảng") thay vì mã
    ("product"). Nếu không quy về một mối, danh sách sẽ hiện hai dòng trùng tên. */
function canonicalStreamId(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (STREAM_RULES.some(r => r.id === s)) return s;
  const low = s.toLowerCase();
  for (const r of STREAM_RULES) {
    for (const lang of Object.keys(I18N)) {
      const lbl = I18N[lang] && I18N[lang].streams && I18N[lang].streams[r.id];
      if (typeof lbl === "string" && lbl.toLowerCase() === low) return r.id;
    }
  }
  return s;                       // luồng do người dùng tự đặt tên
}
/** So khớp theo TỪ NGUYÊN VẸN — nếu không, "app" sẽ khớp nhầm vào "Apply". */
function streamOf(p) {
  if (p.stream && String(p.stream).trim()) {
    const raw = canonicalStreamId(p.stream);
    if (!S.hiddenStreams.includes(raw)) return { id: raw, name: streamLabel(raw), inferred: false };
  }
  const bag = wordBag(String(p.title||"") + " " + String(p.description||""));
  let best = null, bestScore = 0;
  STREAM_RULES.forEach(r => {
    if (S.hiddenStreams.includes(r.id)) return;      // luồng đã xóa thì không đoán ra nữa
    const hits = r.keys.filter(k => bag.includes(" " + k + " ")).length;
    if (hits > bestScore) { bestScore = hits; best = r.id; }
  });
  return best ? { id: best, name: streamLabel(best), inferred: true }
              : { id: "__none", name: t("noStreamYet"), inferred: false };
}

function enrich(rows) {
  return rows.map(p => {
    const c = Object.assign({}, p);
    c._wri = computeWRI(c);
    c._stream = streamOf(c);
    return c;
  });
}

/** Mọi luồng đang có: dựng sẵn + do người dùng tạo + đã dùng trong dữ liệu. */
function allStreams() {
  const ids = STREAM_RULES.map(r => r.id)
    .concat(S.customStreams)
    .concat(S.all.map(p => p._stream.id))
    .map(canonicalStreamId)
    .filter(id => id && id !== "__none" && !S.hiddenStreams.includes(id));
  return [...new Set(ids)].map(id => ({ id, name: streamLabel(id) }));
}

/* ==========================================================================
   6. TỔNG HỢP TOÀN DANH MỤC
   ========================================================================== */
function digest(items) {
  const active = items.filter(p => p.status !== "Done");
  const d = { total: items.length, active: active.length,
              done: items.filter(p => p.status === "Done").length, counts: {} };

  Object.keys(FLAGS).forEach(k => { d.counts[k] = items.filter(FLAGS[k].test).length; });

  d.portfolioWRI = active.length ? Math.round(active.reduce((s,p) => s + p._wri.score, 0) / active.length) : 0;
  d.portfolioBand = bandOf(d.portfolioWRI);

  // Một đầu mục có 2 người phụ trách thì mỗi người gánh 0.5.
  const load = {};
  active.forEach(p => {
    const list = picsOf(p);
    if (!list.length) { load[t("unassigned")] = (load[t("unassigned")]||0) + 1; return; }
    list.forEach(n => { load[n] = (load[n]||0) + 1/list.length; });
  });
  d.load = Object.entries(load).map(([name, weight]) => ({ name, weight })).sort((a,b) => b.weight - a.weight);
  const totalW = d.load.reduce((s,x) => s + x.weight, 0) || 1;
  d.load.forEach(x => { x.share = x.weight / totalW; });

  // HHI so với mức chia đều 1/N. Hai người chia đôi luôn cho HHI 0.50 — đó là
  // đều nhất có thể, nên phải so tỷ lệ chứ không so con số thô.
  d.hhi = d.load.reduce((s,x) => s + x.share*x.share, 0);
  d.owners = d.load.length;
  d.hhiBase = d.owners ? 1 / d.owners : 1;
  d.hhiRatio = d.owners ? d.hhi / d.hhiBase : 1;
  d.topOwner = d.load[0] || null;
  d.concKey = d.owners <= 1 ? "solo"
            : d.hhiRatio >= THRESHOLDS.hhiTight ? "tight"
            : d.hhiRatio >= THRESHOLDS.hhiConcentrated ? "some" : "even";
  d.tooConcentrated = d.concKey !== "even";

  // Chất lượng dữ liệu — CHỈ đếm các trường thực sự cần có.
  // "Bước tiếp theo" không nằm ở đây vì để trống là hợp lệ.
  const fields = ["timeline_end", "timeline_start", "description"];
  d.quality = fields.map(key => {
    const filled = items.filter(p => p[key] && String(p[key]).trim());
    return { key, label: t("qFields." + key), filled: filled.length, total: items.length,
             pct: pct(filled.length, items.length),
             missingItems: items.filter(p => !p[key] || !String(p[key]).trim()) };
  });
  d.cellsFilled = d.quality.reduce((s,q) => s + q.filled, 0);
  d.cellsTotal  = fields.length * items.length;
  d.completeness = pct(d.cellsFilled, d.cellsTotal);
  // Con số hiện trên thẻ tab "Dữ liệu & hệ thống".
  d.itemsNeedingData = items.filter(p => fields.some(k => !p[k] || !String(p[k]).trim())).length;

  // --- Tiến độ toàn danh mục ---
  // Cộng theo SỐ HẠNG MỤC, không lấy trung bình phần trăm: đầu mục 10 việc phải
  // nặng hơn đầu mục 2 việc, lấy trung bình sẽ làm hai cái ngang nhau.
  d.subTotal = 0; d.subDone = 0; d.itemsWithSubs = 0; d.lateSubs = 0;
  let elSum = 0, elCount = 0;
  items.forEach(p => {
    const pr = p._wri.progress;
    if (!pr || !pr.total) return;
    d.itemsWithSubs++; d.subTotal += pr.total; d.subDone += pr.done; d.lateSubs += pr.overdueSubs;
    if (pr.elapsedPct !== null) { elSum += pr.elapsedPct; elCount++; }
  });
  d.donePct    = d.subTotal ? Math.round(d.subDone / d.subTotal * 100) : null;
  d.elapsedPct = elCount ? Math.round(elSum / elCount) : null;
  d.driftGap   = (d.donePct !== null && d.elapsedPct !== null) ? d.elapsedPct - d.donePct : null;
  d.drifting   = d.driftGap !== null && d.driftGap >= minDriftGap();

  return d;
}

/* ==========================================================================
   7. TÓM TẮT ĐIỀU HÀNH — ghép câu theo dữ liệu
   ========================================================================== */
function execSentence(d) {
  const E = t("exec");
  if (!d.total) return E.empty;
  if (!d.active) return E.allDone(d.total);

  const parts = [E.level(d.portfolioBand.label.toLowerCase(), d.portfolioWRI, d.active)];

  const alarms = [];
  if (d.counts.overdue)  alarms.push(E.overdue(d.counts.overdue));
  if (d.counts.dueSoon)  alarms.push(E.dueSoon(d.counts.dueSoon, THRESHOLDS.dueSoonDays));
  if (d.counts.critical) alarms.push(E.critical(d.counts.critical));
  parts.push(alarms.length ? capFirst(alarms.join(", ")) + "." : E.noAlarms);

  if (d.topOwner && d.tooConcentrated) {
    parts.push(E.concentrated(t("concLevels." + d.concKey), esc(d.topOwner.name),
                              Math.round(d.topOwner.share*100), d.hhi.toFixed(2)));
  } else if (d.owners > 1) {
    parts.push(E.even(d.owners, d.hhi.toFixed(2), d.hhiBase.toFixed(2)));
  }

  if (d.counts.noDue) parts.push(E.noDue(d.counts.noDue));

  // Mệnh đề tiến độ — chỉ nói khi thật sự có hạng mục nhỏ để nói.
  if (d.subTotal) {
    parts.push(d.drifting
      ? E.drift(d.donePct, d.subDone, d.subTotal, d.elapsedPct, d.driftGap)
      : E.progress(d.donePct, d.subDone, d.subTotal));
  }

  parts.push(d.completeness < THRESHOLDS.dataThin * 100 ? E.dataThin(d.completeness) : E.dataOk(d.completeness));
  return parts.join(" ");
}
function capFirst(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/* ==========================================================================
   8. LỌC — nguồn duy nhất cập nhật mọi màn hình
   ========================================================================== */
function applyFilters() {
  const f = S.filters;
  const from = toDate(f.from), to = toDate(f.to);
  const q = f.q.trim().toLowerCase();

  S.view = S.all.filter(p => {
    if (q) {
      const hay = [p.title, p.pic, p.next_steps, p.description, p._stream.name].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    // Mảng rỗng = không lọc. Có phần tử = giữ dòng khớp BẤT KỲ giá trị nào (hoặc).
    if (f.pic.length      && !picsOf(p).some(n => f.pic.includes(n))) return false;
    if (f.status.length   && !f.status.includes(p.status)) return false;
    if (f.priority.length && !f.priority.includes(p.priority)) return false;
    if (f.stream.length   && !f.stream.includes(p._stream.id)) return false;
    if (f.band.length     && !f.band.includes(p._wri.band.key)) return false;

    if (from || to) {
      const s = toDate(p.timeline_start), e = toDate(p.timeline_end);
      const start = s || e, end = e || s;
      if (!start) return false;
      if (from && end < from) return false;
      if (to && start > to) return false;
    }
    for (const k of f.flags) { if (!FLAGS[k].test(p)) return false; }
    return true;
  });

  renderAll();
}

function setFilter(key, value) {
  // Biểu đồ và chip vẫn gọi bằng một giá trị; ô lọc dạng danh sách cần mảng.
  const listKeys = ["pic","status","priority","stream","band"];
  if (listKeys.includes(key)) {
    if (value === "ALL" || value === "" || value == null) S.filters[key] = [];
    else if (Array.isArray(value)) S.filters[key] = value.slice();
    else S.filters[key] = [value];
  } else {
    S.filters[key] = value;
  }
  syncFilterInputs();
  applyFilters();
}
function clearFilters() {
  S.filters = { q: "", pic: [], status: [], priority: [], stream: [], band: [], from: "", to: "", flags: [] };
  syncFilterInputs(); applyFilters(); toast(t("filterCleared"), "ok");
}
function syncFilterInputs() {
  el("globalSearch").value = S.filters.q;
  [["fPic","pic"],["fStatus","status"],["fPriority","priority"],
   ["fStream","stream"],["fBand","band"]].forEach(([h,k]) => paintMulti(h,k));
  el("fFrom").value = S.filters.from;
  el("fTo").value = S.filters.to;
}
function isFiltering() {
  const f = S.filters;
  return !!(f.q || f.flags.length || f.from || f.to || f.pic.length ||
            f.status.length || f.priority.length || f.stream.length || f.band.length);
}
function focusItem(id) { openModal(id); }

/* ==========================================================================
   9. TẢI DỮ LIỆU
   ========================================================================== */
async function loadData() {
  if (S.demo) { S.all = enrich(DEMO_ROWS); afterLoad(); return; }

  const { data, error } = await S.sb.from("projects").select("*");
  if (error) { toast(t("errLoad")(error.message), "err"); return; }

  const rows = data || [];
  if (rows.length) {
    S.hasStream    = Object.prototype.hasOwnProperty.call(rows[0], "stream");
    S.hasBlockedBy = Object.prototype.hasOwnProperty.call(rows[0], "blocked_by");
    S.hasProgress  = Object.prototype.hasOwnProperty.call(rows[0], "progress");
  }
  S.all = enrich(rows);

  if (S.hasBlockedBy) {
    S.links = [];
    S.all.forEach(p => (p.blocked_by || []).forEach(src => S.links.push({ from: src, to: p.id, saved: true })));
  }

  await loadSubtasks();
  S.all = enrich(S.all);       // chấm lại sau khi đã biết tiến độ
  afterLoad();
}

/** Nạp hạng mục nhỏ. Bảng chưa tồn tại thì app vẫn chạy, chỉ là không có tiến độ. */
async function loadSubtasks() {
  S.subs = {};
  if (S.demo) { DEMO_SUBS.forEach(addSubToStore); S.hasSubs = true; S.hasSubFields = true; return; }

  const { data, error } = await S.sb.from("subtasks").select("*").order("sort_order", { ascending: true });
  if (error) {
    S.hasSubs = false;
    if (!S.warnedNoSubs) { S.warnedNoSubs = true; toast(t("subNoTable"), "err"); }
    return;
  }
  S.hasSubs = true;
  // Dò xem đã chạy migrate_v4 chưa, để bật/tắt các ô mô tả, ưu tiên, trạng thái.
  const rows = data || [];
  S.hasSubFields = rows.length
    ? Object.prototype.hasOwnProperty.call(rows[0], "status")
    : true;                       // bảng rỗng thì cứ cho là có, lỗi sẽ tự lộ khi ghi
  rows.forEach(addSubToStore);
}

function addSubToStore(s) {
  (S.subs[s.project_id] = S.subs[s.project_id] || []).push(s);
}

/* ==========================================================================
   GHI HẠNG MỤC NHỎ
   Mọi thao tác đều cập nhật màn hình trước rồi mới gửi lên, và hoàn tác nếu
   máy chủ báo lỗi — giao diện không bao giờ hiển thị thứ chưa lưu được.
   ========================================================================== */
async function addSub(projectId, title, extra) {
  const clean = String(title || "").trim();
  if (!clean) return;
  const list = S.subs[projectId] = S.subs[projectId] || [];

  // Trùng tên trong cùng một đầu mục gần như luôn là bấm nhầm hai lần.
  if (list.some(s => s.title.trim().toLowerCase() === clean.toLowerCase())) {
    toast(t("subDuplicate"), "err");
    return;
  }

  const base = Object.assign({
    project_id: projectId, title: clean, sort_order: list.length,
    priority: "Medium", status: "Open", done: false, note: null, owner: null, due: null
  }, extra || {});
  if (base.status === "Done") base.done = true;

  if (S.demo) { list.push(Object.assign({ id: "tmp-" + Date.now() }, base)); afterSubChange(projectId); return; }
  if (!S.hasSubs) { toast(t("subNoTable"), "err"); return; }

  // Chỉ gửi những cột thật sự tồn tại, để bản chưa chạy migrate_v4 vẫn chạy được.
  const payload = { project_id: projectId, title: clean, sort_order: list.length, done: base.done };
  if (S.hasSubFields) {
    payload.note = base.note; payload.priority = base.priority; payload.status = base.status;
  }
  if (base.owner) payload.owner = base.owner;
  if (base.due)   payload.due = base.due;

  const { data, error } = await S.sb.from("subtasks").insert([payload]).select();
  if (error) { toast(t("errSave")(error.message), "err"); return; }
  list.push((data && data[0]) || Object.assign({ id: "tmp-" + Date.now() }, base));
  afterSubChange(projectId);
}

async function updateSub(projectId, subId, patch) {
  const list = S.subs[projectId] || [];
  const s = list.find(x => String(x.id) === String(subId));
  if (!s) return;

  // done và status là hai cách nói cùng một việc — luôn chỉnh cả hai cùng lúc,
  // nếu không thanh tiến độ và ô trạng thái sẽ nói hai điều khác nhau.
  if ("status" in patch) patch.done = (patch.status === "Done");
  else if ("done" in patch && S.hasSubFields) patch.status = patch.done ? "Done" : (s.status === "Done" ? "Open" : (s.status || "Open"));

  const before = {};
  Object.keys(patch).forEach(k => { before[k] = s[k]; });
  Object.assign(s, patch);
  afterSubChange(projectId);

  if (S.demo || !S.hasSubs || String(subId).startsWith("tmp-")) return;

  // Bỏ các cột chưa tồn tại nếu chưa chạy migrate_v4.
  const send = {};
  Object.keys(patch).forEach(k => {
    if (!S.hasSubFields && ["note","priority","status"].includes(k)) return;
    send[k] = patch[k];
  });
  if (!Object.keys(send).length) return;

  const { error } = await S.sb.from("subtasks").update(send).eq("id", subId);
  if (error) { Object.assign(s, before); afterSubChange(projectId); toast(t("errSave")(error.message), "err"); }
}

async function deleteSub(projectId, subId) {
  const list = S.subs[projectId] || [];
  const i = list.findIndex(x => String(x.id) === String(subId));
  if (i < 0) return;
  const [removed] = list.splice(i, 1);
  afterSubChange(projectId);

  if (S.demo || !S.hasSubs || String(subId).startsWith("tmp-")) return;
  const { error } = await S.sb.from("subtasks").delete().eq("id", subId);
  if (error) { list.splice(i, 0, removed); afterSubChange(projectId); toast(t("errSave")(error.message), "err"); }
}

/** Sau mỗi thay đổi: chấm lại đúng đầu mục đó rồi vẽ lại cả trang. */
function afterSubChange(projectId) {
  const p = S.all.find(x => String(x.id) === String(projectId));
  if (p) p._wri = computeWRI(p);
  applyFilters();
  if (el("subList") && S.modalId === projectId) renderSubEditor();
}

function afterLoad() {
  S.all.sort((a,b) => b._wri.score - a._wri.score);
  fillSelects();
  applyFilters();
}

function fillSelects() {
  const names = [...new Set(S.all.flatMap(picsOf))].sort((a,b) => a.localeCompare(b, LANG));
  el("picList").innerHTML = names.map(n => `<option value="${esc(n)}"></option>`).join("");

  // Bỏ khỏi bộ lọc những tên không còn tồn tại, nếu không sẽ lọc ra rỗng mà
  // người dùng không hiểu vì sao.
  S.filters.pic = S.filters.pic.filter(n => names.includes(n));
  const streamIds = allStreams().map(s => s.id);
  S.filters.stream = S.filters.stream.filter(id => streamIds.includes(id));

  buildMulti("fPic",      names.map(n => ({ v: n, label: n })),                       "pic");
  buildMulti("fStatus",   STATUSES.map(s => ({ v: s, label: s })),                    "status");
  buildMulti("fPriority", PRIORITIES.map(s => ({ v: s, label: s })),                  "priority");
  buildMulti("fStream",   allStreams().map(s => ({ v: s.id, label: s.name })),        "stream");
  buildMulti("fBand",     BANDS.map(b => ({ v: b.key, label: t("bands."+b.key) + " · " + b.min + "+" })), "band");

  syncFilterInputs();
}

/* ==========================================================================
   Ô CHỌN NHIỀU
   Thẻ <select> thường chỉ chọn được một giá trị; <select multiple> thì phải
   giữ Ctrl và rất dễ bấm nhầm mất hết lựa chọn. Nên dùng nút bấm mở danh sách
   có hộp tick — chọn bao nhiêu tùy ý, bấm ra ngoài là đóng.
   ========================================================================== */
function buildMulti(hostId, options, key) {
  const host = el(hostId);
  if (!host) return;
  host.innerHTML = `
    <button type="button" class="ms-btn" data-ms="${key}">
      <span class="ms-label"></span><i class="bi bi-chevron-down"></i>
    </button>
    <div class="ms-pop d-none">
      ${options.length > 8 ? `<input type="text" class="ms-search" placeholder="${esc(t("msSearch"))}" />` : ""}
      <div class="ms-list">
        ${options.map(o => `<label class="ms-opt"><input type="checkbox" value="${esc(o.v)}" /><span>${esc(o.label)}</span></label>`).join("")}
      </div>
      <div class="ms-foot">
        <button type="button" class="linkbtn ms-all">${esc(t("msAll"))}</button>
        <button type="button" class="linkbtn ms-none">${esc(t("msNone"))}</button>
      </div>
    </div>`;

  const pop = host.querySelector(".ms-pop");
  const boxes = () => Array.from(host.querySelectorAll(".ms-opt input"));

  const commit = () => {
    S.filters[key] = boxes().filter(b => b.checked).map(b => b.value);
    paintMulti(hostId, key);
    applyFilters();
  };

  host.querySelector(".ms-btn").addEventListener("click", e => {
    e.stopPropagation();
    const wasOpen = !pop.classList.contains("d-none");
    closeAllMulti();
    if (!wasOpen) pop.classList.remove("d-none");
  });
  pop.addEventListener("click", e => e.stopPropagation());
  boxes().forEach(b => b.addEventListener("change", commit));
  host.querySelector(".ms-all").addEventListener("click", () => { boxes().forEach(b => b.checked = true); commit(); });
  host.querySelector(".ms-none").addEventListener("click", () => { boxes().forEach(b => b.checked = false); commit(); });

  const search = host.querySelector(".ms-search");
  if (search) search.addEventListener("input", e => {
    const q = e.target.value.trim().toLowerCase();
    host.querySelectorAll(".ms-opt").forEach(o =>
      o.classList.toggle("d-none", !!q && !o.textContent.toLowerCase().includes(q)));
  });

  paintMulti(hostId, key);
}

/** Cập nhật chữ trên nút và trạng thái các hộp tick theo S.filters. */
function paintMulti(hostId, key) {
  const host = el(hostId);
  if (!host) return;
  const sel = S.filters[key] || [];
  host.querySelectorAll(".ms-opt input").forEach(b => { b.checked = sel.includes(b.value); });

  const lbl = host.querySelector(".ms-label");
  if (!lbl) return;        // ô chưa được dựng — thoát êm, không làm chết cả trang
  if (!sel.length) { lbl.textContent = t("all"); lbl.classList.remove("is-on"); }
  else {
    const first = host.querySelector(`.ms-opt input[value="${CSS.escape(sel[0])}"]`);
    const name = first ? first.parentElement.textContent.trim() : sel[0];
    lbl.textContent = sel.length === 1 ? name : t("msCount")(name, sel.length - 1);
    lbl.classList.add("is-on");
  }
  host.classList.toggle("is-on", sel.length > 0);
}

function closeAllMulti() {
  document.querySelectorAll(".ms-pop").forEach(p => p.classList.add("d-none"));
}

/* ==========================================================================
   10. GHI DỮ LIỆU
   ========================================================================== */
function openModal(id) {
  S.modalId = id || null;
  const p = id ? S.all.find(x => String(x.id) === String(id)) : null;

  el("modalTitle").textContent = p ? t("modalEdit") : t("modalNew");
  el("modalSub").textContent = p ? t("modalEditSub")(p._wri.score, p._wri.band.label.toLowerCase()) : t("modalNewSub");
  el("modalError").classList.add("d-none");
  el("btnDelete").style.display = p ? "" : "none";

  el("mTitle").value    = p ? (p.title || "") : "";
  el("mDesc").value     = p ? (p.description || "") : "";
  el("mStart").value    = p && p.timeline_start ? String(p.timeline_start).slice(0,10) : "";
  el("mEnd").value      = p && p.timeline_end ? String(p.timeline_end).slice(0,10) : "";
  el("mPic").value      = p ? (p.pic || "") : "";
  el("mPriority").value = p ? (p.priority || "Medium") : "Medium";
  el("mStatus").value   = p ? (p.status || "Open") : "Open";
  el("mNext").value     = p ? (p.next_steps || "") : "";

  // Phải quy về mã chuẩn: dữ liệu có thể lưu tên hiển thị ("Product & Platform")
  // trong khi các option dùng mã ("product"). Không quy đổi thì ô luôn về trống
  // và người dùng phải chọn lại mỗi lần mở.
  fillStreamSelect(p && p.stream ? canonicalStreamId(p.stream) : "");
  el("mStream").disabled = !S.hasStream;
  el("streamHint").textContent = S.hasStream ? t("streamHintOn") : t("streamHintOff");

  renderSubEditor();
  try { ensureStreamManageUI(); } catch (e) { console.warn("Không dựng được khu quản lý luồng:", e); }
  renderWriPreview();

  // MỘT bản popup duy nhất cho cả vòng đời trang. Tạo mới mỗi lần mở sẽ để lại
  // các bản cũ còn gắn sự kiện, khiến trang bị khóa cuộn sau khi đóng.
  if (!S.modal) S.modal = bootstrap.Modal.getOrCreateInstance(el("itemModal"));
  S.modal.show();
}
function closeModal() { if (S.modal) S.modal.hide(); }

/** Danh sách luồng trong form, kèm mục "tạo luồng mới". */
function fillStreamSelect(selected) {
  el("mStream").innerHTML =
    `<option value="">${esc(t("streamAuto"))}</option>` +
    allStreams().map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("") +
    `<option value="__new">${esc(t("streamCreate"))}</option>`;
  el("mStream").value = selected || "";
}


/* ==========================================================================
   QUẢN LÝ LUỒNG — thêm và xóa
   Danh sách luồng tùy chỉnh được nhớ lại cho lần mở sau bằng bộ nhớ trình duyệt.
   ========================================================================== */
function saveStreamPrefs() {
  try {
    localStorage.setItem("xp-streams", JSON.stringify({ hidden: S.hiddenStreams, custom: S.customStreams }));
  } catch (e) { /* mở bằng file:// có thể bị chặn — bỏ qua, chỉ mất khi tải lại */ }
}
function loadStreamPrefs() {
  try {
    const r = JSON.parse(localStorage.getItem("xp-streams") || "{}");
    if (Array.isArray(r.hidden)) S.hiddenStreams = r.hidden;
    if (Array.isArray(r.custom)) S.customStreams = r.custom;
  } catch (e) { /* dữ liệu hỏng thì dùng mặc định */ }
}

/** Dựng khu quản lý luồng ngay dưới ô chọn, chỉ tạo một lần.
    Bám vào ô chọn thay vì một id cố định — nếu khung HTML đổi, chỗ này vẫn chạy
    thay vì làm hỏng cả việc mở popup. */
function ensureStreamManageUI() {
  if (el("streamManage")) return;
  const select = el("mStream");
  const host = select && select.parentElement;
  if (!host) return;                       // không có chỗ gắn thì bỏ qua, không làm vỡ popup

  const btn = document.createElement("button");
  btn.type = "button"; btn.className = "link-btn"; btn.id = "btnManageStreams";
  btn.textContent = t("manageStreams");

  const box = document.createElement("div");
  box.id = "streamManage"; box.className = "stream-manage d-none";

  host.appendChild(btn);
  host.appendChild(box);

  btn.addEventListener("click", () => {
    box.classList.toggle("d-none");
    if (!box.classList.contains("d-none")) renderStreamManage();
  });
}

function renderStreamManage() {
  const box = el("streamManage");
  if (!box) return;
  const list = allStreams();

  box.innerHTML = (list.length
    ? list.map(s => {
        const n = S.all.filter(p => p._stream.id === s.id).length;
        return `<div class="sm-row">
          <span class="sm-name">${esc(s.name)}</span>
          <span class="sm-count">${esc(t("streamInUse")(n))}</span>
          <button type="button" class="icon-btn danger" data-del="${esc(s.id)}"
                  title="${esc(t("deleteStream"))}"><i class="bi bi-trash3"></i></button>
        </div>`;
      }).join("")
    : `<div class="sm-empty">${esc(t("streamNoneLeft"))}</div>`)
    + (S.hiddenStreams.length
        ? `<button type="button" class="link-btn" id="btnRestoreStreams">${esc(t("streamRestore"))}</button>`
        : "");

  box.querySelectorAll("[data-del]").forEach(b =>
    b.addEventListener("click", () => deleteStream(b.dataset.del)));
  const rb = el("btnRestoreStreams");
  if (rb) rb.addEventListener("click", restoreStreams);
}

/** Xóa một luồng. Các đầu mục đang gán luồng đó được gỡ về "tự suy ra". */
async function deleteStream(id) {
  const name = streamLabel(id);
  const using = S.all.filter(p => p._stream.id === id);
  const assigned = using.filter(p => p.stream);      // chỉ những cái gán tay mới cần ghi lại

  if (!confirm(t("streamDeleteConfirm")(name, using.length))) return;

  if (assigned.length && S.hasStream && !S.demo) {
    const { error } = await S.sb.from("projects").update({ stream: null })
                                .in("id", assigned.map(p => p.id));
    if (error) { toast(t("errSave")(error.message), "err"); return; }
  }
  assigned.forEach(p => { p.stream = null; });

  // Luồng dựng sẵn thì đánh dấu ẩn, nếu không hệ thống sẽ đoán ra lại ngay.
  if (STREAM_RULES.some(r => r.id === id) && !S.hiddenStreams.includes(id)) S.hiddenStreams.push(id);
  S.customStreams = S.customStreams.filter(x => canonicalStreamId(x) !== id);
  saveStreamPrefs();

  S.all = enrich(S.all);
  fillSelects();
  if (el("mStream")) fillStreamSelect(el("mStream").value === id ? "" : el("mStream").value);
  renderStreamManage();
  applyFilters();
  toast(t("streamDeleted")(name), "ok");
}

/** Khôi phục các luồng dựng sẵn đã xóa — để xóa nhầm vẫn quay lại được. */
function restoreStreams() {
  S.hiddenStreams = [];
  saveStreamPrefs();
  S.all = enrich(S.all);
  fillSelects();
  if (el("mStream")) fillStreamSelect(el("mStream").value);
  renderStreamManage();
  applyFilters();
  toast(t("streamRestored"), "ok");
}

/** Người dùng tự tạo luồng mới — luồng sẵn có giữ nguyên, chỉ thêm vào. */
function createStream(preset) {
  const name = (preset !== undefined ? preset : prompt(t("newStreamPrompt"), ""));
  if (!name || !name.trim()) return null;
  const clean = name.trim();
  const exists = allStreams().some(s => s.name.toLowerCase() === clean.toLowerCase() || s.id === clean);
  if (exists) { toast(t("streamExists"), "err"); return clean; }
  S.customStreams.push(clean);
  saveStreamPrefs();
  fillSelects();
  toast(t("streamAdded")(clean), "ok");
  return clean;
}

function renderWriPreview() {
  const w = computeWRI(readForm());
  const parts = [
    { k: "schedule", c: "#E11D48" }, { k: "priority", c: "#EA8C0B" },
    { k: "status",   c: "#A855F7" }, { k: "data",     c: "#8A968F" }
  ];
  const total = Math.max(w.score, 1);
  el("wriPreview").innerHTML = `
    <div class="wp-head">
      <span class="lbl" style="margin:0">${esc(t("wriPreview"))}</span>
      <span class="wp-score" style="color:${w.band.color}">${w.score}<small style="font-size:12px;color:var(--ink-3)">/100 · ${esc(w.band.label)}</small></span>
    </div>
    <div class="wp-parts">${parts.map(x => `<i style="width:${w.parts[x.k]/total*100}%;background:${x.c}"></i>`).join("")}</div>
    <div class="wp-legend">${parts.map(x => `<span><i style="background:${x.c}"></i>${esc(t(WRI[x.k].labelKey))} ${w.parts[x.k]}</span>`).join("")}</div>`;
}

function readForm() {
  return {
    title: el("mTitle").value.trim(),
    description: el("mDesc").value.trim() || null,
    timeline_start: el("mStart").value || null,
    timeline_end: el("mEnd").value || null,
    pic: el("mPic").value.trim(),
    priority: el("mPriority").value,
    status: el("mStatus").value,
    next_steps: el("mNext").value.trim() || null
  };
}

async function saveItem(e) {
  e.preventDefault();
  const err = el("modalError");
  err.classList.add("d-none");

  const payload = readForm();
  if (payload.timeline_start && payload.timeline_end && payload.timeline_end < payload.timeline_start) {
    err.textContent = t("errDates"); err.classList.remove("d-none"); return;
  }
  if (S.hasStream) payload.stream = el("mStream").value && el("mStream").value !== "__new" ? el("mStream").value : null;

  if (S.demo) {
    if (S.modalId) Object.assign(S.all.find(x => String(x.id) === String(S.modalId)), payload);
    else S.all.push(Object.assign({ id: "demo-" + Date.now() }, payload));
    S.all = enrich(S.all);
    closeModal(); toast(t("savedDemo"), "ok"); afterLoad(); return;
  }

  const q = S.modalId ? S.sb.from("projects").update(payload).eq("id", S.modalId)
                      : S.sb.from("projects").insert([payload]);
  const { error } = await q;
  if (error) { err.textContent = t("errSave")(error.message); err.classList.remove("d-none"); return; }

  closeModal();
  toast(S.modalId ? t("savedEdit") : t("savedNew"), "ok");
  await loadData();
}

async function deleteItem() {
  const p = S.all.find(x => String(x.id) === String(S.modalId));
  if (!p || !confirm(t("confirmDelete")(p.title))) return;

  if (S.demo) {
    S.all = S.all.filter(x => String(x.id) !== String(S.modalId));
    closeModal(); toast(t("deleted"), "ok"); afterLoad(); return;
  }
  const { error } = await S.sb.from("projects").delete().eq("id", S.modalId);
  if (error) { toast(t("errDelete")(error.message), "err"); return; }
  closeModal(); toast(t("deleted"), "ok"); await loadData();
}

/** Kéo thả trên bảng điều hành gọi vào đây. Sau khi ghi, applyFilters() chạy
    lại nên chỉ số, biểu đồ, bản đồ rủi ro và mọi tab khác đồng bộ theo. */
async function updateStatus(id, status) {
  const p = S.all.find(x => String(x.id) === String(id));
  if (!p || p.status === status) return;

  p.status = status;
  p._wri = computeWRI(p);      // chấm lại rủi ro ngay lập tức

  if (!S.demo) {
    const { error } = await S.sb.from("projects").update({ status }).eq("id", id);
    if (error) { toast(t("errSave")(error.message), "err"); await loadData(); return; }
  }
  const short = p.title.length > 34 ? p.title.slice(0,34) + "…" : p.title;
  toast(t("boardMoved")(short, status), "ok");
  applyFilters();
}

/* ==========================================================================
   SỬA NHANH MỘT TRƯỜNG — dùng cho bảng Danh sách
   Chỉ gửi lên đúng cột vừa đổi. Nếu Supabase báo lỗi thì trả lại giá trị cũ,
   để giao diện không bao giờ hiển thị thứ chưa thật sự được lưu.
   ========================================================================== */
const FIELD_LABEL = { status: "fieldStatus", priority: "fieldPriority",
                      timeline_end: "fieldDue", pic: "fieldOwner" };

async function saveField(id, field, raw) {
  const p = S.all.find(x => String(x.id) === String(id));
  if (!p) return;

  let value = (field === "pic") ? String(raw || "").trim() : (raw || null);
  if (String(p[field] == null ? "" : p[field]) === String(value == null ? "" : value)) return;
  if (field === "pic" && !value) { toast(t("errNoOwner"), "err"); renderList(); return; }

  // Hạn chốt không được sớm hơn ngày bắt đầu.
  if (field === "timeline_end" && value && p.timeline_start &&
      value < String(p.timeline_start).slice(0, 10)) {
    toast(t("errDateOrder"), "err"); renderList(); return;
  }

  const before = p[field];
  p[field] = value;
  p._wri = computeWRI(p);          // chấm lại rủi ro ngay

  if (!S.demo) {
    const patch = {}; patch[field] = value;
    const { error } = await S.sb.from("projects").update(patch).eq("id", id);
    if (error) {                    // hoàn tác để không hiển thị sai sự thật
      p[field] = before; p._wri = computeWRI(p);
      toast(t("errSave")(error.message), "err");
      applyFilters(); return;
    }
  }
  if (field === "pic") fillSelects();
  toast(t("fieldSaved")(t(FIELD_LABEL[field])), "ok");
  applyFilters();                   // cả trang đồng bộ theo
}

/* ==========================================================================
   GỢI Ý TÌM KIẾM
   Tách hai nhóm: đầu mục (bấm để mở chi tiết) và người phụ trách (bấm để lọc).
   ========================================================================== */
let suggIndex = -1;

function renderSuggestions() {
  const box = el("searchSugg");
  const q = el("globalSearch").value.trim().toLowerCase();
  if (!q) { closeSuggestions(); return; }

  const items = S.all.filter(p => String(p.title || "").toLowerCase().includes(q)).slice(0, 6);
  const owners = [...new Set(S.all.flatMap(picsOf))]
    .filter(n => n.toLowerCase().includes(q)).slice(0, 3);

  if (!items.length && !owners.length) {
    box.innerHTML = `<div class="sugg-empty">${esc(t("suggNone"))}</div>`;
    box.classList.remove("d-none"); suggIndex = -1; return;
  }

  let html = "";
  if (items.length) {
    html += `<div class="sugg-group">${esc(t("suggItems"))}</div>`;
    html += items.map(p => `
      <div class="sugg-row" role="option" data-kind="item" data-id="${esc(p.id)}">
        <span class="pill" style="background:${p._wri.band.soft};color:${p._wri.band.color}">${p._wri.score}</span>
        <span class="sugg-main">${esc(p.title)}</span>
        <span class="sugg-hint">${esc(t("suggHintOpen"))}</span>
      </div>`).join("");
  }
  if (owners.length) {
    html += `<div class="sugg-group">${esc(t("suggOwners"))}</div>`;
    html += owners.map(n => {
      const cnt = S.all.filter(p => picsOf(p).includes(n)).length;
      return `<div class="sugg-row" role="option" data-kind="owner" data-name="${esc(n)}">
        ${avatar(n, "sm")}
        <span class="sugg-main">${esc(n)}</span>
        <span class="sugg-hint">${cnt} · ${esc(t("suggHintFilter"))}</span>
      </div>`;
    }).join("");
  }

  box.innerHTML = html;
  box.classList.remove("d-none");
  suggIndex = -1;
  box.querySelectorAll(".sugg-row").forEach(r => r.addEventListener("mousedown", e => {
    e.preventDefault();          // giữ ô nhập không mất focus trước khi xử lý
    pickSuggestion(r);
  }));
}

function pickSuggestion(row) {
  closeSuggestions();
  el("globalSearch").value = ""; S.filters.q = "";
  if (row.dataset.kind === "item") { applyFilters(); focusItem(row.dataset.id); }
  else setFilter("pic", row.dataset.name);
}

function closeSuggestions() {
  el("searchSugg").classList.add("d-none");
  el("searchSugg").innerHTML = "";
  suggIndex = -1;
}

function moveSuggestion(step) {
  const rows = [...el("searchSugg").querySelectorAll(".sugg-row")];
  if (!rows.length) return;
  suggIndex = (suggIndex + step + rows.length) % rows.length;
  rows.forEach((r, i) => r.classList.toggle("is-active", i === suggIndex));
  rows[suggIndex].scrollIntoView({ block: "nearest" });
}

/* ==========================================================================
   11. XUẤT CSV
   ========================================================================== */
function exportCsv() {
  const cell = v => `"${String(v === null || v === undefined ? "" : v).replace(/"/g,'""')}"`;
  const lines = [t("csvHead").map(cell).join(",")];
  S.view.forEach(p => {
    const pr = p._wri.progress;
    lines.push([p.title, p.pic, p._stream.name, p.timeline_start, p.timeline_end,
                p.priority, p.status, p.next_steps, p.description,
                p._wri.score, p._wri.band.label,
                pr.total || "", pr.total ? pr.done : "", pr.total ? pr.donePct + "%" : "",
                p._wri.driftGap === null ? "" : p._wri.driftGap].map(cell).join(","));
  });
  // Phụ lục: từng hạng mục con, để mở bằng Excel còn lọc được theo đầu mục cha.
  const subRows = [];
  S.view.forEach(p => (S.subs[p.id] || []).forEach(s =>
    subRows.push([p.title, p._stream.name, s.title, s.done ? "x" : "",
                  s.owner || "", s.due || ""].map(cell).join(","))));
  if (subRows.length) {
    lines.push("");
    lines.push(t("csvSubHead").map(cell).join(","));
    subRows.forEach(r => lines.push(r));
  }

  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `xperise-workstream-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast(t("exported")(S.view.length), "ok");
}

/* ==========================================================================
   12. KHỞI ĐỘNG
   ========================================================================== */
async function boot() {
  initLang();
  applyStaticText();
  loadWeights();
  loadStreamPrefs();
  bindEvents();

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    S.demo = true;
    el("modeNotice").classList.remove("d-none");
    el("modeNotice").innerHTML = t("demoNotice");
  } else {
    S.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  await loadData();
  subscribeRealtime();

  Perf.init(S.sb);
  Docs.init(S.sb);
  let saved = "workstream";
  try { saved = localStorage.getItem("xp_mode") || "workstream"; } catch (e) {}
  setMode(saved === "performance" ? "performance" : "workstream");
}

/** Đồng bộ tức thời.
    Mở được kênh KHÔNG có nghĩa là bảng đang phát tín hiệu — thư viện báo
    "SUBSCRIBED" kể cả khi bảng chưa được bật. Vì vậy chỉ báo xanh sau khi
    thực sự nhận được một thay đổi từ bảng. */
function subscribeRealtime() {
  if (S.demo || !S.sb) return;
  try {
    S.sb.channel("projects-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, () => {
        S.realtime = true;
        loadData();
      })
      .subscribe(status => {
        if (status === "SUBSCRIBED") { S.channelOpen = true; renderSystem(); }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") { S.channelOpen = false; renderSystem(); }
      });
  } catch (e) { /* chưa bật thì bỏ qua, app vẫn chạy bình thường */ }
}

function bindEvents() {
  el("btnNew").addEventListener("click", () => openModal(null));
  el("btnRefresh").addEventListener("click", async () => {
    if (S.mode === "performance") { await Perf.load(); toast(t("reloaded"), "ok"); return; }
    if (S.tab === "docs") { await Docs.load(); toast(t("reloaded"), "ok"); return; }
    await loadData(); toast(t("reloaded"), "ok");
  });
  el("btnClear").addEventListener("click", clearFilters);
  el("btnCsv").addEventListener("click", exportCsv);
  el("btnPrint").addEventListener("click", () => window.print());
  el("itemForm").addEventListener("submit", saveItem);
  el("btnSubAdd").addEventListener("click", submitNewSub);
  el("subNew").addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); submitNewSub(); }   // Enter thêm việc, không gửi form
  });
  el("btnDelete").addEventListener("click", deleteItem);
  el("btnNewStream").addEventListener("click", () => createStream());


  // Chọn "tạo luồng mới" ngay trong form
  el("mStream").addEventListener("change", e => {
    if (e.target.value !== "__new") return;
    const name = createStream();
    fillStreamSelect(name || "");
  });

  ["mEnd","mStart","mPriority","mStatus","mNext","mDesc"].forEach(id =>
    el(id).addEventListener("input", renderWriPreview));

  // Dọn sạch sau khi đóng popup, tránh trang bị khóa cuộn.
  el("itemModal").addEventListener("hidden.bs.modal", () => {
    document.body.classList.remove("modal-open");
    document.body.style.removeProperty("overflow");
    document.body.style.removeProperty("padding-right");
  });

  el("fFrom").addEventListener("change", e => setFilter("from", e.target.value));
  el("fTo").addEventListener("change", e => setFilter("to", e.target.value));

  let timer;
  el("globalSearch").addEventListener("input", e => {
    renderSuggestions();                        // gợi ý hiện ngay, không chờ
    clearTimeout(timer);
    timer = setTimeout(() => { S.filters.q = e.target.value; applyFilters(); }, 180);
  });
  el("globalSearch").addEventListener("focus", renderSuggestions);
  el("globalSearch").addEventListener("blur", () => setTimeout(closeSuggestions, 120));
  el("globalSearch").addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { e.preventDefault(); moveSuggestion(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); moveSuggestion(-1); }
    else if (e.key === "Escape") { closeSuggestions(); }
    else if (e.key === "Enter") {
      const active = el("searchSugg").querySelector(".sugg-row.is-active");
      if (active) { e.preventDefault(); pickSuggestion(active); }
    }
  });

  document.addEventListener("click", e => {
    if (!e.target.closest(".searchbox")) closeSuggestions();
    if (!e.target.closest(".multi")) closeAllMulti();
  });

  el("modeSeg").addEventListener("click", e => {
    const b = e.target.closest("[data-mode]");
    if (b && b.dataset.mode !== S.mode) setMode(b.dataset.mode);
  });

  el("tabs").addEventListener("click", e => {
    const b = e.target.closest(".tab[data-view]");
    if (b) switchTab(b.dataset.view);
  });

  el("langSeg").addEventListener("click", e => {
    const b = e.target.closest("[data-lang]");
    if (!b || b.dataset.lang === LANG) return;
    setLang(b.dataset.lang);
    if (S.mode === "performance") { Perf.relabel(); return; }
    if (S.tab === "docs") { applyStaticText(); Docs.relabel(); return; }
    S.all = enrich(S.all);        // nhãn luồng và lý do đổi theo ngôn ngữ
    destroyTable();               // dựng lại bảng để đổi tiêu đề cột
    fillSelects();
    applyFilters();
  });

  document.addEventListener("keydown", e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); el("globalSearch").focus(); }
  });
}

/* ==========================================================================
   CHẾ ĐỘ — Workstream ↔ Performance
   Hai chế độ dùng chung thanh trên cùng, phần còn lại tách hẳn.
   ========================================================================== */
/** Các view của chế độ Công việc — loại trừ view bên trong chế độ Số liệu.
    Mô hình tài chính cũng dùng tên lớp .view, nếu không lọc thì hai bên
    sẽ bật tắt lẫn nhau. */
function wsViews() {
  return Array.prototype.filter.call(
    document.querySelectorAll(".view"),
    v => !v.closest("#perfShell"));
}

function setMode(mode) {
  S.mode = mode;
  const perf = mode === "performance";

  document.querySelectorAll("#modeSeg [data-mode]").forEach(b =>
    b.classList.toggle("is-active", b.dataset.mode === mode));
  document.body.classList.toggle("mode-performance", perf);

  el("brandName").textContent = perf ? t("modePerfBrand") : t("modeWorkBrand");
  el("perfShell").classList.toggle("d-none", !perf);
  el("tabs").classList.toggle("d-none", perf);
  el("searchBox").classList.toggle("d-none", perf);
  el("modeNotice").classList.toggle("d-none", perf || !S.demo);
  document.querySelectorAll(".ws-only").forEach(n => n.classList.toggle("d-none", perf));
  wsViews().forEach(v =>
    v.classList.toggle("is-active", !perf && v.id === "view-" + S.tab));

  try { localStorage.setItem("xp_mode", mode); } catch (e) {}

  if (perf) Perf.enter();
  else renderAll();
}

function switchTab(view) {
  if (view === "docs") Docs.enter();
  S.tab = view;
  document.querySelectorAll(".tab[data-view]").forEach(b => b.classList.toggle("is-active", b.dataset.view === view));
  wsViews().forEach(v => v.classList.toggle("is-active", v.id === "view-" + view));
  renderAll();
}

/* ==========================================================================
   13. DỮ LIỆU MẪU — chỉ dùng khi chưa điền khóa Supabase
   ========================================================================== */

/* Hạng mục nhỏ mẫu — chỉ dùng khi chưa nối Supabase. */
const DEMO_SUBS = [
  { id:"s1",  project_id:"d2", title:"Chốt bộ câu hỏi khảo sát",     done:true,  owner:"Khai Vo",      due:"2026-07-28", sort_order:0 },
  { id:"s2",  project_id:"d2", title:"Gửi link cho 300 doanh nghiệp", done:true,  owner:"Khai Vo",      due:"2026-08-02", sort_order:1 },
  { id:"s3",  project_id:"d2", title:"Thu đủ 300 phản hồi",           done:false, owner:"Khai Vo",      due:"2026-08-05", sort_order:2 },
  { id:"s4",  project_id:"d2", title:"Phân tích và dựng báo cáo",     done:false, owner:"Heilyn Nguyen",due:"2026-08-07", sort_order:3 },
  { id:"s5",  project_id:"d2", title:"Bàn giao kết quả cho MSB",      done:false, owner:null,           due:null,         sort_order:4 },
  { id:"s6",  project_id:"d4", title:"Rà soát điều khoản pháp lý",    done:true,  owner:"Duong Ho",     due:"2026-08-10", sort_order:0 },
  { id:"s7",  project_id:"d4", title:"Thống nhất mức chia doanh thu", done:true,  owner:"Duong Ho",     due:"2026-08-14", sort_order:1 },
  { id:"s8",  project_id:"d4", title:"Trình ban lãnh đạo MSB",        done:false, owner:"Khai Vo",      due:"2026-08-18", sort_order:2 },
  { id:"s9",  project_id:"d4", title:"Ký kết chính thức",             done:false, owner:"Duong Ho",     due:"2026-08-25", sort_order:3 },
  { id:"s10", project_id:"d1", title:"Gộp mã nguồn hai nhánh",        done:true,  owner:"Tai Vo",       due:"2026-08-05", sort_order:0 },
  { id:"s11", project_id:"d1", title:"Kiểm thử toàn bộ luồng",        done:false, owner:"Tai Vo",       due:"2026-08-08", sort_order:1 },
  { id:"s12", project_id:"d1", title:"Chuyển tên miền",               done:false, owner:"Tai Vo",       due:"2026-08-09", sort_order:2 }
];
const DEMO_ROWS = [
  { id:"d1", title:"Merge xperise AI to xperise.com", description:null, timeline_start:"2026-07-25", timeline_end:"2026-08-09", pic:"Tai Vo", priority:"High", status:"In Progress", next_steps:null },
  { id:"d2", title:"MSB SpendOS Survey", description:"Handover online link to MSB", timeline_start:"2026-07-20", timeline_end:"2026-08-07", pic:"Khai Vo", priority:"High", status:"In Progress", next_steps:"Done survey for 300-500 companies - 1 week" },
  { id:"d3", title:"SpendOS + Bank product final version", description:"Finalize after analyzing survey data", timeline_start:null, timeline_end:"2026-08-20", pic:"Heilyn Nguyen", priority:"High", status:"In Progress", next_steps:null },
  { id:"d4", title:"Partnership Agreement: Xperise + MSB", description:null, timeline_start:null, timeline_end:"2026-08-25", pic:"Duong Ho, Khai Vo", priority:"High", status:"In Progress", next_steps:null },
  { id:"d5", title:"Pilot model US market - Enterprise Spend Intelligence Brain - CC capital: Insignia", description:null, timeline_start:"2026-08-20", timeline_end:"2026-08-20", pic:"Duong Ho", priority:"Medium", status:"In Progress", next_steps:null },
  { id:"d6", title:"Sep US Event", description:null, timeline_start:null, timeline_end:"2026-09-01", pic:"Duong Ho, Hung Vo", priority:"Medium", status:"In Progress", next_steps:null },
  { id:"d7", title:"Marina IFC Office", description:null, timeline_start:null, timeline_end:"2026-08-24", pic:"Duong Ho", priority:"Medium", status:"In Progress", next_steps:null },
  { id:"d8", title:"Fund Small Additional Raising", description:null, timeline_start:"2026-08-01", timeline_end:"2026-08-30", pic:"Duong Ho", priority:"Medium", status:"In Progress", next_steps:null },
  { id:"d9", title:"Apply VIFC Member", description:null, timeline_start:null, timeline_end:null, pic:"Duong Ho", priority:"Medium", status:"In Progress", next_steps:null },
  { id:"d10", title:"Assess initial xperise intelligence on current data system", description:null, timeline_start:null, timeline_end:null, pic:"Duong Ho, Hung Vo", priority:"Medium", status:"In Progress", next_steps:null }
];
