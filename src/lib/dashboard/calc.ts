// Toàn bộ công thức của dashboard nằm ở file này — một nguồn duy nhất cho mọi màn hình.
// Quy tắc đã chốt với BLĐ (09/2026):
//  1. Target số KH N5 theo file 4 (nằm trong sheet KE_HOACH)
//  2. Payment term Travel target 30 ngày (tham số target_pt_travel)
//  3. %đạt GMV cho hệ số bậc thưởng = GMV tổng công ty thực tế ÷ kế hoạch tổng công ty
//  4. Peak tính riêng từng trục, theo GMV thực tế, từ kỳ peak_tu_ky
//  5. Phần quỹ chưa phân bổ thuộc về công ty
//  6. Ngưỡng thưởng hợp đồng xét theo GMV lũy kế
//  7. Thu đúng hạn theo giá trị: khoản nợ đúng hạn khi thu ĐỦ trước/đúng ngày đến hạn
//  8. Quỹ PM chia về nhóm theo margin net thực tế của nhóm, sau đó theo số khách phụ trách
import type { DataSet, GmvRow, Customer } from "./types";
import { kyIdx, kyAdd, kyEnd, kyOfDate, days, todayIso, halfIdx, sum, addDays, ok } from "./util";

/* ---------------- Tham số ---------------- */
const DEFAULTS: Record<string, number> = {
  target_margin_hotel: 0.1, target_margin_flight: 0.01, target_margin_mobility: 0.12, target_margin_saas: 0.7, target_margin_fnb: 0.1,
  chiet_khau_mobility: 0.05, target_pt_travel: 30, target_pt_mobility: 35,
  quy_travel_nen: 0.07, quy_travel_thang_du: 0.15, quy_mobility_nen: 0.05, quy_mobility_thang_du: 0.1,
  pm_ty_le_travel: 0.56, pm_ty_le_mobility: 0.46, sales_ty_le_travel: 0.2, sales_ty_le_mobility: 0.35,
  pm_tra_ngay: 0.65, pm_tra_sau_thang: 2,
  thuong_hd_n1: 12_500_000, thuong_hd_n3: 2_000_000, thuong_hd_n5: 300_000, nguong_hd_boi_so: 10, thoi_han_hd_thang: 6,
  saas_hoa_hong: 0.2, partnership_quy_travel: 0.02, partnership_quy_mobility: 0.01,
  partnership_w_gmv: 0.2, partnership_w_margin: 0.5, partnership_w_pt: 0.3, nguong_dung_han: 0.85,
};
export function num(D: DataSet, k: string): number {
  const v = D.params[k];
  if (v != null && v !== "") {
    const s = String(v).trim();
    const n = s.endsWith("%") ? Number(s.slice(0, -1).replace(",", ".")) / 100 : Number(s.replace(",", "."));
    if (isFinite(n)) return n;
  }
  return DEFAULTS[k] ?? 0;
}
export function asOfDate(D: DataSet): string {
  const v = (D.params.ngay_chot_so_lieu || "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return todayIso();
}

/* ---------------- Hệ số bậc thưởng ---------------- */
export const TIERS: [number, number | null, string][] = [
  [0, 0.3, "0%"], [0.3, 0.5, "30%"], [0.5, 0.7, "50%"], [0.7, 0.9, "= %đạt"], [0.9, 1, "100%"], [1, 1.1, "= %đạt"], [1.1, null, "100% + (x−100%)×1,2"],
];
export function tier(x: number): number {
  if (x < 0.3) return 0; if (x < 0.5) return 0.3; if (x < 0.7) return 0.5; if (x < 0.9) return x; if (x < 1) return 1; if (x < 1.1) return x;
  return 1 + (x - 1) * 1.2;
}
export function tierIdx(x: number): number {
  for (let i = 0; i < TIERS.length; i++) { const [a, b] = TIERS[i]; if (x >= a && (b == null || x < b)) return i; }
  return 0;
}

/* ---------------- Dòng dịch vụ ---------------- */
export type Axis = "T" | "M" | "S" | "F";
export const AXIS_NAME: Record<Axis, string> = { T: "Travel", M: "Mobility", S: "SaaS", F: "F&B" };
interface LineDef { k: string; name: string; axis: Axis; grp?: string; tf: keyof import("./types").Target | null; mt: string; match: (r: GmvRow, g: string) => boolean }
const MOBG = ["N2", "N3", "N4", "N5"];
export const LINE_DEFS: LineDef[] = [
  { k: "hotel", name: "Hotel", axis: "T", tf: "gmv_hotel", mt: "target_margin_hotel", match: (r) => r.dich_vu === "Hotel" },
  { k: "flight", name: "Flights", axis: "T", tf: "gmv_flight", mt: "target_margin_flight", match: (r) => r.dich_vu === "Flight" },
  { k: "n2", name: "N2 — Top200 active", axis: "M", grp: "N2", tf: "gmv_n2", mt: "target_margin_mobility", match: (r, g) => r.dich_vu === "Mobility" && g === "N2" },
  { k: "n3", name: "N3 — Top200 lapser", axis: "M", grp: "N3", tf: "gmv_n3", mt: "target_margin_mobility", match: (r, g) => r.dich_vu === "Mobility" && g === "N3" },
  { k: "n4", name: "N4 — Active ngoài Top200", axis: "M", grp: "N4", tf: "gmv_n4", mt: "target_margin_mobility", match: (r, g) => r.dich_vu === "Mobility" && g === "N4" },
  { k: "n5", name: "N5 — Lapser ngoài Top200", axis: "M", grp: "N5", tf: "gmv_n5", mt: "target_margin_mobility", match: (r, g) => r.dich_vu === "Mobility" && g === "N5" },
  { k: "mob_other", name: "Mobility — KH nhóm khác", axis: "M", tf: null, mt: "target_margin_mobility", match: (r, g) => r.dich_vu === "Mobility" && !MOBG.includes(g) },
  { k: "saas_t", name: "SaaS — Travel", axis: "S", tf: "gmv_saas_t", mt: "target_margin_saas", match: (r) => r.dich_vu === "SaaS Travel" },
  { k: "saas_m", name: "SaaS — Mobility", axis: "S", tf: "gmv_saas_m", mt: "target_margin_saas", match: (r) => r.dich_vu === "SaaS Mobility" },
  { k: "fnb", name: "F&B", axis: "F", tf: "gmv_fnb", mt: "target_margin_fnb", match: (r) => r.dich_vu === "F&B" },
];
export interface Line { k: string; name: string; axis: Axis; grp?: string; tgt: number; act: number; cost: number; disc: number; mgGross: number; mgNet: number; mT: number; mgT: number; hasTarget: boolean }

/* ---------------- Tiện ích dữ liệu ---------------- */
export interface Ctx { D: DataSet; cust: Map<string, Customer>; gmvByKy: Map<string, GmvRow[]>; supTerm: Map<string, number>; asOf: string; periods: string[] }
export function makeCtx(D: DataSet): Ctx {
  const cust = new Map(D.customers.map((c) => [c.ma_kh, c]));
  const gmvByKy = new Map<string, GmvRow[]>();
  D.gmv.forEach((r) => { const a = gmvByKy.get(r.ky) || []; a.push(r); gmvByKy.set(r.ky, a); });
  const supTerm = new Map(D.suppliers.map((s) => [s.ma_ncc, s.payment_term]));
  const set = new Set<string>([...D.targets.map((t) => t.ky), ...Array.from(gmvByKy.keys())]);
  const periods = Array.from(set).filter((k) => ok(kyIdx(k))).sort((a, b) => kyIdx(a) - kyIdx(b));
  return { D, cust, gmvByKy, supTerm, asOf: asOfDate(D), periods };
}
const grpOf = (C: Ctx, kh: string) => C.cust.get(kh)?.nhom || "?";
function axisGmv(C: Ctx, ky: string, ax: Axis): number {
  const rows = C.gmvByKy.get(ky) || [];
  return sum(rows.filter((r) => LINE_DEFS.some((l) => l.axis === ax && l.match(r, grpOf(C, r.ma_kh)))), (r) => r.gmv);
}
export function hasActual(C: Ctx, ky: string) { return (C.gmvByKy.get(ky) || []).length > 0; }

function lines(C: Ctx, ky: string): Line[] {
  const D = C.D, rows = C.gmvByKy.get(ky) || [], T = D.targets.find((t) => t.ky === ky);
  const ck = num(D, "chiet_khau_mobility");
  return LINE_DEFS.map((l) => {
    const rs = rows.filter((r) => l.match(r, grpOf(C, r.ma_kh)));
    const act = sum(rs, (r) => r.gmv), cost = sum(rs, (r) => r.gia_von);
    let disc = 0;
    if (l.axis === "M") { const d = sum(rs, (r) => r.chiet_khau || 0); disc = d > 0 ? d : act * ck; }
    const tgt = l.tf && T ? Number(T[l.tf] || 0) : 0;
    const mT = num(D, l.mt);
    const mgGross = act - cost, mgNet = mgGross - disc;
    const mgT = l.axis === "M" ? tgt * (mT - ck) : tgt * mT;
    return { k: l.k, name: l.name, axis: l.axis, grp: l.grp, tgt, act, cost, disc, mgGross, mgNet, mT, mgT, hasTarget: tgt > 0 };
  }).filter((l) => l.k !== "mob_other" || l.act > 0);
}

/* ---------------- Tính một kỳ ---------------- */
export interface Pool { base: number; sur: number; m: number; vb: number; vs: number; v: number; peak: number | null }
function pool(g: number, m: number, peak: number | null, rb: number, rs: number): Pool {
  const base = peak == null ? g : Math.min(g, peak), sur = peak == null ? 0 : Math.max(0, g - peak);
  const mm = ok(m) ? m : 0;
  return { base, sur, m: mm, vb: mm * base * rb, vs: mm * sur * rs, v: mm * base * rb + mm * sur * rs, peak };
}
export interface PersonPay { name: string; team: string; total: number; now: number; later: number; laterMax: number; travel: number; mobility: number; groups: string[] }
export interface ContractView { ma_kh: string; ten: string; nhom: string; sales: string; signKy: string; monthNo: number; bonus: number; threshold: number; cum: number; ratio: number; status: "dat" | "cho" | "het_han"; payKy: string | null; payout: number }

export function calcPeriod(C: Ctx, ky: string) {
  const D = C.D;
  const L = lines(C, ky);
  const ax = (a: Axis) => L.filter((l) => l.axis === a);
  const tAct = sum(ax("T"), (l) => l.act), tTgt = sum(ax("T"), (l) => l.tgt);
  const mAct = sum(ax("M"), (l) => l.act), mTgt = sum(ax("M"), (l) => l.tgt);
  const travelMg = sum(ax("T"), (l) => l.mgGross), mobGross = sum(ax("M"), (l) => l.mgGross), disc = sum(ax("M"), (l) => l.disc), mobNet = mobGross - disc;
  const saasMg = sum(ax("S"), (l) => l.mgGross), fnbMg = sum(ax("F"), (l) => l.mgGross);
  const totAct = sum(L, (l) => l.act), totTgt = sum(L, (l) => l.tgt);
  const gp = sum(L, (l) => l.mgNet), mgTgtTot = sum(L, (l) => l.mgT);
  const x = totTgt > 0 ? totAct / totTgt : null;
  const H = x == null ? 0 : tier(x);

  // Peak theo trục, GMV thực tế, từ kỳ peak_tu_ky tới trước kỳ đang xét
  const start = kyIdx(D.params.peak_tu_ky || "") || -Infinity;
  const prior = C.periods.filter((p) => kyIdx(p) >= start && kyIdx(p) < kyIdx(ky) && hasActual(C, p));
  const peakT = prior.length ? Math.max(...prior.map((p) => axisGmv(C, p, "T"))) : null;
  const peakM = prior.length ? Math.max(...prior.map((p) => axisGmv(C, p, "M"))) : null;
  const pT = pool(tAct, travelMg / tAct, peakT, num(D, "quy_travel_nen"), num(D, "quy_travel_thang_du"));
  const pM = pool(mAct, mobNet / mAct, peakM, num(D, "quy_mobility_nen"), num(D, "quy_mobility_thang_du"));

  // ---- Team PM
  const rPmT = num(D, "pm_ty_le_travel"), rPmM = num(D, "pm_ty_le_mobility"), now = num(D, "pm_tra_ngay");
  const pmT = pT.v * rPmT * H, pmM = pM.v * rPmM * H, pm = pmT + pmM;
  const onTime = onTimeByGroup(C, ky);
  const groupPart: Record<string, number> = { N1: pmT };
  const mNetByG: Record<string, number> = {};
  MOBG.forEach((g) => { mNetByG[g] = sum(L.filter((l) => l.grp === g), (l) => l.mgNet); });
  const mNetSum = sum(MOBG, (g) => Math.max(0, mNetByG[g]));
  MOBG.forEach((g) => { groupPart[g] = mNetSum > 0 ? (pmM * Math.max(0, mNetByG[g])) / mNetSum : 0; });
  const people = new Map<string, PersonPay>();
  let pmUnassigned = 0;
  Object.entries(groupPart).forEach(([g, part]) => {
    const al = D.alloc.filter((a) => a.nhom === g && a.so_khach > 0);
    const tot = sum(al, (a) => a.so_khach);
    if (!tot) { pmUnassigned += part; return; }
    al.forEach((a) => {
      const v = (part * a.so_khach) / tot;
      const p = people.get(a.pm) || { name: a.pm, team: "PM", total: 0, now: 0, later: 0, laterMax: 0, travel: 0, mobility: 0, groups: [] };
      const ot = onTime[g]?.rate;
      p.total += v; p.now += v * now; p.laterMax += v * (1 - now); p.later += v * (1 - now) * (ok(ot) ? ot : 1);
      if (g === "N1") p.travel += v; else p.mobility += v;
      if (!p.groups.includes(g)) p.groups.push(g);
      people.set(a.pm, p);
    });
  });
  const pmPeople = Array.from(people.values()).sort((a, b) => b.total - a.total);

  // ---- Team Sales
  const salesPool = (pT.v * num(D, "sales_ty_le_travel") + pM.v * num(D, "sales_ty_le_mobility")) * H;
  const contracts = contractViews(C, ky);
  const contractPay = contracts.filter((c) => c.payKy === ky);
  const contractPool = sum(contractPay, (c) => c.payout);
  const contractByG: Record<string, { n: number; v: number }> = { N1: { n: 0, v: 0 }, N3: { n: 0, v: 0 }, N5: { n: 0, v: 0 } };
  contractPay.forEach((c) => { const o = contractByG[c.nhom]; if (o) { o.n++; o.v += c.payout; } });
  const saasComm = saasMg * num(D, "saas_hoa_hong");
  const hdPool = contractPool + saasComm;
  const sales = D.staff.filter((s) => s.team === "Sales").map((s) => {
    const g = salesPool * (s.tl_pool_gmv || 0), h = hdPool * (s.tl_pool_hd || 0);
    return { name: s.ho_ten, gmv: g, hdContract: contractPool * (s.tl_pool_hd || 0), hdSaas: saasComm * (s.tl_pool_hd || 0), total: g + h };
  });
  const salesPaid = sum(sales, (s) => s.total);

  // ---- Team Partnership
  const hotel = L.find((l) => l.k === "hotel"), flight = L.find((l) => l.k === "flight");
  const blendT = tAct > 0 ? ((hotel?.act || 0) * num(D, "target_margin_hotel") + (flight?.act || 0) * num(D, "target_margin_flight")) / tAct : null;
  const mgPctT = tAct > 0 ? travelMg / tAct : null, mgPctMg = mAct > 0 ? mobGross / mAct : null;
  const ptT = weightedTerm(C, ky, "T"), ptM = weightedTerm(C, ky, "M");
  const w = [num(D, "partnership_w_gmv"), num(D, "partnership_w_margin"), num(D, "partnership_w_pt")];
  const score = (parts: (number | null)[]) => {
    let s = 0, ws = 0;
    parts.forEach((p, i) => { if (ok(p)) { s += p * w[i]; ws += w[i]; } });
    return ws > 0 ? s / ws : null;
  };
  const partT = { g: tTgt > 0 ? tAct / tTgt : null, m: ok(mgPctT) && ok(blendT) && blendT > 0 ? mgPctT / blendT : null, pt: ok(ptT) ? ptT / num(D, "target_pt_travel") : null, term: ptT, target: num(D, "target_pt_travel") };
  const partM = { g: mTgt > 0 ? mAct / mTgt : null, m: ok(mgPctMg) ? mgPctMg / num(D, "target_margin_mobility") : null, pt: ok(ptM) ? ptM / num(D, "target_pt_mobility") : null, term: ptM, target: num(D, "target_pt_mobility") };
  const scoreT = score([partT.g, partT.m, partT.pt]), scoreM = score([partM.g, partM.m, partM.pt]);
  const payT = ok(scoreT) ? travelMg * num(D, "partnership_quy_travel") * scoreT : 0;
  const payM = ok(scoreM) ? mobNet * num(D, "partnership_quy_mobility") * scoreM : 0;
  const partners = D.staff.filter((s) => s.team === "Partnership").map((s) => {
    const r = s.tl_partnership || 0;
    const t = s.truc === "Mobility" ? 0 : payT * r, m = s.truc === "Travel" ? 0 : payM * r;
    return { name: s.ho_ten, truc: s.truc || "Tất cả", travel: t, mobility: m, total: t + m };
  });
  const partPaid = sum(partners, (p) => p.total);

  // ---- Công ty giữ lại
  const pmPaid = sum(pmPeople, (p) => p.total);
  const companyFromPools = pT.v + pM.v - pmPaid - sum(sales, (s) => s.gmv);
  const companyKeep = companyFromPools + (hdPool - sum(sales, (s) => s.hdContract + s.hdSaas)) + (payT + payM - partPaid);

  // ---- P&L
  const opexRows = D.opex.filter((o) => o.ky === ky);
  const below = ["Khấu hao", "Lãi vay", "Thuế TNDN"];
  const opexOp = opexRows.length ? sum(opexRows.filter((o) => !below.includes(o.khoan_muc)), (o) => o.so_tien) : null;
  const belowAmt = sum(opexRows.filter((o) => below.includes(o.khoan_muc)), (o) => o.so_tien);
  const comm = pmPaid + salesPaid + partPaid;
  const ebitda = ok(opexOp) ? gp - comm - opexOp : null;
  const netProfit = ok(ebitda) && opexRows.some((o) => below.includes(o.khoan_muc)) ? ebitda - belowAmt : null;
  const T = D.targets.find((t) => t.ky === ky);

  // ---- Khách hàng
  const cust = customerCounts(C, ky);

  return {
    ky, lines: L, tAct, tTgt, mAct, mTgt, travelMg, mobGross, disc, mobNet, saasMg, fnbMg, totAct, totTgt, gp, mgTgtTot, x, H,
    peakT, peakM, pT, pM, pmT, pmM, pm, pmPaid, pmPeople, pmUnassigned, onTime, groupPart,
    salesPool, contracts, contractPool, contractByG, saasComm, hdPool, sales, salesPaid,
    blendT, mgPctT, mgPctMg, partT, partM, scoreT, scoreM, payT, payM, partners, partPaid, companyKeep, companyFromPools,
    opexRows, opexOp, belowAmt, comm, ebitda, netProfit, opexBudget: T?.opex_budget ?? null, cust,
    hasActual: hasActual(C, ky), hasTarget: totTgt > 0,
  };
}
export type Period = ReturnType<typeof calcPeriod>;

/* ---------------- Payment term bình quân (theo giá vốn mua) ---------------- */
function weightedTerm(C: Ctx, ky: string, a: Axis): number | null {
  const rows = (C.gmvByKy.get(ky) || []).filter((r) => LINE_DEFS.some((l) => l.axis === a && l.match(r, grpOf(C, r.ma_kh))) && r.ma_ncc && C.supTerm.has(r.ma_ncc));
  const w = sum(rows, (r) => r.gia_von);
  return w > 0 ? sum(rows, (r) => (C.supTerm.get(r.ma_ncc as string) || 0) * r.gia_von) / w : null;
}

/* ---------------- Thu đúng hạn theo nhóm (kỳ nợ = ky) ---------------- */
export function onTimeByGroup(C: Ctx, ky: string) {
  const out: Record<string, { rate: number | null; billed: number; onTime: number; notDue: number; late: number }> = {};
  ["N1", "N2", "N3", "N4", "N5"].forEach((g) => {
    const rs = C.D.ar.filter((r) => r.ky === ky && grpOf(C, r.ma_kh) === g && r.so_tien > 0);
    const billed = sum(rs, (r) => r.so_tien);
    const full = (r: (typeof rs)[number]) => r.ngay_thu_du != null && (r.da_thu == null || r.da_thu >= r.so_tien);
    const onT = sum(rs.filter((r) => full(r) && (r.ngay_thu_du as string) <= r.ngay_den_han), (r) => r.so_tien);
    const notDue = sum(rs.filter((r) => !full(r) && r.ngay_den_han > C.asOf), (r) => r.so_tien);
    const judged = billed - notDue;
    out[g] = { rate: judged > 0 ? onT / judged : null, billed, onTime: onT, notDue, late: judged - onT };
  });
  return out;
}

/* ---------------- Hợp đồng mới ---------------- */
function contractViews(C: Ctx, ky: string): ContractView[] {
  const D = C.D, cur = kyIdx(ky), limit = Math.max(1, Math.round(num(D, "thoi_han_hd_thang"))), mult = num(D, "nguong_hd_boi_so");
  const gmvBy = new Map<string, number>();
  D.gmv.forEach((r) => gmvBy.set(r.ma_kh + "|" + r.ky, (gmvBy.get(r.ma_kh + "|" + r.ky) || 0) + r.gmv));
  const out: ContractView[] = [];
  D.contracts.forEach((c) => {
    const signKy = kyOfDate(c.ngay_ky), s = kyIdx(signKy);
    if (!ok(s) || s > cur) return;
    const bonus = num(D, "thuong_hd_" + c.nhom.toLowerCase()), threshold = bonus * mult;
    let cum = 0, payKy: string | null = null, payout = 0, reached = false;
    const lastIdx = Math.min(cur, s + limit - 1);
    for (let i = s; i <= lastIdx; i++) {
      cum += gmvBy.get(c.ma_kh + "|" + kyAdd(signKy, i - s)) || 0;
      if (!reached && threshold > 0 && cum >= threshold) { reached = true; payKy = kyAdd(signKy, i - s); payout = bonus; }
    }
    const monthNo = cur - s + 1;
    let status: ContractView["status"] = reached ? "dat" : "cho";
    if (!reached && monthNo >= limit) { status = "het_han"; payKy = kyAdd(signKy, limit - 1); payout = threshold > 0 ? bonus * Math.min(1, cum / threshold) : 0; }
    const cu = C.cust.get(c.ma_kh);
    out.push({ ma_kh: c.ma_kh, ten: cu?.ten_viet_tat || cu?.ten_kh || c.ma_kh, nhom: c.nhom, sales: c.sales, signKy, monthNo, bonus, threshold, cum, ratio: threshold > 0 ? cum / threshold : 0, status, payKy, payout });
  });
  return out;
}

/* ---------------- Khách hàng ---------------- */
function customerCounts(C: Ctx, ky: string) {
  const act = (k: string) => {
    const by = new Map<string, number>();
    (C.gmvByKy.get(k) || []).forEach((r) => by.set(r.ma_kh, (by.get(r.ma_kh) || 0) + r.gmv));
    return by;
  };
  const cur = act(ky), prev = act(kyAdd(ky, -1));
  const T = C.D.targets.find((t) => t.ky === ky);
  const groups = ["N1", "N2", "N3", "N4", "N5"].map((g) => {
    const c = Array.from(cur.entries()).filter(([k, v]) => v > 0 && grpOf(C, k) === g).length;
    const p = Array.from(prev.entries()).filter(([k, v]) => v > 0 && grpOf(C, k) === g).length;
    const tgtKey = ("kh_" + g.toLowerCase()) as "kh_n1";
    const gmv = sum(Array.from(cur.entries()).filter(([k]) => grpOf(C, k) === g), ([, v]) => v);
    return { g, act: c, prev: p, d: c - p, tgt: T?.[tgtKey] ?? null, gmv };
  });
  const movers = Array.from(new Set([...Array.from(cur.keys()), ...Array.from(prev.keys())]))
    .filter((k) => ["N2", "N4"].includes(grpOf(C, k)))
    .map((k) => ({ ma_kh: k, ten: C.cust.get(k)?.ten_viet_tat || C.cust.get(k)?.ten_kh || k, g: grpOf(C, k), pm: C.cust.get(k)?.pm || "—", a: prev.get(k) || 0, b: cur.get(k) || 0 }))
    .filter((m) => m.a >= 20_000_000)
    .map((m) => ({ ...m, d: (m.b - m.a) / m.a }));
  movers.sort((a, b) => a.d - b.d);
  const pick = [...movers.slice(0, 6), ...movers.slice(-4).filter((m) => m.d > 0)];
  return { groups, movers: Array.from(new Map(pick.map((m) => [m.ma_kh, m])).values()), hasPrev: prev.size > 0 };
}

/* ---------------- Công nợ phải thu ---------------- */
export const AR_BUCKETS = ["Chưa đến hạn", "1–30 ngày", "31–60 ngày", "61–90 ngày", ">90 ngày"];
export function calcAR(C: Ctx) {
  const asOf = C.asOf;
  const rows = C.D.ar.map((r) => {
    const open = r.so_tien - (r.da_thu || 0), late = days(asOf, r.ngay_den_han);
    const b = late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : late <= 90 ? 3 : 4;
    return { ...r, open, late, b };
  });
  const pos = rows.filter((r) => r.open > 0);
  const neg = sum(rows.filter((r) => r.open < 0), (r) => r.open);
  const bk = AR_BUCKETS.map((_, k) => sum(pos.filter((r) => r.b === k), (r) => r.open));
  const tot = sum(bk, (v) => v), od = tot - bk[0], o60 = bk[3] + bk[4];
  const from = addDays(asOf, -30);
  const billed30 = sum(C.D.ar.filter((r) => r.ngay_hd && r.ngay_hd > from && r.ngay_hd <= asOf), (r) => r.so_tien);
  const dso = billed30 > 0 ? (tot / billed30) * 30 : null;
  const dueRows = C.D.ar.filter((r) => r.ngay_den_han <= asOf && r.so_tien > 0);
  const collectRate = dueRows.length ? sum(dueRows, (r) => Math.min(r.da_thu || 0, r.so_tien)) / sum(dueRows, (r) => r.so_tien) : null;
  const byCust = new Map<string, { ma_kh: string; ten: string; g: string; pm: string; b: number[]; tot: number; od: number }>();
  pos.forEach((r) => {
    const c = C.cust.get(r.ma_kh);
    const o = byCust.get(r.ma_kh) || { ma_kh: r.ma_kh, ten: c?.ten_viet_tat || c?.ten_kh || r.ma_kh, g: c?.nhom || "?", pm: c?.pm || "—", b: [0, 0, 0, 0, 0], tot: 0, od: 0 };
    o.b[r.b] += r.open; o.tot += r.open; if (r.b > 0) o.od += r.open;
    byCust.set(r.ma_kh, o);
  });
  const customers = Array.from(byCust.values()).sort((a, b) => b.tot - a.tot);
  const byGroup: Record<string, { tot: number; od: number }> = {};
  customers.forEach((c) => { const o = byGroup[c.g] || { tot: 0, od: 0 }; o.tot += c.tot; o.od += c.od; byGroup[c.g] = o; });
  const top = customers[0] || null;
  // Đường cong thu tiền: % giá trị kỳ nợ đã thu đủ tới cuối tháng T, T+1…
  const kys = Array.from(new Set(C.D.ar.map((r) => r.ky))).filter((k) => ok(kyIdx(k))).sort((a, b) => kyIdx(a) - kyIdx(b)).slice(-5);
  const curve = kys.map((k) => {
    const rs = C.D.ar.filter((r) => r.ky === k && r.so_tien > 0), billed = sum(rs, (r) => r.so_tien);
    const v = [0, 1, 2, 3, 4].map((off) => {
      const end = kyEnd(kyAdd(k, off));
      if (end > asOf && kyEnd(kyAdd(k, off - 1)) >= asOf) return null;
      const cut = end > asOf ? asOf : end;
      return billed > 0 ? (100 * sum(rs.filter((r) => r.ngay_thu_du && r.ngay_thu_du <= cut), (r) => r.so_tien)) / billed : null;
    });
    return { k, v };
  });
  return { asOf, bk, tot, od, o60, neg, dso, collectRate, customers, byGroup, top, conc: top && tot > 0 ? top.tot / tot : 0, curve, count: pos.length };
}
export type AR = ReturnType<typeof calcAR>;

/* ---------------- Công nợ phải trả ---------------- */
export function calcAP(C: Ctx, dso: number | null) {
  const asOf = C.asOf;
  const sup = new Map(C.D.suppliers.map((s) => [s.ma_ncc, s]));
  const by = new Map<string, { ma_ncc: string; ten: string; nganh: string; term: number | null; od: number; d7: number; d15: number; d30: number; later: number; out: number; paidW: number; paidDays: number }>();
  C.D.ap.forEach((r) => {
    const s = sup.get(r.ma_ncc);
    const o = by.get(r.ma_ncc) || { ma_ncc: r.ma_ncc, ten: s?.ten_ncc || r.ma_ncc, nganh: s?.nganh || "Khác", term: s?.payment_term ?? null, od: 0, d7: 0, d15: 0, d30: 0, later: 0, out: 0, paidW: 0, paidDays: 0 };
    const open = r.so_tien - (r.da_tra || 0);
    if (open > 0) {
      const dd = days(r.ngay_den_han, asOf);
      if (dd < 0) o.od += open; else if (dd <= 7) o.d7 += open; else if (dd <= 15) o.d15 += open; else if (dd <= 30) o.d30 += open; else o.later += open;
      o.out += open;
    }
    if (r.ngay_tra && (r.da_tra || 0) >= r.so_tien) { o.paidW += r.so_tien; o.paidDays += days(r.ngay_tra, r.ngay_hd) * r.so_tien; }
    by.set(r.ma_ncc, o);
  });
  const rows = Array.from(by.values()).map((o) => ({ ...o, dpo: o.paidW > 0 ? o.paidDays / o.paidW : null })).sort((a, b) => b.out - a.out);
  const out = sum(rows, (r) => r.out);
  const wTermRows = rows.filter((r) => r.term != null && r.out > 0);
  const wTerm = sum(wTermRows, (r) => r.out) > 0 ? sum(wTermRows, (r) => (r.term as number) * r.out) / sum(wTermRows, (r) => r.out) : null;
  const paidW = sum(rows, (r) => r.paidW);
  const wDpo = paidW > 0 ? sum(rows, (r) => r.paidDays) / paidW : null;
  const byN: Record<string, number> = {};
  rows.forEach((r) => { byN[r.nganh] = (byN[r.nganh] || 0) + r.out; });
  return {
    rows, out, od: sum(rows, (r) => r.od), d7: sum(rows, (r) => r.d7), d15: sum(rows, (r) => r.d15), d30: sum(rows, (r) => r.d30), later: sum(rows, (r) => r.later),
    wTerm, wDpo, byN, float: ok(wDpo) && ok(dso) ? wDpo - dso : null,
  };
}
export type AP = ReturnType<typeof calcAP>;

/* ---------------- Dòng tiền ---------------- */
export const CASH_IN = ["Thu công nợ KH"];
export const CASH_OUT = ["Chi nhà cung cấp", "Chi lương & nhân sự", "Chi vận hành"];
export const CASH_SIGNED = ["Thu/chi tài chính", "Khác"];
export function calcCash(C: Ctx) {
  const D = C.D;
  const halves = Array.from(new Set(D.cash.map((r) => r.ky_nua_thang))).sort((a, b) => halfIdx(a) - halfIdx(b));
  const start = D.params.ky_so_du_dau || halves[0] || "";
  const open = Number(D.params.so_du_tien_dau_ky || 0) || 0;
  let bal = open;
  const out = halves.filter((h) => halfIdx(h) >= halfIdx(start)).map((h) => {
    const rs = D.cash.filter((r) => r.ky_nua_thang === h);
    const hasAct = rs.some((r) => r.thuc_hien != null);
    const val = (r: (typeof rs)[number]) => (hasAct ? r.thuc_hien ?? 0 : r.ke_hoach ?? 0);
    const flow = (cats: string[], f: (r: (typeof rs)[number]) => number) => sum(rs.filter((r) => cats.includes(r.khoan_muc)), f);
    const thu = flow(CASH_IN, val) + sum(rs.filter((r) => CASH_SIGNED.includes(r.khoan_muc) && val(r) > 0), val);
    const chi = flow(CASH_OUT, val) - sum(rs.filter((r) => CASH_SIGNED.includes(r.khoan_muc) && val(r) < 0), val);
    const pThu = flow(CASH_IN, (r) => r.ke_hoach ?? 0), pChi = flow(CASH_OUT, (r) => r.ke_hoach ?? 0);
    bal += thu - chi;
    return { h, thu, chi, net: thu - chi, bal, hasAct, pThu, pChi, rows: rs };
  });
  return { halves: out, open, start, hasOpen: !!D.params.so_du_tien_dau_ky };
}
export type Cash = ReturnType<typeof calcCash>;

/* ---------------- Cảnh báo ---------------- */
export interface Alert { sev: "critical" | "high" | "watch"; area: string; msg: string; act: string; own: string }
export function alerts(C: Ctx, P: Period, A: AR, B: AP, CS: Cash, fmt: { ty: (v: number) => string; pc: (v: number, d?: number) => string }): Alert[] {
  const L: Alert[] = [];
  const add = (sev: Alert["sev"], area: string, msg: string, act: string, own: string) => L.push({ sev, area, msg, act, own });
  if (P.hasActual) {
    P.lines.filter((l) => l.tgt > 0 && l.act / l.tgt < 0.85).sort((a, b) => a.act / a.tgt - b.act / b.tgt).forEach((l) => {
      const x = l.act / l.tgt;
      add(x < 0.7 ? "critical" : "high", "GMV", `${l.name} đạt ${fmt.pc(x)} kế hoạch (${fmt.ty(l.act)} / ${fmt.ty(l.tgt)})`,
        l.axis === "M" ? `Rà soát khách nhóm ${l.grp || ""} giảm chi tiêu; ${l.grp === "N3" || l.grp === "N5" ? "Sales tăng tốc win-back/kích hoạt." : "PM liên hệ trong tuần."}` : l.axis === "T" ? "Kiểm tra pipeline khách N1; đẩy GMV về NCC margin tốt." : "Rà soát tiến độ triển khai.",
        l.axis === "M" ? (l.grp === "N3" || l.grp === "N5" ? "Sales" : "PM") : l.axis === "T" ? "PM Travel" : "Sales");
    });
    if (ok(P.partT.m) && P.partT.m < 0.97) add("high", "Margin", `Margin Travel ${fmt.pc(P.mgPctT ?? 0, 2)} so với target blend ${fmt.pc(P.blendT ?? 0, 2)}`, "Rà soát NCC margin thấp, điều hướng GMV sang NCC margin cao.", "Partnership Travel");
    if (ok(P.partM.m) && P.partM.m < 0.97) add("high", "Margin", `Margin gross Mobility ${fmt.pc(P.mgPctMg ?? 0, 2)} so với target ${fmt.pc(num(C.D, "target_margin_mobility"), 0)}`, "Đàm phán lại chiết khấu với NCC tỷ trọng lớn.", "Partnership Mobility");
    if (ok(P.partT.pt) && P.partT.pt < 0.9) add("watch", "Payment term", `Payment term bình quân Travel ${Math.round(P.partT.term ?? 0)} ngày so với target ${P.partT.target} ngày`, "Ưu tiên đàm phán NCC đang trả ngay/ngắn hạn.", "Partnership Travel");
    if (!ok(P.partT.pt) && P.tAct > 0) add("watch", "Dữ liệu", "Chưa tính được payment term Travel — sheet GMV thiếu Mã NCC hoặc DM_NCC thiếu term", "Bổ sung Mã NCC cho dòng GMV Travel.", "Kế toán");
  }
  if (A.o60 > 0) add("critical", "Công nợ", `${fmt.ty(A.o60)} công nợ quá hạn trên 60 ngày (${fmt.pc(A.o60 / A.tot)} tổng phải thu)`, "Escalate cấp 2–3; cân nhắc tạm khóa hạn mức khách > 90 ngày.", "Kế toán · PM");
  if (A.top && A.conc > 0.3) add("high", "Công nợ", `${A.top.ten} chiếm ${fmt.pc(A.conc)} tổng phải thu — rủi ro tập trung`, "Theo dõi riêng tiến độ HSTT hằng tuần.", "Kế toán · " + A.top.pm);
  const th = num(C.D, "nguong_dung_han");
  Object.entries(P.onTime).forEach(([g, o]) => {
    if (ok(o.rate) && o.rate < th) add(o.rate < 0.7 ? "high" : "watch", "Thu đúng hạn", `Nhóm ${g} kỳ ${P.ky}: thu đúng hạn ${fmt.pc(o.rate, 0)} giá trị`, "Phần hoa hồng PM trả sau của nhóm này giảm tương ứng.", "PM nhóm " + g);
  });
  const cashNow = CS.halves.find((h) => h.hasAct)?.bal ?? CS.open;
  const arDue15 = sum(C.D.ar.filter((r) => r.ngay_den_han > A.asOf && r.ngay_den_han <= addDays(A.asOf, 15)), (r) => r.so_tien - (r.da_thu || 0));
  const apDue15 = B.od + B.d7 + B.d15;
  if (CS.hasOpen && apDue15 > cashNow + arDue15) add("critical", "Thanh khoản", `AP đến hạn 15 ngày tới ${fmt.ty(apDue15)} vượt tiền hiện có + AR đến hạn (${fmt.ty(cashNow + arDue15)})`, "Giãn lịch chi NCC chưa đến hạn; ưu tiên thu khách lớn.", "Kế toán trưởng");
  B.rows.filter((r) => r.term != null && ok(r.dpo) && r.dpo < (r.term as number) - 4).forEach((r) => add("watch", "Dòng tiền", `${r.ten}: trả thực tế sau ${Math.round(r.dpo as number)} ngày, HĐ cho ${r.term} ngày`, "Dời lịch chi về sát ngày đến hạn.", "Kế toán"));
  if (CS.hasOpen && CS.halves.length) {
    const min = Math.min(...CS.halves.map((h) => h.bal));
    if (min < 0) add("critical", "Thanh khoản", `Số dư tiền dự kiến âm (${fmt.ty(min)}) trong kỳ kế hoạch`, "Chuẩn bị hạn mức vốn lưu động.", "CFO");
  }
  P.cust.movers.filter((m) => m.d < -0.3).forEach((m) => add("high", "Khách hàng", `${m.ten} (${m.g}) giảm GMV ${fmt.pc(m.d, 0)} so với tháng trước`, "Liên hệ trong tuần; nguy cơ rời Top 200.", "PM · " + m.pm));
  const rank = { critical: 0, high: 1, watch: 2 };
  return L.sort((a, b) => rank[a.sev] - rank[b.sev]);
}
