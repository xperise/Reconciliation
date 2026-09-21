// Nội dung các tab (trừ tab Dữ liệu) — dựng HTML từ kết quả tính toán ở calc.ts
import { Ctx, Period, AR, AP, Cash, Alert, AR_BUCKETS, TIERS, tier, tierIdx, AXIS_NAME, Axis, num, hasActual } from "./calc";
import { barChart, lineChart, waterfall, hBullet, hStack, divBars, donut, tierChart, legend, pill, stCls, xC, empty, LegendItem } from "./charts";
import { esc, ty, tyN, tr, n0, pc, sum, ok, N1, N2, kyShort, fmtDate, kyIdx } from "./util";

export interface VM { C: Ctx; P: Period; A: AR; B: AP; CS: Cash; AL: Alert[]; ky: string }
const BCLS = ["stable", "watch", "high", "critical", "critical-2"];
const AXC: Record<Axis, string> = { T: "accent", M: "stable", S: "high", F: "ink-3" };
const GC: Record<string, string> = { N1: "accent", N2: "stable", N3: "high", N4: "info", N5: "ink-3" };
const GNAME: Record<string, string> = { N1: "Travel", N2: "Top200 active", N3: "Top200 lapser", N4: "Active ngoài Top200", N5: "Lapser ngoài Top200" };

const card = (eyebrow: string, title: string, note: string, body: string, extra = "") =>
  `<div class="card ${extra}"><div class="card-h"><div><div class="eyebrow">${esc(eyebrow)}</div><div class="card-title">${esc(title)}</div></div><div class="card-note">${note}</div></div>${body}</div>`;
const details = (label: string, body: string) => `<div class="card"><details><summary>${esc(label)}</summary><div class="tw" style="margin-top:12px">${body}</div></details></div>`;
const stat = (l: string, v: string, c = "") => `<div class="stat"><div class="l">${esc(l)}</div><div class="v ${c ? "c-" + c : ""}">${v}</div></div>`;
const noActual = (ky: string) => `<div class="card notice">Kỳ ${esc(ky)} chưa có số liệu GMV thực tế. Upload sheet GMV cho kỳ này ở tab <a href="#" data-go="data">Dữ liệu</a>.</div>`;

/* ---------- KPI strip ---------- */
export function kpiStrip(v: VM): string {
  const { P, A, CS } = v;
  const cTot = sum(P.cust.groups, (g) => g.act), cTgt = sum(P.cust.groups, (g) => g.tgt || 0);
  const lastBal = CS.halves.filter((h) => h.h.startsWith(v.ky)).slice(-1)[0]?.bal ?? CS.halves.slice(-1)[0]?.bal ?? null;
  const k: [string, string, string, number, string, string][] = [
    ["GMV kỳ", ty(P.totAct), P.totTgt ? `${pc(P.x)} của ${ty(P.totTgt)} kế hoạch` : "chưa có kế hoạch", P.x ?? 0, stCls(P.x), "revenue"],
    ["Margin net", ty(P.gp), P.mgTgtTot ? `${pc(P.gp / P.mgTgtTot)} kế hoạch · ${pc(P.totAct ? P.gp / P.totAct : null, 2)} GMV` : "", P.mgTgtTot ? P.gp / P.mgTgtTot : 0, stCls(P.mgTgtTot ? P.gp / P.mgTgtTot : null), "revenue"],
    ["EBITDA", ok(P.ebitda) ? ty(P.ebitda) : "—", ok(P.ebitda) ? `${pc(P.gp ? P.ebitda / P.gp : null)} trên margin net` : "chưa có sheet CHI_PHI kỳ này", ok(P.ebitda) && P.gp ? Math.max(0, P.ebitda / P.gp) : 0, ok(P.ebitda) ? (P.ebitda < 0 ? "critical" : "stable") : "muted", "revenue"],
    ["Tiền cuối kỳ (dự kiến)", CS.hasOpen && ok(lastBal) ? ty(lastBal) : "—", CS.hasOpen ? `đầu kỳ ${ty(CS.open)}` : "chưa nhập số dư đầu kỳ (THAM_SO)", CS.hasOpen && ok(lastBal) && CS.open ? Math.min(1, Math.max(0, lastBal / CS.open)) : 0, CS.hasOpen && ok(lastBal) ? (lastBal < 0 ? "critical" : "stable") : "muted", "cash"],
    ["Nợ phải thu quá hạn", A.tot ? pc(A.od / A.tot) : "—", A.tot ? `${ty(A.od)} / ${ty(A.tot)} · DSO ${ok(A.dso) ? n0(A.dso) + " ngày" : "—"}` : "chưa có sổ công nợ", A.tot ? A.od / A.tot : 0, !A.tot ? "muted" : A.od / A.tot > 0.4 ? "critical" : A.od / A.tot > 0.25 ? "high" : "stable", "ar"],
    ["Khách hàng active", n0(cTot), cTgt ? `của ${n0(cTgt)} kế hoạch` : "", cTgt ? cTot / cTgt : 0, stCls(cTgt ? cTot / cTgt : null), "customers"],
  ];
  return k.map(([l, val, s, m, c, go]) => `<div class="kpi" data-go="${go}" tabindex="0" role="button"><div class="kpi-l">${esc(l)}</div><div class="kpi-n c-${c}">${val}</div><div class="kpi-s">${esc(s)}</div><div class="meter"><i style="width:${Math.min(100, Math.max(0, m * 100))}%;background:var(--${c === "muted" ? "line" : c})"></i></div></div>`).join("");
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
  return (P.hasActual ? "" : noActual(v.ky)) + `<div class="g75">${card("Chi tiết theo mảng", "%đạt GMV theo mảng & nhóm khách", "vạch đen = 100% kế hoạch", hBullet(items, { max: 1.3 }))}${card("Cơ cấu", "GMV và margin đến từ đâu", "kỳ " + esc(v.ky), mix)}</div>
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
  return (P.hasActual ? "" : noActual(v.ky)) + `<div class="g75">${card("Số lượng khách hàng", "%đạt số khách theo nhóm N1–N5", "vạch = 100% · KH active = có GMV trong kỳ", hBullet(items, { max: 1.3 }))}${card("Cơ cấu GMV Mobility", "GMV theo nhóm N2–N5", "kỳ " + esc(v.ky), mix)}</div>
   <div class="g2">${card("Tiến độ", "Số khách active theo nhóm", "vạch = tổng kế hoạch", stack)}${card("Giữ chân Top 200", "Biến động GMV so với tháng trước (N2, N4)", "đỏ = giảm quá 30%", mv)}</div>
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
  return card("Kế hoạch nguồn tiền", "Thu – chi – số dư theo nửa tháng", "tỷ VND", top) +
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
  return `<div class="g57">${card("Tổng quan", "Công nợ phải thu theo tuổi nợ", "tại " + fmtDate(A.asOf), sum1)}${card("Tiến độ thu tiền", "Đường cong thu tiền theo kỳ nợ", "% đã thu lũy kế", curve)}</div>
   <div class="g75">${card("Tuổi nợ theo ngày đến hạn", "Dư nợ theo khách hàng", "tỷ VND · lớn nhất trước", cust)}${card("Ảnh hưởng hoa hồng PM", "Tỷ lệ thu đúng hạn theo nhóm", `vạch = ngưỡng ${pc(th, 0)}`, on)}</div>
   ${details("Xem bảng tuổi nợ chi tiết", tbl)}`;
}

