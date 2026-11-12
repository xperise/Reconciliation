/* ==========================================================================
   XPERISE — WORKSTREAM INTELLIGENCE v3.1  ·  views.js
   Toàn bộ phần vẽ. Mọi màn hình đọc từ cùng một mảng S.view, nên thao tác ở
   bất kỳ đâu — kể cả kéo thả trên bảng điều hành — đều làm cả dashboard đổi.
   ========================================================================== */

let donutChart = null, dueChart = null, itemsTable = null;
let netMode = "dep";

function renderAll() {
  const d = digest(S.view);

  renderExec(d);
  renderKpis(d);
  renderQuickChips();
  renderFilterSummary();

  el("tabCountList").textContent = S.view.length;
  // Số đầu mục còn thiếu ít nhất một trường bắt buộc-mềm (hạn chốt, ngày bắt
  // đầu, mô tả). "Bước tiếp theo" KHÔNG tính, vì để trống là hợp lệ.
  el("tabCountSystem").textContent = d.itemsNeedingData;

  if (S.tab === "overview") { renderRiskMap(); renderTriage(); renderWorkload(d); renderDonut(d); renderDueChart(); }
  if (S.tab === "network")  renderNetwork();
  if (S.tab === "streams")  renderStreams();
  if (S.tab === "timeline") renderGantt();
  if (S.tab === "board")    renderBoard();
  if (S.tab === "list")     renderList();
  if (S.tab === "system")   renderSystem();
}

function emptyBox(msg) {
  return `<div style="padding:44px 12px;text-align:center;color:var(--ink-3);font-size:12.5px">${esc(msg)}</div>`;
}

/* ==========================================================================
   TÓM TẮT ĐIỀU HÀNH + CHIP
   ========================================================================== */
function renderExec(d) {
  el("execText").innerHTML = execSentence(d);
  el("execChips").innerHTML = Object.keys(FLAGS)
    .filter(k => d.counts[k] > 0)
    .map(k => `<button class="exec-chip ${S.filters.flags.includes(k) ? "is-on" : ""}" data-flag="${k}">${esc(flagLabel(k))}<b>${d.counts[k]}</b></button>`)
    .join("") || `<span style="font-size:12px;color:rgba(18,40,26,.55)">${esc(t("noAlerts"))}</span>`;
  el("execChips").querySelectorAll("[data-flag]").forEach(b =>
    b.addEventListener("click", () => toggleFlag(b.dataset.flag)));
}

function renderQuickChips() {
  const dAll = digest(S.all);
  el("quickChips").innerHTML = Object.keys(FLAGS).map(k => {
    const n = dAll.counts[k];
    return `<button class="qchip ${S.filters.flags.includes(k) ? "is-on" : ""} ${n ? "" : "is-empty"}" data-flag="${k}">${esc(flagLabel(k))}<b>${n}</b></button>`;
  }).join("");
  el("quickChips").querySelectorAll("[data-flag]").forEach(b =>
    b.addEventListener("click", () => toggleFlag(b.dataset.flag)));
}

function renderFilterSummary() {
  if (!isFiltering()) { el("filterSummary").textContent = t("viewingAll"); return; }
  const f = S.filters, bits = [];
  if (f.q) bits.push(`“${f.q}”`);
  if (f.pic !== "ALL") bits.push(f.pic);
  if (f.status !== "ALL") bits.push(f.status);
  if (f.priority !== "ALL") bits.push(f.priority);
  if (f.stream !== "ALL") bits.push(streamLabel(f.stream));
  if (f.band !== "ALL") bits.push(t("bands." + f.band));
  if (f.from || f.to) bits.push((f.from ? fmtDate(f.from) : "…") + " → " + (f.to ? fmtDate(f.to) : "…"));
  f.flags.forEach(k => bits.push(flagLabel(k)));
  el("filterSummary").textContent = t("viewingFiltered")(S.view.length, S.all.length, bits.join(" · "));
}

/* ==========================================================================
   DẢI CHỈ SỐ — vừa là số liệu vừa là nút lọc
   ========================================================================== */
function renderKpis(d) {
  const cards = [
    { label: t("kpiActive"), num: d.active, sub: t("kpiActiveSub")(d.total),
      color: "#A855F7", meter: pct(d.active, d.total || 1) },
    { label: t("kpiRisk"), num: d.portfolioWRI, unit: "/100", sub: t("kpiRiskSub")(d.portfolioBand.label.toLowerCase()),
      color: d.portfolioBand.color, meter: d.portfolioWRI },
    { label: t("kpiCritical"), num: d.counts.critical, sub: t("kpiCriticalSub")(BANDS[0].min),
      color: "#E11D48", meter: pct(d.counts.critical, d.active || 1), flag: "critical" },
    { label: t("kpiOverdue"), num: d.counts.overdue, sub: t("kpiOverdueSub"),
      color: "#E11D48", meter: pct(d.counts.overdue, d.active || 1), flag: "overdue" },
    { label: t("kpiDueSoon")(THRESHOLDS.dueSoonDays), num: d.counts.dueSoon, sub: t("kpiDueSoonSub"),
      color: "#EA8C0B", meter: pct(d.counts.dueSoon, d.active || 1), flag: "dueSoon" },
    { label: t("kpiData"), num: d.completeness, unit: "%", sub: t("kpiDataSub")(d.cellsFilled, d.cellsTotal),
      color: d.completeness < THRESHOLDS.dataThin*100 ? "#EA8C0B" : "#0D9488", meter: d.completeness }
  ];

  // Ô tiến độ chỉ hiện khi đã có hạng mục nhỏ — chưa chia nhỏ thì không bày ô rỗng.
  if (d.subTotal) {
    cards.splice(2, 0, {
      label: t("kpiProgress"),
      num: d.donePct, unit: "%",
      sub: d.elapsedPct !== null ? t("kpiProgressSub")(d.subDone, d.subTotal, d.elapsedPct)
                                 : t("kpiProgressSubPlain")(d.subDone, d.subTotal),
      color: d.drifting ? "#E11D48" : "#0D9488",
      meter: d.donePct,
      flag: d.drifting ? "drifting" : null
    });
  }

  el("kpiStrip").innerHTML = cards.map(c => `
    <div class="kpi" style="border-left-color:${c.color}" ${c.flag ? `data-flag="${c.flag}"` : ""}>
      <div class="kpi-label">${esc(c.label)}</div>
      <div class="kpi-num" style="color:${c.color}">${c.num}${c.unit ? `<small>${c.unit}</small>` : ""}</div>
      <div class="kpi-sub">${esc(c.sub)}</div>
      <div class="kpi-meter"><i style="width:${Math.min(100,c.meter)}%;background:${c.color}"></i></div>
    </div>`).join("");
  el("kpiStrip").querySelectorAll("[data-flag]").forEach(k =>
    k.addEventListener("click", () => toggleFlag(k.dataset.flag)));
}

/* ==========================================================================
   BẢN ĐỒ RỦI RO
   ========================================================================== */
function renderRiskMap() {
  const W = 560, H = 330, ML = 42, MR = 58, MT = 16, MB = 42;
  const pw = W - ML - MR, ph = H - MT - MB;
  const items = S.view.filter(p => p.status !== "Done");

  if (!items.length) { el("riskMap").innerHTML = emptyBox(t("noOpenItems")); el("riskLegend").innerHTML = ""; return; }

  const dayVals = items.filter(p => p._wri.daysLeft !== null).map(p => p._wri.daysLeft);
  const minD = Math.min(-2, ...(dayVals.length ? dayVals : [0]));
  const maxD = Math.max(10, ...(dayVals.length ? dayVals : [0]));
  const x = v => ML + (v - minD) / (maxD - minD || 1) * pw;
  const y = v => MT + ph - (v / 100) * ph;
  const noDueX = ML + pw + 26;

  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
  BANDS.forEach((b, i) => {
    const top = i === 0 ? 100 : BANDS[i-1].min;
    svg += `<rect x="${ML}" y="${y(top)}" width="${pw}" height="${y(b.min)-y(top)}" fill="${b.soft}" opacity=".62"/>`;
    svg += `<text class="zone-label" x="${ML+7}" y="${y(top)+12}">${esc(t("bands."+b.key))}</text>`;
  });
  [0,25,50,75,100].forEach(v => {
    svg += `<line x1="${ML}" y1="${y(v)}" x2="${ML+pw}" y2="${y(v)}" stroke="#E3E8EC"/>`;
    svg += `<text class="axis-label" x="${ML-8}" y="${y(v)+3}" text-anchor="end">${v}</text>`;
  });
  svg += `<line x1="${x(0)}" y1="${MT}" x2="${x(0)}" y2="${MT+ph}" stroke="#A855F7" stroke-width="1.5" stroke-dasharray="4 3"/>`;
  svg += `<text class="axis-label" x="${x(0)}" y="${MT+ph+15}" text-anchor="middle" fill="#7E22CE">T0</text>`;
  [5,10,15,20,30].filter(v => v <= maxD).forEach(v =>
    svg += `<text class="axis-label" x="${x(v)}" y="${MT+ph+15}" text-anchor="middle">+${v}d</text>`);
  svg += `<text class="axis-label" x="${noDueX}" y="${MT+ph+15}" text-anchor="middle">${esc(t("axisNoDue"))}</text>`;
  svg += `<text class="axis-label" x="${ML+pw/2}" y="${H-6}" text-anchor="middle">${esc(t("axisDays"))}</text>`;
  svg += `<text class="axis-label" transform="rotate(-90 12 ${MT+ph/2})" x="12" y="${MT+ph/2}" text-anchor="middle">${esc(t("axisRisk"))}</text>`;

  const size = { "High": 9, "Medium": 7, "Low": 5.5 };
  items.forEach(p => {
    const cx = p._wri.daysLeft === null ? noDueX : x(p._wri.daysLeft);
    const cy = y(p._wri.score);
    const r = size[p.priority] || 6;
    const dl = isDrifting(p);
    svg += `<g class="dot${dl ? " is-drift" : ""}" data-id="${esc(p.id)}"><title>${esc(p.title)} — ${p._wri.score} · ${esc(reasonText(p._wri))}</title>
      <rect x="${cx-r}" y="${cy-r}" width="${r*2}" height="${r*2}" rx="2.5" transform="rotate(45 ${cx} ${cy})" fill="${p._wri.band.color}" opacity=".92"
            ${dl ? 'stroke="#12281A" stroke-width="1.6"' : ""}/>
      <text class="dot-num" x="${cx}" y="${cy+3}" text-anchor="middle">${p._wri.score}</text></g>`;
  });

  el("riskMap").innerHTML = svg + `</svg>`;
  el("riskMap").querySelectorAll(".dot").forEach(g => g.addEventListener("click", () => focusItem(g.dataset.id)));
  el("riskLegend").innerHTML =
    BANDS.map(b => `<span><i style="background:${b.color}"></i>${esc(t("bands."+b.key))} · ${b.min}+</span>`).join("") +
    `<span class="sep">${esc(t("legendSize"))}</span>`;
}

