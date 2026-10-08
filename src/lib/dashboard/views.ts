// Nội dung các tab (trừ tab Dữ liệu) — dựng HTML từ kết quả tính toán ở calc.ts
import { Ctx, Period, AR, AP, Cash, Alert, AR_BUCKETS, TIERS, tier, tierIdx, AXIS_NAME, Axis, num, hasActual,
  CustRow, GroupBlock, ArCust, ApSup, CashDetail, PaySchedule, drill, MANUAL_LINES, MANUAL_TARGETS, CASH_IN, CASH_OUT, CASH_SIGNED,
  calcPeriod, calcAR, calcAP, calcCash, alerts, customerRows, customersByGroup, arByCustomer, apBySupplier, cashDetail, paySchedule,
  WhyBlock, cashDir, onTimeByGroup, Seg, SEG_NAME, SEG_DV, SEG_GROUPS, segCtx, segComm, SegComm } from "./calc";
import { barChart, lineChart, waterfall, hBullet, hStack, divBars, donut, tierChart, legend, pill, stCls, xC, empty, LegendItem, pairBars, scatter, spark } from "./charts";
import { esc, ty, tyN, tr, trN, n0, pc, sum, ok, N1, N2, kyShort, fmtDate, kyIdx, days, unit, unitLabel, axisNum, exact, leVua, tyLe, kyAdd, kyOfDate, kyEnd } from "./util";
import type { AlertAction, DataSet } from "./types";
import { trendData, customerProfit, ltvCac, cashForecast, explain, gmvBridge, whyOnTime, custMonth, monthsBetween, periodOf, Gran, Trend, TrendBucket, Profitability, CustProfit, Forecast, GROUPS } from "./insight";

/** Lựa chọn của người xem trên các tab mới — giữ ở page.tsx, truyền vào khi dựng HTML */
export interface ViewState {
  tFrom?: string; tTo?: string; gran?: Gran;      // tab Xu hướng
  cpG?: string;                                     // lọc nhóm ở bảng lợi nhuận theo khách
  rate?: number | null; fcScn?: string;             // kịch bản dự báo dòng tiền
}
export interface VM {
  C: Ctx; P: Period; A: AR; B: AP; CS: Cash; AL: Alert[]; ky: string;
  CR: CustRow[]; GB: GroupBlock[]; ARC: ArCust[]; APS: ApSup[]; CD: CashDetail; PS: PaySchedule;
  AA: Record<string, AlertAction>;
  canEdit: boolean;
  st: ViewState;
  /** Đang xem một mảng (Travel & SaaS / Mobility); không có = toàn công ty */
  seg?: Seg;
  /** Ngữ cảnh và kỳ của TOÀN CÔNG TY — dùng cho hoa hồng, số nhập tay, lợi nhuận theo khách */
  Cc: Ctx; Pc: Period;
  /** Hoa hồng thuộc về mảng đang xem */
  sc?: SegComm;
}
/** Định dạng tiền tự thêm số lẻ khi số nhỏ so với đơn vị đang chọn */
const tien = (x: number) => { const v = x || 0; return `${tyLe(v, leVua(v))} ${unit().nhan}`; };
const F = { tien, pc };

/** Dựng toàn bộ số liệu cho một kỳ — dùng chung cho trang và cho kiểm thử */
export function buildVM(C: Ctx, ky: string, data: DataSet | null, st: ViewState = {}, opt: { seg?: Seg; Cc?: Ctx } = {}): VM {
  const seg = opt.seg, Cc = opt.Cc || C;
  const Pc = periodOf(Cc, ky);
  let P = seg ? calcPeriod(C, ky) : Pc;
  let sc: SegComm | undefined;
  if (seg) {
    // Hoa hồng của mảng lấy từ bảng toàn công ty (hệ số bậc thưởng tính trên %đạt toàn công ty)
    sc = segComm(Cc, Pc, seg);
    const ebitda = ok(P.opexOp) ? P.gp - sc.total - (P.opexOp as number) : null;
    P = { ...P, comm: sc.total, ebitda, netProfit: ok(ebitda) && P.belowAmt ? ebitda - P.belowAmt : null };
  }
  const A = calcAR(C), B = calcAP(C, A.dso), CS = calcCash(C);
  const CR = customerRows(C, ky), ARC = arByCustomer(C);
  const AA: Record<string, AlertAction> = {};
  (data?.alertActions || []).forEach((x) => { AA[x.id] = x; });
  const scope = seg ? "mảng " + SEG_NAME[seg] : "tổng công ty";
  const AL = explain(C, P, alerts(C, P, A, B, CS, { ty, pc, tien }, { CR, ARC, scope }), F, scope);
  return {
    C, P, A, B, CS, AL, ky, CR, GB: customersByGroup(C, ky, CR), ARC, APS: apBySupplier(C),
    CD: cashDetail(C), PS: paySchedule(Cc, ky, Pc), AA, canEdit: !!data?.me?.canEdit, st, seg, Cc, Pc, sc,
  };
}
/** Các trục (mảng con) hiển thị trong phần đang xem */
const segAxes = (v: VM): Axis[] => (v.seg === "ts" ? ["T", "S", "F"] : v.seg === "m" ? ["M", "S"] : ["T", "M", "S", "F"]);
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
/** "tại 08/10/2026" — kèm ngày chốt số liệu nếu file có khai và khác hôm nay */
const asOfTxt = (C: Ctx) => `tại ${fmtDate(C.asOf)}` + (C.chotFile && C.chotFile !== C.asOf ? ` · số liệu chốt ${fmtDate(C.chotFile)}` : "");
const arrow = (d: number | null) => (d == null ? "" : (d > 0 ? "tăng " : "giảm ") + pc(Math.abs(d), 0));
const nameOf = (r: { ten: string }) => r.ten;

const noActual = (ky: string) => `<div class="card notice">Kỳ ${esc(ky)} chưa có số liệu GMV thực tế. Upload sheet GMV cho kỳ này ở tab <a href="#" data-go="data">Dữ liệu</a>.</div>`;

/* ---------- KPI strip ---------- */
export function kpiStrip(v: VM): string {
  if (v.seg) return segStrip(v);
  const { P, A, CS } = v;
  const cTot = sum(P.cust.groups, (g) => g.act), cTgt = sum(P.cust.groups, (g) => g.tgt || 0);
  const lastBal = CS.halves.filter((h) => h.h.startsWith(v.ky)).slice(-1)[0]?.bal ?? CS.halves.slice(-1)[0]?.bal ?? null;
  // [nhãn, giá trị, phụ đề, mức thước đo, màu trạng thái, tab khi bấm, icon RemixIcon]
  const k: [string, string, string, number, string, string, string][] = [
    ["GMV kỳ", ty(P.totAct), P.totTgt ? `${pc(P.x)} của ${ty(P.totTgt)} kế hoạch` : "chưa có kế hoạch", P.x ?? 0, stCls(P.x), "home", "ri-shopping-bag-3-line"],
    ["Margin net", ty(P.gp), P.mgTgtTot ? `${pc(P.gp / P.mgTgtTot)} kế hoạch · ${pc(P.totAct ? P.gp / P.totAct : null, 2)} GMV` : "", P.mgTgtTot ? P.gp / P.mgTgtTot : 0, stCls(P.mgTgtTot ? P.gp / P.mgTgtTot : null), "home", "ri-percent-line"],
    ["EBITDA", ok(P.ebitda) ? ty(P.ebitda) : "—", ok(P.ebitda) ? `${pc(P.gp ? P.ebitda / P.gp : null)} trên margin net` : "chưa có sheet CHI_PHI kỳ này", ok(P.ebitda) && P.gp ? Math.max(0, P.ebitda / P.gp) : 0, ok(P.ebitda) ? (P.ebitda < 0 ? "critical" : "stable") : "muted", "ts:opex", "ri-funds-line"],
    ["Tiền cuối kỳ (dự kiến)", CS.hasOpen && ok(lastBal) ? ty(lastBal) : "—", CS.hasOpen ? `đầu kỳ ${ty(CS.open)}` : "chưa nhập số dư đầu kỳ (THAM_SO)", CS.hasOpen && ok(lastBal) && CS.open ? Math.min(1, Math.max(0, lastBal / CS.open)) : 0, CS.hasOpen && ok(lastBal) ? (lastBal < 0 ? "critical" : "stable") : "muted", "cash", "ri-wallet-3-line"],
    ["Nợ phải thu quá hạn", A.tot ? pc(A.od / A.tot) : "—", A.tot ? `${ty(A.od)} / ${ty(A.tot)} · DSO ${ok(A.dso) ? n0(A.dso) + " ngày" : "—"}` : "chưa có sổ công nợ", A.tot ? A.od / A.tot : 0, !A.tot ? "muted" : A.od / A.tot > 0.4 ? "critical" : A.od / A.tot > 0.25 ? "high" : "stable", "home", "ri-time-line"],
    ["Khách hàng active", n0(cTot), cTgt ? `của ${n0(cTgt)} kế hoạch` : "", cTgt ? cTot / cTgt : 0, stCls(cTgt ? cTot / cTgt : null), "home", "ri-group-line"],
  ];
  return kpiTiles(k);
}
type Tile = [string, string, string, number, string, string, string];
const kpiTiles = (k: Tile[]) => k.map(([l, val, s, m, c, go, ic]) => `<div class="kpi" data-go="${go}" tabindex="0" role="button"><div class="kpi-l"><i class="${ic}" aria-hidden="true"></i>${esc(l)}</div><div class="kpi-n c-${c}">${val}</div><div class="kpi-s">${esc(s)}</div><div class="meter"><i style="width:${Math.min(100, Math.max(0, m * 100))}%;background:var(--${c === "muted" ? "line" : c})"></i></div></div>`).join("");

/** Tỷ lệ thu đúng hạn gộp các nhóm của một mảng, theo giá trị — lấy kỳ nợ gần nhất đã có
 *  khoản đến hạn (kỳ đang xem thường chưa đến hạn nên chưa đánh giá được) */
function onTimeLatest(C: Ctx, ky: string, seg?: Seg): { rate: number | null; ky: string } {
  const gs = seg ? SEG_GROUPS[seg] : ["N1", "N2", "N3", "N4", "N5"];
  for (let i = 0; i < 4; i++) {
    const k = kyAdd(ky, -i);
    const o = onTimeByGroup(C, k);
    const os = gs.map((g) => o[g]).filter((x) => x && ok(x.rate));
    const judged = sum(os, (x) => x.billed - x.notDue);
    if (judged > 0) return { rate: sum(os, (x) => x.onTime) / judged, ky: k };
  }
  return { rate: null, ky };
}
function segOnTime(v: VM): number | null { return onTimeLatest(v.Cc, v.ky, v.seg).rate; }
function segStrip(v: VM): string {
  const { P, A, sc } = v;
  const ts = v.seg === "ts";
  const cTot = sum(P.cust.groups, (g) => g.act), cTgt = sum(P.cust.groups, (g) => g.tgt || 0);
  const otL = onTimeLatest(v.Cc, v.ky, v.seg), ot = otL.rate, th = num(v.C.D, "nguong_dung_han");
  const after = P.gp - (sc?.total || 0);
  const k: Tile[] = [
    ["GMV kỳ", ty(P.totAct), P.totTgt ? `${pc(P.x)} của ${ty(P.totTgt)} kế hoạch` : "chưa có kế hoạch", P.x ?? 0, stCls(P.x), "revenue", "ri-shopping-bag-3-line"],
    ["Margin net", ty(P.gp), `${pc(P.totAct ? P.gp / P.totAct : null, 2)} GMV` + (P.mgTgtTot ? ` · ${pc(P.gp / P.mgTgtTot)} kế hoạch` : ""), P.mgTgtTot ? P.gp / P.mgTgtTot : 0, stCls(P.mgTgtTot ? P.gp / P.mgTgtTot : null), "revenue", "ri-percent-line"],
    ts
      ? ["EBITDA mảng", ok(P.ebitda) ? ty(P.ebitda) : "—", ok(P.ebitda) ? `sau hoa hồng ${ty(sc?.total || 0)} và chi phí ${ty(P.opexOp as number)}` : "chưa có sheet CHI_PHI kỳ này", ok(P.ebitda) && P.gp ? Math.max(0, (P.ebitda as number) / P.gp) : 0, ok(P.ebitda) ? ((P.ebitda as number) < 0 ? "critical" : "stable") : "muted", "opex", "ri-funds-line"]
      : ["Margin sau hoa hồng", ty(after), `hoa hồng ${ty(sc?.total || 0)} · chưa có chi phí riêng`, P.gp ? Math.max(0, after / P.gp) : 0, after < 0 ? "critical" : "stable", "kpiseg", "ri-funds-line"],
    ["Thu đúng hạn kỳ " + kyShort(otL.ky), ok(ot) ? pc(ot, 0) : "—", ok(ot) ? `ngưỡng ${pc(th, 0)} · kỳ nợ ${otL.ky}` : "chưa có khoản nào đến hạn", ot ?? 0, !ok(ot) ? "muted" : (ot as number) >= th ? "stable" : (ot as number) >= 0.7 ? "high" : "critical", "ar", "ri-calendar-check-line"],
    ["Nợ phải thu quá hạn", A.tot ? pc(A.od / A.tot) : "—", A.tot ? `${ty(A.od)} / ${ty(A.tot)} · DSO ${ok(A.dso) ? n0(A.dso) + " ngày" : "—"}` : "chưa có sổ công nợ", A.tot ? A.od / A.tot : 0, !A.tot ? "muted" : A.od / A.tot > 0.4 ? "critical" : A.od / A.tot > 0.25 ? "high" : "stable", "ar", "ri-time-line"],
    ["Khách hàng active", n0(cTot), cTgt ? `của ${n0(cTgt)} kế hoạch` : "", cTgt ? cTot / cTgt : 0, stCls(cTgt ? cTot / cTgt : null), "customers", "ri-group-line"],
  ];
  return kpiTiles(k);
}

/* ---------- Cảnh báo ---------- */
export function alertHTML(list: Alert[]): string {
  if (!list.length) return empty("Không có cảnh báo nào.");
  const lab = { critical: "Khẩn", high: "Cao", watch: "Theo dõi" };
  return list.map((a) => `<div class="alert ${a.sev}">${pill(lab[a.sev], a.sev)}<div><div class="msg">${esc(a.msg)}</div><div class="act">→ ${esc(a.act)}</div>${whyHTML(a.why)}</div><div class="own">${esc(a.area)}<br>${esc(a.own)}</div></div>`).join("");
}

/* ---------- Phân tích nguyên nhân: "Vì sao?" ---------- */
const WHY_C: Record<string, string> = { stable: "stable", high: "high", critical: "critical", watch: "watch" };
function whyBars(bars: NonNullable<WhyBlock["items"][number]["bars"]>): string {
  const max = Math.max(...bars.map((b) => Math.abs(b.v)), 1);
  return hBullet(bars.map((b) => ({ l: b.l, sub: b.sub, v: Math.abs(b.v), txt: b.txt, c: (b.c && WHY_C[b.c]) || "accent" })), { max: max * 1.05 });
}
export function whyBody(w: WhyBlock): string {
  return `<p class="why-lead">${esc(w.lead)}</p>` + w.items.map((it) => `<div class="why-i ${it.sev || ""}"><div class="why-t">${esc(it.t)}</div>${it.bars?.length ? whyBars(it.bars) : ""}</div>`).join("");
}
function whyHTML(w?: WhyBlock, open = false): string {
  if (!w || (!w.items.length && !w.lead)) return "";
  return `<details class="why"${open ? " open" : ""}><summary><i class="ri-search-eye-line" aria-hidden="true"></i>Vì sao?</summary><div class="why-b">${whyBody(w)}</div></details>`;
}

