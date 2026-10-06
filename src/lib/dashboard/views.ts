// Nội dung các tab (trừ tab Dữ liệu) — dựng HTML từ kết quả tính toán ở calc.ts
import { Ctx, Period, AR, AP, Cash, Alert, AR_BUCKETS, TIERS, tier, tierIdx, AXIS_NAME, Axis, num, hasActual,
  CustRow, GroupBlock, ArCust, ApSup, CashDetail, PaySchedule } from "./calc";
import { barChart, lineChart, waterfall, hBullet, hStack, divBars, donut, tierChart, legend, pill, stCls, xC, empty, LegendItem } from "./charts";
import { esc, ty, tyN, tr, n0, pc, sum, ok, N1, N2, kyShort, fmtDate, kyIdx, days } from "./util";
import type { AlertAction } from "./types";

export interface VM {
  C: Ctx; P: Period; A: AR; B: AP; CS: Cash; AL: Alert[]; ky: string;
  CR: CustRow[]; GB: GroupBlock[]; ARC: ArCust[]; APS: ApSup[]; CD: CashDetail; PS: PaySchedule;
  AA: Record<string, AlertAction>;
  canEdit: boolean;
}
// Bảng màu biểu đồ lấy từ Display palette của Xperise Design System.
// Tuổi nợ là thang tuần tự (xanh → vàng → cam → đỏ → đỏ đậm); các mảng và
// nhóm khách là thang phân loại, chọn các hue cách xa nhau để dễ phân biệt.
const D = (hue: string, step = "default") => `color-display-${hue}-${step}`;
const BCLS = [D("green"), D("yellow"), D("orange"), D("red"), D("red", "strong")];
const AXC: Record<Axis, string> = { T: D("cyan"), M: D("purple"), S: D("blue"), F: D("orange") };
const GC: Record<string, string> = { N1: D("cyan"), N2: D("blue"), N3: D("purple"), N4: D("green"), N5: D("gray") };
const GNAME: Record<string, string> = { N1: "Travel", N2: "Top200 active", N3: "Top200 lapser", N4: "Active ngoài Top200", N5: "Lapser ngoài Top200" };

const card = (eyebrow: string, title: string, note: string, body: string, extra = "") =>
  `<div class="card ${extra}"><div class="card-h"><div><div class="eyebrow">${esc(eyebrow)}</div><div class="card-title">${esc(title)}</div></div><div class="card-note">${note}</div></div>${body}</div>`;
const details = (label: string, body: string) => `<div class="card"><details><summary>${esc(label)}</summary><div class="tw" style="margin-top:12px">${body}</div></details></div>`;
const stat = (l: string, v: string, c = "") => `<div class="stat"><div class="l">${esc(l)}</div><div class="v ${c ? "c-" + c : ""}">${v}</div></div>`;
/** Dải tóm tắt điều hành của từng tab: một câu dẫn + các ý ngắn có màu trạng thái. */
function execBand(eyebrow: string, lead: string, points: [string, string][]): string {
  if (!lead && !points.length) return "";
  return `<div class="card banner sub"><div class="eyebrow">${esc(eyebrow)}</div>` +
    (lead ? `<p>${esc(lead)}</p>` : "") +
    (points.length ? `<ul class="band-list">${points.map(([t, c]) => `<li class="bl-${c}">${esc(t)}</li>`).join("")}</ul>` : "") +
    `</div>`;
}
const arrow = (d: number | null) => (d == null ? "" : (d > 0 ? "tăng " : "giảm ") + pc(Math.abs(d), 0));
const nameOf = (r: { ten: string }) => r.ten;

const noActual = (ky: string) => `<div class="card notice">Kỳ ${esc(ky)} chưa có số liệu GMV thực tế. Upload sheet GMV cho kỳ này ở tab <a href="#" data-go="data">Dữ liệu</a>.</div>`;

/* ---------- KPI strip ---------- */
export function kpiStrip(v: VM): string {
  const { P, A, CS } = v;
  const cTot = sum(P.cust.groups, (g) => g.act), cTgt = sum(P.cust.groups, (g) => g.tgt || 0);
  const lastBal = CS.halves.filter((h) => h.h.startsWith(v.ky)).slice(-1)[0]?.bal ?? CS.halves.slice(-1)[0]?.bal ?? null;
  // [nhãn, giá trị, phụ đề, mức thước đo, màu trạng thái, tab khi bấm, icon RemixIcon]
  const k: [string, string, string, number, string, string, string][] = [
    ["GMV kỳ", ty(P.totAct), P.totTgt ? `${pc(P.x)} của ${ty(P.totTgt)} kế hoạch` : "chưa có kế hoạch", P.x ?? 0, stCls(P.x), "revenue", "ri-shopping-bag-3-line"],
    ["Margin net", ty(P.gp), P.mgTgtTot ? `${pc(P.gp / P.mgTgtTot)} kế hoạch · ${pc(P.totAct ? P.gp / P.totAct : null, 2)} GMV` : "", P.mgTgtTot ? P.gp / P.mgTgtTot : 0, stCls(P.mgTgtTot ? P.gp / P.mgTgtTot : null), "revenue", "ri-percent-line"],
    ["EBITDA", ok(P.ebitda) ? ty(P.ebitda) : "—", ok(P.ebitda) ? `${pc(P.gp ? P.ebitda / P.gp : null)} trên margin net` : "chưa có sheet CHI_PHI kỳ này", ok(P.ebitda) && P.gp ? Math.max(0, P.ebitda / P.gp) : 0, ok(P.ebitda) ? (P.ebitda < 0 ? "critical" : "stable") : "muted", "revenue", "ri-funds-line"],
    ["Tiền cuối kỳ (dự kiến)", CS.hasOpen && ok(lastBal) ? ty(lastBal) : "—", CS.hasOpen ? `đầu kỳ ${ty(CS.open)}` : "chưa nhập số dư đầu kỳ (THAM_SO)", CS.hasOpen && ok(lastBal) && CS.open ? Math.min(1, Math.max(0, lastBal / CS.open)) : 0, CS.hasOpen && ok(lastBal) ? (lastBal < 0 ? "critical" : "stable") : "muted", "cash", "ri-wallet-3-line"],
    ["Nợ phải thu quá hạn", A.tot ? pc(A.od / A.tot) : "—", A.tot ? `${ty(A.od)} / ${ty(A.tot)} · DSO ${ok(A.dso) ? n0(A.dso) + " ngày" : "—"}` : "chưa có sổ công nợ", A.tot ? A.od / A.tot : 0, !A.tot ? "muted" : A.od / A.tot > 0.4 ? "critical" : A.od / A.tot > 0.25 ? "high" : "stable", "ar", "ri-time-line"],
    ["Khách hàng active", n0(cTot), cTgt ? `của ${n0(cTgt)} kế hoạch` : "", cTgt ? cTot / cTgt : 0, stCls(cTgt ? cTot / cTgt : null), "customers", "ri-group-line"],
  ];
  return k.map(([l, val, s, m, c, go, ic]) => `<div class="kpi" data-go="${go}" tabindex="0" role="button"><div class="kpi-l"><i class="${ic}" aria-hidden="true"></i>${esc(l)}</div><div class="kpi-n c-${c}">${val}</div><div class="kpi-s">${esc(s)}</div><div class="meter"><i style="width:${Math.min(100, Math.max(0, m * 100))}%;background:var(--${c === "muted" ? "line" : c})"></i></div></div>`).join("");
}

/* ---------- Cảnh báo ---------- */
export function alertHTML(list: Alert[]): string {
  if (!list.length) return empty("Không có cảnh báo nào.");
  const lab = { critical: "Khẩn", high: "Cao", watch: "Theo dõi" };
  return list.map((a) => `<div class="alert ${a.sev}">${pill(lab[a.sev], a.sev)}<div><div class="msg">${esc(a.msg)}</div><div class="act">→ ${esc(a.act)}</div></div><div class="own">${esc(a.area)}<br>${esc(a.own)}</div></div>`).join("");
}

/* ---------- 1. Tổng quan ---------- */
function overview(v: VM): string {
  const { P, A, CS, AL } = v;
  let t = "";
  if (P.hasActual) {
    t = `Kỳ ${v.ky}, GMV đạt ${ty(P.totAct)}`;
    t += P.totTgt ? `, tương đương ${pc(P.x)} kế hoạch, nên hệ số bậc thưởng PM và Sales là ${pc(P.H, 0)}.` : ` (chưa có kế hoạch kỳ này).`;
    const weak = P.lines.filter((l) => l.tgt > 0 && l.act / l.tgt < 0.85).map((l) => l.name.split(" — ")[0]);
    if (weak.length) t += ` Phần hụt tập trung ở ${weak.join(", ")}.`;
    else if (ok(P.x) && P.x >= 1) t += " Tất cả các mảng đều bám hoặc vượt kế hoạch.";
    if (ok(P.ebitda)) t += P.ebitda < 0 ? ` EBITDA âm ${ty(-P.ebitda)} sau hoa hồng và chi phí vận hành.` : ` EBITDA dương ${ty(P.ebitda)}.`;
  } else t = `Kỳ ${v.ky} chưa có số liệu GMV thực tế.`;
  if (A.o60 > 0) t += ` Có ${ty(A.o60)} nợ phải thu đã quá 60 ngày` + (A.top && A.conc >= 0.15 ? `, riêng ${A.top.ten} chiếm ${pc(A.conc, 0)} tổng dư nợ.` : ".");
  const cnt = { critical: 0, high: 0, watch: 0 };
  AL.forEach((a) => cnt[a.sev]++);
  const chips = ([["critical", "Khẩn"], ["high", "Cao"], ["watch", "Theo dõi"]] as const).map(([s, l]) => `<span class="pill dot p-${cnt[s] ? s : "neutral"}" style="cursor:pointer" data-go="alerts">${l} ${cnt[s]}</span>`).join("");
  const groups: [string, Axis][] = [["Travel", "T"], ["Mobility", "M"], ["SaaS", "S"], ["F&B", "F"]];
  const av = groups.map((g) => sum(P.lines.filter((l) => l.axis === g[1]), (l) => l.act) / 1e9), tv = groups.map((g) => sum(P.lines.filter((l) => l.axis === g[1]), (l) => l.tgt) / 1e9);
  const gmv = barChart({ labels: groups.map((g) => g[0]), series: [{ name: "Thực tế", c: "accent", vals: av, cf: (x, j) => (tv[j] ? xC(x / tv[j]) : "ink-3") }], targets: tv, showVal: true, fv: (x) => N2.format(x), ft: (x) => N2.format(x) + " tỷ", fy: (x) => N1.format(x), h: 250, noLegend: true }) + legend([["≥ 100% kế hoạch", "stable"], ["90–100%", "watch"], ["70–90%", "high"], ["< 70%", "critical"], ["Kế hoạch", "ink", 1, true]]);
  const cash = CS.halves.length ? lineChart({ labels: CS.halves.map((h) => h.h.replace("-", " ").replace(".2026", "")), series: [{ name: CS.hasOpen ? "Số dư dự kiến" : "Dòng tiền ròng lũy kế", c: "accent", vals: CS.halves.map((h) => (h.bal - (CS.hasOpen ? 0 : CS.open)) / 1e9) }], ft: (x) => N2.format(x) + " tỷ", fy: (x) => N1.format(x), h: 200 }) : empty("Chưa có sheet DONG_TIEN");
  const ar = donut(A.bk.map((x, k): [number, string, string] => [x, BCLS[k], AR_BUCKETS[k]]), tyN(A.tot) + " tỷ", "tổng phải thu", { ft: ty, size: 140 });
  const kpi = `<div class="stat-row">${stat("%đạt GMV", pc(P.x), stCls(P.x))}${stat("Hệ số", pc(P.H, 0))}${stat("Nấc", ok(P.x) ? tierIdx(P.x) + 1 + "/7" : "—")}</div>` +
    hBullet([{ l: "Team PM", v: P.pmPaid, txt: tr(P.pmPaid) }, { l: "Team Sales", v: P.salesPaid, txt: tr(P.salesPaid), c: "high" }, { l: "Team Partnership", v: P.partPaid, txt: tr(P.partPaid), c: "stable" }, { l: "Công ty giữ lại", v: P.companyKeep, txt: tr(P.companyKeep), c: "neutral-bar" }]) +
    `<div class="small" style="margin-top:8px">Tổng chi hoa hồng <b class="num">${tr(P.comm)}</b></div>`;
  return `<div class="card banner"><div class="eyebrow">Tóm tắt điều hành</div><p>${esc(t)}</p><div class="chips">${chips}</div></div>
   <div class="g57">${card("Tăng trưởng", "GMV theo mảng — thực tế và kế hoạch", "tỷ VND · vạch = kế hoạch", gmv)}${card("Cần xử lý", "Cảnh báo ưu tiên", `<a href="#" data-go="alerts" class="small">Xem tất cả</a>`, alertHTML(AL.slice(0, 5)))}</div>
   <div class="g3">${card("Dòng tiền", "Số dư tiền dự kiến", "tỷ VND · theo nửa tháng", cash)}${card("Công nợ phải thu", "Cơ cấu tuổi nợ", "tại " + fmtDate(A.asOf), ar)}${card("KPI", "Hệ số bậc thưởng & hoa hồng", "kỳ " + esc(v.ky), kpi)}</div>`;
}