/* ==========================================================================
   5 VIỆC NÊN CHẠM TRƯỚC
   ========================================================================== */
/* ==========================================================================
   HIỂN THỊ HẠNG MỤC CON — dùng chung cho mọi màn hình
   Một chỗ định nghĩa, mọi nơi hiện giống nhau; sửa ở đây là đổi toàn bộ.
   ========================================================================== */

/** Có bị chậm so với lịch không (đã chia nhỏ + đủ mốc thời gian). */
function isDrifting(p) {
  return p._wri.driftGap !== null && p._wri.driftGap >= minDriftGap();
}

/** Huy hiệu "2/5" gọn, kèm thanh nhỏ. Trả về "" nếu đầu mục chưa chia nhỏ. */
function progBadge(p, opts) {
  const pr = p._wri.progress;
  if (!pr.total) return "";
  const late = isDrifting(p);
  const col = late ? "var(--critical)" : "var(--stable)";
  const bar = (opts && opts.bar === false) ? "" :
    `<span class="pb-bar"><i style="width:${pr.donePct}%;background:${col}"></i>
       ${pr.elapsedPct !== null ? `<b style="left:${pr.elapsedPct}%"></b>` : ""}</span>`;
  return `<span class="prog-badge${late ? " is-late" : ""}" title="${esc(t("progTip")(pr.done, pr.total, pr.donePct, pr.elapsedPct))}">
      ${bar}<span class="pb-num">${pr.done}/${pr.total}</span></span>`;
}

/** Vài hạng mục con chưa xong, xếp việc quá hạn lên trước. */
function openSubs(projectId, limit) {
  const list = (S.subs[projectId] || []).filter(s => !s.done);
  const over = s => s.due && toDate(s.due) < today0();
  list.sort((a, b) => (over(b) ? 1 : 0) - (over(a) ? 1 : 0));
  return limit ? list.slice(0, limit) : list;
}

/** Danh sách hạng mục con chưa xong, dạng dòng nhỏ — dùng trong thẻ và bảng. */
function subLinesHtml(projectId, limit) {
  const all = (S.subs[projectId] || []).filter(s => !s.done);
  if (!all.length) return "";
  const show = openSubs(projectId, limit);
  return `<div class="sub-mini">${show.map(s => {
    const late = s.due && toDate(s.due) < today0();
    return `<div class="sm-line${late ? " is-late" : ""}">
      <i class="bi bi-square"></i>
      <span class="sm-txt">${esc(s.title)}</span>
      ${s.owner ? avatar(s.owner, "sm") : ""}
      <span class="sm-due">${s.due ? fmtDate(s.due) : ""}</span></div>`;
  }).join("")}${all.length > show.length
    ? `<div class="sm-more">${esc(t("subMore")(all.length - show.length))}</div>` : ""}</div>`;
}

/** Gom hạng mục con của một nhóm đầu mục — dùng cho luồng và cho từng người. */
function rollup(items) {
  let total = 0, done = 0, overdue = 0;
  items.forEach(p => {
    const pr = p._wri.progress;
    total += pr.total; done += pr.done; overdue += pr.overdueSubs;
  });
  return { total, done, overdue, donePct: total ? Math.round(done / total * 100) : 0,
           drifting: items.filter(isDrifting).length };
}


/** Cung tròn quanh nút mạng lưới = phần khối lượng đã xong. */
function progArc(p, cx, cy, r) {
  const pr = p._wri.progress;
  if (!pr.total || !pr.donePct) return "";
  const frac = Math.min(1, pr.donePct / 100);
  const col = isDrifting(p) ? "#E11D48" : "#0D9488";
  if (frac >= 1) return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col}" stroke-width="2"/>`;
  const a0 = -Math.PI / 2, a1 = a0 + frac * Math.PI * 2;
  const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
  return `<path d="M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 ${frac > .5 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}"
     fill="none" stroke="${col}" stroke-width="2" stroke-linecap="round"/>`;
}

function renderTriage() {
  const top = S.view.filter(p => p.status !== "Done").slice(0, 5);
  if (!top.length) { el("triageList").innerHTML = emptyBox(t("noOpenItems")); return; }

  el("triageList").innerHTML = top.map(p => {
    const w = p._wri;
    // Ưu tiên nói ra việc con đang dở — cụ thể hơn "thiếu mô tả".
    const nextSub = openSubs(p.id, 1)[0];
    const why = nextSub
      ? t("triageNextSub")(nextSub.title)
      : (w.missing.length
          ? w.missing.map(k => t(WRI.data.fields.find(f => f.key === k).labelKey)).join(" · ")
          : (p.next_steps || t("triageAllSet")));
    return `<li data-id="${esc(p.id)}">
      <div class="triage-body">
        <div class="triage-title">${esc(p.title)}</div>
        <div class="triage-why">${esc(why)}</div>
        <div class="triage-meta">
          <span class="pill" style="background:${w.band.soft};color:${w.band.color}">${w.score}</span>
          ${progBadge(p)}
          <span>${esc(reasonText(w))}</span>
          <span>${picsOf(p).map(n => avatar(n,"sm")).join("")} ${esc(picsOf(p).join(", "))}</span>
        </div>
      </div></li>`;
  }).join("");
  el("triageList").querySelectorAll("li").forEach(li => li.addEventListener("click", () => focusItem(li.dataset.id)));
}

/* ==========================================================================
   KHỐI LƯỢNG THEO NGƯỜI + HHI
   ========================================================================== */

/** Chip "đang lọc — bỏ lọc" gắn vào đầu từng thẻ nhỏ. */
function renderLocalReset(slotId, active, labelFn, onClear) {
  const slot = el(slotId);
  if (!slot) return;
  if (!active) { slot.innerHTML = ""; return; }
  slot.innerHTML = `<button class="reset-chip" title="${esc(t("localResetTip"))}">
      ${esc(labelFn())}<i class="bi bi-x-lg"></i></button>`;
  slot.querySelector("button").addEventListener("click", onClear);
}

/** Bảng tóm tắt việc của một người, hiện khi rê chuột hoặc khi đang lọc theo họ. */
function showOwnerDetail(name) {
  const box = el("workloadDetail");
  const mine = S.view.filter(p => p.status !== "Done" && picsOf(p).includes(name))
                     .sort((a, b) => b._wri.score - a._wri.score);
  if (!mine.length) { box.classList.add("d-none"); return; }

  const avg = Math.round(mine.reduce((s, p) => s + p._wri.score, 0) / mine.length);
  const band = bandOf(avg);
  const nextDue = mine.filter(p => p.timeline_end)
                      .sort((a, b) => toDate(a.timeline_end) - toDate(b.timeline_end))[0];

  // Hạng mục con GẮN TÊN người này — có thể nằm ở đầu mục do người khác chủ trì,
  // nên phải quét toàn danh mục chứ không chỉ các đầu mục họ phụ trách.
  const myOpenSubs = [];
  S.view.forEach(p => (S.subs[p.id] || []).forEach(s => {
    if (!s.done && s.owner && s.owner.trim() === name) myOpenSubs.push({ s, p });
  }));
  myOpenSubs.sort((a, b) => {
    const av = a.s.due ? toDate(a.s.due).getTime() : Infinity;
    const bv = b.s.due ? toDate(b.s.due).getTime() : Infinity;
    return av - bv;
  });
  const roll = rollup(mine);

  box.innerHTML = `
    <div class="wl-d-head">
      ${avatar(name, "sm")}<strong>${esc(name)}</strong>
      <span class="wl-d-count">${esc(t("wlItems")(mine.length))}</span>
    </div>
    <div class="wl-d-stats">
      <span>${esc(t("wlAvg"))} <b style="color:${band.color}">${avg}</b></span>
      <span>${esc(t("wlNext"))} <b>${nextDue ? fmtDate(nextDue.timeline_end) : esc(t("wlNextNone"))}</b></span>
      ${roll.total ? `<span>${esc(t("wlSubs"))} <b>${roll.done}/${roll.total}</b></span>` : ""}
    </div>
    ${myOpenSubs.length ? `<div class="wl-d-subs">
      <div class="wl-d-subhead">${esc(t("wlOwnSubs")(myOpenSubs.length))}</div>
      ${myOpenSubs.slice(0, 3).map(({ s, p }) => {
        const late = s.due && toDate(s.due) < today0();
        return `<div class="sm-line${late ? " is-late" : ""}" data-id="${esc(p.id)}">
          <i class="bi bi-square"></i>
          <span class="sm-txt">${esc(s.title)}</span>
          <span class="sm-due">${s.due ? fmtDate(s.due) : "—"}</span></div>`;
      }).join("")}
    </div>` : ""}
    ${mine.slice(0, 4).map(p => `
      <div class="wl-d-item" data-id="${esc(p.id)}">
        <span class="pill" style="background:${p._wri.band.soft};color:${p._wri.band.color}">${p._wri.score}</span>
        <span class="wl-d-title">${esc(p.title)}</span>
        ${progBadge(p, { bar: false })}
        <span class="wl-d-due">${p.timeline_end ? fmtDate(p.timeline_end) : "—"}</span>
      </div>`).join("")}
    ${mine.length > 4 ? `<div class="wl-d-more">${esc(t("wlMore")(mine.length - 4))}</div>` : ""}`;

  box.classList.remove("d-none");
  box.querySelectorAll("[data-id]").forEach(r =>
    r.addEventListener("click", () => focusItem(r.dataset.id)));
}