/* ---------- 2. Doanh thu & Margin ---------- */
function revenue(v: VM): string {
  const { P, C } = v;
  if (!P.hasActual && !P.hasTarget) return noActual(v.ky) + quickRevenue(v);
  const agg = (a: Axis) => { const rs = P.lines.filter((l) => l.axis === a); return { rs, tgt: sum(rs, (l) => l.tgt), act: sum(rs, (l) => l.act), mgNet: sum(rs, (l) => l.mgNet), mgGross: sum(rs, (l) => l.mgGross), mgT: sum(rs, (l) => l.mgT) }; };
  const items: Parameters<typeof hBullet>[0] = [];
  const AXS = segAxes(v).filter((a) => agg(a).act || agg(a).tgt);
  AXS.forEach((a) => {
    const g = agg(a);
    if (g.tgt > 0) { const x = g.act / g.tgt; items.push({ l: AXIS_NAME[a], v: x, t: 1, c: xC(x), txt: pc(x, 0), txt2: `${tyN(g.act)} / ${tyN(g.tgt)} ${unit().nhan}`, vc: stCls(x), bold: true, dr: `axis:${a}` }); }
    else items.push({ l: AXIS_NAME[a], v: 0, txt: g.act ? ty(g.act) : "—", txt2: "chưa có kế hoạch", bold: true, dr: `axis:${a}` });
    if (g.rs.length > 1) g.rs.forEach((l) => { if (!l.tgt) return; const x = l.act / l.tgt; items.push({ l: "   " + l.name, v: x, t: 1, c: xC(x), txt: pc(x, 0), txt2: `${tyN(l.act)} / ${tyN(l.tgt)}`, vc: stCls(x), dr: `line:${l.k}` }); });
  });
  if (P.totTgt) items.push({ l: v.seg ? "Tổng " + SEG_NAME[v.seg] : "Tổng công ty", v: P.x, t: 1, c: xC(P.x), txt: pc(P.x, 0), txt2: `${tyN(P.totAct)} / ${tyN(P.totTgt)} ${unit().nhan}`, vc: stCls(P.x), bold: true });
  const gm = AXS.map((a) => ({ a, n: AXIS_NAME[a], g: agg(a).act, m: agg(a).mgNet, mT: agg(a).mgT }));
  // Trong một mảng: chia theo dòng dịch vụ / nhóm khách; toàn công ty: chia theo mảng
  const LC_ = ["cyan", "purple", "blue", "orange", "green", "yellow"].map((h) => `color-display-${h}-default`);
  const parts = v.seg
    ? P.lines.filter((l) => l.act || l.mgNet).map((l, i) => ({ g: l.act, m: l.mgNet, c: l.grp ? GC[l.grp] : LC_[i % LC_.length], n: l.name, dg: `line:${l.k}`, dm: `mgline:${l.k}` }))
    : gm.map((x) => ({ g: x.g, m: x.m, c: AXC[x.a], n: x.n, dg: `axis:${x.a}`, dm: `mgaxis:${x.a}` }));
  const mix = `<div class="small" style="margin-bottom:4px">GMV</div>` + donut(parts.map((x): [number, string, string, string] => [x.g, x.c, x.n, x.dg]), ty(P.totAct), "GMV", { ft: ty, size: 130 }) +
    `<div class="small" style="margin:12px 0 4px">Margin net</div>` + donut(parts.map((x): [number, string, string, string] => [x.m, x.c, x.n, x.dm]), ty(P.gp), "margin net", { ft: ty, size: 130 });
  // xu hướng
  const idx = kyIdx(v.ky), trend = C.periods.filter((p) => kyIdx(p) <= idx + 3).slice(-7);
  const axAct = (p: string, a: Axis) => { if (!hasActual(C, p) || kyIdx(p) > idx) return null; return sum(C.D.gmv.filter((r) => r.ky === p), (r) => (lineAxis(C, r) === a ? r.gmv : 0)) / unit().chia; };
  const axTgt = (p: string, keys: (keyof import("./types").Target)[]) => { const T = C.D.targets.find((t) => t.ky === p); return T ? sum(keys, (k) => Number(T[k] || 0)) / unit().chia || null : null; };
  const trSeries = [
    { ax: "T" as Axis, name: "Travel", c: "accent", keys: ["gmv_hotel", "gmv_flight"] as (keyof import("./types").Target)[] },
    { ax: "M" as Axis, name: "Mobility", c: "stable", keys: ["gmv_n2", "gmv_n3", "gmv_n4", "gmv_n5"] as (keyof import("./types").Target)[] },
    { ax: "S" as Axis, name: "SaaS", c: "info", keys: (v.seg === "m" ? ["gmv_saas_m"] : v.seg === "ts" ? ["gmv_saas_t"] : ["gmv_saas_t", "gmv_saas_m"]) as (keyof import("./types").Target)[] },
  ].filter((x) => AXS.includes(x.ax) && (v.seg || x.ax !== "S"));
  const trendHTML = trend.length ? lineChart({ labels: trend.map(kyShort), series: trSeries.flatMap((x) => [
    { name: `${x.name} thực tế`, c: x.c, vals: trend.map((p) => axAct(p, x.ax)) },
    { name: `${x.name} kế hoạch`, c: x.c, vals: trend.map((p) => axTgt(p, x.keys)), dash: true, nodot: true, w: 1.5 },
  ]), ft: (x) => axisNum(x) + " " + unit().nhan, fy: axisNum }) : empty("Chưa có dữ liệu");
  const gross = P.travelMg + P.mobGross + P.saasMg + P.fnbMg;
  const wf = ok(P.opexOp) ? waterfall([{ l: "Margin gross", v: gross, kind: "total" }, ...(P.disc ? [{ l: "Chiết khấu KH Mobility", v: -P.disc }] : []), { l: "Hoa hồng các team", v: -P.comm }, { l: "Chi phí vận hành", v: -(P.opexOp as number) }, { l: "EBITDA", v: P.ebitda as number, kind: "total" }])
    : v.seg === "m" ? waterfall([{ l: "Margin gross", v: gross, kind: "total" }, { l: "Chiết khấu KH Mobility", v: -P.disc }, { l: "Hoa hồng các team", v: -P.comm }, { l: "Margin sau hoa hồng", v: gross - P.disc - P.comm, kind: "total" }]) + `<div class="small">Chi phí vận hành chưa tách riêng cho Mobility nên dừng ở margin sau hoa hồng.</div>`
    : empty("Chưa có sheet CHI_PHI cho kỳ này — cần để tính EBITDA");
  const mv = gm.map((x) => x.m);
  const mgAmt = barChart({ labels: gm.map((x) => x.n + (x.a === "M" ? " (net)" : "")), series: [{ name: "Margin thực tế", c: "accent", vals: mv, cf: (x, j) => (gm[j].mT ? xC(x / gm[j].mT) : "ink-3") }], targets: gm.map((x) => x.mT || null), drills: gm.map((x) => `mgaxis:${x.a}`), showVal: true, fv: (x) => tyN(x), ft: tr, fy: (x) => tyN(x), h: 240, noLegend: true }) + legend([["≥ 100%", "stable"], ["90–100%", "watch"], ["70–90%", "high"], ["< 70%", "critical"], ["Kế hoạch", "ink", 1, true]]);
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
  const row = (n: string, tgt: number, act: number, mT: number | null, mA: number | null, mgv: number, dv: number | null, cls = "") => `<tr class="${cls}"><td>${esc(n)}</td><td class="r num">${tyN(tgt)}</td><td class="r num">${tyN(act)}</td><td class="r num c-${stCls(tgt ? act / tgt : null)}">${pc(tgt ? act / tgt : null)}</td><td class="r num">${pc(mT)}</td><td class="r num">${pc(mA, 2)}</td><td class="r num">${tyN(mgv)}</td><td class="r num ${ok(dv) && dv < 0 ? "c-critical" : ""}">${ok(dv) ? tyN(dv) : "—"}</td></tr>`;
  let tbl = `<table><thead><tr><th>Mảng / nhóm (${unitLabel()})</th><th class="r">GMV KH</th><th class="r">GMV TT</th><th class="r">%đạt</th><th class="r">%Margin KH</th><th class="r">%Margin TT</th><th class="r">Margin net TT</th><th class="r">Chênh lệch margin</th></tr></thead><tbody>`;
  AXS.forEach((a) => { const g = agg(a); tbl += row(AXIS_NAME[a], g.tgt, g.act, null, g.act ? g.mgGross / g.act : null, g.mgNet, g.mgT ? g.mgNet - g.mgT : null, "tot"); g.rs.forEach((l) => { tbl += row(l.name, l.tgt, l.act, l.mT, l.act ? l.mgGross / l.act : null, l.mgNet, l.tgt ? l.mgNet - l.mgT : null, "sub"); }); });
  tbl += row(v.seg ? "Tổng " + SEG_NAME[v.seg] : "Tổng công ty", P.totTgt, P.totAct, null, P.totAct ? (P.travelMg + P.mobGross + P.saasMg + P.fnbMg) / P.totAct : null, P.gp, P.mgTgtTot ? P.gp - P.mgTgtTot : null, "tot") + `</tbody></table>`;
  const pl = (l: string, x: number | null, cls = "") => `<tr class="${cls}"><td>${esc(l)}</td><td class="r num">${ok(x) ? tyN(x) : "<span class='c-muted'>chưa có dữ liệu</span>"}</td><td class="r num">${ok(x) && P.totAct ? pc(x / P.totAct, 2) : ""}</td></tr>`;
  const opexLines = P.opexRows.filter((o) => !["Khấu hao", "Lãi vay", "Thuế TNDN"].includes(o.khoan_muc)).map((o) => pl("   (−) " + o.khoan_muc, -o.so_tien)).join("");
  const plTbl = `<table style="margin-top:16px"><thead><tr><th>P&L quản trị (${unitLabel()})</th><th class="r">Giá trị</th><th class="r">% GMV</th></tr></thead><tbody>${pl("GMV", P.totAct, "tot")}${pl("Margin gross", P.travelMg + P.mobGross + P.saasMg + P.fnbMg)}${pl("(−) Chiết khấu khách hàng", -P.disc)}${pl("Margin net", P.gp, "tot")}${pl("(−) Hoa hồng các team", -P.comm)}${opexLines}${pl("EBITDA", P.ebitda, "tot")}${pl("(−) Khấu hao, lãi vay, thuế", P.belowAmt ? -P.belowAmt : null)}${pl("Lợi nhuận ròng", P.netProfit, "tot")}</tbody></table>`;
  return (P.hasActual ? "" : noActual(v.ky)) + sumRevenue(v) + `<div class="g75">${card("Chi tiết theo mảng", "%đạt GMV theo mảng & nhóm khách", "vạch đen = 100% kế hoạch", hBullet(items, { max: 1.3 }))}${card("Cơ cấu", "GMV và margin đến từ đâu", "kỳ " + esc(v.ky), mix)}</div>
   ${custRevenueCards(v)}
   ${custContribCards(v)}
   <div class="g2">${card("Xu hướng", `GMV ${v.seg ? SEG_NAME[v.seg] : "Travel & Mobility"} theo tháng`, unitLabel() + ` · <a href="#" data-go="home">xem theo quý / năm</a>`, trendHTML)}${card(v.seg === "m" ? "Từ margin tới lợi nhuận" : "Từ margin tới EBITDA", "Waterfall lợi nhuận kỳ", unitLabel(), wf)}</div>
   <div class="g2">${card("Lợi nhuận gộp", "Margin theo mảng — thực tế và kế hoạch", unitLabel() + " · vạch = kế hoạch", mgAmt)}${card("Hiệu quả đàm phán NCC", "% Margin theo ngành so với target", "vạch đen = target", mgPct)}</div>
   ${details("Xem bảng số liệu chi tiết (GMV, margin, P&L)", tbl + plTbl)}
   ${quickRevenue(v)}`;
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
  const G = v.seg ? P.cust.groups.filter((g) => SEG_GROUPS[v.seg as Seg].includes(g.g)) : P.cust.groups;
  const items = G.map((g) => { const x = g.tgt ? g.act / g.tgt : null; return { l: `${g.g} — ${GNAME[g.g]}`, sub: P.cust.hasPrev ? `Δ ${g.d > 0 ? "+" : ""}${n0(g.d)} so với tháng trước` : "", v: x, t: 1, c: xC(x), txt: g.tgt ? pc(x, 0) : n0(g.act), txt2: g.tgt ? `${n0(g.act)} / ${n0(g.tgt)} KH` : "chưa có kế hoạch", vc: stCls(x), dr: `custcount:${g.g}` }; });
  const ta = sum(G, (g) => g.tgt || 0), aa = sum(G, (g) => g.act);
  if (ta) items.push({ l: "Tổng khách hàng", sub: "", v: aa / ta, t: 1, c: xC(aa / ta), txt: pc(aa / ta, 0), txt2: `${n0(aa)} / ${n0(ta)} KH`, vc: stCls(aa / ta), bold: true } as (typeof items)[number] & { bold: boolean });
  const mix = v.seg === "ts"
    ? donut(SEG_DV.ts.map((dv): [number, string, string, string] => [sum(v.CR, (r) => r.bySvc[dv] || 0), SVC_C[dv], dv, `svc:${dv}`]), ty(P.totAct), "GMV Travel & SaaS", { ft: ty })
    : donut(["N2", "N3", "N4", "N5"].map((g): [number, string, string, string] => [sum(P.lines.filter((l) => l.grp === g), (l) => l.act), GC[g], `${g} — ${GNAME[g]}`, `group:${g}`]), ty(P.mAct), "GMV Mobility", { ft: ty });
  const idx = kyIdx(v.ky), ps = C.periods.filter((p) => kyIdx(p) <= idx + 3).slice(-6);
  const countsFor = (p: string) => { const by = new Map<string, number>(); C.D.gmv.filter((r) => r.ky === p).forEach((r) => by.set(r.ma_kh, (by.get(r.ma_kh) || 0) + r.gmv)); return by; };
  const stackSeries = (v.seg ? SEG_GROUPS[v.seg] : ["N1", "N2", "N3", "N4", "N5"]).map((g) => ({ name: g, c: GC[g], vals: ps.map((p) => { if (kyIdx(p) > idx || !hasActual(C, p)) return null; const by = countsFor(p); return Array.from(by.entries()).filter(([k, x]) => x > 0 && C.cust.get(k)?.nhom === g).length; }) }));
  const tg = ps.map((p) => { const T = C.D.targets.find((t) => t.ky === p); const t = T ? (T.kh_n1 || 0) + (T.kh_n2 || 0) + (T.kh_n3 || 0) + (T.kh_n4 || 0) + (T.kh_n5 || 0) : 0; return t || null; });
  const stack = ps.length ? barChart({ labels: ps.map(kyShort), stack: true, showTot: true, series: stackSeries, targets: tg, tName: "Tổng kế hoạch", h: 260, bw: 44 }) : empty("Chưa có dữ liệu");
  const mv = divBars(P.cust.movers.map((m) => ({ l: m.ten, sub: `${m.g} · PM ${m.pm} · ${tr(m.a)} → ${tr(m.b)}`, v: m.d, c: m.d < -0.3 ? "critical" : m.d < 0 ? "high" : "stable", txt: (m.d > 0 ? "+" : "") + pc(m.d, 0), dr: `cust:${m.ma_kh}` })), 0.6);
  const tbl = `<table><thead><tr><th>Nhóm</th><th class="r">Kế hoạch</th><th class="r">Thực tế</th><th class="r">%đạt</th><th class="r">Δ tháng trước</th><th class="r">GMV nhóm (${unit().nhan})</th><th class="r">GMV / KH (${unit().nhan})</th></tr></thead><tbody>${G.map((g) => `<tr><td>${g.g} — ${GNAME[g.g]}</td><td class="r num">${n0(g.tgt)}</td><td class="r num">${n0(g.act)}</td><td class="r num">${pc(g.tgt ? g.act / g.tgt : null)}</td><td class="r num">${n0(g.d)}</td><td class="r num">${tyN(g.gmv)}</td><td class="r num">${g.act ? tyN(g.gmv / g.act) : "—"}</td></tr>`).join("")}</tbody></table>`;
  return (P.hasActual ? "" : noActual(v.ky)) + sumCustomers(v) + `<div class="g75">${card("Số lượng khách hàng", "%đạt số khách theo nhóm N1–N5", "vạch = 100% · KH active = có GMV trong kỳ", hBullet(items, { max: 1.3 }))}${v.seg === "ts" ? card("Cơ cấu GMV", "GMV theo dịch vụ", "kỳ " + esc(v.ky), mix) : card("Cơ cấu GMV Mobility", "GMV theo nhóm N2–N5", "kỳ " + esc(v.ky), mix)}</div>
   ${v.seg === "ts" ? card("Tiến độ", "Số khách active theo tháng", "vạch = kế hoạch", `<div class="chart-cap">${stack}</div>`) : `<div class="g2">${card("Tiến độ", "Số khách active theo nhóm", "vạch = tổng kế hoạch", stack)}${card("Giữ chân Top 200", "Biến động GMV so với tháng trước (N2, N4)", "đỏ = giảm quá 30%", mv)}</div>`}
   ${groupCustomerCards(v)}
   ${v.seg ? profitCards(v, companyProfit(v)) : ""}
   ${details("Xem bảng số liệu khách hàng", tbl)}`;
}
/** Lợi nhuận theo khách tính trên dữ liệu toàn công ty (hoa hồng, chi phí, DPO đều là số chung) */
function companyProfit(v: VM): Profitability {
  const A = calcAR(v.Cc);
  return customerProfit(v.Cc, v.ky, calcAP(v.Cc, A.dso));
}

/* ---------- 4. Dòng tiền ---------- */
function cash(v: VM): string {
  const { CS } = v;
  const fc = forecastCards(v, cashForecast(v.C, v.A, v.B, CS, 12, v.st.rate ?? null), true);
  if (!CS.halves.length) return `<div class="card notice">Chưa có sheet DONG_TIEN. Upload ở tab <a href="#" data-go="data">Dữ liệu</a>, hoặc nhập thẳng số tổng theo nửa tháng ngay bên dưới.</div>` + cashCustCards(v) + cashDetailCards(v) + quickCash(v);
  // nhãn gọn: bỏ năm khi mọi kỳ cùng năm, để chữ không bị cắt ở mép phải
  const nams = Array.from(new Set(CS.halves.map((h) => h.h.slice(4, 9))));
  const labels = CS.halves.map((h) => (nams.length === 1 ? h.h.slice(0, 3) + " " + h.h.slice(10) : h.h.replace("-", " ")));
  // Card này chiếm hết chiều rộng trang nên biểu đồ phải tự giới hạn bề ngang,
  // nếu không SVG bị phóng to gấp đôi và tràn màn hình.
  const W = labels.length > 10 ? 1180 : labels.length > 6 ? 900 : 760;
  const top = barChart({ labels, series: [{ name: "Tổng thu", c: "stable", vals: CS.halves.map((h) => h.thu / unit().chia) }, { name: "Tổng chi", c: "critical", vals: CS.halves.map((h) => h.chi / unit().chia), op: 0.7 }], ft: (x) => axisNum(x) + " " + unit().nhan, fy: axisNum, h: 250, W, bw: 34 }) +
    (CS.hasOpen ? lineChart({ labels, series: [{ name: "Số dư cuối kỳ", c: "accent", vals: CS.halves.map((h) => h.bal / unit().chia) }], ft: (x) => axisNum(x) + " " + unit().nhan, fy: axisNum, h: 170, W }) : `<div class="small">Nhập số dư đầu kỳ (THAM_SO → so_du_tien_dau_ky) để xem đường số dư.</div>`) +
    `<div class="small">Kỳ có thực hiện dùng số thực hiện; kỳ chưa có dùng số kế hoạch.</div>`;
  const net = barChart({ labels, series: [{ name: "Dòng tiền ròng", c: "stable", vals: CS.halves.map((h) => h.net / unit().chia), cf: (x) => (x < 0 ? "critical" : "stable") }], showVal: true, fv: axisNum, ft: (x) => axisNum(x) + " " + unit().nhan, fy: axisNum, h: 240, noLegend: true }) + legend([["Dương", "stable"], ["Âm", "critical"]]);
  const lastAct = CS.halves.filter((h) => h.hasAct).slice(-1)[0];
  const pva = lastAct ? hBullet(lastAct.rows.filter((r) => r.ke_hoach || r.thuc_hien).map((r) => { const a = r.thuc_hien || 0, p = r.ke_hoach || 0; return { l: r.khoan_muc, v: Math.abs(a), t: Math.abs(p), c: r.khoan_muc.startsWith("Thu") ? "stable" : "critical", txt: tr(a), txt2: p ? `KH ${tr(p)} · ${pc(a / p, 0)}` : "không có KH" }; })) : empty("Chưa có kỳ nào nhập số thực hiện");
  const cats = Array.from(new Set(CS.halves.flatMap((h) => h.rows.map((r) => r.khoan_muc))));
  const tbl = `<table><thead><tr><th>Khoản mục (${unitLabel()})</th>${CS.halves.map((h) => `<th class="r">${h.h}${h.hasAct ? " · TH" : " · KH"}</th>`).join("")}</tr></thead><tbody>${cats.map((c) => `<tr><td>${esc(c)}</td>${CS.halves.map((h) => { const r = h.rows.find((x) => x.khoan_muc === c); if (!r) return `<td class="r c-muted">–</td>`; return h.hasAct ? `<td class="r"><span class="num">${tyN((r.thuc_hien || 0))}</span><div class="t2">KH ${tyN((r.ke_hoach || 0))}</div></td>` : `<td class="r num c-muted">${tyN((r.ke_hoach || 0))}</td>`; }).join("")}</tr>`).join("")}
   <tr class="tot"><td>Dòng tiền ròng</td>${CS.halves.map((h) => `<td class="r num">${tyN(h.net)}</td>`).join("")}</tr>${CS.hasOpen ? `<tr class="tot"><td>Số dư cuối kỳ</td>${CS.halves.map((h) => `<td class="r num">${tyN(h.bal)}</td>`).join("")}</tr>` : ""}</tbody></table>`;
  return sumCash(v) + card("Kế hoạch nguồn tiền", "Thu – chi – số dư theo nửa tháng", unitLabel() + (nams.length === 1 ? " · năm " + nams[0].slice(1) : ""), `<div class="chart-cap">${top}</div>`) + fc + cashCustCards(v) + cashDetailCards(v) +
    `<div class="g2">${card("Dòng tiền ròng", "Thu trừ chi từng nửa tháng", unitLabel(), net)}${card("Kế hoạch so với thực hiện", lastAct ? "Kỳ " + lastAct.h : "Theo khoản mục", "vạch đen = kế hoạch", pva)}</div>` + details("Xem bảng kế hoạch – thực hiện chi tiết", tbl) + quickCash(v);
}

/* ---------- 5. Công nợ phải thu ---------- */
function ar(v: VM): string {
  const { A, P } = v;
  if (!A.count && !v.C.D.ar.length) return `<div class="card notice">Chưa có sheet CONG_NO_PHAI_THU. Upload ở tab <a href="#" data-go="data">Dữ liệu</a>, hoặc thêm dòng ngay bên dưới.</div>` + bangKeCard(v);
  const sum1 = `<div class="stat-row">${stat("Quá hạn", pc(A.tot ? A.od / A.tot : null), "critical")}${stat("> 60 ngày", ty(A.o60), A.o60 ? "critical" : "")}${stat("DSO", ok(A.dso) ? n0(A.dso) + " ngày" : "—")}${stat("Thu nợ đến hạn", pc(A.collectRate))}</div>` +
    donut(A.bk.map((x, k): [number, string, string, string] => [x, BCLS[k], AR_BUCKETS[k], `ar:${k}`]), ty(A.tot), "tổng phải thu", { ft: ty }) +
    (A.neg ? `<div class="small" style="margin-top:8px">Số dư âm ${tr(A.neg)} (khách trả thừa / chờ cấn trừ) tách riêng, không trừ vào tuổi nợ.</div>` : "");
  const curve = A.curve.length ? lineChart({ labels: ["T", "T+1", "T+2", "T+3", "T+4"], series: A.curve.map((r, q) => ({ name: "Kỳ " + r.k, c: ["ink-3", "ink-3", "info", "high", "accent"][q + 5 - A.curve.length] || "ink-3", vals: r.v, w: q >= A.curve.length - 2 ? 2.5 : 1.5 })), max: 100, ft: (x) => N1.format(x) + "%", fy: (x) => x + "%", h: 240 }) + `<div class="small">% giá trị kỳ nợ đã thu đủ tính tới cuối mỗi tháng sau kỳ.</div>` : empty("Chưa có dữ liệu");
  const top = A.customers.slice(0, 15);
  const cust = hStack(top.map((c) => ({ l: c.ten, sub: `${c.g} · PM ${c.pm}`, parts: c.b.map((x, k): [number, string, string] => [x, BCLS[k], AR_BUCKETS[k]]), txt: tyN(c.tot), txt2: `quá hạn ${pc(c.tot ? c.od / c.tot : null, 0)}`, dr: `arcust:${c.ma_kh}` })), { ft: tr, legend: AR_BUCKETS.map((b, k): LegendItem => [b, BCLS[k]]) }) + (A.customers.length > 15 ? `<div class="small" style="margin-top:6px">Hiển thị 15/${A.customers.length} khách dư nợ lớn nhất.</div>` : "");
  const th = num(v.C.D, "nguong_dung_han"), tl = num(v.C.D, "pm_tra_ngay");
  const on = hBullet(Object.entries(P.onTime).map(([g, o]) => { const c = !ok(o.rate) ? "ink-3" : o.rate >= th ? "stable" : o.rate >= 0.7 ? "high" : "critical"; return { l: g, sub: GNAME[g] + (o.notDue ? ` · ${tr(o.notDue)} chưa đến hạn` : ""), v: o.rate, t: th, c, txt: pc(o.rate, 0), txt2: ok(o.rate) ? `trả sau còn ${pc((1 - tl) * o.rate, 1)}` : "chưa có dữ liệu", vc: c === "ink-3" ? "" : c, dr: `argroup:${g}` }; }), { max: 1 }) + `<div class="small" style="margin-top:6px">Kỳ nợ ${esc(v.ky)} · khoản nợ đúng hạn khi thu đủ trước/đúng ngày đến hạn.</div>`;
  const tbl = `<table><thead><tr><th>Khách hàng (${unitLabel()})</th><th>Nhóm</th><th>PM</th>${AR_BUCKETS.map((b) => `<th class="r">${b}</th>`).join("")}<th class="r">Tổng</th></tr></thead><tbody>${A.customers.map((c) => `<tr><td>${esc(c.ten)}</td><td>${c.g}</td><td>${esc(c.pm)}</td>${c.b.map((x) => `<td class="r num">${x ? tyN(x) : "–"}</td>`).join("")}<td class="r num">${tyN(c.tot)}</td></tr>`).join("")}<tr class="tot"><td>Tổng</td><td></td><td></td>${A.bk.map((x) => `<td class="r num">${tyN(x)}</td>`).join("")}<td class="r num">${tyN(A.tot)}</td></tr></tbody></table>`;
  return sumAR(v) + `<div class="g57">${card("Tổng quan", "Công nợ phải thu theo tuổi nợ", asOfTxt(v.C), sum1)}${card("Tiến độ thu tiền", "Đường cong thu tiền theo kỳ nợ", "% đã thu lũy kế", curve)}</div>
   <div class="g75">${card("Tuổi nợ theo ngày đến hạn", "Dư nợ theo khách hàng", unitLabel() + " · lớn nhất trước", cust)}${card("Ảnh hưởng hoa hồng PM", "Tỷ lệ thu đúng hạn theo nhóm", `vạch = ngưỡng ${pc(th, 0)}`, on)}</div>
   ${arCustomerCards(v)}
   ${details("Xem bảng tuổi nợ chi tiết", tbl)}`;
}