/* ---------- 2. Doanh thu & Margin ---------- */
function revenue(v: VM): string {
  const { P, C } = v;
  if (!P.hasActual && !P.hasTarget) return noActual(v.ky);
  const agg = (a: Axis) => { const rs = P.lines.filter((l) => l.axis === a); return { rs, tgt: sum(rs, (l) => l.tgt), act: sum(rs, (l) => l.act), mgNet: sum(rs, (l) => l.mgNet), mgGross: sum(rs, (l) => l.mgGross), mgT: sum(rs, (l) => l.mgT) }; };
  const items: Parameters<typeof hBullet>[0] = [];
  (["T", "M", "S", "F"] as Axis[]).forEach((a) => {
    const g = agg(a);
    if (g.tgt > 0) { const x = g.act / g.tgt; items.push({ l: AXIS_NAME[a], v: x, t: 1, c: xC(x), txt: pc(x, 0), txt2: `${tyN(g.act)} / ${tyN(g.tgt)} tỷ`, vc: stCls(x), bold: true }); }
    else items.push({ l: AXIS_NAME[a], v: 0, txt: g.act ? tyN(g.act) + " tỷ" : "—", txt2: "chưa có kế hoạch", bold: true });
    if (g.rs.length > 1) g.rs.forEach((l) => { if (!l.tgt) return; const x = l.act / l.tgt; items.push({ l: "   " + l.name, v: x, t: 1, c: xC(x), txt: pc(x, 0), txt2: `${tyN(l.act)} / ${tyN(l.tgt)}`, vc: stCls(x) }); });
  });
  if (P.totTgt) items.push({ l: "Tổng công ty", v: P.x, t: 1, c: xC(P.x), txt: pc(P.x, 0), txt2: `${tyN(P.totAct)} / ${tyN(P.totTgt)} tỷ`, vc: stCls(P.x), bold: true });
  const gm = (["T", "M", "S", "F"] as Axis[]).map((a) => ({ a, n: AXIS_NAME[a], g: agg(a).act, m: agg(a).mgNet, mT: agg(a).mgT }));
  const mix = `<div class="small" style="margin-bottom:4px">GMV</div>` + donut(gm.map((x): [number, string, string] => [x.g, AXC[x.a], x.n]), tyN(P.totAct) + " tỷ", "GMV", { ft: ty, size: 130 }) +
    `<div class="small" style="margin:12px 0 4px">Margin net</div>` + donut(gm.map((x): [number, string, string] => [x.m, AXC[x.a], x.n]), tyN(P.gp) + " tỷ", "margin net", { ft: ty, size: 130 });
  // xu hướng
  const idx = kyIdx(v.ky), trend = C.periods.filter((p) => kyIdx(p) <= idx + 3).slice(-7);
  const axAct = (p: string, a: Axis) => { if (!hasActual(C, p) || kyIdx(p) > idx) return null; return sum(C.D.gmv.filter((r) => r.ky === p), (r) => (lineAxis(C, r) === a ? r.gmv : 0)) / 1e9; };
  const axTgt = (p: string, keys: (keyof import("./types").Target)[]) => { const T = C.D.targets.find((t) => t.ky === p); return T ? sum(keys, (k) => Number(T[k] || 0)) / 1e9 || null : null; };
  const trendHTML = trend.length ? lineChart({ labels: trend.map(kyShort), series: [
    { name: "Travel thực tế", c: "accent", vals: trend.map((p) => axAct(p, "T")) }, { name: "Travel kế hoạch", c: "accent", vals: trend.map((p) => axTgt(p, ["gmv_hotel", "gmv_flight"])), dash: true, nodot: true, w: 1.5 },
    { name: "Mobility thực tế", c: "stable", vals: trend.map((p) => axAct(p, "M")) }, { name: "Mobility kế hoạch", c: "stable", vals: trend.map((p) => axTgt(p, ["gmv_n2", "gmv_n3", "gmv_n4", "gmv_n5"])), dash: true, nodot: true, w: 1.5 }],
    ft: (x) => N2.format(x) + " tỷ", fy: (x) => N1.format(x) }) : empty("Chưa có dữ liệu");
  const wf = ok(P.opexOp) ? waterfall([{ l: "Margin gross toàn bộ", v: P.travelMg + P.mobGross + P.saasMg + P.fnbMg, kind: "total" }, { l: "Chiết khấu KH Mobility", v: -P.disc }, { l: "Hoa hồng các team", v: -P.comm }, { l: "Chi phí vận hành", v: -(P.opexOp as number) }, { l: "EBITDA", v: P.ebitda as number, kind: "total" }]) : empty("Chưa có sheet CHI_PHI cho kỳ này — cần để tính EBITDA");
  const mv = gm.map((x) => x.m);
  const mgAmt = barChart({ labels: gm.map((x) => x.n + (x.a === "M" ? " (net)" : "")), series: [{ name: "Margin thực tế", c: "accent", vals: mv, cf: (x, j) => (gm[j].mT ? xC(x / gm[j].mT) : "ink-3") }], targets: gm.map((x) => x.mT || null), showVal: true, fv: (x) => n0(x / 1e6), ft: tr, fy: (x) => n0(x / 1e6), h: 240, noLegend: true }) + legend([["≥ 100%", "stable"], ["90–100%", "watch"], ["70–90%", "high"], ["< 70%", "critical"], ["Kế hoạch", "ink", 1, true]]);
  const hotel = P.lines.find((l) => l.k === "hotel"), fl = P.lines.find((l) => l.k === "flight");
  const D = C.D;
  const mg: [string, number | null, number | null, string?][] = [
    ["Hotel", hotel && hotel.act ? hotel.mgGross / hotel.act : null, num(D, "target_margin_hotel")],
    ["Flights", fl && fl.act ? fl.mgGross / fl.act : null, num(D, "target_margin_flight")],
    ["Travel blend", P.mgPctT, P.blendT, "target động theo tỷ trọng Hotel/Flights"],
    ["Mobility gross", P.mgPctMg, num(D, "target_margin_mobility")],
    ["Mobility net", P.mAct ? P.mobNet / P.mAct : null, num(D, "target_margin_mobility") - num(D, "chiet_khau_mobility"), "sau chiết khấu cho khách"],
  ];
  const mgPct = hBullet(mg.filter((m) => ok(m[1])).map(([n, a, t, sub]) => { const x = ok(a) && ok(t) && t ? a / t : null; return { l: n, sub, v: x, t: 1, c: xC(x), txt: pc(a, 2), txt2: "target " + pc(t, 2), vc: stCls(x) }; }), { max: 1.3 }) + `<div class="small" style="margin-top:6px">Thanh thể hiện %đạt so với target (trục 0–130%).</div>`;
  const row = (n: string, tgt: number, act: number, mT: number | null, mA: number | null, mgv: number, dv: number | null, cls = "") => `<tr class="${cls}"><td>${esc(n)}</td><td class="r num">${n0(tgt / 1e6)}</td><td class="r num">${n0(act / 1e6)}</td><td class="r num c-${stCls(tgt ? act / tgt : null)}">${pc(tgt ? act / tgt : null)}</td><td class="r num">${pc(mT)}</td><td class="r num">${pc(mA, 2)}</td><td class="r num">${n0(mgv / 1e6)}</td><td class="r num ${ok(dv) && dv < 0 ? "c-critical" : ""}">${ok(dv) ? n0(dv / 1e6) : "—"}</td></tr>`;
  let tbl = `<table><thead><tr><th>Mảng / nhóm (triệu VND)</th><th class="r">GMV KH</th><th class="r">GMV TT</th><th class="r">%đạt</th><th class="r">%Margin KH</th><th class="r">%Margin TT</th><th class="r">Margin net TT</th><th class="r">Chênh lệch margin</th></tr></thead><tbody>`;
  (["T", "M", "S", "F"] as Axis[]).forEach((a) => { const g = agg(a); tbl += row(AXIS_NAME[a], g.tgt, g.act, null, g.act ? g.mgGross / g.act : null, g.mgNet, g.mgT ? g.mgNet - g.mgT : null, "tot"); g.rs.forEach((l) => { tbl += row(l.name, l.tgt, l.act, l.mT, l.act ? l.mgGross / l.act : null, l.mgNet, l.tgt ? l.mgNet - l.mgT : null, "sub"); }); });
  tbl += row("Tổng công ty", P.totTgt, P.totAct, null, P.totAct ? (P.travelMg + P.mobGross + P.saasMg + P.fnbMg) / P.totAct : null, P.gp, P.mgTgtTot ? P.gp - P.mgTgtTot : null, "tot") + `</tbody></table>`;
  const pl = (l: string, x: number | null, cls = "") => `<tr class="${cls}"><td>${esc(l)}</td><td class="r num">${ok(x) ? n0(x / 1e6) : "<span class='c-muted'>chưa có dữ liệu</span>"}</td><td class="r num">${ok(x) && P.totAct ? pc(x / P.totAct, 2) : ""}</td></tr>`;
  const opexLines = P.opexRows.filter((o) => !["Khấu hao", "Lãi vay", "Thuế TNDN"].includes(o.khoan_muc)).map((o) => pl("   (−) " + o.khoan_muc, -o.so_tien)).join("");
  const plTbl = `<table style="margin-top:16px"><thead><tr><th>P&L quản trị (triệu VND)</th><th class="r">Giá trị</th><th class="r">% GMV</th></tr></thead><tbody>${pl("GMV", P.totAct, "tot")}${pl("Margin gross", P.travelMg + P.mobGross + P.saasMg + P.fnbMg)}${pl("(−) Chiết khấu khách hàng", -P.disc)}${pl("Margin net", P.gp, "tot")}${pl("(−) Hoa hồng các team", -P.comm)}${opexLines}${pl("EBITDA", P.ebitda, "tot")}${pl("(−) Khấu hao, lãi vay, thuế", P.belowAmt ? -P.belowAmt : null)}${pl("Lợi nhuận ròng", P.netProfit, "tot")}</tbody></table>`;
  return (P.hasActual ? "" : noActual(v.ky)) + sumRevenue(v) + `<div class="g75">${card("Chi tiết theo mảng", "%đạt GMV theo mảng & nhóm khách", "vạch đen = 100% kế hoạch", hBullet(items, { max: 1.3 }))}${card("Cơ cấu", "GMV và margin đến từ đâu", "kỳ " + esc(v.ky), mix)}</div>
   ${custRevenueCards(v)}
   <div class="g2">${card("Xu hướng", "GMV Travel & Mobility theo tháng", "tỷ VND", trendHTML)}${card("Từ margin tới EBITDA", "Waterfall lợi nhuận kỳ", "triệu VND", wf)}</div>
   <div class="g2">${card("Lợi nhuận gộp", "Margin theo mảng — thực tế và kế hoạch", "triệu VND · vạch = kế hoạch", mgAmt)}${card("Hiệu quả đàm phán NCC", "% Margin theo ngành so với target", "vạch đen = target", mgPct)}</div>
   ${details("Xem bảng số liệu chi tiết (GMV, margin, P&L)", tbl + plTbl)}`;
}
function lineAxis(C: Ctx, r: import("./types").GmvRow): Axis | null {
  if (r.dich_vu === "Hotel" || r.dich_vu === "Flight") return "T";
  if (r.dich_vu === "Mobility") return "M";
  if (r.dich_vu.startsWith("SaaS")) return "S";
  if (r.dich_vu === "F&B") return "F";
  return null;
}

/* ---------- 3. Khách hàng ---------- */
function customers(v: VM): string {
  const { P, C } = v;
  const G = P.cust.groups;
  const items = G.map((g) => { const x = g.tgt ? g.act / g.tgt : null; return { l: `${g.g} — ${GNAME[g.g]}`, sub: P.cust.hasPrev ? `Δ ${g.d > 0 ? "+" : ""}${n0(g.d)} so với tháng trước` : "", v: x, t: 1, c: xC(x), txt: g.tgt ? pc(x, 0) : n0(g.act), txt2: g.tgt ? `${n0(g.act)} / ${n0(g.tgt)} KH` : "chưa có kế hoạch", vc: stCls(x) }; });
  const ta = sum(G, (g) => g.tgt || 0), aa = sum(G, (g) => g.act);
  if (ta) items.push({ l: "Tổng khách hàng", sub: "", v: aa / ta, t: 1, c: xC(aa / ta), txt: pc(aa / ta, 0), txt2: `${n0(aa)} / ${n0(ta)} KH`, vc: stCls(aa / ta), bold: true } as (typeof items)[number] & { bold: boolean });
  const mix = donut(["N2", "N3", "N4", "N5"].map((g): [number, string, string] => [sum(P.lines.filter((l) => l.grp === g), (l) => l.act), GC[g], `${g} — ${GNAME[g]}`]), tyN(P.mAct) + " tỷ", "GMV Mobility", { ft: ty });
  const idx = kyIdx(v.ky), ps = C.periods.filter((p) => kyIdx(p) <= idx + 3).slice(-6);
  const countsFor = (p: string) => { const by = new Map<string, number>(); C.D.gmv.filter((r) => r.ky === p).forEach((r) => by.set(r.ma_kh, (by.get(r.ma_kh) || 0) + r.gmv)); return by; };
  const stackSeries = ["N1", "N2", "N3", "N4", "N5"].map((g) => ({ name: g, c: GC[g], vals: ps.map((p) => { if (kyIdx(p) > idx || !hasActual(C, p)) return null; const by = countsFor(p); return Array.from(by.entries()).filter(([k, x]) => x > 0 && C.cust.get(k)?.nhom === g).length; }) }));
  const tg = ps.map((p) => { const T = C.D.targets.find((t) => t.ky === p); return T ? (T.kh_n1 || 0) + (T.kh_n2 || 0) + (T.kh_n3 || 0) + (T.kh_n4 || 0) + (T.kh_n5 || 0) : null; });
  const stack = ps.length ? barChart({ labels: ps.map(kyShort), stack: true, showTot: true, series: stackSeries, targets: tg, tName: "Tổng kế hoạch", h: 260, bw: 44 }) : empty("Chưa có dữ liệu");
  const mv = divBars(P.cust.movers.map((m) => ({ l: m.ten, sub: `${m.g} · PM ${m.pm} · ${tr(m.a)} → ${tr(m.b)}`, v: m.d, c: m.d < -0.3 ? "critical" : m.d < 0 ? "high" : "stable", txt: (m.d > 0 ? "+" : "") + pc(m.d, 0) })), 0.6);
  const tbl = `<table><thead><tr><th>Nhóm</th><th class="r">Kế hoạch</th><th class="r">Thực tế</th><th class="r">%đạt</th><th class="r">Δ tháng trước</th><th class="r">GMV nhóm (tr)</th><th class="r">GMV / KH (tr)</th></tr></thead><tbody>${G.map((g) => `<tr><td>${g.g} — ${GNAME[g.g]}</td><td class="r num">${n0(g.tgt)}</td><td class="r num">${n0(g.act)}</td><td class="r num">${pc(g.tgt ? g.act / g.tgt : null)}</td><td class="r num">${n0(g.d)}</td><td class="r num">${n0(g.gmv / 1e6)}</td><td class="r num">${g.act ? N1.format(g.gmv / g.act / 1e6) : "—"}</td></tr>`).join("")}</tbody></table>`;
  return (P.hasActual ? "" : noActual(v.ky)) + sumCustomers(v) + `<div class="g75">${card("Số lượng khách hàng", "%đạt số khách theo nhóm N1–N5", "vạch = 100% · KH active = có GMV trong kỳ", hBullet(items, { max: 1.3 }))}${card("Cơ cấu GMV Mobility", "GMV theo nhóm N2–N5", "kỳ " + esc(v.ky), mix)}</div>
   <div class="g2">${card("Tiến độ", "Số khách active theo nhóm", "vạch = tổng kế hoạch", stack)}${card("Giữ chân Top 200", "Biến động GMV so với tháng trước (N2, N4)", "đỏ = giảm quá 30%", mv)}</div>
   ${groupCustomerCards(v)}
   ${details("Xem bảng số liệu khách hàng", tbl)}`;
}