function renderWorkload(d) {
  // Nút bỏ lọc đặt ngay trong thẻ, để không phải kéo ngược lên thanh lọc chung.
  renderLocalReset("resetWorkload", S.filters.pic !== "ALL",
                   () => t("localResetPic")(S.filters.pic), () => setFilter("pic", "ALL"));

  if (!d.load.length) { el("workload").innerHTML = emptyBox(t("noOwners")); el("workloadDetail").classList.add("d-none"); }
  else {
    const max = d.load[0].weight || 1;
    el("workload").innerHTML = d.load.slice(0, 8).map(o => {
      const mine = S.view.filter(p => p.status !== "Done" && picsOf(p).includes(o.name));
      const segs = BANDS.map(b => ({ b, n: mine.filter(p => p._wri.band.key === b.key).length })).filter(s => s.n);
      const tot = segs.reduce((s,x) => s + x.n, 0) || 1;
      const on = S.filters.pic === o.name;
      return `<div class="wl-row ${on ? "is-on" : ""}" data-pic="${esc(o.name)}">
        <span class="wl-name">${avatar(o.name,"sm")}<span>${esc(o.name)}</span></span>
        <span class="wl-track" style="max-width:${o.weight/max*100}%">
          ${segs.map(s => `<i style="width:${s.n/tot*100}%;background:${s.b.color}"></i>`).join("")}</span>
        <span class="wl-val">${o.weight % 1 ? o.weight.toFixed(1) : o.weight}</span>
      </div>`;
    }).join("") + `<div class="wl-hint">${esc(t("wlHint"))}</div>`;

    el("workload").querySelectorAll("[data-pic]").forEach(r => {
      r.addEventListener("click", () => setFilter("pic", S.filters.pic === r.dataset.pic ? "ALL" : r.dataset.pic));
      r.addEventListener("mouseenter", () => showOwnerDetail(r.dataset.pic));
    });
    // Rời chuột thì quay về người đang được lọc, nếu không lọc ai thì ẩn đi.
    el("workload").addEventListener("mouseleave", () =>
      S.filters.pic !== "ALL" ? showOwnerDetail(S.filters.pic) : el("workloadDetail").classList.add("d-none"));

    if (S.filters.pic !== "ALL") showOwnerDetail(S.filters.pic);
    else el("workloadDetail").classList.add("d-none");
  }

  el("hhiValue").textContent = d.hhi.toFixed(2);
  el("hhiValue").style.color = d.tooConcentrated ? "var(--critical)" : "var(--stable)";
  el("hhiFill").style.width = Math.min(100, Math.max(0, (d.hhiRatio - 1) / (THRESHOLDS.hhiTight - 1) * 100)) + "%";
  el("hhiFill").style.background = d.tooConcentrated ? "var(--critical)" : "var(--stable)";
  el("hhiNote").textContent = d.owners <= 1 ? t("hhiSolo")
    : t("hhiNote")(t("concLevels." + d.concKey), d.owners, d.hhiBase.toFixed(2));
}

/* ==========================================================================
   CƠ CẤU DANH MỤC
   ========================================================================== */
function renderDonut(d) {
  // Thẻ này chịu ảnh hưởng của 2 bộ lọc: trạng thái (donut) và ưu tiên (thanh dưới).
  const st = S.filters.status !== "ALL", pr = S.filters.priority !== "ALL";
  renderLocalReset("resetMix", st || pr,
    () => st ? t("localResetStatus")(S.filters.status) : t("localResetPrio")(S.filters.priority),
    () => { S.filters.status = "ALL"; S.filters.priority = "ALL"; syncFilterInputs(); applyFilters(); });

  const counts = STATUSES.map(s => S.view.filter(p => p.status === s).length);
  el("donutTotal").textContent = S.view.length;

  const data = { labels: STATUSES, datasets: [{ data: counts, backgroundColor: STATUSES.map(s => STATUS_COLOR[s]), borderColor: "#fff", borderWidth: 3, hoverOffset: 8 }] };
  if (donutChart) { donutChart.data = data; donutChart.update(); }
  else donutChart = new Chart(el("statusDonut"), {
    type: "doughnut", data,
    options: {
      responsive: true, maintainAspectRatio: false, cutout: "72%",
      onHover: (e, els) => { e.native.target.style.cursor = els.length ? "pointer" : "default"; },
      onClick: (e, els, ch) => { if (els.length) { const v = ch.data.labels[els[0].index]; setFilter("status", S.filters.status === v ? "ALL" : v); } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${c.label}: ${c.parsed}` } } }
    }
  });

  el("statusLegend").innerHTML = STATUSES.map((s,i) => `<span><i style="background:${STATUS_COLOR[s]}"></i>${s} · ${counts[i]}</span>`).join("");

  const maxP = Math.max(1, ...PRIORITIES.map(p => S.view.filter(x => x.priority === p).length));
  el("prioBars").innerHTML = PRIORITIES.map(pr => {
    const n = S.view.filter(x => x.priority === pr).length;
    return `<div class="prio-row" data-prio="${pr}">
      <span>${pr}</span>
      <span class="prio-track"><i style="width:${n/maxP*100}%;background:${PRIORITY_COLOR[pr]}"></i></span>
      <b>${n}</b></div>`;
  }).join("");
  el("prioBars").querySelectorAll("[data-prio]").forEach(r =>
    r.addEventListener("click", () => setFilter("priority", S.filters.priority === r.dataset.prio ? "ALL" : r.dataset.prio)));
}

/* ==========================================================================
   MẬT ĐỘ ĐẾN HẠN
   ========================================================================== */
function renderDueChart() {
  const dueFlags = ["overdue", "dueSoon"].filter(k => S.filters.flags.includes(k));
  renderLocalReset("resetDue", dueFlags.length > 0, () => t("localResetDue"),
    () => { S.filters.flags = S.filters.flags.filter(k => !dueFlags.includes(k)); applyFilters(); });

  const labels = t("dueBuckets");
  const tests = [
    v => v !== null && v < 0,
    v => v !== null && v >= 0 && v <= 7,
    v => v !== null && v > 7 && v <= 14,
    v => v !== null && v > 14 && v <= 30,
    v => v !== null && v > 30,
    v => v === null
  ];
  const colors = ["#E11D48","#EA8C0B","#A855F7","#C9A6F5","#CBD5D0","#8A968F"];
  const active = S.view.filter(p => p.status !== "Done");
  const data = tests.map(fn => active.filter(p => fn(p._wri.daysLeft)).length);

  const cfg = { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 5, maxBarThickness: 34 }] };
  if (dueChart) { dueChart.data = cfg; dueChart.update(); }
  else dueChart = new Chart(el("dueChart"), {
    type: "bar", data: cfg,
    options: {
      responsive: true, maintainAspectRatio: false,
      onHover: (e, els) => { e.native.target.style.cursor = els.length ? "pointer" : "default"; },
      onClick: (e, els) => {
        if (!els.length) return;
        const i = els[0].index;
        if (i === 0) toggleFlag("overdue");
        else if (i === 1) toggleFlag("dueSoon");
        else if (i === 5) toggleFlag("noDue");
      },
      scales: { x: { grid: { display: false }, ticks: { font: { size: 10 } } },
                y: { beginAtZero: true, ticks: { precision: 0, stepSize: 1, font: { size: 10 } }, grid: { color: "#EDF1F4" }, border: { display: false } } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${c.parsed.y}` } } }
    }
  });
  el("dueNote").textContent = (data[0] || data[1]) ? t("dueNoteHot") : t("dueNoteCalm");
}

/* ==========================================================================
   MẠNG LƯỚI PHỤ THUỘC
   ========================================================================== */