/* ---------- 6. Công nợ phải trả ---------- */
function ap(v: VM): string {
  const { B, A } = v;
  const add = v.canEdit ? card("Cập nhật trực tiếp", "Thêm công nợ phải trả", "upload file sổ phải trả sẽ ghi đè số nhập tay của cùng kỳ", addApForm(v.ky)) : "";
  if (!v.C.D.ap.length) return `<div class="card notice">Chưa có sheet CONG_NO_PHAI_TRA. Upload ở tab <a href="#" data-go="data">Dữ liệu</a>, hoặc thêm dòng ngay bên dưới.</div>` + add;
  const NC: Record<string, string> = { Flight: D("cyan"), Hotel: D("blue"), Mobility: D("purple"), SaaS: D("green"), "F&B": D("orange"), Khác: D("gray") };
  const s1 = `<div class="stat-row">${stat("Quá hạn", ty(B.od), B.od ? "high" : "")}${stat("Đến hạn ≤ 15 ngày", ty(B.d7 + B.d15))}${stat("Term HĐ bq", ok(B.wTerm) ? N1.format(B.wTerm) + " ngày" : "—")}</div>` +
    donut(Object.entries(B.byN).filter((e) => e[1] > 0).map(([k, x]): [number, string, string, string] => [x, NC[k] || "ink-3", k, `apn:${k}`]), ty(B.out), "tổng phải trả", { ft: ty });
  const parts = (r: { od: number; d7: number; d15: number; d30: number; later: number }): [number, string, string][] => [[r.od, D("red", "strong"), "Quá hạn"], [r.d7, D("red"), "≤ 7 ngày"], [r.d15, D("orange"), "8–15 ngày"], [r.d30, D("yellow"), "16–30 ngày"], [r.later, D("green"), "> 30 ngày"]];
  const stack = hStack(B.rows.filter((r) => r.out > 0).slice(0, 15).map((r) => ({ l: r.ten, sub: r.nganh, parts: parts(r), txt: tyN(r.out), dr: `apsup:${r.ma_ncc}` })), { ft: tr, legend: [["Quá hạn", D("red", "strong")], ["≤ 7 ngày", D("red")], ["8–15 ngày", D("orange")], ["16–30 ngày", D("yellow")], ["> 30 ngày", D("green")]] });
  const term = hBullet(B.rows.filter((r) => ok(r.dpo)).map((r) => { const d = r.dpo as number, t = r.term; const c = t != null && d < t - 4 ? "watch" : t != null && d > t ? "high" : "stable"; return { l: r.ten, sub: r.nganh, v: d, t, c, txt: n0(d) + " ngày", txt2: t == null ? "chưa có term HĐ" : d < t - 4 ? `trả sớm ${n0(t - d)} ngày` : `HĐ ${t} ngày`, vc: c }; }), { max: Math.max(50, ...B.rows.map((r) => Math.max(r.dpo || 0, r.term || 0))) * 1.05 }) + legend([["Trả sớm hơn HĐ > 4 ngày", "watch"], ["Đúng lịch", "stable"], ["Trễ hạn", "high"], ["Term hợp đồng", "ink", 1, true]]);
  const flt = barChart({ labels: ["DSO — thu tiền khách", "DPO — trả tiền NCC", "Float = DPO − DSO"], series: [{ name: "Số ngày", c: "accent", vals: [A.dso, B.wDpo, B.float], cf: (x, j) => (j === 2 ? (x < 0 ? "critical" : "stable") : j === 0 ? "high" : "accent") }], showVal: true, fv: (x) => N1.format(x), ft: (x) => N1.format(x) + " ngày", h: 230, noLegend: true, bw: 60 }) +
    `<div class="small">${ok(B.float) ? (B.float < 0 ? `Float âm ${N1.format(-B.float)} ngày: công ty trả NCC nhanh hơn thu tiền khách — đang tự ứng vốn lưu động.` : "Float dương: NCC đang tài trợ vốn lưu động.") : "Cần cả AR (DSO) và AP đã thanh toán (DPO) để tính."}</div>`;
  const tbl = `<table><thead><tr><th>Nhà cung cấp (${unitLabel()})</th><th>Ngành</th><th class="r">Term HĐ</th><th class="r">DPO</th><th class="r">Quá hạn</th><th class="r">≤ 7</th><th class="r">8–15</th><th class="r">16–30</th><th class="r">> 30</th><th class="r">Tổng</th></tr></thead><tbody>${B.rows.map((r) => `<tr><td>${esc(r.ten)}</td><td>${esc(r.nganh)}</td><td class="r num">${r.term ?? "—"}</td><td class="r num">${ok(r.dpo) ? n0(r.dpo) : "—"}</td><td class="r num">${tyN(r.od)}</td><td class="r num">${tyN(r.d7)}</td><td class="r num">${tyN(r.d15)}</td><td class="r num">${tyN(r.d30)}</td><td class="r num">${tyN(r.later)}</td><td class="r num">${tyN(r.out)}</td></tr>`).join("")}</tbody></table>`;
  return sumAP(v) + `<div class="g57">${card("Tổng quan", "Công nợ phải trả theo ngành", asOfTxt(v.C), s1)}${card("Lịch trả", "Số tiền đến hạn theo nhà cung cấp", unitLabel(), stack)}</div>
   <div class="g2">${card("Kỳ hạn thực hưởng", "DPO thực tế so với payment term hợp đồng", "vạch = term HĐ", term)}${card("Vốn lưu động", "Ai đang tài trợ ai?", "ngày", flt)}</div>${apSupplierCards(v)}${add}${details("Xem bảng công nợ phải trả chi tiết", tbl)}`;
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
  const pmHTML = P.pmPeople.length ? hStack(P.pmPeople.map((p) => ({ l: p.name, sub: p.groups.join(", "), dr: "team:PM", parts: [[p.now, "accent", `Trả ngay ${pc(tl, 0)}`], [p.later, "stable", "Trả sau — dự kiến"], [p.laterMax - p.later, "critical", "Mất do thu trễ", 0.55]] as [number, string, string, number?][], txt: tr(p.now + p.later), txt2: `trên ${tr(p.total)}` })), { ft: tr, legend: [[`Trả ngay ${pc(tl, 0)}`, "accent"], ["Trả sau — dự kiến", "stable"], ["Mất do khách thu trễ", "critical", 0.55]] }) +
    `<div class="small" style="margin-top:8px">Quỹ Mobility chia về N2–N5 theo margin net thực tế của nhóm, sau đó theo số khách phụ trách (sheet PHAN_BO_PM).${Object.values(P.onTime).every((o) => !ok(o.rate)) ? " Công nợ kỳ này chưa đến hạn nên chưa đánh giá được tỷ lệ thu đúng hạn — phần trả sau đang tạm tính đủ 100%." : ""}${P.pmUnassigned > 0 ? ` ${tr(P.pmUnassigned)} thuộc nhóm chưa có PM phụ trách → công ty.` : ""}</div>` : empty("Chưa có sheet PHAN_BO_PM");
  const salesHTML = P.sales.length ? hStack(P.sales.map((s) => ({ l: s.name, dr: "team:Sales", parts: [[s.gmv, "accent", "Pool GMV"], [s.hdContract, "high", "Thưởng hợp đồng"], [s.hdSaas, "stable", "Hoa hồng SaaS"]] as [number, string, string][], txt: tr(s.total) })), { ft: tr, legend: [["Pool GMV (nhân hệ số)", "accent"], ["Thưởng hợp đồng", "high"], ["Hoa hồng SaaS", "stable"]] }) +
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
  const tbl = `<table><thead><tr><th>Người</th><th>Team</th><th class="r">Tổng (${unit().nhan})</th><th class="r">Trả ngay</th><th class="r">Trả sau dự kiến</th></tr></thead><tbody>${P.pmPeople.map((p) => `<tr><td>${esc(p.name)}</td><td>PM</td><td class="r num">${tyN(p.total)}</td><td class="r num">${tyN(p.now)}</td><td class="r num">${tyN(p.later)}</td></tr>`).join("")}${P.sales.map((s) => `<tr><td>${esc(s.name)}</td><td>Sales</td><td class="r num">${tyN(s.total)}</td><td class="r num">${tyN(s.total)}</td><td class="r num">–</td></tr>`).join("")}${P.partners.map((s) => `<tr><td>${esc(s.name)}</td><td>Partnership</td><td class="r num">${tyN(s.total)}</td><td class="r num">${tyN(s.total)}</td><td class="r num">–</td></tr>`).join("")}<tr class="tot"><td>Công ty giữ lại</td><td></td><td class="r num">${tyN(P.companyKeep)}</td><td></td><td></td></tr></tbody></table>`;
  return sumKpi(v) + payCards(v) + `<div class="g57">${card("Áp dụng PM & Sales", "Đường hệ số bậc thưởng", ok(P.x) ? `nấc <b class="num">${tierIdx(P.x) + 1}/7</b>` : "chưa có kế hoạch", tierChart(P.x, P.H, TIERS, tier))}${card("Hình thành & phân bổ quỹ", "Quỹ hoa hồng theo trục", unitLabel(), poolHTML)}</div>
   <div class="g2">${card("Team PM", "Hoa hồng theo người", unitLabel(), pmHTML)}${card("Team Sales", "Thu nhập theo nguồn", unitLabel(), salesHTML)}</div>
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
  else if (v.seg === "m") lead += ` Sau hoa hồng còn ${ty(P.gp - P.comm)}.`;
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
const SVCS_ALL = ["Hotel", "Flight", "Mobility", "SaaS Travel", "SaaS Mobility", "F&B"];

function custRevenueCards(v: VM): string {
  const { CR, P } = v;
  if (!CR.length) return "";
  const SVCS = v.seg ? SEG_DV[v.seg] : SVCS_ALL;
  const top = CR.slice(0, 15);
  const stack = hStack(top.map((r) => ({
    l: r.ten, sub: `${r.nhom} · PM ${r.pm} · ${pc(r.share, 1)} GMV`, dr: `cust:${r.ma_kh}`,
    parts: SVCS.filter((k) => (r.bySvc[k] || 0) > 0).map((k): [number, string, string] => [r.bySvc[k], SVC_C[k], k]),
    txt: tyN(r.gmv), txt2: `margin ${pc(r.mgPct, 1)}`,
  })), { ft: ty, legend: SVCS.map((k): LegendItem => [k, SVC_C[k]]) }) +
    (CR.length > 15 ? `<div class="small" style="margin-top:6px">Hiển thị 15/${CR.length} khách có GMV lớn nhất trong kỳ.</div>` : "");
  const movers = CR.filter((r) => r.d != null && r.prev > 10e6);
  movers.sort((a, b) => (a.d as number) - (b.d as number));
  const pick = [...movers.slice(0, 7), ...movers.slice(-5).filter((m) => (m.d as number) > 0)];
  const uniq = Array.from(new Map(pick.map((m) => [m.ma_kh, m])).values());
  const mv = divBars(uniq.map((r) => ({
    l: r.ten, sub: `${r.nhom} · ${tr(r.prev)} → ${tr(r.gmv)}`, dr: `cust:${r.ma_kh}`,
    v: r.d as number, c: (r.d as number) < -0.3 ? "critical" : (r.d as number) < 0 ? D("orange") : D("green"),
    txt: ((r.d as number) > 0 ? "+" : "") + pc(r.d, 0),
  })), 1);
  const rowsTbl = CR.map((r) => `<tr><td>${esc(r.ten)}</td><td>${esc(r.ma_kh)}</td><td>${esc(r.nhom)}</td><td>${esc(r.pm)}</td>${SVCS.map((k) => `<td class="r num">${r.bySvc[k] ? tyN(r.bySvc[k]) : "–"}</td>`).join("")}<td class="r num">${tyN(r.gmv)}</td><td class="r num">${pc(r.share, 1)}</td><td class="r num">${tyN(r.mgNet)}</td><td class="r num ${ok(r.mgPct) && (r.mgPct as number) < 0.03 ? "c-critical" : ""}">${pc(r.mgPct, 2)}</td><td class="r num ${r.d != null && r.d < 0 ? "c-critical" : ""}">${r.d == null ? "—" : ((r.d as number) > 0 ? "+" : "") + pc(r.d, 0)}</td></tr>`).join("");
  const tbl = `<table><thead><tr><th>Khách hàng</th><th>Mã</th><th>Nhóm</th><th>PM</th>${SVCS.map((k) => `<th class="r">${k}</th>`).join("")}<th class="r">Tổng GMV</th><th class="r">Tỷ trọng</th><th class="r">Margin net</th><th class="r">%Margin</th><th class="r">Δ tháng trước</th></tr></thead><tbody>${rowsTbl}<tr class="tot"><td>Tổng ${CR.length} khách</td><td></td><td></td><td></td>${SVCS.map((k) => `<td class="r num">${n0(sum(CR, (r) => r.bySvc[k] || 0) / unit().chia)}</td>`).join("")}<td class="r num">${tyN(P.totAct)}</td><td class="r num">100%</td><td class="r num">${tyN(P.gp)}</td><td class="r num">${pc(P.totAct ? P.gp / P.totAct : null, 2)}</td><td></td></tr></tbody></table>`;
  return `<div class="g75">${card("Theo khách hàng", "GMV từng khách, tách theo dịch vụ", unitLabel() + " · lớn nhất trước", stack)}${card("Biến động", "Thay đổi GMV so với tháng trước", "khách có GMV tháng trước từ 10 tr", mv)}</div>
   ${details(`Xem bảng doanh thu chi tiết của cả ${CR.length} khách (${unitLabel()})`, tbl)}`;
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
      l: r.ten, sub: `PM ${r.pm}${r.sales !== "—" ? " · " + r.sales : ""}${delta(r)}`, dr: `cust:${r.ma_kh}`,
      v: r.gmv, c: r.d != null && r.prev >= 10e6 && (r.d as number) < -0.3 ? "critical" : GC[b.g],
      txt: tyN(r.gmv), txt2: `${pc(b.gmv ? r.gmv / b.gmv : null, 1)} nhóm · margin ${pc(r.mgPct, 1)}`,
    })), { max: b.rows[0].gmv * 1.05 });
    const note = `${b.rows.length} khách · ${ty(b.gmv)} GMV` + (b.tgt ? ` · ${pc(b.gmv / b.tgt, 0)} kế hoạch` : "");
    const more = b.rows.length > 12 ? `<div class="small" style="margin-top:6px">Hiển thị 12/${b.rows.length} khách lớn nhất của nhóm.</div>` : "";
    const tbl = `<table><thead><tr><th>#</th><th>Khách hàng</th><th>Mã</th><th>PM</th><th class="r">GMV (${unit().nhan})</th><th class="r">Tỷ trọng nhóm</th><th class="r">Lũy kế</th><th class="r">Margin net (${unit().nhan})</th><th class="r">%Margin</th><th class="r">Δ tháng trước</th></tr></thead><tbody>${(() => {
      let cum = 0;
      return b.rows.map((r, i) => { cum += r.gmv; return `<tr><td class="num">${i + 1}</td><td>${esc(r.ten)}</td><td>${esc(r.ma_kh)}</td><td>${esc(r.pm)}</td><td class="r num">${tyN(r.gmv)}</td><td class="r num">${pc(b.gmv ? r.gmv / b.gmv : null, 1)}</td><td class="r num">${pc(b.gmv ? cum / b.gmv : null, 0)}</td><td class="r num">${tyN(r.mgNet)}</td><td class="r num">${pc(r.mgPct, 2)}</td><td class="r num ${r.d != null && r.d < 0 ? "c-critical" : ""}">${r.d == null ? "—" : ((r.d as number) > 0 ? "+" : "") + pc(r.d, 0)}</td></tr>`; }).join("");
    })()}</tbody></table>`;
    return card(b.g, `${b.g} — ${GNAME[b.g]}`, note + "<br>" + unitLabel(), bars + more + `<details style="margin-top:10px"><summary>Xem đủ ${b.rows.length} khách của nhóm ${b.g}</summary><div class="tw" style="margin-top:10px">${tbl}</div></details>`);
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
    l: r.ten, sub: r.phu, dr: kind === "in" ? `arcust:${r.ma}` : `apsup:${r.ma}`,
    parts: [[r.thuc, c1, `Thực tế ${CD.fromDays} ngày qua`], [r.quaHan, D("red"), "Quá hạn"], [r.sapToi, c2, `Dự kiến ${CD.aheadDays} ngày tới`]] as [number, string, string][],
    txt: tyN(r.thuc + r.quaHan + r.sapToi),
    txt2: `${kind === "in" ? "đã thu" : "đã chi"} ${tr(r.thuc)}`,
  })), { ft: ty, legend: [[`Thực tế ${CD.fromDays} ngày qua`, c1], ["Quá hạn", D("red")], [`Dự kiến ${CD.aheadDays} ngày tới`, c2]] });
  const tbl = `<table><thead><tr><th>${kind === "in" ? "Khách hàng" : "Nhà cung cấp"}</th><th>Phân loại</th><th class="r">Thực tế ${CD.fromDays} ngày (${unit().nhan})</th><th class="r">Quá hạn (${unit().nhan})</th><th class="r">${CD.aheadDays} ngày tới (${unit().nhan})</th><th class="r">Tổng còn lại (${unit().nhan})</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.ten)}</td><td class="small">${esc(r.phu)}</td><td class="r num">${tyN(r.thuc)}</td><td class="r num ${r.quaHan > 0 ? "c-critical" : ""}">${r.quaHan ? tyN(r.quaHan) : "–"}</td><td class="r num">${r.sapToi ? tyN(r.sapToi) : "–"}</td><td class="r num">${tyN(r.dukien)}</td></tr>`).join("")}<tr class="tot"><td>Tổng</td><td></td><td class="r num">${n0(sum(rows, (r) => r.thuc) / unit().chia)}</td><td class="r num">${n0(sum(rows, (r) => r.quaHan) / unit().chia)}</td><td class="r num">${n0(sum(rows, (r) => r.sapToi) / unit().chia)}</td><td class="r num">${n0(sum(rows, (r) => r.dukien) / unit().chia)}</td></tr></tbody></table>`;
  const more = rows.length > 12 ? `<div class="small" style="margin-top:6px">Hiển thị 12/${rows.length}.</div>` : "";
  return card(eyebrow, title, unitLabel(), body + more + `<details style="margin-top:10px"><summary>Xem đủ ${rows.length} dòng</summary><div class="tw" style="margin-top:10px">${tbl}</div></details>`);
}
function cashDetailCards(v: VM): string {
  const { CD } = v;
  if (!CD.inflow.length && !CD.outflow.length) return "";
  return `<div class="g2">${flowCard("Tiền thu từ khách nào", "Dòng tiền vào", CD.inflow, D("green"), D("cyan"), CD, "in")}${flowCard("Tiền chi cho nhà cung cấp nào", "Dòng tiền ra", CD.outflow, D("purple"), D("blue"), CD, "out")}</div>
   <div class="card small">Số thực tế lấy từ ngày thu đủ / ngày trả trong sổ công nợ; số dự kiến lấy từ các khoản còn lại theo ngày đến hạn. Sheet DONG_TIEN chỉ nhập theo khoản mục nên không tách được theo đối tượng — hai bảng trên là cách duy nhất nhìn thấy chi tiết từng khách, từng NCC.</div>`;
}