/* ---------- 4. Dòng tiền ---------- */
function cash(v: VM): string {
  const { CS } = v;
  if (!CS.halves.length) return `<div class="card notice">Chưa có sheet DONG_TIEN. Upload kế hoạch/thực hiện dòng tiền theo nửa tháng ở tab <a href="#" data-go="data">Dữ liệu</a>.</div>`;
  const labels = CS.halves.map((h) => h.h.replace("-", " "));
  const W = labels.length > 6 ? 1300 : 640;
  const top = barChart({ labels, series: [{ name: "Tổng thu", c: "stable", vals: CS.halves.map((h) => h.thu / 1e9) }, { name: "Tổng chi", c: "critical", vals: CS.halves.map((h) => h.chi / 1e9), op: 0.7 }], ft: (x) => N2.format(x) + " tỷ", fy: (x) => N1.format(x), h: 250, W, bw: 34 }) +
    (CS.hasOpen ? lineChart({ labels, series: [{ name: "Số dư cuối kỳ", c: "accent", vals: CS.halves.map((h) => h.bal / 1e9) }], ft: (x) => N2.format(x) + " tỷ", fy: (x) => N1.format(x), h: 170, W }) : `<div class="small">Nhập số dư đầu kỳ (THAM_SO → so_du_tien_dau_ky) để xem đường số dư.</div>`) +
    `<div class="small">Kỳ có thực hiện dùng số thực hiện; kỳ chưa có dùng số kế hoạch.</div>`;
  const net = barChart({ labels, series: [{ name: "Dòng tiền ròng", c: "stable", vals: CS.halves.map((h) => h.net / 1e9), cf: (x) => (x < 0 ? "critical" : "stable") }], showVal: true, fv: (x) => N2.format(x), ft: (x) => N2.format(x) + " tỷ", fy: (x) => N1.format(x), h: 240, noLegend: true }) + legend([["Dương", "stable"], ["Âm", "critical"]]);
  const lastAct = CS.halves.filter((h) => h.hasAct).slice(-1)[0];
  const pva = lastAct ? hBullet(lastAct.rows.filter((r) => r.ke_hoach || r.thuc_hien).map((r) => { const a = r.thuc_hien || 0, p = r.ke_hoach || 0; return { l: r.khoan_muc, v: Math.abs(a), t: Math.abs(p), c: r.khoan_muc.startsWith("Thu") ? "stable" : "critical", txt: tr(a), txt2: p ? `KH ${tr(p)} · ${pc(a / p, 0)}` : "không có KH" }; })) : empty("Chưa có kỳ nào nhập số thực hiện");
  const cats = Array.from(new Set(CS.halves.flatMap((h) => h.rows.map((r) => r.khoan_muc))));
  const tbl = `<table><thead><tr><th>Khoản mục (triệu VND)</th>${CS.halves.map((h) => `<th class="r">${h.h}${h.hasAct ? " · TH" : " · KH"}</th>`).join("")}</tr></thead><tbody>${cats.map((c) => `<tr><td>${esc(c)}</td>${CS.halves.map((h) => { const r = h.rows.find((x) => x.khoan_muc === c); if (!r) return `<td class="r c-muted">–</td>`; return h.hasAct ? `<td class="r"><span class="num">${n0((r.thuc_hien || 0) / 1e6)}</span><div class="t2">KH ${n0((r.ke_hoach || 0) / 1e6)}</div></td>` : `<td class="r num c-muted">${n0((r.ke_hoach || 0) / 1e6)}</td>`; }).join("")}</tr>`).join("")}
   <tr class="tot"><td>Dòng tiền ròng</td>${CS.halves.map((h) => `<td class="r num">${n0(h.net / 1e6)}</td>`).join("")}</tr>${CS.hasOpen ? `<tr class="tot"><td>Số dư cuối kỳ</td>${CS.halves.map((h) => `<td class="r num">${n0(h.bal / 1e6)}</td>`).join("")}</tr>` : ""}</tbody></table>`;
  return sumCash(v) + card("Kế hoạch nguồn tiền", "Thu – chi – số dư theo nửa tháng", "tỷ VND", top) + cashDetailCards(v) +
    `<div class="g2">${card("Dòng tiền ròng", "Thu trừ chi từng nửa tháng", "tỷ VND", net)}${card("Kế hoạch so với thực hiện", lastAct ? "Kỳ " + lastAct.h : "Theo khoản mục", "vạch đen = kế hoạch", pva)}</div>` + details("Xem bảng kế hoạch – thực hiện chi tiết", tbl);
}

/* ---------- 5. Công nợ phải thu ---------- */
function ar(v: VM): string {
  const { A, P } = v;
  if (!A.count && !v.C.D.ar.length) return `<div class="card notice">Chưa có sheet CONG_NO_PHAI_THU. Upload ở tab <a href="#" data-go="data">Dữ liệu</a>.</div>`;
  const sum1 = `<div class="stat-row">${stat("Quá hạn", pc(A.tot ? A.od / A.tot : null), "critical")}${stat("> 60 ngày", ty(A.o60), A.o60 ? "critical" : "")}${stat("DSO", ok(A.dso) ? n0(A.dso) + " ngày" : "—")}${stat("Thu nợ đến hạn", pc(A.collectRate))}</div>` +
    donut(A.bk.map((x, k): [number, string, string] => [x, BCLS[k], AR_BUCKETS[k]]), tyN(A.tot) + " tỷ", "tổng phải thu", { ft: ty }) +
    (A.neg ? `<div class="small" style="margin-top:8px">Số dư âm ${tr(A.neg)} (khách trả thừa / chờ cấn trừ) tách riêng, không trừ vào tuổi nợ.</div>` : "");
  const curve = A.curve.length ? lineChart({ labels: ["T", "T+1", "T+2", "T+3", "T+4"], series: A.curve.map((r, q) => ({ name: "Kỳ " + r.k, c: ["ink-3", "ink-3", "info", "high", "accent"][q + 5 - A.curve.length] || "ink-3", vals: r.v, w: q >= A.curve.length - 2 ? 2.5 : 1.5 })), max: 100, ft: (x) => N1.format(x) + "%", fy: (x) => x + "%", h: 240 }) + `<div class="small">% giá trị kỳ nợ đã thu đủ tính tới cuối mỗi tháng sau kỳ.</div>` : empty("Chưa có dữ liệu");
  const top = A.customers.slice(0, 15);
  const cust = hStack(top.map((c) => ({ l: c.ten, sub: `${c.g} · PM ${c.pm}`, parts: c.b.map((x, k): [number, string, string] => [x, BCLS[k], AR_BUCKETS[k]]), txt: tyN(c.tot), txt2: `quá hạn ${pc(c.tot ? c.od / c.tot : null, 0)}` })), { ft: tr, legend: AR_BUCKETS.map((b, k): LegendItem => [b, BCLS[k]]) }) + (A.customers.length > 15 ? `<div class="small" style="margin-top:6px">Hiển thị 15/${A.customers.length} khách dư nợ lớn nhất.</div>` : "");
  const th = num(v.C.D, "nguong_dung_han"), tl = num(v.C.D, "pm_tra_ngay");
  const on = hBullet(Object.entries(P.onTime).map(([g, o]) => { const c = !ok(o.rate) ? "ink-3" : o.rate >= th ? "stable" : o.rate >= 0.7 ? "high" : "critical"; return { l: g, sub: GNAME[g] + (o.notDue ? ` · ${tr(o.notDue)} chưa đến hạn` : ""), v: o.rate, t: th, c, txt: pc(o.rate, 0), txt2: ok(o.rate) ? `trả sau còn ${pc((1 - tl) * o.rate, 1)}` : "chưa có dữ liệu", vc: c === "ink-3" ? "" : c }; }), { max: 1 }) + `<div class="small" style="margin-top:6px">Kỳ nợ ${esc(v.ky)} · khoản nợ đúng hạn khi thu đủ trước/đúng ngày đến hạn.</div>`;
  const tbl = `<table><thead><tr><th>Khách hàng (triệu VND)</th><th>Nhóm</th><th>PM</th>${AR_BUCKETS.map((b) => `<th class="r">${b}</th>`).join("")}<th class="r">Tổng</th></tr></thead><tbody>${A.customers.map((c) => `<tr><td>${esc(c.ten)}</td><td>${c.g}</td><td>${esc(c.pm)}</td>${c.b.map((x) => `<td class="r num">${x ? n0(x / 1e6) : "–"}</td>`).join("")}<td class="r num">${n0(c.tot / 1e6)}</td></tr>`).join("")}<tr class="tot"><td>Tổng</td><td></td><td></td>${A.bk.map((x) => `<td class="r num">${n0(x / 1e6)}</td>`).join("")}<td class="r num">${n0(A.tot / 1e6)}</td></tr></tbody></table>`;
  return sumAR(v) + `<div class="g57">${card("Tổng quan", "Công nợ phải thu theo tuổi nợ", "tại " + fmtDate(A.asOf), sum1)}${card("Tiến độ thu tiền", "Đường cong thu tiền theo kỳ nợ", "% đã thu lũy kế", curve)}</div>
   <div class="g75">${card("Tuổi nợ theo ngày đến hạn", "Dư nợ theo khách hàng", "tỷ VND · lớn nhất trước", cust)}${card("Ảnh hưởng hoa hồng PM", "Tỷ lệ thu đúng hạn theo nhóm", `vạch = ngưỡng ${pc(th, 0)}`, on)}</div>
   ${arCustomerCards(v)}
   ${details("Xem bảng tuổi nợ chi tiết", tbl)}`;
}