function suggestLinks() {
  const out = [];
  const stop = new Set(["the","and","for","with","xperise","model","final","initial","current","new"]);

  S.view.forEach(a => S.view.forEach(b => {
    if (a.id === b.id) return;

    const note = (String(a.next_steps||"") + " " + String(a.description||"")).toLowerCase();
    if (note.trim()) {
      const words = String(b.title||"").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 4 && !stop.has(w));
      const hit = words.find(w => note.includes(w));
      if (hit) { out.push({ from: b.id, to: a.id, kind: "note", a: a.title, w: hit }); return; }
    }
    if (a._stream.id === b._stream.id && a._stream.id !== "__none") {
      const ea = toDate(a.timeline_end), eb = toDate(b.timeline_end);
      if (ea && eb && ea < eb) out.push({ from: a.id, to: b.id, kind: "stream", s: a._stream.name, d1: a.timeline_end, d2: b.timeline_end });
    }
  }));

  const seen = new Set();
  return out.filter(l => { const k = l.from + ">" + l.to; if (seen.has(k)) return false; seen.add(k); return true; })
            .sort((a,b) => (a.kind === "note" ? -1 : 1) - (b.kind === "note" ? -1 : 1))
            .slice(0, 6);
}
function evidenceText(l) {
  return l.kind === "note" ? t("evNote")(l.a, l.w) : t("evStream")(l.s, fmtDate(l.d1), fmtDate(l.d2));
}

function renderNetwork() {
  const items = S.view, box = el("network");
  if (!items.length) { box.innerHTML = emptyBox(t("noItemsInFilter")); el("criticalPath").innerHTML = ""; el("netLegend").innerHTML = ""; return; }

  const W = 560, H = 400, cx = W/2, cy = H/2;
  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;

  if (netMode === "own") {
    const owners = [...new Set(items.flatMap(picsOf))];
    const oPos = {};
    owners.forEach((o, i) => {
      const ang = (i / owners.length) * Math.PI * 2 - Math.PI/2;
      oPos[o] = { x: cx + Math.cos(ang)*105, y: cy + Math.sin(ang)*105 };
    });
    items.forEach((p, i) => {
      const ang = (i / items.length) * Math.PI * 2 - Math.PI/2;
      const px = cx + Math.cos(ang)*168, py = cy + Math.sin(ang)*168;
      picsOf(p).forEach(o => { if (oPos[o]) svg += `<line x1="${oPos[o].x}" y1="${oPos[o].y}" x2="${px}" y2="${py}" stroke="#E3E8EC"/>`; });
      const r = p.priority === "High" ? 11 : p.priority === "Medium" ? 9 : 7;
      svg += `<g class="node" data-id="${esc(p.id)}"><title>${esc(p.title)} — ${p._wri.score}</title>
        <rect x="${px-r}" y="${py-r}" width="${r*2}" height="${r*2}" rx="3" transform="rotate(45 ${px} ${py})" fill="${p._wri.band.color}"/></g>`;
    });
    owners.forEach(o => {
      const n = items.filter(p => picsOf(p).includes(o)).length;
      svg += `<g class="node" data-pic="${esc(o)}"><title>${esc(o)} — ${n}</title>
        <circle cx="${oPos[o].x}" cy="${oPos[o].y}" r="15" fill="#fff" stroke="${colorFor(o)}" stroke-width="2"/>
        <text class="node-count" x="${oPos[o].x}" y="${oPos[o].y+3}">${esc(initials(o))}</text>
        <text class="node-label" x="${oPos[o].x}" y="${oPos[o].y+27}">${esc(o.split(" ").slice(-1)[0])}</text></g>`;
    });
    box.innerHTML = svg + `</svg>`;
    box.querySelectorAll("[data-pic]").forEach(g => g.addEventListener("click", () => setFilter("pic", g.dataset.pic)));
  } else {
    const groups = {};
    items.forEach(p => (groups[p._stream.name] = groups[p._stream.name] || []).push(p));
    const names = Object.keys(groups);
    const pos = {};
    names.forEach((nm, gi) => {
      const ga = (gi / names.length) * Math.PI * 2 - Math.PI/2;
      const gx = cx + Math.cos(ga)*118, gy = cy + Math.sin(ga)*118;
      groups[nm].forEach((p, i) => {
        const a = (i / Math.max(1, groups[nm].length)) * Math.PI * 2;
        const rr = groups[nm].length > 1 ? 52 : 0;
        pos[p.id] = { x: gx + Math.cos(a)*rr, y: gy + Math.sin(a)*rr };
      });
      svg += `<text class="node-label" x="${gx}" y="${gy - 68}" style="font-weight:700;fill:var(--ink-3)">${esc(nm)}</text>`;
    });

    const links = S.links.length ? S.links : suggestLinks();
    const confirmed = S.links.length > 0;
    links.forEach(l => {
      const a = pos[l.from], b = pos[l.to];
      if (!a || !b) return;
      svg += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${confirmed ? "#A855F7" : "#CBD5D0"}" stroke-width="${confirmed ? 2 : 1}" ${confirmed ? "" : 'stroke-dasharray="3 3"'}/>`;
    });
    items.forEach(p => {
      const q = pos[p.id]; if (!q) return;
      const r = p.priority === "High" ? 11 : p.priority === "Medium" ? 9 : 7;
      const deps = links.filter(l => l.from === p.id).length;
      svg += `<g class="node" data-id="${esc(p.id)}"><title>${esc(p.title)} — ${p._wri.score}</title>
        <rect x="${q.x-r}" y="${q.y-r}" width="${r*2}" height="${r*2}" rx="3" transform="rotate(45 ${q.x} ${q.y})" fill="${p._wri.band.color}"/>
        ${deps ? `<circle cx="${q.x+r+4}" cy="${q.y-r-2}" r="6" fill="#fff" stroke="#A855F7"/><text class="node-count" x="${q.x+r+4}" y="${q.y-r+1}">${deps}</text>` : ""}
        ${progArc(p, q.x, q.y, r + 5)}</g>`;
    });
    box.innerHTML = svg + `</svg>`;
  }

  box.querySelectorAll("[data-id]").forEach(g => g.addEventListener("click", () => focusItem(g.dataset.id)));
  el("netLegend").innerHTML = BANDS.map(b => `<span><i style="background:${b.color}"></i>${esc(t("bands."+b.key))}</span>`).join("") +
    `<span class="sep">${esc(t("legendSize"))} · ${esc(t("legendDeps"))}</span>`;
  el("netNote").textContent = netMode === "own" ? t("netNoteOwn")
    : (S.links.length ? t("netNoteConfirmed") : t("netNoteSuggested"));

  renderCriticalPath();
}

function renderCriticalPath() {
  const box = el("criticalPath");

  // Bỏ khỏi danh sách gợi ý những cặp đã xác nhận (và cặp ngược chiều của nó,
  // vì A chặn B thì B không thể chặn ngược lại A).
  const taken = new Set();
  S.links.forEach(l => { taken.add(l.from + ">" + l.to); taken.add(l.to + ">" + l.from); });
  const sug = suggestLinks().filter(l => !taken.has(l.from + ">" + l.to));

  let html = "";

  /* ---------- Phần 1: chuỗi đường găng (chỉ khi đã có liên kết) ---------- */
  if (S.links.length) {
    const chain = longestChain();
    if (chain.length > 1) {
      html += `<p class="card-foot" style="margin:0 0 12px">${esc(t("cpChain"))}</p>` +
        chain.map((p, i) => `<div class="link-item chain-step" data-id="${esc(p.id)}">
          <div class="link-pair">${i+1}. ${esc(p.title)}</div>
          <div class="link-ev">${esc(picsOf(p).join(", "))} · ${p.timeline_end ? fmtDate(p.timeline_end) : t("noDueDate")}</div>
          <div class="link-actions"><span class="pill" style="background:${p._wri.band.soft};color:${p._wri.band.color}">${p._wri.score}</span></div>
        </div>`).join("");
    }

    /* ---------- Phần 2: các liên kết đã xác nhận, có thể gỡ ---------- */
    html += `<div class="link-section"><span class="lbl">${esc(t("cpConfirmed"))} (${S.links.length})</span></div>`;
    html += S.links.map((l, i) => {
      const a = S.all.find(x => String(x.id) === String(l.from));
      const b = S.all.find(x => String(x.id) === String(l.to));
      if (!a || !b) return "";
      return `<div class="link-item">
        <div class="link-pair">${esc(a.title)}<span class="arrow">→</span>${esc(b.title)}</div>
        <div class="link-actions">
          <span class="ev-tag is-done">${esc(t("linkConfirmed"))}</span>
          <button class="btn btn-ghost btn-sm" data-unlink="${i}">${esc(t("removeLink"))}</button>
        </div></div>`;
    }).join("");
  }

  /* ---------- Phần 3: gợi ý còn lại — LUÔN hiện, để nối tiếp được ---------- */
  if (sug.length) {
    html += S.links.length
      ? `<div class="link-section"><span class="lbl">${esc(t("cpMore"))}</span></div>`
      : `<p class="card-foot" style="margin:0 0 12px">${esc(t("cpIntro"))}</p>`;

    html += sug.map((l, i) => {
      const a = S.all.find(x => String(x.id) === String(l.from));
      const b = S.all.find(x => String(x.id) === String(l.to));
      if (!a || !b) return "";
      return `<div class="link-item">
        <div class="link-pair">${esc(a.title)}<span class="arrow">→</span>${esc(b.title)}</div>
        <div class="link-ev">${esc(evidenceText(l))}</div>
        <div class="link-actions">
          <span class="ev-tag">${esc(l.kind === "note" ? t("evTagNote") : t("evTagStream"))}</span>
          <button class="btn btn-ghost btn-sm" data-link="${i}">${esc(t("confirmLink"))}</button>
        </div></div>`;
    }).join("");
  } else if (S.links.length) {
    html += `<div class="link-section"><span class="lbl">${esc(t("cpMore"))}</span></div>
             <p class="card-foot" style="margin:0">${esc(t("cpNoMore"))}</p>`;
  } else {
    box.innerHTML = emptyBox(t("cpNone"));
    return;
  }

  box.innerHTML = html;
  box.querySelectorAll("[data-link]").forEach(b =>
    b.addEventListener("click", () => confirmLink(sug[+b.dataset.link])));
  box.querySelectorAll("[data-unlink]").forEach(b =>
    b.addEventListener("click", () => removeLink(+b.dataset.unlink)));
  box.querySelectorAll(".chain-step[data-id]").forEach(d =>
    d.addEventListener("click", () => focusItem(d.dataset.id)));
}