/* ---------- Form sửa công nợ ngay trên web ---------- */
interface EdF { f: string; l: string; t: "date" | "money" | "text"; v?: string | number | null; w?: string }
function edForm(loai: "ar" | "ap", ma: string, ky: string, soCt: string, fields: EdF[], opts: { them?: boolean; suaTay?: boolean; note?: string } = {}): string {
  const inp = (x: EdF) => {
    const val = x.v == null ? "" : x.t === "money" ? String(Math.round(Number(x.v))) : String(x.v);
    const type = x.t === "date" ? "date" : x.t === "money" ? "number" : "text";
    return `<label${x.w ? ` class="${x.w}"` : ""}>${esc(x.l)}<input type="${type}" class="fld" data-f="${x.f}" value="${esc(val)}"${x.t === "money" ? " step=\"1000\" inputmode=\"numeric\"" : ""}></label>`;
  };
  return `<div class="cn-form" data-loai="${loai}" data-ma="${esc(ma)}" data-ky="${esc(ky)}" data-soct="${esc(soCt)}"${opts.them ? " data-them=\"1\"" : ""}>
    ${opts.note ? `<div class="cn-note">${esc(opts.note)}</div>` : ""}
    ${fields.map(inp).join("")}
    <div class="cn-act">
      <button type="button" class="btn primary cn-save">${opts.them ? "Thêm dòng" : "Lưu"}</button>
      ${opts.them ? "" : `<button type="button" class="btn cn-reset" title="Bỏ số sửa tay, quay về số trong file template"${opts.suaTay ? "" : " disabled"}>Về số gốc</button>`}
      ${opts.them ? "" : `<button type="button" class="btn danger cn-hide" title="Ẩn cả kỳ này khỏi dashboard">Ẩn kỳ này</button>`}
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
  if (!ARC.length) return bangKeCard(v);
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
    // Bảng chính là theo KỲ — đây cũng là mức cập nhật công nợ trên web
    const kyRows = c.kys.map((k) => {
      const [lab, cls] = TT_AR[k.tt];
      const src = k.nguonBK === "recon" ? ` <span class="src" title="Lấy từ app Reconciliation">↩</span>` : k.nguonBK === "web" ? ` <span class="src web" title="Sửa tay trên web">✎</span>` : "";
      const form = canEdit ? `<tr class="ed-row" hidden><td colspan="10">${edForm("ar", c.ma_kh, k.ky, "", [
        { f: "ngay_gui_bk", l: "Ngày gửi bảng kê", t: "date", v: k.guiBK },
        { f: "ngay_den_han", l: "Ngày đến hạn", t: "date", v: k.den_han },
        { f: "so_tien", l: "Phải thu cả kỳ", t: "money", v: k.so_tien },
        { f: "da_thu", l: "Đã thu cả kỳ", t: "money", v: k.da_thu },
        { f: "ngay_thu_du", l: "Ngày thu đủ", t: "date", v: k.thu_du },
        { f: "ngay_thu_gan_nhat", l: "Ngày thu gần nhất", t: "date", v: k.thu_gan_nhat },
        { f: "ghi_chu", l: "Ghi chú", t: "text", v: k.ghiChu, w: "wide" },
      ], { suaTay: k.suaTay, note: k.n > 1 ? `Kỳ này có ${k.n} hóa đơn trong file. Số sửa ở đây là của cả kỳ: phải thu rải theo tỷ trọng từng hóa đơn, đã thu rải lần lượt từ hóa đơn cũ nhất.` : "" })}</td></tr>` : "";
      return `<tr class="${k.suaTay ? "r-edited" : ""}"><td class="num">${esc(k.ky)}</td><td class="num">${fmtDate(k.guiBK)}${src}</td><td class="num">${fmtDate(k.den_han)}</td><td class="r num">${tyN(k.so_tien)}</td><td class="r num">${k.da_thu ? tyN(k.da_thu) : "–"}</td><td class="r num ${k.con_lai > 0 && k.tt === "qua_han" ? "c-critical" : ""}">${k.con_lai > 0 ? tyN(k.con_lai) : "–"}</td><td class="num">${fmtDate(k.thu_du || (k.thu_gan_nhat && k.thu_gan_nhat <= C.asOf ? k.thu_gan_nhat : null))}</td><td class="r num ${k.tt === "qua_han" ? "c-critical" : ""}">${k.tt === "qua_han" ? n0(k.late) : "–"}</td><td>${pill(lab, cls)}${k.n > 1 ? ` <span class="small">${k.n} HĐ</span>` : ""}</td><td class="r">${canEdit ? `<button type="button" class="icon-btn cn-toggle" title="Cập nhật công nợ kỳ ${esc(k.ky)}"><i class="ri-edit-line"></i></button>` : ""}</td></tr>${form}`;
    }).join("");
    // Chi tiết từng hóa đơn — chỉ để xem
    const inv = c.lines.map((l) => {
      const [lab, cls] = TT_AR[l.tt];
      return `<tr class="${l.suaTay ? "r-edited" : ""}"><td class="num">${esc(l.ky)}</td><td class="small">${esc(l.so_ct || "—")}</td><td class="num">${fmtDate(l.guiBK)}</td><td class="num">${fmtDate(l.ngay_hd)}</td><td class="num">${fmtDate(l.den_han)}</td><td class="r num">${tyN(l.so_tien)}</td><td class="r num">${l.da_thu ? tyN(l.da_thu) : "–"}</td><td class="r num ${l.con_lai > 0 && l.tt === "qua_han" ? "c-critical" : ""}">${l.con_lai > 0 ? tyN(l.con_lai) : "–"}</td><td class="num">${fmtDate(l.thu_du)}</td><td>${pill(lab, cls)}</td></tr>`;
    }).join("");
    const invTbl = `<table><thead><tr><th>Kỳ nợ</th><th>Số chứng từ</th><th>Gửi bảng kê</th><th>Hóa đơn</th><th>Đến hạn</th><th class="r">Phải thu (${unit().nhan})</th><th class="r">Đã thu (${unit().nhan})</th><th class="r">Còn lại (${unit().nhan})</th><th>Ngày thu đủ</th><th>Trạng thái</th></tr></thead><tbody>${inv}</tbody></table>`;
    return `<details class="cust-det"><summary><b>${esc(c.ten)}</b> <span class="small">${esc(c.nhom)} · PM ${esc(c.pm)} · còn lại <b class="num">${tr(c.open)}</b>${c.overdue > 0 ? ` · quá hạn <b class="num c-critical">${tr(c.overdue)}</b> (trễ nhất ${n0(c.maxLate)} ngày)` : ""} · đúng hạn ${pc(c.onTimeRate, 0)}</span></summary>
      <div class="tw" style="margin-top:10px"><table><thead><tr><th>Kỳ nợ</th><th>Gửi bảng kê</th><th>Đến hạn</th><th class="r">Phải thu (${unit().nhan})</th><th class="r">Đã thu (${unit().nhan})</th><th class="r">Còn lại (${unit().nhan})</th><th>Ngày thu</th><th class="r">Ngày trễ</th><th>Trạng thái</th><th></th></tr></thead><tbody>${kyRows}
      <tr class="tot"><td>Tổng</td><td></td><td></td><td class="r num">${tyN(c.billed)}</td><td class="r num">${tyN(c.paid)}</td><td class="r num">${tyN(c.open)}</td><td></td><td></td><td></td><td></td></tr></tbody></table></div>
      <details class="inv-det"><summary>Xem chi tiết ${c.lines.length} hóa đơn của ${esc(c.ten)} (chỉ để xem — số từ file upload)</summary><div class="tw" style="margin-top:10px">${invTbl}</div></details>${canEdit ? `<details class="add-det"><summary>+ Thêm kỳ công nợ cho ${esc(c.ten)}</summary>${edForm("ar", c.ma_kh, "", "", [
        { f: "__ky", l: "Kỳ nợ (T09.2026)", t: "text" },
        { f: "ngay_gui_bk", l: "Ngày gửi bảng kê", t: "date" },
        { f: "ngay_hd", l: "Ngày hóa đơn", t: "date" },
        { f: "ngay_den_han", l: "Ngày đến hạn", t: "date" },
        { f: "so_tien", l: "Phải thu cả kỳ", t: "money" },
        { f: "da_thu", l: "Đã thu cả kỳ", t: "money" },
        { f: "ngay_thu_du", l: "Ngày thu đủ", t: "date" },
        { f: "ghi_chu", l: "Ghi chú", t: "text", w: "wide" },
      ], { them: true })}</details>` : ""}</details>`;
  }).join("");

  return `<div class="g75">${card("Theo khách hàng", "Dư nợ còn lại của từng khách", unitLabel() + " · còn nợ nhiều nhất trước", bars)}${card("Tiến độ theo kỳ", "Bảng kê đã gửi và tiền đã thu", unitLabel(), progHTML)}</div>
   ${bangKeCard(v)}
   ${card("Chi tiết từng khách", "Kỳ nào chưa trả, còn bao nhiêu, trễ mấy ngày", `${asOfTxt(C)} · bấm tên khách để mở`, `<div class="det-wrap">${detail}</div>` + (ARC.length > 60 ? `<div class="small" style="margin-top:8px">Hiển thị 60/${ARC.length} khách có dư nợ lớn nhất.</div>` : ""))}`;
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
    const kyRows = s2.kys.map((k) => {
      const [lab, cls] = TT_AP[k.tt];
      const form = canEdit ? `<tr class="ed-row" hidden><td colspan="9">${edForm("ap", s2.ma_ncc, k.ky, "", [
        { f: "ngay_hd", l: "Ngày hóa đơn", t: "date", v: k.ngay_hd },
        { f: "ngay_den_han", l: "Ngày đến hạn", t: "date", v: k.den_han },
        { f: "so_tien", l: "Phải trả cả kỳ", t: "money", v: k.so_tien },
        { f: "da_tra", l: "Đã trả cả kỳ", t: "money", v: k.da_tra },
        { f: "ngay_tra", l: "Ngày trả", t: "date", v: k.ngay_tra },
        { f: "ghi_chu", l: "Ghi chú", t: "text", v: k.ghiChu, w: "wide" },
      ], { suaTay: k.suaTay, note: k.n > 1 ? `Kỳ này có ${k.n} hóa đơn trong file. Số sửa ở đây là của cả kỳ: phải trả rải theo tỷ trọng từng hóa đơn, đã trả rải lần lượt từ hóa đơn cũ nhất.` : "" })}</td></tr>` : "";
      return `<tr class="${k.suaTay ? "r-edited" : ""}"><td class="num">${esc(k.ky || fmtDate(k.den_han))}</td><td class="num">${fmtDate(k.ngay_hd)}</td><td class="num">${fmtDate(k.den_han)}</td><td class="r num">${tyN(k.so_tien)}</td><td class="r num">${k.da_tra ? tyN(k.da_tra) : "–"}</td><td class="r num ${k.tt === "qua_han" ? "c-critical" : ""}">${k.con_lai > 0 ? tyN(k.con_lai) : "–"}</td><td class="num">${fmtDate(k.ngay_tra)}</td><td>${pill(lab, cls)}${k.n > 1 ? ` <span class="small">${k.n} HĐ</span>` : ""}</td><td class="r">${canEdit ? `<button type="button" class="icon-btn cn-toggle" title="Cập nhật công nợ kỳ này"><i class="ri-edit-line"></i></button>` : ""}</td></tr>${form}`;
    }).join("");
    const inv = s2.lines.map((l) => {
      const [lab, cls] = TT_AP[l.tt];
      return `<tr class="${l.suaTay ? "r-edited" : ""}"><td class="num">${esc(l.ky || "—")}</td><td class="small">${esc(l.so_ct || "—")}</td><td class="num">${fmtDate(l.ngay_hd)}</td><td class="num">${fmtDate(l.den_han)}</td><td class="r num">${tyN(l.so_tien)}</td><td class="r num">${l.da_tra ? tyN(l.da_tra) : "–"}</td><td class="r num ${l.tt === "qua_han" ? "c-critical" : ""}">${l.con_lai > 0 ? tyN(l.con_lai) : "–"}</td><td class="num">${fmtDate(l.ngay_tra)}</td><td class="r num">${l.dpo != null ? n0(l.dpo) : l.con_lai > 0 ? (l.dueIn < 0 ? "quá " + n0(-l.dueIn) : "còn " + n0(l.dueIn)) : "–"}</td><td>${pill(lab, cls)}</td></tr>`;
    }).join("");
    const invTbl = `<table><thead><tr><th>Kỳ</th><th>Số chứng từ</th><th>Hóa đơn</th><th>Đến hạn</th><th class="r">Phải trả (${unit().nhan})</th><th class="r">Đã trả (${unit().nhan})</th><th class="r">Còn lại (${unit().nhan})</th><th>Ngày trả</th><th class="r">Số ngày</th><th>Trạng thái</th></tr></thead><tbody>${inv}</tbody></table>`;
    return `<details class="cust-det"><summary><b>${esc(s2.ten)}</b> <span class="small">${esc(s2.nganh)} · term ${s2.term ?? "—"} ngày${s2.dpo != null ? ` · DPO thực tế ${n0(s2.dpo)} ngày` : ""} · còn phải trả <b class="num">${tr(s2.open)}</b>${s2.overdue > 0 ? ` · quá hạn <b class="num c-critical">${tr(s2.overdue)}</b>` : ""}</span></summary>
      <div class="tw" style="margin-top:10px"><table><thead><tr><th>Kỳ</th><th>Hóa đơn</th><th>Đến hạn</th><th class="r">Phải trả (${unit().nhan})</th><th class="r">Đã trả (${unit().nhan})</th><th class="r">Còn lại (${unit().nhan})</th><th>Ngày trả</th><th>Trạng thái</th><th></th></tr></thead><tbody>${kyRows}
      <tr class="tot"><td>Tổng</td><td></td><td></td><td class="r num">${tyN(s2.billed)}</td><td class="r num">${tyN(s2.paid)}</td><td class="r num">${tyN(s2.open)}</td><td></td><td></td><td></td></tr></tbody></table></div>
      <details class="inv-det"><summary>Xem chi tiết ${s2.lines.length} hóa đơn của ${esc(s2.ten)} (chỉ để xem — số từ file upload)</summary><div class="tw" style="margin-top:10px">${invTbl}</div></details>${canEdit ? `<details class="add-det"><summary>+ Thêm kỳ công nợ cho ${esc(s2.ten)}</summary>${edForm("ap", s2.ma_ncc, "", "", [
        { f: "__ky", l: "Kỳ (T09.2026)", t: "text" },
        { f: "ngay_hd", l: "Ngày hóa đơn", t: "date" },
        { f: "ngay_den_han", l: "Ngày đến hạn", t: "date" },
        { f: "so_tien", l: "Phải trả cả kỳ", t: "money" },
        { f: "da_tra", l: "Đã trả cả kỳ", t: "money" },
        { f: "ngay_tra", l: "Ngày trả", t: "date" },
        { f: "ghi_chu", l: "Ghi chú", t: "text", w: "wide" },
      ], { them: true })}</details>` : ""}</details>`;
  }).join("");
  const bars = hStack(APS.filter((x) => x.open > 0).slice(0, 12).map((x) => ({
    l: x.ten, sub: `${x.nganh} · Partnership ${x.partnership}`,
    parts: [[x.overdue, D("red"), "Quá hạn"], [x.due15, D("orange"), "≤ 15 ngày"], [Math.max(0, x.open - x.overdue - x.due15), D("green"), "Còn hạn"]] as [number, string, string][],
    txt: tyN(x.open),
  })), { ft: ty, legend: [["Quá hạn", D("red")], ["≤ 15 ngày", D("orange")], ["Còn hạn", D("green")]] });
  return `<div class="g2">${card("Theo nhà cung cấp", "Số còn phải trả và mức độ gấp", unitLabel(), bars)}${card("Chi tiết từng NCC", "Chứng từ nào chưa trả, đến hạn khi nào", `${asOfTxt(C)} · bấm tên NCC để mở`, `<div class="det-wrap">${detail}</div>`)}</div>`;
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
  const tbl = `<table><thead><tr><th>Người</th><th>Team</th><th class="r">Tổng kỳ này (${unit().nhan})</th><th class="r">Trả ngay</th><th class="r">Trả sau dự kiến</th><th class="r">Trả sau tối đa</th><th>Kỳ trả phần sau</th><th class="r">Thực chi kỳ ${esc(v.ky)}</th></tr></thead><tbody>${PS.rows.map((r) => { const d = due.find((x) => x.name === r.name); return `<tr><td>${esc(r.name)}</td><td>${esc(r.team)}</td><td class="r num">${tyN(r.tongKy)}</td><td class="r num">${tyN(r.traNgay)}</td><td class="r num">${r.traSau ? tyN(r.traSau) : "–"}</td><td class="r num">${r.traSauGoc ? tyN(r.traSauGoc) : "–"}</td><td>${esc(r.kyTraSau)}</td><td class="r num">${d ? tyN(d.tong) : "–"}</td></tr>`; }).join("")}
    <tr class="tot"><td>Tổng</td><td></td><td class="r num">${tyN(sum(PS.rows, (r) => r.tongKy))}</td><td class="r num">${tyN(sum(PS.rows, (r) => r.traNgay))}</td><td class="r num">${tyN(sum(PS.rows, (r) => r.traSau))}</td><td class="r num">${tyN(sum(PS.rows, (r) => r.traSauGoc))}</td><td></td><td class="r num">${tyN(PS.tongChiKyNay)}</td></tr></tbody></table>`;
  return `<div class="g75">${card("Toàn công ty", "Hoa hồng kỳ này của cả ba team", unitLabel(), all)}${card("Cơ cấu quỹ", "Quỹ chia về đâu", "kỳ " + esc(v.ky), mix)}</div>
   <div class="g2">${card("Lịch chi trả", `Kỳ ${esc(v.ky)} phải thanh toán cho ai, bao nhiêu`, unitLabel(), dueHTML)}${card("Bảng thanh toán", "Chi tiết từng người", unitLabel(), `<div class="tw">${tbl}</div>`)}</div>`;
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
        ${whyHTML(a.why)}
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
    case "home": return homeView(v);
    case "opex": return opexView(v);
    case "kpiseg": return v.seg ? segKpi(v) : kpi(v);
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

/* ==========================================================================
   BẢNG TRA CỨU KHI BẤM VÀO BIỂU ĐỒ
   Mỗi phần của biểu đồ (cột, múi bánh, thanh ngang) mang một mã tra cứu.
   Bấm vào là mở bảng này: biểu đồ cơ cấu + danh sách đầy đủ kèm tỷ trọng
   và lũy kế, để thấy ngay con số đó do những khách nào tạo ra.
   ========================================================================== */
const DPC = [D("cyan"), D("purple"), D("green"), D("orange"), D("blue"), D("yellow"), D("red"), D("gray")];

export function drillPanel(v: VM, key: string): string {
  const d = drill(v, key);
  const close = `<button class="dp-x" data-dpclose="1" aria-label="Đóng"><i class="ri-close-line"></i></button>`;
  if (!d || !d.rows.length)
    return `<div class="dp-wrap"><div class="dp-box">${close}<div class="dp-h"><div class="card-title">Không có dữ liệu</div><div class="small">Phần biểu đồ này chưa có khách hàng nào đứng sau.</div></div></div></div>`;

  const money = d.kind === "money";
  // Khi mọi dòng đều nhỏ so với đơn vị đang chọn thì tự thêm số lẻ, để không ai hiện 0,00
  const le = leVua(Math.max(...d.rows.map((r) => Math.abs(r.v)), 0));
  const fv = money ? (x: number) => tyLe(x, le) : (x: number) => n0(x);
  const tot = d.total || 1;
  const top = d.rows.slice(0, 8);
  const rest = d.rows.slice(8);
  const parts: [number, string, string][] = top.map((r, i) => [r.v, DPC[i % DPC.length], r.ten]);
  if (rest.length) parts.push([sum(rest, (r) => r.v), D("gray", "medium"), `${rest.length} khách còn lại`]);
  const dn = donut(parts, money ? `${fv(d.total)} ${unit().nhan}` : n0(d.total), money ? unitLabel() : "", { ft: money ? (x: number) => `${fv(x)} ${unit().nhan}` : n0, size: 150 });
  const bars = hStack(d.rows.slice(0, 14).map((r, i) => ({
    l: r.ten, sub: r.sub,
    parts: [[Math.max(0, r.v), DPC[i % DPC.length], r.ten]] as [number, string, string][],
    txt: fv(r.v), txt2: pc(r.v / tot, 1) + " tổng",
  })), { ft: money ? (x: number) => `${fv(x)} ${unit().nhan}` : n0 });
  let cum = 0;
  const body = d.rows.map((r, i) => {
    cum += r.v;
    return `<tr><td class="num">${i + 1}</td><td>${esc(r.ten)}</td><td class="small">${esc(r.sub)}</td>` +
      `<td class="r num" title="${esc(money ? exact(r.v) : n0(r.v))}">${fv(r.v)}</td><td class="r num">${pc(r.v / tot, 1)}</td><td class="r num">${pc(cum / tot, 0)}</td>` +
      (d.v2l ? `<td class="r num">${r.v2 == null ? "—" : fv(r.v2)}</td>` : "") + `</tr>`;
  }).join("");
  const tbl = `<table><thead><tr><th>#</th><th>Tên</th><th>Phân loại</th><th class="r">${money ? esc(unit().nhan) : "Giá trị"}</th><th class="r">Tỷ trọng</th><th class="r">Lũy kế</th>` +
    (d.v2l ? `<th class="r">${esc(d.v2l)}</th>` : "") + `</tr></thead><tbody>${body}` +
    `<tr class="tot"><td></td><td>Tổng ${d.rows.length} dòng</td><td></td><td class="r num">${fv(d.total)}</td><td class="r num">100%</td><td></td>` +
    (d.v2l ? `<td class="r num">${fv(sum(d.rows, (r) => r.v2 || 0))}</td>` : "") + `</tr></tbody></table>`;
  const top3 = sum(d.rows.slice(0, 3), (r) => r.v);
  return `<div class="dp-wrap"><div class="dp-box">${close}
    <div class="dp-h"><div class="eyebrow">Chi tiết theo khách</div><div class="card-title">${esc(d.title)}</div><div class="small">${esc(d.note)} · 3 dòng đầu chiếm ${pc(top3 / tot, 0)}</div></div>
    <div class="dp-top"><div class="dp-dn">${dn}</div><div class="dp-bars">${bars}${d.rows.length > 14 ? `<div class="small" style="margin-top:6px">Biểu đồ hiển thị 14/${d.rows.length} dòng lớn nhất — bảng dưới có đủ.</div>` : ""}</div></div>
    <div class="tw dp-tbl">${tbl}</div></div></div>`;
}

/* ==========================================================================
   NHẬP SỐ TỔNG THẲNG TRÊN DASHBOARD
   Dành cho những kỳ chưa kịp làm file template, hoặc chỉ cần số tổng để nhìn
   bức tranh chung. Số nhập ở đây đắp lên số đọc từ file; upload file của cùng kỳ thì
   số trong file ghi đè số nhập tay (xem api/dashboard/upload).
   ========================================================================== */
export interface QRow { khoa: string; ten: string; v: number | null; tien?: boolean; tay?: boolean; sub?: string }

/** Ô nhập: số tiền nhập theo ĐƠN VỊ đang chọn ở thanh tab, số đếm thì nhập thẳng. */
function qInput(nhom: string, ky: string, r: QRow): string {
  const tien = r.tien !== false;
  const val = r.v == null ? "" : tien ? String(Number((r.v / unit().chia).toFixed(6))) : String(Math.round(r.v));
  return `<td class="r"><input type="number" step="any" inputmode="decimal" class="fld nq-in${r.tay ? " tay" : ""}" data-khoa="${esc(r.khoa)}" data-ky="${esc(ky)}" data-nhom="${esc(nhom)}" data-tien="${tien ? 1 : 0}" data-goc="${esc(val)}" data-tay="${r.tay ? 1 : 0}" value="${esc(val)}" placeholder="—"></td>`;
}

function quickCard(eyebrow: string, title: string, note: string, nhom: string, ky: string, cols: string[], rows: QRow[][], huong: string, newRow = ""): string {
  if (!rows.length && !newRow) return "";
  const body = rows.map((g) => {
    const head = g[0];
    return `<tr><td>${esc(head.ten)}${head.sub ? `<div class="t2">${esc(head.sub)}</div>` : ""}</td>${g.map((r) => qInput(nhom, r.khoa.includes("@") ? r.khoa.split("@")[1] : ky, { ...r, khoa: r.khoa.split("@")[0] })).join("")}</tr>`;
  }).join("");
  return card(eyebrow, title, note, `<div class="nq-form" data-nhom="${esc(nhom)}">
    <div class="tw"><table class="nq"><thead><tr><th>Khoản mục</th>${cols.map((c) => `<th class="r">${esc(c)}</th>`).join("")}</tr></thead><tbody>${body}${newRow}</tbody></table></div>
    <div class="nq-act"><span class="small">${huong}</span><button type="button" class="btn primary nq-save">Lưu số đã nhập</button></div>
  </div>`);
}

const nguonTay = (C: Ctx, nhom: string, ky: string, khoa: string) => (C.D.manual || []).some((x) => x.nhom === nhom && x.ky === ky && x.khoa === khoa && x.gia_tri != null);