/* ---------- 6. Công nợ phải trả ---------- */
function ap(v: VM): string {
  const { B, A } = v;
  if (!v.C.D.ap.length) return `<div class="card notice">Chưa có sheet CONG_NO_PHAI_TRA. Upload ở tab <a href="#" data-go="data">Dữ liệu</a>.</div>`;
  const NC: Record<string, string> = { Flight: D("cyan"), Hotel: D("blue"), Mobility: D("purple"), SaaS: D("green"), "F&B": D("orange"), Khác: D("gray") };
  const s1 = `<div class="stat-row">${stat("Quá hạn", ty(B.od), B.od ? "high" : "")}${stat("Đến hạn ≤ 15 ngày", ty(B.d7 + B.d15))}${stat("Term HĐ bq", ok(B.wTerm) ? N1.format(B.wTerm) + " ngày" : "—")}</div>` +
    donut(Object.entries(B.byN).filter((e) => e[1] > 0).map(([k, x]): [number, string, string] => [x, NC[k] || "ink-3", k]), tyN(B.out) + " tỷ", "tổng phải trả", { ft: ty });
  const parts = (r: { od: number; d7: number; d15: number; d30: number; later: number }): [number, string, string][] => [[r.od, D("red", "strong"), "Quá hạn"], [r.d7, D("red"), "≤ 7 ngày"], [r.d15, D("orange"), "8–15 ngày"], [r.d30, D("yellow"), "16–30 ngày"], [r.later, D("green"), "> 30 ngày"]];
  const stack = hStack(B.rows.filter((r) => r.out > 0).slice(0, 15).map((r) => ({ l: r.ten, sub: r.nganh, parts: parts(r), txt: tyN(r.out) })), { ft: tr, legend: [["Quá hạn", D("red", "strong")], ["≤ 7 ngày", D("red")], ["8–15 ngày", D("orange")], ["16–30 ngày", D("yellow")], ["> 30 ngày", D("green")]] });
  const term = hBullet(B.rows.filter((r) => ok(r.dpo)).map((r) => { const d = r.dpo as number, t = r.term; const c = t != null && d < t - 4 ? "watch" : t != null && d > t ? "high" : "stable"; return { l: r.ten, sub: r.nganh, v: d, t, c, txt: n0(d) + " ngày", txt2: t == null ? "chưa có term HĐ" : d < t - 4 ? `trả sớm ${n0(t - d)} ngày` : `HĐ ${t} ngày`, vc: c }; }), { max: Math.max(50, ...B.rows.map((r) => Math.max(r.dpo || 0, r.term || 0))) * 1.05 }) + legend([["Trả sớm hơn HĐ > 4 ngày", "watch"], ["Đúng lịch", "stable"], ["Trễ hạn", "high"], ["Term hợp đồng", "ink", 1, true]]);
  const flt = barChart({ labels: ["DSO — thu tiền khách", "DPO — trả tiền NCC", "Float = DPO − DSO"], series: [{ name: "Số ngày", c: "accent", vals: [A.dso, B.wDpo, B.float], cf: (x, j) => (j === 2 ? (x < 0 ? "critical" : "stable") : j === 0 ? "high" : "accent") }], showVal: true, fv: (x) => N1.format(x), ft: (x) => N1.format(x) + " ngày", h: 230, noLegend: true, bw: 60 }) +
    `<div class="small">${ok(B.float) ? (B.float < 0 ? `Float âm ${N1.format(-B.float)} ngày: công ty trả NCC nhanh hơn thu tiền khách — đang tự ứng vốn lưu động.` : "Float dương: NCC đang tài trợ vốn lưu động.") : "Cần cả AR (DSO) và AP đã thanh toán (DPO) để tính."}</div>`;
  const tbl = `<table><thead><tr><th>Nhà cung cấp (triệu VND)</th><th>Ngành</th><th class="r">Term HĐ</th><th class="r">DPO</th><th class="r">Quá hạn</th><th class="r">≤ 7</th><th class="r">8–15</th><th class="r">16–30</th><th class="r">> 30</th><th class="r">Tổng</th></tr></thead><tbody>${B.rows.map((r) => `<tr><td>${esc(r.ten)}</td><td>${esc(r.nganh)}</td><td class="r num">${r.term ?? "—"}</td><td class="r num">${ok(r.dpo) ? n0(r.dpo) : "—"}</td><td class="r num">${n0(r.od / 1e6)}</td><td class="r num">${n0(r.d7 / 1e6)}</td><td class="r num">${n0(r.d15 / 1e6)}</td><td class="r num">${n0(r.d30 / 1e6)}</td><td class="r num">${n0(r.later / 1e6)}</td><td class="r num">${n0(r.out / 1e6)}</td></tr>`).join("")}</tbody></table>`;
  return sumAP(v) + `<div class="g57">${card("Tổng quan", "Công nợ phải trả theo ngành", "tại " + fmtDate(v.C.asOf), s1)}${card("Lịch trả", "Số tiền đến hạn theo nhà cung cấp", "tỷ VND", stack)}</div>
   <div class="g2">${card("Kỳ hạn thực hưởng", "DPO thực tế so với payment term hợp đồng", "vạch = term HĐ", term)}${card("Vốn lưu động", "Ai đang tài trợ ai?", "ngày", flt)}</div>${apSupplierCards(v)}${details("Xem bảng công nợ phải trả chi tiết", tbl)}`;
}

/* ---------- 7. KPI & Hoa hồng ---------- */
function kpi(v: VM): string {
  const { P, C } = v;
  const D = C.D;
  if (!P.hasActual) return noActual(v.ky);
  const mx = Math.max(P.pT.v, P.pM.v, 1);
  const peakTxt = (p: number | null) => (p == null ? "chưa có kỳ trước (toàn bộ là GMV nền)" : "peak " + ty(p));
  const rPT = num(D, "pm_ty_le_travel"), rPM = num(D, "pm_ty_le_mobility"), rST = num(D, "sales_ty_le_travel"), rSM = num(D, "sales_ty_le_mobility");
  const poolHTML = `<div class="small" style="margin-bottom:4px">Nguồn hình thành: GMV nền và GMV thặng dư so với peak</div>` +
    hStack([{ l: "Travel", sub: `${peakTxt(P.peakT)} · margin ${pc(P.pT.m, 2)}`, parts: [[P.pT.vb, "accent", "Từ GMV nền"], [P.pT.vs, "accent", "Từ GMV thặng dư", 0.45]], txt: tr(P.pT.v) },
      { l: "Mobility", sub: `${peakTxt(P.peakM)} · margin net ${pc(P.pM.m, 2)}`, parts: [[P.pM.vb, "stable", "Từ GMV nền"], [P.pM.vs, "stable", "Từ GMV thặng dư", 0.45]], txt: tr(P.pM.v) }], { ft: tr, max: mx, legend: [["Từ GMV nền", "ink-3"], ["Từ GMV thặng dư (nhạt)", "ink-3", 0.45]] }) +
    `<div class="small" style="margin:14px 0 4px">Phân bổ quỹ (trước hệ số ${pc(P.H, 0)})</div>` +
    hStack([{ l: "Quỹ Travel", parts: [[P.pT.v * rPT, "accent", `Team PM ${pc(rPT, 0)}`], [P.pT.v * rST, "high", `Team Sales ${pc(rST, 0)}`], [P.pT.v * (1 - rPT - rST), "neutral-bar", "Công ty"]], txt: tr(P.pT.v) },
      { l: "Quỹ Mobility", parts: [[P.pM.v * rPM, "accent", `Team PM ${pc(rPM, 0)}`], [P.pM.v * rSM, "high", `Team Sales ${pc(rSM, 0)}`], [P.pM.v * (1 - rPM - rSM), "neutral-bar", "Công ty"]], txt: tr(P.pM.v) }], { ft: tr, max: mx, legend: [["Team PM", "accent"], ["Team Sales", "high"], ["Công ty giữ lại", "neutral-bar"]] }) +
    `<div class="small" style="margin-top:8px">Sau hệ số: PM ${tr(P.pm)} · Sales ${tr(P.salesPool)} · công ty giữ lại tổng cộng ${tr(P.companyKeep)}.</div>`;
  const tl = num(D, "pm_tra_ngay");
  const pmHTML = P.pmPeople.length ? hStack(P.pmPeople.map((p) => ({ l: p.name, sub: p.groups.join(", "), parts: [[p.now, "accent", `Trả ngay ${pc(tl, 0)}`], [p.later, "stable", "Trả sau — dự kiến"], [p.laterMax - p.later, "critical", "Mất do thu trễ", 0.55]] as [number, string, string, number?][], txt: tr(p.now + p.later), txt2: `trên ${tr(p.total)}` })), { ft: tr, legend: [[`Trả ngay ${pc(tl, 0)}`, "accent"], ["Trả sau — dự kiến", "stable"], ["Mất do khách thu trễ", "critical", 0.55]] }) +
    `<div class="small" style="margin-top:8px">Quỹ Mobility chia về N2–N5 theo margin net thực tế của nhóm, sau đó theo số khách phụ trách (sheet PHAN_BO_PM).${Object.values(P.onTime).every((o) => !ok(o.rate)) ? " Công nợ kỳ này chưa đến hạn nên chưa đánh giá được tỷ lệ thu đúng hạn — phần trả sau đang tạm tính đủ 100%." : ""}${P.pmUnassigned > 0 ? ` ${tr(P.pmUnassigned)} thuộc nhóm chưa có PM phụ trách → công ty.` : ""}</div>` : empty("Chưa có sheet PHAN_BO_PM");
  const salesHTML = P.sales.length ? hStack(P.sales.map((s) => ({ l: s.name, parts: [[s.gmv, "accent", "Pool GMV"], [s.hdContract, "high", "Thưởng hợp đồng"], [s.hdSaas, "stable", "Hoa hồng SaaS"]] as [number, string, string][], txt: tr(s.total) })), { ft: tr, legend: [["Pool GMV (nhân hệ số)", "accent"], ["Thưởng hợp đồng", "high"], ["Hoa hồng SaaS", "stable"]] }) +
    `<div class="small" style="margin:14px 0 4px">Pool HĐ + SaaS phát sinh trong kỳ (không nhân hệ số)</div>` +
    donut([[P.contractByG.N1.v, "accent", `N1 · ${P.contractByG.N1.n} HĐ`], [P.contractByG.N3.v, "high", `N3 · ${P.contractByG.N3.n} HĐ`], [P.contractByG.N5.v, "info", `N5 · ${P.contractByG.N5.n} HĐ`], [P.saasComm, "stable", "SaaS"]], tr(P.hdPool), "pool HĐ + SaaS", { ft: tr, size: 130 }) : empty("Chưa có nhân sự team Sales trong DM_NHAN_SU");
  const parts = [P.partT.g, P.partT.m, P.partT.pt, P.scoreT, P.partM.g, P.partM.m, P.partM.pt, P.scoreM].filter(ok);
  const partHTML = barChart({ labels: ["%đạt GMV", "%đạt Margin", "%đạt PT", "Điểm KPI"], series: [{ name: "Travel", c: "accent", vals: [P.partT.g, P.partT.m, P.partT.pt, P.scoreT] }, { name: "Mobility", c: "stable", vals: [P.partM.g, P.partM.m, P.partM.pt, P.scoreM] }], targets: [1, 1, 1, 1], tName: "100%", showVal: true, fv: (x) => pc(x, 0), ft: (x) => pc(x), fy: (x) => pc(x, 0), h: 250, max: Math.max(1.25, ...parts) * 1.08 }) +
    `<div class="stat-row" style="margin-top:10px">${P.partners.map((p) => stat(p.name, tr(p.total))).join("")}${stat("PT Travel", ok(P.partT.term) ? `${n0(P.partT.term)}/${P.partT.target} ngày` : "—")}${stat("PT Mobility", ok(P.partM.term) ? `${n0(P.partM.term)}/${P.partM.target} ngày` : "—")}</div>` +
    `<div class="small">Trọng số: GMV ${pc(num(D, "partnership_w_gmv"), 0)} · Margin ${pc(num(D, "partnership_w_margin"), 0)} · Payment term ${pc(num(D, "partnership_w_pt"), 0)}. Thiếu chỉ tiêu nào thì tính lại trên các chỉ tiêu còn lại.</div>`;
  const cv = P.contracts.filter((c) => c.monthNo <= num(D, "thoi_han_hd_thang") + 1 || c.payKy === v.ky).sort((a, b) => (a.payKy === v.ky ? -1 : 0) - (b.payKy === v.ky ? -1 : 0) || b.ratio - a.ratio);
  const conHTML = cv.length ? hBullet(cv.slice(0, 20).map((c) => {
    const st = c.status === "dat" ? [`đạt${c.payKy === v.ky ? " — trả kỳ này " + tr(c.payout) : " (" + c.payKy + ")"}`, "stable"] : c.status === "het_han" ? [`hết hạn — trả ${tr(c.payout)}`, "high"] : [`còn ${Math.max(0, num(D, "thoi_han_hd_thang") - c.monthNo)} tháng`, "watch"];
    return { l: c.ten, sub: `${c.nhom} · ${c.sales} · tháng ${Math.min(c.monthNo, num(D, "thoi_han_hd_thang"))}/${num(D, "thoi_han_hd_thang")}`, v: Math.min(c.ratio, 1.2), t: 1, c: st[1], txt: pc(c.ratio, 0), txt2: st[0], vc: st[1] };
  }), { max: 1.2 }) + (cv.length > 20 ? `<div class="small" style="margin-top:6px">Hiển thị 20/${cv.length} hợp đồng.</div>` : "") : empty("Chưa có hợp đồng mới trong 6 tháng gần nhất (sheet HOP_DONG)");
  const formula = `Hệ số H(x): x<30%→0 · 30–50%→30% · 50–70%→50% · 70–90%→x · 90–100%→100% · 100–110%→x · ≥110%→100%+(x−100%)×1,2
x = GMV thực tế tổng công ty ÷ kế hoạch tổng công ty
Quỹ trục = m × min(GMV, Peak) × r_nền + m × max(0, GMV − Peak) × r_thặng dư   (Peak: GMV thực tế cao nhất của trục từ kỳ ${esc(D.params.peak_tu_ky || "—")} tới kỳ trước)
   Travel: r = ${pc(num(D, "quy_travel_nen"), 0)} / ${pc(num(D, "quy_travel_thang_du"), 0)}   ·   Mobility: r = ${pc(num(D, "quy_mobility_nen"), 0)} / ${pc(num(D, "quy_mobility_thang_du"), 0)}, m = margin net
Quỹ PM = (Quỹ Travel × ${pc(rPT, 0)} + Quỹ Mobility × ${pc(rPM, 0)}) × H → ${pc(tl, 0)} trả ngay, phần còn lại × tỷ lệ thu đúng hạn sau ${num(D, "pm_tra_sau_thang")} tháng
Pool GMV Sales = (Quỹ Travel × ${pc(rST, 0)} + Quỹ Mobility × ${pc(rSM, 0)}) × H
Pool HĐ + SaaS = Σ thưởng HĐ đạt ngưỡng (${num(D, "nguong_hd_boi_so")}× mức thưởng, GMV lũy kế, tối đa ${num(D, "thoi_han_hd_thang")} tháng) + ${pc(num(D, "saas_hoa_hong"), 0)} × margin SaaS
Partnership = Margin × (${pc(num(D, "partnership_quy_travel"), 0)} Travel | ${pc(num(D, "partnership_quy_mobility"), 0)} Mobility) × Điểm KPI
Phần quỹ không chia cho team thuộc về công ty.`;
  const tbl = `<table><thead><tr><th>Người</th><th>Team</th><th class="r">Tổng (tr)</th><th class="r">Trả ngay</th><th class="r">Trả sau dự kiến</th></tr></thead><tbody>${P.pmPeople.map((p) => `<tr><td>${esc(p.name)}</td><td>PM</td><td class="r num">${N1.format(p.total / 1e6)}</td><td class="r num">${N1.format(p.now / 1e6)}</td><td class="r num">${N1.format(p.later / 1e6)}</td></tr>`).join("")}${P.sales.map((s) => `<tr><td>${esc(s.name)}</td><td>Sales</td><td class="r num">${N1.format(s.total / 1e6)}</td><td class="r num">${N1.format(s.total / 1e6)}</td><td class="r num">–</td></tr>`).join("")}${P.partners.map((s) => `<tr><td>${esc(s.name)}</td><td>Partnership</td><td class="r num">${N1.format(s.total / 1e6)}</td><td class="r num">${N1.format(s.total / 1e6)}</td><td class="r num">–</td></tr>`).join("")}<tr class="tot"><td>Công ty giữ lại</td><td></td><td class="r num">${N1.format(P.companyKeep / 1e6)}</td><td></td><td></td></tr></tbody></table>`;
  return sumKpi(v) + payCards(v) + `<div class="g57">${card("Áp dụng PM & Sales", "Đường hệ số bậc thưởng", ok(P.x) ? `nấc <b class="num">${tierIdx(P.x) + 1}/7</b>` : "chưa có kế hoạch", tierChart(P.x, P.H, TIERS, tier))}${card("Hình thành & phân bổ quỹ", "Quỹ hoa hồng theo trục", "triệu VND", poolHTML)}</div>
   <div class="g2">${card("Team PM", "Hoa hồng theo người", "triệu VND", pmHTML)}${card("Team Sales", "Thu nhập theo nguồn", "triệu VND", salesHTML)}</div>
   <div class="g2">${card("Team Partnership", "%đạt từng chỉ tiêu & điểm KPI", `target PT Travel ${num(D, "target_pt_travel")} ngày`, partHTML)}${card("Team Sales", "Hợp đồng mới — tiến độ đạt ngưỡng", "vạch = ngưỡng", conHTML)}</div>
   <div class="card"><details><summary>Xem công thức & bảng hoa hồng</summary><div class="formula" style="margin-top:10px">${formula}</div><div class="tw" style="margin-top:14px">${tbl}</div></details></div>`;
}