function longestChain() {
  const next = {};
  S.links.forEach(l => (next[l.from] = next[l.from] || []).push(l.to));
  const memo = {}, busy = {};
  const walk = id => {
    if (memo[id]) return memo[id];
    if (busy[id]) return [id];            // gặp vòng lặp thì dừng
    busy[id] = true;
    let best = [];
    (next[id] || []).forEach(k => { const c = walk(k); if (c.length > best.length) best = c; });
    busy[id] = false;
    return (memo[id] = [id].concat(best));
  };
  let best = [];
  S.view.forEach(p => { const c = walk(p.id); if (c.length > best.length) best = c; });
  return best.map(id => S.all.find(x => x.id === id)).filter(Boolean);
}

async function confirmLink(link) {
  S.links.push(link);
  if (S.hasBlockedBy && !S.demo) {
    const target = S.all.find(x => x.id === link.to);
    const arr = (target.blocked_by || []).concat([link.from]);
    const { error } = await S.sb.from("projects").update({ blocked_by: arr }).eq("id", link.to);
    if (error) { toast(t("errSave")(error.message), "err"); S.links.pop(); return; }
    target.blocked_by = arr;
    toast(t("linkSaved"), "ok");
  } else {
    toast(t("linkSession"), "ok");
  }
  renderNetwork();
}

/** Gỡ một liên kết đã xác nhận — để sửa khi bấm nhầm. */
async function removeLink(index) {
  const l = S.links[index];
  if (!l) return;
  S.links.splice(index, 1);

  if (S.hasBlockedBy && !S.demo) {
    const target = S.all.find(x => String(x.id) === String(l.to));
    if (target) {
      const arr = (target.blocked_by || []).filter(x => String(x) !== String(l.from));
      const { error } = await S.sb.from("projects").update({ blocked_by: arr }).eq("id", l.to);
      if (error) { toast(t("errSave")(error.message), "err"); S.links.splice(index, 0, l); return; }
      target.blocked_by = arr;
    }
  }
  toast(t("linkRemoved"), "ok");
  renderNetwork();
}

/* ==========================================================================
   LUỒNG CHIẾN LƯỢC
   ========================================================================== */
function avgWri(list) { return list.length ? list.reduce((s,p) => s + p._wri.score, 0) / list.length : 0; }

/** Tiến độ cộng dồn của một luồng: cộng tất cả hạng mục nhỏ trong luồng lại.
    Đếm theo SỐ HẠNG MỤC chứ không lấy trung bình phần trăm — đầu mục 10 việc
    phải nặng hơn đầu mục 2 việc, lấy trung bình sẽ làm hai cái ngang nhau. */
function streamProgressHtml(list) {
  let total = 0, done = 0, elapsedSum = 0, elapsedCount = 0, lateSubs = 0;
  list.forEach(p => {
    const pr = p._wri.progress;
    total += pr.total; done += pr.done; lateSubs += pr.overdueSubs;
    if (pr.total && pr.elapsedPct !== null) { elapsedSum += pr.elapsedPct; elapsedCount++; }
  });
  if (!total) return "";

  const donePct = Math.round(done / total * 100);
  const elapsedPct = elapsedCount ? Math.round(elapsedSum / elapsedCount) : null;
  const gap = elapsedPct === null ? null : elapsedPct - donePct;
  const minGap = WRI.drift.ladder[WRI.drift.ladder.length - 1].gap;
  const drifting = gap !== null && gap >= minGap;

  return `<div class="stream-prog">
    <div class="sp-head">
      <span>${esc(t("progressLabel"))}</span>
      <strong>${donePct}<small>%</small></strong>
    </div>
    <div class="sp-bar">
      <i style="width:${donePct}%;background:${drifting ? "var(--critical)" : "var(--stable)"}"></i>
      ${elapsedPct !== null ? `<b style="left:${elapsedPct}%"></b>` : ""}
    </div>
    <div class="sp-legend">
      <span><i style="background:${drifting ? "var(--critical)" : "var(--stable)"}"></i>${esc(t("subsDone")(done, total))}</span>
      ${elapsedPct !== null ? `<span><i class="tick"></i>${esc(t("timeElapsed")(elapsedPct))}</span>` : ""}
    </div>
    ${drifting ? `<div class="sp-alert"><i class="bi bi-exclamation-triangle-fill"></i>
      <span>${esc(t("driftAlert")(gap, elapsedPct, donePct))}${lateSubs ? " " + esc(t("driftLateSubs")(lateSubs)) : ""}</span></div>` : ""}
  </div>`;
}

function renderStreams() {
  const groups = {};
  S.view.forEach(p => (groups[p._stream.id] = groups[p._stream.id] || []).push(p));

  // Luồng người dùng tự tạo mà chưa có việc nào vẫn hiện ra, để còn gán vào.
  S.customStreams.forEach(id => { if (!groups[id]) groups[id] = []; });

  const ids = Object.keys(groups).sort((a,b) => avgWri(groups[b]) - avgWri(groups[a]));
  if (!ids.length) { el("streamList").innerHTML = emptyBox(t("noItemsInFilter")); return; }

  el("streamList").innerHTML = ids.map(id => {
    const list = groups[id].slice().sort((a,b) => b._wri.score - a._wri.score);
    const wri = Math.round(avgWri(list));
    const band = bandOf(wri);
    const name = id === "__none" ? t("noStreamYet") : streamLabel(id);

    const load = {};
    list.forEach(p => picsOf(p).forEach(n => { load[n] = (load[n]||0) + 1/picsOf(p).length; }));
    const owners = Object.entries(load).sort((a,b) => b[1]-a[1]);
    const totalW = owners.reduce((s,x) => s+x[1], 0) || 1;
    const lead = owners[0];

    const upcoming = list.filter(p => p.timeline_end && p.status !== "Done")
                         .sort((a,b) => toDate(a.timeline_end) - toDate(b.timeline_end))[0];
    const late = list.filter(FLAGS.overdue.test).length;
    const inferred = list.some(p => p._stream.inferred);

    return `<div class="stream-card" style="border-left-color:${band.color}">
      <div class="stream-head">
        <div>
          <span class="eyebrow">${esc(t("streamsEyebrow"))}</span>
          <h3 class="stream-name">${esc(name)} ${inferred ? '<span class="tilde">~</span>' : ""}</h3>
        </div>
        <div class="stream-badges">
          <span class="pill" style="background:${band.soft};color:${band.color}">${wri}</span>
          <span class="pill plain" style="background:var(--surface-2);color:var(--ink-2)">${list.length} ${esc(t("itemsUnit"))}</span>
        </div>
      </div>
      ${streamProgressHtml(list)}

      <div class="stream-stats">
        <div class="stat-box">
          <div class="stat-label">${esc(t("streamLead"))}</div>
          <div class="stat-val">${lead ? esc(lead[0]) : esc(t("unassigned"))}</div>
          <div class="stat-sub">${lead ? esc(t("streamShare")(Math.round(lead[1]/totalW*100))) : "—"}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">${esc(t("streamNext"))}</div>
          <div class="stat-val">${upcoming ? fmtDate(upcoming.timeline_end) : esc(t("noDueDate"))}</div>
          <div class="stat-sub">${upcoming ? esc(upcoming.title.slice(0,42)) : "—"}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">${esc(t("streamOverdue"))}</div>
          <div class="stat-val" style="color:${late ? "var(--critical)" : "var(--ink)"}">${late}</div>
          <div class="stat-sub">${esc(late ? t("streamNeedsAction") : t("streamOnTrack"))}</div>
        </div>
      </div>
      ${list.map(p => `<div class="stream-item" data-id="${esc(p.id)}">
        <div class="si-main">
          ${picsOf(p).slice(0,2).map(n => avatar(n,"sm")).join("")}
          <span class="grow">${esc(p.title)}</span>
          ${progBadge(p)}
          <span class="pill" style="background:${p._wri.band.soft};color:${p._wri.band.color}">${p._wri.score}</span>
        </div>
        ${subLinesHtml(p.id, 2)}
      </div>`).join("")}
    </div>`;
  }).join("");

  el("streamList").querySelectorAll("[data-id]").forEach(r => r.addEventListener("click", () => focusItem(r.dataset.id)));
}

/* ==========================================================================
   DÒNG THỜI GIAN
   ========================================================================== */