/* ---------- 6. Công nợ phải trả ---------- */
function ap(v: VM): string {
  const { B, A } = v;
  if (!v.C.D.ap.length) return `<div class="card notice">Chưa có sheet CONG_NO_PHAI_TRA. Upload ở tab <a href="#" data-go="data">Dữ liệu</a>.</div>`;
  const NC: Record<string, string> = { Flight: "accent", Hotel: "info", Mobility: "stable", SaaS: "high", "F&B": "ink-3", Khác: "neutral-bar" };
  const s1 = `<div class="stat-row">${stat("Quá hạn", ty(B.od), B.od ? "high" : "")}${stat("Đến hạn ≤ 15 ngày", ty(B.d7 + B.d15))}${stat("Term HĐ bq", ok(B.wTerm) ? N1.format(B.wTerm) + " ngày" : "—")}</div>` +
    donut(Object.entries(B.byN).filter((e) => e[1] > 0).map(([k, x]): [number, string, string] => [x, NC[k] || "ink-3", k]), tyN(B.out) + " tỷ", "tổng phải trả", { ft: ty });
  const parts = (r: { od: number; d7: number; d15: number; d30: number; later: number }): [number, string, string][] => [[r.od, "critical", "Quá hạn"], [r.d7, "high", "≤ 7 ngày"], [r.d15, "watch", "8–15 ngày"], [r.d30, "stable", "16–30 ngày"], [r.later, "neutral-bar", "> 30 ngày"]];
  const stack = hStack(B.rows.filter((r) => r.out > 0).slice(0, 15).map((r) => ({ l: r.ten, sub: r.nganh, parts: parts(r), txt: tyN(r.out) })), { ft: tr, legend: [["Quá hạn", "critical"], ["≤ 7 ngày", "high"], ["8–15 ngày", "watch"], ["16–30 ngày", "stable"], ["> 30 ngày", "neutral-bar"]] });
  const term = hBullet(B.rows.filter((r) => ok(r.dpo)).map((r) => { const d = r.dpo as number, t = r.term; const c = t != null && d < t - 4 ? "watch" : t != null && d > t ? "high" : "stable"; return { l: r.ten, sub: r.nganh, v: d, t, c, txt: n0(d) + " ngày", txt2: t == null ? "chưa có term HĐ" : d < t - 4 ? `trả sớm ${n0(t - d)} ngày` : `HĐ ${t} ngày`, vc: c }; }), { max: Math.max(50, ...B.rows.map((r) => Math.max(r.dpo || 0, r.term || 0))) * 1.05 }) + legend([["Trả sớm hơn HĐ > 4 ngày", "watch"], ["Đúng lịch", "stable"], ["Trễ hạn", "high"], ["Term hợp đồng", "ink", 1, true]]);
  const flt = barChart({ labels: ["DSO — thu tiền khách", "DPO — trả tiền NCC", "Float = DPO − DSO"], series: [{ name: "Số ngày", c: "accent", vals: [A.dso, B.wDpo, B.float], cf: (x, j) => (j === 2 ? (x < 0 ? "critical" : "stable") : j === 0 ? "high" : "accent") }], showVal: true, fv: (x) => N1.format(x), ft: (x) => N1.format(x) + " ngày", h: 230, noLegend: true, bw: 60 }) +
    `<div class="small">${ok(B.float) ? (B.float < 0 ? `Float âm ${N1.format(-B.float)} ngày: công ty trả NCC nhanh hơn thu tiền khách — đang tự ứng vốn lưu động.` : "Float dương: NCC đang tài trợ vốn lưu động.") : "Cần cả AR (DSO) và AP đã thanh toán (DPO) để tính."}</div>`;
  const tbl = `<table><thead><tr><th>Nhà cung cấp (triệu VND)</th><th>Ngành</th><th class="r">Term HĐ</th><th class="r">DPO</th><th class="r">Quá hạn</th><th class="r">≤ 7</th><th class="r">8–15</th><th class="r">16–30</th><th class="r">> 30</th><th class="r">Tổng</th></tr></thead><tbody>${B.rows.map((r) => `<tr><td>${esc(r.ten)}</td><td>${esc(r.nganh)}</td><td class="r num">${r.term ?? "—"}</td><td class="r num">${ok(r.dpo) ? n0(r.dpo) : "—"}</td><td class="r num">${n0(r.od / 1e6)}</td><td class="r num">${n0(r.d7 / 1e6)}</td><td class="r num">${n0(r.d15 / 1e6)}</td><td class="r num">${n0(r.d30 / 1e6)}</td><td class="r num">${n0(r.later / 1e6)}</td><td class="r num">${n0(r.out / 1e6)}</td></tr>`).join("")}</tbody></table>`;
  return `<div class="g57">${card("Tổng quan", "Công nợ phải trả theo ngành", "tại " + fmtDate(v.C.asOf), s1)}${card("Lịch trả", "Số tiền đến hạn theo nhà cung cấp", "tỷ VND", stack)}</div>
   <div class="g2">${card("Kỳ hạn thực hưởng", "DPO thực tế so với payment term hợp đồng", "vạch = term HĐ", term)}${card("Vốn lưu động", "Ai đang tài trợ ai?", "ngày", flt)}</div>${details("Xem bảng công nợ phải trả chi tiết", tbl)}`;
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
  return `<div class="g57">${card("Áp dụng PM & Sales", "Đường hệ số bậc thưởng", ok(P.x) ? `nấc <b class="num">${tierIdx(P.x) + 1}/7</b>` : "chưa có kế hoạch", tierChart(P.x, P.H, TIERS, tier))}${card("Hình thành & phân bổ quỹ", "Quỹ hoa hồng theo trục", "triệu VND", poolHTML)}</div>
   <div class="g2">${card("Team PM", "Hoa hồng theo người", "triệu VND", pmHTML)}${card("Team Sales", "Thu nhập theo nguồn", "triệu VND", salesHTML)}</div>
   <div class="g2">${card("Team Partnership", "%đạt từng chỉ tiêu & điểm KPI", `target PT Travel ${num(D, "target_pt_travel")} ngày`, partHTML)}${card("Team Sales", "Hợp đồng mới — tiến độ đạt ngưỡng", "vạch = ngưỡng", conHTML)}</div>
   <div class="card"><details><summary>Xem công thức & bảng hoa hồng</summary><div class="formula" style="margin-top:10px">${formula}</div><div class="tw" style="margin-top:14px">${tbl}</div></details></div>`;
}

/* ---------- 8. Cảnh báo ---------- */
function alertsView(v: VM): string {
  const AL = v.AL;
  const areas = Array.from(new Set(AL.map((a) => a.area)));
  const chart = areas.length ? hStack(areas.map((ar) => { const f = (s: string) => AL.filter((a) => a.area === ar && a.sev === s).length; return { l: ar, parts: [[f("critical"), "critical", "Khẩn"], [f("high"), "high", "Cao"], [f("watch"), "watch", "Theo dõi"]] as [number, string, string][], txt: String(AL.filter((a) => a.area === ar).length) }; }).sort((a, b) => +b.txt - +a.txt), { ft: (x) => x + " cảnh báo", legend: [["Khẩn", "critical"], ["Cao", "high"], ["Theo dõi", "watch"]] }) : empty("Không có cảnh báo");
  return `<div class="g57">${card("Phân bố", "Cảnh báo theo lĩnh vực", `${AL.length} cảnh báo · kỳ ${esc(v.ky)}`, chart)}${card("Rule engine", "Cảnh báo & hành động gợi ý", "", alertHTML(AL))}</div>`;
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