/* ---------- 8. Cảnh báo ---------- */
function alertsView(v: VM): string {
  const AL = v.AL;
  const areas = Array.from(new Set(AL.map((a) => a.area)));
  const chart = areas.length ? hStack(areas.map((ar) => { const f = (s: string) => AL.filter((a) => a.area === ar && a.sev === s).length; return { l: ar, parts: [[f("critical"), "critical", "Khẩn"], [f("high"), "high", "Cao"], [f("watch"), "watch", "Theo dõi"]] as [number, string, string][], txt: String(AL.filter((a) => a.area === ar).length) }; }).sort((a, b) => +b.txt - +a.txt), { ft: (x) => x + " cảnh báo", legend: [["Khẩn", "critical"], ["Cao", "high"], ["Theo dõi", "watch"]] }) : empty("Không có cảnh báo");
  return sumAlerts(v) + `<div class="g57">${card("Phân bố", "Cảnh báo theo lĩnh vực", `${AL.length} cảnh báo · kỳ ${esc(v.ky)}`, chart)}${card("Theo dõi xử lý", "Giao việc, hạn xử lý và trạng thái", "bấm vào một cảnh báo để nhận việc", alertBoard(v))}</div>`;
}

/* ==========================================================================
   TÓM TẮT ĐIỀU HÀNH CHO TỪNG TAB
   Câu chữ sinh từ số liệu thật, không có mẫu câu cố định không gắn dữ liệu.
   ========================================================================== */
function sumRevenue(v: VM): string {
  const { P, CR } = v;
  if (!P.hasActual) return "";
  const pts: [string, string][] = [];
  let lead = `GMV ${ty(P.totAct)}`;
  if (P.totTgt) lead += `, đạt ${pc(P.x)} kế hoạch`;
  lead += `; margin net ${ty(P.gp)}, tương đương ${pc(P.totAct ? P.gp / P.totAct : null, 2)} GMV.`;
  if (ok(P.ebitda)) lead += P.ebitda < 0 ? ` EBITDA âm ${ty(-P.ebitda)}.` : ` EBITDA ${ty(P.ebitda)}.`;
  else lead += " Chưa có sheet CHI_PHI nên chưa tính được EBITDA.";
  const weak = P.lines.filter((l) => l.tgt > 0 && l.act / l.tgt < 0.9).sort((a, b) => a.act / a.tgt - b.act / b.tgt);
  if (weak.length) pts.push([`Hụt kế hoạch: ${weak.slice(0, 3).map((l) => `${l.name.split(" — ")[0]} ${pc(l.act / l.tgt, 0)}`).join(" · ")}`, weak[0].act / weak[0].tgt < 0.7 ? "critical" : "high"]);
  else if (P.totTgt) pts.push(["Mọi mảng đều bám hoặc vượt kế hoạch", "stable"]);
  if (ok(P.partT.m) && P.partT.m < 0.97) pts.push([`Margin Travel ${pc(P.mgPctT ?? 0, 2)} dưới target blend ${pc(P.blendT ?? 0, 2)}`, "high"]);
  if (ok(P.partM.m) && P.partM.m < 0.97) pts.push([`Margin gross Mobility ${pc(P.mgPctMg ?? 0, 2)} dưới target ${pc(num(v.C.D, "target_margin_mobility"), 0)}`, "high"]);
  if (CR.length) {
    const t3 = sum(CR.slice(0, 3), (r) => r.gmv) / (P.totAct || 1);
    pts.push([`${CR.length} khách phát sinh GMV; 3 khách lớn nhất chiếm ${pc(t3, 0)} (dẫn đầu ${nameOf(CR[0])} ${ty(CR[0].gmv)})`, t3 > 0.5 ? "high" : "neutral"]);
    const low = CR.filter((r) => r.gmv > P.totAct * 0.02 && ok(r.mgPct) && (r.mgPct as number) < 0.03);
    if (low.length) pts.push([`${low.length} khách lớn có margin net dưới 3%: ${low.slice(0, 3).map(nameOf).join(", ")}`, "high"]);
  }
  return execBand("Tóm tắt điều hành", lead, pts);
}

function sumCustomers(v: VM): string {
  const { P, CR, GB } = v;
  if (!P.hasActual) return "";
  const act = sum(P.cust.groups, (g) => g.act), tgt = sum(P.cust.groups, (g) => g.tgt || 0);
  let lead = `${n0(act)} khách có phát sinh trong kỳ`;
  if (tgt) lead += `, bằng ${pc(act / tgt, 0)} kế hoạch ${n0(tgt)} khách`;
  if (P.cust.hasPrev) {
    const d = sum(P.cust.groups, (g) => g.d);
    lead += `; so với tháng trước ${d >= 0 ? "tăng" : "giảm"} ${n0(Math.abs(d))} khách.`;
  } else lead += ".";
  const pts: [string, string][] = [];
  GB.filter((b) => b.tgt > 0).forEach((b) => {
    const x = b.gmv / b.tgt;
    if (x < 0.9) pts.push([`${b.g} đạt ${pc(x, 0)} kế hoạch GMV (${b.rows.length} khách, đầu bảng ${b.rows[0] ? nameOf(b.rows[0]) : "—"})`, x < 0.7 ? "critical" : "high"]);
  });
  const conc = GB.filter((b) => b.rows.length >= 5 && b.top3 > 0.6);
  conc.forEach((b) => pts.push([`${b.g} phụ thuộc 3 khách đầu bảng ${pc(b.top3, 0)} GMV của nhóm`, "high"]));
  const drop = CR.filter((r) => r.d != null && (r.d as number) < -0.3 && r.prev > 20e6).slice(0, 3);
  if (drop.length) pts.push([`Giảm mạnh so tháng trước: ${drop.map((r) => `${nameOf(r)} ${arrow(r.d)}`).join(" · ")}`, "critical"]);
  const grow = CR.filter((r) => r.d != null && (r.d as number) > 0.5 && r.gmv > 20e6).slice(0, 3);
  if (grow.length) pts.push([`Tăng mạnh: ${grow.map((r) => `${nameOf(r)} ${arrow(r.d)}`).join(" · ")}`, "stable"]);
  if (!pts.length) pts.push(["Không có nhóm nào lệch kế hoạch đáng kể", "stable"]);
  return execBand("Tóm tắt điều hành", lead, pts);
}

function sumCash(v: VM): string {
  const { CS, CD, A, B } = v;
  if (!CS.halves.length && !CD.inflow.length) return "";
  const pts: [string, string][] = [];
  const thu = sum(CD.inflow, (r) => r.thuc), chi = sum(CD.outflow, (r) => r.thuc);
  let lead = `${CD.fromDays} ngày gần nhất: thực thu ${ty(thu)}, thực chi ${ty(chi)}, ròng ${ty(thu - chi)}.`;
  const sapThu = sum(CD.inflow, (r) => r.sapToi), sapChi = sum(CD.outflow, (r) => r.sapToi);
  lead += ` ${CD.aheadDays} ngày tới: dự kiến thu ${ty(sapThu)}, phải chi ${ty(sapChi)}.`;
  if (sapChi > sapThu) pts.push([`Chi nhiều hơn thu ${ty(sapChi - sapThu)} trong ${CD.aheadDays} ngày tới`, "high"]);
  else pts.push([`Thu đủ bù chi ${CD.aheadDays} ngày tới, dư ${ty(sapThu - sapChi)}`, "stable"]);
  if (CD.inflow.length) {
    const top = CD.inflow.slice(0, 3).filter((r) => r.sapToi > 0);
    if (top.length) pts.push([`Thu lớn nhất sắp tới: ${top.map((r) => `${r.ten} ${ty(r.sapToi)}`).join(" · ")}`, "neutral"]);
  }
  if (CD.outflow.length) {
    const top = CD.outflow.slice(0, 3).filter((r) => r.sapToi + r.quaHan > 0);
    if (top.length) pts.push([`Chi lớn nhất sắp tới: ${top.map((r) => `${r.ten} ${ty(r.sapToi + r.quaHan)}`).join(" · ")}`, "neutral"]);
  }
  if (A.od > 0) pts.push([`${ty(A.od)} nợ khách đã quá hạn — thu được là bù ngay dòng tiền`, "high"]);
  if (B.od > 0) pts.push([`${ty(B.od)} nợ NCC đã quá hạn, cần xử lý trước khi ảnh hưởng quan hệ`, "critical"]);
  if (CS.hasOpen && CS.halves.length) {
    const min = Math.min(...CS.halves.map((h) => h.bal));
    if (min < 0) pts.push([`Số dư tiền dự kiến chạm đáy âm ${ty(-min)} trong kỳ kế hoạch`, "critical"]);
  } else pts.push(["Chưa nhập số dư tiền đầu kỳ nên chưa dựng được đường số dư", "neutral"]);
  return execBand("Tóm tắt điều hành", lead, pts);
}

function sumAR(v: VM): string {
  const { A, ARC } = v;
  if (!ARC.length) return "";
  const pts: [string, string][] = [];
  let lead = `Tổng phải thu ${ty(A.tot)} tại ${fmtDate(A.asOf)}, trong đó quá hạn ${ty(A.od)} (${pc(A.tot ? A.od / A.tot : null, 0)}).`;
  if (ok(A.dso)) lead += ` DSO ${n0(A.dso)} ngày.`;
  const late = ARC.filter((c) => c.overdue > 0).sort((a, b) => b.overdue - a.overdue);
  if (late.length) {
    pts.push([`${late.length} khách đang quá hạn; nặng nhất ${nameOf(late[0])} ${ty(late[0].overdue)} trễ ${n0(late[0].maxLate)} ngày`, late[0].maxLate > 90 ? "critical" : "high"]);
    const o90 = late.filter((c) => c.maxLate > 90);
    if (o90.length) pts.push([`${o90.length} khách có khoản trễ trên 90 ngày: ${o90.slice(0, 4).map(nameOf).join(", ")}`, "critical"]);
  } else pts.push(["Không có khoản nào quá hạn", "stable"]);
  const noBK = ARC.flatMap((c) => c.lines).filter((l) => !l.guiBK && l.con_lai > 0);
  if (noBK.length) pts.push([`${noBK.length} khoản còn nợ chưa ghi ngày gửi bảng kê — không theo dõi được tiến độ`, "neutral"]);
  const slow = ARC.filter((c) => c.avgDelay != null && (c.avgDelay as number) > 15).sort((a, b) => (b.avgDelay as number) - (a.avgDelay as number));
  if (slow.length) pts.push([`Trả chậm theo thói quen: ${slow.slice(0, 3).map((c) => `${nameOf(c)} trung bình trễ ${n0(c.avgDelay)} ngày`).join(" · ")}`, "high"]);
  if (A.top && A.conc > 0.3) pts.push([`${A.top.ten} chiếm ${pc(A.conc, 0)} tổng dư nợ — rủi ro tập trung`, "high"]);
  return execBand("Tóm tắt điều hành", lead, pts);
}