function renderGantt() {
  const items = S.view.slice().sort((a,b) => {
    const ea = toDate(a.timeline_end), eb = toDate(b.timeline_end);
    if (!ea && !eb) return 0; if (!ea) return 1; if (!eb) return -1;
    return ea - eb;
  });
  if (!items.length) { el("gantt").innerHTML = emptyBox(t("noItemsInFilter")); return; }

  const dates = items.flatMap(p => [toDate(p.timeline_start), toDate(p.timeline_end)]).filter(Boolean);
  const now = today0();
  const min = new Date(Math.min(now, ...dates)); min.setDate(min.getDate() - 6);
  const max = new Date(Math.max(now, ...dates)); max.setDate(max.getDate() + 8);
  const span = Math.max(1, daysBetween(min, max));
  const posOf = d => daysBetween(min, d) / span * 100;

  // Vạch tháng và TÊN tháng phải tách nhau: tên chỉ vẽ một lần ở hàng tiêu đề.
  // Trước đây cả hai được nhồi vào mọi hàng nên mỗi dòng lại hiện lại "Aug 2026,
  // Sep 2026…" chồng lên thanh tiến độ.
  let tickLines = "", tickNames = "";
  const m = new Date(min.getFullYear(), min.getMonth() + 1, 1);
  while (m <= max) {
    const left = posOf(m);
    const label = LANG === "vi" ? `Th${m.getMonth()+1} ${m.getFullYear()}`
      : m.toLocaleString("en", { month: "short" }) + " " + m.getFullYear();
    tickLines += `<div class="month-tick" style="left:${left}%"></div>`;
    tickNames += `<div class="month-name" style="left:${left}%">${label}</div>`;
    m.setMonth(m.getMonth() + 1);
  }
  const nowLeft = posOf(now);

  el("gantt").innerHTML = `
    <div class="gantt-head">
      <div class="gantt-label"><span class="lbl" style="margin:0">${esc(t("colItemHead"))}</span></div>
      <div class="gantt-lane" style="height:22px">${tickLines}${tickNames}
        <div class="now-line" style="left:${nowLeft}%"></div>
        <div class="now-flag" style="left:${nowLeft}%">NOW</div></div>
    </div>` +
    items.map(p => {
      const s = toDate(p.timeline_start), e = toDate(p.timeline_end);
      const c = p._wri.band.color;
      let bar;
      if (s && e) {
        const l = posOf(s), w = Math.max(1.2, posOf(e) - posOf(s));
        bar = `<div class="gantt-bar" style="left:${l}%;width:${w}%;background:${c};opacity:.85"></div>`;
      } else if (e) {
        bar = `<div class="gantt-diamond" style="left:${posOf(e)}%;background:${c}"></div>`;
      } else {
        bar = `<div class="gantt-nodate" style="left:${nowLeft}%;width:${Math.max(8, 96-nowLeft)}%">${esc(t("noDueBar"))}</div>`;
      }
      // Mốc nhỏ = hạn của từng hạng mục con, đặt đúng vị trí ngày trên thanh.
      const subMarks = (S.subs[p.id] || []).filter(x => x.due).map(x => {
        const d = toDate(x.due); if (!d) return "";
        const late = !x.done && d < now;
        return `<span class="g-sub${x.done ? " is-done" : late ? " is-late" : ""}"
          style="left:${posOf(d)}%" title="${esc(x.title)} · ${fmtDate(x.due)}"></span>`;
      }).join("");

      return `<div class="gantt-row" data-id="${esc(p.id)}">
        <div class="gantt-label">
          <div class="gantt-title">${esc(p.title)}</div>
          <div class="gantt-meta">${esc(picsOf(p).join(", "))} · ${e ? fmtDate(p.timeline_end) : esc(t("noDueDate"))}${progBadge(p, { bar: false })}</div>
        </div>
        <div class="gantt-lane">${tickLines}<div class="now-line" style="left:${nowLeft}%;opacity:.32"></div>${bar}${subMarks}</div>
      </div>`;
    }).join("");

  el("gantt").querySelectorAll("[data-id]").forEach(r => r.addEventListener("click", () => focusItem(r.dataset.id)));
}

/* ==========================================================================
   BẢNG ĐIỀU HÀNH — kéo thả, mọi màn hình khác đồng bộ theo
   ========================================================================== */
function renderBoard() {
  el("boardNote").textContent = S.demo ? t("boardNoteDemo") : t("boardNoteLive");

  el("board").innerHTML = STATUSES.map(st => {
    const list = S.view.filter(p => p.status === st);
    return `<div class="col" data-status="${st}">
      <div class="col-head">
        <span class="col-name"><i style="background:${STATUS_COLOR[st]}"></i>${st}</span>
        <span class="col-count">${list.length}</span>
      </div>
      ${list.length ? list.map(p => `
        <div class="kcard" draggable="true" data-id="${esc(p.id)}" style="border-left-color:${p._wri.band.color}">
          <div class="kcard-title">${esc(p.title)}</div>
          <div class="kcard-meta">
            ${picsOf(p).slice(0,2).map(n => avatar(n,"sm")).join("")}
            <span>${esc(picsOf(p)[0] || t("unassigned"))}</span>
            <span class="pill" style="background:${p._wri.band.soft};color:${p._wri.band.color}">${p._wri.score}</span>
            ${progBadge(p)}
            <span>${esc(reasonText(p._wri))}</span>
          </div>
          ${subLinesHtml(p.id, 2)}
        </div>`).join("") : '<div class="col-empty">—</div>'}
    </div>`;
  }).join("");

  el("board").querySelectorAll(".kcard").forEach(c => {
    c.addEventListener("dragstart", e => { e.dataTransfer.setData("text/plain", c.dataset.id); c.classList.add("dragging"); });
    c.addEventListener("dragend", () => c.classList.remove("dragging"));
    c.addEventListener("dblclick", () => focusItem(c.dataset.id));
  });
  el("board").querySelectorAll(".col").forEach(col => {
    col.addEventListener("dragover", e => { e.preventDefault(); col.classList.add("is-over"); });
    col.addEventListener("dragleave", () => col.classList.remove("is-over"));
    col.addEventListener("drop", e => {
      e.preventDefault(); col.classList.remove("is-over");
      updateStatus(e.dataTransfer.getData("text/plain"), col.dataset.status);
    });
  });
}

/* ==========================================================================
   DANH SÁCH
   ========================================================================== */
function destroyTable() { if (itemsTable) { itemsTable.destroy(); itemsTable = null; $("#itemsTable tbody").empty(); } }

/** Chèn dòng con vào bảng cho những đầu mục đang mở rộng. */
function paintSubRows() {
  if (!itemsTable) return;
  itemsTable.rows().every(function () {
    const r = this.data();
    const has = (S.subs[r.id] || []).length > 0;

    // Xóa hết hạng mục con thì thu gọn lại, nếu không sẽ còn một khung rỗng
    // mở toang mà không có mũi tên nào để đóng.
    if (!has) S.expanded[r.id] = false;

    if (S.expanded[r.id]) {
      this.child.remove();                       // gỡ bản cũ rồi mới vẽ bản mới
      this.child(subRowHtml(r.id)).show();
      bindSubRow(this.child(), r.id);
    } else {
      this.child.remove();
    }
  });
}


/* ==========================================================================
   THANH BẬC SẮP XẾP — kiểu Excel
   Bấm tiêu đề cột = đặt làm bậc 1 (xóa các bậc cũ).
   Giữ Shift rồi bấm = thêm một bậc phía sau, bậc trước giữ nguyên thứ tự.
   DataTables đã hỗ trợ sẵn, nhưng không ai đoán ra nếu không hiện lên màn hình,
   nên vẽ các bậc đang áp dụng thành chip có thể gỡ.
   ========================================================================== */
function renderSortBar() {
  const bar = el("sortBar");
  if (!bar || !itemsTable) return;

  const order = itemsTable.order();      // [[cột, chiều], ...]
  const names = itemsTable.columns().header().toArray().map(th => th.textContent.trim());

  if (!order.length) { bar.innerHTML = ""; return; }

  bar.innerHTML = `<span class="sb-lbl">${esc(t("sortBy"))}</span>` +
    order.map(([c, d], i) => `
      <span class="sb-chip">
        <b>${i + 1}</b>${esc(names[c] || "—")}
        <i class="bi bi-arrow-${d === "asc" ? "up" : "down"}"></i>
        <button class="sb-x" data-drop="${i}" title="${esc(t("sortRemove"))}">
          <i class="bi bi-x"></i></button>
      </span>`).join("") +
    (order.length > 1 ? `<button class="linkbtn sb-clear">${esc(t("sortReset"))}</button>` : "") +
    `<span class="sb-hint">${esc(t("sortHint"))}</span>`;

  bar.querySelectorAll("[data-drop]").forEach(b => b.addEventListener("click", () => {
    const rest = order.filter((_, i) => i !== +b.dataset.drop);
    itemsTable.order(rest.length ? rest : [[2, "desc"]]).draw();
  }));
  const cl = bar.querySelector(".sb-clear");
  if (cl) cl.addEventListener("click", () => itemsTable.order([[2, "desc"]]).draw());
}