/** Nhập GMV, giá vốn và kế hoạch của kỳ đang xem. */
export function quickRevenue(v: VM): string {
  if (!v.canEdit) return "";
  const { P, ky } = v;
  const C = v.Cc; // số nhập tay và kế hoạch đầy đủ nằm ở dữ liệu toàn công ty
  const segL = MANUAL_LINES.filter((L) => !v.seg || SEG_DV[v.seg].includes(L.dv));
  const segT = MANUAL_TARGETS.filter((f) => !v.seg || TGT_OF[v.seg].includes(String(f.k)));
  const gRows: QRow[][] = segL.map((L) => {
    const ln = P.lines.find((x) => x.k === L.k);
    return [
      { khoa: `${L.k}|gmv`, ten: L.ten, v: ln && ln.act ? ln.act : null, tay: nguonTay(C, "gmv", ky, `${L.k}|gmv`), sub: ln && ln.act > 0 && !nguonTay(C, "gmv", ky, `${L.k}|gmv`) ? "đang lấy từ file" : "" },
      { khoa: `${L.k}|gia_von`, ten: L.ten, v: ln && ln.cost ? ln.cost : null, tay: nguonTay(C, "gmv", ky, `${L.k}|gia_von`) },
    ];
  });
  const T = C.D.targets.find((t) => t.ky === ky);
  const tRows: QRow[][] = segT.map((f) => [{
    khoa: String(f.k), ten: f.ten, tien: f.tien,
    v: T ? ((T[f.k] as number | null) || null) : null, tay: nguonTay(C, "target", ky, String(f.k)),
  }]);
  const mucChi = Array.from(new Set([...C.D.opex.map((o) => o.khoan_muc), "Lương & nhân sự", "Marketing", "Vận hành & công nghệ", "Thuê văn phòng", "Khấu hao", "Lãi vay", "Thuế TNDN"]));
  const cRows: QRow[][] = mucChi.map((m) => [{
    khoa: m, ten: m, v: C.D.opex.find((o) => o.ky === ky && o.khoan_muc === m)?.so_tien ?? null, tay: nguonTay(C, "opex", ky, m),
  }]);
  const huong = `Số tiền nhập theo đơn vị đang chọn — <b>${esc(unitLabel())}</b>. Để trống là xóa số nhập tay, quay lại số trong file. Upload file của cùng kỳ sẽ ghi đè số nhập tay.`;
  const opNew = `<tr class="nq-new" data-nhom="opex" data-ky="${esc(ky)}"><td><input type="text" class="fld nq-name" placeholder="+ Thêm khoản mục chi phí"></td><td class="r"><input type="number" step="any" class="fld nq-v" data-sfx="" placeholder="—"></td></tr>`;
  return gmvKhCard(v) + `<div class="g2">
    ${quickCard("Nhập nhanh", `GMV & giá vốn kỳ ${esc(ky)}`, "ô nền tím là số đang nhập tay", "gmv", ky, [`GMV (${unit().nhan})`, `Giá vốn (${unit().nhan})`], gRows, huong)}
    ${quickCard("Nhập nhanh", `Kế hoạch kỳ ${esc(ky)}`, "GMV theo đơn vị đang chọn, số khách là số nguyên", "target", ky, ["Giá trị"], tRows, huong)}
  </div>` + (v.seg ? "" : quickCard("Nhập nhanh", `Chi phí vận hành kỳ ${esc(ky)}`, "cần có để tính EBITDA và lợi nhuận ròng", "opex", ky, [`Số tiền (${unit().nhan})`], cRows, huong, opNew));
}
const TGT_OF: Record<Seg, string[]> = {
  ts: ["gmv_hotel", "gmv_flight", "gmv_saas_t", "gmv_fnb", "kh_n1", "opex_budget"],
  m: ["gmv_n2", "gmv_n3", "gmv_n4", "gmv_n5", "gmv_saas_m", "kh_n2", "kh_n3", "kh_n4", "kh_n5"],
};
/** Ô nhập chi phí vận hành của kỳ — dùng ở tab Chi phí */
function quickOpex(v: VM): string {
  if (!v.canEdit) return "";
  const C = v.Cc, ky = v.ky;
  const mucChi = Array.from(new Set([...C.D.opex.map((o) => o.khoan_muc), "Lương & nhân sự", "Marketing", "Vận hành & công nghệ", "Thuê văn phòng", "Khấu hao", "Lãi vay", "Thuế TNDN"]));
  const cRows: QRow[][] = mucChi.map((m) => [{ khoa: m, ten: m, v: C.D.opex.find((o) => o.ky === ky && o.khoan_muc === m)?.so_tien ?? null, tay: nguonTay(C, "opex", ky, m) }]);
  const huong = `Số tiền nhập theo đơn vị đang chọn — <b>${esc(unitLabel())}</b>. Để trống là xóa số nhập tay, quay lại số trong file. Upload sheet CHI_PHI của cùng kỳ sẽ ghi đè số nhập tay.`;
  const opNew = `<tr class="nq-new" data-nhom="opex" data-ky="${esc(ky)}"><td><input type="text" class="fld nq-name" placeholder="+ Thêm khoản mục chi phí"></td><td class="r"><input type="number" step="any" class="fld nq-v" data-sfx="" placeholder="—"></td></tr>`;
  return quickCard("Cập nhật trực tiếp", `Chi phí vận hành kỳ ${esc(ky)}`, "cần có để tính EBITDA và lợi nhuận ròng", "opex", ky, [`Số tiền (${unit().nhan})`], cRows, huong, opNew);
}

/** Nhập dòng tiền kế hoạch / thực hiện theo nửa tháng. */
export function quickCash(v: VM): string {
  if (!v.canEdit) return "";
  const { C, ky } = v;
  const halves = [`${ky}-H1`, `${ky}-H2`];
  const mucs = Array.from(new Set([...CASH_IN, ...CASH_OUT, ...CASH_SIGNED, ...C.D.cash.map((r) => r.khoan_muc)]));
  const rows: QRow[][] = mucs.map((m) => halves.flatMap((h) => {
    const r = C.D.cash.find((x) => x.ky_nua_thang === h && x.khoan_muc === m);
    return (["ke_hoach", "thuc_hien"] as const).map((cot) => ({
      khoa: `${m}|${cot}@${h}`, ten: m, v: r ? r[cot] : null, tay: nguonTay(C, "cash", h, `${m}|${cot}`),
    }));
  }));
  const huong = `Số tiền nhập theo đơn vị đang chọn — <b>${esc(unitLabel())}</b>. Chi ghi số dương, hệ thống tự trừ. Khoản mục thêm mới tự nhận chiều Thu / Chi theo ô chọn. Upload sheet DONG_TIEN sẽ ghi đè số nhập tay của cùng nửa tháng.`;
  const cNew = `<tr class="nq-new" data-nhom="cash" data-ky="${esc(ky)}"><td><div class="nq-new-f"><select class="fld nq-dir"><option value="in">Thu</option><option value="out" selected>Chi</option></select><input type="text" class="fld nq-name" placeholder="+ Thêm khoản mục"></div></td>${halves.flatMap((h) => (["ke_hoach", "thuc_hien"] as const).map((cot) => `<td class="r"><input type="number" step="any" class="fld nq-v" data-sfx="|${cot}" data-ky="${h}" placeholder="—"></td>`)).join("")}</tr>`;
  return quickCard("Nhập nhanh", `Dòng tiền kỳ ${esc(ky)}`, "theo nửa tháng · để trống là bỏ số nhập tay", "cash", ky,
    ["H1 kế hoạch", "H1 thực hiện", "H2 kế hoạch", "H2 thực hiện"], rows, huong, cNew);
}

/* ==========================================================================
   CẬP NHẬT BẢNG KÊ & TIỀN THU NGAY TRÊN MỘT BẢNG
   Khỏi phải mở từng khách: chọn kỳ, điền ngày gửi và tiền đã thu cho cả danh sách.
   ========================================================================== */
function bangKeCard(v: VM): string {
  const { ARC, C, canEdit } = v;
  const coKy = (k: string) => ARC.some((c) => c.kys.some((x) => x.ky === k));
  // Kỳ đang chọn có thể chưa có bảng kê nào — khi đó lấy kỳ nợ gần nhất để vẫn cập nhật được
  const kyNo = Array.from(new Set(ARC.flatMap((c) => c.kys.map((x) => x.ky)))).filter((k) => ok(kyIdx(k))).sort((a, b) => kyIdx(b) - kyIdx(a));
  const ky = coKy(v.ky) ? v.ky : kyNo[0] || v.ky;
  const ds = ARC.map((c) => ({ c, k: c.kys.find((x) => x.ky === ky) })).filter((x) => x.k) as { c: ArCust; k: ArCust["kys"][number] }[];
  if (!ds.length && !canEdit) return "";
  ds.sort((a, b) => b.k.con_lai - a.k.con_lai || b.k.so_tien - a.k.so_tien);
  const daGui = ds.filter((x) => x.k.guiBK).length, daThuDu = ds.filter((x) => x.k.con_lai <= 0).length;
  const note = `${ds.length} khách có bảng kê kỳ ${esc(ky)} · đã gửi ${daGui} · đã thu đủ ${daThuDu}` + (ky !== v.ky ? ` · kỳ ${esc(v.ky)} chưa có bảng kê nào` : "");
  const dt = (x: string | null) => (x ? esc(x) : "");
  const rows = ds.map(({ c, k }) => {
    const [lab, cls] = TT_AR[k.tt];
    const src = k.nguonBK === "recon" ? ` <span class="src" title="Lấy từ app Reconciliation">↩</span>` : k.nguonBK === "web" ? ` <span class="src web" title="Sửa tay trên web">✎</span>` : "";
    const o = canEdit
      ? `<td><input type="date" class="fld bk-in" data-f="ngay_gui_bk" value="${dt(k.guiBK)}"></td>
         <td class="r"><input type="number" step="1000" inputmode="numeric" class="fld bk-in money" data-f="da_thu" value="${k.da_thu ? Math.round(k.da_thu) : ""}" placeholder="0"></td>
         <td><input type="date" class="fld bk-in" data-f="ngay_thu_gan_nhat" value="${dt(k.thu_gan_nhat)}"></td>
         <td><input type="date" class="fld bk-in" data-f="ngay_thu_du" value="${dt(k.thu_du)}"></td>
         <td class="r nowrap"><button type="button" class="btn cn-save" title="Lưu dòng này">Lưu</button>${k.tuTao ? ` <button type="button" class="icon-btn cn-reset" title="Xóa dòng thêm tay này"><i class="ri-delete-bin-line"></i></button>` : ""}</td>`
      : `<td class="num">${fmtDate(k.guiBK)}</td><td class="r num">${tyN(k.da_thu)}</td><td class="num">${fmtDate(k.thu_gan_nhat)}</td><td class="num">${fmtDate(k.thu_du)}</td><td></td>`;
    return `<tr class="cn-form ${k.suaTay ? "r-edited" : ""}" data-loai="ar" data-ma="${esc(c.ma_kh)}" data-ky="${esc(ky)}" data-soct="">
      <td><b>${esc(c.ten)}</b><div class="t2">${esc(c.nhom)} · PM ${esc(c.pm)}${src}</div></td>
      <td class="r num">${tyN(k.so_tien)}</td>
      <td class="r num ${k.con_lai > 0 && k.tt === "qua_han" ? "c-critical" : ""}">${k.con_lai > 0 ? tyN(k.con_lai) : "–"}</td>
      <td class="num">${fmtDate(k.den_han)}</td><td>${pill(lab, cls)}</td>${o}</tr>`;
  }).join("");
  const tbl = `<div class="tw bk-tbl"><table class="bk"><thead><tr>
    <th>Khách hàng</th><th class="r">Phải thu (${unit().nhan})</th><th class="r">Còn lại (${unit().nhan})</th><th>Đến hạn</th><th>Trạng thái</th>
    <th>Ngày gửi bảng kê</th><th class="r">Đã thu (VND)</th><th>Ngày thu gần nhất</th><th>Ngày thu đủ</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  const huong = canEdit
    ? `Điền rồi bấm <b>Lưu</b> ở cuối dòng. Ô "Đã thu" nhập số VND nguyên. Khi upload file sổ phải thu, số trong file sẽ <b>ghi đè</b> số nhập tay của các kỳ có trong file. Dòng có biểu tượng thùng rác là dòng thêm tay.`
    : `Chỉ Quản trị và Kế toán mới sửa được các ô này.`;
  return card("Cập nhật trực tiếp", `Bảng kê & tiền thu — kỳ ${esc(ky)}`, note, (ds.length ? tbl : empty(`Kỳ ${ky} chưa có dòng công nợ nào — thêm ở bên dưới.`)) + `<div class="small" style="margin-top:8px">${huong}</div>` + (canEdit ? addArForm(ky) : ""));
}

/* ==========================================================================
   ĐÓNG GÓP DOANH THU & MARGIN THEO TỪNG KHÁCH (tab Doanh thu & Margin)
   ========================================================================== */
const pctN = (x: number) => N1.format(x) + "%";
/** Nhãn trục log: số đã chia theo đơn vị, tự thêm số lẻ cho số nhỏ */
const logTick = (x: number) => tyLe(x * unit().chia, leVua(x * unit().chia));
/** Số tiền không kèm đơn vị, tự thêm số lẻ cho số nhỏ */
const tn = (x: number) => tyLe(x || 0, leVua(x || 0));
function custContribCards(v: VM): string {
  const { CR, P } = v;
  if (!CR.length) return "";
  const totG = sum(CR, (r) => r.gmv), totM = sum(CR, (r) => r.mgNet);
  const top = CR.slice().sort((a, b) => b.mgNet - a.mgNet).slice(0, 15);
  const pair = pairBars(top.map((r) => ({
    l: r.ten, sub: `${r.nhom} · PM ${r.pm} · margin ${pc(r.mgPct, 1)}`, dr: `cust:${r.ma_kh}`,
    a: totG ? r.gmv / totG : 0, b: totM ? r.mgNet / totM : 0,
    ta: pc(totG ? r.gmv / totG : null, 1), tb: pc(totM ? r.mgNet / totM : null, 1),
  })), { la: "Tỷ trọng GMV", lb: "Tỷ trọng margin net" }) +
    `<div class="small" style="margin-top:6px">15 khách tạo nhiều margin net nhất. Thanh tím dài hơn thanh xanh = khách đóng góp lợi nhuận nhiều hơn doanh thu; ngắn hơn = khách "ăn" margin.</div>`;
  // tập trung: bao nhiêu khách tạo ra 80% margin
  const byM = CR.slice().sort((a, b) => b.mgNet - a.mgNet);
  let acc = 0, n80 = 0;
  for (const r of byM) { if (totM <= 0) break; acc += r.mgNet; n80++; if (acc >= 0.8 * totM) break; }
  const neg = CR.filter((r) => r.mgNet < 0);
  const med = CR.map((r) => r.gmv).sort((a, b) => a - b)[Math.floor(CR.length / 2)] || 0;
  const sc = scatter(CR.filter((r) => r.gmv > 0).map((r) => ({
    x: r.gmv / unit().chia, y: (r.mgPct || 0) * 100, r: Math.abs(r.mgNet), l: r.ten, c: GC[r.nhom] || "ink-3", dr: `cust:${r.ma_kh}`,
    tip: `${r.ten} (${r.nhom}) · GMV ${tien(r.gmv)} · margin net ${tien(r.mgNet)} (${pc(r.mgPct, 2)})`,
  })), { xl: `GMV (${unitLabel()}, thang log)`, yl: "% margin net", fx: logTick, fy: pctN, qx: med / unit().chia, qy: P.totAct ? (100 * P.gp) / P.totAct : 0, logX: true, clip: true, h: 400 }) +
    legend((v.seg ? SEG_GROUPS[v.seg] : GROUPS).map((g): LegendItem => [`${g} — ${GNAME[g]}`, GC[g]])) +
    `<div class="small" style="margin-top:6px">Đường đứt dọc = GMV trung vị, ngang = %margin bình quân công ty. Góc phải dưới là khách lớn nhưng margin mỏng — cần xem lại giá. Chấm càng to margin net càng lớn; chấm rỗng ở mép là giá trị vượt khung.</div>`;
  const note = totM > 0 ? `${n80} / ${CR.length} khách tạo ra 80% margin net` + (neg.length ? ` · ${neg.length} khách margin âm (${tien(sum(neg, (r) => r.mgNet))})` : "") : "chưa có margin dương";
  return `<div class="g2">${card("Đóng góp theo khách", "Khách nào tạo doanh thu, khách nào tạo margin", note, pair)}${card("Bản đồ khách hàng", "Quy mô GMV so với % margin net", "kỳ " + esc(v.ky) + " · bấm chấm để xem chi tiết", sc)}</div>`;
}

/* ==========================================================================
   DÒNG TIỀN THEO TỪNG KHÁCH (tab Dòng tiền)
   ========================================================================== */
const PAL = [D("cyan"), D("purple"), D("blue"), D("orange"), D("green"), D("yellow"), D("red")];
function cashCustCards(v: VM): string {
  const { C, ARC } = v;
  if (!ARC.length) return "";
  // 1. Tiền thu về theo tháng, tách theo khách
  // 6 tháng gần nhất có tiền về (không vượt quá tháng hiện tại)
  const nowM = kyIdx(kyOfDate(C.asOf));
  const paidMs = C.D.ar.map((r) => r.ngay_thu_du || r.ngay_thu_gan_nhat).filter((d): d is string => !!d).map(kyOfDate).filter((m) => kyIdx(m) <= nowM);
  const endM = paidMs.length ? paidMs.reduce((a, b) => (kyIdx(b) > kyIdx(a) ? b : a)) : kyOfDate(C.asOf);
  const months = monthsBetween(kyAdd(endM, -5), endM);
  const coll = new Map<string, number[]>();
  C.D.ar.forEach((r) => {
    const d = r.ngay_thu_du || r.ngay_thu_gan_nhat;
    if (!d || !(r.da_thu || 0)) return;
    const i = months.indexOf(kyOfDate(d));
    if (i < 0) return;
    const a = coll.get(r.ma_kh) || months.map(() => 0);
    a[i] += r.da_thu || 0; coll.set(r.ma_kh, a);
  });
  const ranked = Array.from(coll.entries()).sort((a, b) => sum(b[1], (x) => x) - sum(a[1], (x) => x));
  const topK = ranked.slice(0, 6), rest = ranked.slice(6);
  const name = (k: string) => { const c = v.C.cust.get(k); return c?.ten_viet_tat || c?.ten_kh || k; };
  const series = topK.map(([k, vals], i) => ({ name: name(k), c: PAL[i % PAL.length], vals: vals.map((x) => x / unit().chia) }));
  if (rest.length) series.push({ name: `${rest.length} khách khác`, c: D("gray", "medium"), vals: months.map((_, i) => sum(rest, (r) => r[1][i]) / unit().chia) });
  const stack = ranked.length ? barChart({ labels: months.map((m) => m.slice(0, 3) + "." + m.slice(6)), stack: true, showTot: true, series, ft: (x) => axisNum(x) + " " + unit().nhan, fy: axisNum, h: 260, bw: 46 }) +
    `<div class="small" style="margin-top:6px">Tiền đã thu theo tháng của ngày thu (ngày thu đủ, hoặc ngày thu gần nhất nếu mới thu một phần).</div>` : empty("Chưa có khoản nào ghi ngày thu");

  // 2. Margin tạo ra và tiền đã về, 3 kỳ nợ gần nhất
  const kys = Array.from(new Set(C.D.ar.map((r) => r.ky))).filter((k) => ok(kyIdx(k)) && kyIdx(k) <= kyIdx(v.ky)).sort((a, b) => kyIdx(a) - kyIdx(b)).slice(-3);
  const rows = ARC.map((c) => {
    const ls = c.lines.filter((l) => kys.includes(l.ky));
    const billed = sum(ls, (l) => l.so_tien), paid = sum(ls, (l) => l.da_thu);
    const od = sum(ls.filter((l) => l.con_lai > 0 && l.tt === "qua_han"), (l) => l.con_lai);
    const mg = sum(kys, (k) => custMonth(C, k).get(c.ma_kh)?.mgNet || 0);
    return { c, billed, paid, od, open: billed - paid, mg };
  }).filter((x) => x.billed > 0).sort((a, b) => b.billed - a.billed);
  const st = hStack(rows.slice(0, 12).map((x) => ({
    l: x.c.ten, sub: `${x.c.nhom} · PM ${x.c.pm} · margin ${tien(x.mg)}`, dr: `arcust:${x.c.ma_kh}`,
    parts: [[x.paid, D("green"), "Đã thu"], [Math.max(0, x.open - x.od), D("cyan", "medium"), "Chưa đến hạn"], [x.od, D("red"), "Quá hạn"]] as [number, string, string][],
    txt: tyN(x.billed), txt2: `đã thu ${pc(x.billed ? x.paid / x.billed : null, 0)}`,
  })), { ft: ty, legend: [["Đã thu", D("green")], ["Chưa đến hạn", D("cyan", "medium")], ["Quá hạn", D("red")]] });
  const kept = rows.filter((x) => x.mg > 0 && x.open > 0).sort((a, b) => b.open - a.open).slice(0, 3);
  const note = kept.length ? `<div class="small" style="margin-top:8px">Margin đã ghi nhận nhưng tiền chưa về nhiều nhất: ${kept.map((x) => `${esc(x.c.ten)} còn ${tien(x.open)}`).join(" · ")}.</div>` : "";
  return `<div class="g2">${card("Tiền về theo khách", "Tiền thu được mỗi tháng từ khách nào", unitLabel() + " · 6 tháng gần nhất", stack)}${card("Tiền về so với margin", `Bảng kê ${kys.length ? kys[0] + (kys.length > 1 ? "–" + kys[kys.length - 1] : "") : ""}: đã thu bao nhiêu`, unitLabel() + " · bấm để xem từng kỳ", st + note)}</div>`;
}

/* ==========================================================================
   XU HƯỚNG — chọn khoảng thời gian và cách gom (tháng / quý / năm)
   ========================================================================== */
const GRAN_L: Record<Gran, string> = { m: "tháng", q: "quý", y: "năm" };
function trendRange(v: VM) {
  const ps = v.C.periods;
  const all = ps.length ? monthsBetween(ps[0], ps[ps.length - 1] > v.ky ? ps[ps.length - 1] : v.ky) : [v.ky];
  let to = v.st.tTo && all.includes(v.st.tTo) ? v.st.tTo : v.ky;
  let from = v.st.tFrom && all.includes(v.st.tFrom) ? v.st.tFrom : (all.filter((m) => kyIdx(m) <= kyIdx(to)).slice(-6)[0] || to);
  if (kyIdx(from) > kyIdx(to)) [from, to] = [to, from];
  return { all, from, to };
}
function ctlBar(v: VM, all: string[], from: string, to: string, gran: Gran): string {
  const opt = (sel: string) => all.slice().reverse().map((m) => `<option value="${m}"${m === sel ? " selected" : ""}>${m}</option>`).join("");
  const seg = (["m", "q", "y"] as Gran[]).map((g) => `<button type="button" class="seg-b${g === gran ? " on" : ""}" data-st="gran" data-v="${g}">Theo ${GRAN_L[g]}</button>`).join("");
  const quick = [3, 6, 12].map((n) => `<button type="button" class="seg-b" data-st="range" data-v="${n}">${n} tháng gần nhất</button>`).join("");
  return `<div class="card ctl-bar"><label>Từ kỳ<select class="fld" data-st="tFrom">${opt(from)}</select></label><label>Đến kỳ<select class="fld" data-st="tTo">${opt(to)}</select></label><div class="seg">${seg}</div><div class="seg">${quick}</div></div>`;
}
const dlt = (a: number | null, b: number | null | undefined) => (a == null || b == null || !b ? null : (a - b) / Math.abs(b));
const dTxt = (d: number | null, good = 1) => (d == null ? "" : `<span class="c-${d * good >= 0 ? "stable" : "critical"}">${d >= 0 ? "▲" : "▼"}${pc(Math.abs(d), 0)}</span>`);

/* ==========================================================================
   PHÂN TÍCH CẤP ĐIỀU HÀNH — lợi nhuận theo khách, LTV / CAC, dự báo dòng tiền
   ========================================================================== */
/* ---------- Lợi nhuận ròng theo khách ---------- */
function profitCards(v: VM, PF: Profitability): string {
  const GS = v.seg ? SEG_GROUPS[v.seg] : GROUPS;
  const baseRows = PF.rows.filter((r) => GS.includes(r.nhom) || (!v.seg && !GROUPS.includes(r.nhom)));
  if (!baseRows.length) return card("Lợi nhuận theo khách", "Khách nào thực sự có lời", "", empty("Kỳ này chưa có GMV thực tế"));
  const g = v.st.cpG && v.st.cpG !== "all" && GS.includes(v.st.cpG) ? v.st.cpG : null;
  const rows = g ? baseRows.filter((r) => r.nhom === g) : baseRows;
  const seg = GS.length < 2 ? "" : `<div class="seg">${["all", ...GS].map((x) => `<button type="button" class="seg-b${(g || "all") === x ? " on" : ""}" data-st="cpG" data-v="${x}">${x === "all" ? "Tất cả" : x}</button>`).join("")}</div>`;
  const S = (f: (r: CustProfit) => number) => sum(rows, f);
  const wf = waterfall([
    { l: "Margin net", v: S((r) => r.mgNet), kind: "total" },
    { l: "Hoa hồng PM", v: -S((r) => r.pmC) }, { l: "Hoa hồng Sales", v: -S((r) => r.salesC + r.saasC) },
    { l: "Partnership", v: -S((r) => r.partC) }, { l: "Chi phí phục vụ", v: -S((r) => r.cts) },
    { l: "Chi phí vốn", v: -S((r) => r.capital) }, { l: "Lợi nhuận ròng", v: S((r) => r.net), kind: "total" },
  ]);
  const pos = rows.filter((r) => r.net > 0).slice(0, 8), neg = rows.filter((r) => r.net < 0).slice(-8).reverse();
  const pick = [...pos, ...neg];
  const rng = Math.max(...pick.map((r) => Math.abs(r.net)), 1);
  const bars = divBars(pick.map((r) => ({ l: r.ten, sub: `${r.nhom} · PM ${r.pm} · GMV ${tien(r.gmv)}`, v: r.net, c: r.net < 0 ? "critical" : D("green"), txt: (r.net < 0 ? "−" : "") + tien(Math.abs(r.net)), dr: `cust:${r.ma_kh}` })), rng) +
    `<div class="small" style="margin-top:6px">${pos.length} khách lời nhiều nhất và ${neg.length} khách lỗ nhiều nhất (lỗ nặng nhất ở dưới cùng)${g ? " của nhóm " + g : ""}.</div>`;
  const med = rows.map((r) => r.gmv).sort((a, b) => a - b)[Math.floor(rows.length / 2)] || 0;
  const sc = scatter(rows.filter((r) => r.gmv > 0).map((r) => ({
    x: r.gmv / unit().chia, y: (r.netPct || 0) * 100, r: Math.abs(r.net), l: r.ten, c: r.net < 0 ? "critical" : GC[r.nhom] || "accent", dr: `cust:${r.ma_kh}`,
    tip: `${r.ten} (${r.nhom}) · GMV ${tien(r.gmv)} · lợi nhuận ròng ${tien(r.net)} (${pc(r.netPct, 2)})`,
  })), { xl: `GMV (${unitLabel()}, thang log)`, yl: "% lợi nhuận ròng / GMV", fx: logTick, fy: pctN, qx: med / unit().chia, qy: 0, logX: true, clip: true, h: 420 }) +
    `<div class="small" style="margin-top:6px">Dưới đường ngang = khách lỗ sau khi trừ mọi chi phí phân bổ. Chấm đỏ là khách lỗ; chấm rỗng ở mép = giá trị vượt khung, rê chuột để xem số thật.</div>`;
  // theo nhóm
  const grp = GS.map((x) => { const rs = baseRows.filter((r) => r.nhom === x); return { g: x, n: rs.length, net: sum(rs, (r) => r.net), loss: rs.filter((r) => r.net < 0).length, gmv: sum(rs, (r) => r.gmv), mg: sum(rs, (r) => r.mgNet) }; }).filter((x) => x.n);
  const gtbl = `<table class="cmp"><thead><tr><th>Nhóm</th><th class="r">Khách</th><th class="r">GMV</th><th class="r">Margin net</th><th class="r">Lợi nhuận ròng</th><th class="r">% GMV</th><th class="r">TB / khách</th><th class="r">Khách lỗ</th></tr></thead><tbody>${grp.map((x) => `<tr class="${x.g === "N2" || x.g === "N4" ? "hl" : ""}"><td><b>${x.g}</b><div class="t2 nowrap">${GNAME[x.g]}</div></td><td class="r num">${x.n}</td><td class="r num">${tyN(x.gmv)}</td><td class="r num">${tyN(x.mg)}</td><td class="r num ${x.net < 0 ? "c-critical" : ""}">${tn(x.net)}</td><td class="r num">${pc(x.gmv ? x.net / x.gmv : null, 2)}</td><td class="r num">${tn(x.net / x.n)}</td><td class="r num ${x.loss ? "c-critical" : ""}">${x.loss}</td></tr>`).join("")}</tbody></table>`;
  const tbl = `<table><thead><tr><th>Khách hàng</th><th>Nhóm</th><th>PM</th><th class="r">GMV</th><th class="r">Margin net</th><th class="r">HH PM</th><th class="r">HH Sales</th><th class="r">Partnership</th><th class="r">Phục vụ</th><th class="r">Vốn</th><th class="r">Ngày ứng vốn</th><th class="r">Lợi nhuận ròng</th><th class="r">% GMV</th><th class="r">Thưởng HĐ (CAC)</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.ten)}</td><td>${esc(r.nhom)}</td><td>${esc(r.pm)}</td><td class="r num">${tyN(r.gmv)}</td><td class="r num">${tyN(r.mgNet)}</td><td class="r num">${tyN(r.pmC)}</td><td class="r num">${tyN(r.salesC + r.saasC)}</td><td class="r num">${tyN(r.partC)}</td><td class="r num">${tyN(r.cts)}</td><td class="r num">${tyN(r.capital)}</td><td class="r num">${r.capDays == null ? "—" : n0(r.capDays)}</td><td class="r num ${r.net < 0 ? "c-critical" : ""}">${tyN(r.net)}</td><td class="r num">${pc(r.netPct, 1)}</td><td class="r num">${r.hd ? tyN(r.hd) : "–"}</td></tr>`).join("")}
    <tr class="tot"><td>Tổng ${rows.length} khách</td><td></td><td></td><td class="r num">${tyN(S((r) => r.gmv))}</td><td class="r num">${tyN(S((r) => r.mgNet))}</td><td class="r num">${tyN(S((r) => r.pmC))}</td><td class="r num">${tyN(S((r) => r.salesC + r.saasC))}</td><td class="r num">${tyN(S((r) => r.partC))}</td><td class="r num">${tyN(S((r) => r.cts))}</td><td class="r num">${tyN(S((r) => r.capital))}</td><td></td><td class="r num">${tyN(S((r) => r.net))}</td><td></td><td class="r num">${tyN(S((r) => r.hd))}</td></tr></tbody></table>`;
  const ctsL = PF.ctsMode === "gmv" ? "theo tỷ trọng GMV" : PF.ctsMode === "khach" ? "chia đều mỗi khách active" : "một nửa theo GMV, một nửa chia đều mỗi khách";
  const method = `Hoa hồng chia về khách theo đúng nguồn tạo ra nó (PM theo margin net trong nhóm, Sales và Partnership theo margin của trục Travel / Mobility). Chi phí phục vụ = chi phí vận hành trừ Marketing (${tien(PF.ctsPool)}), phân bổ ${ctsL} — đổi bằng tham số cts_phan_bo = gmv | khach | tron. Chi phí vốn = giá trị bảng kê × (ngày thu − ngày hóa đơn − DPO ${n0(PF.dpo)} ngày) × lãi suất ${pc(PF.rate, 0)}/năm (tham số lai_suat_von_nam); khoản chưa thu tính tới hôm nay. Đối chiếu: tổng lợi nhuận khách + chi phí vốn = EBITDA + Marketing ${tien(PF.marketing)} + thưởng HĐ ${tien(PF.tot.hd)}${Math.abs(PF.unalloc) > 1000 ? ` + hoa hồng chưa chia được về khách ${tien(PF.unalloc)}` : ""}.`;
  return `<div class="card ctl-bar"><span class="ctl-t">Lợi nhuận ròng theo khách${v.seg ? " " + SEG_NAME[v.seg] : ""} — kỳ ${esc(v.ky)}</span>${seg}</div>` +
    `<div class="g2">${card("Từ margin tới lợi nhuận", g ? `Nhóm ${g}: margin net còn lại bao nhiêu` : "Margin net còn lại bao nhiêu sau mọi chi phí", unitLabel(), wf)}${card("Theo nhóm", "Lợi nhuận ròng theo nhóm khách", unitLabel() + " · tô nền N2, N4", `<div class="tw">${gtbl}</div>`)}</div>` +
    `<div class="g2">${card("Lời / lỗ theo khách", "Khách nào thực sự mang lại lợi nhuận ròng", unitLabel() + " · bấm để xem chi tiết", bars)}${card("Bản đồ lợi nhuận", "Quy mô so với % lợi nhuận ròng", "kỳ " + esc(v.ky) + " · trục GMV dạng log", sc)}</div>` +
    details(`Xem bảng lợi nhuận ròng của ${rows.length} khách (${unitLabel()})`, tbl + `<div class="small" style="margin-top:8px">${esc(method)}</div>`);
}