function sumAP(v: VM): string {
  const { B, APS, A } = v;
  if (!APS.length) return "";
  const pts: [string, string][] = [];
  let lead = `Tổng phải trả ${ty(B.out)} tại ${fmtDate(v.C.asOf)}; đến hạn trong 15 ngày ${ty(B.od + B.d7 + B.d15)}.`;
  if (ok(B.wDpo)) lead += ` DPO thực tế ${n0(B.wDpo)} ngày so với term hợp đồng ${ok(B.wTerm) ? n0(B.wTerm) : "—"} ngày.`;
  const od = APS.filter((x) => x.overdue > 0).sort((a, b) => b.overdue - a.overdue);
  if (od.length) pts.push([`${od.length} NCC đang bị trả chậm quá hạn, lớn nhất ${od[0].ten} ${ty(od[0].overdue)}`, "critical"]);
  const soon = APS.filter((x) => x.due15 > 0).sort((a, b) => b.due15 - a.due15).slice(0, 3);
  if (soon.length) pts.push([`Phải chi trong 15 ngày: ${soon.map((x) => `${x.ten} ${ty(x.due15)}`).join(" · ")}`, "neutral"]);
  const early = APS.filter((x) => x.term != null && x.dpo != null && (x.dpo as number) < (x.term as number) - 4);
  if (early.length) pts.push([`${early.length} NCC đang được trả sớm hơn hợp đồng: ${early.slice(0, 3).map((x) => `${x.ten} sớm ${n0((x.term as number) - (x.dpo as number))} ngày`).join(" · ")}`, "high"]);
  if (ok(B.float)) pts.push([B.float < 0 ? `Float âm ${n0(-B.float)} ngày — công ty trả NCC nhanh hơn thu tiền khách` : `Float dương ${n0(B.float)} ngày — NCC đang tài trợ vốn lưu động`, B.float < 0 ? "high" : "stable"]);
  else if (!ok(A.dso)) pts.push(["Chưa tính được Float vì thiếu ngày hóa đơn trong sổ phải thu", "neutral"]);
  return execBand("Tóm tắt điều hành", lead, pts);
}

function sumKpi(v: VM): string {
  const { P, PS } = v;
  if (!P.hasActual) return "";
  const pts: [string, string][] = [];
  let lead = `%đạt GMV tổng công ty ${pc(P.x)} rơi vào nấc ${ok(P.x) ? tierIdx(P.x) + 1 : "—"}/7, hệ số ${pc(P.H, 0)}.`;
  lead += ` Tổng hoa hồng ba team ${tr(P.comm)}, công ty giữ lại ${tr(P.companyKeep)}.`;
  pts.push([`Kỳ này phải chi ${tr(PS.tongChiKyNay)} cho ${PS.duePeriod.length} người`, "neutral"]);
  const top = PS.duePeriod[0];
  if (top) pts.push([`Nhận cao nhất: ${top.name} (${top.team}) ${tr(top.tong)}`, "neutral"]);
  const loss = P.pmPeople.filter((p) => p.laterMax - p.later > 1e5);
  if (loss.length) pts.push([`${loss.length} PM bị giảm phần trả sau do khách thu trễ, tổng ${tr(sum(loss, (p) => p.laterMax - p.later))}`, "high"]);
  const hetHan = P.contracts.filter((c) => c.status === "het_han" && c.payKy === v.ky);
  if (hetHan.length) pts.push([`${hetHan.length} hợp đồng hết hạn 6 tháng chưa đạt ngưỡng, chỉ trả theo tỷ lệ`, "high"]);
  const cho = P.contracts.filter((c) => c.status === "cho");
  if (cho.length) pts.push([`${cho.length} hợp đồng đang chờ đạt ngưỡng GMV`, "neutral"]);
  return execBand("Tóm tắt điều hành", lead, pts);
}

function sumAlerts(v: VM): string {
  const { AL, AA } = v;
  const c = { critical: 0, high: 0, watch: 0 };
  AL.forEach((a) => c[a.sev]++);
  const done = AL.filter((a) => AA[a.id]?.trang_thai === "da_xong").length;
  const doing = AL.filter((a) => AA[a.id]?.trang_thai === "dang_xu_ly").length;
  const noPic = AL.filter((a) => !AA[a.id]?.pic && AA[a.id]?.trang_thai !== "bo_qua" && AA[a.id]?.trang_thai !== "da_xong");
  const lead = `${AL.length} cảnh báo trong kỳ ${v.ky}: ${c.critical} khẩn, ${c.high} cao, ${c.watch} theo dõi. Đã xong ${done}, đang xử lý ${doing}, chưa giao việc ${noPic.length}.`;
  const pts: [string, string][] = [];
  if (noPic.length) pts.push([`${noPic.length} cảnh báo chưa có người nhận việc`, noPic.some((a) => a.sev === "critical") ? "critical" : "high"]);
  const late = AL.filter((a) => { const x = AA[a.id]; return x?.han_xu_ly && x.trang_thai !== "da_xong" && x.han_xu_ly < v.C.asOf; });
  if (late.length) pts.push([`${late.length} việc đã quá hạn xử lý`, "critical"]);
  if (!AL.length) pts.push(["Không có cảnh báo nào", "stable"]);
  return execBand("Tóm tắt điều hành", lead, pts);
}

/* ==========================================================================
   DOANH THU THEO TỪNG KHÁCH HÀNG
   ========================================================================== */
const SVC_C: Record<string, string> = { Hotel: D("blue"), Flight: D("cyan"), Mobility: D("purple"), "SaaS Travel": D("green"), "SaaS Mobility": D("green", "medium"), "F&B": D("orange") };
const SVCS = ["Hotel", "Flight", "Mobility", "SaaS Travel", "SaaS Mobility", "F&B"];

function custRevenueCards(v: VM): string {
  const { CR, P } = v;
  if (!CR.length) return "";
  const top = CR.slice(0, 15);
  const stack = hStack(top.map((r) => ({
    l: r.ten, sub: `${r.nhom} · PM ${r.pm} · ${pc(r.share, 1)} GMV`,
    parts: SVCS.filter((k) => (r.bySvc[k] || 0) > 0).map((k): [number, string, string] => [r.bySvc[k], SVC_C[k], k]),
    txt: tyN(r.gmv), txt2: `margin ${pc(r.mgPct, 1)}`,
  })), { ft: ty, legend: SVCS.map((k): LegendItem => [k, SVC_C[k]]) }) +
    `<div class="small" style="margin-top:6px">Hiển thị 15/${CR.length} khách có GMV lớn nhất trong kỳ.</div>`;
  const movers = CR.filter((r) => r.d != null && r.prev > 10e6);
  movers.sort((a, b) => (a.d as number) - (b.d as number));
  const pick = [...movers.slice(0, 7), ...movers.slice(-5).filter((m) => (m.d as number) > 0)];
  const uniq = Array.from(new Map(pick.map((m) => [m.ma_kh, m])).values());
  const mv = divBars(uniq.map((r) => ({
    l: r.ten, sub: `${r.nhom} · ${tr(r.prev)} → ${tr(r.gmv)}`,
    v: r.d as number, c: (r.d as number) < -0.3 ? "critical" : (r.d as number) < 0 ? D("orange") : D("green"),
    txt: ((r.d as number) > 0 ? "+" : "") + pc(r.d, 0),
  })), 1);
  const rowsTbl = CR.map((r) => `<tr><td>${esc(r.ten)}</td><td>${esc(r.ma_kh)}</td><td>${esc(r.nhom)}</td><td>${esc(r.pm)}</td>${SVCS.map((k) => `<td class="r num">${r.bySvc[k] ? n0(r.bySvc[k] / 1e6) : "–"}</td>`).join("")}<td class="r num">${n0(r.gmv / 1e6)}</td><td class="r num">${pc(r.share, 1)}</td><td class="r num">${n0(r.mgNet / 1e6)}</td><td class="r num ${ok(r.mgPct) && (r.mgPct as number) < 0.03 ? "c-critical" : ""}">${pc(r.mgPct, 2)}</td><td class="r num ${r.d != null && r.d < 0 ? "c-critical" : ""}">${r.d == null ? "—" : ((r.d as number) > 0 ? "+" : "") + pc(r.d, 0)}</td></tr>`).join("");
  const tbl = `<table><thead><tr><th>Khách hàng</th><th>Mã</th><th>Nhóm</th><th>PM</th>${SVCS.map((k) => `<th class="r">${k}</th>`).join("")}<th class="r">Tổng GMV</th><th class="r">Tỷ trọng</th><th class="r">Margin net</th><th class="r">%Margin</th><th class="r">Δ tháng trước</th></tr></thead><tbody>${rowsTbl}<tr class="tot"><td>Tổng ${CR.length} khách</td><td></td><td></td><td></td>${SVCS.map((k) => `<td class="r num">${n0(sum(CR, (r) => r.bySvc[k] || 0) / 1e6)}</td>`).join("")}<td class="r num">${n0(P.totAct / 1e6)}</td><td class="r num">100%</td><td class="r num">${n0(P.gp / 1e6)}</td><td class="r num">${pc(P.totAct ? P.gp / P.totAct : null, 2)}</td><td></td></tr></tbody></table>`;
  return `<div class="g75">${card("Theo khách hàng", "GMV từng khách, tách theo dịch vụ", "tỷ VND · lớn nhất trước", stack)}${card("Biến động", "Thay đổi GMV so với tháng trước", "khách có GMV tháng trước từ 10 tr", mv)}</div>
   ${details(`Xem bảng doanh thu chi tiết của cả ${CR.length} khách (triệu VND)`, tbl)}`;
}

/* ==========================================================================
   DANH SÁCH KHÁCH THEO TỪNG NHÓM N
   ========================================================================== */
function groupCustomerCards(v: VM): string {
  const { GB } = v;
  if (!GB.length) return "";
  const blocks = GB.map((b) => {
    if (!b.rows.length) return card(b.g, `${b.g} — ${GNAME[b.g]}`, "chưa có khách phát sinh", empty("Không có khách nào phát sinh GMV trong kỳ"));
    const top = b.rows.slice(0, 12);
    const delta = (r: CustRow) => (r.d == null || r.prev < 10e6 ? "" : ` · ${(r.d as number) > 0 ? "▲" : "▼"}${pc(Math.abs(r.d as number), 0)}`);
    const bars = hBullet(top.map((r) => ({
      l: r.ten, sub: `PM ${r.pm}${r.sales !== "—" ? " · " + r.sales : ""}${delta(r)}`,
      v: r.gmv, c: r.d != null && r.prev >= 10e6 && (r.d as number) < -0.3 ? "critical" : GC[b.g],
      txt: tyN(r.gmv), txt2: `${pc(b.gmv ? r.gmv / b.gmv : null, 1)} nhóm · margin ${pc(r.mgPct, 1)}`,
    })), { max: b.rows[0].gmv * 1.05 });
    const note = `${b.rows.length} khách · ${tyN(b.gmv)} tỷ GMV` + (b.tgt ? ` · ${pc(b.gmv / b.tgt, 0)} kế hoạch` : "");
    const more = b.rows.length > 12 ? `<div class="small" style="margin-top:6px">Hiển thị 12/${b.rows.length} khách lớn nhất của nhóm.</div>` : "";
    const tbl = `<table><thead><tr><th>#</th><th>Khách hàng</th><th>Mã</th><th>PM</th><th class="r">GMV (tr)</th><th class="r">Tỷ trọng nhóm</th><th class="r">Lũy kế</th><th class="r">Margin net (tr)</th><th class="r">%Margin</th><th class="r">Δ tháng trước</th></tr></thead><tbody>${(() => {
      let cum = 0;
      return b.rows.map((r, i) => { cum += r.gmv; return `<tr><td class="num">${i + 1}</td><td>${esc(r.ten)}</td><td>${esc(r.ma_kh)}</td><td>${esc(r.pm)}</td><td class="r num">${n0(r.gmv / 1e6)}</td><td class="r num">${pc(b.gmv ? r.gmv / b.gmv : null, 1)}</td><td class="r num">${pc(b.gmv ? cum / b.gmv : null, 0)}</td><td class="r num">${n0(r.mgNet / 1e6)}</td><td class="r num">${pc(r.mgPct, 2)}</td><td class="r num ${r.d != null && r.d < 0 ? "c-critical" : ""}">${r.d == null ? "—" : ((r.d as number) > 0 ? "+" : "") + pc(r.d, 0)}</td></tr>`; }).join("");
    })()}</tbody></table>`;
    return card(b.g, `${b.g} — ${GNAME[b.g]}`, note + "<br>tỷ VND", bars + more + `<details style="margin-top:10px"><summary>Xem đủ ${b.rows.length} khách của nhóm ${b.g}</summary><div class="tw" style="margin-top:10px">${tbl}</div></details>`);
  });
  return `<div class="g2">${blocks.join("")}</div>`;
}

/* ==========================================================================
   DÒNG TIỀN CHI TIẾT THEO KHÁCH / NCC
   ========================================================================== */