function subRowHtml(projectId) {
  const list = S.subs[projectId] || [];
  const F = S.hasSubFields;

  const row = s => {
    const late = !s.done && s.due && toDate(s.due) < today0();
    const pr = s.priority || "Medium";
    const st = s.status || (s.done ? "Done" : "Open");
    return `<div class="subrow-item ${s.done ? "is-done" : ""}" data-sub="${esc(s.id)}">
      <button class="sub-tick" data-tick="${esc(s.id)}" title="${esc(t("subToggle"))}">
        <i class="bi ${s.done ? "bi-check-square-fill" : "bi-square"}"></i>
      </button>

      <div class="sub-main">
        <input class="sub-inp sub-title" data-f="title" value="${esc(s.title)}" />
        ${F ? `<input class="sub-inp sub-note" data-f="note" value="${esc(s.note || "")}"
                 placeholder="${esc(t("subNotePh"))}" />` : ""}
      </div>

      ${F ? `<select class="sub-pick sub-prio" data-f="priority"
               style="background:${PRIORITY_COLOR[pr]}1F;color:${PRIORITY_COLOR[pr]}">
          ${PRIORITIES.map(o => `<option${o === pr ? " selected" : ""}>${o}</option>`).join("")}
        </select>
        <select class="sub-pick sub-stat" data-f="status"
               style="background:${STATUS_COLOR[st]}1F;color:${STATUS_COLOR[st]}">
          ${STATUSES.map(o => `<option${o === st ? " selected" : ""}>${o}</option>`).join("")}
        </select>` : ""}

      <input class="sub-inp sub-own" data-f="owner" list="picList"
             value="${esc(s.owner || "")}" placeholder="${esc(t("unassigned"))}" />
      <input class="sub-inp sub-date ${late ? "is-late" : ""}" data-f="due" type="date"
             value="${s.due ? String(s.due).slice(0,10) : ""}" />
      <button class="icon-btn danger sub-del" data-del="${esc(s.id)}"
              title="${esc(t("delete"))}"><i class="bi bi-trash3"></i></button>
    </div>`;
  };

  return `<div class="subrow">
    ${list.length ? `<div class="subrow-head">
        <span class="sh-tick"></span>
        <span class="sh-main">${esc(t("subColTitle"))}</span>
        ${F ? `<span class="sh-prio">${esc(t("priority"))}</span>
               <span class="sh-stat">${esc(t("status"))}</span>` : ""}
        <span class="sh-own">${esc(t("owner"))}</span>
        <span class="sh-date">${esc(t("colDue"))}</span>
        <span class="sh-act"></span>
      </div>` : ""}
    ${list.map(row).join("")}

    ${F ? "" : `<div class="sub-upgrade">${esc(t("subNeedV4"))}</div>`}

    <div class="subrow-new">
      <i class="bi bi-plus-lg"></i>
      <input class="sub-inp sub-new-inp" data-newsub="${esc(projectId)}"
             placeholder="${esc(t("subAddPh"))}" />
      <span class="sub-new-hint">${esc(t("subAddHint"))}</span>
    </div>
  </div>`;
}

function bindSubRow(node, projectId) {
  const $n = $(node);
  const idOf = elm => $(elm).closest(".subrow-item").attr("data-sub");

  /* tick hoàn thành */
  $n.find("[data-tick]").off("click").on("click", function (e) {
    e.stopPropagation();
    const id = this.getAttribute("data-tick");
    const s = (S.subs[projectId] || []).find(x => String(x.id) === String(id));
    if (s) updateSub(projectId, id, { done: !s.done });
  });

  /* ô chọn: đổi là lưu ngay */
  $n.find(".sub-pick").off("change").on("change", function () {
    const patch = {}; patch[this.getAttribute("data-f")] = this.value;
    updateSub(projectId, idOf(this), patch);
  });

  /* ô nhập: lưu khi rời ô hoặc nhấn Enter, Esc để hủy */
  $n.find(".sub-inp:not(.sub-new-inp)").each(function () {
    const inp = this, orig = inp.value;
    let done = false;
    const commit = () => {
      if (done) return; done = true;
      const f = inp.getAttribute("data-f");
      let val = inp.value.trim();
      if (f === "title" && !val) { inp.value = orig; return; }   // không cho xóa trắng tên
      if (val === orig) return;
      const patch = {}; patch[f] = val || null;
      updateSub(projectId, idOf(inp), patch);
    };
    $(inp).off("blur").on("blur", commit);
    $(inp).off("keydown").on("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); inp.blur(); }
      if (e.key === "Escape") { done = true; inp.value = orig; inp.blur(); }
    });
    $(inp).off("click").on("click", e => e.stopPropagation());
  });

  /* xóa */
  $n.find("[data-del]").off("click").on("click", function (e) {
    e.stopPropagation();
    const id = this.getAttribute("data-del");
    const s = (S.subs[projectId] || []).find(x => String(x.id) === String(id));
    if (s && confirm(t("subDeleteConfirm")(s.title))) deleteSub(projectId, id);
  });

  /* thêm mới ngay trong bảng — không phải mở popup nữa */
  $n.find("[data-newsub]").off("keydown").on("keydown", function (e) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const val = this.value.trim();
    if (!val) return;
    this.value = "";
    addSub(projectId, val);
  });
  $n.find("[data-newsub]").off("click").on("click", e => e.stopPropagation());
}

function renderList() {
  el("listCount").textContent = S.view.length;
  const rows = S.view.map(p => ({
    id: p.id, p, title: p.title || "", wri: p._wri.score, pic: p.pic || "",
    due: p.timeline_end || "9999-12-31",
    priority: { "High":1, "Medium":2, "Low":3 }[p.priority] || 9,
    status: { "Open":1, "In Progress":2, "Done":3 }[p.status] || 9,
    next: p.next_steps || "", prog: 0
  }));

  if (itemsTable) {
    // PHẢI gỡ dòng con TRƯỚC khi clear(). DataTables chèn dòng con thành <tr>
    // riêng trong bảng; clear() chỉ xóa dòng dữ liệu, để lại <tr> con mồ côi
    // trong DOM. paintSubRows() sau đó chèn thêm một bản nữa -> nhìn thấy
    // hạng mục con lặp hai lần, và lần làm mới sau bảng có thể trắng luôn.
    itemsTable.rows().every(function () { this.child.remove(); });
    itemsTable.clear().rows.add(rows).draw(false);
    paintSubRows();
    renderSortBar();
    return;
  }

  itemsTable = new DataTable("#itemsTable", {
    data: rows, pageLength: 25, order: [[2, "desc"]],   // cột Rủi ro dịch sang phải 1 vì có thêm cột Tiến độ
    orderMulti: true,          // giữ nhiều bậc sắp xếp cùng lúc, kiểu Excel
    columns: [
      { data: "title", render: (v, ty, r) => ty !== "display" ? v : (() => {
          const n = (S.subs[r.id] || []).length;
          const caret = n
            ? `<button class="row-toggle" data-expand="${esc(r.id)}" aria-label="${esc(t("expandRow"))}"><i class="bi bi-chevron-${S.expanded[r.id] ? "down" : "right"}"></i></button>`
            : `<span class="row-toggle is-empty"></span>`;
          return `<div class="t-titlewrap">${caret}<div>
              <div class="t-title" data-open="${esc(r.id)}">${esc(v)}</div>
              ${r.p.description ? `<div class="t-desc">${esc(String(r.p.description).slice(0,90))}</div>` : ""}
            </div></div>`;
        })() },
      // --- Tiến độ: vạch dọc là mốc thời gian đã trôi, để thấy ngay lệch tiến độ ---
      { data: "prog", render: (v, ty, r) => {
          const pr = r.p._wri.progress;
          if (ty !== "display") return pr.total ? pr.donePct : -1;
          if (!pr.total) return `<span class="t-muted">${esc(t("noSubs"))}</span>`;
          const lastGap = WRI.drift.ladder[WRI.drift.ladder.length - 1].gap;
          const late = r.p._wri.driftGap !== null && r.p._wri.driftGap >= lastGap;
          return `<span class="prog-cell">
            <span class="prog-bar">
              <i style="width:${pr.donePct}%;background:${late ? "var(--critical)" : "var(--stable)"}"></i>
              ${pr.elapsedPct !== null ? `<b style="left:${pr.elapsedPct}%"></b>` : ""}
            </span>
            <span class="prog-num">${pr.done}/${pr.total}</span></span>`;
        } },
      { data: "wri", render: (v, ty, r) => ty !== "display" ? v : (() => {
          const b = r.p._wri.band;
          return `<span class="wri-cell"><span class="pill" style="background:${b.soft};color:${b.color}">${v}</span>
            <span class="wri-bar"><i style="width:${v}%;background:${b.color}"></i></span></span>`; })() },
      { data: "pic", render: (v, ty, r) => ty !== "display" ? v :
        `<span class="cell-edit" data-id="${esc(r.id)}" data-field="pic" title="${esc(t("editHint"))}">${v
          ? `<span class="pic-cell">${v.split(",").map(n => avatar(n.trim(),"sm")).join("")}<span>${esc(v)}</span></span>`
          : `<span class="t-muted">${esc(t("unassigned"))}</span>`}</span>` },
      { data: "due", render: (v, ty, r) => ty !== "display" ? v :
        `<span class="cell-edit" data-id="${esc(r.id)}" data-field="timeline_end" title="${esc(t("editHint"))}">${r.p.timeline_end
          ? `<div>${fmtDate(r.p.timeline_end)}</div><div class="due-rel" style="color:${r.p._wri.band.color}">${esc(reasonText(r.p._wri))}</div>`
          : `<span class="t-muted">${esc(t("noDueDate"))}</span>`}</span>` },
      // Ưu tiên & Trạng thái sửa được ngay tại chỗ, không cần mở popup.
      { data: "priority", render: (v, ty, r) => ty !== "display" ? v :
        `<select class="cell-pick" data-id="${esc(r.id)}" data-field="priority"
           style="background:${PRIORITY_COLOR[r.p.priority]}1F;color:${PRIORITY_COLOR[r.p.priority]}">
           ${PRIORITIES.map(o => `<option${o === r.p.priority ? " selected" : ""}>${o}</option>`).join("")}
         </select>` },
      { data: "status", render: (v, ty, r) => ty !== "display" ? v :
        `<select class="cell-pick" data-id="${esc(r.id)}" data-field="status"
           style="background:${STATUS_COLOR[r.p.status]}1F;color:${STATUS_COLOR[r.p.status]}">
           ${STATUSES.map(o => `<option${o === r.p.status ? " selected" : ""}>${o}</option>`).join("")}
         </select>` },
      // Ô trống ở đây KHÔNG phải thiếu sót — nghĩa là việc chỉ còn hoàn thiện nốt.
      { data: "next", render: (v, ty) => ty !== "display" ? v :
        (v ? `<div class="t-next">${esc(v)}</div>` : `<span class="t-muted">${esc(t("nextDone"))}</span>`) },
      { data: "id", orderable: false, searchable: false,
        render: v => `<button class="icon-btn" data-open="${esc(v)}"><i class="bi bi-pencil"></i></button>` }
    ],
    language: {
      info: t("dtInfo"), infoEmpty: t("dtInfoEmpty"), zeroRecords: t("dtZero"), emptyTable: t("dtEmpty"),
      paginate: { first: t("dtFirst"), last: t("dtLast"), next: t("dtNext"), previous: t("dtPrev") }
    }
  });
  itemsTable.on("order.dt", function () { renderSortBar(); });
  renderSortBar();

  $("#itemsTable tbody").on("click", "[data-open]", function () { focusItem(this.getAttribute("data-open")); });

  $("#itemsTable tbody").on("click", "[data-expand]", function (e) {
    e.stopPropagation();
    const id = this.getAttribute("data-expand");
    S.expanded[id] = !S.expanded[id];
    renderList();
  });

  /* --- Sửa nhanh: ô chọn đổi là lưu luôn --- */
  $("#itemsTable tbody").on("change", ".cell-pick", function () {
    saveField(this.getAttribute("data-id"), this.getAttribute("data-field"), this.value);
  });
  // Chặn click lan ra ngoài, tránh vừa mở select vừa kích hoạt thứ khác.
  $("#itemsTable tbody").on("click", ".cell-pick", e => e.stopPropagation());

  /* --- Sửa nhanh: bấm vào ô là biến thành ô nhập --- */
  $("#itemsTable tbody").on("click", ".cell-edit", function () {
    if (this.querySelector("input")) return;         // đang sửa rồi thì thôi
    const id = this.getAttribute("data-id"), field = this.getAttribute("data-field");
    const p = S.all.find(x => String(x.id) === String(id));
    if (!p) return;

    const html = this.innerHTML;
    const input = document.createElement("input");
    if (field === "timeline_end") { input.type = "date"; input.value = p.timeline_end ? String(p.timeline_end).slice(0,10) : ""; }
    else { input.type = "text"; input.value = p.pic || ""; input.setAttribute("list", "picList"); }
    input.className = "cell-input";

    this.innerHTML = "";
    this.appendChild(input);
    input.focus();
    if (input.type === "text") input.select();

    let closed = false;
    const cancel = () => { if (!closed) { closed = true; this.innerHTML = html; } };
    const commit = () => { if (closed) return; closed = true; saveField(id, field, input.value); };

    input.addEventListener("keydown", ev => {
      if (ev.key === "Enter") { ev.preventDefault(); commit(); }
      if (ev.key === "Escape") { ev.preventDefault(); cancel(); }
    });
    input.addEventListener("blur", commit);
    input.addEventListener("click", ev => ev.stopPropagation());
  });
}