/* ---------- Dự báo dòng tiền nhiều kịch bản ---------- */
function forecastCards(v: VM, FC: Forecast, full: boolean): string {
  const u = unit().chia;
  const labels = (FC.results[0]?.weeks || []).map((w) => `T${w.i + 1}`);
  const chart = lineChart({ labels: ["Nay", ...labels], series: FC.results.map((r) => ({ name: r.sc.name.split(" — ")[0], c: r.sc.c, vals: [FC.start / u, ...r.weeks.map((w) => w.bal / u)], w: r.sc.key === "base" ? 2.6 : 1.6, dash: r.sc.key === "custom" })), ft: (x) => axisNum(x) + " " + unit().nhan, fy: axisNum, h: 280, W: 720 });
  const scName = (n: string) => { const [a, b] = n.split(" — "); return `<b>${esc(a)}</b>${b ? `<div class="t2">${esc(b)}</div>` : ""}`; };
  const rows = FC.results.map((r) => `<tr><td><div class="sc-n"><i class="dot-c" style="background:var(--${r.sc.c})"></i><div>${scName(r.sc.name)}</div></div></td><td class="r num ${(r.weeks[0]?.bal ?? 0) < 0 ? "c-critical" : ""}">${tyN(r.weeks[0]?.bal ?? FC.start)}</td><td class="r"><span class="num ${r.min < 0 ? "c-critical" : ""}">${tyN(r.min)}</span>${r.minWeek >= 0 ? `<div class="t2">tuần ${r.minWeek + 1} · ${fmtDate(r.weeks[r.minWeek].to)}</div>` : ""}</td><td class="r ${r.firstNeg != null ? "c-critical" : "c-stable"}">${r.firstNeg != null ? `tuần ${r.firstNeg + 1}<div class="t2">${fmtDate(r.weeks[r.firstNeg].to)}</div>` : "không âm"}</td></tr>`).join("");
  const sumTbl = `<table><thead><tr><th>Kịch bản</th><th class="r">Cuối tuần tới</th><th class="r">Thấp nhất</th><th class="r">Bắt đầu âm</th></tr></thead><tbody>${rows}</tbody></table>`;
  const warn = FC.results.find((r) => r.sc.key === "warn");
  const ans = warn ? `<div class="answer ${warn.firstNeg != null ? "bad" : "good"}"><b>Nếu tỷ lệ thu đúng hạn giảm xuống ${Math.round(warn.sc.rate * 100)}% (mức cảnh báo cao):</b> số dư cuối tuần tới ${tien(warn.weeks[0]?.bal ?? FC.start)}; ${warn.firstNeg != null ? `<b>bắt đầu âm từ tuần ${warn.firstNeg + 1}</b> (${fmtDate(warn.weeks[warn.firstNeg].to)}), đáy ${tien(warn.min)} ở tuần ${warn.minWeek + 1}.` : `không âm trong 12 tuần, thấp nhất ${tien(warn.min)}${warn.minWeek >= 0 ? ` ở tuần ${warn.minWeek + 1}` : ""}.`}</div>` : "";
  const rateSel = `<label>Thử tỷ lệ thu đúng hạn<select class="fld" data-st="rate"><option value="">— chọn —</option>${[1, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.5, 0.4, 0.3].map((x) => `<option value="${x}"${v.st.rate === x ? " selected" : ""}>${Math.round(x * 100)}%</option>`).join("")}</select></label>`;
  const head = `<div class="fc-ctl">${rateSel}<span class="small">Tỷ lệ lịch sử ${pc(FC.baseRate, 0)} · khoản trễ về sau bình quân ${n0(FC.baseDelay)} ngày · xuất phát từ ${esc(FC.startNote)}: <b class="num">${tien(FC.start)}</b></span></div>`;
  if (!full) return card("Dòng tiền 12 tuần tới", "Số dư tiền theo kịch bản thu tiền", `<a href="#" data-go="cash" class="small">Xem chi tiết</a>`, head + chart + ans);
  const scSel = FC.results.find((r) => r.sc.key === (v.st.fcScn || (v.st.rate != null ? "custom" : "base"))) || FC.results[1] || FC.results[0];
  const segSc = `<div class="seg">${FC.results.map((r) => `<button type="button" class="seg-b${r === scSel ? " on" : ""}" data-st="fcScn" data-v="${r.sc.key}">${esc(r.sc.name.split(" — ")[0])}</button>`).join("")}</div>`;
  const wk = `<table><thead><tr><th>Tuần</th><th class="r">Thu nợ hiện có</th><th class="r">Thu bảng kê sắp phát hành*</th><th class="r">Trả NCC hiện có</th><th class="r">Trả NCC ước tính*</th><th class="r">Chi phí vận hành</th><th class="r">Hoa hồng</th><th class="r">Ròng</th><th class="r">Số dư</th></tr></thead><tbody>${scSel.weeks.map((w) => `<tr><td>T${w.i + 1} <span class="small">${fmtDate(w.from).slice(0, 5)}–${fmtDate(w.to).slice(0, 5)}</span></td><td class="r num">${w.inAr ? tyN(w.inAr) : "–"}</td><td class="r num">${w.inEst ? tyN(w.inEst) : "–"}</td><td class="r num">${w.outAp ? tyN(w.outAp) : "–"}</td><td class="r num">${w.outEst ? tyN(w.outEst) : "–"}</td><td class="r num">${tyN(w.outOpex)}</td><td class="r num">${w.outComm ? tyN(w.outComm) : "–"}</td><td class="r num ${w.net < 0 ? "c-critical" : ""}">${tyN(w.net)}</td><td class="r num ${w.bal < 0 ? "c-critical" : ""}"><b>${tyN(w.bal)}</b></td></tr>`).join("")}</tbody></table>`;
  const As = FC.assumptions;
  const assum = `Giả định: phải thu còn mở ${tien(As.arOpen)} (quá hạn ${tien(As.arOverdue)}) về theo ngày đến hạn — phần đúng hạn về đúng ngày, phần còn lại về trễ theo số ngày trễ lịch sử × hệ số kịch bản (thuận lợi 0,8 · cơ sở 1 · cảnh báo 1,3 · xấu 2, thêm 10% không thu được). Bảng kê các tháng sau ${esc(As.lastArKy || "—")} ước theo GMV tháng (thực tế, hoặc kế hoạch) × tỷ lệ bảng kê / GMV lịch sử, bình quân ${tien(As.avgBill)}/tháng; hóa đơn NCC ước theo giá vốn, bình quân ${tien(As.avgAp)}/tháng, rải 4 lần trong tháng; chi phí vận hành ${tien(As.opexMonth)}/tháng (không tính khấu hao); hoa hồng ${tien(As.commMonth)}/tháng chi ngày 10 tháng sau. * là số ước tính.`;
  return card("Dự báo dòng tiền", "Số dư tiền 12 tuần tới theo kịch bản thu tiền", unitLabel(), head + `<div class="fc-grid"><div>${chart}</div><div><div class="tw">${sumTbl}</div>${ans}</div></div>`) +
    card("Chi tiết theo tuần", "Tiền vào, tiền ra từng tuần", unitLabel(), segSc + `<div class="tw" style="margin-top:10px">${wk}</div><div class="small" style="margin-top:8px">${esc(assum)}</div>`);
}

/* ---------- Thêm dòng công nợ (khách / NCC mới hoặc kỳ mới) ---------- */
const NHOM_OPT = GROUPS.map((g) => `<option value="${g}">${g} — ${GNAME[g]}</option>`).join("");
function addArForm(ky: string): string {
  return `<details class="add-det"><summary>+ Thêm dòng công nợ phải thu (khách mới, hoặc kỳ chưa có trong file)</summary>
  <div class="cn-form" data-loai="ar" data-them="1" data-moi="1">
    <label>Mã khách hàng *<input type="text" class="fld" list="dl-kh" data-f="__ma" placeholder="chọn hoặc gõ mã mới"></label>
    <label>Kỳ nợ *<input type="text" class="fld" data-f="__ky" value="${esc(ky)}"></label>
    <label>Ngày gửi bảng kê<input type="date" class="fld" data-f="ngay_gui_bk"></label>
    <label>Ngày hóa đơn<input type="date" class="fld" data-f="ngay_hd"></label>
    <label>Ngày đến hạn *<input type="date" class="fld" data-f="ngay_den_han"></label>
    <label>Phải thu (VND) *<input type="number" class="fld" data-f="so_tien" step="1000" inputmode="numeric"></label>
    <label>Đã thu (VND)<input type="number" class="fld" data-f="da_thu" step="1000" inputmode="numeric"></label>
    <label>Ngày thu đủ<input type="date" class="fld" data-f="ngay_thu_du"></label>
    <label class="wide">Ghi chú<input type="text" class="fld" data-f="ghi_chu"></label>
    <div class="cn-note">Khách chưa có trong danh mục thì điền thêm các ô dưới — hệ thống tự thêm khách vào danh mục. Khách đã có thì bỏ trống.</div>
    <label>Tên khách hàng<input type="text" class="fld" data-f="__ten"></label>
    <label>Nhóm<select class="fld" data-f="__nhom"><option value="">—</option>${NHOM_OPT}</select></label>
    <label>PM phụ trách<input type="text" class="fld" data-f="__pm"></label>
    <label>Sales<input type="text" class="fld" data-f="__sales"></label>
    <label>Credit term (ngày)<input type="number" class="fld" data-f="__term"></label>
    <div class="cn-act"><button type="button" class="btn primary cn-save">Thêm dòng</button></div>
  </div></details>`;
}
const NGANH = ["Hotel", "Flight", "Mobility", "SaaS", "F&B", "Khác"];
function addApForm(ky: string): string {
  return `<details class="add-det"><summary>+ Thêm dòng công nợ phải trả (nhà cung cấp mới, hoặc kỳ chưa có trong file)</summary>
  <div class="cn-form" data-loai="ap" data-them="1" data-moi="1">
    <label>Mã nhà cung cấp *<input type="text" class="fld" list="dl-ncc" data-f="__ma" placeholder="chọn hoặc gõ mã mới"></label>
    <label>Kỳ<input type="text" class="fld" data-f="__ky" value="${esc(ky)}"></label>
    <label>Ngày hóa đơn *<input type="date" class="fld" data-f="ngay_hd"></label>
    <label>Ngày đến hạn *<input type="date" class="fld" data-f="ngay_den_han"></label>
    <label>Phải trả (VND) *<input type="number" class="fld" data-f="so_tien" step="1000" inputmode="numeric"></label>
    <label>Đã trả (VND)<input type="number" class="fld" data-f="da_tra" step="1000" inputmode="numeric"></label>
    <label>Ngày trả<input type="date" class="fld" data-f="ngay_tra"></label>
    <label class="wide">Ghi chú<input type="text" class="fld" data-f="ghi_chu"></label>
    <div class="cn-note">Nhà cung cấp chưa có trong danh mục thì điền thêm các ô dưới. Đã có thì bỏ trống.</div>
    <label>Tên nhà cung cấp<input type="text" class="fld" data-f="__ten"></label>
    <label>Ngành<select class="fld" data-f="__nganh">${NGANH.map((n) => `<option value="${n}">${n}</option>`).join("")}</select></label>
    <label>Payment term (ngày)<input type="number" class="fld" data-f="__term"></label>
    <label>Partnership phụ trách<input type="text" class="fld" data-f="__part"></label>
    <div class="cn-act"><button type="button" class="btn primary cn-save">Thêm dòng</button></div>
  </div></details>`;
}