function flowCard(title: string, eyebrow: string, rows: import("./calc").FlowRow[], c1: string, c2: string, CD: CashDetail, kind: "in" | "out"): string {
  if (!rows.length) return card(eyebrow, title, "", empty("Chưa có dữ liệu công nợ để suy ra dòng tiền"));
  const top = rows.slice(0, 12);
  const body = hStack(top.map((r) => ({
    l: r.ten, sub: r.phu,
    parts: [[r.thuc, c1, `Thực tế ${CD.fromDays} ngày qua`], [r.quaHan, D("red"), "Quá hạn"], [r.sapToi, c2, `Dự kiến ${CD.aheadDays} ngày tới`]] as [number, string, string][],
    txt: tyN(r.thuc + r.quaHan + r.sapToi),
    txt2: `${kind === "in" ? "đã thu" : "đã chi"} ${tr(r.thuc)}`,
  })), { ft: ty, legend: [[`Thực tế ${CD.fromDays} ngày qua`, c1], ["Quá hạn", D("red")], [`Dự kiến ${CD.aheadDays} ngày tới`, c2]] });
  const tbl = `<table><thead><tr><th>${kind === "in" ? "Khách hàng" : "Nhà cung cấp"}</th><th>Phân loại</th><th class="r">Thực tế ${CD.fromDays} ngày (tr)</th><th class="r">Quá hạn (tr)</th><th class="r">${CD.aheadDays} ngày tới (tr)</th><th class="r">Tổng còn lại (tr)</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.ten)}</td><td class="small">${esc(r.phu)}</td><td class="r num">${n0(r.thuc / 1e6)}</td><td class="r num ${r.quaHan > 0 ? "c-critical" : ""}">${r.quaHan ? n0(r.quaHan / 1e6) : "–"}</td><td class="r num">${r.sapToi ? n0(r.sapToi / 1e6) : "–"}</td><td class="r num">${n0(r.dukien / 1e6)}</td></tr>`).join("")}<tr class="tot"><td>Tổng</td><td></td><td class="r num">${n0(sum(rows, (r) => r.thuc) / 1e6)}</td><td class="r num">${n0(sum(rows, (r) => r.quaHan) / 1e6)}</td><td class="r num">${n0(sum(rows, (r) => r.sapToi) / 1e6)}</td><td class="r num">${n0(sum(rows, (r) => r.dukien) / 1e6)}</td></tr></tbody></table>`;
  const more = rows.length > 12 ? `<div class="small" style="margin-top:6px">Hiển thị 12/${rows.length}.</div>` : "";
  return card(eyebrow, title, "tỷ VND", body + more + `<details style="margin-top:10px"><summary>Xem đủ ${rows.length} dòng</summary><div class="tw" style="margin-top:10px">${tbl}</div></details>`);
}
function cashDetailCards(v: VM): string {
  const { CD } = v;
  if (!CD.inflow.length && !CD.outflow.length) return "";
  return `<div class="g2">${flowCard("Tiền thu từ khách nào", "Dòng tiền vào", CD.inflow, D("green"), D("cyan"), CD, "in")}${flowCard("Tiền chi cho nhà cung cấp nào", "Dòng tiền ra", CD.outflow, D("purple"), D("blue"), CD, "out")}</div>
   <div class="card small">Số thực tế lấy từ ngày thu đủ / ngày trả trong sổ công nợ; số dự kiến lấy từ các khoản còn lại theo ngày đến hạn. Sheet DONG_TIEN chỉ nhập theo khoản mục nên không tách được theo đối tượng — hai bảng trên là cách duy nhất nhìn thấy chi tiết từng khách, từng NCC.</div>`;
}

/* ---------- Form sửa công nợ ngay trên web ---------- */
interface EdF { f: string; l: string; t: "date" | "money" | "text"; v?: string | number | null; w?: string }
function edForm(loai: "ar" | "ap", ma: string, ky: string, soCt: string, fields: EdF[], opts: { them?: boolean; suaTay?: boolean } = {}): string {
  const inp = (x: EdF) => {
    const val = x.v == null ? "" : x.t === "money" ? String(Math.round(Number(x.v))) : String(x.v);
    const type = x.t === "date" ? "date" : x.t === "money" ? "number" : "text";
    return `<label${x.w ? ` class="${x.w}"` : ""}>${esc(x.l)}<input type="${type}" class="fld" data-f="${x.f}" value="${esc(val)}"${x.t === "money" ? " step=\"1000\" inputmode=\"numeric\"" : ""}></label>`;
  };
  return `<div class="cn-form" data-loai="${loai}" data-ma="${esc(ma)}" data-ky="${esc(ky)}" data-soct="${esc(soCt)}"${opts.them ? " data-them=\"1\"" : ""}>
    ${fields.map(inp).join("")}
    <div class="cn-act">
      <button type="button" class="btn primary cn-save">${opts.them ? "Thêm dòng" : "Lưu"}</button>
      ${opts.them ? "" : `<button type="button" class="btn cn-reset" title="Bỏ số sửa tay, quay về số trong file template"${opts.suaTay ? "" : " disabled"}>Về số gốc</button>`}
      ${opts.them ? "" : `<button type="button" class="btn danger cn-hide" title="Ẩn dòng này khỏi dashboard">Ẩn dòng</button>`}
    </div>
  </div>`;
}

/* ==========================================================================
   CÔNG NỢ PHẢI THU — CHI TIẾT THEO KHÁCH VÀ THEO KỲ
   ========================================================================== */
const TT_AR: Record<string, [string, string]> = {
  da_thu: ["Đã thu đủ", "stable"], qua_han: ["Quá hạn", "critical"], den_han: ["Đến hạn hôm nay", "high"], chua_den_han: ["Chưa đến hạn", "neutral"],
};
function arCustomerCards(v: VM): string {
  const { ARC, C, canEdit } = v;
  if (!ARC.length) return "";
  const withOpen = ARC.filter((c) => c.open > 0);
  const top = withOpen.slice(0, 15);
  const bars = hStack(top.map((c) => ({
    l: c.ten, sub: `${c.nhom} · PM ${c.pm}${c.term != null ? " · term " + c.term + " ngày" : ""}${c.maxLate > 0 ? " · trễ nhất " + n0(c.maxLate) + " ngày" : ""}`,
    parts: [[c.open - c.overdue, D("green"), "Chưa đến hạn"], [c.overdue, D("red"), "Quá hạn"]] as [number, string, string][],
    txt: tyN(c.open), txt2: `đã thu ${pc(c.billed ? c.paid / c.billed : null, 0)}`,
  })), { ft: ty, legend: [["Chưa đến hạn", D("green")], ["Quá hạn", D("red")]] }) +
    (withOpen.length > 15 ? `<div class="small" style="margin-top:6px">Hiển thị 15/${withOpen.length} khách còn dư nợ.</div>` : "");

  // Tiến độ bảng kê & thu tiền theo kỳ
  const lines = ARC.flatMap((c) => c.lines.map((l) => ({ c, l })));
  const kys = Array.from(new Set(lines.map((x) => x.l.ky))).filter((k) => ok(kyIdx(k))).sort((a, b) => kyIdx(b) - kyIdx(a)).slice(0, 6);
  const prog = kys.map((k) => {
    const ls = lines.filter((x) => x.l.ky === k);
    const billed = sum(ls, (x) => x.l.so_tien), paid = sum(ls, (x) => x.l.da_thu);
    const sentN = ls.filter((x) => x.l.guiBK).length;
    const delays = ls.filter((x) => x.l.guiBK && x.l.thu_du).map((x) => days(x.l.thu_du as string, x.l.guiBK as string));
    return { k, n: ls.length, billed, paid, open: billed - paid, sentN, avgCollect: delays.length ? sum(delays, (d) => d) / delays.length : null };
  });
  const progHTML = hStack(prog.map((r) => ({
    l: "Kỳ " + r.k, sub: `${r.n} bảng kê · đã gửi ${r.sentN}/${r.n}${r.avgCollect != null ? ` · thu sau ${n0(r.avgCollect)} ngày kể từ ngày gửi` : ""}`,
    parts: [[r.paid, D("green"), "Đã thu"], [r.open, D("orange"), "Còn lại"]] as [number, string, string][],
    txt: tyN(r.billed), txt2: `thu ${pc(r.billed ? r.paid / r.billed : null, 0)}`,
  })), { ft: ty, legend: [["Đã thu", D("green")], ["Còn lại", D("orange")]] });

  const detail = ARC.slice(0, 60).map((c) => {
    const rows = c.lines.map((l) => {
      const [lab, cls] = TT_AR[l.tt];
      const src = l.nguonBK === "recon" ? ` <span class="src" title="Lấy từ app Reconciliation">↩</span>` : l.nguonBK === "web" ? ` <span class="src web" title="Sửa tay trên web">✎</span>` : "";
      const form = canEdit ? `<tr class="ed-row" hidden><td colspan="12">${edForm("ar", c.ma_kh, l.ky, l.so_ct || "", [
        { f: "ngay_gui_bk", l: "Ngày gửi bảng kê", t: "date", v: l.guiBK },
        { f: "ngay_den_han", l: "Ngày đến hạn", t: "date", v: l.den_han },
        { f: "so_tien", l: "Số tiền phải thu", t: "money", v: l.so_tien },
        { f: "da_thu", l: "Đã thu", t: "money", v: l.da_thu },
        { f: "ngay_thu_du", l: "Ngày thu đủ", t: "date", v: l.thu_du },
        { f: "ngay_thu_gan_nhat", l: "Ngày thu gần nhất", t: "date", v: l.thu_gan_nhat },
        { f: "ghi_chu", l: "Ghi chú", t: "text", v: l.ghiChu, w: "wide" },
      ], { suaTay: l.suaTay })}</td></tr>` : "";
      return `<tr class="${l.suaTay ? "r-edited" : ""}"><td class="num">${esc(l.ky)}</td><td class="small">${esc(l.so_ct || "—")}</td><td class="num">${fmtDate(l.guiBK)}${src}</td><td class="num">${fmtDate(l.ngay_hd)}</td><td class="num">${fmtDate(l.den_han)}</td><td class="r num">${n0(l.so_tien / 1e6)}</td><td class="r num">${l.da_thu ? n0(l.da_thu / 1e6) : "–"}</td><td class="r num ${l.con_lai > 0 && l.tt === "qua_han" ? "c-critical" : ""}">${l.con_lai > 0 ? n0(l.con_lai / 1e6) : "–"}</td><td class="num">${fmtDate(l.thu_du || (l.thu_gan_nhat && l.thu_gan_nhat <= C.asOf ? l.thu_gan_nhat : null))}</td><td class="r num ${l.tt === "qua_han" ? "c-critical" : ""}">${l.tt === "qua_han" ? n0(l.late) : l.ngayThuSauHan != null && l.ngayThuSauHan > 0 ? "trễ " + n0(l.ngayThuSauHan) : "–"}</td><td>${pill(lab, cls)}</td><td class="r">${canEdit ? `<button type="button" class="icon-btn cn-toggle" title="Sửa dòng này"><i class="ri-edit-line"></i></button>` : ""}</td></tr>${form}`;
    }).join("");
    return `<details class="cust-det"><summary><b>${esc(c.ten)}</b> <span class="small">${esc(c.nhom)} · PM ${esc(c.pm)} · còn lại <b class="num">${tr(c.open)}</b>${c.overdue > 0 ? ` · quá hạn <b class="num c-critical">${tr(c.overdue)}</b> (trễ nhất ${n0(c.maxLate)} ngày)` : ""} · đúng hạn ${pc(c.onTimeRate, 0)}</span></summary>
      <div class="tw" style="margin-top:10px"><table><thead><tr><th>Kỳ nợ</th><th>Số chứng từ</th><th>Gửi bảng kê</th><th>Hóa đơn</th><th>Đến hạn</th><th class="r">Phải thu (tr)</th><th class="r">Đã thu (tr)</th><th class="r">Còn lại (tr)</th><th>Ngày thu</th><th class="r">Số ngày trễ</th><th>Trạng thái</th><th></th></tr></thead><tbody>${rows}
      <tr class="tot"><td>Tổng</td><td></td><td></td><td></td><td></td><td class="r num">${n0(c.billed / 1e6)}</td><td class="r num">${n0(c.paid / 1e6)}</td><td class="r num">${n0(c.open / 1e6)}</td><td></td><td></td><td></td><td></td></tr></tbody></table></div>${canEdit ? `<details class="add-det"><summary>+ Thêm dòng công nợ cho ${esc(c.ten)}</summary>${edForm("ar", c.ma_kh, "", "", [
        { f: "__ky", l: "Kỳ nợ (T09.2026)", t: "text" },
        { f: "__soct", l: "Số chứng từ", t: "text" },
        { f: "ngay_gui_bk", l: "Ngày gửi bảng kê", t: "date" },
        { f: "ngay_hd", l: "Ngày hóa đơn", t: "date" },
        { f: "ngay_den_han", l: "Ngày đến hạn", t: "date" },
        { f: "so_tien", l: "Số tiền phải thu", t: "money" },
        { f: "da_thu", l: "Đã thu", t: "money" },
        { f: "ngay_thu_du", l: "Ngày thu đủ", t: "date" },
        { f: "ghi_chu", l: "Ghi chú", t: "text", w: "wide" },
      ], { them: true })}</details>` : ""}</details>`;
  }).join("");

  return `<div class="g75">${card("Theo khách hàng", "Dư nợ còn lại của từng khách", "tỷ VND · còn nợ nhiều nhất trước", bars)}${card("Tiến độ theo kỳ", "Bảng kê đã gửi và tiền đã thu", "tỷ VND", progHTML)}</div>
   ${card("Chi tiết từng khách", "Kỳ nào chưa trả, còn bao nhiêu, trễ mấy ngày", `tại ${fmtDate(C.asOf)} · bấm tên khách để mở`, `<div class="det-wrap">${detail}</div>` + (ARC.length > 60 ? `<div class="small" style="margin-top:8px">Hiển thị 60/${ARC.length} khách có dư nợ lớn nhất.</div>` : ""))}`;
}

/* ==========================================================================
   CÔNG NỢ PHẢI TRẢ — CHI TIẾT THEO NHÀ CUNG CẤP
   ========================================================================== */
const TT_AP: Record<string, [string, string]> = {
  da_tra: ["Đã trả", "stable"], qua_han: ["Quá hạn", "critical"], sap_den_han: ["Đến hạn ≤ 15 ngày", "high"], con_han: ["Còn hạn", "neutral"],
};
function apSupplierCards(v: VM): string {
  const { APS, C, canEdit } = v;
  if (!APS.length) return "";
  const detail = APS.map((s2) => {
    const rows = s2.lines.map((l) => {
      const [lab, cls] = TT_AP[l.tt];
      const form = canEdit ? `<tr class="ed-row" hidden><td colspan="11">${edForm("ap", s2.ma_ncc, l.ky || "", l.so_ct || "", [
        { f: "ngay_hd", l: "Ngày hóa đơn", t: "date", v: l.ngay_hd },
        { f: "ngay_den_han", l: "Ngày đến hạn", t: "date", v: l.den_han },
        { f: "so_tien", l: "Số tiền phải trả", t: "money", v: l.so_tien },
        { f: "da_tra", l: "Đã trả", t: "money", v: l.da_tra },
        { f: "ngay_tra", l: "Ngày trả", t: "date", v: l.ngay_tra },
        { f: "ghi_chu", l: "Ghi chú", t: "text", v: l.ghiChu, w: "wide" },
      ], { suaTay: l.suaTay })}</td></tr>` : "";
      return `<tr class="${l.suaTay ? "r-edited" : ""}"><td class="num">${esc(l.ky || "—")}</td><td class="small">${esc(l.so_ct || "—")}</td><td class="num">${fmtDate(l.ngay_hd)}</td><td class="num">${fmtDate(l.den_han)}</td><td class="r num">${n0(l.so_tien / 1e6)}</td><td class="r num">${l.da_tra ? n0(l.da_tra / 1e6) : "–"}</td><td class="r num ${l.tt === "qua_han" ? "c-critical" : ""}">${l.con_lai > 0 ? n0(l.con_lai / 1e6) : "–"}</td><td class="num">${fmtDate(l.ngay_tra)}</td><td class="r num">${l.dpo != null ? n0(l.dpo) : l.con_lai > 0 ? (l.dueIn < 0 ? "quá " + n0(-l.dueIn) : "còn " + n0(l.dueIn)) : "–"}</td><td>${pill(lab, cls)}</td><td class="r">${canEdit ? `<button type="button" class="icon-btn cn-toggle" title="Sửa dòng này"><i class="ri-edit-line"></i></button>` : ""}</td></tr>${form}`;
    }).join("");
    return `<details class="cust-det"><summary><b>${esc(s2.ten)}</b> <span class="small">${esc(s2.nganh)} · term ${s2.term ?? "—"} ngày${s2.dpo != null ? ` · DPO thực tế ${n0(s2.dpo)} ngày` : ""} · còn phải trả <b class="num">${tr(s2.open)}</b>${s2.overdue > 0 ? ` · quá hạn <b class="num c-critical">${tr(s2.overdue)}</b>` : ""}</span></summary>
      <div class="tw" style="margin-top:10px"><table><thead><tr><th>Kỳ</th><th>Số chứng từ</th><th>Hóa đơn</th><th>Đến hạn</th><th class="r">Phải trả (tr)</th><th class="r">Đã trả (tr)</th><th class="r">Còn lại (tr)</th><th>Ngày trả</th><th class="r">Số ngày</th><th>Trạng thái</th><th></th></tr></thead><tbody>${rows}
      <tr class="tot"><td>Tổng</td><td></td><td></td><td></td><td class="r num">${n0(s2.billed / 1e6)}</td><td class="r num">${n0(s2.paid / 1e6)}</td><td class="r num">${n0(s2.open / 1e6)}</td><td></td><td></td><td></td><td></td></tr></tbody></table></div>${canEdit ? `<details class="add-det"><summary>+ Thêm dòng công nợ cho ${esc(s2.ten)}</summary>${edForm("ap", s2.ma_ncc, "", "", [
        { f: "__ky", l: "Kỳ (T09.2026)", t: "text" },
        { f: "__soct", l: "Số chứng từ", t: "text" },
        { f: "ngay_hd", l: "Ngày hóa đơn", t: "date" },
        { f: "ngay_den_han", l: "Ngày đến hạn", t: "date" },
        { f: "so_tien", l: "Số tiền phải trả", t: "money" },
        { f: "da_tra", l: "Đã trả", t: "money" },
        { f: "ngay_tra", l: "Ngày trả", t: "date" },
        { f: "ghi_chu", l: "Ghi chú", t: "text", w: "wide" },
      ], { them: true })}</details>` : ""}</details>`;
  }).join("");
  const bars = hStack(APS.filter((x) => x.open > 0).slice(0, 12).map((x) => ({
    l: x.ten, sub: `${x.nganh} · Partnership ${x.partnership}`,
    parts: [[x.overdue, D("red"), "Quá hạn"], [x.due15, D("orange"), "≤ 15 ngày"], [Math.max(0, x.open - x.overdue - x.due15), D("green"), "Còn hạn"]] as [number, string, string][],
    txt: tyN(x.open),
  })), { ft: ty, legend: [["Quá hạn", D("red")], ["≤ 15 ngày", D("orange")], ["Còn hạn", D("green")]] });
  return `<div class="g2">${card("Theo nhà cung cấp", "Số còn phải trả và mức độ gấp", "tỷ VND", bars)}${card("Chi tiết từng NCC", "Chứng từ nào chưa trả, đến hạn khi nào", `tại ${fmtDate(C.asOf)} · bấm tên NCC để mở`, `<div class="det-wrap">${detail}</div>`)}</div>`;
}

/* ==========================================================================
   HOA HỒNG — ĐỦ BA TEAM VÀ LỊCH CHI TRẢ
   ========================================================================== */
const TEAM_C: Record<string, string> = { PM: D("cyan"), Sales: D("purple"), Partnership: D("green") };
const TEAM_L: Record<string, string> = { PM: D("cyan", "medium"), Sales: D("purple", "medium"), Partnership: D("green", "medium") };
function payCards(v: VM): string {
  const { PS, P } = v;
  if (!PS.rows.length) return "";
  const all = hStack(PS.rows.map((r) => ({
    l: r.name, sub: r.team + (r.team === "PM" ? ` · trả sau vào ${r.kyTraSau}` : " · trả hết trong kỳ"),
    parts: [[r.traNgay, TEAM_C[r.team], "Trả ngay"], [r.traSau, TEAM_L[r.team], "Trả sau — dự kiến"], [Math.max(0, r.traSauGoc - r.traSau), D("red"), "Mất do khách thu trễ"]] as [number, string, string][],
    txt: tr(r.tongKy), txt2: r.team,
  })), { ft: tr, legend: [["Trả ngay", D("gray")], ["Trả sau — dự kiến (nhạt)", D("gray", "medium")], ["Mất do khách thu trễ", D("red")]] }) +
    `<div class="small" style="margin-top:8px">Màu theo team: <b style="color:var(--${TEAM_C.PM})">PM</b> · <b style="color:var(--${TEAM_C.Sales})">Sales</b> · <b style="color:var(--${TEAM_C.Partnership})">Partnership</b>. Sales và Partnership nhận đủ trong kỳ, không có phần trả sau.</div>`;
  const due = PS.duePeriod;
  const dueHTML = due.length ? hStack(due.map((r) => ({
    l: r.name, sub: r.team,
    parts: [[r.tuKyNay, D("cyan"), `Trả ngay của kỳ ${v.ky}`], [r.tuKyTruoc, D("purple"), `Phần trả sau của kỳ ${PS.kyNguon}`]] as [number, string, string][],
    txt: tr(r.tong),
  })), { ft: tr, legend: [[`Trả ngay của kỳ ${v.ky}`, D("cyan")], [`Phần trả sau của kỳ ${PS.kyNguon}`, D("purple")]] }) +
    `<div class="small" style="margin-top:8px">Tổng phải chi trong kỳ ${esc(v.ky)}: <b class="num">${tr(PS.tongChiKyNay)}</b> cho ${due.length} người. Phần trả sau của PM chốt ${PS.thangTraSau} tháng sau kỳ phát sinh và nhân với tỷ lệ thu đúng hạn của nhóm.</div>`
    : empty("Chưa có khoản nào phải chi trong kỳ");
  const byTeam = ["PM", "Sales", "Partnership"].map((t): [number, string, string] => [sum(PS.rows.filter((r) => r.team === t), (r) => r.tongKy), TEAM_C[t], "Team " + t]);
  byTeam.push([P.companyKeep, D("gray"), "Công ty giữ lại"]);
  const mix = donut(byTeam, tr(P.comm + P.companyKeep), "tổng quỹ", { ft: tr });
  const tbl = `<table><thead><tr><th>Người</th><th>Team</th><th class="r">Tổng kỳ này (tr)</th><th class="r">Trả ngay</th><th class="r">Trả sau dự kiến</th><th class="r">Trả sau tối đa</th><th>Kỳ trả phần sau</th><th class="r">Thực chi kỳ ${esc(v.ky)}</th></tr></thead><tbody>${PS.rows.map((r) => { const d = due.find((x) => x.name === r.name); return `<tr><td>${esc(r.name)}</td><td>${esc(r.team)}</td><td class="r num">${N1.format(r.tongKy / 1e6)}</td><td class="r num">${N1.format(r.traNgay / 1e6)}</td><td class="r num">${r.traSau ? N1.format(r.traSau / 1e6) : "–"}</td><td class="r num">${r.traSauGoc ? N1.format(r.traSauGoc / 1e6) : "–"}</td><td>${esc(r.kyTraSau)}</td><td class="r num">${d ? N1.format(d.tong / 1e6) : "–"}</td></tr>`; }).join("")}
    <tr class="tot"><td>Tổng</td><td></td><td class="r num">${N1.format(sum(PS.rows, (r) => r.tongKy) / 1e6)}</td><td class="r num">${N1.format(sum(PS.rows, (r) => r.traNgay) / 1e6)}</td><td class="r num">${N1.format(sum(PS.rows, (r) => r.traSau) / 1e6)}</td><td class="r num">${N1.format(sum(PS.rows, (r) => r.traSauGoc) / 1e6)}</td><td></td><td class="r num">${N1.format(PS.tongChiKyNay / 1e6)}</td></tr></tbody></table>`;
  return `<div class="g75">${card("Toàn công ty", "Hoa hồng kỳ này của cả ba team", "triệu VND", all)}${card("Cơ cấu quỹ", "Quỹ chia về đâu", "kỳ " + esc(v.ky), mix)}</div>
   <div class="g2">${card("Lịch chi trả", `Kỳ ${esc(v.ky)} phải thanh toán cho ai, bao nhiêu`, "triệu VND", dueHTML)}${card("Bảng thanh toán", "Chi tiết từng người", "triệu VND", `<div class="tw">${tbl}</div>`)}</div>`;
}

/* ==========================================================================
   BẢNG THEO DÕI XỬ LÝ CẢNH BÁO
   ========================================================================== */
const TT_AL: [string, string, string][] = [["moi", "Mới", "neutral"], ["dang_xu_ly", "Đang xử lý", "high"], ["da_xong", "Đã xong", "stable"], ["bo_qua", "Bỏ qua", "neutral"]];
function alertBoard(v: VM): string {
  const { AL, AA, C } = v;
  if (!AL.length) return empty("Không có cảnh báo nào trong kỳ này.");
  const sevLab: Record<string, string> = { critical: "Khẩn", high: "Cao", watch: "Theo dõi" };
  return AL.map((a) => {
    const x = AA[a.id];
    const st = x?.trang_thai || "moi";
    const lab = TT_AL.find((t) => t[0] === st) as [string, string, string];
    const overdue = x?.han_xu_ly && st !== "da_xong" && st !== "bo_qua" && x.han_xu_ly < C.asOf;
    return `<div class="alert ${a.sev} ${st === "da_xong" ? "done" : ""}" data-alert="${esc(a.id)}">
      ${pill(sevLab[a.sev], a.sev)}
      <div>
        <div class="msg">${esc(a.msg)}</div>
        <div class="act">→ ${esc(a.act)}</div>
        <div class="al-form">
          <label>PIC<input type="text" class="fld" data-f="pic" value="${esc(x?.pic || "")}" placeholder="${esc(a.own)}"></label>
          <label>Hạn xử lý<input type="date" class="fld" data-f="han_xu_ly" value="${esc(x?.han_xu_ly || "")}"></label>
          <label>Trạng thái<select class="fld" data-f="trang_thai">${TT_AL.map((t) => `<option value="${t[0]}"${t[0] === st ? " selected" : ""}>${t[1]}</option>`).join("")}</select></label>
          <label class="wide">Hành động đã làm<input type="text" class="fld" data-f="hanh_dong" value="${esc(x?.hanh_dong || "")}" placeholder="Ghi ngắn gọn việc đã xử lý"></label>
          <button class="btn primary al-save" type="button">Lưu</button>
        </div>
      </div>
      <div class="own">${esc(a.area)}<br>${esc(a.own)}<br>${pill(lab[1], lab[2])}${overdue ? `<br>${pill("Quá hạn xử lý", "critical")}` : ""}${x ? `<br><span class="small">cập nhật ${fmtDate(x.updated_at.slice(0, 10))}</span>` : ""}</div>
    </div>`;
  }).join("");
}

export function renderView(tab: string, v: VM): string {
  switch (tab) {
    case "overview": return overview(v);
    case "revenue": return revenue(v);
    case "customers": return customers(v);
    case "cash": return cash(v);
    case "ar": return ar(v);
    case "ap": return ap(v);
    case "kpi": return kpi(v);
    case "alerts": return alertsView(v);
    default: return "";
  }
}