/* ==========================================================================
   DỮ LIỆU & HỆ THỐNG
   ========================================================================== */
function renderSystem() {
  const d = digest(S.view);

  el("qualityGrid").innerHTML = d.quality.map(q => {
    const color = q.pct >= 80 ? "var(--stable)" : q.pct >= 40 ? "var(--high)" : "var(--critical)";
    const shown = q.missingItems.slice(0, 6);
    return `<div class="q-card">
      <div class="q-head"><span class="q-name">${esc(q.label)}</span><span class="q-pct" style="color:${color}">${q.pct}<small>%</small></span></div>
      <div class="q-bar"><i style="width:${q.pct}%;background:${color}"></i></div>
      <div class="q-sub">${esc(t("qFilled")(q.filled, q.total))}</div>
      <div class="q-miss">${shown.map(p => `<div data-open="${esc(p.id)}">· ${esc(p.title)}</div>`).join("")}
        ${q.missingItems.length > 6 ? `<div class="q-more">${esc(t("qMore")(q.missingItems.length-6))}</div>` : ""}</div>
    </div>`;
  }).join("");
  el("qualityGrid").querySelectorAll("[data-open]").forEach(x => x.addEventListener("click", () => focusItem(x.dataset.open)));
  el("qualityFoot").textContent = t("qualityFoot")(d.itemsNeedingData);

  /* Bảng công thức dựng thẳng từ object WRI — kể cả trần điểm cũng được tính
     ra, nên sửa bảng điểm là phần giải thích tự khớp lại. */
  el("formulaIntro").textContent = t("formulaIntro")(5, WRI.cap);

  /* Mỗi dòng mang một ĐƯỜNG DẪN trỏ thẳng vào object WRI, ví dụ
     "schedule.ladder.0.points". Nhờ vậy ô nhập tự biết phải sửa số nào —
     thêm bậc mới vào bảng điểm là có ngay ô nhập, không phải viết thêm code. */
  const blocks = [
    { key: "schedule", rows:
      [[t(WRI.schedule.noDue.labelKey),   WRI.schedule.noDue.points,   "schedule.noDue.points"],
       [t(WRI.schedule.overdue.labelKey), WRI.schedule.overdue.points, "schedule.overdue.points"]]
      .concat(WRI.schedule.ladder.map((s, i) => [t("fWithin")(s.days), s.points, `schedule.ladder.${i}.points`]))
      .concat([[t(WRI.schedule.beyond.labelKey), WRI.schedule.beyond.points, "schedule.beyond.points"]]) },
    { key: "priority", rows: Object.keys(WRI.priority.points).map(k => [k, WRI.priority.points[k], `priority.points.${k}`]) },
    { key: "status",   rows: Object.keys(WRI.status.points).map(k => [k, WRI.status.points[k], `status.points.${k}`]) },
    { key: "data",     rows: WRI.data.fields.map((f, i) => [t(f.labelKey), f.points, `data.fields.${i}.points`]) },
    { key: "drift",    rows: WRI.drift.ladder.map((l, i) => [t(l.labelKey), l.points, `drift.ladder.${i}.points`])
                             .concat([[t(WRI.drift.onTrack.labelKey), WRI.drift.onTrack.points, "drift.onTrack.points"]]) }
  ];

  el("formulaGrid").innerHTML = blocks.map((b, i) => `
    <div class="f-card">
      <div class="f-head"><span class="f-name">${i+1} · ${esc(t(WRI[b.key].labelKey))}</span><span class="f-range">0–${componentMax(b.key)}</span></div>
      ${b.rows.map(([k, val, path]) => `<div class="f-row">
          <span>${esc(k)}</span>
          <input type="number" class="f-input" min="0" max="100" step="1" value="${val}" data-w="${path}" aria-label="${esc(k)}" />
        </div>`).join("")}
      ${b.key === "drift" ? `<div class="f-note">${esc(t("driftNote"))}</div>` : ""}
    </div>`).join("");

  // Sửa số là chấm lại toàn bộ danh mục ngay.
  el("formulaGrid").querySelectorAll(".f-input").forEach(inp => {
    inp.addEventListener("change", e => setWeight(e.target.dataset.w, e.target.value));
  });

  // Các ngưỡng cũng cho sửa: số ngày "sắp đến hạn" và mức lệch bắt đầu cảnh báo.
  el("thresholdRow").innerHTML = `
    <label class="th-item"><span>${esc(t("thDueSoon"))}</span>
      <input type="number" class="f-input" min="1" max="90" step="1" value="${THRESHOLDS.dueSoonDays}" data-th="dueSoonDays" /></label>
    <label class="th-item"><span>${esc(t("thDrift"))}</span>
      <input type="number" class="f-input" min="1" max="99" step="1" value="${minDriftGap()}" data-th="driftGap" /></label>
    <button type="button" class="btn btn-ghost btn-sm" id="btnResetWeights">${esc(t("weightResetBtn"))}</button>`;

  el("thresholdRow").querySelectorAll("[data-th]").forEach(inp =>
    inp.addEventListener("change", e => {
      const k = e.target.dataset.th;
      if (k === "driftGap") setDriftGate(e.target.value); else setThreshold(k, e.target.value);
    }));
  el("btnResetWeights").addEventListener("click", resetWeights);

  el("bandLegend").innerHTML = BANDS.map((b, i) => {
    const hi = i === 0 ? 100 : BANDS[i-1].min - 1;
    return `<span><i style="background:${b.color}"></i>${esc(t("bands."+b.key))} · ${b.min}–${hi}</span>`;
  }).join("");
}

/* Nút chuyển chế độ mạng lưới */
document.addEventListener("click", e => {
  const b = e.target.closest("#netMode .seg-btn");
  if (!b) return;
  netMode = b.dataset.mode;
  document.querySelectorAll("#netMode .seg-btn").forEach(x => x.classList.toggle("is-active", x === b));
  renderNetwork();
});