/* ---------- Nhập GMV theo từng khách ---------- */
function gmvKhCard(v: VM): string {
  if (!v.canEdit) return "";
  const { C, ky } = v;
  const tay = C.D.gmv.filter((r) => r.tay && r.ky === ky);
  const inp = (khoa: string, val: number | null, note = "") => {
    const x = val == null ? "" : String(Number((val / unit().chia).toFixed(6)));
    return `<td class="r"><input type="number" step="any" class="fld nq-in tay" data-nhom="gmvkh" data-ky="${esc(ky)}" data-khoa="${esc(khoa)}" data-tien="1" data-goc="${esc(x)}" data-tay="1"${note ? ` data-note="${esc(note)}"` : ""} value="${esc(x)}"></td>`;
  };
  const rows = tay.map((r) => {
    const b = `${r.ma_kh}|${r.dich_vu}`;
    return `<tr><td><b>${esc(v.C.cust.get(r.ma_kh)?.ten_viet_tat || v.C.cust.get(r.ma_kh)?.ten_kh || r.ma_kh)}</b><div class="t2">${esc(r.ma_kh)} · ${esc(r.dich_vu)}${r.ma_ncc ? " · NCC " + esc(r.ma_ncc) : ""}</div></td>${inp(b + "|gmv", r.gmv, r.ma_ncc || "")}${inp(b + "|gia_von", r.gia_von)}${inp(b + "|chiet_khau", r.chiet_khau)}</tr>`;
  }).join("");
  const nw = `<tr class="nq-new" data-nhom="gmvkh" data-ky="${esc(ky)}"><td><div class="nq-new-f"><input type="text" class="fld nq-ma" list="dl-kh" placeholder="Mã khách"><select class="fld nq-dv">${(v.seg ? SEG_DV[v.seg] : SVCS_ALL).map((s) => `<option>${s}</option>`).join("")}</select><input type="text" class="fld nq-ncc" list="dl-ncc" placeholder="Mã NCC (nếu có)"></div></td>
    <td class="r"><input type="number" step="any" class="fld nq-v" data-sfx="|gmv" placeholder="GMV"></td><td class="r"><input type="number" step="any" class="fld nq-v" data-sfx="|gia_von" placeholder="Giá vốn"></td><td class="r"><input type="number" step="any" class="fld nq-v" data-sfx="|chiet_khau" placeholder="Chiết khấu"></td></tr>`;
  const kh = `<div class="nq-kh"><span class="small">Khách mới chưa có trong danh mục:</span><input type="text" class="fld nq-kh-f" data-k="ten_kh" placeholder="Tên khách hàng"><select class="fld nq-kh-f" data-k="nhom"><option value="">Nhóm</option>${NHOM_OPT}</select><input type="text" class="fld nq-kh-f" data-k="pm" placeholder="PM"><input type="text" class="fld nq-kh-f" data-k="sales" placeholder="Sales"></div>`;
  return card("Cập nhật trực tiếp", `GMV theo khách — kỳ ${esc(ky)}`, `${tay.length} dòng nhập tay`, `<div class="nq-form" data-nhom="gmvkh">
    <div class="tw"><table class="nq"><thead><tr><th>Khách · dịch vụ</th><th class="r">GMV (${unit().nhan})</th><th class="r">Giá vốn (${unit().nhan})</th><th class="r">Chiết khấu KH (${unit().nhan})</th></tr></thead><tbody>${rows}${nw}</tbody></table></div>${kh}
    <div class="nq-act"><span class="small">Thêm khách phát sinh trong kỳ mà file chưa có, hoặc sửa GMV một khách. Một dòng ở đây thay cho dòng file cùng khách + cùng dịch vụ. Số nhập theo đơn vị <b>${esc(unitLabel())}</b>; xóa ô GMV để bỏ dòng. Upload file GMV của kỳ này sẽ ghi đè các dòng nhập tay.</span><button type="button" class="btn primary nq-save">Lưu số đã nhập</button></div>
  </div>`);
}

/* ==========================================================================
   TỔNG QUAN ĐIỀU HÀNH — một trang gộp Tổng quan + Góc nhìn CEO + Xu hướng.
   Chỉ giữ những gì dùng để ra quyết định ngay:
     1. Tóm tắt điều hành            4. Dòng tiền 12 tuần tới (kịch bản)
     2. Hai mảng đặt cạnh nhau       5. Vì sao GMV đổi · khách lời / lỗ · tuổi nợ
     3. Xu hướng tháng / quý / năm
   ========================================================================== */
interface SegSnap { seg: Seg; P: Period; prev: number | null; sc: SegComm; A: AR; ot: number | null; act: number; actPrev: number | null; net: number; loss: number; ltv: import("./insight").LtvRow }
function segSnap(v: VM, seg: Seg, PF: Profitability, LC: ReturnType<typeof ltvCac>): SegSnap {
  const Cs = segCtx(v.C, seg), ky = v.ky;
  const P = periodOf(Cs, ky);
  const prevK = kyAdd(ky, -1);
  const prev = hasActual(Cs, prevK) ? periodOf(Cs, prevK).totAct : null;
  const sc = segComm(v.C, v.P, seg);
  const gs = SEG_GROUPS[seg];
  const rows = PF.rows.filter((r) => gs.includes(r.nhom));
  return {
    seg, P, prev, sc, A: calcAR(Cs), ot: onTimeLatest(v.C, ky, seg).rate,
    act: sum(P.cust.groups.filter((g) => gs.includes(g.g)), (g) => g.act),
    actPrev: prev != null ? sum(P.cust.groups.filter((g) => gs.includes(g.g)), (g) => g.prev) : null,
    net: sum(rows, (r) => r.net), loss: rows.filter((r) => r.net < 0).length, ltv: LC.seg[seg],
  };
}

function homeView(v: VM): string {
  const { C, P, A, B, CS, ky } = v;
  const PF = customerProfit(C, ky, B);
  const LC = ltvCac(C, ky, B);
  const FC = cashForecast(C, A, B, CS, 12, v.st.rate ?? null);
  const S = (["ts", "m"] as Seg[]).map((s) => segSnap(v, s, PF, LC));

  /* ---- 1. Tóm tắt ---- */
  const pts: [string, string][] = [];
  let lead = P.hasActual ? `Kỳ ${ky}: GMV ${ty(P.totAct)}` + (P.totTgt ? ` (${pc(P.x)} kế hoạch)` : "") + `, margin net ${ty(P.gp)}` + (ok(P.ebitda) ? `, EBITDA ${ty(P.ebitda as number)}.` : ".") : `Kỳ ${ky} chưa có GMV thực tế.`;
  S.forEach((x) => {
    if (!x.P.totAct && !x.P.totTgt) return;
    const d = x.prev ? (x.P.totAct - x.prev) / x.prev : null;
    pts.push([`${SEG_NAME[x.seg]}: GMV ${tien(x.P.totAct)}${x.P.totTgt ? ` = ${pc(x.P.x, 0)} kế hoạch` : ""}${d != null ? ` (${d >= 0 ? "+" : "−"}${pc(Math.abs(d), 0)} so tháng trước)` : ""}, margin ${pc(x.P.totAct ? x.P.gp / x.P.totAct : null, 2)}`, !ok(x.P.x) ? "neutral" : (x.P.x as number) >= 0.9 ? "stable" : (x.P.x as number) >= 0.7 ? "high" : "critical"]);
  });
  const warn = FC.results.find((r) => r.sc.key === "warn"), base = FC.results.find((r) => r.sc.key === "base");
  if (base) pts.push([base.firstNeg != null ? `Tiền mặt: kịch bản cơ sở ÂM từ tuần ${base.firstNeg + 1} (${fmtDate(base.weeks[base.firstNeg].to)}), đáy ${tien(base.min)}` : `Tiền mặt: kịch bản cơ sở không âm 12 tuần tới, thấp nhất ${tien(base.min)}`, base.firstNeg != null ? "critical" : "stable"]);
  if (warn && base && warn.firstNeg != null && (base.firstNeg == null || warn.firstNeg < base.firstNeg)) pts.push([`Nếu thu đúng hạn chỉ ${Math.round(warn.sc.rate * 100)}%: âm tiền sớm hơn, từ tuần ${warn.firstNeg + 1}`, "critical"]);
  if (A.o60 > 0) pts.push([`${tien(A.o60)} nợ phải thu quá 60 ngày (${pc(A.tot ? A.o60 / A.tot : null, 0)} tổng)` + (A.top && A.conc >= 0.15 ? `; ${A.top.ten} chiếm ${pc(A.conc, 0)} dư nợ` : ""), "critical"]);
  const loss = PF.rows.filter((r) => r.net < 0);
  if (loss.length) pts.push([`${loss.length}/${PF.rows.length} khách lỗ ròng sau hoa hồng, chi phí phục vụ và chi phí vốn — tổng ${tien(sum(loss, (r) => r.net))}`, "high"]);
  const top = v.AL.find((a) => a.why && a.sev === "critical") || v.AL.find((a) => a.why);
  if (top?.why?.items[0]) pts.push([`${top.msg.split(" đạt ")[0]} — ${top.why.items[0].t}`, "high"]);
  const cnt = { critical: 0, high: 0, watch: 0 };
  v.AL.forEach((a) => cnt[a.sev]++);
  const chips = ([["critical", "Khẩn"], ["high", "Cao"], ["watch", "Theo dõi"]] as const).map(([s2, l]) => `<span class="pill dot p-${cnt[s2] ? s2 : "neutral"}" style="cursor:pointer" data-go="alerts">${l} ${cnt[s2]}</span>`).join("");
  const band = `<div class="card banner"><div class="eyebrow">Tóm tắt điều hành</div><p>${esc(lead)}</p>${pts.length ? `<ul class="band-list">${pts.map(([t, c]) => `<li class="bl-${c}">${esc(t)}</li>`).join("")}</ul>` : ""}<div class="chips" style="margin-top:10px">${chips}</div></div>`;

  /* ---- 2. Hai mảng đặt cạnh nhau ---- */
  const col = (x: SegSnap | null) => {
    const p = x ? x.P : P, a = x ? x.A : A;
    const comm = x ? x.sc.total : P.comm, after = p.gp - comm;
    const ebitda = x ? (x.seg === "ts" ? p.ebitda : null) : P.ebitda;
    const d = x ? (x.prev ? (p.totAct - x.prev) / x.prev : null) : (hasActual(C, kyAdd(ky, -1)) ? dlt(P.totAct, periodOf(C, kyAdd(ky, -1)).totAct) : null);
    const ot = x ? x.ot : segOnTime(v);
    const lt = x ? x.ltv : LC.all;
    const net = x ? x.net : PF.tot.net, ls = x ? x.loss : loss.length;
    const act = x ? x.act : sum(P.cust.groups, (g) => g.act);
    return [
      `<b class="num">${tyN(p.totAct)}</b>${d != null ? `<div class="t2">${dTxt(d)} so tháng trước</div>` : ""}`,
      p.totTgt ? `<span class="num c-${stCls(p.x)}">${pc(p.x, 0)}</span><div class="t2">${tyN(p.totTgt)} kế hoạch</div>` : "—",
      `<span class="num">${tyN(p.gp)}</span><div class="t2">${pc(p.totAct ? p.gp / p.totAct : null, 2)} GMV</div>`,
      `<span class="num">${tyN(comm)}</span>`,
      `<span class="num ${after < 0 ? "c-critical" : ""}">${tyN(after)}</span>`,
      ok(ebitda) ? `<span class="num ${(ebitda as number) < 0 ? "c-critical" : ""}">${tyN(ebitda)}</span>` : `<span class="c-muted small">${x?.seg === "m" ? "chưa tách chi phí" : "—"}</span>`,
      `<span class="num ${net < 0 ? "c-critical" : ""}">${tyN(net)}</span><div class="t2">${ls} khách lỗ</div>`,
      `<span class="num">${n0(act)}</span>`,
      `<span class="num">${tyN(a.tot)}</span><div class="t2 ${a.tot && a.od / a.tot > 0.25 ? "c-critical" : ""}">quá hạn ${pc(a.tot ? a.od / a.tot : null, 0)}</div>`,
      ok(ot) ? `<span class="num c-${(ot as number) >= num(C.D, "nguong_dung_han") ? "stable" : (ot as number) >= 0.7 ? "high" : "critical"}">${pc(ot, 0)}</span>` : "—",
      ok(lt.ratio) ? `<span class="num c-${(lt.ratio as number) >= 3 ? "stable" : (lt.ratio as number) >= 1 ? "high" : "critical"}">${N1.format(lt.ratio as number)}×</span><div class="t2">CAC ${tn(lt.cac || 0)}</div>` : "—",
    ];
  };
  const labels = ["GMV", "% đạt kế hoạch", "Margin net", "Hoa hồng", "Margin sau hoa hồng", "EBITDA", "Lợi nhuận ròng theo khách", "Khách active", "Nợ phải thu", `Thu đúng hạn (kỳ nợ ${onTimeLatest(C, ky).ky})`, "LTV / CAC"];
  const cols = [col(S[0]), col(S[1]), col(null)];
  const cmp = `<table class="cmp seg-cmp"><thead><tr><th>${esc(unitLabel())}</th><th class="r"><a href="#" data-go="ts:revenue">Travel & SaaS <i class="ri-arrow-right-up-line"></i></a></th><th class="r"><a href="#" data-go="m:revenue">Mobility <i class="ri-arrow-right-up-line"></i></a></th><th class="r">Toàn công ty</th></tr></thead><tbody>${labels.map((l, i) => `<tr${i === 6 || i === 10 ? ' class="hl"' : ""}><td>${esc(l)}</td>${cols.map((c) => `<td class="r">${c[i]}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  const cmpCard = card("Hai mảng kinh doanh", "Mảng nào đang kéo, mảng nào đang níu", "bấm tên mảng để xem chi tiết", `<div class="tw">${cmp}</div><div class="small" style="margin-top:6px">Chi phí vận hành hiện chỉ có cho Travel & SaaS, nên EBITDA Mobility chưa tính. Hoa hồng tách theo trục từ bảng hoa hồng toàn công ty.</div>`);
  const AREA_RANK: Record<string, number> = { "Thanh khoản": 0, GMV: 1, "Công nợ": 2, "Thu đúng hạn": 3, Margin: 4, "Chi phí": 5, "Thu tiền": 6, "Payment term": 7, "Dòng tiền": 8, "Khách hàng": 9, "Dữ liệu": 10 };
  const SEV: Record<string, number> = { critical: 0, high: 1, watch: 2 };
  const ranked = v.AL.slice().sort((a, b) => SEV[a.sev] - SEV[b.sev] || (AREA_RANK[a.area] ?? 9) - (AREA_RANK[b.area] ?? 9));
  const alertCard = card("Cần xử lý", "Việc ưu tiên", `<a href="#" data-go="alerts" class="small">Xem tất cả ${v.AL.length}</a>`, alertHTML(ranked.slice(0, 5)));

  /* ---- 3. Xu hướng ---- */
  const trend = homeTrend(v);

  /* ---- 4–5. Dòng tiền, nguyên nhân, khách, công nợ ---- */
  const fc = forecastCards(v, FC, false);
  let bridge = card("Vì sao GMV thay đổi", "Cầu nối GMV kỳ trước → kỳ này", "", empty("Chưa có số liệu kỳ trước để so sánh"));
  if (P.hasActual && hasActual(C, kyAdd(ky, -1))) {
    const b = gmvBridge(C, ky, () => true);
    bridge = card("Vì sao GMV thay đổi", `Cầu nối GMV ${esc(kyAdd(ky, -1))} → ${esc(ky)}`, unitLabel(), waterfall([
      { l: `GMV ${kyShort(kyAdd(ky, -1))}`, v: b.prev, kind: "total" }, { l: `Khách mới (${b.nNew})`, v: b.nw }, { l: `Khách tăng (${b.nUp})`, v: b.up },
      { l: `Khách giảm (${b.nDown})`, v: b.down }, { l: `Khách ngừng (${b.nLost})`, v: b.lost }, { l: `GMV ${kyShort(ky)}`, v: b.cur, kind: "total" },
    ]) + (b.byPm.length ? `<div class="small" style="margin:10px 0 2px">Thay đổi GMV theo PM phụ trách</div>` + divBars(b.byPm.slice().sort((x, y) => x.d - y.d).slice(0, 6).map((p) => ({ l: "PM " + p.pm, sub: `${tien(p.a)} → ${tien(p.b)} · ${p.n} khách`, v: p.d, c: p.d < 0 ? "critical" : D("green"), txt: (p.d >= 0 ? "+" : "−") + tien(Math.abs(p.d)) })), Math.max(...b.byPm.map((p) => Math.abs(p.d)), 1)) : ""));
  }
  const pos = PF.rows.filter((r) => r.net > 0).slice(0, 6), neg = PF.rows.filter((r) => r.net < 0).slice(-6).reverse();
  const pick = [...pos, ...neg], rng = Math.max(...pick.map((r) => Math.abs(r.net)), 1);
  const profit = card("Lợi nhuận theo khách", "Khách nào thực sự có lời", unitLabel() + " · chi tiết ở tab Khách hàng của từng mảng", pick.length ? divBars(pick.map((r) => ({ l: r.ten, sub: `${r.nhom} · PM ${r.pm} · GMV ${tien(r.gmv)}`, v: r.net, c: r.net < 0 ? "critical" : D("green"), txt: (r.net < 0 ? "−" : "") + tien(Math.abs(r.net)), dr: `cust:${r.ma_kh}` })), rng) : empty("Kỳ này chưa có GMV thực tế"));
  const arCard = card("Rủi ro thu tiền", "Công nợ phải thu theo tuổi nợ", asOfTxt(C), `<div class="stat-row">${stat("Quá hạn", pc(A.tot ? A.od / A.tot : null, 0), A.tot && A.od / A.tot > 0.25 ? "critical" : "")}${stat("> 60 ngày", ty(A.o60), A.o60 ? "critical" : "")}${stat("DSO", ok(A.dso) ? n0(A.dso) + " ngày" : "—")}</div>` +
    donut(A.bk.map((x, k): [number, string, string, string] => [x, BCLS[k], AR_BUCKETS[k], `ar:${k}`]), ty(A.tot), "tổng phải thu", { ft: ty, size: 140 }));

  return band +
    `<div class="g75">${cmpCard}${alertCard}</div>` +
    trend +
    `<div class="g2">${fc}${bridge}</div>` +
    `<div class="g2">${profit}${arCard}</div>` +
    details("Xem bảng LTV / CAC theo nhóm khách và cách tính", ltvTable(LC));
}

/** Xu hướng gọn cho trang tổng quan: GMV hai mảng, % margin, bảng tăng / giảm */
function homeTrend(v: VM): string {
  const { C } = v;
  const gran: Gran = v.st.gran || "m";
  const { all, from, to } = trendRange(v);
  const cashFn = (m: string) => { const hs = v.CS.halves.filter((h) => h.h.startsWith(m)); return hs.length ? { thu: sum(hs, (h) => h.thu), chi: sum(hs, (h) => h.chi) } : null; };
  const T = trendData(C, from, to, gran, cashFn);
  const Ts = trendData(segCtx(C, "ts"), from, to, gran), Tm = trendData(segCtx(C, "m"), from, to, gran);
  const keep = T.buckets.map((b, i) => (b.gmv || b.tgt || b.collected ? i : -1)).filter((i) => i >= 0);
  const B = keep.map((i) => T.buckets[i]), BS = keep.map((i) => Ts.buckets[i]), BM = keep.map((i) => Tm.buckets[i]);
  const ctl = `<div class="trend-ctl">${ctlBar(v, all, from, to, gran).replace('<div class="card ctl-bar">', '<div class="ctl-bar in">')}</div>`;
  if (!B.length) return card("Xu hướng", "Tăng / giảm theo thời gian", "", ctl + empty(`Khoảng ${from} – ${to} chưa có số liệu`));
  const u = unit().chia, ft = (x: number) => axisNum(x) + " " + unit().nhan;
  const lab = B.map((b) => b.label + (b.full ? "" : "*"));
  const gmvC = barChart({ labels: lab, stack: true, showTot: true, series: [
    { name: "Travel & SaaS", c: D("cyan"), vals: BS.map((b) => b.gmv / u) },
    { name: "Mobility", c: D("purple"), vals: BM.map((b) => b.gmv / u) },
  ], targets: B.map((b) => (b.tgt ? b.tgt / u : null)), tName: "Kế hoạch toàn công ty", ft, fy: axisNum, h: 250, bw: 40 });
  const pct = (b: TrendBucket) => (ok(b.mgPct) ? (b.mgPct as number) * 100 : null);
  const mgC = lineChart({ labels: lab, series: [
    { name: "Travel & SaaS", c: D("cyan"), vals: BS.map(pct) },
    { name: "Mobility", c: D("purple"), vals: BM.map(pct) },
    { name: "Toàn công ty", c: "ink", vals: B.map(pct), dash: true, w: 1.5 },
  ], ft: (x) => N2.format(x) + "%", fy: (x) => N2.format(x) + "%", h: 250, fit: true });
  const firstData = C.periods.find((p) => hasActual(C, p)) || "";
  const rowsDef: [string, (b: TrendBucket, i: number) => number | null, "money" | "pct" | "n", number][] = [
    ["GMV Travel & SaaS", (_, i) => BS[i].gmv, "money", 1], ["GMV Mobility", (_, i) => BM[i].gmv, "money", 1],
    ["Margin net", (b) => b.mg, "money", 1], ["EBITDA", (b) => b.ebitda, "money", 1],
    ["Khách active", (b) => b.act, "n", 1], ["Khách mới", (b) => (b.months.includes(firstData) ? null : b.nw), "n", 1],
    ["Tiền thu về", (b) => b.collected, "money", 1],
  ];
  const body = rowsDef.filter(([, f]) => B.some((b, i) => f(b, i) != null && f(b, i) !== 0)).map(([l, f, k, good]) => `<tr><td>${esc(l)}</td>${B.map((b, i) => {
    const x = f(b, i), p = i ? f(B[i - 1], i - 1) : null, d = dlt(x, p);
    return `<td class="r"><span class="num">${x == null ? "—" : k === "money" ? tyN(x) : n0(x)}</span>${d != null ? `<div class="t2">${dTxt(d, good)}</div>` : ""}</td>`;
  }).join("")}<td class="r">${spark(B.map((b, i) => f(b, i)))}</td></tr>`).join("");
  const tbl = `<table class="cmp"><thead><tr><th>${esc(unitLabel())}</th>${lab.map((l) => `<th class="r">${esc(l)}</th>`).join("")}<th class="r">Xu hướng</th></tr></thead><tbody>${body}</tbody></table>`;
  return card("Xu hướng", `GMV và margin theo ${GRAN_L[gran]}, hai mảng`, unitLabel(), ctl +
    `<div class="g2 in">${`<div><div class="small" style="margin-bottom:4px">GMV theo mảng · vạch = kế hoạch</div>${gmvC}</div>`}${`<div><div class="small" style="margin-bottom:4px">% margin net trên GMV</div>${mgC}</div>`}</div>` +
    `<div class="tw" style="margin-top:12px">${tbl}</div>${B.some((b) => !b.full) ? `<div class="small" style="margin-top:6px">* ${GRAN_L[gran]} chưa đủ tháng trong khoảng đã chọn.</div>` : ""}`);
}

/** Bảng LTV / CAC (không có biểu đồ) */
function ltvTable(LC: ReturnType<typeof ltvCac>): string {
  const rc = (x: number | null) => (!ok(x) ? "muted" : x >= 3 ? "stable" : x >= 1 ? "high" : "critical");
  const rows = [...LC.rows.filter((r) => r.act || r.nw), LC.seg.ts, LC.seg.m, LC.all];
  const name = (g: string) => (g === "Tổng" ? "Toàn công ty" : GNAME[g] ? `${g} — ${GNAME[g]}` : g);
  return `<div class="tw"><table><thead><tr><th>Nhóm</th><th class="r">Khách active</th><th class="r">Khách mới (${LC.window.length} tháng)</th><th class="r">CAC</th><th class="r">Đóng góp / khách / tháng</th><th class="r">Rời bỏ / tháng</th><th class="r">Vòng đời (tháng)</th><th class="r">LTV</th><th class="r">LTV / CAC</th><th class="r">Hoàn vốn (tháng)</th></tr></thead><tbody>${rows.map((r) => `<tr class="${GNAME[r.g] ? "" : "tot"}"><td>${esc(name(r.g))}</td><td class="r num">${n0(r.act)}</td><td class="r num">${n0(r.nw)}</td><td class="r num">${ok(r.cac) ? tyN(r.cac) : "—"}</td><td class="r num">${ok(r.contrib) ? tyN(r.contrib) : "—"}</td><td class="r num">${ok(r.churn) ? pc(r.churn, 1) : "—"}</td><td class="r num">${N1.format(r.life)}</td><td class="r num">${ok(r.ltv) ? tyN(r.ltv) : "—"}</td><td class="r num c-${rc(r.ratio)}">${ok(r.ratio) ? N1.format(r.ratio as number) + "×" : "—"}</td><td class="r num">${ok(r.payback) ? N1.format(r.payback as number) : "—"}</td></tr>`).join("")}</tbody></table></div>
    <div class="small" style="margin-top:8px">CAC = (Marketing + ${pc(LC.salesShare, 0)} Lương & nhân sự + thưởng hợp đồng mới) ÷ số khách có GMV lần đầu, ${LC.window.length} tháng gần nhất. Đóng góp = margin net − hoa hồng − chi phí vốn. Vòng đời = 1 ÷ tỷ lệ rời bỏ bình quân, tối đa ${LC.cap} tháng. Đổi bằng tham số cac_so_thang, tl_luong_sales, ltv_thang_toi_da.</div>${LC.notes.length ? `<ul class="small">${LC.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}`;
}

/* ==========================================================================
   CHI PHÍ VẬN HÀNH (Travel & SaaS)
   ========================================================================== */
const OPEX_C = [D("purple"), D("cyan"), D("orange"), D("blue"), D("green"), D("yellow"), D("red"), D("gray"), D("purple", "medium"), D("cyan", "medium")];
const BELOW = ["Khấu hao", "Lãi vay", "Thuế TNDN"];
function opexView(v: VM): string {
  const { C, P, ky } = v;
  const kyPrev = kyAdd(ky, -1);
  const rows = C.D.opex.filter((o) => o.ky === ky && !BELOW.includes(o.khoan_muc));
  const prevRows = C.D.opex.filter((o) => o.ky === kyPrev && !BELOW.includes(o.khoan_muc));
  const tot = sum(rows, (o) => o.so_tien), totPrev = sum(prevRows, (o) => o.so_tien);
  const T = C.D.targets.find((t) => t.ky === ky);
  const budget = T?.opex_budget || null;
  const months = monthsBetween(kyAdd(ky, -5), ky).filter((m) => C.D.opex.some((o) => o.ky === m));
  const cats = Array.from(new Set(C.D.opex.filter((o) => months.includes(o.ky) && !BELOW.includes(o.khoan_muc)).map((o) => o.khoan_muc)))
    .sort((a, b) => sum(C.D.opex.filter((o) => o.khoan_muc === b), (o) => o.so_tien) - sum(C.D.opex.filter((o) => o.khoan_muc === a), (o) => o.so_tien));
  const val = (m: string, c: string) => sum(C.D.opex.filter((o) => o.ky === m && o.khoan_muc === c), (o) => o.so_tien);
  if (!rows.length && !months.length) return `<div class="card notice">Chưa có sheet CHI_PHI. Upload ở tab <a href="#" data-go="data">Dữ liệu</a>, hoặc nhập thẳng ngay bên dưới.</div>` + quickOpex(v);

  const d = totPrev ? (tot - totPrev) / totPrev : null;
  const pts: [string, string][] = [];
  let lead = `Chi phí vận hành kỳ ${ky}: ${tien(tot)}` + (d != null ? `, ${d >= 0 ? "tăng" : "giảm"} ${pc(Math.abs(d), 0)} so tháng trước` : "") + (P.gp ? `, bằng ${pc(tot / P.gp, 0)} margin net Travel & SaaS.` : ".");
  if (budget) pts.push([`So ngân sách ${tien(budget)}: ${tot > budget ? "vượt " + tien(tot - budget) : "còn " + tien(budget - tot)} (${pc(tot / budget, 0)})`, tot > budget ? "critical" : "stable"]);
  const chg = cats.map((c) => ({ c, a: val(kyPrev, c), b: val(ky, c) })).map((x) => ({ ...x, d: x.b - x.a })).sort((a, b) => b.d - a.d);
  const up = chg.filter((x) => x.d > 0).slice(0, 3);
  if (up.length && totPrev) pts.push([`Tăng nhiều nhất: ${up.map((x) => `${x.c} +${tien(x.d)}`).join(" · ")}`, "high"]);
  const big = chg.slice().sort((a, b) => b.b - a.b)[0];
  if (big && tot) pts.push([`Khoản lớn nhất: ${big.c} ${tien(big.b)} (${pc(big.b / tot, 0)} tổng chi phí)`, "neutral"]);
  if (P.totAct) pts.push([`Chi phí trên GMV Travel & SaaS: ${pc(tot / P.totAct, 2)}`, "neutral"]);
  if (ok(P.ebitda)) pts.push([`EBITDA Travel & SaaS sau chi phí: ${tien(P.ebitda as number)}`, (P.ebitda as number) < 0 ? "critical" : "stable"]);

  const stats = `<div class="stat-row">${stat("Chi phí vận hành", ty(tot))}${stat("So tháng trước", d == null ? "—" : (d >= 0 ? "+" : "−") + pc(Math.abs(d), 0), d != null && d > 0.1 ? "critical" : "")}${stat("So ngân sách", budget ? pc(tot / budget, 0) : "—", budget && tot > budget ? "critical" : "")}${stat("Trên margin net", pc(P.gp ? tot / P.gp : null, 0), P.gp && tot > P.gp ? "critical" : "")}</div>`;
  const stack = months.length ? barChart({ labels: months.map((m) => m.slice(0, 3) + "." + m.slice(6)), stack: true, showTot: true, series: cats.map((c, i) => ({ name: c, c: OPEX_C[i % OPEX_C.length], vals: months.map((m) => val(m, c) / unit().chia) })), targets: months.map((m) => { const b = C.D.targets.find((t) => t.ky === m)?.opex_budget; return b ? b / unit().chia : null; }), tName: "Ngân sách", ft: (x) => axisNum(x) + " " + unit().nhan, fy: axisNum, h: 260, bw: 44 }) : empty("Chưa có dữ liệu");
  const cmp = hBullet(chg.slice().sort((a, b) => b.b - a.b).map((x) => ({ l: x.c, sub: x.a ? `tháng trước ${tien(x.a)}` : "tháng trước không có", v: x.b, t: x.a || null, c: x.a && x.b > x.a * 1.15 ? "critical" : x.a && x.b < x.a ? "stable" : "accent", txt: tyN(x.b), txt2: x.a ? `${x.d >= 0 ? "+" : "−"}${pc(Math.abs(x.d) / x.a, 0)}` : "mới", vc: x.a && x.b > x.a * 1.15 ? "critical" : "" })));
  const tbl = `<table><thead><tr><th>Khoản mục (${unitLabel()})</th>${months.map((m) => `<th class="r">${m.slice(0, 3)}.${m.slice(6)}</th>`).join("")}<th class="r">Xu hướng</th></tr></thead><tbody>${cats.map((c) => `<tr><td>${esc(c)}</td>${months.map((m, i) => { const x = val(m, c), p = i ? val(months[i - 1], c) : null; const dd = dlt(x, p); return `<td class="r"><span class="num">${x ? tyN(x) : "–"}</span>${dd != null ? `<div class="t2">${dTxt(dd, -1)}</div>` : ""}</td>`; }).join("")}<td class="r">${spark(months.map((m) => val(m, c)), "high")}</td></tr>`).join("")}
    <tr class="tot"><td>Tổng</td>${months.map((m) => `<td class="r num">${tyN(sum(cats, (c) => val(m, c)))}</td>`).join("")}<td></td></tr></tbody></table>`;
  const below = C.D.opex.filter((o) => o.ky === ky && BELOW.includes(o.khoan_muc));
  const al = v.AL.filter((a) => a.area === "Chi phí");
  return execBand("Tóm tắt chi phí", lead, pts) +
    `<div class="g57">${card("Kỳ " + ky, "Chi phí theo khoản mục so với tháng trước", unitLabel() + " · vạch = tháng trước", stats + cmp)}${card("Xu hướng", "Chi phí vận hành 6 tháng", unitLabel() + " · vạch = ngân sách", stack)}</div>` +
    (al.length ? card("Cảnh báo chi phí", "Khoản nào đang tăng bất thường", `${al.length} cảnh báo`, alertHTML(al)) : "") +
    details("Xem bảng chi phí theo tháng" + (below.length ? " (khấu hao, lãi vay, thuế tính riêng dưới EBITDA)" : ""), tbl) + quickOpex(v);
}

/* ==========================================================================
   KPI & HOA HỒNG CỦA MỘT MẢNG — tách từ bảng hoa hồng toàn công ty
   ========================================================================== */
function segKpi(v: VM): string {
  const seg = v.seg as Seg, ts = seg === "ts", Pc = v.Pc, sc = v.sc as SegComm, D0 = v.Cc.D;
  if (!Pc.hasActual) return noActual(v.ky);
  const pool = ts ? Pc.pT : Pc.pM;
  const rPm = num(D0, ts ? "pm_ty_le_travel" : "pm_ty_le_mobility"), rS = num(D0, ts ? "sales_ty_le_travel" : "sales_ty_le_mobility");
  const fHd = sum(D0.staff.filter((s) => s.team === "Sales"), (s) => s.tl_pool_hd || 0);
  const tl = num(D0, "pm_tra_ngay");
  const lead = `Hoa hồng thuộc mảng ${SEG_NAME[seg]} kỳ ${v.ky}: ${tien(sc.total)} — PM ${tien(sc.pm)}, Sales ${tien(sc.sales + sc.hd + sc.saas)}, Partnership ${tien(sc.part)}. Hệ số bậc thưởng ${pc(Pc.H, 0)} áp chung toàn công ty (%đạt GMV toàn công ty ${pc(Pc.x)}).`;
  const pts: [string, string][] = [[`Quỹ ${ts ? "Travel" : "Mobility"} ${tien(pool.v)} = margin ${pc(pool.m, 2)} × GMV, ${pool.peak == null ? "chưa có peak" : `peak ${tien(pool.peak)}`}`, "neutral"]];
  if (v.P.gp) pts.push([`Hoa hồng bằng ${pc(sc.total / v.P.gp, 0)} margin net của mảng`, sc.total / v.P.gp > 0.5 ? "high" : "neutral"]);
  const ot = segOnTime(v);
  if (ok(ot) && (ot as number) < num(D0, "nguong_dung_han")) pts.push([`Thu đúng hạn ${pc(ot, 0)} — phần trả sau của PM bị giảm tương ứng`, "high"]);
  const poolHTML = hStack([
    { l: "Hình thành quỹ", sub: `margin ${pc(pool.m, 2)}`, parts: [[pool.vb, ts ? "accent" : "stable", "Từ GMV nền"], [pool.vs, ts ? "accent" : "stable", "Từ GMV thặng dư", 0.45]], txt: tien(pool.v) },
    { l: "Phân bổ (trước hệ số)", parts: [[pool.v * rPm, "accent", `Team PM ${pc(rPm, 0)}`], [pool.v * rS, "high", `Team Sales ${pc(rS, 0)}`], [pool.v * Math.max(0, 1 - rPm - rS), "neutral-bar", "Công ty"]], txt: tien(pool.v) },
  ], { ft: tien, legend: [["Từ GMV nền / Team PM", "accent"], ["Team Sales", "high"], ["Công ty giữ lại", "neutral-bar"]] });
  const axisOf = (p: { travel: number; mobility: number }) => (ts ? p.travel : p.mobility);
  const pms = Pc.pmPeople.filter((p) => axisOf(p) > 0).map((p) => { const a = axisOf(p), r = p.total ? a / p.total : 0; return { p, a, now: p.now * r, later: p.later * r, lost: (p.laterMax - p.later) * r }; });
  const pmHTML = pms.length ? hStack(pms.map((x) => ({ l: x.p.name, sub: x.p.groups.filter((g) => SEG_GROUPS[seg].includes(g)).join(", "), parts: [[x.now, "accent", `Trả ngay ${pc(tl, 0)}`], [x.later, "stable", "Trả sau — dự kiến"], [x.lost, "critical", "Mất do thu trễ", 0.55]] as [number, string, string, number?][], txt: tien(x.now + x.later), txt2: `trên ${tien(x.a)}` })), { ft: tien, legend: [[`Trả ngay ${pc(tl, 0)}`, "accent"], ["Trả sau — dự kiến", "stable"], ["Mất do khách thu trễ", "critical", 0.55]] }) : empty("Chưa có PM phụ trách nhóm của mảng này (PHAN_BO_PM)");
  const wT = Pc.pT.v * num(D0, "sales_ty_le_travel"), wM = Pc.pM.v * num(D0, "sales_ty_le_mobility"), shareG = wT + wM > 0 ? (ts ? wT : wM) / (wT + wM) : 0;
  const hdSeg = fHd ? sc.hd / fHd : 0, saasSeg = fHd ? sc.saas / fHd : 0;
  const sales = D0.staff.filter((s) => s.team === "Sales").map((s) => { const g = (Pc.sales.find((x) => x.name === s.ho_ten)?.gmv || 0) * shareG, h = hdSeg * (s.tl_pool_hd || 0), sa = saasSeg * (s.tl_pool_hd || 0); return { n: s.ho_ten, g, h, sa, t: g + h + sa }; }).filter((x) => x.t > 0);
  const salesHTML = sales.length ? hStack(sales.map((x) => ({ l: x.n, parts: [[x.g, "accent", "Pool GMV"], [x.h, "high", "Thưởng hợp đồng"], [x.sa, "stable", "Hoa hồng SaaS"]] as [number, string, string][], txt: tien(x.t) })), { ft: tien, legend: [["Pool GMV (nhân hệ số)", "accent"], ["Thưởng hợp đồng", "high"], ["Hoa hồng SaaS", "stable"]] }) : empty("Không có khoản Sales nào thuộc mảng này");
  const parts = Pc.partners.filter((p) => axisOf(p) > 0);
  const partS = ts ? Pc.partT : Pc.partM, score = ts ? Pc.scoreT : Pc.scoreM;
  const partHTML = barChart({ labels: ["%đạt GMV", "%đạt Margin", "%đạt PT", "Điểm KPI"], series: [{ name: SEG_NAME[seg], c: ts ? "accent" : "stable", vals: [partS.g, partS.m, partS.pt, score] }], targets: [1, 1, 1, 1], tName: "100%", showVal: true, fv: (x) => pc(x, 0), ft: (x) => pc(x), fy: (x) => pc(x, 0), h: 220, noLegend: true, max: Math.max(1.25, ...[partS.g, partS.m, partS.pt, score].filter(ok)) * 1.08 }) +
    `<div class="stat-row" style="margin-top:10px">${parts.map((p) => stat(p.name, tien(axisOf(p)))).join("") || stat("Partnership", "—")}${stat("Payment term", ok(partS.term) ? `${n0(partS.term)}/${partS.target} ngày` : "—")}</div>`;
  const grpSet = SEG_GROUPS[seg];
  const cv = Pc.contracts.filter((c) => grpSet.includes(c.nhom) && (c.monthNo <= num(D0, "thoi_han_hd_thang") + 1 || c.payKy === v.ky)).sort((a, b) => b.ratio - a.ratio);
  const conHTML = cv.length ? hBullet(cv.slice(0, 15).map((c) => {
    const st = c.status === "dat" ? [`đạt${c.payKy === v.ky ? " — trả kỳ này " + tien(c.payout) : " (" + c.payKy + ")"}`, "stable"] : c.status === "het_han" ? [`hết hạn — trả ${tien(c.payout)}`, "high"] : [`còn ${Math.max(0, num(D0, "thoi_han_hd_thang") - c.monthNo)} tháng`, "watch"];
    return { l: c.ten, sub: `${c.nhom} · ${c.sales} · tháng ${Math.min(c.monthNo, num(D0, "thoi_han_hd_thang"))}`, v: Math.min(c.ratio, 1.2), t: 1, c: st[1], txt: pc(c.ratio, 0), txt2: st[0], vc: st[1] };
  }), { max: 1.2 }) : empty("Chưa có hợp đồng mới của mảng này trong 6 tháng gần nhất");
  const th = num(D0, "nguong_dung_han");
  const otK = onTimeLatest(v.Cc, v.ky, seg).ky, OT = onTimeByGroup(v.Cc, otK);
  const on = hBullet(grpSet.map((g) => { const o = OT[g]; const c = !ok(o?.rate) ? "ink-3" : (o.rate as number) >= th ? "stable" : (o.rate as number) >= 0.7 ? "high" : "critical"; return { l: g, sub: GNAME[g], v: o?.rate ?? null, t: th, c, txt: pc(o?.rate ?? null, 0), txt2: ok(o?.rate) ? `trả sau còn ${pc((1 - tl) * (o.rate as number), 1)}` : "chưa có dữ liệu", vc: c === "ink-3" ? "" : c, dr: `argroup:${g}` }; }), { max: 1 });
  return execBand("Hoa hồng " + SEG_NAME[seg], lead, pts) +
    `<div class="g57">${card("Áp dụng chung", "Đường hệ số bậc thưởng toàn công ty", ok(Pc.x) ? `nấc <b class="num">${tierIdx(Pc.x as number) + 1}/7</b>` : "chưa có kế hoạch", tierChart(Pc.x, Pc.H, TIERS, tier))}${card("Quỹ " + (ts ? "Travel" : "Mobility"), "Hình thành và phân bổ quỹ", unitLabel(), poolHTML)}</div>` +
    `<div class="g2">${card("Team PM", "Hoa hồng PM phần " + SEG_NAME[seg], unitLabel(), pmHTML)}${card("Team Sales", "Thu nhập Sales phần " + SEG_NAME[seg], unitLabel(), salesHTML)}</div>` +
    `<div class="g2">${card("Team Partnership", "%đạt từng chỉ tiêu & điểm KPI", unitLabel(), partHTML)}${card("Hợp đồng mới", "Tiến độ đạt ngưỡng thưởng", "vạch = ngưỡng", conHTML)}</div>` +
    card("Ảnh hưởng hoa hồng PM", "Tỷ lệ thu đúng hạn theo nhóm", `vạch = ngưỡng ${pc(th, 0)} · kỳ nợ ${esc(otK)}`, on) +
    `<div class="card small">Lịch chi trả và chốt hoa hồng của cả công ty ở <a href="#" data-go="kpi">Tổng quan → KPI & Hoa hồng</a>.</div>`;
}
